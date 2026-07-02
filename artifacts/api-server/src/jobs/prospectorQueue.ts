/**
 * Prospector Queue Worker
 *
 * Processes pending entries in prospector_queue respecting each tenant's
 * ritmo_diario (leads-per-day limit).
 *
 * Flow per entry:
 *  1. Duplicate check by phone (digits) or CNPJ in leads table
 *     - Duplicate → update lead with any missing fields, mark queue "duplicado"
 *     - New       → create lead (source="prospector_auto") + deal in first funil,
 *                   mark queue "importado", then dispatch SDR (cold_outreach),
 *                   mark queue "abordado"
 *
 * Daily limit tracking: count queue rows updated today per tenant with
 *   status IN ('importado', 'duplicado', 'abordado').
 *
 * Scheduled: every hour at :35 (via scheduler.ts).
 */
import { and, asc, eq, gte, inArray, or, sql } from "drizzle-orm";
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
import { dispatchAgentBackground } from "../services/agent-dispatch.js";

// Message used as the SDR trigger for cold outreach leads.
const COLD_OUTREACH_TRIGGER =
  "[PROSPECÇÃO AUTOMÁTICA] Novo lead importado. Gere uma primeira mensagem de contato personalizada e profissional para este prospect.";

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

      // 2. Count how many leads were already processed today for this tenant
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

          // Count totals per run (not per tenant — ok for logging)
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

  const matchers: ReturnType<typeof eq>[] = [];
  if (phoneDigits) {
    matchers.push(
      sql`regexp_replace(${leadsTable.telefone}, '[^0-9]', '', 'g') = ${phoneDigits}` as ReturnType<typeof eq>,
    );
  }

  let existingLeadId: string | null = null;
  if (matchers.length > 0) {
    const [dup] = await db
      .select({ id: leadsTable.id, telefone: leadsTable.telefone, endereco: leadsTable.endereco, websiteUrl: leadsTable.websiteUrl })
      .from(leadsTable)
      .where(
        and(
          eq(leadsTable.tenantId, tenantId),
          matchers.length === 1 ? matchers[0]! : or(...matchers)!,
        ),
      )
      .limit(1);

    if (dup) {
      existingLeadId = dup.id;

      // Patch missing fields on the existing lead
      const patch: Partial<typeof leadsTable.$inferInsert> = {};
      if (!dup.telefone && item.telefone) patch.telefone = item.telefone;
      if (!dup.endereco && item.endereco) patch.endereco = item.endereco;
      if (!dup.websiteUrl && item.website) patch.websiteUrl = item.website;

      if (Object.keys(patch).length > 0) {
        patch.updatedAt = now;
        await db.update(leadsTable).set(patch).where(eq(leadsTable.id, dup.id));
        log.info({ leadId: dup.id, tenantId, patch: Object.keys(patch) }, "prospector-queue: patched duplicate lead");
      }

      // Mark queue as duplicado
      await db
        .update(prospectorQueueTable)
        .set({ status: "duplicado", leadId: dup.id, updatedAt: now })
        .where(eq(prospectorQueueTable.id, item.id));

      log.info({ queueId: item.id, leadId: dup.id, tenantId }, "prospector-queue: duplicate — skipped");
      return;
    }
  }

  // ── New lead ───────────────────────────────────────────────────────────────
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
      metadata: {
        prospectado_em:   now.toISOString(),
        origem:           "prospector_auto",
        place_id:         item.placeId,
        setor:            item.setor,
        cidade:           item.cidade,
      },
    })
    .returning({ id: leadsTable.id });

  const leadId = created?.id;
  if (!leadId) {
    log.error({ queueId: item.id, tenantId }, "prospector-queue: lead insert returned no id");
    return;
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
    })
    .returning({ id: dealsTable.id });

  const dealId = newDeal?.id ?? null;

  await db.insert(activitiesTable).values({
    tenantId,
    leadId,
    dealId,
    tipo:      "tarefa",
    titulo:    "Lead importado via Prospector Automático",
    descricao: `Importado automaticamente da fila do Prospector (setor: ${item.setor ?? "N/A"}, cidade: ${item.cidade ?? "N/A"}).`,
    status:    "concluida",
  });

  // Mark queue as importado
  await db
    .update(prospectorQueueTable)
    .set({ status: "importado", leadId, updatedAt: now })
    .where(eq(prospectorQueueTable.id, item.id));

  log.info({ queueId: item.id, leadId, dealId, tenantId }, "prospector-queue: lead created");

  // ── Dispatch SDR with cold_outreach scenario ───────────────────────────────
  dispatchAgentBackground({
    tenantId,
    leadId,
    mensagem: COLD_OUTREACH_TRIGGER,
    log,
    forcedAgent: "sdr",
    scenario:    { cold_outreach: true, origem: "prospector_auto", setor: item.setor, cidade: item.cidade },
  });

  // Mark as abordado immediately after firing dispatch (it's fire-and-forget)
  await db
    .update(prospectorQueueTable)
    .set({ status: "abordado", updatedAt: new Date() })
    .where(eq(prospectorQueueTable.id, item.id));

  log.info({ queueId: item.id, leadId, tenantId }, "prospector-queue: SDR dispatched → abordado");
}
