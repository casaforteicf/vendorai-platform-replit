import { and, eq, sql } from "drizzle-orm";
import type { Logger } from "pino";
import { adCampaignsTable, adPerformanceSnapshotsTable, db } from "@workspace/db";
import { setGoogleAdsCampaignStatus } from "../services/google-ads-campaign-publish.js";
import { setMetaAdsCampaignStatus } from "../services/meta-ads-campaign-publish.js";

/**
 * Proteção autorizada pelo cliente: pausa campanhas que alcançaram o limite
 * definido sem registrar conversão. Nunca aumenta orçamento nem reativa.
 */
export async function runAdsWasteGuard(log: Logger): Promise<void> {
  const campaigns = await db.select().from(adCampaignsTable)
    .where(eq(adCampaignsTable.status, "ativo"))
    .limit(500);

  for (const campaign of campaigns) {
    const automation = campaign.segmentacao?.campaignControl?.automation;
    const limit = Number(automation?.spendWithoutResultLimit ?? 0);
    if (!automation?.autoPauseNoResults || !Number.isFinite(limit) || limit <= 0 || !campaign.externalCampaignId) continue;

    try {
      const [totals] = await db.select({
        spend: sql<string>`coalesce(sum(${adPerformanceSnapshotsTable.custo}), 0)`,
        conversions: sql<number>`coalesce(sum(${adPerformanceSnapshotsTable.conversoesPlataforma}), 0)`,
      }).from(adPerformanceSnapshotsTable)
        .where(eq(adPerformanceSnapshotsTable.campaignId, campaign.id));

      const spend = Number(totals?.spend ?? 0);
      const conversions = Number(totals?.conversions ?? 0);
      if (spend < limit || conversions > 0) continue;

      if (campaign.plataforma === "google") {
        await setGoogleAdsCampaignStatus(campaign.tenantId, campaign.id, false);
      } else if (campaign.plataforma === "meta") {
        await setMetaAdsCampaignStatus(campaign.tenantId, campaign.id, false);
      } else {
        continue;
      }

      const segmentacao = {
        ...campaign.segmentacao,
        campaignControl: {
          ...campaign.segmentacao!.campaignControl!,
          automation: {
            ...automation,
            lastAutoPause: {
              at: new Date().toISOString(),
              spend,
              reason: "Limite de gasto sem conversão atingido",
            },
          },
        },
      };
      await db.update(adCampaignsTable).set({ segmentacao, updatedAt: new Date() })
        .where(and(eq(adCampaignsTable.id, campaign.id), eq(adCampaignsTable.tenantId, campaign.tenantId)));
      log.warn({ campaignId: campaign.id, spend, limit }, "scheduler/ads-waste-guard: campaign paused");
    } catch (err) {
      log.error({ err, campaignId: campaign.id }, "scheduler/ads-waste-guard: campaign failed (non-fatal)");
    }
  }
}
