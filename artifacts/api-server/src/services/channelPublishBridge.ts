import { and, desc, eq } from 'drizzle-orm';
import { adCampaignsTable, adCreativesTable, db } from '@workspace/db';
import { getChannelDefinition, type ChannelId } from '@workspace/vendor-brain/platform-foundation';
import { getChannelAdaptation } from '@workspace/vendor-brain/channel-adapters';
import { assertChannelCanPublish, getChannelPublicationCapability } from '@workspace/vendor-brain/channel-publication';
import type { DesignQaResult } from '@workspace/vendor-brain/creative-design';
import { publishCampaignToMetaAds } from './meta-ads-campaign-publish';
import { publishCampaignToGoogleAds } from './google-ads-campaign-publish';
import { publishCampaignToGooglePmax } from './google-ads-pmax-publish';
import { resolveGoogleCampaignFormat } from './google-ads-format';
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

async function resolveVerifiedCampaign(context: ChannelPublishContext) {
  const [campaign] = await db.select().from(adCampaignsTable).where(and(
    eq(adCampaignsTable.id, context.campaignId),
    eq(adCampaignsTable.tenantId, context.tenantId),
  )).limit(1);
  if (!campaign) throw new Error('Campanha não encontrada para este tenant.');
  const effectiveChannel: PaidPublishChannel = campaign.plataforma === 'meta'
    ? 'meta'
    : resolveGoogleCampaignFormat(campaign) === 'performance_max'
      ? 'google-pmax'
      : 'google-search';
  const requestedPaid = context.channel === 'meta' || context.channel === 'google-search' || context.channel === 'google-pmax';
  if (!requestedPaid) throw new Error('Este bridge aceita somente canais de mídia paga nativa.');
  if (context.channel === 'meta' && effectiveChannel !== 'meta') throw new Error('Canal solicitado não corresponde à plataforma real da campanha.');
  if ((context.channel === 'google-search' || context.channel === 'google-pmax') && effectiveChannel === 'meta') throw new Error('Canal solicitado não corresponde à plataforma real da campanha.');
  return { campaign, effectiveChannel };
}

async function resolveCampaignDesignQa(context: ChannelPublishContext): Promise<DesignQaResult | null> {
  if (context.designQa) return context.designQa;
  const [creative] = await db.select().from(adCreativesTable).where(eq(adCreativesTable.campaignId, context.campaignId))
    .orderBy(desc(adCreativesTable.geradoEm)).limit(1);
  if (!creative || creative.status !== 'aprovado') return null;
  return buildAdCreativeDesignQa({ creative, platform: context.channel === 'meta' ? 'meta' : 'google' });
}

export async function publishCampaignThroughChannelRegistry<T extends ChannelPublishContext>(context: T) {
  const { effectiveChannel } = await resolveVerifiedCampaign(context);
  const readiness = getChannelPublishReadiness(effectiveChannel);
  assertChannelCanPublish(effectiveChannel);
  if (readiness.definition.status !== 'active') throw new Error(`Canal ${readiness.definition.name} ainda não está ativo para publicação.`);
  const designQa = await resolveCampaignDesignQa({ ...context, channel: effectiveChannel });
  const autonomyPolicy = await assertPublishAuthorization(context, designQa);

  const result = effectiveChannel === 'meta'
    ? await publishCampaignToMetaAds(context.tenantId, context.campaignId)
    : effectiveChannel === 'google-pmax'
      ? await publishCampaignToGooglePmax(context.tenantId, context.campaignId)
      : await publishCampaignToGoogleAds(context.tenantId, context.campaignId);
  return { ...readiness, authorization: context.authorization, autonomyPolicy, designQa, result };
}
