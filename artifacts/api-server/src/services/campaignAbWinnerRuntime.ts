import { asc, desc, eq } from "drizzle-orm";
import { campaignsTable, db, tenantsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { applyCampaignAbWinner } from "./campaignAbWinner.js";
import { resolveMarketingAgentAutonomyPolicy } from "./marketingAgentAutonomyPolicy.js";

const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;
const INTERVAL_MS = 60 * 60 * 1000;
const BATCH_SIZE = 100;

type RuntimeState = {
  started: boolean;
  timer?: ReturnType<typeof setInterval>;
  startup?: ReturnType<typeof setTimeout>;
};

declare global {
  // eslint-disable-next-line no-var
  var __vendoraiMarketingAbWinnerRuntime: RuntimeState | undefined;
}

async function processCampaign(campaign: { id: string; tenantId: string }, activeTenantIds: Set<string>) {
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
    logger.warn({
      error,
      tenantId: campaign.tenantId,
      campaignId: campaign.id,
    }, "marketing-ab-winner-runtime: campanha preservada após falha");
  }
}

async function runCycle() {
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
      await processCampaign(campaign, activeTenantIds);
      processed += 1;
    }

    if (campaigns.length < BATCH_SIZE) break;
    offset += campaigns.length;
  }

  logger.info({ processed }, "marketing-ab-winner-runtime: ciclo concluído");
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
