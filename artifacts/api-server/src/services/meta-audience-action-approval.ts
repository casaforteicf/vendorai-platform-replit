import { and, eq, sql } from "drizzle-orm";
import { adCampaignsTable, adPerformanceSnapshotsTable, db } from "@workspace/db";
import { getMetaAudiencePerformance, type MetaAudienceMediaAction } from "./meta-audience-performance.js";
import { getMetaAdsConnectionByTenantId, refreshMetaAdsToken, META_GRAPH_BASE } from "./meta-ads-oauth.js";
import { setMetaAdsCampaignStatus } from "./meta-ads-campaign-publish.js";
import { enforceMasterAcquisitionBudget } from "./acquisitionMasterBudgetGuard.js";
import { recordAdCampaignEvent } from "./adCampaignIntelligence.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function floorMoney(value: number) {
  return Math.max(0, Math.floor((value + Number.EPSILON) * 100) / 100);
}

function saoPauloDate(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

function inclusiveDays(fromDate: string, endDate: string) {
  const from = Date.parse(`${fromDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(end) || end < from) return 0;
  return Math.floor((end - from) / 86_400_000) + 1;
}

async function activeMetaToken(tenantId: string) {
  let connection = await getMetaAdsConnectionByTenantId(tenantId);
  if (!connection || connection.status !== "active") throw new Error("Tenant sem conexão ativa com Meta Ads.");
  const expiresAt = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : 0;
  if (!connection.accessToken || expiresAt < Date.now() + 3 * 24 * 60 * 60 * 1000) {
    await refreshMetaAdsToken(connection.id);
    connection = await getMetaAdsConnectionByTenantId(tenantId);
  }
  if (!connection?.accessToken) throw new Error("Não foi possível obter token válido do Meta Ads.");
  return connection.accessToken;
}

async function metaRequest<T>(path: string, token: string, method: "GET" | "POST", params: Record<string, string> = {}) {
  const url = new URL(`${META_GRAPH_BASE}/${path}`);
  if (method === "GET") {
    Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    url.searchParams.set("access_token", token);
    const response = await fetch(url);
    const text = await response.text();
    if (!response.ok) throw new Error(`Meta Ads recusou a alteração (${response.status}): ${text.slice(0, 300)}`);
    return (text ? JSON.parse(text) : {}) as T;
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...params, access_token: token }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Meta Ads recusou a alteração (${response.status}): ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

async function setSingleMetaAdSetDailyBudget(tenantId: string, externalCampaignId: string, dailyBudget: number) {
  const token = await activeMetaToken(tenantId);
  const adSets = await metaRequest<{ data?: Array<{ id?: string }> }>(
    `${externalCampaignId}/adsets`, token, "GET", { fields: "id", limit: "10" },
  );
  const ids = (adSets.data ?? []).map((row) => row.id).filter(Boolean) as string[];
  if (ids.length !== 1) throw new Error(`Alteração bloqueada: campanha Meta possui ${ids.length} conjuntos de anúncios; o executor seguro suporta exatamente 1.`);
  await metaRequest(ids[0]!, token, "POST", { daily_budget: String(Math.round(dailyBudget * 100)) });
  return ids[0]!;
}

export async function approveMetaAudienceAction(input: {
  tenantId: string;
  campaignId: string;
  audienceKey: string;
  expectedAction: MetaAudienceMediaAction;
  actorUserId?: string | null;
}) {
  const performance = await getMetaAudiencePerformance(input.tenantId);
  const audience = performance.rows.find((row) => row.key === input.audienceKey);
  if (!audience) throw new Error("Audiência sem performance atual para validar a recomendação.");
  if (audience.mediaAction.action !== input.expectedAction) {
    throw new Error(`A recomendação mudou de ${input.expectedAction} para ${audience.mediaAction.action}. Atualize a tela antes de aprovar.`);
  }

  const [campaign] = await db.select().from(adCampaignsTable).where(and(
    eq(adCampaignsTable.id, input.campaignId),
    eq(adCampaignsTable.tenantId, input.tenantId),
  )).limit(1);
  if (!campaign) throw new Error("Campanha não encontrada para este tenant.");
  if (campaign.plataforma !== "meta") throw new Error("Esta aprovação só executa campanhas Meta.");
  if (!campaign.externalCampaignId) throw new Error("A campanha ainda não foi publicada na Meta.");

  const segmentacao = asRecord(campaign.segmentacao);
  const customAudiences = Array.isArray(segmentacao["metaCustomAudiences"])
    ? segmentacao["metaCustomAudiences"] as Array<Record<string, unknown>>
    : [];
  const appliedAudience = customAudiences.at(-1);
  if (String(appliedAudience?.["key"] ?? "") !== input.audienceKey) {
    throw new Error("A audiência recomendada não é a audiência atualmente aplicada a esta campanha.");
  }

  const [spendRow] = await db.select({
    spend: sql<string>`coalesce(sum(${adPerformanceSnapshotsTable.custo}), 0)`,
  }).from(adPerformanceSnapshotsTable).where(eq(adPerformanceSnapshotsTable.campaignId, campaign.id));
  const spend = floorMoney(Number(spendRow?.spend ?? 0));
  const before = {
    status: campaign.status,
    dailyBudget: Number(campaign.orcamentoDiario),
    totalBudget: Number(asRecord(segmentacao["campaignControl"])["totalBudget"] ?? 0),
    spend,
    audienceKey: input.audienceKey,
  };

  let after = { ...before };
  let externalAdSetId: string | null = null;
  let requiresCreativeGeneration = false;
  const action = audience.mediaAction.action;

  if (action === "pausar") {
    await setMetaAdsCampaignStatus(input.tenantId, campaign.id, false);
    after = { ...after, status: "pausado" };
  } else if (action === "escalar" || action === "reduzir") {
    const pct = audience.mediaAction.suggestedBudgetChangePct;
    if (!pct) throw new Error("A recomendação atual não contém percentual de orçamento executável.");
    const control = asRecord(segmentacao["campaignControl"]);
    const endDate = String(control["endDate"] ?? "");
    const days = inclusiveDays(saoPauloDate(), endDate);
    if (days <= 0) throw new Error("Campanha fora do período aprovado; ajuste de orçamento bloqueado.");
    const currentTotal = Number(control["totalBudget"] ?? 0);
    if (!Number.isFinite(currentTotal) || currentTotal <= 0) throw new Error("Campanha sem orçamento total aprovado.");
    const requestedTotal = floorMoney(currentTotal * (1 + pct / 100));
    const guarded = action === "escalar"
      ? await enforceMasterAcquisitionBudget({
          tenantId: input.tenantId,
          campaignId: campaign.id,
          vertical: campaign.vertical,
          currentCampaignAllocation: currentTotal,
          proposedCampaignAllocation: requestedTotal,
          authorization: "human-approved",
        })
      : null;
    const targetTotal = floorMoney(guarded?.cappedTargetAllocation ?? requestedTotal);
    if (targetTotal < spend) throw new Error("Redução bloqueada porque o novo teto ficaria abaixo do valor já gasto.");
    const remaining = floorMoney(targetTotal - spend);
    if (remaining <= 0) throw new Error("O novo orçamento não deixa saldo futuro; use Pausar para interromper a campanha.");
    const dailyBudget = floorMoney(remaining / days);
    if (dailyBudget <= 0) throw new Error("Orçamento diário calculado abaixo do mínimo operacional.");
    externalAdSetId = await setSingleMetaAdSetDailyBudget(input.tenantId, campaign.externalCampaignId, dailyBudget);
    const nextSegmentacao = {
      ...segmentacao,
      campaignControl: { ...control, totalBudget: targetTotal },
      metaAudienceLastApprovedAction: {
        audienceKey: input.audienceKey,
        action,
        approvedBy: input.actorUserId ?? null,
        approvedAt: new Date().toISOString(),
        suggestedBudgetChangePct: pct,
      },
    };
    await db.update(adCampaignsTable).set({
      orcamentoDiario: dailyBudget.toFixed(2),
      segmentacao: nextSegmentacao as any,
      updatedAt: new Date(),
    }).where(and(eq(adCampaignsTable.id, campaign.id), eq(adCampaignsTable.tenantId, input.tenantId)));
    after = { ...after, dailyBudget, totalBudget: targetTotal };
  } else if (action === "testar_criativo") {
    requiresCreativeGeneration = true;
    const nextSegmentacao = {
      ...segmentacao,
      metaCreativeTestRequest: {
        audienceKey: input.audienceKey,
        approvedBy: input.actorUserId ?? null,
        approvedAt: new Date().toISOString(),
        status: "approved_pending_generation",
      },
    };
    await db.update(adCampaignsTable).set({ segmentacao: nextSegmentacao as any, updatedAt: new Date() })
      .where(and(eq(adCampaignsTable.id, campaign.id), eq(adCampaignsTable.tenantId, input.tenantId)));
  }

  await recordAdCampaignEvent({
    tenantId: input.tenantId,
    campaignId: campaign.id,
    userId: input.actorUserId ?? null,
    eventType: "meta_audience_recommendation_approved",
    severity: "success",
    message: `Recomendação ${audience.mediaAction.label} aprovada para ${audience.label}.`,
    metadata: {
      audienceKey: input.audienceKey,
      audienceLabel: audience.label,
      action,
      confidence: audience.mediaAction.confidence,
      reason: audience.mediaAction.reason,
      suggestedBudgetChangePct: audience.mediaAction.suggestedBudgetChangePct,
      before,
      after,
      externalAdSetId,
      requiresCreativeGeneration,
      actorUserId: input.actorUserId ?? null,
    },
  });

  return {
    ok: true,
    campaignId: campaign.id,
    audienceKey: input.audienceKey,
    action,
    label: audience.mediaAction.label,
    before,
    after,
    externalAdSetId,
    requiresCreativeGeneration,
    creativeGenerationEndpoint: requiresCreativeGeneration
      ? `/api/tenants/${input.tenantId}/ads/campaigns/${campaign.id}/gerar-criativo`
      : null,
    approvedBy: input.actorUserId ?? null,
    approvedAt: new Date().toISOString(),
  };
}
