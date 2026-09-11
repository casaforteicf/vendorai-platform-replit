/**
 * Job 19 — SDR Follow-up adaptativo
 *
 * Regra base continua 48h sem resposta, mas sinais digitais podem antecipar o
 * contato quando o lead identificado volta ao site, visita preço/orçamento,
 * clica em CTA ou atinge Behavior Intent alto. Depois do follow-up, só move
 * para aquecimento se não houver resposta NEM novo sinal comercial forte.
 */
import { and, desc, eq, gte, inArray, lte, not, sql } from "drizzle-orm";
import {
  activitiesTable,
  db,
  dealsTable,
  leadsTable,
} from "@workspace/db";
import type { Logger } from "pino";
import { sendSdrFollowup } from "../services/sdrService.js";
import { tenantIsWithinBusinessHours } from "../lib/proactiveMessageGuard.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";
import { dispatchAgentBackground } from "../services/agent-dispatch.js";

const FOLLOWUP_WINDOW_H = 48;
const REACTIVATION_WINDOW_H = 120;
const MIN_APPROACH_AGE_H = 1;

type CommercialJourney = {
  score?: number;
  stage?: string;
  summary?: string;
  recommendedAction?: string;
  nextFollowUpAt?: string;
  computedAt?: string;
  recommendedMaterials?: Array<{ title?: string; category?: string }>;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function commercialJourney(discoveryData: unknown): CommercialJourney | null {
  const raw = record(record(discoveryData)["commercialJourney"]);
  return Object.keys(raw).length ? raw as CommercialJourney : null;
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string" || !value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function digitalFollowupDue(journey: CommercialJourney | null, sentAt: Date, now: Date) {
  if (!journey || Number(journey.score ?? 0) < 60) return false;
  const computedAt = parseDate(journey.computedAt);
  const nextFollowUpAt = parseDate(journey.nextFollowUpAt);
  if (!computedAt || computedAt <= sentAt) return false;
  return !nextFollowUpAt || nextFollowUpAt <= now;
}

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

async function sendDigitalFollowup(input: {
  tenantId: string;
  leadId: string;
  dealId: string | null;
  leadName: string;
  journey: CommercialJourney;
  log: Logger;
}) {
  const firstName = input.leadName.trim().split(/\s+/)[0] || "lead";
  const material = input.journey.recommendedMaterials?.[0];
  const materialInstruction = material?.title
    ? `Material de valor recomendado: "${material.title}"${material.category ? ` (${material.category})` : ""}. Use-o se fizer sentido e estiver disponível no contexto.`
    : "Se houver material de valor relevante no Knowledge Hub, priorize educação/prova em vez de mensagem genérica.";

  dispatchAgentBackground({
    tenantId: input.tenantId,
    leadId: input.leadId,
    mensagem:
      `[FOLLOW-UP ADAPTATIVO POR SINAL DIGITAL] ${firstName} voltou a demonstrar intenção depois da abordagem inicial. ` +
      `Leitura: ${input.journey.summary || `Behavior Intent ${input.journey.score ?? 0}/100`}. ` +
      `Próxima ação recomendada: ${input.journey.recommendedAction || "retomar a conversa de forma contextual"}. ` +
      `${materialInstruction} Não diga que rastreamos o usuário; use o interesse demonstrado apenas para tornar o atendimento relevante, curto e útil.`,
    log: input.log,
    forcedAgent: "sdr",
    scenario: {
      cold_outreach: false,
      origem: "sdr_followup_digital",
      template_ordem: 2,
    },
  });

  await db.insert(activitiesTable).values({
    tenantId: input.tenantId,
    leadId: input.leadId,
    dealId: input.dealId ?? undefined,
    tipo: "whatsapp",
    titulo: "SDR — follow-up por sinal digital",
    descricao: input.journey.summary || `Follow-up antecipado por Behavior Intent ${input.journey.score ?? 0}/100`,
    status: "concluida",
    concluidaEm: new Date(),
    resultadoExecucao: "cenario:followup_digital",
  });

  input.log.info({ leadId: input.leadId, tenantId: input.tenantId, score: input.journey.score }, "sdr-followup: digital follow-up dispatched");
}

export async function runSdrFollowup(log: Logger): Promise<void> {
  log.info("sdr-followup: starting adaptive cycle");

  const now = new Date();
  const windowStart = new Date(now.getTime() - REACTIVATION_WINDOW_H * 3_600_000);
  const newestAllowed = new Date(now.getTime() - MIN_APPROACH_AGE_H * 3_600_000);

  // Amplia a janela para permitir antecipação por sinais digitais. A regra de
  // 48h é aplicada por lead mais abaixo quando não houver sinal forte.
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
      lte(activitiesTable.concluidaEm, newestAllowed),
      sql`${activitiesTable.resultadoExecucao} LIKE 'cenario:%|template_ordem:1'`,
    ))
    .limit(250);

  if (!approaches.length) {
    log.info("sdr-followup: no qualifying approaches — done");
    return;
  }

  let sent = 0;
  let digitalSent = 0;
  let recovered = 0;
  let movedToReactivation = 0;

  for (const approach of approaches) {
    try {
      const { leadId, dealId, tenantId, sentAt } = approach;
      if (!leadId || !tenantId || !sentAt) continue;

      const [lead] = await db
        .select({
          nome: leadsTable.nome,
          telefone: leadsTable.telefone,
          adCampaignId: leadsTable.adCampaignId,
          discoveryData: leadsTable.discoveryData,
        })
        .from(leadsTable)
        .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
        .limit(1);
      if (!lead) continue;

      const journey = commercialJourney(lead.discoveryData);
      const hoursSinceApproach = (now.getTime() - sentAt.getTime()) / 3_600_000;
      const defaultDue = hoursSinceApproach >= FOLLOWUP_WINDOW_H;
      const digitalDue = digitalFollowupDue(journey, sentAt, now);

      // Se ainda não chegou em 48h e não há sinal digital forte, aguarda.
      if (!defaultDue && !digitalDue) continue;

      // Follow-up é mensagem espontânea — só sai em horário comercial.
      if (!(await tenantIsWithinBusinessHours(tenantId))) continue;

      const [followupSent] = await db
        .select({ id: activitiesTable.id, sentAt: activitiesTable.concluidaEm, resultado: activitiesTable.resultadoExecucao })
        .from(activitiesTable)
        .where(and(
          eq(activitiesTable.leadId, leadId),
          eq(activitiesTable.tenantId, tenantId),
          sql`${activitiesTable.resultadoExecucao} IN ('cenario:followup_48h','cenario:followup_digital')`,
        ))
        .orderBy(desc(activitiesTable.createdAt))
        .limit(1);

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
            message: "Lead voltou a responder após follow-up do SDR.",
            dedupeSuffix: "recovered:sdr",
            metadata: { dealId: dealId ?? null, replyActivityId: reply.id },
          }).catch((err) => log.warn({ err, tenantId, leadId }, "sdr-followup: failed to record recovery"));
          recovered++;
        }
        continue;
      }

      if (followupSent) {
        const followupAt = followupSent.sentAt ?? sentAt;
        const hoursSinceFollowup = (now.getTime() - followupAt.getTime()) / 3_600_000;
        const strongSignalAfterFollowup = Boolean(
          journey &&
          Number(journey.score ?? 0) >= 60 &&
          parseDate(journey.computedAt) &&
          parseDate(journey.computedAt)! > followupAt
        );

        // Novo sinal forte reabre prioridade: não empurra para aquecimento enquanto
        // o lead está ativo digitalmente; Behavior Intent já cria tarefa comercial.
        if (strongSignalAfterFollowup) continue;

        if (hoursSinceFollowup >= 72) {
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
          movedToReactivation++;
        }
        continue;
      }

      if (!lead.telefone) continue;

      if (digitalDue && journey) {
        await sendDigitalFollowup({
          tenantId,
          leadId,
          dealId: dealId ?? null,
          leadName: lead.nome,
          journey,
          log,
        });
        digitalSent++;
        sent++;
      } else {
        await recordAttributedLifecycleEvent({
          tenantId,
          leadId,
          campaignId: lead.adCampaignId,
          eventType: "lead_cooling",
          message: "Lead entrou em esfriamento após 48h sem resposta; follow-up automático iniciado.",
          dedupeSuffix: "cooling:sdr48",
          metadata: { dealId: dealId ?? null, inactivityHours: FOLLOWUP_WINDOW_H },
        }).catch((err) => log.warn({ err, tenantId, leadId }, "sdr-followup: failed to record lead_cooling"));

        await sendSdrFollowup(leadId, dealId ?? null, tenantId, lead.nome, lead.telefone, log);
        sent++;
      }

      await new Promise((resolve) => setTimeout(resolve, 1_200));
    } catch (err) {
      log.warn({ err, leadId: approach.leadId }, "sdr-followup: error for lead (non-fatal)");
    }
  }

  log.info({ sent, digitalSent, recovered, movedToReactivation }, "sdr-followup: adaptive cycle complete");
}
