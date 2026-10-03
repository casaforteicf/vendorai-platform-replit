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
