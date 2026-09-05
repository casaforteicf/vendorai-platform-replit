import { desc, eq } from 'drizzle-orm';
import { adCampaignsTable, adCreativesTable, db } from '@workspace/db';
import { getChannelDefinition, type ChannelId } from '@workspace/vendor-brain/platform-foundation';
import { getChannelAdaptation } from '@workspace/vendor-brain/channel-adapters';
import { assertChannelCanPublish, getChannelPublicationCapability } from '@workspace/vendor-brain/channel-publication';
import type { DesignQaResult } from '@workspace/vendor-brain/creative-design';
import { publishCampaignToMetaAds } from './meta-ads-campaign-publish';
import { publishCampaignToGoogleAds } from './google-ads-campaign-publish';
import { buildAdCreativeDesignQa } from './adCreativeQa';
import { resolveMarketingAgentAutonomyPolicy } from './marketingAgentAutonomyPolicy';

export type PaidPublishChannel = 'meta' | 'google-search';
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

  // Autonomous authorization is always resolved from server-side tenant policy.
  // No caller-supplied boolean can grant paid publish permission.
  const autonomyPolicy = await resolveMarketingAgentAutonomyPolicy(context.tenantId);
  if (!autonomyPolicy.allowed) {
    throw new Error(`Marketing Agent sem autorização autônoma para publicar anúncios: ${autonomyPolicy.reason}`);
  }

  if (context.requireDesignQa !== false) {
    if (!designQa) {
      throw new Error('Publicação automática bloqueada: Design QA ainda não foi executado para o criativo.');
    }
    if (!designQa.approved) {
      throw new Error(
        `Publicação automática bloqueada: Design QA ${designQa.overallScore}/100 abaixo do mínimo aprovado.`,
      );
    }
  }

  return autonomyPolicy;
}

export function getChannelPublishReadiness(channel: ChannelId) {
  const definition = getChannelDefinition(channel);
  const publication = getChannelPublicationCapability(channel);
  const adaptation = getChannelAdaptation(channel);
  return {
    channel,
    definition,
    publication,
    adaptation,
    canPublishNow: definition.status === 'active' && publication.canPublish,
  };
}

async function resolveCampaignDesignQa(context: ChannelPublishContext): Promise<DesignQaResult | null> {
  if (context.designQa) return context.designQa;
  if (context.channel !== 'meta' && context.channel !== 'google-search') return null;

  const [campaign] = await db
    .select({ plataforma: adCampaignsTable.plataforma })
    .from(adCampaignsTable)
    .where(eq(adCampaignsTable.id, context.campaignId))
    .limit(1);
  if (!campaign) return null;

  const [creative] = await db
    .select()
    .from(adCreativesTable)
    .where(eq(adCreativesTable.campaignId, context.campaignId))
    .orderBy(desc(adCreativesTable.geradoEm))
    .limit(1);
  if (!creative || creative.status !== 'aprovado') return null;

  return buildAdCreativeDesignQa({
    creative,
    platform: context.channel === 'meta' ? 'meta' : 'google',
  });
}

export async function publishCampaignThroughChannelRegistry<T extends ChannelPublishContext>(context: T) {
  const readiness = getChannelPublishReadiness(context.channel);
  assertChannelCanPublish(context.channel);
  if (readiness.definition.status !== 'active') {
    throw new Error(`Canal ${readiness.definition.name} ainda não está ativo para publicação.`);
  }

  if (context.channel !== 'meta' && context.channel !== 'google-search') {
    throw new Error(
      `Canal ${readiness.definition.name} possui execução em outro fluxo oficial ou está em modo prepare-only; não deve ser publicado pelo bridge de mídia paga.`,
    );
  }

  const designQa = await resolveCampaignDesignQa(context);
  const autonomyPolicy = await assertPublishAuthorization(context, designQa);

  if (context.channel === 'meta') {
    const result = await publishCampaignToMetaAds(context.tenantId, context.campaignId);
    return { ...readiness, authorization: context.authorization, autonomyPolicy, designQa, result };
  }

  const result = await publishCampaignToGoogleAds(context.tenantId, context.campaignId);
  return { ...readiness, authorization: context.authorization, autonomyPolicy, designQa, result };
}
