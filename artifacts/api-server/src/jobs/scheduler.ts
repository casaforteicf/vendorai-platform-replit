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
import { and, eq, gt, isNotNull, lte, gte, lt, inArray, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  tenantsTable,
  campaignsTable,
  leadsTable,
  customerIntelligenceTable,
  agentConfigsTable,
  agentTasksTable,
} from "@workspace/db";
import type { SegmentoFiltro } from "@workspace/db";
import { evaluateForLead } from "../routes/rules.js";

// ── Job 1: Churn check ────────────────────────────────────────────────────────

async function runChurnCheckAll(log: Logger): Promise<void> {
  log.info("scheduler/churn-check: starting");

  // Get all active tenants
  const tenants = await db
    .select({ id: tenantsTable.id, slug: tenantsTable.slug })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  log.info({ count: tenants.length }, "scheduler/churn-check: tenants found");

  let totalLeads     = 0;
  let totalTriggered = 0;

  for (const tenant of tenants) {
    try {
      // Find leads with churnRisk > 70 (limit 200 per tenant for safety)
      const highRiskRows = await db
        .select({
          leadId:    customerIntelligenceTable.leadId,
          churnRisk: customerIntelligenceTable.churnRisk,
        })
        .from(customerIntelligenceTable)
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
      }

      log.info({ tenantId: tenant.id, slug: tenant.slug, leadsProcessed: highRiskRows.length }, "scheduler/churn-check: tenant done");
    } catch (err) {
      log.error({ err, tenantId: tenant.id }, "scheduler/churn-check: tenant failed (non-fatal)");
    }
  }

  log.info({ totalLeads, totalTriggered }, "scheduler/churn-check: complete");
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

// ── Scheduler bootstrap ───────────────────────────────────────────────────────

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

  log.info("scheduler: started (churn-check @:05, campaigns @:15 every hour)");
}
