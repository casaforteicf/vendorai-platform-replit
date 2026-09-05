import { getChannelDefinition } from '@workspace/vendor-brain/platform-foundation';
import { getChannelAdaptation } from '@workspace/vendor-brain/channel-adapters';
import { publishCampaignToMetaAds } from './meta-ads-campaign-publish';
import { publishCampaignToGoogleAds } from './google-ads-campaign-publish';

export type PaidPublishChannel = 'meta' | 'google-search';

export interface ChannelPublishContext {
  tenantId: string;
  campaignId: string;
  channel: PaidPublishChannel;
  allowPublishAds: boolean;
}

export async function publishCampaignThroughChannelRegistry(context: ChannelPublishContext) {
  if (!context.allowPublishAds) {
    throw new Error('Marketing Agent sem autorização para publicar anúncios.');
  }

  const definition = getChannelDefinition(context.channel);
  const adaptation = getChannelAdaptation(context.channel);
  if (definition.status !== 'active') {
    throw new Error(`Canal ${definition.name} ainda não está ativo para publicação.`);
  }

  if (context.channel === 'meta') {
    const result = await publishCampaignToMetaAds(context.tenantId, context.campaignId);
    return { channel: context.channel, definition, adaptation, result };
  }

  const result = await publishCampaignToGoogleAds(context.tenantId, context.campaignId);
  return { channel: context.channel, definition, adaptation, result };
}
