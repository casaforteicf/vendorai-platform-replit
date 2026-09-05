import { getChannelDefinition, type ChannelId } from '@workspace/vendor-brain/platform-foundation';
import { getChannelAdaptation } from '@workspace/vendor-brain/channel-adapters';
import { assertChannelCanPublish, getChannelPublicationCapability } from '@workspace/vendor-brain/channel-publication';
import type { DesignQaResult } from '@workspace/vendor-brain/creative-design';
import { publishCampaignToMetaAds } from './meta-ads-campaign-publish';
import { publishCampaignToGoogleAds } from './google-ads-campaign-publish';

export type PaidPublishChannel = 'meta' | 'google-search';

export interface ChannelPublishContext {
  tenantId: string;
  campaignId: string;
  channel: ChannelId;
  allowPublishAds: boolean;
  designQa?: DesignQaResult | null;
  requireDesignQa?: boolean;
}

function assertAutonomousPublishSafety(context: ChannelPublishContext) {
  if (!context.allowPublishAds) {
    throw new Error('Marketing Agent sem autorização para publicar anúncios.');
  }

  if (context.requireDesignQa !== false) {
    if (!context.designQa) {
      throw new Error('Publicação automática bloqueada: Design QA ainda não foi executado para o criativo.');
    }
    if (!context.designQa.approved) {
      throw new Error(
        `Publicação automática bloqueada: Design QA ${context.designQa.overallScore}/100 abaixo do mínimo aprovado.`,
      );
    }
  }
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

export async function publishCampaignThroughChannelRegistry(context: ChannelPublishContext) {
  assertAutonomousPublishSafety(context);

  const readiness = getChannelPublishReadiness(context.channel);
  assertChannelCanPublish(context.channel);
  if (readiness.definition.status !== 'active') {
    throw new Error(`Canal ${readiness.definition.name} ainda não está ativo para publicação.`);
  }

  if (context.channel === 'meta') {
    const result = await publishCampaignToMetaAds(context.tenantId, context.campaignId);
    return { ...readiness, designQa: context.designQa ?? null, result };
  }

  if (context.channel === 'google-search') {
    const result = await publishCampaignToGoogleAds(context.tenantId, context.campaignId);
    return { ...readiness, designQa: context.designQa ?? null, result };
  }

  throw new Error(
    `Canal ${readiness.definition.name} possui execução em outro fluxo oficial ou está em modo prepare-only; não deve ser publicado pelo bridge de mídia paga.`,
  );
}
