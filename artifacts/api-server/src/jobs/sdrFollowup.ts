/**
 * Job 19 — SDR Follow-up
 * Runs hourly. For leads that received a first SDR approach 48h+ ago with no reply,
 * sends ONE follow-up message. After 72h more silence → moves to reactivation queue.
 */
import { and, eq, gte, lte, desc, sql, not, inArray, or } from "drizzle-orm";
import {
  db,
  leadsTable,
  activitiesTable,
  dealsTable,
  messagesTable,
} from "@workspace/db";
import type { Logger } from "pino";
import { sendSdrFirstApproach, sendSdrFollowup } from "../services/sdrService.js";
import { isColdProspectSource } from "../lib/prospector-consultive.js";
import {
  PROSPECTOR_COLD_CADENCE,
  nextProspectorCadenceStep,
  type ProspectorCadenceStepKey,
} from "../lib/prospector-cold-cadence.js";
import { tenantIsWithinBusinessHours } from "../lib/proactiveMessageGuard.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";

const FIRST_FOLLOWUP_H = PROSPECTOR_COLD_CADENCE[0]!.dueHours;
const NURTURE_AFTER_FINAL_H = 72;
const LOOKBACK_H = 24 * 30;

async function recordAttributedLifecycleEvent(params: {
  tenantId: string;
  leadId: string;
  campaignId: string | null;
  eventType: "lead_cooling" | "lead_recovered";
  message: string;
  dedupeSuffix: string;
  metadata?: Record<string, unknown>;
}) {
  if (!params.campaignId) return;
  await recordAdCampaignEvent({
    tenantId: params.tenantId,
    campaignId: params.campaignId,
    eventType: params.eventType,
    severity: params.eventType === "lead_recovered" ? "success" : "info",
    message: params.message,
    dedupeKey: `lead:${params.leadId}:${params.dedupeSuffix}`,
    metadata: {
      leadId: params.leadId,
      lifecycle: params.eventType,
      ...params.metadata,
    },
  });
}

async function retryPendingInitialColdOutreach(log: Logger): Promise<number> {
  const candidates = await db
    .select({
      id: leadsTable.id,
      tenantId: leadsTable.tenantId,
      source: leadsTable.source,
      telefone: leadsTable.telefone,
    })
    .from(leadsTable)
    .where(and(
      eq(leadsTable.enrichmentStatus, "scored"),
      sql`${leadsTable.metadata}->'coldProspectDossier'->>'status' = 'ready_for_outreach'`,
    ))
    .limit(100);

  let retried = 0;
  for (const lead of candidates) {
    if (!lead.tenantId || !lead.telefone || !isColdProspectSource(lead.source)) continue;
    if (!(await tenantIsWithinBusinessHours(lead.tenantId))) continue;

    const [alreadyApproached] = await db
      .select({ id: activitiesTable.id })
      .from(activitiesTable)
      .where(and(
        eq(activitiesTable.leadId, lead.id),
        eq(activitiesTable.tenantId, lead.tenantId),
        eq(activitiesTable.tipo, "whatsapp"),
        or(
          sql`${activitiesTable.resultadoExecucao} LIKE '%prospector_consultivo:%'`,
          sql`${activitiesTable.resultadoExecucao} LIKE 'cenario:%|template_ordem:1%'`,
        ),
      ))
      .limit(1);

    if (alreadyApproached) {
      await db.update(leadsTable)
        .set({ enrichmentStatus: "dispatched", updatedAt: new Date() })
        .where(and(eq(leadsTable.id, lead.id), eq(leadsTable.tenantId, lead.tenantId)));
      continue;
    }

    try {
      const result = await sendSdrFirstApproach(lead.id, null, lead.tenantId, log);
      if (result.sent) {
        await db.update(leadsTable)
          .set({ enrichmentStatus: "dispatched", updatedAt: new Date() })
          .where(and(eq(leadsTable.id, lead.id), eq(leadsTable.tenantId, lead.tenantId)));
        retried++;
      }
    } catch (err) {
      // Integração indisponível/opt-out/horário mudando entre as duas checagens:
      // mantém "scored" para uma próxima rodada, sem fallback comercial genérico.
      log.warn({ err, leadId: lead.id, tenantId: lead.tenantId }, "sdr-followup: initial cold outreach retry deferred");
    }
  }

  return retried;
}

export async function runSdrFollowup(log: Logger): Promise<void> {
  log.info("sdr-followup: starting");

  const initialRetried = await retryPendingInitialColdOutreach(log);
  const now = new Date();
  const windowStart = new Date(now.getTime() - LOOKBACK_H * 3_600_000);
  const windowEnd = new Date(now.getTime() - FIRST_FOLLOWUP_H * 3_600_000);

  // Compatibilidade: aceita tanto o marcador legado template_ordem:1 quanto
  // as abordagens consultivas v1/v2 do Prospecctor.
  const approaches = await db
    .select({
      activityId: activitiesTable.id,
      leadId: activitiesTable.leadId,
      dealId: activitiesTable.dealId,
      tenantId: activitiesTable.tenantId,
      sentAt: activitiesTable.concluidaEm,
      resultado: activitiesTable.resultadoExecucao,
    })
    .from(activitiesTable)
    .where(and(
      eq(activitiesTable.tipo, "whatsapp"),
      gte(activitiesTable.concluidaEm, windowStart),
      lte(activitiesTable.concluidaEm, windowEnd),
      or(
        sql`${activitiesTable.resultadoExecucao} LIKE 'cenario:%|template_ordem:1%'`,
        sql`${activitiesTable.resultadoExecucao} LIKE '%prospector_consultivo:v1%'`,
        sql`${activitiesTable.resultadoExecucao} LIKE '%prospector_consultivo:v2%'`,
      ),
    ))
    .limit(300);

  if (approaches.length === 0) {
    log.info("sdr-followup: no qualifying approaches — done");
    return;
  }

  let sent = 0;
  let recovered = 0;
  let movedToNurture = 0;

  for (const approach of approaches) {
    try {
      const { leadId, dealId, tenantId, sentAt } = approach;
      if (!leadId || !tenantId || !sentAt) continue;

      if (!(await tenantIsWithinBusinessHours(tenantId))) continue;

      const [lead] = await db
        .select({
          nome: leadsTable.nome,
          telefone: leadsTable.telefone,
          status: leadsTable.status,
          adCampaignId: leadsTable.adCampaignId,
        })
        .from(leadsTable)
        .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
        .limit(1);

      if (!lead) continue;

      // Se o lead já avançou por outro caminho, não insistimos na cadência fria.
      if (lead.status === "qualificado" || lead.status === "cliente" || lead.status === "aquecimento") {
        continue;
      }

      const cadenceActivities = await db
        .select({
          resultado: activitiesTable.resultadoExecucao,
          sentAt: activitiesTable.concluidaEm,
        })
        .from(activitiesTable)
        .where(and(
          eq(activitiesTable.leadId, leadId),
          eq(activitiesTable.tenantId, tenantId),
          sql`${activitiesTable.resultadoExecucao} LIKE 'cenario:followup_%|prospector_cadence:v2'`,
        ))
        .orderBy(desc(activitiesTable.createdAt));

      const sentKeys = new Set<ProspectorCadenceStepKey>();
      let finalSentAt: Date | null = null;
      for (const item of cadenceActivities) {
        const result = item.resultado ?? "";
        for (const step of PROSPECTOR_COLD_CADENCE) {
          if (result.includes(`cenario:${step.key}|`)) {
            sentKeys.add(step.key);
            if (step.key === "followup_216h" && item.sentAt && !finalSentAt) finalSentAt = item.sentAt;
          }
        }
      }

      // Mensagem recebida é a fonte de verdade para "respondeu"; não usamos
      // qualquer atividade interna do CRM como falso sinal de resposta.
      const [reply] = await db
        .select({ id: messagesTable.id, createdAt: messagesTable.createdAt })
        .from(messagesTable)
        .where(and(
          eq(messagesTable.leadId, leadId),
          eq(messagesTable.tenantId, tenantId),
          eq(messagesTable.direcao, "entrada"),
          gte(messagesTable.createdAt, sentAt),
        ))
        .orderBy(desc(messagesTable.createdAt))
        .limit(1);

      if (reply) {
        if (sentKeys.size > 0) {
          await recordAttributedLifecycleEvent({
            tenantId,
            leadId,
            campaignId: lead.adCampaignId,
            eventType: "lead_recovered",
            message: "Lead voltou a responder durante a cadência fria do Prospecctor.",
            dedupeSuffix: "recovered:prospector-cadence-v2",
            metadata: { dealId: dealId ?? null, replyMessageId: reply.id },
          }).catch((err) => {
            log.warn({ err, tenantId, leadId }, "sdr-followup: failed to record lead_recovered");
          });
          recovered++;
        }
        continue;
      }

      if (finalSentAt) {
        const hoursSinceFinal = (now.getTime() - finalSentAt.getTime()) / 3_600_000;
        if (hoursSinceFinal >= NURTURE_AFTER_FINAL_H) {
          await db
            .update(leadsTable)
            .set({ status: "aquecimento" })
            .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

          if (dealId) {
            await db
              .update(dealsTable)
              .set({ etapa: "em_aquecimento", updatedAt: new Date() })
              .where(and(
                eq(dealsTable.id, dealId),
                eq(dealsTable.tenantId, tenantId),
                not(inArray(dealsTable.etapa, ["ganho", "perdido", "em_aquecimento"])),
              ));
          } else {
            const [activeDeal] = await db
              .select({ id: dealsTable.id })
              .from(dealsTable)
              .where(and(
                eq(dealsTable.leadId, leadId),
                eq(dealsTable.tenantId, tenantId),
                not(inArray(dealsTable.etapa, ["ganho", "perdido", "em_aquecimento"])),
              ))
              .orderBy(desc(dealsTable.createdAt))
              .limit(1);
            if (activeDeal) {
              await db
                .update(dealsTable)
                .set({ etapa: "em_aquecimento", updatedAt: new Date() })
                .where(eq(dealsTable.id, activeDeal.id));
            }
          }
          movedToNurture++;
        }
        continue;
      }

      if (!lead.telefone) continue;

      const hoursSinceFirst = (now.getTime() - sentAt.getTime()) / 3_600_000;
      const nextStep = nextProspectorCadenceStep(hoursSinceFirst, sentKeys);
      if (!nextStep) continue;

      if (sentKeys.size === 0) {
        await recordAttributedLifecycleEvent({
          tenantId,
          leadId,
          campaignId: lead.adCampaignId,
          eventType: "lead_cooling",
          message: "Lead entrou na cadência fria do Prospecctor após não responder à primeira abordagem.",
          dedupeSuffix: "cooling:prospector-cadence-v2",
          metadata: { dealId: dealId ?? null, inactivityHours: hoursSinceFirst },
        }).catch((err) => {
          log.warn({ err, tenantId, leadId }, "sdr-followup: failed to record lead_cooling");
        });
      }

      await sendSdrFollowup(
        leadId,
        dealId ?? null,
        tenantId,
        lead.nome,
        lead.telefone,
        log,
        nextStep,
      );
      sent++;

      // Pequeno espaçamento entre leads; a cadência por lead é controlada em dias.
      await new Promise((r) => setTimeout(r, 1_200));
    } catch (err) {
      log.warn({ err, leadId: approach.leadId }, "sdr-followup: error for lead (non-fatal)");
    }
  }

  log.info({ initialRetried, sent, recovered, movedToNurture }, "sdr-followup: complete");
}
