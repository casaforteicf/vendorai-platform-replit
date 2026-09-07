import { asc, desc, eq, sql } from "drizzle-orm";
import { campaignsTable, db, tenantsTable } from "@workspace/db";
import type { Logger } from "pino";
import { applyCampaignAbWinner } from "./campaignAbWinner.js";
import { resolveMarketingAgentAutonomyPolicy } from "./marketingAgentAutonomyPolicy.js";

const BATCH_SIZE = 100;
const DISTRIBUTED_LOCK_KEY = "vendorai:marketing:ab-winner-cycle:v1";

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
 * O lock advisory transacional é compartilhado por todas as instâncias que
 * usam o mesmo PostgreSQL. Se outra instância já estiver processando o ciclo,
 * esta rodada sai sem esperar. O PostgreSQL libera o lock automaticamente ao
 * fim da transação, inclusive em caso de erro ou encerramento da conexão.
 */
export async function runCampaignAbWinnerCycle(log: Logger): Promise<void> {
  await db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ acquired: boolean }>(sql`
      select pg_try_advisory_xact_lock(hashtext(${DISTRIBUTED_LOCK_KEY})) as acquired
    `);
    const acquired = Boolean(lockResult.rows?.[0]?.acquired);

    if (!acquired) {
      log.info("marketing-ab-winner-runtime: ciclo ignorado; outra instância possui o lock");
      return;
    }

    const tenants = await tx
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(eq(tenantsTable.status, "active"));
    const activeTenantIds = new Set(tenants.map((tenant) => tenant.id));

    // Captura uma lista estável antes de começar a aplicar vencedores. Isso
    // evita saltos de paginação quando uma campanha é desativada durante o
    // próprio ciclo após a promoção da variante vencedora.
    const campaigns = await tx
      .select({
        id: campaignsTable.id,
        tenantId: campaignsTable.tenantId,
      })
      .from(campaignsTable)
      .where(eq(campaignsTable.abTestEnabled, 1))
      .orderBy(desc(campaignsTable.updatedAt), asc(campaignsTable.id));

    let processed = 0;
    for (let start = 0; start < campaigns.length; start += BATCH_SIZE) {
      const batch = campaigns.slice(start, start + BATCH_SIZE);
      for (const campaign of batch) {
        await processCampaign(campaign, activeTenantIds, log);
        processed += 1;
      }
    }

    log.info(
      { processed, totalEligible: campaigns.length },
      "marketing-ab-winner-runtime: ciclo concluído com lock distribuído",
    );
  });
}
