import { and, desc, eq } from 'drizzle-orm';
import { adCampaignsTable, adCreativesTable, db, mediaPlansTable } from '@workspace/db';
import { getChannelDefinition, type ChannelId } from '@workspace/vendor-brain/platform-foundation';
import { getChannelAdaptation } from '@workspace/vendor-brain/channel-adapters';
import { assertChannelCanPublish, getChannelPublicationCapability } from '@workspace/vendor-brain/channel-publication';
import type { DesignQaResult } from '@workspace/vendor-brain/creative-design';
import { publishCampaignToMetaAds } from './meta-ads-campaign-publish';
import { publishCampaignToGoogleAds } from './google-ads-campaign-publish';
import { publishCampaignToGooglePmax } from './google-ads-pmax-publish';
import { resolveGoogleCampaignFormat } from './google-ads-format';
import { ensurePmaxCreativeImage } from './pmaxCreativeEnrichment';
import { buildAdCreativeDesignQa } from './adCreativeQa';
import { resolveMarketingAgentAutonomyPolicy } from './marketingAgentAutonomyPolicy';

export type PaidPublishChannel = 'meta' | 'google-search' | 'google-pmax';
export type PaidPublishAuthorization = 'human-approved' | 'agent-autonomous';

export interface ChannelPublishContext {
  tenantId: string;
  campaignId: string;
  channel: ChannelId;
  authorization: PaidPublishAuthorization;
  designQa?: DesignQaResult | null;
  requireDesignQa?: boolean;
}

type MediaPlanLink = {
  mediaPlanId?: string;
  campaignId?: string;
};

type MediaPlanDraftMeta = {
  source?: string;
  requiresBudgetBeforePublish?: boolean;
};

async function assertPublishAuthorization(context: ChannelPublishContext, designQa: DesignQaResult | null) {
  if (context.authorization === 'human-approved') return null;
  const autonomyPolicy = await resolveMarketingAgentAutonomyPolicy(context.tenantId);
  if (!autonomyPolicy.allowed) throw new Error(`Marketing Agent sem autorização autônoma para publicar anúncios: ${autonomyPolicy.reason}`);
  if (context.requireDesignQa !== false) {
    if (!designQa) throw new Error('Publicação automática bloqueada: Design QA ainda não foi executado para o criativo.');
    if (!designQa.approved) throw new Error(`Publicação automática bloqueada: Design QA ${designQa.overallScore}/100 abaixo do mínimo aprovado.`);
    if (designQa.brandScore <= 0) throw new Error('Publicação automática bloqueada: compliance de marca ainda não foi comprovado por evidência observável.');
  }
  return autonomyPolicy;
}

export function getChannelPublishReadiness(channel: ChannelId) {
  const definition = getChannelDefinition(channel);
  const publication = getChannelPublicationCapability(channel);
  const adaptation = getChannelAdaptation(channel);
  return { channel, definition, publication, adaptation, canPublishNow: definition.status === 'active' && publication.canPublish };
}

function resolveEffectivePaidChannel(campaign: typeof adCampaignsTable.$inferSelect): PaidPublishChannel {
  return campaign.plataforma === 'meta'
    ? 'meta'
    : resolveGoogleCampaignFormat(campaign) === 'performance_max'
      ? 'google-pmax'
      : 'google-search';
}

async function resolveVerifiedCampaign(context: ChannelPublishContext) {
  const [campaign] = await db.select().from(adCampaignsTable).where(and(
    eq(adCampaignsTable.id, context.campaignId),
    eq(adCampaignsTable.tenantId, context.tenantId),
  )).limit(1);
  if (!campaign) throw new Error('Campanha não encontrada para este tenant.');
  const effectiveChannel = resolveEffectivePaidChannel(campaign);
  const requestedPaid = context.channel === 'meta' || context.channel === 'google-search' || context.channel === 'google-pmax';
  if (!requestedPaid) throw new Error('Este bridge aceita somente canais de mídia paga nativa.');
  if (context.channel === 'meta' && effectiveChannel !== 'meta') throw new Error('Canal solicitado não corresponde à plataforma real da campanha.');
  if ((context.channel === 'google-search' || context.channel === 'google-pmax') && effectiveChannel === 'meta') throw new Error('Canal solicitado não corresponde à plataforma real da campanha.');
  return { campaign, effectiveChannel };
}

function readMediaPlanLink(campaign: typeof adCampaignsTable.$inferSelect): { link: MediaPlanLink; draft: MediaPlanDraftMeta } {
  const segmentacao = (campaign.segmentacao ?? {}) as Record<string, unknown>;
  const marketingContext = segmentacao.marketingContext && typeof segmentacao.marketingContext === 'object'
    ? segmentacao.marketingContext as MediaPlanLink
    : {};
  const mediaPlanDraft = segmentacao.mediaPlanDraft && typeof segmentacao.mediaPlanDraft === 'object'
    ? segmentacao.mediaPlanDraft as MediaPlanDraftMeta
    : {};
  return { link: marketingContext, draft: mediaPlanDraft };
}

function normalizeChannelName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

function matchesPaidChannel(label: string, channel: PaidPublishChannel): boolean {
  const normalized = normalizeChannelName(label);
  if (channel === 'meta') return normalized.includes('meta') || normalized.includes('facebook') || normalized.includes('instagram');
  return normalized.includes('google');
}

function allocationWeight(
  plan: typeof mediaPlansTable.$inferSelect,
  campaign: typeof adCampaignsTable.$inferSelect,
  effectiveChannel: PaidPublishChannel,
): number {
  const { link } = readMediaPlanLink(campaign);
  const plannedCampaign = plan.conteudo.campanhas?.find((entry) => entry.id === link.campaignId);
  const campaignWeight = plannedCampaign?.canais
    ?.filter((entry) => matchesPaidChannel(entry.canal, effectiveChannel))
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.percentualOrcamento ?? 0)), 0) ?? 0;
  if (campaignWeight > 0) return campaignWeight;
  const channelWeight = plan.conteudo.canais
    ?.filter((entry) => matchesPaidChannel(entry.canal, effectiveChannel))
    .reduce((sum, entry) => sum + Math.max(0, Number(entry.percentualOrcamento ?? 0)), 0) ?? 0;
  return channelWeight > 0 ? channelWeight : 1;
}

function campaignDurationDays(campaign: typeof adCampaignsTable.$inferSelect): number {
  const control = campaign.segmentacao?.campaignControl;
  const start = control?.startDate ? Date.parse(`${control.startDate}T00:00:00Z`) : NaN;
  const end = control?.endDate ? Date.parse(`${control.endDate}T00:00:00Z`) : NaN;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
  return Math.max(1, Math.floor((end - start) / 86_400_000) + 1);
}

function floorCurrency(value: number): number {
  return Math.max(0, Math.floor((value + Number.EPSILON) * 100) / 100);
}

async function enforceMediaPlanBudget(
  tenantId: string,
  campaign: typeof adCampaignsTable.$inferSelect,
  effectiveChannel: PaidPublishChannel,
) {
  const { link, draft } = readMediaPlanLink(campaign);
  const isMediaPlanDraft = draft.source === 'media-plan' || Boolean(link.mediaPlanId);
  if (!isMediaPlanDraft) return null;
  if (!link.mediaPlanId) {
    if (draft.requiresBudgetBeforePublish) throw new Error('Publicação bloqueada: rascunho do Plano de Mídia sem vínculo com o plano de origem.');
    return null;
  }

  const [plan] = await db.select().from(mediaPlansTable).where(and(
    eq(mediaPlansTable.id, link.mediaPlanId),
    eq(mediaPlansTable.tenantId, tenantId),
  )).limit(1);
  if (!plan) throw new Error('Publicação bloqueada: Plano de Mídia não encontrado para este tenant.');

  const budget = plan.conteudo.orcamento;
  if (!budget || budget.tipo !== 'total' || budget.limiteRigido !== true || !Number.isFinite(Number(budget.valor)) || Number(budget.valor) <= 0) {
    throw new Error('Publicação bloqueada: defina um orçamento total válido e rígido no Planejador de Mídia antes de ativar mídia paga.');
  }

  const tenantCampaigns = await db.select().from(adCampaignsTable).where(eq(adCampaignsTable.tenantId, tenantId));
  const linkedCampaigns = tenantCampaigns.filter((entry) => readMediaPlanLink(entry).link.mediaPlanId === link.mediaPlanId);
  const weighted = linkedCampaigns.map((entry) => ({
    campaign: entry,
    channel: resolveEffectivePaidChannel(entry),
  })).map((entry) => ({
    ...entry,
    weight: allocationWeight(plan, entry.campaign, entry.channel),
  }));
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  const currentWeight = weighted.find((entry) => entry.campaign.id === campaign.id)?.weight ?? allocationWeight(plan, campaign, effectiveChannel);
  if (totalWeight <= 0 || currentWeight <= 0) throw new Error('Publicação bloqueada: não foi possível resolver a alocação de orçamento do Plano de Mídia.');

  const planTotal = floorCurrency(Number(budget.valor));
  const allocatedTotal = floorCurrency(planTotal * (currentWeight / totalWeight));
  if (allocatedTotal <= 0) throw new Error('Publicação bloqueada: a parcela calculada para esta campanha ficou sem orçamento disponível.');
  const durationDays = campaignDurationDays(campaign);
  const dailyBudget = floorCurrency(allocatedTotal / durationDays);
  if (dailyBudget <= 0) throw new Error('Publicação bloqueada: orçamento diário calculado abaixo do mínimo operacional.');

  const segmentacao = (campaign.segmentacao ?? {}) as NonNullable<typeof campaign.segmentacao> & Record<string, unknown>;
  const existingControl = segmentacao.campaignControl;
  if (!existingControl) throw new Error('Publicação bloqueada: campanha sem controle de período/orçamento.');
  const nextSegmentacao = {
    ...segmentacao,
    campaignControl: {
      ...existingControl,
      totalBudget: allocatedTotal,
      automation: {
        ...existingControl.automation,
        allowBudgetIncrease: false as const,
      },
    },
    mediaPlanDraft: {
      ...draft,
      source: 'media-plan',
      requiresBudgetBeforePublish: false,
      planBudgetTotal: planTotal,
      allocatedTotalBudget: allocatedTotal,
      allocationWeight: currentWeight,
      allocationWeightTotal: totalWeight,
      budgetResolvedAt: new Date().toISOString(),
    },
  };

  await db.update(adCampaignsTable).set({
    orcamentoDiario: dailyBudget.toFixed(2),
    segmentacao: nextSegmentacao,
    updatedAt: new Date(),
  }).where(and(
    eq(adCampaignsTable.id, campaign.id),
    eq(adCampaignsTable.tenantId, tenantId),
  ));

  return {
    mediaPlanId: plan.id,
    planBudgetTotal: planTotal,
    allocatedTotalBudget: allocatedTotal,
    dailyBudget,
    durationDays,
    allocationWeight: currentWeight,
    allocationWeightTotal: totalWeight,
    allowBudgetIncrease: false as const,
  };
}

async function preparePerformanceMaxCreative(tenantId: string, campaignId: string, campaign: typeof adCampaignsTable.$inferSelect) {
  const [creative] = await db.select().from(adCreativesTable).where(and(
    eq(adCreativesTable.campaignId, campaignId),
    eq(adCreativesTable.status, 'aprovado'),
  )).orderBy(desc(adCreativesTable.geradoEm)).limit(1);
  if (!creative) throw new Error('Aprove o criativo antes de publicar Performance Max.');
  return ensurePmaxCreativeImage(tenantId, campaign, creative);
}

async function resolveCampaignDesignQa(context: ChannelPublishContext): Promise<DesignQaResult | null> {
  if (context.designQa) return context.designQa;
  const [creative] = await db.select().from(adCreativesTable).where(eq(adCreativesTable.campaignId, context.campaignId))
    .orderBy(desc(adCreativesTable.geradoEm)).limit(1);
  if (!creative || creative.status !== 'aprovado') return null;
  return buildAdCreativeDesignQa({ creative, platform: context.channel === 'meta' ? 'meta' : 'google' });
}

export async function publishCampaignThroughChannelRegistry<T extends ChannelPublishContext>(context: T) {
  const { campaign, effectiveChannel } = await resolveVerifiedCampaign(context);
  const readiness = getChannelPublishReadiness(effectiveChannel);
  assertChannelCanPublish(effectiveChannel);
  if (readiness.definition.status !== 'active') throw new Error(`Canal ${readiness.definition.name} ainda não está ativo para publicação.`);

  if (effectiveChannel === 'google-pmax') {
    await preparePerformanceMaxCreative(context.tenantId, context.campaignId, campaign);
  }

  const designQa = await resolveCampaignDesignQa({ ...context, channel: effectiveChannel });
  const autonomyPolicy = await assertPublishAuthorization(context, designQa);
  const budgetGovernance = await enforceMediaPlanBudget(context.tenantId, campaign, effectiveChannel);

  const result = effectiveChannel === 'meta'
    ? await publishCampaignToMetaAds(context.tenantId, context.campaignId)
    : effectiveChannel === 'google-pmax'
      ? await publishCampaignToGooglePmax(context.tenantId, context.campaignId)
      : await publishCampaignToGoogleAds(context.tenantId, context.campaignId);
  return { ...readiness, authorization: context.authorization, autonomyPolicy, designQa, budgetGovernance, result };
}