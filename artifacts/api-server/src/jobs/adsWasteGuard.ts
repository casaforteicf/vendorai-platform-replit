import { and, desc, eq, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  adCampaignsTable,
  adPerformanceSnapshotsTable,
  businessProfilesTable,
  db,
  dealsTable,
  generatedSitesTable,
  leadsTable,
  mediaPlansTable,
  tenantsTable,
} from "@workspace/db";
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

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function daysBetween(startDate: string | undefined, endDate: string | undefined): number {
  if (!startDate || !endDate) return 1;
  const start = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T23:59:59`);
  const diff = end.getTime() - start.getTime();
  return Number.isFinite(diff) && diff > 0 ? Math.max(1, Math.ceil(diff / 86_400_000)) : 1;
}

function budgetForWindow(value: number, type: string, days: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (type === "diario") return value * days;
  if (type === "semanal") return (value / 7) * days;
  if (type === "mensal") return (value / 30) * days;
  return value;
}

function platformWeight(plan: typeof mediaPlansTable.$inferSelect, platform: string): number {
  const campaigns = plan.conteudo?.campanhas ?? [];
  let total = 0;
  for (const campaign of campaigns) {
    for (const channel of campaign.canais ?? []) {
      const name = normalize(channel.canal);
      const matches = platform === "meta"
        ? name.includes("meta ads") || name.includes("facebook ads") || name.includes("instagram ads")
        : name.includes("google search") || name.includes("google display") || name.includes("performance max") || name.includes("google ads");
      if (matches) total += Math.max(0, Number(channel.percentualOrcamento ?? 0));
    }
  }
  return total;
}

type DestinationContext = {
  whatsappAvailable: boolean;
  tenantSiteAvailable: boolean;
  landingPages: Array<{
    id: string;
    name: string;
    siteSlug: string | null;
    config: { nicheId?: string; name?: string } | null;
  }>;
};

async function loadDestinationContext(tenantId: string): Promise<DestinationContext> {
  const [[profile], [tenant], sites] = await Promise.all([
    db.select({ telefone: businessProfilesTable.telefone })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenantId))
      .limit(1),
    db.select({ subdomainSlug: tenantsTable.subdomainSlug })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1),
    db.select({
      id: generatedSitesTable.id,
      name: generatedSitesTable.name,
      siteSlug: generatedSitesTable.siteSlug,
      config: generatedSitesTable.config,
    })
      .from(generatedSitesTable)
      .where(and(eq(generatedSitesTable.tenantId, tenantId), eq(generatedSitesTable.published, true)))
      .orderBy(desc(generatedSitesTable.updatedAt))
      .limit(60),
  ]);

  return {
    whatsappAvailable: Boolean(profile?.telefone?.replace(/\D/g, "")),
    tenantSiteAvailable: Boolean(tenant?.subdomainSlug),
    landingPages: sites.filter((site) => Boolean(site.siteSlug)),
  };
}

function decideMediaPlanDestination(
  draft: typeof adCampaignsTable.$inferSelect,
  context: DestinationContext,
): {
  destinoClique: "landing_page" | "whatsapp" | "produto";
  itemTipo: "landing_page" | "livre";
  landingPageId: string | null;
  reason: string;
} | null {
  const marketing = (draft.segmentacao as any)?.marketingContext ?? {};
  const campaignId = typeof marketing.campaignId === "string" ? marketing.campaignId : "";
  const campaignName = typeof marketing.campaignName === "string" ? marketing.campaignName : "";
  const intent = normalize([
    marketing.campaignGoal,
    marketing.specificDetails,
    marketing.primaryKpi,
    campaignName,
    draft.itemLabel,
  ].filter(Boolean).join(" "));

  const exactLanding = context.landingPages.find((site) =>
    campaignId && site.config?.nicheId === `media-plan:${campaignId}`,
  );
  const namedLanding = context.landingPages.find((site) => {
    if (!campaignName) return false;
    const expected = normalize(campaignName);
    return normalize(site.name).includes(expected) || normalize(site.config?.name).includes(expected);
  });
  const landing = exactLanding ?? namedLanding ?? null;

  const wantsConversation = /whatsapp|conversa|falar|contato|orcamento|orcamento|agendar|demonstracao|mensagem/.test(intent);
  const wantsPage = /landing|pagina|site|catalogo|produto|saiba mais|visita|conteudo/.test(intent);

  if (wantsConversation && context.whatsappAvailable) {
    return {
      destinoClique: "whatsapp",
      itemTipo: "livre",
      landingPageId: null,
      reason: "Objetivo pede conversa/contato e o WhatsApp do negócio está disponível.",
    };
  }
  if (landing && (wantsPage || !context.whatsappAvailable)) {
    return {
      destinoClique: "landing_page",
      itemTipo: "landing_page",
      landingPageId: landing.id,
      reason: "Existe uma Landing Page publicada vinculada à campanha do Plano de Mídia.",
    };
  }
  if (context.whatsappAvailable) {
    return {
      destinoClique: "whatsapp",
      itemTipo: "livre",
      landingPageId: null,
      reason: "Sem Landing Page específica confiável; WhatsApp é o destino executável com melhor capacidade de conversão.",
    };
  }
  if (landing) {
    return {
      destinoClique: "landing_page",
      itemTipo: "landing_page",
      landingPageId: landing.id,
      reason: "WhatsApp indisponível; foi usada a Landing Page publicada da própria campanha.",
    };
  }
  if (context.tenantSiteAvailable) {
    return {
      destinoClique: "produto",
      itemTipo: "livre",
      landingPageId: null,
      reason: "Sem WhatsApp ou Landing Page específica; a campanha aponta para o site publicado do tenant.",
    };
  }
  return null;
}

/**
 * Faz o handoff financeiro e operacional do Planejador para os rascunhos reais de Ads.
 * O usuário informa um único orçamento no plano; a IA materializa limites e escolhe
 * um destino que os publicadores reais suportam. Nenhuma plataforma é ativada aqui.
 */
async function hydrateMediaPlanDraftBudgets(log: Logger): Promise<void> {
  const drafts = await db.select().from(adCampaignsTable)
    .where(eq(adCampaignsTable.status, "rascunho"))
    .limit(500);

  const groups = new Map<string, typeof drafts>();
  for (const draft of drafts) {
    const planId = mediaPlanId(draft);
    const control = (draft.segmentacao as any)?.campaignControl;
    const planDraft = (draft.segmentacao as any)?.mediaPlanDraft;
    const needsBudget = Number(draft.orcamentoDiario) <= 0 || Number(control?.totalBudget ?? 0) <= 0 || Boolean(planDraft?.requiresBudgetBeforePublish);
    const needsDestination = draft.destinoClique === "formulario_lead" || Boolean(planDraft?.requiresDestinationBeforePublish);
    if (!planId || !control || (!needsBudget && !needsDestination) || (draft.plataforma !== "google" && draft.plataforma !== "meta")) continue;
    const list = groups.get(planId) ?? [];
    list.push(draft);
    groups.set(planId, list);
  }

  for (const [planId, group] of groups) {
    try {
      const [plan] = await db.select().from(mediaPlansTable)
        .where(eq(mediaPlansTable.id, planId))
        .limit(1);
      if (!plan || plan.tenantId !== group[0]?.tenantId || plan.conteudo?.statusPlanejamento !== "aprovado") continue;

      const planBudget = plan.conteudo?.orcamento;
      const value = Number(planBudget?.valor ?? 0);
      if (!planBudget || !Number.isFinite(value) || value <= 0) continue;

      const destinationContext = await loadDestinationContext(plan.tenantId);
      const rawWeights = group.map((draft) => platformWeight(plan, draft.plataforma));
      const totalWeight = rawWeights.reduce((sum, weight) => sum + weight, 0);
      const fallbackWeight = group.length > 0 ? 1 / group.length : 0;

      const allocations = group.map((draft, index) => {
        const control = (draft.segmentacao as any).campaignControl;
        const days = daysBetween(control.startDate, control.endDate);
        const windowBudget = budgetForWindow(value, planBudget.tipo, days);
        const weight = totalWeight > 0 ? rawWeights[index]! / totalWeight : fallbackWeight;
        const totalBudget = Math.round(windowBudget * weight * 100) / 100;
        const dailyBudget = Math.round(Math.max(1, totalBudget / days) * 100) / 100;
        const destination = decideMediaPlanDestination(draft, destinationContext);
        return { draft, control, days, totalBudget, dailyBudget, weight, destination };
      });

      const allocatedTotal = allocations.reduce((sum, item) => sum + item.totalBudget, 0);
      const referenceDays = Math.max(1, ...allocations.map((item) => item.days));
      const expectedTotal = budgetForWindow(value, planBudget.tipo, referenceDays);
      if (allocatedTotal > expectedTotal + 0.05 && planBudget.tipo === "total") {
        throw new Error(`Alocação calculada (${allocatedTotal.toFixed(2)}) ultrapassa o teto do plano (${expectedTotal.toFixed(2)}).`);
      }

      for (const item of allocations) {
        if (item.totalBudget <= 0 || item.dailyBudget <= 0) continue;
        const now = new Date().toISOString();
        const mediaPlanDraft = {
          ...((item.draft.segmentacao as any)?.mediaPlanDraft ?? {}),
          source: "media-plan",
          requiresBudgetBeforePublish: false,
          requiresDestinationBeforePublish: !item.destination,
          budgetHydratedAt: now,
          destinationDecidedAt: item.destination ? now : undefined,
          destinationDecision: item.destination
            ? {
                destinoClique: item.destination.destinoClique,
                landingPageId: item.destination.landingPageId,
                reason: item.destination.reason,
              }
            : {
                destinoClique: null,
                landingPageId: null,
                reason: "Nenhum destino executável disponível: conecte WhatsApp ou publique Site/Landing Page antes da veiculação.",
              },
          budgetSource: {
            mediaPlanId: plan.id,
            type: planBudget.tipo,
            planValue: value,
            allocationWeight: Number((item.weight * 100).toFixed(2)),
          },
        };
        const segmentacao = {
          ...(item.draft.segmentacao as any),
          campaignControl: {
            ...item.control,
            totalBudget: item.totalBudget,
            automation: {
              ...(item.control.automation ?? {}),
              autoPauseNoResults: true,
              allowBudgetIncrease: false,
              spendWithoutResultLimit: item.control.automation?.spendWithoutResultLimit ?? Math.max(10, Math.round(item.dailyBudget * 2 * 100) / 100),
            },
          },
          mediaPlanDraft,
        };

        await db.update(adCampaignsTable)
          .set({
            orcamentoDiario: item.dailyBudget.toFixed(2),
            segmentacao,
            ...(item.destination ? {
              destinoClique: item.destination.destinoClique,
              itemTipo: item.destination.itemTipo,
              landingPageId: item.destination.landingPageId,
            } : {}),
            updatedAt: new Date(),
          })
          .where(and(eq(adCampaignsTable.id, item.draft.id), eq(adCampaignsTable.tenantId, item.draft.tenantId)));

        await recordAdCampaignEvent({
          tenantId: item.draft.tenantId,
          campaignId: item.draft.id,
          eventType: "media_plan_budget_handoff",
          severity: "success",
          message: `Planejador IA atribuiu R$ ${item.totalBudget.toFixed(2)} de teto e R$ ${item.dailyBudget.toFixed(2)}/dia a este rascunho.`,
          dedupeKey: `media-plan-budget:${plan.id}:${item.draft.id}`,
          metadata: { mediaPlanId: plan.id, planBudgetType: planBudget.tipo, planBudgetValue: value, totalBudget: item.totalBudget, dailyBudget: item.dailyBudget, allocationWeight: item.weight },
        });

        if (item.destination) {
          await recordAdCampaignEvent({
            tenantId: item.draft.tenantId,
            campaignId: item.draft.id,
            eventType: "media_plan_destination_decided",
            severity: "success",
            message: `IA definiu ${item.destination.destinoClique === "whatsapp" ? "WhatsApp" : item.destination.destinoClique === "landing_page" ? "Landing Page" : "Site"} como destino de conversão executável.`,
            dedupeKey: `media-plan-destination:${plan.id}:${item.draft.id}`,
            metadata: { mediaPlanId: plan.id, destinoClique: item.destination.destinoClique, landingPageId: item.destination.landingPageId, reason: item.destination.reason },
          });
        } else {
          await recordAdCampaignEvent({
            tenantId: item.draft.tenantId,
            campaignId: item.draft.id,
            eventType: "media_plan_destination_blocked",
            severity: "warning",
            message: "A IA não encontrou um destino publicável. O rascunho foi preservado sem veicular mídia.",
            dedupeKey: `media-plan-destination-blocked:${plan.id}:${item.draft.id}`,
            metadata: { mediaPlanId: plan.id },
          });
        }
      }
      log.info({ planId, drafts: allocations.length, planBudgetType: planBudget.tipo, planBudgetValue: value }, "scheduler/media-plan-handoff: budgets and destinations hydrated");
    } catch (err) {
      log.error({ err, planId }, "scheduler/media-plan-handoff: group failed (non-fatal)");
    }
  }
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
  await hydrateMediaPlanDraftBudgets(log);

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
