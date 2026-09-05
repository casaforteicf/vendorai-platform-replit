import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  adCampaignsTable,
  adCreativesTable,
  adPerformanceSnapshotsTable,
  contentAutopilotConfigTable,
  db,
  dealsTable,
  leadsTable,
  mediaPlansTable,
} from "@workspace/db";
import {
  publishCampaignToGoogleAds,
  setGoogleAdsCampaignStatus,
} from "../services/google-ads-campaign-publish.js";
import {
  publishCampaignToMetaAds,
  setMetaAdsCampaignStatus,
} from "../services/meta-ads-campaign-publish.js";
import { recordAdCampaignEvent } from "../services/adCampaignIntelligence.js";

const DAY_MS = 86_400_000;
const MAX_EXECUTION_PHASE_DAYS = 30;

type AdCampaign = typeof adCampaignsTable.$inferSelect;

function planIdOf(campaign: AdCampaign): string | null {
  const value = (campaign.segmentacao as any)?.marketingContext?.mediaPlanId;
  return typeof value === "string" && value ? value : null;
}

function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

function nextPhaseWindow(currentEnd: string, macroEnd: string | null | undefined) {
  const start = new Date(`${currentEnd}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 1);
  let end = new Date(start.getTime() + (MAX_EXECUTION_PHASE_DAYS - 1) * DAY_MS);
  if (macroEnd) {
    const macro = new Date(macroEnd);
    if (Number.isFinite(macro.getTime()) && end > macro) end = macro;
  }
  return { startDate: isoDay(start), endDate: isoDay(end) };
}

function budgetForWindow(value: number, type: string, days: number): number {
  if (type === "diario") return value * days;
  if (type === "semanal") return (value / 7) * days;
  if (type === "mensal") return (value / 30) * days;
  return value;
}

async function marketingIsAutomatic(tenantId: string) {
  const [config] = await db.select({
    ativo: contentAutopilotConfigTable.ativo,
    automationMode: contentAutopilotConfigTable.automationMode,
  }).from(contentAutopilotConfigTable)
    .where(eq(contentAutopilotConfigTable.tenantId, tenantId))
    .limit(1);
  return Boolean(config?.ativo && config.automationMode === "automatic");
}

async function performance(campaign: AdCampaign) {
  const [[media], [leadStats], [sales]] = await Promise.all([
    db.select({ spend: sql<string>`coalesce(sum(${adPerformanceSnapshotsTable.custo}), 0)` })
      .from(adPerformanceSnapshotsTable)
      .where(eq(adPerformanceSnapshotsTable.campaignId, campaign.id)),
    db.select({ total: sql<number>`count(*)` })
      .from(leadsTable)
      .where(eq(leadsTable.adCampaignId, campaign.id)),
    db.select({
      total: sql<number>`count(*)`,
      revenue: sql<string>`coalesce(sum(${dealsTable.valor}), 0)`,
    }).from(dealsTable)
      .innerJoin(leadsTable, eq(dealsTable.leadId, leadsTable.id))
      .where(and(eq(leadsTable.adCampaignId, campaign.id), eq(dealsTable.etapa, "ganho"))),
  ]);
  const spend = Number(media?.spend ?? 0);
  const leads = Number(leadStats?.total ?? 0);
  const salesCount = Number(sales?.total ?? 0);
  const revenue = Number(sales?.revenue ?? 0);
  const roas = spend > 0 ? revenue / spend : 0;
  return { spend, leads, sales: salesCount, revenue, roas };
}

function winnerEvidence(metrics: Awaited<ReturnType<typeof performance>>) {
  return metrics.sales > 0 || metrics.leads >= 2 || metrics.roas >= 1.5;
}

async function spentByPlan(campaigns: AdCampaign[]) {
  if (campaigns.length === 0) return 0;
  const ids = campaigns.map((campaign) => campaign.id);
  const [row] = await db.select({
    spend: sql<string>`coalesce(sum(${adPerformanceSnapshotsTable.custo}), 0)`,
  }).from(adPerformanceSnapshotsTable)
    .where(inArray(adPerformanceSnapshotsTable.campaignId, ids));
  return Number(row?.spend ?? 0);
}

async function copyLatestApprovedCreative(sourceCampaignId: string, targetCampaignId: string) {
  const [source] = await db.select().from(adCreativesTable)
    .where(and(eq(adCreativesTable.campaignId, sourceCampaignId), eq(adCreativesTable.status, "aprovado")))
    .orderBy(desc(adCreativesTable.aprovadoEm), desc(adCreativesTable.geradoEm))
    .limit(1);
  if (!source) return null;
  const [copy] = await db.insert(adCreativesTable).values({
    campaignId: targetCampaignId,
    headlines: source.headlines,
    descriptions: source.descriptions,
    imagens: source.imagens,
    status: "aprovado",
    aprovadoPorId: null,
    aprovadoEm: new Date(),
  }).returning();
  return copy ?? null;
}

async function publishAndActivate(campaign: AdCampaign) {
  if (campaign.plataforma === "google") {
    const published = await publishCampaignToGoogleAds(campaign.tenantId, campaign.id);
    await setGoogleAdsCampaignStatus(campaign.tenantId, campaign.id, true);
    return published;
  }
  const published = await publishCampaignToMetaAds(campaign.tenantId, campaign.id);
  await setMetaAdsCampaignStatus(campaign.tenantId, campaign.id, true);
  return published;
}

/**
 * Renova somente fases comprovadamente vencedoras e somente quando o Marketing
 * está no modo Automático. A nova fase mantém o destino/segmentação vencedores,
 * cria uma janela curta e nunca cria orçamento acima do saldo autorizado do plano.
 * Fases sem evidência positiva são encerradas e devolvidas ao ciclo de replanejamento.
 */
export async function runMediaPlanPhaseRenewal(log: Logger): Promise<void> {
  const allCampaigns = await db.select().from(adCampaignsTable).limit(1000);
  const today = isoDay(new Date());
  const expiring = allCampaigns.filter((campaign) => {
    if ((campaign.plataforma !== "google" && campaign.plataforma !== "meta") || !campaign.externalCampaignId) return false;
    const control = (campaign.segmentacao as any)?.campaignControl;
    return Boolean(planIdOf(campaign) && control?.endDate && control.endDate < today && ["ativo", "pausado"].includes(campaign.status));
  });

  for (const source of expiring) {
    const planId = planIdOf(source)!;
    const alreadyRenewed = allCampaigns.some((campaign) =>
      (campaign.segmentacao as any)?.phaseRenewal?.sourceCampaignId === source.id,
    );
    if (alreadyRenewed) continue;

    try {
      const [plan] = await db.select().from(mediaPlansTable)
        .where(eq(mediaPlansTable.id, planId))
        .limit(1);
      if (!plan || plan.tenantId !== source.tenantId || plan.conteudo?.statusPlanejamento !== "aprovado") continue;
      if (!(await marketingIsAutomatic(source.tenantId))) continue;

      const macroEnd = plan.conteudo.periodoFimEm;
      const macroOpen = plan.conteudo.periodoAberto === true;
      if (!macroOpen && macroEnd && new Date(macroEnd).getTime() < Date.now()) continue;

      const metrics = await performance(source);
      if (!winnerEvidence(metrics)) {
        await recordAdCampaignEvent({
          tenantId: source.tenantId,
          campaignId: source.id,
          eventType: "media_plan_phase_not_renewed",
          severity: "info",
          message: "A fase terminou sem evidência suficiente para renovação automática. A IA preservou o orçamento para replanejamento.",
          dedupeKey: `phase-stop:${source.id}`,
          metadata: { mediaPlanId: planId, ...metrics },
        });
        continue;
      }

      const planCampaigns = allCampaigns.filter((campaign) => planIdOf(campaign) === planId);
      const planSpend = await spentByPlan(planCampaigns);
      const planBudget = plan.conteudo.orcamento;
      const budgetValue = Number(planBudget?.valor ?? 0);
      if (!planBudget || budgetValue <= 0) continue;

      const sourceControl = (source.segmentacao as any).campaignControl;
      const nextWindow = nextPhaseWindow(sourceControl.endDate, macroEnd);
      const phaseDays = Math.max(1, Math.ceil((new Date(`${nextWindow.endDate}T23:59:59Z`).getTime() - new Date(`${nextWindow.startDate}T00:00:00Z`).getTime()) / DAY_MS));
      let phaseTotal = budgetForWindow(budgetValue, planBudget.tipo, phaseDays);
      if (planBudget.tipo === "total") phaseTotal = Math.max(0, Math.min(phaseTotal, budgetValue - planSpend));
      if (phaseTotal < 1) continue;

      const dailyBudget = Math.max(1, Math.round((phaseTotal / phaseDays) * 100) / 100);
      const nextControl = {
        ...sourceControl,
        startDate: nextWindow.startDate,
        endDate: nextWindow.endDate,
        totalBudget: Math.round(phaseTotal * 100) / 100,
        automation: {
          ...(sourceControl.automation ?? {}),
          autoPauseNoResults: true,
          allowBudgetIncrease: false,
          previousPhaseCampaignId: source.id,
          renewedAt: new Date().toISOString(),
        },
      };
      const nextSegmentacao = {
        ...(source.segmentacao as any),
        platformReview: undefined,
        campaignControl: nextControl,
        phaseRenewal: {
          sourceCampaignId: source.id,
          mediaPlanId: planId,
          decision: "continue_winner",
          reason: metrics.sales > 0 ? "vendas" : metrics.roas >= 1.5 ? "roas" : "leads",
          previousMetrics: metrics,
          createdAt: new Date().toISOString(),
        },
      };

      const {
        id: _id,
        externalCampaignId: _externalCampaignId,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...copy
      } = source;
      const [next] = await db.insert(adCampaignsTable).values({
        ...copy,
        status: "rascunho",
        externalCampaignId: null,
        orcamentoDiario: dailyBudget.toFixed(2),
        segmentacao: nextSegmentacao,
        utmCode: `vai_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`,
      } as any).returning();
      if (!next) continue;

      const creative = await copyLatestApprovedCreative(source.id, next.id);
      if (!creative) {
        await recordAdCampaignEvent({
          tenantId: source.tenantId,
          campaignId: next.id,
          eventType: "media_plan_phase_created_waiting_creative",
          severity: "warning",
          message: "A próxima fase foi criada automaticamente, mas ficou pausada porque não havia criativo aprovado reutilizável.",
          metadata: { mediaPlanId: planId, sourceCampaignId: source.id, phaseTotal, dailyBudget },
        });
        continue;
      }

      try {
        const platformResult = await publishAndActivate(next);
        await recordAdCampaignEvent({
          tenantId: source.tenantId,
          campaignId: next.id,
          eventType: "media_plan_phase_auto_renewed",
          severity: "success",
          message: `IA renovou automaticamente a fase vencedora por ${phaseDays} dia(s), mantendo o teto financeiro do plano.`,
          dedupeKey: `phase-renew:${source.id}`,
          metadata: { mediaPlanId: planId, sourceCampaignId: source.id, phaseTotal, dailyBudget, metrics, platformResult },
        });
        log.info({ planId, sourceCampaignId: source.id, nextCampaignId: next.id, phaseDays, phaseTotal }, "scheduler/media-plan-phase-renewal: winner renewed");
      } catch (error) {
        await recordAdCampaignEvent({
          tenantId: source.tenantId,
          campaignId: next.id,
          eventType: "media_plan_phase_renewal_pending",
          severity: "warning",
          message: error instanceof Error ? error.message : "A próxima fase foi criada, mas a plataforma não concluiu a publicação/ativação.",
          metadata: { mediaPlanId: planId, sourceCampaignId: source.id, phaseTotal, dailyBudget },
        });
      }
    } catch (error) {
      log.error({ error, sourceCampaignId: source.id, planId }, "scheduler/media-plan-phase-renewal: failed (non-fatal)");
    }
  }
}
