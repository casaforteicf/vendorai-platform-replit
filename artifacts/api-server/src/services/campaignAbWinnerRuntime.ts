import { asc, desc, eq } from "drizzle-orm";
import { campaignsTable, db, tenantsTable } from "@workspace/db";
import type { Logger } from "pino";
import { applyCampaignAbWinner } from "./campaignAbWinner.js";
import { resolveMarketingAgentAutonomyPolicy } from "./marketingAgentAutonomyPolicy.js";

const BATCH_SIZE = 100;

async function processCampaign(
  campaign: { id: string; tenantId: string },
  activeTenantIds: Set<string>,
  log: Logger,
) {
  if (!activeTenantIds.has(campaign.tenantId)) return;
  try {
    const policy = await resolveMarketingAgentAutonomyPolicy(campaign.tenantId);
    if (!policy.canOperateFull) return;
    await applyCampaignAbWinner({
      tenantId: campaign.tenantId,
      campaignId: campaign.id,
      authorization: "agent-autonomous",
    });
  } catch (error) {
    log.warn({
      error,
      tenantId: campaign.tenantId,
      campaignId: campaign.id,
    }, "marketing-ab-winner-runtime: campanha preservada após falha");
  }
}

/**
 * Executa uma rodada do autopiloto A/B.
 *
 * Deliberadamente não agenda timers e não possui side effects de importação.
 * O ciclo é orquestrado pelo bootstrap central da API, junto dos demais jobs.
 */
export async function runCampaignAbWinnerCycle(log: Logger): Promise<void> {
  const tenants = await db
    .select({ id: tenantsTable.id })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));
  const activeTenantIds = new Set(tenants.map((tenant) => tenant.id));

  let offset = 0;
  let processed = 0;

  while (true) {
    const campaigns = await db
      .select({
        id: campaignsTable.id,
        tenantId: campaignsTable.tenantId,
      })
      .from(campaignsTable)
      .where(eq(campaignsTable.abTestEnabled, 1))
      .orderBy(desc(campaignsTable.updatedAt), asc(campaignsTable.id))
      .limit(BATCH_SIZE)
      .offset(offset);

    if (campaigns.length === 0) break;

    for (const campaign of campaigns) {
      await processCampaign(campaign, activeTenantIds, log);
      processed += 1;
    }

    if (campaigns.length < BATCH_SIZE) break;
    offset += campaigns.length;
  }

  log.info({ processed }, "marketing-ab-winner-runtime: ciclo concluído");
}
