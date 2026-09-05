import { getChannelDefinition } from '@workspace/vendor-brain/platform-foundation';
import { getChannelAdaptation } from '@workspace/vendor-brain/channel-adapters';
import type { DesignQaResult } from '@workspace/vendor-brain/creative-design';
import { publishCampaignToMetaAds } from './meta-ads-campaign-publish';
import { publishCampaignToGoogleAds } from './google-ads-campaign-publish';

export type PaidPublishChannel = 'meta' | 'google-search';

export interface ChannelPublishContext {
  tenantId: string;
  campaignId: string;
  channel: PaidPublishChannel;
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

export async function publishCampaignThroughChannelRegistry(context: ChannelPublishContext) {
  assertAutonomousPublishSafety(context);

  const definition = getChannelDefinition(context.channel);
  const adaptation = getChannelAdaptation(context.channel);
  if (definition.status !== 'active') {
    throw new Error(`Canal ${definition.name} ainda não está ativo para publicação.`);
  }

  if (context.channel === 'meta') {
    const result = await publishCampaignToMetaAds(context.tenantId, context.campaignId);
    return { channel: context.channel, definition, adaptation, designQa: context.designQa ?? null, result };
  }

  const result = await publishCampaignToGoogleAds(context.tenantId, context.campaignId);
  return { channel: context.channel, definition, adaptation, designQa: context.designQa ?? null, result };
}
