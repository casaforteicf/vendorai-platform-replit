/**
 * Job 19 — SDR Follow-up
 * Runs hourly. For leads that received a first SDR approach 48h+ ago with no reply,
 * sends ONE follow-up message. After 72h more silence → moves to reactivation queue.
 */
import { and, eq, gte, lte, desc, sql, not, inArray } from "drizzle-orm";
import {
  db,
  leadsTable,
  activitiesTable,
  dealsTable,
} from "@workspace/db";
import type { Logger } from "pino";
import { sendSdrFollowup } from "../services/sdrService.js";
import { executarAcompanhamento } from "../services/orquestradorAcompanhamento.js";
import { tenantIsWithinBusinessHours } from "../lib/proactiveMessageGuard.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";

const FOLLOWUP_WINDOW_H = 48; // send follow-up after 48h no reply
const REACTIVATION_WINDOW_H = 120; // 48 + 72 = 120h → move to reactivation

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

export async function runSdrFollowup(log: Logger): Promise<void> {
  log.info("sdr-followup: starting");

  const now = new Date();
  const windowStart = new Date(now.getTime() - REACTIVATION_WINDOW_H * 3_600_000);
  const windowEnd = new Date(now.getTime() - FOLLOWUP_WINDOW_H * 3_600_000);

  // Find all "sdr_primeira_abordagem" activities created 48h–120h ago
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
      sql`${activitiesTable.resultadoExecucao} LIKE 'cenario:%|template_ordem:1'`,
    ))
    .limit(200);

  if (approaches.length === 0) {
    log.info("sdr-followup: no qualifying approaches — done");
    return;
  }

  let sent = 0;
  let recovered = 0;
  let movedToReactivation = 0;

  for (const approach of approaches) {
    try {
      const { leadId, dealId, tenantId, sentAt } = approach;
      if (!leadId || !tenantId || !sentAt) continue;

      // Follow-up é mensagem espontânea — só sai em horário comercial, fica
      // pra próxima rodada (a janela de 48h+ segue valendo, só adia o envio).
      if (!(await tenantIsWithinBusinessHours(tenantId))) continue;

      // Get lead once so lifecycle telemetry and the outbound message share the
      // same attribution source. No campaign = CRM still works, telemetry skips.
      const [lead] = await db
        .select({
          nome: leadsTable.nome,
          telefone: leadsTable.telefone,
          adCampaignId: leadsTable.adCampaignId,
        })
        .from(leadsTable)
        .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
        .limit(1);

      if (!lead) continue;

      // Check if follow-up already sent before checking the reply. This lets us
      // distinguish a normal reply to the first approach from a lead recovered
      // specifically after the automated 48h follow-up.
      const [followupSent] = await db
        .select({ id: activitiesTable.id, sentAt: activitiesTable.concluidaEm })
        .from(activitiesTable)
        .where(and(
          eq(activitiesTable.leadId, leadId),
          eq(activitiesTable.tenantId, tenantId),
          sql`${activitiesTable.resultadoExecucao} = 'cenario:followup_48h'`,
        ))
        .orderBy(desc(activitiesTable.createdAt))
        .limit(1);

      // Check if lead replied after approach (any incoming whatsapp message or entry)
      const [reply] = await db
        .select({ id: activitiesTable.id, createdAt: activitiesTable.createdAt })
        .from(activitiesTable)
        .where(and(
          eq(activitiesTable.leadId, leadId),
          eq(activitiesTable.tenantId, tenantId),
          gte(activitiesTable.createdAt, followupSent?.sentAt ?? sentAt),
          sql`${activitiesTable.titulo} NOT LIKE 'SDR — %'`,
        ))
        .orderBy(desc(activitiesTable.createdAt))
        .limit(1);

      if (reply) {
        if (followupSent) {
          await recordAttributedLifecycleEvent({
            tenantId,
            leadId,
            campaignId: lead.adCampaignId,
            eventType: "lead_recovered",
            message: "Lead voltou a responder depois do follow-up automático.",
            dedupeSuffix: "recovered:sdr48",
            metadata: { dealId: dealId ?? null, replyActivityId: reply.id },
          }).catch((err) => {
            log.warn({ err, tenantId, leadId }, "sdr-followup: failed to record lead_recovered");
          });
          recovered++;
        }
        continue; // lead is engaged
      }

      if (followupSent) {
        // Follow-up already sent — check if 72h+ since follow-up → aquecimento.
        // Use the real follow-up timestamp when available instead of the first
        // approach time so the 72h window is measured correctly.
        const followupAt = followupSent.sentAt ?? sentAt;
        const hoursSinceFollowup = (now.getTime() - followupAt.getTime()) / 3_600_000;
        if (hoursSinceFollowup >= 72) {
          // Move lead to aquecimento (long-term nurturing, not active outreach)
          await db
            .update(leadsTable)
            .set({ status: "aquecimento" })
            .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

          // Move deal to em_aquecimento stage
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
            // fallback: find the most-recent active deal for this lead
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
          movedToReactivation++;
        }
        continue;
      }

      if (!lead.telefone) continue;

      await recordAttributedLifecycleEvent({
        tenantId,
        leadId,
        campaignId: lead.adCampaignId,
        eventType: "lead_cooling",
        message: "Lead entrou em esfriamento após 48h sem resposta; follow-up automático iniciado.",
        dedupeSuffix: "cooling:sdr48",
        metadata: { dealId: dealId ?? null, inactivityHours: FOLLOWUP_WINDOW_H },
      }).catch((err) => {
        log.warn({ err, tenantId, leadId }, "sdr-followup: failed to record lead_cooling");
      });

      const acompanhamento = await executarAcompanhamento({
        tenantId,
        leadId,
        dealId: dealId ?? null,
        motivoDisparo: "verificação do gatilho legado de 48 horas",
        // O motor novo só deve executar por este job quando a etapa não
        // estiver governada pela jornada inteligente. Etapa ativa é tratada
        // pelo ciclo geral de acompanhamento, evitando duplicidade.
        modoPadrao: "somente_sugestao",
        log,
      }).catch((err) => {
        log.warn({ err, tenantId, leadId }, "sdr-followup: orquestrador indisponível; usando fallback legado");
        return null;
      });

      if (acompanhamento?.plano.ativo) {
        log.info(
          {
            tenantId,
            leadId,
            modo: acompanhamento.plano.modo,
            canal: acompanhamento.plano.canalPrincipal,
          },
          "sdr-followup: etapa governada pelo Acompanhamento Inteligente; gatilho legado ignorado",
        );
        continue;
      }

      // Compatibilidade integral para tenants/etapas que ainda não ativaram
      // o novo acompanhamento.
      await sendSdrFollowup(leadId, dealId ?? null, tenantId, lead.nome, lead.telefone, log);
      sent++;

      // Anti-ban delay
      await new Promise((r) => setTimeout(r, 1_200));
    } catch (err) {
      log.warn({ err, leadId: approach.leadId }, "sdr-followup: error for lead (non-fatal)");
    }
  }

  log.info({ sent, recovered, movedToReactivation }, "sdr-followup: complete");
}
