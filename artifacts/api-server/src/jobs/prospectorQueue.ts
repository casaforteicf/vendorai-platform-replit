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
  dealsTable,
  prospectsTable,
} from "@workspace/db";
import { pickNextVendedor } from "../lib/round-robin.js";
import { recordResponsavelChange } from "../lib/leadResponsavelHistorico.js";
import { enrichLead } from "./leadEnrichment.js";
import { leadRegistrationMetadata } from "../lib/lead-registration-standard.js";
import { decideProspectNextAction } from "../services/prospect-decision-engine.js";

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
  return ["google_places", "cnpj_new_companies", "business_directory"].includes(prefix)
    ? prefix
    : "prospector_auto";
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

      for (const item of pendingItems) {
        try {
          await processQueueItem({ item, tenantId, log });

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
  log:      Logger;
}): Promise<void> {
  const { item, tenantId, log } = params;
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
        proximaAcao: leadsTable.proximaAcao,
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
      if (!dup.proximaAcao) patch.proximaAcao = "Pesquisar o negócio, validar o decisor e preparar abordagem consultiva personalizada";
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

  // ── New cold Prospect (pre-Lead) ─────────────────────────────────────────
  // Cold discovery must NOT create Lead/Deal before qualification.
  const assignedTo = await pickNextVendedor(tenantId, {
    segmento: item.setor,
    city: item.cidade,
    location: item.endereco,
  });

  const sourceRef = item.placeId;
  const [existingProspect] = await db
    .select({ id: prospectsTable.id })
    .from(prospectsTable)
    .where(and(
      eq(prospectsTable.tenantId, tenantId),
      eq(prospectsTable.source, source),
      eq(prospectsTable.sourceRef, sourceRef),
    ))
    .limit(1);

  if (existingProspect) {
    await db.update(prospectorQueueTable)
      .set({ status: "duplicado", updatedAt: now })
      .where(eq(prospectorQueueTable.id, item.id));
    log.info({ queueId: item.id, prospectId: existingProspect.id, tenantId }, "prospector-queue: duplicate prospect — skipped");
    return;
  }

  const baseFit = item.telefone || item.website ? 55 : 35;
  const vendorFit = 60;
  const arqdorFit = /(constru|arquitet|engenhar|esquadr|piscin|revest|m[oó]ve|imobili|material|telhado)/i.test(item.setor ?? "")
    ? 70
    : 20;

  const decision = decideProspectNextAction({
    stage: "analisado",
    vendoraiFitScore: vendorFit,
    arqdorFitScore: arqdorFit,
    qualification: {
      commercial: {
        canaisAtendimento: item.telefone ? ["telefone/whatsapp"] : item.website ? ["website"] : [],
      },
      facts: [
        ...(item.setor ? [{
          key: "segment",
          value: item.setor,
          confidence: 100,
          source: source,
          confirmed: true,
          observedAt: now.toISOString(),
        }] : []),
        ...(item.cidade ? [{
          key: "city",
          value: item.cidade,
          confidence: 100,
          source: source,
          confirmed: true,
          observedAt: now.toISOString(),
        }] : []),
      ],
    },
    opportunitySummary: null,
  });

  const [prospect] = await db.insert(prospectsTable).values({
    tenantId,
    companyId: null,
    source,
    sourceRef,
    displayName: item.nome,
    phone: item.telefone,
    website: item.website,
    address: item.endereco,
    segment: item.setor,
    city: item.cidade,
    stage: decision.stage,
    fitScore: baseFit,
    vendoraiFitScore: vendorFit,
    arqdorFitScore: arqdorFit,
    recommendedSolution: decision.recommendedSolution,
    primaryHook: decision.primaryHook,
    currentState: decision.currentState,
    currentObjective: decision.currentObjective,
    nextBestAction: decision.nextBestAction,
    nextBestActionReason: decision.nextBestActionReason,
    qualificationScore: 0,
    qualification: {
      commercial: {
        canaisAtendimento: item.telefone ? ["telefone/whatsapp"] : item.website ? ["website"] : [],
      },
      facts: [
        ...(item.setor ? [{
          key: "segment",
          value: item.setor,
          confidence: 100,
          source,
          confirmed: true,
          observedAt: now.toISOString(),
        }] : []),
        ...(item.cidade ? [{
          key: "city",
          value: item.cidade,
          confidence: 100,
          source,
          confirmed: true,
          observedAt: now.toISOString(),
        }] : []),
      ],
    },
    assignedUserId: assignedTo,
    nextActionAt: new Date(now.getTime() + 2 * 60 * 60 * 1000),
  }).returning({ id: prospectsTable.id });

  if (!prospect?.id) {
    log.error({ queueId: item.id, tenantId }, "prospector-queue: prospect insert returned no id");
    return;
  }

  await db.update(prospectorQueueTable)
    .set({ status: "importado", leadId: null, updatedAt: now })
    .where(eq(prospectorQueueTable.id, item.id));

  log.info(
    { queueId: item.id, prospectId: prospect.id, tenantId, assignedTo },
    "prospector-queue: pre-lead prospect created without CRM Lead/Deal",
  );

}
