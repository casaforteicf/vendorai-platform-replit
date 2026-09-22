import { and, eq, inArray, sql } from "drizzle-orm";
import type { Logger } from "pino";
import { adCampaignsTable, adCreativesTable, adPerformanceSnapshotsTable, db, leadsTable, mediaPlansTable } from "@workspace/db";
import { fetchGoogleAdsCampaignPerformance, setGoogleAdsCampaignStatus } from "../services/google-ads-campaign-publish.js";
import { fetchMetaAdsCampaignPerformance, setMetaAdsCampaignStatus } from "../services/meta-ads-campaign-publish.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";
import { evaluatePaidMediaSpendCeiling } from "../services/paidMediaSpendCeiling.js";

const GUARD_INTERVAL_MINUTES = 60;

type CampaignRow = typeof adCampaignsTable.$inferSelect;

type MediaPlanLink = { mediaPlanId?: string };

function readMediaPlanId(campaign: CampaignRow): string | null {
  const segmentacao = (campaign.segmentacao ?? {}) as Record<string, unknown>;
  const marketingContext = segmentacao.marketingContext && typeof segmentacao.marketingContext === "object"
    ? segmentacao.marketingContext as MediaPlanLink
    : {};
  return typeof marketingContext.mediaPlanId === "string" && marketingContext.mediaPlanId.length > 0
    ? marketingContext.mediaPlanId
    : null;
}

async function pauseCampaign(campaign: CampaignRow): Promise<boolean> {
  if (!campaign.externalCampaignId) return false;
  if (campaign.plataforma === "google") {
    await setGoogleAdsCampaignStatus(campaign.tenantId, campaign.id, false);
    return true;
  }
  if (campaign.plataforma === "meta") {
    await setMetaAdsCampaignStatus(campaign.tenantId, campaign.id, false);
    return true;
  }
  return false;
}

/**
 * Proteção autorizada pelo cliente para mídia paga.
 *
 * 1) Atualiza snapshots de gasto real das campanhas ativas Meta/Google.
 * 2) Aplica o teto TOTAL rígido definido pelo humano no Plano de Mídia.
 * 3) Preserva a proteção já existente contra gasto sem conversão.
 *
 * Nunca aumenta orçamento nem reativa campanha.
 */
export async function runAdsWasteGuard(log: Logger): Promise<void> {
  const activeCampaigns = await db.select().from(adCampaignsTable)
    .where(eq(adCampaignsTable.status, "ativo"))
    .limit(500);

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
  const refreshedCampaignIds = new Set<string>();

  // Passada 1: primeiro atualiza todas as métricas reais. Assim o teto global
  // nunca é avaliado contra um conjunto parcialmente atualizado nesta rodada.
  for (const campaign of activeCampaigns) {
    const mediaPlanId = readMediaPlanId(campaign);
    const automation = campaign.segmentacao?.campaignControl?.automation;
    const noResultLimit = Number(automation?.spendWithoutResultLimit ?? 0);
    const needsNoResultGuard = automation?.autoPauseNoResults && Number.isFinite(noResultLimit) && noResultLimit > 0;
    const needsPlanGuard = Boolean(mediaPlanId);
    if ((!needsNoResultGuard && !needsPlanGuard) || !campaign.externalCampaignId) continue;
    if (campaign.plataforma !== "google" && campaign.plataforma !== "meta") continue;

    try {
      const metrics = campaign.plataforma === "google"
        ? await fetchGoogleAdsCampaignPerformance(campaign.tenantId, campaign.id)
        : await fetchMetaAdsCampaignPerformance(campaign.tenantId, campaign.id);

      await db.delete(adPerformanceSnapshotsTable).where(and(
        eq(adPerformanceSnapshotsTable.campaignId, campaign.id),
        eq(adPerformanceSnapshotsTable.data, today),
      ));
      await db.insert(adPerformanceSnapshotsTable).values({
        campaignId: campaign.id,
        creativeId: null,
        data: today,
        impressoes: Math.round(metrics.impressions),
        cliques: Math.round(metrics.clicks),
        custo: metrics.spend.toFixed(2),
        conversoesPlataforma: Math.round(metrics.conversions),
      });

      const creativeMetrics = Array.isArray(metrics.creatives) ? metrics.creatives : [];
      if (creativeMetrics.length > 0) {
        const localCreatives = await db.select({
          id: adCreativesTable.id,
          externalAdId: adCreativesTable.externalAdId,
        }).from(adCreativesTable).where(eq(adCreativesTable.campaignId, campaign.id));
        const creativeIdByExternalAd = new Map(localCreatives
          .filter((row) => row.externalAdId)
          .map((row) => [row.externalAdId!, row.id]));
        const rows = creativeMetrics.flatMap((row) => {
          if (!row.externalAdId) return [];
          const creativeId = creativeIdByExternalAd.get(row.externalAdId);
          if (!creativeId) return [];
          return [{
            campaignId: campaign.id,
            creativeId,
            data: today,
            impressoes: Math.round(row.impressions),
            cliques: Math.round(row.clicks),
            custo: row.spend.toFixed(2),
            conversoesPlataforma: Math.round(row.conversions),
          }];
        });
        if (rows.length > 0) await db.insert(adPerformanceSnapshotsTable).values(rows);
      }
      refreshedCampaignIds.add(campaign.id);
    } catch (err) {
      log.error({ err, campaignId: campaign.id }, "scheduler/ads-waste-guard: performance refresh failed (non-fatal)");
    }
  }

  // Passada 2: avalia cada Plano de Mídia uma única vez usando todos os
  // snapshots já atualizados e pausa o conjunto ativo quando o teto exigir.
  const uniquePlans = new Map<string, { tenantId: string; mediaPlanId: string }>();
  for (const campaign of activeCampaigns) {
    const mediaPlanId = readMediaPlanId(campaign);
    if (!mediaPlanId) continue;
    uniquePlans.set(`${campaign.tenantId}:${mediaPlanId}`, { tenantId: campaign.tenantId, mediaPlanId });
  }

  const pausedByCeiling = new Set<string>();
  for (const { tenantId, mediaPlanId } of uniquePlans.values()) {
    try {
      const [plan] = await db.select().from(mediaPlansTable).where(and(
        eq(mediaPlansTable.id, mediaPlanId),
        eq(mediaPlansTable.tenantId, tenantId),
      )).limit(1);
      if (!plan) continue;

      const budget = plan.conteudo.orcamento;
      if (!budget || budget.tipo !== "total" || budget.limiteRigido !== true || Number(budget.valor) <= 0) continue;

      const tenantCampaigns = await db.select().from(adCampaignsTable)
        .where(eq(adCampaignsTable.tenantId, tenantId));
      const linkedCampaigns = tenantCampaigns.filter((campaign) => {
        if (campaign.plataforma !== "meta" && campaign.plataforma !== "google") return false;
        return readMediaPlanId(campaign) === mediaPlanId;
      });
      const linkedIds = linkedCampaigns.map((campaign) => campaign.id);
      if (linkedIds.length === 0) continue;

      const [totals] = await db.select({
        spend: sql<string>`coalesce(sum(${adPerformanceSnapshotsTable.custo}), 0)`,
      }).from(adPerformanceSnapshotsTable)
        .where(inArray(adPerformanceSnapshotsTable.campaignId, linkedIds));

      const planSpend = Number(totals?.spend ?? 0);
      const activeDailyBudgetTotal = linkedCampaigns
        .filter((campaign) => campaign.status === "ativo")
        .reduce((sum, campaign) => sum + Number(campaign.orcamentoDiario ?? 0), 0);
      const ceiling = evaluatePaidMediaSpendCeiling({
        planBudgetTotal: Number(budget.valor),
        spend: planSpend,
        activeDailyBudgetTotal,
        guardIntervalMinutes: GUARD_INTERVAL_MINUTES,
      });
      if (!ceiling.shouldPause) continue;

      for (const campaign of linkedCampaigns.filter((row) => row.status === "ativo")) {
        try {
          if (!(await pauseCampaign(campaign))) continue;
          pausedByCeiling.add(campaign.id);

          const currentSegmentacao = (campaign.segmentacao ?? {}) as Record<string, any>;
          const campaignControl = (currentSegmentacao.campaignControl ?? {}) as Record<string, any>;
          const automation = (campaignControl.automation ?? {}) as Record<string, any>;
          const segmentacao = {
            ...currentSegmentacao,
            campaignControl: {
              ...campaignControl,
              automation: {
                ...automation,
                lastBudgetCeilingPause: {
                  at: new Date().toISOString(),
                  mediaPlanId,
                  planSpend: ceiling.spend,
                  planBudgetTotal: ceiling.planBudgetTotal,
                  remainingBudget: ceiling.remainingBudget,
                  projectedIntervalSpend: ceiling.projectedIntervalSpend,
                  reason: ceiling.reason,
                },
              },
            },
          };
          await db.update(adCampaignsTable).set({ segmentacao: segmentacao as any, updatedAt: new Date() })
            .where(and(eq(adCampaignsTable.id, campaign.id), eq(adCampaignsTable.tenantId, tenantId)));
          await recordAdCampaignEvent({
            tenantId,
            campaignId: campaign.id,
            eventType: "auto_paused_budget_ceiling",
            severity: "critical",
            message: ceiling.reason === "ceiling_reached"
              ? `Campanha pausada porque o Plano de Mídia atingiu o teto total de R$ ${ceiling.planBudgetTotal.toFixed(2)}.`
              : `Campanha pausada preventivamente porque o saldo de R$ ${ceiling.remainingBudget.toFixed(2)} já entrou na reserva nominal dos próximos ${GUARD_INTERVAL_MINUTES} minutos.`,
            dedupeKey: `budget-ceiling:${mediaPlanId}:${today}`,
            metadata: {
              mediaPlanId,
              planSpend: ceiling.spend,
              planBudgetTotal: ceiling.planBudgetTotal,
              remainingBudget: ceiling.remainingBudget,
              projectedIntervalSpend: ceiling.projectedIntervalSpend,
              reason: ceiling.reason,
            },
          });
        } catch (err) {
          log.error({ err, campaignId: campaign.id, mediaPlanId }, "scheduler/ads-waste-guard: ceiling pause failed (non-fatal)");
        }
      }

      log.warn({
        tenantId,
        mediaPlanId,
        spend: ceiling.spend,
        budget: ceiling.planBudgetTotal,
        remainingBudget: ceiling.remainingBudget,
        projectedIntervalSpend: ceiling.projectedIntervalSpend,
        reason: ceiling.reason,
      }, "scheduler/ads-waste-guard: media plan ceiling reached; active campaigns paused");
    } catch (err) {
      log.error({ err, tenantId, mediaPlanId }, "scheduler/ads-waste-guard: media plan ceiling evaluation failed (non-fatal)");
    }
  }

  // Passada 3: mantém a regra existente de gasto sem resultado. Campanhas já
  // pausadas pelo teto global não recebem uma segunda pausa/evento nesta rodada.
  for (const campaign of activeCampaigns) {
    if (pausedByCeiling.has(campaign.id) || !refreshedCampaignIds.has(campaign.id)) continue;
    const automation = campaign.segmentacao?.campaignControl?.automation;
    const limit = Number(automation?.spendWithoutResultLimit ?? 0);
    if (!automation?.autoPauseNoResults || !Number.isFinite(limit) || limit <= 0) continue;

    try {
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
      if (spend < limit || conversions > 0) continue;

      if (!(await pauseCampaign(campaign))) continue;
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
      await recordAdCampaignEvent({
        tenantId: campaign.tenantId,
        campaignId: campaign.id,
        eventType: "auto_paused_no_results",
        severity: "critical",
        message: `Campanha pausada automaticamente após gastar R$ ${spend.toFixed(2)} sem conversão.`,
        dedupeKey: `auto-pause:${today}`,
        metadata: { spend, limit },
      });
      log.warn({ campaignId: campaign.id, spend, limit }, "scheduler/ads-waste-guard: campaign paused without results");
    } catch (err) {
      log.error({ err, campaignId: campaign.id }, "scheduler/ads-waste-guard: no-result evaluation failed (non-fatal)");
    }
  }
}
