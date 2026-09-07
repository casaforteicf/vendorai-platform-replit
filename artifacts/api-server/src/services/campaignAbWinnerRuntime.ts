import { eq } from "drizzle-orm";
import { campaignsTable, db, tenantsTable } from "@workspace/db";
import { applyCampaignAbWinner } from "./campaignAbWinner.js";
import { resolveMarketingAgentAutonomyPolicy } from "./marketingAgentAutonomyPolicy.js";

const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;
const INTERVAL_MS = 60 * 60 * 1000;
const MAX_CAMPAIGNS_PER_CYCLE = 100;

type RuntimeState = {
  started: boolean;
  timer?: ReturnType<typeof setInterval>;
  startup?: ReturnType<typeof setTimeout>;
};

declare global {
  // eslint-disable-next-line no-var
  var __vendoraiMarketingAbWinnerRuntime: RuntimeState | undefined;
}

async function runCycle() {
  const [tenants, campaigns] = await Promise.all([
    db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.status, "active")),
    db
      .select({ id: campaignsTable.id, tenantId: campaignsTable.tenantId })
      .from(campaignsTable)
      .where(eq(campaignsTable.abTestEnabled, 1))
      .limit(MAX_CAMPAIGNS_PER_CYCLE),
  ]);
  const activeTenantIds = new Set(tenants.map((tenant) => tenant.id));

  for (const campaign of campaigns) {
    if (!activeTenantIds.has(campaign.tenantId)) continue;
    try {
      const policy = await resolveMarketingAgentAutonomyPolicy(campaign.tenantId);
      if (!policy.canOperateFull) continue;
      await applyCampaignAbWinner({
        tenantId: campaign.tenantId,
        campaignId: campaign.id,
        authorization: "agent-autonomous",
      });
    } catch (err) {
      console.warn("marketing-ab-winner-runtime: campaign preserved after failure", {
        tenantId: campaign.tenantId,
        campaignId: campaign.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

function startRuntime() {
  const state = globalThis.__vendoraiMarketingAbWinnerRuntime ?? { started: false };
  if (state.started) return;
  state.started = true;
  state.startup = setTimeout(() => { void runCycle(); }, FIRST_RUN_DELAY_MS);
  state.timer = setInterval(() => { void runCycle(); }, INTERVAL_MS);
  globalThis.__vendoraiMarketingAbWinnerRuntime = state;
}

startRuntime();
