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
import { and, desc, eq, gt, isNotNull, lte, gte, lt, inArray, sql } from "drizzle-orm";
import { runMonthlyBilling } from "../lib/billing.js";
import type { Logger } from "pino";
import {
  db,
  tenantsTable,
  campaignsTable,
  leadsTable,
  dealsTable,
  customerIntelligenceTable,
  agentConfigsTable,
  agentTasksTable,
  messagesTable,
  conversationsTable,
  propostasTable,
  activitiesTable,
  inventoryItemsTable,
  produtosCatalogoTable,
  agendasTable,
  agentActionsLogTable,
  intelligenceAnalysisLogTable,
  planAssignmentLogTable,
  businessProfilesTable,
  tenantCalendarSettingsTable,
  leadSpouseConsentTable,
  leadCampaignLogTable,
} from "@workspace/db";
import type { SegmentoFiltro } from "@workspace/db";
import { evaluateForLead } from "../routes/rules.js";
import { dispatchAgentBackground, processAgentInternal } from "../services/agent-dispatch.js";

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
      // Load agent config once per tenant (needed for autonomy check)
      const [agentConfig] = await db
        .select({ churnAutoWhatsapp: agentConfigsTable.churnAutoWhatsapp })
        .from(agentConfigsTable)
        .where(eq(agentConfigsTable.tenantId, tenant.id))
        .limit(1);

      const isAutonomous = !!agentConfig?.churnAutoWhatsapp;

      // Find leads with churnRisk > 70 (limit 200 per tenant for safety)
      const highRiskRows = await db
        .select({
          leadId:    customerIntelligenceTable.leadId,
          churnRisk: customerIntelligenceTable.churnRisk,
          telefone:  leadsTable.telefone,
        })
        .from(customerIntelligenceTable)
        .innerJoin(leadsTable, eq(leadsTable.id, customerIntelligenceTable.leadId))
        .where(
          and(
            eq(customerIntelligenceTable.tenantId, tenant.id),
            gt(customerIntelligenceTable.churnRisk, 70)
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

        // ── 2. Automatic WhatsApp follow-up (only when autonomous + has telefone) ──
        if (!isAutonomous || !row.telefone) continue;

        try {
          // Dedup: skip if there's already been an outgoing whatsapp in the last 24h for this lead
          const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
          const [recentOutgoing] = await db
            .select({ id: messagesTable.id })
            .from(messagesTable)
            .where(
              and(
                eq(messagesTable.tenantId, tenant.id),
                eq(messagesTable.leadId, row.leadId),
                eq(messagesTable.direcao, "saida"),
                eq(messagesTable.canal, "whatsapp"),
                gt(messagesTable.createdAt, cutoff)
              )
            )
            .limit(1);

          if (recentOutgoing) {
            log.info({ leadId: row.leadId }, "scheduler/churn-check: recent whatsapp found — skipping auto-dispatch");
            continue;
          }

          // Dispatch reactivation agent proactively via WhatsApp
          dispatchAgentBackground({
            tenantId: tenant.id,
            leadId:   row.leadId,
            mensagem: "PROATIVO: reativação automática — churn risk elevado, lead sem contato recente.",
            log,
          });

          totalAutoWpp++;
          log.info({ leadId: row.leadId, churnRisk: row.churnRisk }, "scheduler/churn-check: auto whatsapp dispatched");
        } catch (err) {
          log.error({ err, tenantId: tenant.id, leadId: row.leadId }, "scheduler/churn-check: auto whatsapp dispatch failed (non-fatal)");
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

      if (leadIds.length === 0) {
        log.info({ campaignId: campaign.id, tenantId: campaign.tenantId }, "scheduler/campaigns: no matching leads, marking concluida");
        await db
          .update(campaignsTable)
          .set({ status: "concluida", totalDestinatarios: 0, totalEnviados: 0, updatedAt: new Date() })
          .where(eq(campaignsTable.id, campaign.id));
        continue;
      }

      log.info({ campaignId: campaign.id, leadCount: leadIds.length }, "scheduler/campaigns: creating tasks");

      // Create one agent_task per lead
      const dispatchTime = new Date();
      let enviados = 0;

      for (const leadId of leadIds) {
        try {
          const [task] = await db
            .insert(agentTasksTable)
            .values({
              tenantId:   campaign.tenantId,
              leadId,
              agentName:  "sdr",
              actionType: "enviar_whatsapp",
              payload: {
                leadId,
                conteudo:   campaign.mensagem,
                agentName:  "sdr",
                canal:      campaign.tipo === "whatsapp" ? "whatsapp" : "whatsapp",
                campaignId: campaign.id,
              },
              status:     isAutonomous ? "executando" : "pendente_aprovacao",
              ...(isAutonomous && { executedAt: dispatchTime }),
            })
            .returning();

          if (isAutonomous) {
            // Execute immediately — import inline to avoid circular dep at module load
            const { executeTaskAction } = await import("../routes/agent_tasks.js");
            await executeTaskAction(task, log);

            // ── Anti-ban: delay entre disparos de campanha ──────────────────
            // Intervalo aleatório de 4–9 s para imitar cadência humana e evitar
            // que a conta seja sinalizada por envio em rajada pelo Z-API.
            const delayMs = 4000 + Math.floor(Math.random() * 5000);
            log.debug({ delayMs, leadId }, "scheduler/campaigns: anti-ban delay");
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

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // Fetch ALL lost deals with leadId, ordered by most recent lostAt first.
  // Then deduplicate by lead so we keep the most recent loss per lead
  // (regardless of age), and only after deduplication filter by >30 days.
  const allLostDeals = await db
    .select({
      dealId: dealsTable.id,
      leadId: dealsTable.leadId,
      tenantId: dealsTable.tenantId,
      lostAt: dealsTable.lostAt,
    })
    .from(dealsTable)
    .where(
      and(
        eq(dealsTable.etapa, "perdido"),
        isNotNull(dealsTable.leadId),
        isNotNull(dealsTable.lostAt)
      )
    )
    .orderBy(desc(dealsTable.lostAt));

  // Deduplicate by lead: keep the most recent lost deal per lead
  const byLead = new Map<string, typeof allLostDeals[0]>();
  for (const d of allLostDeals) {
    const leadId = d.leadId!;
    if (!byLead.has(leadId)) {
      byLead.set(leadId, d);
    }
  }

  if (byLead.size === 0) {
    log.debug("scheduler/reactivation: no lost deals found");
    return;
  }

  // Filter to only leads whose most recent lost deal is >=30 days old
  const readyDeals: typeof allLostDeals[0][] = [];
  for (const deal of byLead.values()) {
    if (deal.lostAt && deal.lostAt <= thirtyDaysAgo) {
      readyDeals.push(deal);
    }
  }

  if (readyDeals.length === 0) {
    log.debug("scheduler/reactivation: no deals ready for reactivation (most recent loss <30 days)");
    return;
  }

  let requeued = 0;
  let dispatched = 0;

  for (const deal of readyDeals) {
    const leadId = deal.leadId!;
    try {
      // Check if lead already requeued
      const [lead] = await db
        .select({ status: leadsTable.status, tenantId: leadsTable.tenantId })
        .from(leadsTable)
        .where(eq(leadsTable.id, leadId))
        .limit(1);

      if (!lead || lead.status === "aquecimento") {
        log.info({ leadId, dealId: deal.dealId }, "scheduler/reactivation: skip — lead already in aquecimento");
        continue;
      }

      // Verify lead belongs to same tenant as deal
      if (lead.tenantId !== deal.tenantId) {
        log.warn({ leadId, dealId: deal.dealId }, "scheduler/reactivation: tenant mismatch — skipping");
        continue;
      }

      // Update lead to aquecimento
      await db
        .update(leadsTable)
        .set({ status: "aquecimento", updatedAt: new Date() })
        .where(eq(leadsTable.id, leadId));
      requeued++;
      log.info({ leadId, dealId: deal.dealId }, "scheduler/reactivation: lead requeued to aquecimento");

      // Dispatch reactivation agent (forced)
      dispatchAgentBackground({
        tenantId: deal.tenantId,
        leadId,
        mensagem: "PROATIVO: reativação automática — deal perdido há mais de 30 dias, tentando reengajamento.",
        forcedAgent: "reactivation",
        log,
      });
      dispatched++;
      log.info({ leadId, dealId: deal.dealId }, "scheduler/reactivation: reactivation agent dispatched");
    } catch (err) {
      log.error({ err, leadId, dealId: deal.dealId }, "scheduler/reactivation: lead failed (non-fatal)");
    }
  }

  log.info({ readyDeals: readyDeals.length, leadsRequeued: requeued, agentsDispatched: dispatched }, "scheduler/reactivation: complete");
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
  return [
    { name: "Ano Novo", active: false, daysBeforeToSend: 1, month: 1, day: 1 },
    { name: "Carnaval", active: false, daysBeforeToSend: 3, movableDate: true },
    { name: "Páscoa", active: true, daysBeforeToSend: 3, movableDate: true },
    { name: "Dia das Mães", active: true, daysBeforeToSend: 3, movableDate: true, targetGender: "feminino" },
    { name: "Dia dos Pais", active: true, daysBeforeToSend: 3, movableDate: true, targetGender: "masculino" },
    { name: "Dia das Crianças", active: true, daysBeforeToSend: 3, movableDate: true },
    { name: "Dia dos Namorados", active: true, daysBeforeToSend: 3, movableDate: true },
    { name: "Natal", active: true, daysBeforeToSend: 5, movableDate: true },
    { name: "Black Friday", active: true, daysBeforeToSend: 1, movableDate: true },
  ];
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

      const commercialDates = calendarSettings?.commercialDates ?? getDefaultCommercialDates();

      const catalog = await db
        .select({ id: produtosCatalogoTable.id, nome: produtosCatalogoTable.nome, categoria: produtosCatalogoTable.categoria, precoBase: produtosCatalogoTable.precoBase })
        .from(produtosCatalogoTable)
        .where(and(eq(produtosCatalogoTable.tenantId, tenant.id), eq(produtosCatalogoTable.ativo, true)))
        .limit(10);

      const leads = await db
        .select()
        .from(leadsTable)
        .where(eq(leadsTable.tenantId, tenant.id))
        .limit(500);

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
        if (lead.birthMonth === todayMonth && lead.birthDay === todayDay) {
          const campaignKey = `birthday-lead-${yearStr}-${todayMonth.toString().padStart(2, "0")}-${todayDay.toString().padStart(2, "0")}`;
          scenario = { type: "birthday_lead", catalog, campaignKey };
        }

        // Spouse birthday
        if (!scenario && lead.conjugeDataNascimento) {
          const parts = lead.conjugeDataNascimento.split("-");
          if (parts.length >= 3) {
            const m = parseInt(parts[1], 10);
            const d = parseInt(parts[2], 10);
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
              const parts = f.dataNascimento.split("-");
              if (parts.length >= 3) {
                const m = parseInt(parts[1], 10);
                const d = parseInt(parts[2], 10);
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

        // 1. Try to insert dedup record (unique constraint on tenantId+leadId+campaignKey+year)
        let inserted = false;
        try {
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
            .returning({ id: leadCampaignLogTable.id });
          inserted = !!logRow;
        } catch (err) {
          // Unique constraint violation = already handled this event
          totalSkipped++;
          continue;
        }
        if (!inserted) {
          totalSkipped++;
          continue;
        }

        // 2. Dispatch synchronously (await processAgentInternal) so we know success/failure
        let dispatchOk = false;
        try {
          await processAgentInternal({
            tenantId: tenant.id,
            leadId: lead.id,
            mensagem: `PROATIVO: ${scenario.type === "birthday_lead" ? "aniversário do lead" : scenario.type === "birthday_family" ? `aniversário de ${scenario.recipientName}` : scenario.type === "deal_anniversary" ? "aniversário de fechamento do deal" : scenario.type === "commercial_date" ? `campanha de ${scenario.dateName}` : "relacionamento"}.`,
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
          dispatchOk = true;
        } catch (err) {
          log.warn({ err, leadId: lead.id, tenantId: tenant.id, campaignKey: scenario.campaignKey }, "scheduler/special-dates: dispatch failed");
        }

        // 3. Update log with actual outcome
        if (dispatchOk) {
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
            .set({ status: "failed" })
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

export function startScheduler(log: Logger): void {
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

  log.info("scheduler: started (churn-check @:05, campaigns @:15, billing @day-5-08:00, reactivation @03:00, demo-expiration @06:00, demo-reset @02:00, special-dates @07:00)");
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
