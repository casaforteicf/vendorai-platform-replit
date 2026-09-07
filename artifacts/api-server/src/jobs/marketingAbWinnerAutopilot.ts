import { and, eq } from "drizzle-orm";
import type { Logger } from "pino";
import { campaignsTable, db, tenantsTable } from "@workspace/db";
import { applyCampaignAbWinner } from "../services/campaignAbWinner.js";
import { resolveMarketingAgentAutonomyPolicy } from "../services/marketingAgentAutonomyPolicy.js";

const MAX_CAMPAIGNS_PER_CYCLE = 100;

/**
 * Fecha testes A/B apenas quando o tenant escolheu N4 e o avaliador já
 * encontrou um vencedor pelos guardrails existentes. Sem vencedor, não muda nada.
 */
export async function runMarketingAbWinnerAutopilot(log: Logger): Promise<void> {
  const [tenants, campaigns] = await Promise.all([
    db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.status, "active")),
    db
      .select({ id: campaignsTable.id, tenantId: campaignsTable.tenantId })
      .from(campaignsTable)
      .where(eq(campaignsTable.abTestEnabled, 1))
      .limit(MAX_CAMPAIGNS_PER_CYCLE),
  ]);

  const activeTenants = new Set(tenants.map((tenant) => tenant.id));
  let evaluated = 0;
  let applied = 0;
  let skippedPolicy = 0;
  let inconclusive = 0;
  let failures = 0;

  for (const campaign of campaigns) {
    if (!activeTenants.has(campaign.tenantId)) continue;
    evaluated++;
    try {
      const policy = await resolveMarketingAgentAutonomyPolicy(campaign.tenantId);
      if (!policy.canOperateFull) {
        skippedPolicy++;
        continue;
      }

      const result = await applyCampaignAbWinner({
        tenantId: campaign.tenantId,
        campaignId: campaign.id,
        authorization: "agent-autonomous",
      });
      if (result.applied) {
        applied++;
        log.info({
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          winner: result.winner,
        }, "scheduler/marketing-ab-winner: vencedor promovido automaticamente");
      } else {
        inconclusive++;
      }
    } catch (err) {
      failures++;
      log.warn({ err, tenantId: campaign.tenantId, campaignId: campaign.id }, "scheduler/marketing-ab-winner: campanha preservada após falha");
    }
  }

  log.info({ evaluated, applied, skippedPolicy, inconclusive, failures }, "scheduler/marketing-ab-winner: cycle complete");
}
