import { isNotNull } from "drizzle-orm";
import type { Logger } from "pino";
import { adCampaignsTable, db } from "@workspace/db";
import { syncGoogleAdsReviewStatus } from "../services/google-ads-campaign-publish.js";
import { syncMetaAdsReviewStatus } from "../services/meta-ads-campaign-publish.js";

/**
 * Consulta as plataformas mesmo quando ninguém está com a tela de Anúncios aberta.
 * Estados finais aprovados/reprovados continuam sendo consultados para detectar
 * alterações posteriores feitas diretamente no Google/Meta.
 */
export async function runAdsReviewSync(log: Logger): Promise<void> {
  const campaigns = await db
    .select({
      id: adCampaignsTable.id,
      tenantId: adCampaignsTable.tenantId,
      plataforma: adCampaignsTable.plataforma,
    })
    .from(adCampaignsTable)
    .where(isNotNull(adCampaignsTable.externalCampaignId))
    .limit(500);

  if (campaigns.length === 0) return;

  let synced = 0;
  let failed = 0;
  for (const campaign of campaigns) {
    try {
      if (campaign.plataforma === "google") {
        await syncGoogleAdsReviewStatus(campaign.tenantId, campaign.id);
      } else if (campaign.plataforma === "meta") {
        await syncMetaAdsReviewStatus(campaign.tenantId, campaign.id);
      } else {
        continue;
      }
      synced++;
    } catch (err) {
      failed++;
      log.warn(
        { err, campaignId: campaign.id, tenantId: campaign.tenantId, plataforma: campaign.plataforma },
        "scheduler/ads-review-sync: campaign sync failed (non-fatal)",
      );
    }
  }

  log.info({ found: campaigns.length, synced, failed }, "scheduler/ads-review-sync: complete");
}
