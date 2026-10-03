/**
 * Prospector Queue Worker
 *
 * Processes pending entries in prospector_queue respecting each tenant's
 * ritmo_diario (leads-per-day limit).
 *
 * Flow per entry:
 *  1. Duplicate check by phone (digits) or CNPJ in leads table
 *     - Duplicate → update lead with any missing fields + Prospector tags,
 *                   mark queue "duplicado"
 *     - New       → create lead (source="prospector_auto") + deal in first funil,
 *                   persist Prospector tags, mark queue "importado", then
 *                   run predictive enrichment
 *
 * Daily limit tracking: count queue rows updated today per tenant with
 *   status IN ('importado', 'duplicado', 'abordado').
 *
 * Multiple active config rows for the same tenant are intentional: each row
 * represents one niche × locality combination. The processed-today count is
 * tenant-wide, so ritmo_diario remains a TOTAL daily cap, not a cap per combo.
 *
 * Scheduled: every hour at :35 (via scheduler.ts).
 */
import { and, asc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  prospectorConfigTable,
  prospectorQueueTable,
  leadsTable,
  funisTable,
  dealsTable,
  activitiesTable,
} from "@workspace/db";
import { pickNextVendedor } from "../lib/round-robin.js";
import { recordResponsavelChange } from "../lib/leadResponsavelHistorico.js";
import { enrichLead } from "./leadEnrichment.js";

/** Returns the start-of-day in UTC for "now" (for counting daily processed leads). */
function todayStart(): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Normalise a phone string to digits only. */
function digitsOnly(s: string | null | undefined): string | null {
  if (!s) return null;
  const d = s.replace(/\D/g, "");
  return d.length > 0 ? d : null;
}

function normalizedDomain(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const raw = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    return new URL(raw).hostname.toLocaleLowerCase("pt-BR").replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

function normalizeIdentityText(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value
    .toLocaleLowerCase("pt-BR")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
  return normalized || null;
}

function queueSource(placeId: string | null | undefined): string {
  const prefix = String(placeId ?? "").split(":")[0]?.trim();
  return prefix || "prospector_auto";
}

function cleanUnique(values: string[]): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const raw of values) {
    const value = raw.trim().replace(/\s+/g, " ");
    if (!value) continue;
    const key = value.toLocaleLowerCase("pt-BR");
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(value);
  }
  return output;
}

function metadataStrings(metadata: Record<string, unknown>, key: string): string[] {
  const value = metadata[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function mergeProspectorMetadata(
  current: Record<string, unknown> | null | undefined,
  params: { setor?: string | null; cidade?: string | null; fonte: string; placeId?: string | null; prospectadoEm?: string },
): Record<string, unknown> {
  const metadata = { ...(current ?? {}) };
  const nichos = cleanUnique([
    ...metadataStrings(metadata, "prospector_nichos"),
    ...(params.setor ? [params.setor] : []),
  ]);
  const localidades = cleanUnique([
    ...metadataStrings(metadata, "prospector_localidades"),
    ...(params.cidade ? [params.cidade] : []),
  ]);
  const fontes = cleanUnique([
    ...metadataStrings(metadata, "prospector_fontes"),
    params.fonte,
  ]);
  const tags = cleanUnique([
    ...metadataStrings(metadata, "tags"),
    ...nichos,
    ...localidades,
    ...fontes,
  ]);

  return {
    ...metadata,
    ...(params.prospectadoEm ? { prospectado_em: params.prospectadoEm } : {}),
    origem: params.fonte,
    ...(params.placeId ? { place_id: params.placeId } : {}),
    setor: params.setor ?? metadata["setor"] ?? null,
    cidade: params.cidade ?? metadata["cidade"] ?? null,
    tags,
    prospector_nichos: nichos,
    prospector_localidades: localidades,
    prospector_fontes: fontes,
    prospector_tags: [
      ...nichos.map((valor) => ({ tipo: "atividade", valor })),
      ...localidades.map((valor) => ({ tipo: "localidade", valor })),
      ...fontes.map((valor) => ({ tipo: "fonte", valor })),
    ],
    prospector_tags_atualizadas_em: new Date().toISOString(),
  };
}

export async function runProspectorQueueWorker(log: Logger): Promise<void> {
  log.info("prospector-queue: starting");

  // 1. Load all active tenant configs (need ritmo_diario)
  const configs = await db
    .select()
    .from(prospectorConfigTable)
    .where(eq(prospectorConfigTable.ativo, true));

  if (configs.length === 0) {
    log.info("prospector-queue: no active configs — done");
    return;
  }

  let totalImported = 0;
  let totalDuplicated = 0;
  let totalAbordado = 0;

  for (const config of configs) {
    try {
      const { tenantId, ritmoDiario } = config;

      // 2. Count how many leads were already processed today for this tenant.
      // This is intentionally tenant-wide, so multiple niche/city config rows
      // still share one daily commercial cap.
      const today = todayStart();
      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(prospectorQueueTable)
        .where(
          and(
            eq(prospectorQueueTable.tenantId, tenantId),
            inArray(prospectorQueueTable.status, ["importado", "duplicado", "abordado"]),
            gte(prospectorQueueTable.updatedAt, today),
          ),
        );

      const processedToday = countRow?.count ?? 0;
      const remaining = ritmoDiario - processedToday;

      if (remaining <= 0) {
        log.info({ tenantId, ritmoDiario, processedToday }, "prospector-queue: daily limit reached — skipping tenant");
        continue;
      }

      log.info({ tenantId, remaining, ritmoDiario, processedToday }, "prospector-queue: processing tenant");

      // 3. Fetch pending items up to remaining limit
      const pendingItems = await db
        .select()
        .from(prospectorQueueTable)
        .where(
          and(
            eq(prospectorQueueTable.tenantId, tenantId),
            eq(prospectorQueueTable.status, "pendente"),
          ),
        )
        .orderBy(asc(prospectorQueueTable.createdAt))
        .limit(remaining);

      if (pendingItems.length === 0) {
        log.info({ tenantId }, "prospector-queue: no pending items");
        continue;
      }

      // 4. Resolve first funil once per tenant (used for deal creation)
      const [funil] = await db
        .select({ id: funisTable.id })
        .from(funisTable)
        .where(eq(funisTable.tenantId, tenantId))
        .orderBy(asc(funisTable.createdAt))
        .limit(1);

      for (const item of pendingItems) {
        try {
          await processQueueItem({ item, tenantId, funilId: funil?.id ?? null, log });

          // Anti-ban delay between imports (1.5 s)
          await new Promise<void>((r) => setTimeout(r, 1500));

          const finalItem = await db
            .select({ status: prospectorQueueTable.status })
            .from(prospectorQueueTable)
            .where(eq(prospectorQueueTable.id, item.id))
            .limit(1);
          const finalStatus = finalItem[0]?.status;
          if (finalStatus === "abordado") totalAbordado++;
          else if (finalStatus === "importado") totalImported++;
          else if (finalStatus === "duplicado") totalDuplicated++;
        } catch (err) {
          log.error({ err, queueId: item.id, tenantId }, "prospector-queue: item processing failed (non-fatal)");
        }
      }

      log.info({ tenantId, processed: pendingItems.length }, "prospector-queue: tenant done");
    } catch (err) {
      log.error({ err, tenantId: config.tenantId }, "prospector-queue: tenant loop failed (non-fatal)");
    }
  }

  log.info({ totalImported, totalDuplicated, totalAbordado }, "prospector-queue: complete");
}

// ── Per-item processing ───────────────────────────────────────────────────────

async function processQueueItem(params: {
  item:     typeof prospectorQueueTable.$inferSelect;
  tenantId: string;
  funilId:  string | null;
  log:      Logger;
}): Promise<void> {
  const { item, tenantId, funilId, log } = params;
  const now = new Date();

  // ── Duplicate detection ────────────────────────────────────────────────────
  const phoneDigits = digitsOnly(item.telefone);
  const websiteDomain = normalizedDomain(item.website);
  const normalizedName = normalizeIdentityText(item.nome);
  const normalizedAddress = normalizeIdentityText(item.endereco);
  const source = queueSource(item.placeId);

  const matchers: ReturnType<typeof eq>[] = [];
  if (phoneDigits) {
    matchers.push(
      sql`regexp_replace(${leadsTable.telefone}, '[^0-9]', '', 'g') = ${phoneDigits}` as ReturnType<typeof eq>,
    );
  }
  if (websiteDomain) {
    matchers.push(
      sql`lower(regexp_replace(regexp_replace(coalesce(${leadsTable.websiteUrl}, ''), '^https?://', ''), '^www\\.', '')) LIKE ${websiteDomain + '%'}` as ReturnType<typeof eq>,
    );
  }
  if (normalizedName && normalizedAddress) {
    matchers.push(
      sql`lower(regexp_replace(coalesce(${leadsTable.empresa}, ${leadsTable.nome}), '[^[:alnum:]]+', ' ', 'g')) = ${normalizedName}
        AND lower(regexp_replace(coalesce(${leadsTable.endereco}, ''), '[^[:alnum:]]+', ' ', 'g')) = ${normalizedAddress}` as ReturnType<typeof eq>,
    );
  }

  if (matchers.length > 0) {
    const [dup] = await db
      .select({
        id: leadsTable.id,
        telefone: leadsTable.telefone,
        endereco: leadsTable.endereco,
        websiteUrl: leadsTable.websiteUrl,
        metadata: leadsTable.metadata,
        mercadoSegmento: leadsTable.mercadoSegmento,
        assignedTo: leadsTable.assignedTo,
      })
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.tenantId, tenantId),
          matchers.length === 1 ? matchers[0]! : or(...matchers)!,
        ),
      )
      .limit(1);

    if (dup) {
      const autoAssignedTo = dup.assignedTo ?? await pickNextVendedor(tenantId, {
        segmento: item.setor,
        city: item.cidade,
        location: item.endereco,
      });
      const patch: Partial<typeof leadsTable.$inferInsert> = {
        metadata: mergeProspectorMetadata((dup.metadata ?? {}) as Record<string, unknown>, {
          setor: item.setor,
          cidade: item.cidade,
          fonte: source,
          placeId: item.placeId,
        }),
        updatedAt: now,
      };
      if (!dup.telefone && item.telefone) patch.telefone = item.telefone;
      if (!dup.endereco && item.endereco) patch.endereco = item.endereco;
      if (!dup.websiteUrl && item.website) patch.websiteUrl = item.website;
      if (!dup.mercadoSegmento && item.setor) patch.mercadoSegmento = item.setor;
      if (!dup.assignedTo && autoAssignedTo) patch.assignedTo = autoAssignedTo;

      await db.update(leadsTable).set(patch).where(eq(leadsTable.id, dup.id));

      if (!dup.assignedTo && autoAssignedTo) {
        await db
          .update(dealsTable)
          .set({ assignedTo: autoAssignedTo, updatedAt: now })
          .where(and(eq(dealsTable.leadId, dup.id), isNull(dealsTable.assignedTo)));
        recordResponsavelChange({
          leadId: dup.id,
          responsavelAnteriorId: null,
          responsavelNovoId: autoAssignedTo,
          alteradoPorId: null,
          motivo: "automatico",
        }).catch(() => {});
      }

      log.info({ leadId: dup.id, tenantId, setor: item.setor, cidade: item.cidade, assignedTo: autoAssignedTo }, "prospector-queue: duplicate lead tags merged");

      await db
        .update(prospectorQueueTable)
        .set({ status: "duplicado", leadId: dup.id, updatedAt: now })
        .where(eq(prospectorQueueTable.id, item.id));

      log.info({ queueId: item.id, leadId: dup.id, tenantId }, "prospector-queue: duplicate — skipped");
      return;
    }
  }

  // ── New lead ───────────────────────────────────────────────────────────────
  // Segmento + cidade/endereço alimentam o mesmo motor de distribuição usado
  // nos outros pontos do CRM, para o lead já entrar com a pessoa certa.
  const assignedTo = await pickNextVendedor(tenantId, {
    segmento: item.setor,
    city: item.cidade,
    location: item.endereco,
  });

  if (!assignedTo) {
    log.warn({ queueId: item.id, tenantId, setor: item.setor, cidade: item.cidade }, "prospector-queue: no eligible seller found — lead will remain unassigned");
  }

  const [created] = await db
    .insert(leadsTable)
    .values({
      tenantId,
      nome:       item.nome,
      telefone:   item.telefone,
      empresa:    item.nome,
      endereco:   item.endereco,
      websiteUrl: item.website,
      source:     "prospector_auto",
      tipoPessoa: "juridica",
      status:     "novo",
      mercadoSegmento: item.setor,
      assignedTo,
      metadata: mergeProspectorMetadata({}, {
        setor: item.setor,
        cidade: item.cidade,
        fonte: source,
        placeId: item.placeId,
        prospectadoEm: now.toISOString(),
      }),
    })
    .returning({ id: leadsTable.id });

  const leadId = created?.id;
  if (!leadId) {
    log.error({ queueId: item.id, tenantId }, "prospector-queue: lead insert returned no id");
    return;
  }

  if (assignedTo) {
    recordResponsavelChange({
      leadId,
      responsavelAnteriorId: null,
      responsavelNovoId: assignedTo,
      alteradoPorId: null,
      motivo: "automatico",
    }).catch(() => {});
  }

  // ── Deal in first funil, etapa "novo" ─────────────────────────────────────
  const [newDeal] = await db
    .insert(dealsTable)
    .values({
      tenantId,
      leadId,
      titulo:  `${item.nome} — Prospector Auto`,
      funilId: funilId,
      etapa:   "novo",
      assignedTo,
    })
    .returning({ id: dealsTable.id });

  const dealId = newDeal?.id ?? null;

  await db.insert(activitiesTable).values({
    tenantId,
    leadId,
    dealId,
    tipo:      "tarefa",
    titulo:    "Lead importado via Prospector Automático",
    descricao: `Importado automaticamente da fila do Prospector (atividade: ${item.setor ?? "N/A"}, localidade: ${item.cidade ?? "N/A"}).`,
    status:    "concluida",
    responsavelId: assignedTo,
  });

  // Every imported lead must already enter the work center with a concrete
  // next action and SLA. LeadWorkspace uses the earliest pending activity as
  // "Próxima atividade", so this removes the undefined state immediately.
  const firstContactDeadline = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  await db.insert(activitiesTable).values({
    tenantId,
    leadId,
    dealId,
    tipo: item.telefone ? "whatsapp" : "tarefa",
    titulo: item.telefone
      ? "Realizar primeiro contato com o lead"
      : "Localizar canal de contato e iniciar abordagem",
    descricao: item.telefone
      ? "Fazer a primeira abordagem, confirmar o decisor e a necessidade. Registrar o resultado e combinar o próximo passo."
      : "Identificar telefone, WhatsApp, e-mail ou outro canal válido. Iniciar a abordagem e registrar o próximo passo.",
    status: "pendente",
    dataVencimento: firstContactDeadline,
    responsavelId: assignedTo,
  });

  // ── Mark queue as importado ───────────────────────────────────────────────
  await db
    .update(prospectorQueueTable)
    .set({ status: "importado", leadId, updatedAt: now })
    .where(eq(prospectorQueueTable.id, item.id));

  log.info({ queueId: item.id, leadId, dealId, tenantId, assignedTo }, "prospector-queue: lead created — starting predictive enrichment");

  // ── Motor Preditivo (Cmd 22): enrich → score → auto-dispatch ─────────────
  await db
    .update(leadsTable)
    .set({ enrichmentStatus: "pending", updatedAt: new Date() })
    .where(eq(leadsTable.id, leadId));

  enrichLead(leadId, tenantId, log).catch((err) =>
    log.error({ err, leadId, tenantId }, "prospector-queue: enrichLead failed (non-fatal)"),
  );
}
