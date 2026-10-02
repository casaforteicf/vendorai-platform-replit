/**
 * Background scheduler — node-cron jobs running inside the API server process.
 *
 * Jobs:
 *   1. Churn check (every hour at :05)
 *      → For every active tenant, evaluate the rules engine for leads with
 *        churnRisk > 70. Fires "churn_risk_alto" rules engine trigger.
 *
 *   2. Campaign dispatch (every hour at :15)
 *      → Find campaigns with status="agendada" and agendadaPara <= now.
 *        For each, query leads matching segmentoFiltro, create agent_tasks
 *        (enviar_whatsapp with the campaign message), and advance status.
 */
import cron from "node-cron";
import { and, desc, eq, gt, isNotNull, isNull, lte, gte, lt, inArray, not, sql } from "drizzle-orm";
import { runMonthlyBilling } from "../lib/billing.js";
import { isBirthdayOn, parseBirthdayParts } from "../lib/birthday-date.js";
import { professionMatches } from "../lib/professional-date.js";
import { mergeCommercialDates } from "../lib/commercial-calendar.js";
import { tenantIsWithinBusinessHours } from "../lib/proactiveMessageGuard.js";
import { runPartnerCommissions } from "./partnerCommission.js";
import { runPartnerProspectorJob } from "./partnerProspector.js";
import { processFlowExecutions } from "./contentFlow.js";
import { runRevenueScoutJob } from "../services/revenueScout.js";
import { runContentAutopilotJob } from "../services/contentAutopilotJob.js";
import { runAppointmentReminders } from "./appointmentReminders.js";
import { runReviewRequests } from "./reviewRequests.js";
import { runAdsReviewSync } from "./adsReviewSync.js";
import { runAdsWasteGuard } from "./adsWasteGuard.js";
import { pollPendingRenders } from "../services/blenderService.js";
import { sendOutgoingMessage } from "../services/omnichannel.js";
import { buildSmartDeliveryUrl } from "../services/smart-delivery.js";
import type { Logger } from "pino";
import {
  db,
  tenantsTable,
  campaignsTable,
  leadsTable,
  dealsTable,
  funisTable,
  customerIntelligenceTable,
  agentConfigsTable,
  agentTasksTable,
  messagesTable,
  conversationsTable,
  propostasTable,
  activitiesTable,
  inventoryItemsTable,
  produtosCatalogoTable,
  categoriasProdutoTable,
  agendasTable,
  agentActionsLogTable,
  intelligenceAnalysisLogTable,
  planAssignmentLogTable,
  businessProfilesTable,
  tenantCalendarSettingsTable,
  leadSpouseConsentTable,
  leadCampaignLogTable,
  prospectCampaignsTable,
  prospectApprovalsTable,
  reactivationQueueTable,
  tenantDomainsTable,
  campaignSentLogsTable,
  churnActionsTable,
} from "@workspace/db";
import { callOpenAI } from "../lib/ai-gateway.js";
import {
  createOrGetCustomHostname,
  getCloudflareCustomDomainConfig,
  getCustomHostname,
  getDnsInstructions,
} from "../lib/cloudflare.js";
import type { SegmentoFiltro } from "@workspace/db";
import { evaluateForLead } from "../routes/rules.js";
import { dispatchAgentBackground, processAgentInternal, type DispatchResult } from "../services/agent-dispatch.js";
import { searchAllPlaces } from "../routes/prospector.js";
import { runProspectorQueueWorker } from "./prospectorQueue.js";
import { runDailyAgendaSummary } from "./dailyAgendaSummary.js";
import { runSdrFollowup } from "./sdrFollowup.js";
import { runCustomerIntelligenceFollowup } from "./customerIntelligenceFollowup.js";
import { runObjectionsExtraction } from "./objectionsExtraction.js";
import { runRecemAbertas } from "./recemAbertasJob.js";
import { runMicroEventsRescan } from "./microEventsRescan.js";
import { runWeeklyFeedbackLoop } from "./feedbackLoop.js";
import { runSupportLifecycle } from "./supportLifecycle.js";
import { runPipelineActivityLifecycle } from "./pipelineActivityLifecycle.js";
import { runPipelineStageLifecycle } from "./pipelineStageLifecycle.js";
import { runAcompanhamentoJornada } from "./acompanhamentoJornada.js";
import { processDuePickupWaves } from "../services/pracaRoutePlanner.js";
import { processDeliveryNotificationOutbox } from "../services/pracaDeliveryNotifications.js";
import { runPracaExceptionScan } from "../services/pracaExceptionDetector.js";
import { markOverdueVehicleReservations } from "../services/vehicle-reservation.js";
import { markOverdueItemReservations } from "../services/item-reservation.js";
import {
  prospectorConfigTable,
  prospectorQueueTable,
} from "@workspace/db";

// ── Job 1: Churn check ────────────────────────────────────────────────────────

async function runChurnCheckAll(log: Logger): Promise<void> {
  log.info("scheduler/churn-check: starting");

  // Get all active tenants with their agent configs (for autonomy + telefone check)
  const tenants = await db
    .select({ id: tenantsTable.id, slug: tenantsTable.slug })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  log.info({ count: tenants.length }, "scheduler/churn-check: tenants found");

  let totalLeads      = 0;
  let totalTriggered  = 0;
  let totalAutoWpp    = 0;

  for (const tenant of tenants) {
    try {
      // Mensagem espontânea de retenção só sai em horário comercial — fica
      // pra próxima rodada, nada se perde, só adia.
      if (!(await tenantIsWithinBusinessHours(tenant.id))) {
        continue;
      }

      // Load agent config once per tenant (needed for autonomy check)
      const [agentConfig] = await db
        .select({ churnAutoWhatsapp: agentConfigsTable.churnAutoWhatsapp })
        .from(agentConfigsTable)
        .where(eq(agentConfigsTable.tenantId, tenant.id))
        .limit(1);

      const isAutonomous = !!agentConfig?.churnAutoWhatsapp;

      // Find leads with churnRisk > 70 (limit 200 per tenant for safety)
      // Skip leads with status "novo" — they are in the active SDR cycle and must not be
      // interrupted by reactivation. Also skip prospector_auto source leads still fresh.
      // Also skip leads already confirmed churned.
      const highRiskRows = await db
        .select({
          leadId:    customerIntelligenceTable.leadId,
          churnRisk: customerIntelligenceTable.churnRisk,
          churnRiskExplicacao: customerIntelligenceTable.churnRiskExplicacao,
          telefone:  leadsTable.telefone,
          nome:      leadsTable.nome,
          status:    leadsTable.status,
          source:    leadsTable.source,
          isChurned: leadsTable.isChurned,
        })
        .from(customerIntelligenceTable)
        .innerJoin(leadsTable, eq(leadsTable.id, customerIntelligenceTable.leadId))
        .where(
          and(
            eq(customerIntelligenceTable.tenantId, tenant.id),
            gt(customerIntelligenceTable.churnRisk, 70),
            not(inArray(leadsTable.status, ["novo", "aquecimento"])),
            eq(leadsTable.isChurned, false),
            isNull(leadsTable.naoLeadTipo),
          )
        )
        .limit(200);

      if (highRiskRows.length === 0) continue;

      totalLeads += highRiskRows.length;

      for (const row of highRiskRows) {
        // ── 1. Evaluate rules (creates tasks/activities — deduped) ──────────
        try {
          const result = await evaluateForLead({
            tenantId: tenant.id,
            trigger:  "churn_risk_alto",
            leadId:   row.leadId,
            log,
          });
          totalTriggered += result.triggered;
        } catch (err) {
          log.error({ err, tenantId: tenant.id, leadId: row.leadId }, "scheduler/churn-check: rule evaluation failed (non-fatal)");
        }

        // ── 2. Tiered preventive action (only when autonomous + has telefone) ──
        if (!isAutonomous || !row.telefone) continue;

        try {
          // Dedup: skip if a churn action was already logged for this lead in the last 7 days.
          const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          const [recentAction] = await db
            .select({ id: churnActionsTable.id })
            .from(churnActionsTable)
            .where(
              and(
                eq(churnActionsTable.tenantId, tenant.id),
                eq(churnActionsTable.leadId, row.leadId),
                gt(churnActionsTable.executedAt, cutoff)
              )
            )
            .limit(1);

          if (recentAction) {
            log.info({ leadId: row.leadId }, "scheduler/churn-check: recent churn action found — skipping");
            continue;
          }

          const churnRisk = row.churnRisk ?? 0;
          const isCritical = churnRisk >= 85;

          if (isCritical) {
            // ── Critical (≥85): escalate to closer/sdr with a specific signal ──
            dispatchAgentBackground({
              tenantId: tenant.id,
              leadId:   row.leadId,
              mensagem: "PROATIVO: ALERTA CRÍTICO DE CHURN — lead com risco ≥85 de cancelamento. Ação de escalação imediata necessária.",
              log,
            });

            await db.insert(churnActionsTable).values({
              id: crypto.randomUUID(),
              tenantId: tenant.id,
              leadId:   row.leadId,
              actionType: "escalation_sdr",
              churnRiskAtAction: churnRisk,
              executedAt: new Date(),
            });

            totalAutoWpp++;
            log.info({ leadId: row.leadId, churnRisk }, "scheduler/churn-check: critical — escalation dispatched");
          } else {
            // ── High (70-84): personalized retention message via AI ──────────
            const leadNome = row.nome ?? "cliente";
            const explicacao = row.churnRiskExplicacao ?? "";

            let retentionMsg: string;
            try {
              const aiResponse = await callOpenAI(
                tenant.id,
                "churn_retention",
                [
                  {
                    role: "system",
                    content: `Você é um especialista em retenção de clientes. Escreva UMA mensagem curta e personalizada de reengajamento para WhatsApp (máx. 3 frases). Tom: próximo, humano, sem jargão de vendas. NÃO mencione que é um robô.`,
                  },
                  {
                    role: "user",
                    content: `Lead: ${leadNome}. Contexto de risco: ${explicacao || "inatividade recente"}. Escreva a mensagem de reengajamento.`,
                  },
                ],
                { maxTokens: 150 }
              );
              retentionMsg = aiResponse.content.trim();
            } catch {
              retentionMsg = `Olá ${leadNome}! Faz um tempo que não conversamos. Estou aqui caso precise de qualquer apoio — é só me chamar! 🙂`;
            }

            dispatchAgentBackground({
              tenantId: tenant.id,
              leadId:   row.leadId,
              mensagem: `PROATIVO: reativação churn (score ${churnRisk}) — enviar mensagem de retenção personalizada: "${retentionMsg}"`,
              log,
            });

            await db.insert(churnActionsTable).values({
              id: crypto.randomUUID(),
              tenantId: tenant.id,
              leadId:   row.leadId,
              actionType:        "retention_message",
              messageSent:       retentionMsg,
              churnRiskAtAction: churnRisk,
              executedAt:        new Date(),
            });

            totalAutoWpp++;
            log.info({ leadId: row.leadId, churnRisk }, "scheduler/churn-check: high — retention message dispatched");
          }
        } catch (err) {
          log.error({ err, tenantId: tenant.id, leadId: row.leadId }, "scheduler/churn-check: tiered action failed (non-fatal)");
        }
      }

      log.info({ tenantId: tenant.id, slug: tenant.slug, leadsProcessed: highRiskRows.length }, "scheduler/churn-check: tenant done");
    } catch (err) {
      log.error({ err, tenantId: tenant.id }, "scheduler/churn-check: tenant failed (non-fatal)");
    }
  }

  log.info({ totalLeads, totalTriggered, totalAutoWpp }, "scheduler/churn-check: complete");
}

// ── Job 2: Campaign dispatch ──────────────────────────────────────────────────

/**
 * Builds a Drizzle WHERE condition array from a segmentoFiltro object.
 * Filters against the customerIntelligenceTable columns.
 */
function buildCIConditions(filtro: NonNullable<SegmentoFiltro>) {
  const conditions: ReturnType<typeof eq>[] = [];

  if (filtro.journeyStage !== undefined) {
    conditions.push(eq(customerIntelligenceTable.journeyStage, filtro.journeyStage));
  }

  if (filtro.nextBestAction !== undefined) {
    conditions.push(eq(customerIntelligenceTable.nextBestAction, filtro.nextBestAction));
  }

  if (filtro.intentAnalysis !== undefined) {
    conditions.push(eq(customerIntelligenceTable.intentAnalysis, filtro.intentAnalysis));
  }

  if (filtro.churnRisk !== undefined) {
    if (typeof filtro.churnRisk === "number") {
      conditions.push(eq(customerIntelligenceTable.churnRisk, filtro.churnRisk));
    } else {
      const cr = filtro.churnRisk;
      if (cr.gt  !== undefined) conditions.push(gt(customerIntelligenceTable.churnRisk,  cr.gt));
      if (cr.gte !== undefined) conditions.push(gte(customerIntelligenceTable.churnRisk, cr.gte));
      if (cr.lt  !== undefined) conditions.push(lt(customerIntelligenceTable.churnRisk,  cr.lt));
      if (cr.lte !== undefined) conditions.push(lte(customerIntelligenceTable.churnRisk, cr.lte));
      if (cr.eq  !== undefined) conditions.push(eq(customerIntelligenceTable.churnRisk,  cr.eq));
    }
  }

  return conditions;
}

async function dispatchDueCampaigns(log: Logger): Promise<void> {
  log.info("scheduler/campaigns: checking for due campaigns");

  const now = new Date();

  // Find all campaigns that are scheduled and due
  const dueCampaigns = await db
    .select()
    .from(campaignsTable)
    .where(
      and(
        eq(campaignsTable.status, "agendada"),
        isNotNull(campaignsTable.agendadaPara),
        lte(campaignsTable.agendadaPara, now)
      )
    );

  if (dueCampaigns.length === 0) {
    log.debug("scheduler/campaigns: no due campaigns");
    return;
  }

  log.info({ count: dueCampaigns.length }, "scheduler/campaigns: due campaigns found");

  for (const campaign of dueCampaigns) {
    try {
      // Mark as "enviando" immediately to prevent duplicate dispatch on overlap
      await db
        .update(campaignsTable)
        .set({ status: "enviando", updatedAt: new Date() })
        .where(eq(campaignsTable.id, campaign.id));

      // Load agent config to determine autonomy
      const [agentConfig] = await db
        .select()
        .from(agentConfigsTable)
        .where(eq(agentConfigsTable.tenantId, campaign.tenantId));

      const isAutonomous = !!(agentConfig?.autonomyEnabledAt);

      // Build lead query: all active leads for this tenant, optionally filtered by CI
      const filtro = campaign.segmentoFiltro;
      const ciConditions = filtro ? buildCIConditions(filtro) : [];
      const hasFilter = ciConditions.length > 0;

      let leadIds: string[];

      if (hasFilter) {
        // JOIN leads with customer_intelligence to apply CI-based filters
        const ciRows = await db
          .select({ leadId: customerIntelligenceTable.leadId })
          .from(customerIntelligenceTable)
          .where(
            and(
              eq(customerIntelligenceTable.tenantId, campaign.tenantId),
              ...ciConditions
            )
          )
          .limit(500);

        leadIds = ciRows.map((r) => r.leadId);

        if (leadIds.length > 0) {
          // Verify leads belong to this tenant and are not lost
          const leads = await db
            .select({ id: leadsTable.id })
            .from(leadsTable)
            .where(
              and(
                eq(leadsTable.tenantId, campaign.tenantId),
                inArray(leadsTable.id, leadIds)
              )
            );
          leadIds = leads.map((l) => l.id);
        }
      } else {
        // No filter → all leads for this tenant (limit 500 for safety)
        const leads = await db
          .select({ id: leadsTable.id })
          .from(leadsTable)
          .where(eq(leadsTable.tenantId, campaign.tenantId))
          .limit(500);
        leadIds = leads.map((l) => l.id);
      }

      // If dealEtapas filter is set, narrow leadIds to those with a matching deal stage
      const dealEtapas = (filtro as Record<string, unknown> | null)?.dealEtapas as string[] | undefined;
      if (dealEtapas && dealEtapas.length > 0 && leadIds.length > 0) {
        const dealRows = await db
          .select({ leadId: dealsTable.leadId })
          .from(dealsTable)
          .where(
            and(
              eq(dealsTable.tenantId, campaign.tenantId),
              inArray(dealsTable.etapa, dealEtapas as any[]),
              inArray(dealsTable.leadId, leadIds)
            )
          );
        leadIds = dealRows.map((r) => r.leadId).filter((id): id is string => id != null);
      }

      if (leadIds.length === 0) {
        log.info({ campaignId: campaign.id, tenantId: campaign.tenantId }, "scheduler/campaigns: no matching leads, marking concluida");
        await db
          .update(campaignsTable)
          .set({ status: "concluida", totalDestinatarios: 0, totalEnviados: 0, updatedAt: new Date() })
          .where(eq(campaignsTable.id, campaign.id));
        continue;
      }

      log.info({ campaignId: campaign.id, leadCount: leadIds.length }, "scheduler/campaigns: creating tasks");

      // Preload deal etapas so each lead gets the right stage-specific message
      const mensagensEtapa = campaign.mensagensEtapa as Record<string, string> | null | undefined;
      const leadEtapaMap: Record<string, string> = {};
      if (mensagensEtapa && Object.keys(mensagensEtapa).length > 0 && leadIds.length > 0) {
        const dealRows = await db
          .select({ leadId: dealsTable.leadId, etapa: dealsTable.etapa })
          .from(dealsTable)
          .where(
            and(
              eq(dealsTable.tenantId, campaign.tenantId),
              inArray(dealsTable.leadId, leadIds)
            )
          );
        for (const d of dealRows) {
          if (d.leadId) leadEtapaMap[d.leadId] = d.etapa;
        }
      }

      // ── A/B Test split ─────────────────────────────────────────────────────
      const isAbTest = !!(
        (campaign as Record<string, unknown>).abTestEnabled &&
        (campaign as Record<string, unknown>).variantAText &&
        (campaign as Record<string, unknown>).variantBText
      );
      type LeadVariant = { leadId: string; variant: "A" | "B" | "main"; mensagem: string };
      const leadsWithVariants: LeadVariant[] = [];

      if (isAbTest) {
        const halfLen = Math.floor(leadIds.length / 2);
        for (let i = 0; i < leadIds.length; i++) {
          const leadId = leadIds[i]!;
          const variant = i < halfLen ? "A" : "B";
          const mensagemVariant = variant === "A"
            ? String((campaign as Record<string, unknown>).variantAText)
            : String((campaign as Record<string, unknown>).variantBText);
          leadsWithVariants.push({ leadId, variant, mensagem: mensagemVariant });
        }
        log.info({ campaignId: campaign.id, total: leadIds.length, halfLen }, "scheduler/campaigns: A/B test split aplicado");
      } else {
        for (const leadId of leadIds) {
          const etapa = leadEtapaMap[leadId];
          const mensagemParaLead = (etapa && mensagensEtapa?.[etapa]) || campaign.mensagem;
          leadsWithVariants.push({ leadId, variant: "main", mensagem: mensagemParaLead });
        }
      }

      // Create one agent_task per lead
      const dispatchTime = new Date();
      let enviados = 0;

      for (const { leadId, variant, mensagem: conteudoFinal } of leadsWithVariants) {
        try {
          const campaignImageUrl = (campaign as Record<string, unknown>).imageUrl as string | null | undefined;
          const campaignImageObjectPath = campaignImageUrl
            ? campaignImageUrl.replace(/^\/api\/storage\/objects/, "/objects")
            : undefined;

          const [task] = await db
            .insert(agentTasksTable)
            .values({
              tenantId:   campaign.tenantId,
              leadId,
              agentName:  "sdr",
              actionType: "enviar_whatsapp",
              payload: {
                leadId,
                conteudo:   conteudoFinal,
                agentName:  "sdr",
                canal:      campaign.tipo === "whatsapp" ? "whatsapp" : "whatsapp",
                campaignId: campaign.id,
                abVariant:  variant,
                ...(campaignImageObjectPath ? { campaignImageObjectPath } : {}),
              },
              status:     isAutonomous ? "executando" : "pendente_aprovacao",
              ...(isAutonomous && { executedAt: dispatchTime }),
            })
            .returning();

          // Registra log de envio com variante (wamid preenchido depois pelo webhook)
          await db.insert(campaignSentLogsTable).values({
            id: crypto.randomUUID(),
            campaignId: campaign.id,
            leadId,
            variant,
            sentAt: dispatchTime,
          }).catch(() => {});

          if (isAutonomous) {
            // Execute immediately — import inline to avoid circular dep at module load
            const { executeTaskAction } = await import("../routes/agent_tasks.js");
            await executeTaskAction(task, log);

            // ── Anti-ban: delay entre disparos de campanha ──────────────────
            const delayMs = 4000 + Math.floor(Math.random() * 5000);
            log.debug({ delayMs, leadId, variant }, "scheduler/campaigns: anti-ban delay");
            await new Promise<void>((r) => setTimeout(r, delayMs));
          }

          enviados++;
        } catch (err) {
          log.error({ err, campaignId: campaign.id, leadId }, "scheduler/campaigns: task creation failed for lead (non-fatal)");
        }
      }

      // Mark campaign as concluded
      await db
        .update(campaignsTable)
        .set({
          status:             "concluida",
          totalDestinatarios: leadIds.length,
          totalEnviados:      enviados,
          updatedAt:          new Date(),
        })
        .where(eq(campaignsTable.id, campaign.id));

      log.info(
        { campaignId: campaign.id, tenantId: campaign.tenantId, destinatarios: leadIds.length, enviados },
        "scheduler/campaigns: campaign dispatched"
      );
    } catch (err) {
      log.error({ err, campaignId: campaign.id }, "scheduler/campaigns: campaign failed (non-fatal)");
      // Revert to agendada so it can be retried (avoid stuck "enviando")
      await db
        .update(campaignsTable)
        .set({ status: "agendada", updatedAt: new Date() })
        .where(eq(campaignsTable.id, campaign.id))
        .catch(() => { /* ignore revert failure */ });
    }
  }

  log.info("scheduler/campaigns: cycle complete");
}

// ── Job 4: Lost deal reactivation (after 30 days) ───────────────────────────

async function runLostDealReactivation(log: Logger): Promise<void> {
  log.info("scheduler/reactivation: starting");

  const now = new Date();

  // Buscar itens da fila cujo scheduled_for já passou e status ainda é pending
  const pendingItems = await db
    .select({
      queueId: reactivationQueueTable.id,
      dealId: reactivationQueueTable.dealId,
      lossReason: reactivationQueueTable.lossReason,
    })
    .from(reactivationQueueTable)
    .where(
      and(
        eq(reactivationQueueTable.status, "pending"),
        lte(reactivationQueueTable.scheduledFor, now)
      )
    );

  if (pendingItems.length === 0) {
    log.debug("scheduler/reactivation: no pending items in reactivation_queue");
    return;
  }

  let executed = 0;
  let dispatched = 0;

  for (const item of pendingItems) {
    const dealId = item.dealId;
    if (!dealId) continue;

    try {
      // Fetch deal com leadId e funilId
      const [deal] = await db
        .select({
          id: dealsTable.id,
          tenantId: dealsTable.tenantId,
          leadId: dealsTable.leadId,
          funilId: dealsTable.funilId,
          etapa: dealsTable.etapa,
        })
        .from(dealsTable)
        .where(eq(dealsTable.id, dealId))
        .limit(1);

      if (!deal) {
        log.warn({ dealId, queueId: item.queueId }, "scheduler/reactivation: deal not found, skipping");
        await db
          .update(reactivationQueueTable)
          .set({ status: "skipped", executedAt: now })
          .where(eq(reactivationQueueTable.id, item.queueId));
        continue;
      }

      // Mensagem espontânea de reativação só sai em horário comercial — item
      // fica pending e é reconsiderado na próxima rodada, nada se perde.
      if (!(await tenantIsWithinBusinessHours(deal.tenantId))) {
        continue;
      }

      // Determinar o primeiro estágio do funil do deal
      let targetEtapa = "novo";
      if (deal.funilId) {
        const [funil] = await db
          .select({ etapas: funisTable.etapas })
          .from(funisTable)
          .where(eq(funisTable.id, deal.funilId))
          .limit(1);
        if (funil && Array.isArray(funil.etapas) && funil.etapas.length > 0) {
          targetEtapa = funil.etapas[0] as string;
        }
      }

      // 1. Mover deal para o primeiro estágio do funil
      await db
        .update(dealsTable)
        .set({ etapa: targetEtapa as any, updatedAt: now })
        .where(eq(dealsTable.id, dealId));
      log.info({ dealId, targetEtapa }, "scheduler/reactivation: deal moved to first stage");

      // 2. Criar activity reactivation_scheduled (requer leadId)
      if (deal.leadId) {
        await db.insert(activitiesTable).values({
          tenantId: deal.tenantId,
          leadId: deal.leadId,
          dealId,
          tipo: "tarefa",
          titulo: "Reativação agendada",
          descricao: `Deal reativado automaticamente após 30 dias. Motivo da perda: ${item.lossReason ?? "não informado"}`,
          status: "pendente",
        }).catch((err) => {
          log.warn({ err, dealId }, "scheduler/reactivation: failed to create reactivation activity");
        });

        // 3. Chamar o Agente Reativação
        const [lead] = await db
          .select({ status: leadsTable.status, tenantId: leadsTable.tenantId })
          .from(leadsTable)
          .where(eq(leadsTable.id, deal.leadId))
          .limit(1);

        if (lead && lead.tenantId === deal.tenantId && lead.status !== "aquecimento") {
          await db
            .update(leadsTable)
            .set({ status: "aquecimento", updatedAt: now })
            .where(eq(leadsTable.id, deal.leadId));

          dispatchAgentBackground({
            tenantId: deal.tenantId,
            leadId: deal.leadId,
            mensagem: `PROATIVO: reativação automática — deal perdido (motivo: ${item.lossReason ?? "não informado"}), tentando reengajamento.`,
            forcedAgent: "reactivation",
            log,
          });
          dispatched++;
          log.info({ dealId, leadId: deal.leadId }, "scheduler/reactivation: reactivation agent dispatched");
        }
      }

      // 4. Marcar como executed
      await db
        .update(reactivationQueueTable)
        .set({ status: "executed", executedAt: now })
        .where(eq(reactivationQueueTable.id, item.queueId));
      executed++;
    } catch (err) {
      log.error({ err, dealId, queueId: item.queueId }, "scheduler/reactivation: item failed (non-fatal)");
    }
  }

  log.info({ total: pendingItems.length, executed, agentsDispatched: dispatched }, "scheduler/reactivation: complete");
}

// ── Job 5: Expiração de demos ───────────────────────────────────────────────

async function expireOldDemos(log: Logger): Promise<void> {
  log.info("scheduler/demo-expiration: starting");

  const now = new Date();
  const expiredDemos = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name })
    .from(tenantsTable)
    .where(
      and(
        eq(tenantsTable.isDemo, true),
        eq(tenantsTable.status, "active"),
        lte(tenantsTable.demoExpiresAt, now)
      )
    );

  if (expiredDemos.length === 0) {
    log.info("scheduler/demo-expiration: no expired demos found");
    return;
  }

  for (const demo of expiredDemos) {
    try {
      await db
        .update(tenantsTable)
        .set({ status: "suspended", suspendedReason: "demo_expirada", updatedAt: new Date() })
        .where(eq(tenantsTable.id, demo.id));
      log.info({ tenantId: demo.id }, "scheduler/demo-expiration: demo suspended");
    } catch (err) {
      log.error({ err, tenantId: demo.id }, "scheduler/demo-expiration: failed to suspend demo");
    }
  }

  log.info({ count: expiredDemos.length }, "scheduler/demo-expiration: complete");
}

// ── Scheduler bootstrap ───────────────────────────────────────────────────────

// ── Job 7: Special date check (birthdays, commercial dates) ─────────────────

/**
 * Computes movable holiday dates for a given year.
 */
function getMovableDates(year: number) {
  // Easter (Gauss algorithm)
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month - 1, day);

  // Mother's Day: 2nd Sunday of May
  const may1 = new Date(year, 4, 1);
  const mothersDay = new Date(year, 4, 1 + (7 - may1.getDay() + 7) % 7 + 7);

  // Father's Day: 2nd Sunday of August
  const aug1 = new Date(year, 7, 1);
  const fathersDay = new Date(year, 7, 1 + (7 - aug1.getDay() + 7) % 7 + 7);

  // Children's Day: Oct 12 (fixed)
  const childrensDay = new Date(year, 9, 12);

  // Valentine's Day: Jun 12 (Brazil)
  const valentinesDay = new Date(year, 5, 12);

  // Christmas: Dec 25
  const christmas = new Date(year, 11, 25);

  // Black Friday: last Friday of November
  const nov30 = new Date(year, 10, 30);
  const blackFriday = new Date(year, 10, 30 - ((nov30.getDay() + 2) % 7));

  // Carnaval = 47 days before Easter
  const carnaval = new Date(easter);
  carnaval.setDate(carnaval.getDate() - 47);

  return {
    carnaval: { name: "Carnaval", date: carnaval, targetGender: undefined },
    pascoa: { name: "Páscoa", date: easter, targetGender: undefined },
    dia_das_maes: { name: "Dia das Mães", date: mothersDay, targetGender: "feminino" },
    dia_dos_pais: { name: "Dia dos Pais", date: fathersDay, targetGender: "masculino" },
    dia_das_criancas: { name: "Dia das Crianças", date: childrensDay, targetGender: undefined },
    dia_dos_namorados: { name: "Dia dos Namorados", date: valentinesDay, targetGender: undefined },
    natal: { name: "Natal", date: christmas, targetGender: undefined },
    black_friday: { name: "Black Friday", date: blackFriday, targetGender: undefined },
  };
}

/**
 * Default commercial dates for new tenants.
 */
export function getDefaultCommercialDates() {
  return mergeCommercialDates([]);
}

async function isEventAlreadySent(tenantId: string, leadId: string, campaignType: string, campaignKey: string, year: string): Promise<boolean> {
  const [existing] = await db
    .select({ id: leadCampaignLogTable.id })
    .from(leadCampaignLogTable)
    .where(
      and(
        eq(leadCampaignLogTable.tenantId, tenantId),
        eq(leadCampaignLogTable.leadId, leadId),
        eq(leadCampaignLogTable.campaignType, campaignType),
        eq(leadCampaignLogTable.campaignKey, campaignKey),
        eq(leadCampaignLogTable.year, year)
      )
    )
    .limit(1);
  return !!existing;
}

async function runSpecialDateCheck(log: Logger): Promise<void> {
  log.info("scheduler/special-dates: starting");

  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();
  const currentYear = now.getFullYear();
  const yearStr = String(currentYear);

  const movableDates = getMovableDates(currentYear);

  const tenants = await db
    .select({ id: tenantsTable.id, slug: tenantsTable.slug })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  let totalDispatched = 0;
  let totalSkipped = 0;

  for (const tenant of tenants) {
    try {
      const [calendarSettings] = await db
        .select()
        .from(tenantCalendarSettingsTable)
        .where(eq(tenantCalendarSettingsTable.tenantId, tenant.id))
        .limit(1);

      const commercialDates = mergeCommercialDates(calendarSettings?.commercialDates);
      const professionalDates = calendarSettings?.professionalDates ?? [];

      const catalogRows = await db
        .select({
          id: produtosCatalogoTable.id,
          nome: produtosCatalogoTable.nome,
          categoriaNome: categoriasProdutoTable.nome,
          precoBase: produtosCatalogoTable.precoBase,
        })
        .from(produtosCatalogoTable)
        .leftJoin(categoriasProdutoTable, eq(produtosCatalogoTable.categoriaId, categoriasProdutoTable.id))
        .where(and(eq(produtosCatalogoTable.tenantId, tenant.id), eq(produtosCatalogoTable.ativo, true)))
        .limit(10);
      const catalog = catalogRows.map((c) => ({ id: c.id, nome: c.nome, categoria: c.categoriaNome, precoBase: c.precoBase }));

      const leads = await db
        .select()
        .from(leadsTable)
        .where(eq(leadsTable.tenantId, tenant.id));

      for (const lead of leads) {
        if (lead.specialDateMessagesOptOut) {
          totalSkipped++;
          continue;
        }
        if (!lead.telefone) {
          totalSkipped++;
          continue;
        }

        type Scenario = {
          type: string;
          dateName?: string;
          recipientName?: string;
          recipientRelation?: string;
          catalog?: Array<{ nome: string; categoria?: string | null; precoBase: string | null }>;
          dealId?: string;
          campaignKey: string;
        };

        let scenario: Scenario | null = null;

        // Lead birthday
        if ((lead.birthMonth === todayMonth && lead.birthDay === todayDay) || isBirthdayOn(lead.dataNascimento, todayMonth, todayDay)) {
          const campaignKey = `birthday-lead-${yearStr}-${todayMonth.toString().padStart(2, "0")}-${todayDay.toString().padStart(2, "0")}`;
          scenario = { type: "birthday_lead", catalog, campaignKey };
        }

        // Spouse birthday
        if (!scenario && lead.conjugeDataNascimento) {
          const birthday = parseBirthdayParts(lead.conjugeDataNascimento);
          if (birthday) {
            const { month: m, day: d } = birthday;
            if (m === todayMonth && d === todayDay) {
              const campaignKey = `birthday-family-${yearStr}-${todayMonth.toString().padStart(2, "0")}-${todayDay.toString().padStart(2, "0")}-spouse`;
              scenario = { type: "birthday_family", recipientName: lead.conjugeNome ?? "seu cônjuge", recipientRelation: "cônjuge", catalog, campaignKey };
            }
          }
        }

        // Children birthdays
        if (!scenario && lead.filhos && lead.filhos.length > 0) {
          for (const f of lead.filhos) {
            let match = false;
            if (f.dataNascimento) {
              const birthday = parseBirthdayParts(f.dataNascimento);
              if (birthday) {
                const { month: m, day: d } = birthday;
                if (m === todayMonth && d === todayDay) match = true;
              }
            }
            if (!match && f.birthMonth === todayMonth && f.birthDay === todayDay) match = true;
            if (match) {
              const campaignKey = `birthday-family-${yearStr}-${todayMonth.toString().padStart(2, "0")}-${todayDay.toString().padStart(2, "0")}-child-${f.nome ?? ""}`;
              scenario = { type: "birthday_family", recipientName: f.nome, recipientRelation: "filho(a)", catalog, campaignKey };
              break;
            }
          }
        }

        // Custom relationship / special dates registered on the lead
        if (!scenario && Array.isArray(lead.specialDates)) {
          for (const specialDate of lead.specialDates) {
            if (!specialDate || specialDate.active === false || !specialDate.name || !specialDate.date) continue;
            const parsed = parseBirthdayParts(specialDate.date);
            if (!parsed) continue;
            if (parsed.month !== todayMonth || parsed.day !== todayDay) continue;

            const recurring = specialDate.recurring !== false;
            if (!recurring) {
              const year = Number(String(specialDate.date).slice(0, 4));
              if (Number.isFinite(year) && year !== currentYear) continue;
            }

            const keyName = String(specialDate.id ?? specialDate.name)
              .replace(/\s+/g, "-")
              .toLowerCase();
            const campaignKey = `special-${keyName}-${yearStr}`;
            scenario = {
              type: "custom_special_date",
              dateName: specialDate.name,
              catalog,
              campaignKey,
            };
            break;
          }
        }
        // Deal anniversary
        if (!scenario) {
          const wonDeals = await db
            .select({ id: dealsTable.id, dataFechamento: dealsTable.dataFechamento })
            .from(dealsTable)
            .where(
              and(
                eq(dealsTable.tenantId, tenant.id),
                eq(dealsTable.leadId, lead.id),
                eq(dealsTable.etapa, "ganho"),
                isNotNull(dealsTable.dataFechamento)
              )
            )
            .limit(5);
          for (const deal of wonDeals) {
            if (!deal.dataFechamento) continue;
            const fechDate = new Date(deal.dataFechamento);
            const fechMonth = fechDate.getMonth() + 1;
            const fechDay = fechDate.getDate();
            const oneYearAgo = new Date(now);
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            if (fechDate <= oneYearAgo && fechMonth === todayMonth && fechDay === todayDay) {
              const campaignKey = `deal-anniversary-${deal.id}-${yearStr}`;
              scenario = { type: "deal_anniversary", dealId: deal.id, catalog, campaignKey };
              break;
            }
          }
        }

        // Professional dates: congratulate only leads whose registered profession matches.
        if (!scenario && lead.profissao) {
          for (const professionalDate of professionalDates) {
            if (!professionalDate.active) continue;
            if (professionalDate.month !== todayMonth || professionalDate.day !== todayDay) continue;
            if (!professionMatches(lead.profissao, professionalDate.professions)) continue;

            const campaignKey = `professional-${professionalDate.name.replace(/\s+/g, "-")}-${yearStr}`;
            scenario = {
              type: "professional_day",
              dateName: professionalDate.name,
              catalog: [],
              campaignKey,
            };
            break;
          }
        }
        // Commercial dates
        if (!scenario) {
          for (const cd of commercialDates) {
            if (!cd.active) continue;
            let sendDate: Date | null = null;
            if (cd.movableDate) {
              const md = Object.values(movableDates).find((m) => m.name === cd.name);
              if (md) {
                sendDate = new Date(md.date);
                sendDate.setDate(sendDate.getDate() - cd.daysBeforeToSend);
              }
            } else if (cd.month && cd.day) {
              sendDate = new Date(currentYear, cd.month - 1, cd.day);
              sendDate.setDate(sendDate.getDate() - cd.daysBeforeToSend);
            }
            if (sendDate && sendDate.getMonth() + 1 === todayMonth && sendDate.getDate() === todayDay) {
              if (cd.targetGender && lead.genero && lead.genero !== cd.targetGender) continue;
              const campaignKey = `commercial-${cd.name.replace(/\s+/g, "-")}-${yearStr}`;
              scenario = { type: "commercial_date", dateName: cd.name, catalog, campaignKey };
              break;
            }
          }
        }

        if (!scenario) continue;

        // 1. Insert dedup record with ON CONFLICT DO NOTHING (unique constraint)
        const [logRow] = await db
          .insert(leadCampaignLogTable)
          .values({
            tenantId: tenant.id,
            leadId: lead.id,
            campaignType: scenario.type,
            campaignKey: scenario.campaignKey,
            year: yearStr,
            status: "pending",
          })
          .onConflictDoNothing({ target: [leadCampaignLogTable.tenantId, leadCampaignLogTable.leadId, leadCampaignLogTable.campaignKey, leadCampaignLogTable.year] })
          .returning({ id: leadCampaignLogTable.id });
        if (!logRow) {
          // Already handled this event
          totalSkipped++;
          continue;
        }

        // 2. Dispatch synchronously and capture explicit result
        let result: DispatchResult | null = null;
        try {
          result = await processAgentInternal({
            tenantId: tenant.id,
            leadId: lead.id,
            mensagem: `PROATIVO: ${scenario.type === "birthday_lead" ? "aniversário do lead" : scenario.type === "birthday_family" ? `aniversário de ${scenario.recipientName}` : scenario.type === "deal_anniversary" ? "aniversário de fechamento do deal" : scenario.type === "commercial_date" ? `campanha de ${scenario.dateName}` : scenario.type === "professional_day" ? `${scenario.dateName} para ${lead.profissao}` : scenario.type === "custom_special_date" ? `data especial: ${scenario.dateName}` : "relacionamento"}.`,
            forcedAgent: "relacionamento",
            log,
            scenario: {
              type: scenario.type,
              dateName: scenario.dateName,
              recipientName: scenario.recipientName,
              recipientRelation: scenario.recipientRelation,
              catalog: catalog.map((c) => ({ nome: c.nome, categoria: c.categoria, precoBase: c.precoBase })),
            },
          });
        } catch (err) {
          log.warn({ err, leadId: lead.id, tenantId: tenant.id, campaignKey: scenario.campaignKey }, "scheduler/special-dates: dispatch failed");
        }

        // 3. Update log with actual outcome
        const outcome = result?.status ?? "failed";
        if (outcome === "sent") {
          await db
            .update(leadCampaignLogTable)
            .set({ status: "sent", sentAt: new Date() })
            .where(
              and(
                eq(leadCampaignLogTable.tenantId, tenant.id),
                eq(leadCampaignLogTable.leadId, lead.id),
                eq(leadCampaignLogTable.campaignKey, scenario.campaignKey)
              )
            );
          totalDispatched++;
          log.info({ leadId: lead.id, tenantId: tenant.id, scenario: scenario.type }, "scheduler/special-dates: dispatched");
        } else {
          await db
            .update(leadCampaignLogTable)
            .set({ status: outcome === "skipped" ? "skipped" : "failed" })
            .where(
              and(
                eq(leadCampaignLogTable.tenantId, tenant.id),
                eq(leadCampaignLogTable.leadId, lead.id),
                eq(leadCampaignLogTable.campaignKey, scenario.campaignKey)
              )
            );
          totalSkipped++;
        }
      }

      log.info({ tenantId: tenant.id, dispatched: totalDispatched, skipped: totalSkipped }, "scheduler/special-dates: tenant done");
    } catch (err) {
      log.error({ err, tenantId: tenant.id }, "scheduler/special-dates: tenant failed (non-fatal)");
    }
  }

  log.info({ totalDispatched, totalSkipped }, "scheduler/special-dates: complete");
}

// ── Job: Pós-Venda inactivity check-in ─────────────────────────────────────────
//
// For each active tenant with the "relacionamento" agent enabled, finds
// clientes (lead.status === "cliente") whose most recent conversation message
// is older than the tenant's configured `posVendaInactivityDays` (default 30,
// per-tenant via agent_configs.pos_venda_inactivity_days) — or who have no
// conversation at all — and proactively dispatches a "relacionamento" check-in.
// Deduplicated once per calendar month per lead via leadCampaignLogTable.
async function runInactivityCheck(log: Logger): Promise<void> {
  log.info("scheduler/pos-venda-inactivity: starting");

  const now = new Date();
  const yearStr = String(now.getFullYear());
  const monthStr = String(now.getMonth() + 1).padStart(2, "0");

  const tenants = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  let totalDispatched = 0;
  let totalSkipped = 0;

  for (const tenant of tenants) {
    try {
      // Mensagem espontânea de reengajamento só sai em horário comercial —
      // fica pra próxima rodada, nada se perde, só adia.
      if (!(await tenantIsWithinBusinessHours(tenant.id))) {
        continue;
      }

      const [agentCfg] = await db
        .select({
          posVendaInactivityDays: agentConfigsTable.posVendaInactivityDays,
          agents: agentConfigsTable.agents,
        })
        .from(agentConfigsTable)
        .where(eq(agentConfigsTable.tenantId, tenant.id))
        .limit(1);

      if (!agentCfg?.agents?.relacionamento?.enabled) {
        continue;
      }

      const inactivityDays = agentCfg.posVendaInactivityDays ?? 30;
      const cutoff = new Date(now);
      cutoff.setDate(cutoff.getDate() - inactivityDays);

      const catalogRows = await db
        .select({
          nome: produtosCatalogoTable.nome,
          categoriaNome: categoriasProdutoTable.nome,
          precoBase: produtosCatalogoTable.precoBase,
        })
        .from(produtosCatalogoTable)
        .leftJoin(categoriasProdutoTable, eq(produtosCatalogoTable.categoriaId, categoriasProdutoTable.id))
        .where(and(eq(produtosCatalogoTable.tenantId, tenant.id), eq(produtosCatalogoTable.ativo, true)))
        .limit(10);
      const catalog = catalogRows.map((c) => ({ nome: c.nome, categoria: c.categoriaNome, precoBase: c.precoBase }));

      const clientLeads = await db
        .select({
          id: leadsTable.id,
          specialDateMessagesOptOut: leadsTable.specialDateMessagesOptOut,
          telefone: leadsTable.telefone,
        })
        .from(leadsTable)
        .where(and(eq(leadsTable.tenantId, tenant.id), eq(leadsTable.status, "cliente")));

      for (const lead of clientLeads) {
        if (lead.specialDateMessagesOptOut || !lead.telefone) {
          totalSkipped++;
          continue;
        }

        const [conv] = await db
          .select({ ultimaMensagemEm: conversationsTable.ultimaMensagemEm })
          .from(conversationsTable)
          .where(and(eq(conversationsTable.tenantId, tenant.id), eq(conversationsTable.leadId, lead.id)))
          .orderBy(desc(conversationsTable.ultimaMensagemEm))
          .limit(1);

        const lastMessageAt = conv?.ultimaMensagemEm ? new Date(conv.ultimaMensagemEm) : null;
        if (lastMessageAt && lastMessageAt > cutoff) {
          continue; // ainda ativo — não é caso de check-in de inatividade
        }

        const daysInactive = lastMessageAt
          ? Math.floor((now.getTime() - lastMessageAt.getTime()) / (1000 * 60 * 60 * 24))
          : inactivityDays;

        const campaignKey = `inactivity-checkin-${yearStr}-${monthStr}`;

        const [logRow] = await db
          .insert(leadCampaignLogTable)
          .values({
            tenantId: tenant.id,
            leadId: lead.id,
            campaignType: "inactivity_checkin",
            campaignKey,
            year: yearStr,
            status: "pending",
          })
          .onConflictDoNothing({ target: [leadCampaignLogTable.tenantId, leadCampaignLogTable.leadId, leadCampaignLogTable.campaignKey, leadCampaignLogTable.year] })
          .returning({ id: leadCampaignLogTable.id });
        if (!logRow) {
          totalSkipped++;
          continue;
        }

        let result: DispatchResult | null = null;
        try {
          result = await processAgentInternal({
            tenantId: tenant.id,
            leadId: lead.id,
            mensagem: `PROATIVO: check-in de inatividade (${daysInactive} dias sem contato).`,
            forcedAgent: "relacionamento",
            log,
            scenario: {
              type: "inactivity_checkin",
              daysInactive,
              catalog,
            },
          });
        } catch (err) {
          log.warn({ err, leadId: lead.id, tenantId: tenant.id, campaignKey }, "scheduler/pos-venda-inactivity: dispatch failed");
        }

        const outcome = result?.status ?? "failed";
        if (outcome === "sent") {
          await db
            .update(leadCampaignLogTable)
            .set({ status: "sent", sentAt: new Date() })
            .where(
              and(
                eq(leadCampaignLogTable.tenantId, tenant.id),
                eq(leadCampaignLogTable.leadId, lead.id),
                eq(leadCampaignLogTable.campaignKey, campaignKey)
              )
            );
          totalDispatched++;
          log.info({ leadId: lead.id, tenantId: tenant.id, daysInactive }, "scheduler/pos-venda-inactivity: dispatched");
        } else {
          await db
            .update(leadCampaignLogTable)
            .set({ status: outcome === "skipped" ? "skipped" : "failed" })
            .where(
              and(
                eq(leadCampaignLogTable.tenantId, tenant.id),
                eq(leadCampaignLogTable.leadId, lead.id),
                eq(leadCampaignLogTable.campaignKey, campaignKey)
              )
            );
          totalSkipped++;
        }
      }
    } catch (err) {
      log.error({ err, tenantId: tenant.id }, "scheduler/pos-venda-inactivity: tenant failed (non-fatal)");
    }
  }

  log.info({ totalDispatched, totalSkipped }, "scheduler/pos-venda-inactivity: complete");
}

// ── Job: Prospector campaign orchestrator (every 15 min) ──────────────────────
//
// Only runs for tenants with prospect_status='automated'. Advances each active
// prospect_campaign through the cadence:
//   Dia 1: 1º e-mail            (day1SentAt)
//   Dia 3: 2º e-mail            (day3SentAt) — só se o lead não respondeu
//   Dia 7: WhatsApp             (day7SentAt) — só se o lead não respondeu
// Para cada passo, registra o envio e atualiza o timestamp. Se o lead respondeu
// (mensagem de entrada após o início), a campanha é encerrada (status='respondido').
const DAY_MS = 24 * 60 * 60 * 1000;

// Texto aprovado mais recente para o lead (edited > generated). Retorna email/whatsapp.
async function resolveApprovedTexts(
  tenantId: string,
  leadId: string,
): Promise<{ email: string; whatsapp: string } | null> {
  const [row] = await db
    .select({
      approvedText: prospectApprovalsTable.approvedText,
      generatedText: prospectApprovalsTable.generatedText,
      messageType: prospectApprovalsTable.messageType,
    })
    .from(prospectApprovalsTable)
    .where(
      and(
        eq(prospectApprovalsTable.tenantId, tenantId),
        eq(prospectApprovalsTable.leadId, leadId),
        inArray(prospectApprovalsTable.action, ["approved", "edited"]),
      ),
    )
    .orderBy(desc(prospectApprovalsTable.createdAt))
    .limit(1);
  if (!row) return null;

  let email = "";
  let whatsapp = "";
  try {
    const j = JSON.parse(row.generatedText ?? "{}") as { email?: string; whatsapp?: string };
    email = j.email ?? "";
    whatsapp = j.whatsapp ?? "";
  } catch {
    // generatedText não é JSON (rascunho legado): usa como texto único.
    const plain = row.generatedText ?? "";
    email = plain;
    whatsapp = plain;
  }
  // Edição manual sobrepõe o texto do canal correspondente.
  if (row.approvedText) {
    if (row.messageType === "email") email = row.approvedText;
    else whatsapp = row.approvedText;
  }
  return { email, whatsapp };
}

// True se o lead enviou alguma mensagem de entrada depois de `since`.
async function leadHasReplied(tenantId: string, leadId: string, since: Date): Promise<boolean> {
  const [reply] = await db
    .select({ id: messagesTable.id })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.tenantId, tenantId),
        eq(messagesTable.leadId, leadId),
        eq(messagesTable.direcao, "entrada"),
        gt(messagesTable.createdAt, since),
      ),
    )
    .limit(1);
  return !!reply;
}

async function recordEmailSent(tenantId: string, leadId: string, conteudo: string): Promise<void> {
  if (!conteudo.trim()) return;

  // conversationId é obrigatório em messages — acha a conversa de e-mail
  // já existente pra esse lead, ou cria uma nova.
  const [existingConv] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .where(and(eq(conversationsTable.tenantId, tenantId), eq(conversationsTable.leadId, leadId), eq(conversationsTable.channel, "email")))
    .limit(1);

  const conversationId = existingConv?.id ?? (
    await db
      .insert(conversationsTable)
      .values({ tenantId, leadId, channel: "email", status: "open" })
      .returning({ id: conversationsTable.id })
  )[0].id;

  await db.insert(messagesTable).values({
    tenantId,
    leadId,
    conversationId,
    direcao: "saida",
    canal: "email",
    conteudo,
    enviadoPor: "agente_ia",
  });
}

async function orchestrateProspectCampaigns(log: Logger): Promise<void> {
  log.info("scheduler/prospect-orchestrator: starting");

  const automatedTenants = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.prospectStatus, "automated"));

  if (automatedTenants.length === 0) {
    log.debug("scheduler/prospect-orchestrator: no automated tenants");
    return;
  }

  const now = new Date();
  let advanced = 0;

  for (const tenant of automatedTenants) {
    const campaigns = await db
      .select()
      .from(prospectCampaignsTable)
      .where(
        and(
          eq(prospectCampaignsTable.tenantId, tenant.id),
          isNotNull(prospectCampaignsTable.leadId),
          sql`(${prospectCampaignsTable.status} IS NULL OR ${prospectCampaignsTable.status} NOT IN ('respondido', 'concluida'))`,
        ),
      )
      .limit(500);

    for (const campaign of campaigns) {
      const leadId = campaign.leadId;
      if (!leadId) continue;
      try {
        const texts = await resolveApprovedTexts(tenant.id, leadId);
        const emailText = (texts?.email ?? "").trim();
        const whatsappText = (texts?.whatsapp ?? "").trim();

        // ── Dia 1: 1º e-mail ──────────────────────────────────────────────────
        if (!campaign.day1SentAt) {
          // Sem texto aprovado ainda: não avança (tenta de novo no próximo ciclo).
          if (!emailText) continue;
          // Claim atômico: só avança se day1SentAt ainda está nulo (evita corrida).
          const claimed = await db
            .update(prospectCampaignsTable)
            .set({ day1SentAt: now, status: "dia1_enviado", updatedAt: now })
            .where(
              and(eq(prospectCampaignsTable.id, campaign.id), isNull(prospectCampaignsTable.day1SentAt)),
            )
            .returning({ id: prospectCampaignsTable.id });
          if (claimed.length > 0) {
            await recordEmailSent(tenant.id, leadId, emailText);
            advanced++;
          }
          continue;
        }

        // Se o lead respondeu desde o Dia 1, encerra a cadência.
        if (await leadHasReplied(tenant.id, leadId, campaign.day1SentAt)) {
          await db
            .update(prospectCampaignsTable)
            .set({ status: "respondido", updatedAt: now })
            .where(eq(prospectCampaignsTable.id, campaign.id));
          continue;
        }

        // ── Dia 3: 2º e-mail (>= 2 dias após o Dia 1) ─────────────────────────
        if (!campaign.day3SentAt) {
          if (now.getTime() - campaign.day1SentAt.getTime() >= 2 * DAY_MS) {
            if (!emailText) continue;
            const claimed = await db
              .update(prospectCampaignsTable)
              .set({ day3SentAt: now, status: "dia3_enviado", updatedAt: now })
              .where(
                and(
                  eq(prospectCampaignsTable.id, campaign.id),
                  isNull(prospectCampaignsTable.day3SentAt),
                ),
              )
              .returning({ id: prospectCampaignsTable.id });
            if (claimed.length > 0) {
              await recordEmailSent(tenant.id, leadId, emailText);
              advanced++;
            }
          }
          continue;
        }

        // ── Dia 7: WhatsApp (>= 4 dias após o Dia 3) ──────────────────────────
        if (!campaign.day7SentAt) {
          if (now.getTime() - campaign.day3SentAt.getTime() >= 4 * DAY_MS) {
            if (!whatsappText) continue;
            const claimed = await db
              .update(prospectCampaignsTable)
              .set({ day7SentAt: now, status: "concluida", updatedAt: now })
              .where(
                and(
                  eq(prospectCampaignsTable.id, campaign.id),
                  isNull(prospectCampaignsTable.day7SentAt),
                ),
              )
              .returning({ id: prospectCampaignsTable.id });
            if (claimed.length > 0) {
              await db.insert(agentTasksTable).values({
                tenantId: tenant.id,
                leadId,
                agentName: "sdr",
                actionType: "enviar_whatsapp",
                payload: {
                  leadId,
                  conteudo: whatsappText,
                  agentName: "sdr",
                  canal: "whatsapp",
                  prospectCampaignId: campaign.id,
                },
                status: "executando",
                executedAt: now,
              });
              advanced++;
            }
          }
          continue;
        }
      } catch (err) {
        log.error({ err, campaignId: campaign.id }, "scheduler/prospect-orchestrator: campaign error");
      }
    }
  }

  log.info({ advanced }, "scheduler/prospect-orchestrator: complete");
}

// ── Job 14: No-response closing message ──────────────────────────────────────
// After the agent sends 2+ consecutive messages with no reply from the lead,
// and 24h have passed since the last outbound message, send a polite farewell,
// move the lead to "aquecimento" status, and move the deal to "em_aquecimento".

const CLOSING_AGENT_TAG = "encerramento_auto";
const FAREWELL_MESSAGE =
  "Olá! Tentei entrar em contato algumas vezes, mas não obtive retorno. Vou encerrar nosso atendimento por ora — sem problemas! 😊\n\nCaso precise de qualquer apoio em outro momento, estarei à disposição. Até mais!";

async function runNoResponseClosingMessage(log: Logger): Promise<void> {
  log.info("scheduler/no-response-closing: starting");

  const oneDayAgo     = new Date(Date.now() -  1 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo  = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Get tenants with autonomous WhatsApp enabled
  const autonomousTenants = await db
    .select({ tenantId: agentConfigsTable.tenantId })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.churnAutoWhatsapp, true));

  if (autonomousTenants.length === 0) {
    log.info("scheduler/no-response-closing: no autonomous tenants — done");
    return;
  }

  const tenantIds = autonomousTenants.map((t) => t.tenantId);

  // Find conversations inactive for 1-60 days (outbound last, lead has phone, not already aquecimento)
  const candidates = await db
    .select({
      conversationId: conversationsTable.id,
      leadId:         conversationsTable.leadId,
      tenantId:       conversationsTable.tenantId,
      channel:        conversationsTable.channel,
      leadStatus:     leadsTable.status,
      leadTelefone:   leadsTable.telefone,
    })
    .from(conversationsTable)
    .innerJoin(leadsTable, eq(leadsTable.id, conversationsTable.leadId))
    .where(
      and(
        inArray(conversationsTable.tenantId, tenantIds),
        lte(conversationsTable.ultimaMensagemEm, oneDayAgo),
        gte(conversationsTable.ultimaMensagemEm, sixtyDaysAgo),
        isNotNull(leadsTable.telefone),
      )
    )
    .limit(500);

  let totalChecked = 0;
  let totalClosed  = 0;
  let totalSkipped = 0;

  for (const conv of candidates) {
    totalChecked++;
    try {
      if (!conv.leadId) {
        totalSkipped++;
        continue;
      }

      // Already warm — nothing to do
      if (conv.leadStatus === "aquecimento") {
        totalSkipped++;
        continue;
      }

      // Fetch last 10 messages to count consecutive outbound at the tail
      const recentMsgs = await db
        .select({ direcao: messagesTable.direcao, agentName: messagesTable.agentName })
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conv.conversationId))
        .orderBy(desc(messagesTable.createdAt))
        .limit(10);

      if (recentMsgs.length === 0) {
        totalSkipped++;
        continue;
      }

      // Count consecutive outbound from the most-recent end
      let consecutiveOut = 0;
      for (const msg of recentMsgs) {
        if (msg.direcao === "saida") consecutiveOut++;
        else break;
      }

      if (consecutiveOut < 2) {
        totalSkipped++;
        continue;
      }

      // Dedup: skip if we already sent the closing message for this lead in the last 30 days
      const [alreadyClosed] = await db
        .select({ id: messagesTable.id })
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.tenantId, conv.tenantId),
            eq(messagesTable.leadId, conv.leadId),
            eq(messagesTable.agentName, CLOSING_AGENT_TAG),
            gte(messagesTable.createdAt, thirtyDaysAgo),
          )
        )
        .limit(1);

      if (alreadyClosed) {
        log.info({ leadId: conv.leadId }, "scheduler/no-response-closing: farewell already sent recently — skipping");
        totalSkipped++;
        continue;
      }

      // Determine channel (prefer whatsapp)
      const validChannels = ["whatsapp", "instagram", "email", "chat"] as const;
      const canal = validChannels.includes(conv.channel as typeof validChannels[number])
        ? (conv.channel as "whatsapp" | "instagram" | "email" | "chat")
        : "whatsapp";

      // Send farewell
      try {
        await sendOutgoingMessage(
          { tenantId: conv.tenantId, leadId: conv.leadId, conteudo: FAREWELL_MESSAGE, canal, agentName: CLOSING_AGENT_TAG },
          log,
        );
      } catch (sendErr) {
        log.warn({ err: sendErr, leadId: conv.leadId }, "scheduler/no-response-closing: send failed (non-fatal) — skipping lead");
        totalSkipped++;
        continue;
      }

      // Move lead to aquecimento
      await db
        .update(leadsTable)
        .set({ status: "aquecimento", updatedAt: new Date() })
        .where(eq(leadsTable.id, conv.leadId));

      // Move deal to em_aquecimento stage
      const [activeDeal] = await db
        .select({ id: dealsTable.id })
        .from(dealsTable)
        .where(
          and(
            eq(dealsTable.leadId, conv.leadId),
            eq(dealsTable.tenantId, conv.tenantId),
            inArray(dealsTable.etapa, ["novo", "qualificado", "proposta", "negociacao"]),
          )
        )
        .orderBy(desc(dealsTable.createdAt))
        .limit(1);
      if (activeDeal) {
        await db
          .update(dealsTable)
          .set({ etapa: "em_aquecimento", updatedAt: new Date() })
          .where(eq(dealsTable.id, activeDeal.id));
      }

      totalClosed++;
      log.info({ leadId: conv.leadId, tenantId: conv.tenantId, consecutiveOut, dealMoved: !!activeDeal }, "scheduler/no-response-closing: farewell sent, lead → aquecimento");
    } catch (err) {
      log.error({ err, leadId: conv.leadId }, "scheduler/no-response-closing: error (non-fatal)");
    }
  }

  log.info({ totalChecked, totalClosed, totalSkipped }, "scheduler/no-response-closing: complete");
}

export function startScheduler(log: Logger): void {
  // Veículos únicos: ao vencer o SLA, bloqueia alterações até o vendedor
  // justificar manter, avançar ou perder a negociação.
  cron.schedule("*/15 * * * *", () => {
    markOverdueVehicleReservations()
      .then((total) => total > 0 && log.info({ total }, "scheduler/vehicle-reservations: justification required"))
      .catch((err) => log.error({ err }, "scheduler/vehicle-reservations: unhandled error"));
  });
  // Mesma checagem, generalizada pra qualquer "Modo: Só este item" que
  // não seja veículo (imóvel, produto, landing_page, livre).
  cron.schedule("*/15 * * * *", () => {
    markOverdueItemReservations()
      .then((total) => total > 0 && log.info({ total }, "scheduler/item-reservations: justification required"))
      .catch((err) => log.error({ err }, "scheduler/item-reservations: unhandled error"));
  });
  // Job 1: Churn check — every hour at :05
  cron.schedule("5 * * * *", () => {
    runChurnCheckAll(log).catch((err) => {
      log.error({ err }, "scheduler/churn-check: unhandled error");
    });
  });

  // Job 2: Campaign dispatch — every hour at :15
  cron.schedule("15 * * * *", () => {
    dispatchDueCampaigns(log).catch((err) => {
      log.error({ err }, "scheduler/campaigns: unhandled error");
    });
  });

  // Job 2b: Prospector campaign orchestrator — every 15 minutes
  cron.schedule("*/15 * * * *", () => {
    orchestrateProspectCampaigns(log).catch((err) => {
      log.error({ err }, "scheduler/prospect-orchestrator: unhandled error");
    });
  });

  // Job 3: Monthly billing — day 5 of each month at 08:00
  cron.schedule("0 8 5 * *", () => {
    runMonthlyBilling(log).catch((err) => {
      log.error({ err }, "scheduler/billing: unhandled error");
    });
  });

  // Job 4: Lost deal reactivation — daily at 03:00
  cron.schedule("0 3 * * *", () => {
    runLostDealReactivation(log).catch((err) => {
      log.error({ err }, "scheduler/reactivation: unhandled error");
    });
  });

  // Job 5: Expiração de demos expiradas — daily at 06:00
  cron.schedule("0 6 * * *", () => {
    expireOldDemos(log).catch((err) => {
      log.error({ err }, "scheduler/demo-expiration: unhandled error");
    });
  });

  // Job 6: Reset demo tenants — daily at 02:00
  cron.schedule("0 2 * * *", () => {
    resetDemoTenants(log).catch((err) => {
      log.error({ err }, "scheduler/demo-reset: unhandled error");
    });
  });

  // Job 7: Special date check — daily at 07:00
  cron.schedule("0 7 * * *", () => {
    runSpecialDateCheck(log).catch((err) => {
      log.error({ err }, "scheduler/special-dates: unhandled error");
    });
  });

  // Job 7b: Pós-Venda inactivity check-in — daily at 09:30
  cron.schedule("30 9 * * *", () => {
    runInactivityCheck(log).catch((err) => {
      log.error({ err }, "scheduler/pos-venda-inactivity: unhandled error");
    });
  });

  // Job 8: Partner commission calculator — day 1 of each month at 06:00
  cron.schedule("0 6 1 * *", () => {
    runPartnerCommissions(log).catch((err) => {
      log.error({ err }, "scheduler/partner-commissions: unhandled error");
    });
  });

  // Job 9: Partner prospector — daily at 08:00
  cron.schedule("0 8 * * *", () => {
    runPartnerProspectorJob(log).catch((err) => {
      log.error({ err }, "scheduler/partner-prospector: unhandled error");
    });
  });

  // Job 10: Content flow executions — every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    processFlowExecutions(log).catch((err) => {
      log.error({ err }, "scheduler/content-flow: unhandled error");
    });
  });

  // Job 11: Blender render polling — every 30 seconds
  // Só ativa se BLENDER_SERVER_URL estiver configurado
  if (process.env.BLENDER_SERVER_URL) {
    setInterval(() => {
      pollPendingRenders(log).catch((err) => {
        log.error({ err }, "scheduler/blender-poll: unhandled error");
      });
    }, 30_000);
    log.info("scheduler/blender-poll: ativado (a cada 30s)");
  }

  // Job 12: Revenue Scout — daily at 09:00
  cron.schedule("0 9 * * *", () => {
    runRevenueScoutJob(log).catch((err) => {
      log.error({ err }, "scheduler/revenue-scout: unhandled error");
    });
  });

  // Job 12b: Content Autopilot — daily at 05:00 BRT (Criador→Otimizador→
  // Publicador pra keywords já aprovadas; nunca descobre keyword nova sozinho)
  cron.schedule("0 5 * * *", () => {
    runContentAutopilotJob(log).catch((err) => {
      log.error({ err }, "scheduler/content-autopilot: unhandled error");
    });
  }, { timezone: "America/Sao_Paulo" });

  // Job 13: Appointment reminders — every 30 minutes
  cron.schedule("*/30 * * * *", () => {
    runAppointmentReminders(log).catch((err) => {
      log.error({ err }, "scheduler/appointment-reminders: unhandled error");
    });
  });

  // Revisão de anúncios — a cada 10 minutos, independentemente da tela aberta
  cron.schedule("*/10 * * * *", () => {
    runAdsReviewSync(log).catch((err) => {
      log.error({ err }, "scheduler/ads-review-sync: unhandled error");
    });
  });

  // Proteção de gasto — a cada hora; apenas pausa quando o cliente autorizou.
  cron.schedule("25 * * * *", () => {
    runAdsWasteGuard(log).catch((err) => {
      log.error({ err }, "scheduler/ads-waste-guard: unhandled error");
    });
  });

  // Job 14: No-response closing message — daily at 09:30
  cron.schedule("30 9 * * *", () => {
    runNoResponseClosingMessage(log).catch((err) => {
      log.error({ err }, "scheduler/no-response-closing: unhandled error");
    });
  });

  // Job 15: Custom domain verification — every 5 minutes
  cron.schedule("*/5 * * * *", () => {
    runDomainVerification(log).catch((err) => {
      log.error({ err }, "scheduler/domain-verify: unhandled error");
    });
  });

  // Job 16: Automatic prospector sync — daily at 09:00 BRT
  cron.schedule("0 9 * * *", () => {
    runProspectorSync(log).catch((err) => {
      log.error({ err }, "scheduler/prospector-sync: unhandled error");
    });
  }, { timezone: "America/Sao_Paulo" });

  // Job 17: Prospector queue worker — every hour at :35 (processes pending items up to ritmo_diario)
  cron.schedule("35 * * * *", () => {
    runProspectorQueueWorker(log).catch((err) => {
      log.error({ err }, "scheduler/prospector-queue: unhandled error");
    });
  });

  // Job 18: Daily agenda summary & reminders — every day at 08:00 BRT
  cron.schedule("0 8 * * *", () => {
    runDailyAgendaSummary(log).catch((err) => {
      log.error({ err }, "scheduler/daily-agenda-summary: unhandled error");
    });
  }, { timezone: "America/Sao_Paulo" });

  // Job 19: SDR follow-up — every hour
  cron.schedule("0 * * * *", () => {
    runSdrFollowup(log).catch((err) => {
      log.error({ err }, "scheduler/sdr-followup: unhandled error");
    });
  });

  // Customer Intelligence V2: acompanhamento orientado por lacunas e risco — a cada 30 minutos.
  // Só atua em etapas explicitamente ativadas pelo admin.
  cron.schedule("*/30 * * * *", () => {
    runCustomerIntelligenceFollowup(log).catch((err) => {
      log.error({ err }, "scheduler/customer-intelligence-followup: unhandled error");
    });
  }, { timezone: "America/Sao_Paulo" });

  // Job 20 (Cmd 22): Objections extraction — daily at 02:30 BRT
  cron.schedule("30 2 * * *", () => {
    runObjectionsExtraction(log).catch((err) => {
      log.error({ err }, "scheduler/objections-extraction: unhandled error");
    });
  }, { timezone: "America/Sao_Paulo" });

  // Job 20b: Suporte ponta a ponta — every 30 minutes
  cron.schedule("*/30 * * * *", () => {
    runSupportLifecycle(log).catch((err) => {
      log.error({ err }, "scheduler/support-lifecycle: unhandled error");
    });
  }, { timezone: "America/Sao_Paulo" });

  // Job 20c: lembretes padronizados das demais atividades das pipelines
  cron.schedule("*/30 * * * *", () => {
    runPipelineActivityLifecycle(log).catch((err) => {
      log.error({ err }, "scheduler/pipeline-activity-lifecycle: unhandled error");
    });
  }, { timezone: "America/Sao_Paulo" });

  // Job 20d: ciclo de vida por estágio — Comercial, Execução, Aquecimento, Parceiros e Scout
  cron.schedule("*/30 * * * *", () => {
    runPipelineStageLifecycle(log).catch((err) => {
      log.error({ err }, "scheduler/pipeline-stage-lifecycle: unhandled error");
    });
  }, { timezone: "America/Sao_Paulo" });

  // Acompanhamento inteligente da jornada comercial — a cada 30 minutos.
  // Só processa etapas explicitamente ativadas pelo tenant.
  cron.schedule("*/30 * * * *", () => {
    runAcompanhamentoJornada(log).catch((err) => {
      log.error({ err }, "scheduler/acompanhamento-jornada: unhandled error");
    });
  }, { timezone: "America/Sao_Paulo" });

  // Job 21 (Cmd 22): Micro-events re-scan — every Monday at 03:30 BRT
  cron.schedule("30 3 * * 1", () => {
    runMicroEventsRescan(log).catch((err) => {
      log.error({ err }, "scheduler/micro-events: unhandled error");
    });
  }, { timezone: "America/Sao_Paulo" });

  // Job 22 (Cmd 23): Recém-abertas weekly scan — every Monday at 07:00 BRT
  cron.schedule("0 7 * * 1", () => {
    runRecemAbertas(log).catch((err) => {
      log.error({ err }, "scheduler/recem-abertas: unhandled error");
    });
  }, { timezone: "America/Sao_Paulo" });

  // Job 23: Weekly feedback loop — every Monday at 06:00 BRT
  cron.schedule("0 6 * * 1", () => {
    runWeeklyFeedbackLoop(log).catch((err) => {
      log.error({ err }, "scheduler/feedback-loop: unhandled error");
    });
  }, { timezone: "America/Sao_Paulo" });

  // Job 24: Ondas Praça.ai — consulta a configuração individual de cada tenant.
  // O minuto não define o horário de negócio; apenas detecta configurações vencidas
  // e a chave única tenant/data garante execução idempotente.
  cron.schedule("* * * * *", () => {
    processDuePickupWaves(log).catch((err) => {
      log.error({ err }, "scheduler/praca-pickup-waves: unhandled error");
    });
  });

  // Outbox logístico: envio e retentativa de notificações WhatsApp.
  cron.schedule("* * * * *", () => {
    processDeliveryNotificationOutbox(log).catch((err) => {
      log.error({ err }, "scheduler/praca-delivery-notifications: unhandled error");
    });
  });

  // Central executiva Praça.ai — detecta e encerra exceções a cada 5 minutos.
  cron.schedule("*/5 * * * *", () => {
    runPracaExceptionScan(log).catch((err) => {
      log.error({ err }, "scheduler/praca-exceptions: unhandled error");
    });
  });

  // Solicitações e lembrete único de avaliação pós-entrega — a cada 30 minutos.
  cron.schedule("*/30 * * * *", () => {
    runReviewRequests(log).catch((err) => {
      log.error({ err }, "scheduler/review-requests: unhandled error");
    });
  });

  log.info("scheduler: started (churn-check @:05, campaigns @:15, billing @day-5-08:00, reactivation @03:00, demo-expiration @06:00, demo-reset @02:00, special-dates @07:00, partner-commissions @day-1-06:00, partner-prospector @08:00, content-flow @*/5min, blender-poll @30s, revenue-scout @09:00, content-autopilot @05:00-BRT, appointment-reminders @*/30min, ads-review-sync @*/10min, ads-waste-guard @:25, no-response-closing @09:30, pos-venda-inactivity @09:30, domain-verify @*/5min, prospector-sync @09:00-BRT, prospector-queue @:35, daily-agenda-summary @08:00-BRT, sdr-followup @*/1h, objections-extraction @02:30-BRT, support-lifecycle @*/30min, micro-events @mon-03:30-BRT, recem-abertas @mon-07:00-BRT, feedback-loop @mon-06:00-BRT)");
}

// ── Job 16: Automatic prospector sync ─────────────────────────────────────────

async function runProspectorSync(log: Logger): Promise<void> {
  log.info("scheduler/prospector-sync: starting");

  const configs = await db
    .select()
    .from(prospectorConfigTable)
    .where(eq(prospectorConfigTable.ativo, true));

  if (configs.length === 0) {
    log.info("scheduler/prospector-sync: no active configs");
    return;
  }

  log.info({ count: configs.length }, "scheduler/prospector-sync: active configs found");

  let totalInserted = 0;
  let totalUpdated = 0;

  for (const config of configs) {
    try {
      if (!config.setor || !config.cidade) {
        log.warn({ tenantId: config.tenantId }, "scheduler/prospector-sync: setor or cidade missing — skipping");
        continue;
      }

      const query = `${config.setor} em ${config.cidade}`;
      log.info({ tenantId: config.tenantId, query }, "scheduler/prospector-sync: fetching places");

      const places = await searchAllPlaces(query, log);
      log.info({ tenantId: config.tenantId, found: places.length }, "scheduler/prospector-sync: places fetched");

      for (const place of places) {
        try {
          const [existing] = await db
            .select()
            .from(prospectorQueueTable)
            .where(
              and(
                eq(prospectorQueueTable.tenantId, config.tenantId),
                eq(prospectorQueueTable.placeId, place.placeId),
              ),
            )
            .limit(1);

          const dadosCompletos = !!(place.nomeEmpresa && (place.telefone || place.siteOficial));

          if (existing) {
            // Only update if new data fills missing fields
            const needsUpdate =
              (!existing.telefone && place.telefone) ||
              (!existing.website && place.siteOficial) ||
              (!existing.endereco && place.endereco) ||
              existing.dadosCompletos !== dadosCompletos;

            if (needsUpdate) {
              await db
                .update(prospectorQueueTable)
                .set({
                  nome:          place.nomeEmpresa ?? existing.nome,
                  telefone:      place.telefone ?? existing.telefone,
                  endereco:      place.endereco ?? existing.endereco,
                  website:       place.siteOficial ?? existing.website,
                  dadosCompletos,
                  updatedAt:     new Date(),
                })
                .where(eq(prospectorQueueTable.id, existing.id));
              totalUpdated++;
            }
          } else {
            await db.insert(prospectorQueueTable).values({
              tenantId:      config.tenantId,
              placeId:       place.placeId,
              nome:          place.nomeEmpresa ?? "Sem nome",
              telefone:      place.telefone,
              endereco:      place.endereco,
              setor:         config.setor,
              cidade:        config.cidade,
              website:       place.siteOficial,
              status:        "pendente",
              dadosCompletos,
            });
            totalInserted++;
          }
        } catch (err) {
          log.error({ err, placeId: place.placeId, tenantId: config.tenantId }, "scheduler/prospector-sync: place upsert failed (non-fatal)");
        }
      }

      log.info({ tenantId: config.tenantId, inserted: totalInserted, updated: totalUpdated }, "scheduler/prospector-sync: tenant done");
    } catch (err) {
      log.error({ err, tenantId: config.tenantId }, "scheduler/prospector-sync: tenant failed (non-fatal)");
    }
  }

  log.info({ totalInserted, totalUpdated }, "scheduler/prospector-sync: complete");
}

// ── Job 15: Custom domain verification ────────────────────────────────────────

async function runDomainVerification(log: Logger): Promise<void> {
  const pending = await db
    .select()
    .from(tenantDomainsTable)
    .where(inArray(tenantDomainsTable.status, ["pending_dns", "pending_ssl"]));

  if (pending.length === 0) return;

  const infrastructure = getCloudflareCustomDomainConfig();
  log.info(
    {
      count: pending.length,
      cloudflareApiConfigured: infrastructure.apiConfigured,
      cnameTargetConfigured: infrastructure.cnameTargetConfigured,
    },
    "scheduler/domain-verify: checking pending domains",
  );

  for (const domain of pending) {
    try {
      // Keep stored DNS instructions aligned with the current SaaS CNAME
      // target. This repairs rows created before the target was configured.
      const dns = getDnsInstructions(domain.domain);
      const dnsValue = dns.value || null;
      if (domain.dnsRecordName !== dns.name || domain.dnsRecordValue !== dnsValue) {
        await db
          .update(tenantDomainsTable)
          .set({
            dnsRecordName: dns.name,
            dnsRecordValue: dnsValue,
            updatedAt: new Date(),
          })
          .where(eq(tenantDomainsTable.id, domain.id));
        domain.dnsRecordName = dns.name;
        domain.dnsRecordValue = dnsValue;
      }

      let cf: Awaited<ReturnType<typeof getCustomHostname>>;

      if (domain.cloudflareCustomHostnameId) {
        cf = await getCustomHostname(domain.cloudflareCustomHostnameId);
      } else {
        // Previous behavior skipped these rows forever. Re-provision them
        // automatically once Cloudflare API credentials are available.
        if (!infrastructure.apiConfigured) {
          log.debug(
            { domainId: domain.id, domain: domain.domain },
            "scheduler/domain-verify: Cloudflare API not configured; waiting",
          );
          continue;
        }

        const provisioned = await createOrGetCustomHostname(domain.domain);
        cf = provisioned;

        await db
          .update(tenantDomainsTable)
          .set({
            cloudflareCustomHostnameId: provisioned.id,
            updatedAt: new Date(),
          })
          .where(eq(tenantDomainsTable.id, domain.id));

        domain.cloudflareCustomHostnameId = provisioned.id;
        log.info(
          { domainId: domain.id, domain: domain.domain },
          "scheduler/domain-verify: recovered missing Cloudflare hostname",
        );
      }

      let newStatus: "pending_dns" | "pending_ssl" | "active" | "failed";
      if (cf.status === "active" && cf.sslStatus === "active") {
        newStatus = "active";
      } else if (cf.status === "active") {
        newStatus = "pending_ssl";
      } else {
        newStatus = "pending_dns";
      }

      if (newStatus !== domain.status) {
        await db
          .update(tenantDomainsTable)
          .set({ status: newStatus, updatedAt: new Date() })
          .where(eq(tenantDomainsTable.id, domain.id));
        log.info(
          { domainId: domain.id, domain: domain.domain, status: newStatus },
          "scheduler/domain-verify: status updated",
        );
      }
    } catch (err) {
      log.warn(
        { err, domainId: domain.id },
        "scheduler/domain-verify: CF check/provisioning failed",
      );
    }
  }
}
// ── Job 6: Reset demo tenants ──────────────────────────────────

async function resetDemoTenants(log: Logger): Promise<void> {
  log.info("scheduler/demo-reset: starting");

  const demoTenants = await db
    .select({ id: tenantsTable.id, name: tenantsTable.name })
    .from(tenantsTable)
    .where(
      and(
        eq(tenantsTable.isDemo, true),
        eq(tenantsTable.status, "active")
      )
    );

  if (demoTenants.length === 0) {
    log.info("scheduler/demo-reset: no demo tenants found");
    return;
  }

  for (const tenant of demoTenants) {
    try {
      log.info({ tenantId: tenant.id }, "scheduler/demo-reset: resetting demo tenant");

      // Delete all tenant data (except tenant itself and user)
      await db.delete(agentTasksTable).where(eq(agentTasksTable.tenantId, tenant.id));
      await db.delete(messagesTable).where(eq(messagesTable.tenantId, tenant.id));
      await db.delete(conversationsTable).where(eq(conversationsTable.tenantId, tenant.id));
      await db.delete(activitiesTable).where(eq(activitiesTable.tenantId, tenant.id));
      await db.delete(dealsTable).where(eq(dealsTable.tenantId, tenant.id));
      await db.delete(propostasTable).where(eq(propostasTable.tenantId, tenant.id));
      await db.delete(customerIntelligenceTable).where(eq(customerIntelligenceTable.tenantId, tenant.id));
      await db.delete(leadsTable).where(eq(leadsTable.tenantId, tenant.id));
      await db.delete(inventoryItemsTable).where(eq(inventoryItemsTable.tenantId, tenant.id));
      await db.delete(produtosCatalogoTable).where(eq(produtosCatalogoTable.tenantId, tenant.id));
      await db.delete(agendasTable).where(eq(agendasTable.tenantId, tenant.id));
      await db.delete(agentActionsLogTable).where(eq(agentActionsLogTable.tenantId, tenant.id));
      await db.delete(intelligenceAnalysisLogTable).where(eq(intelligenceAnalysisLogTable.tenantId, tenant.id));
      await db.delete(campaignsTable).where(eq(campaignsTable.tenantId, tenant.id));
      await db.delete(planAssignmentLogTable).where(eq(planAssignmentLogTable.tenantId, tenant.id));
      await db.delete(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenant.id));
      await db.delete(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenant.id));

      // Re-seed
      const { seedDemoData } = await import("../routes/tenants.js");
      await seedDemoData(tenant.id);

      log.info({ tenantId: tenant.id }, "scheduler/demo-reset: demo tenant reset complete");
    } catch (err) {
      log.error({ err, tenantId: tenant.id }, "scheduler/demo-reset: failed to reset demo tenant");
    }
  }

  log.info({ count: demoTenants.length }, "scheduler/demo-reset: complete");
}
