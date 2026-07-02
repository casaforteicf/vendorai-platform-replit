/**
 * Job 19 — SDR Follow-up
 * Runs hourly. For leads that received a first SDR approach 48h+ ago with no reply,
 * sends ONE follow-up message. After 72h more silence → moves to reactivation queue.
 */
import { and, eq, gte, lte, isNull, desc, sql, not, inArray } from "drizzle-orm";
import {
  db,
  leadsTable,
  activitiesTable,
  tenantsTable,
  agentConfigsTable,
  dealsTable,
} from "@workspace/db";
import type { Logger } from "pino";
import { sendSdrFollowup } from "../services/sdrService.js";

const FOLLOWUP_WINDOW_H   = 48;  // send follow-up after 48h no reply
const REACTIVATION_WINDOW_H = 120; // 48 + 72 = 120h → move to reactivation

export async function runSdrFollowup(log: Logger): Promise<void> {
  log.info("sdr-followup: starting");

  const now = new Date();
  const windowStart = new Date(now.getTime() - REACTIVATION_WINDOW_H * 3_600_000);
  const windowEnd   = new Date(now.getTime() - FOLLOWUP_WINDOW_H  * 3_600_000);

  // Find all "sdr_primeira_abordagem" activities created 48h–120h ago
  const approaches = await db
    .select({
      activityId: activitiesTable.id,
      leadId:     activitiesTable.leadId,
      dealId:     activitiesTable.dealId,
      tenantId:   activitiesTable.tenantId,
      sentAt:     activitiesTable.concluidaEm,
      resultado:  activitiesTable.resultadoExecucao,
    })
    .from(activitiesTable)
    .where(and(
      eq(activitiesTable.tipo, "whatsapp"),
      gte(activitiesTable.concluidaEm, windowStart),
      lte(activitiesTable.concluidaEm, windowEnd),
      sql`${activitiesTable.resultadoExecucao} LIKE 'cenario:%|template_ordem:1'`,
    ))
    .limit(200);

  if (approaches.length === 0) {
    log.info("sdr-followup: no qualifying approaches — done");
    return;
  }

  let sent = 0;
  let movedToReactivation = 0;

  for (const approach of approaches) {
    try {
      const { leadId, dealId, tenantId, sentAt } = approach;
      if (!leadId || !tenantId || !sentAt) continue;

      // Check if lead replied after approach (any incoming whatsapp message or entry)
      const [reply] = await db
        .select({ id: activitiesTable.id })
        .from(activitiesTable)
        .where(and(
          eq(activitiesTable.leadId, leadId),
          eq(activitiesTable.tenantId, tenantId),
          gte(activitiesTable.createdAt, sentAt),
          sql`${activitiesTable.titulo} NOT LIKE 'SDR — %'`,
        ))
        .limit(1);

      if (reply) continue; // lead is engaged

      // Check if follow-up already sent
      const [followupSent] = await db
        .select({ id: activitiesTable.id })
        .from(activitiesTable)
        .where(and(
          eq(activitiesTable.leadId, leadId),
          eq(activitiesTable.tenantId, tenantId),
          sql`${activitiesTable.resultadoExecucao} = 'cenario:followup_48h'`,
        ))
        .limit(1);

      if (followupSent) {
        // Follow-up already sent — check if 72h+ since follow-up → reactivation
        const hoursSinceFollowup = (now.getTime() - (sentAt?.getTime() ?? 0)) / 3_600_000;
        if (hoursSinceFollowup >= REACTIVATION_WINDOW_H) {
          // Move lead status to "reativacao" (nutrição)
          await db
            .update(leadsTable)
            .set({ status: "inativo" })
            .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));
          movedToReactivation++;
        }
        continue;
      }

      // Get lead phone + name
      const [lead] = await db
        .select({ nome: leadsTable.nome, telefone: leadsTable.telefone })
        .from(leadsTable)
        .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
        .limit(1);

      if (!lead?.telefone) continue;

      await sendSdrFollowup(leadId, dealId ?? null, tenantId, lead.nome, lead.telefone, log);
      sent++;

      // Anti-ban delay
      await new Promise((r) => setTimeout(r, 1_200));
    } catch (err) {
      log.warn({ err, leadId: approach.leadId }, "sdr-followup: error for lead (non-fatal)");
    }
  }

  log.info({ sent, movedToReactivation }, "sdr-followup: complete");
}
