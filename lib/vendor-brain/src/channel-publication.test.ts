import { describe, expect, it } from 'vitest';
import { getChannelPublicationCapability } from './channel-publication';

describe('channel publication capabilities', () => {
  it.each(['tiktok', 'youtube', 'linkedin'] as const)('%s has a native publisher', (channel) => {
    const capability = getChannelPublicationCapability(channel);
    expect(capability.mode).toBe('organic-native');
    expect(capability.canPublish).toBe(true);
    expect(capability.requiresHumanApproval).toBe(true);
  });

  it('keeps Performance Max prepare-only until the asset-group publisher is completed', () => {
    const capability = getChannelPublicationCapability('google-pmax');
    expect(capability.mode).toBe('prepare-only');
    expect(capability.canPublish).toBe(false);
  });
});
