import { and, eq, sql } from "drizzle-orm";
import type { Logger } from "pino";
import { adCampaignsTable, adPerformanceSnapshotsTable, db, dealsTable, leadsTable } from "@workspace/db";
import { fetchGoogleAdsCampaignPerformance, setGoogleAdsCampaignStatus } from "../services/google-ads-campaign-publish.js";
import { fetchMetaAdsCampaignPerformance, setMetaAdsCampaignStatus } from "../services/meta-ads-campaign-publish.js";
import { setPlatformCampaignDailyBudget } from "../services/adBudgetControl.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";

const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

function mediaPlanId(campaign: typeof adCampaignsTable.$inferSelect): string | null {
  const value = (campaign.segmentacao as any)?.marketingContext?.mediaPlanId;
  return typeof value === "string" && value ? value : null;
}

function lastBudgetAdjustmentAt(campaign: typeof adCampaignsTable.$inferSelect): number {
  const value = (campaign.segmentacao as any)?.campaignControl?.automation?.lastBudgetAdjustment?.at;
  const time = typeof value === "string" ? new Date(value).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

async function campaignMetrics(campaign: typeof adCampaignsTable.$inferSelect) {
  const [platform] = await db.select({
    spend: sql<string>`coalesce(sum(${adPerformanceSnapshotsTable.custo}), 0)`,
  }).from(adPerformanceSnapshotsTable)
    .where(eq(adPerformanceSnapshotsTable.campaignId, campaign.id));

  const [leadStats] = await db.select({ total: sql<number>`count(*)` })
    .from(leadsTable)
    .where(eq(leadsTable.adCampaignId, campaign.id));

  const [sales] = await db.select({
    total: sql<number>`count(*)`,
    revenue: sql<string>`coalesce(sum(${dealsTable.valor}), 0)`,
  }).from(dealsTable)
    .innerJoin(leadsTable, eq(dealsTable.leadId, leadsTable.id))
    .where(and(eq(leadsTable.adCampaignId, campaign.id), eq(dealsTable.etapa, "ganho")));

  const spend = Number(platform?.spend ?? 0);
  const leads = Number(leadStats?.total ?? 0);
  const salesCount = Number(sales?.total ?? 0);
  const revenue = Number(sales?.revenue ?? 0);
  const totalBudget = Number((campaign.segmentacao as any)?.campaignControl?.totalBudget ?? 0);
  const dailyBudget = Number(campaign.orcamentoDiario);
  const remainingBudget = Math.max(0, totalBudget - spend);
  const roas = spend > 0 ? revenue / spend : revenue > 0 ? revenue : 0;
  const leadEfficiency = leads > 0 ? leads / Math.max(spend, 1) : 0;
  const score = salesCount > 0 ? 100 + salesCount * 20 + roas * 10 : leads > 0 ? 10 + leads * 2 + leadEfficiency * 50 : -spend;
  return { spend, leads, sales: salesCount, revenue, totalBudget, dailyBudget, remainingBudget, roas, score };
}

async function setStatus(campaign: typeof adCampaignsTable.$inferSelect, active: boolean) {
  if (campaign.plataforma === "google") {
    await setGoogleAdsCampaignStatus(campaign.tenantId, campaign.id, active);
  } else if (campaign.plataforma === "meta") {
    await setMetaAdsCampaignStatus(campaign.tenantId, campaign.id, active);
  }
}

async function runBudgetRedistribution(log: Logger): Promise<void> {
  const campaigns = await db.select().from(adCampaignsTable)
    .where(eq(adCampaignsTable.status, "ativo"))
    .limit(500);

  const groups = new Map<string, typeof campaigns>();
  for (const campaign of campaigns) {
    if (!campaign.externalCampaignId || (campaign.plataforma !== "google" && campaign.plataforma !== "meta")) continue;
    const planId = mediaPlanId(campaign);
    const control = (campaign.segmentacao as any)?.campaignControl;
    if (!planId || !control || Number(control.totalBudget ?? 0) <= 0 || Number(campaign.orcamentoDiario) <= 0) continue;
    const list = groups.get(planId) ?? [];
    list.push(campaign);
    groups.set(planId, list);
  }

  for (const [planId, group] of groups) {
    if (group.length < 2) continue;
    try {
      const rows = await Promise.all(group.map(async (campaign) => ({ campaign, metrics: await campaignMetrics(campaign) })));
      const now = Date.now();
      const eligible = rows.filter(({ campaign, metrics }) =>
        metrics.remainingBudget >= 10
        && metrics.dailyBudget >= 5
        && now - lastBudgetAdjustmentAt(campaign) >= SIX_HOURS_MS,
      );
      if (eligible.length < 2) continue;

      const ranked = [...eligible].sort((a, b) => b.metrics.score - a.metrics.score);
      const winner = ranked[0];
      const donor = ranked[ranked.length - 1];
      if (!winner || !donor || winner.campaign.id === donor.campaign.id) continue;

      const hasEvidence = winner.metrics.sales > donor.metrics.sales
        || winner.metrics.leads >= donor.metrics.leads + 2
        || (winner.metrics.revenue > 0 && winner.metrics.roas >= Math.max(1.5, donor.metrics.roas * 1.25));
      if (!hasEvidence) continue;

      const transfer = Math.round(Math.min(
        donor.metrics.remainingBudget * 0.10,
        donor.metrics.totalBudget * 0.10,
        Math.max(0, winner.metrics.totalBudget * 0.20),
      ) * 100) / 100;
      if (transfer < 5) continue;

      const maxDailyDelta = Math.max(1, donor.metrics.dailyBudget * 0.15);
      const dailyDelta = Math.round(Math.min(maxDailyDelta, transfer / 7) * 100) / 100;
      const donorDaily = Math.round(Math.max(1, donor.metrics.dailyBudget - dailyDelta) * 100) / 100;
      const winnerDaily = Math.round((winner.metrics.dailyBudget + (donor.metrics.dailyBudget - donorDaily)) * 100) / 100;
      if (donorDaily >= donor.metrics.dailyBudget || winnerDaily <= winner.metrics.dailyBudget) continue;

      await setPlatformCampaignDailyBudget(donor.campaign.tenantId, donor.campaign.id, donorDaily);
      try {
        await setPlatformCampaignDailyBudget(winner.campaign.tenantId, winner.campaign.id, winnerDaily);
      } catch (error) {
        await setPlatformCampaignDailyBudget(donor.campaign.tenantId, donor.campaign.id, donor.metrics.dailyBudget).catch(() => undefined);
        throw error;
      }

      const at = new Date().toISOString();
      const donorControl = (donor.campaign.segmentacao as any).campaignControl;
      const winnerControl = (winner.campaign.segmentacao as any).campaignControl;
      const donorTotalBudget = Math.round((donor.metrics.totalBudget - transfer) * 100) / 100;
      const winnerTotalBudget = Math.round((winner.metrics.totalBudget + transfer) * 100) / 100;
      const donorSegmentacao = {
        ...(donor.campaign.segmentacao as any),
        campaignControl: {
          ...donorControl,
          totalBudget: donorTotalBudget,
          automation: {
            ...(donorControl.automation ?? {}),
            lastBudgetAdjustment: { at, direction: "decrease", amount: transfer, fromDailyBudget: donor.metrics.dailyBudget, toDailyBudget: donorDaily, peerCampaignId: winner.campaign.id, mediaPlanId: planId },
          },
        },
      };
      const winnerSegmentacao = {
        ...(winner.campaign.segmentacao as any),
        campaignControl: {
          ...winnerControl,
          totalBudget: winnerTotalBudget,
          automation: {
            ...(winnerControl.automation ?? {}),
            lastBudgetAdjustment: { at, direction: "increase", amount: transfer, fromDailyBudget: winner.metrics.dailyBudget, toDailyBudget: winnerDaily, peerCampaignId: donor.campaign.id, mediaPlanId: planId },
          },
        },
      };

      await db.transaction(async (tx) => {
        await tx.update(adCampaignsTable).set({ segmentacao: donorSegmentacao, updatedAt: new Date() })
          .where(eq(adCampaignsTable.id, donor.campaign.id));
        await tx.update(adCampaignsTable).set({ segmentacao: winnerSegmentacao, updatedAt: new Date() })
          .where(eq(adCampaignsTable.id, winner.campaign.id));
      });

      await recordAdCampaignEvent({
        tenantId: winner.campaign.tenantId,
        campaignId: winner.campaign.id,
        eventType: "budget_reallocated_in",
        severity: "success",
        message: `IA realocou R$ ${transfer.toFixed(2)} para esta campanha sem aumentar o orçamento total do plano.`,
        dedupeKey: `budget-in:${planId}:${at.slice(0, 13)}`,
        metadata: { mediaPlanId: planId, fromCampaignId: donor.campaign.id, transfer, previousDailyBudget: winner.metrics.dailyBudget, dailyBudget: winnerDaily, totalBudget: winnerTotalBudget },
      });
      await recordAdCampaignEvent({
        tenantId: donor.campaign.tenantId,
        campaignId: donor.campaign.id,
        eventType: "budget_reallocated_out",
        severity: "info",
        message: `IA realocou R$ ${transfer.toFixed(2)} desta campanha para uma campanha com melhor resultado, mantendo o teto do plano.`,
        dedupeKey: `budget-out:${planId}:${at.slice(0, 13)}`,
        metadata: { mediaPlanId: planId, toCampaignId: winner.campaign.id, transfer, previousDailyBudget: donor.metrics.dailyBudget, dailyBudget: donorDaily, totalBudget: donorTotalBudget },
      });
      log.info({ planId, donorCampaignId: donor.campaign.id, winnerCampaignId: winner.campaign.id, transfer, donorDaily, winnerDaily }, "scheduler/ads-budget-optimizer: budget reallocated");
    } catch (err) {
      log.error({ err, planId }, "scheduler/ads-budget-optimizer: group failed (non-fatal)");
    }
  }
}

export async function runAdsWasteGuard(log: Logger): Promise<void> {
  const campaigns = await db.select().from(adCampaignsTable)
    .where(eq(adCampaignsTable.status, "ativo"))
    .limit(500);

  for (const campaign of campaigns) {
    if (!campaign.externalCampaignId || (campaign.plataforma !== "google" && campaign.plataforma !== "meta")) continue;
    try {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
      const metrics = campaign.plataforma === "google"
        ? await fetchGoogleAdsCampaignPerformance(campaign.tenantId, campaign.id)
        : await fetchMetaAdsCampaignPerformance(campaign.tenantId, campaign.id);

      await db.delete(adPerformanceSnapshotsTable).where(and(
        eq(adPerformanceSnapshotsTable.campaignId, campaign.id),
        eq(adPerformanceSnapshotsTable.data, today),
      ));
      await db.insert(adPerformanceSnapshotsTable).values({
        campaignId: campaign.id,
        data: today,
        impressoes: Math.round(metrics.impressions),
        cliques: Math.round(metrics.clicks),
        custo: metrics.spend.toFixed(2),
        conversoesPlataforma: Math.round(metrics.conversions),
      });

      const [totals] = await db.select({
        spend: sql<string>`coalesce(sum(${adPerformanceSnapshotsTable.custo}), 0)`,
        conversions: sql<number>`coalesce(sum(${adPerformanceSnapshotsTable.conversoesPlataforma}), 0)`,
      }).from(adPerformanceSnapshotsTable)
        .where(eq(adPerformanceSnapshotsTable.campaignId, campaign.id));

      const [attributedLeads] = await db.select({ total: sql<number>`count(*)` })
        .from(leadsTable)
        .where(eq(leadsTable.adCampaignId, campaign.id));
      const spend = Number(totals?.spend ?? 0);
      const conversions = Number(totals?.conversions ?? 0) + Number(attributedLeads?.total ?? 0);
      const control = (campaign.segmentacao as any)?.campaignControl;
      const totalBudget = Number(control?.totalBudget ?? 0);

      if (Number.isFinite(totalBudget) && totalBudget > 0 && spend >= totalBudget) {
        await setStatus(campaign, false);
        await recordAdCampaignEvent({
          tenantId: campaign.tenantId,
          campaignId: campaign.id,
          eventType: "auto_paused_budget_cap",
          severity: "warning",
          message: `Campanha pausada ao atingir o teto autorizado de R$ ${totalBudget.toFixed(2)}.`,
          dedupeKey: `budget-cap:${campaign.id}`,
          metadata: { spend, totalBudget },
        });
        continue;
      }

      const automation = control?.automation;
      const limit = Number(automation?.spendWithoutResultLimit ?? 0);
      if (!automation?.autoPauseNoResults || !Number.isFinite(limit) || limit <= 0 || spend < limit || conversions > 0) continue;

      await setStatus(campaign, false);
      const segmentacao = {
        ...(campaign.segmentacao as any),
        campaignControl: {
          ...control,
          automation: {
            ...(automation ?? {}),
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
      await recordAdCampaignEvent({ tenantId: campaign.tenantId, campaignId: campaign.id, eventType: "auto_paused_no_results", severity: "critical", message: `Campanha pausada automaticamente após gastar R$ ${spend.toFixed(2)} sem conversão.`, dedupeKey: `auto-pause:${today}`, metadata: { spend, limit } });
      log.warn({ campaignId: campaign.id, spend, limit }, "scheduler/ads-waste-guard: campaign paused");
    } catch (err) {
      log.error({ err, campaignId: campaign.id }, "scheduler/ads-waste-guard: campaign failed (non-fatal)");
    }
  }

  await runBudgetRedistribution(log);
}
