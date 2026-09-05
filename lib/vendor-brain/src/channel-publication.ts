import type { ChannelId } from './platform-foundation';

export type ChannelPublicationMode =
  | 'paid-native'
  | 'organic-native'
  | 'messaging-native'
  | 'prepare-only';

export interface ChannelPublicationCapability {
  channel: ChannelId;
  mode: ChannelPublicationMode;
  canPrepare: boolean;
  canPublish: boolean;
  requiresHumanApproval: boolean;
  notes: string;
}

export const CHANNEL_PUBLICATION_CAPABILITIES: Record<ChannelId, ChannelPublicationCapability> = {
  meta: {
    channel: 'meta',
    mode: 'paid-native',
    canPrepare: true,
    canPublish: true,
    requiresHumanApproval: true,
    notes: 'Publisher real existente para Meta Ads. Publicação cria estrutura pausada; ativação continua separada.',
  },
  instagram: {
    channel: 'instagram',
    mode: 'organic-native',
    canPrepare: true,
    canPublish: true,
    requiresHumanApproval: true,
    notes: 'Publisher orgânico existente para Feed, Stories e Reels quando a mídia é compatível.',
  },
  'google-search': {
    channel: 'google-search',
    mode: 'paid-native',
    canPrepare: true,
    canPublish: true,
    requiresHumanApproval: true,
    notes: 'Publisher real existente para Google Search/RSA. Publicação cria campanha pausada.',
  },
  'google-pmax': {
    channel: 'google-pmax',
    mode: 'prepare-only',
    canPrepare: true,
    canPublish: false,
    requiresHumanApproval: true,
    notes: 'Planejamento e assets podem ser preparados, mas asset groups completos de Performance Max ainda não têm publisher real.',
  },
  tiktok: {
    channel: 'tiktok',
    mode: 'prepare-only',
    canPrepare: true,
    canPublish: false,
    requiresHumanApproval: true,
    notes: 'Há produção de conteúdo/roteiro, mas não há publisher oficial TikTok conectado no VendorAI.',
  },
  youtube: {
    channel: 'youtube',
    mode: 'prepare-only',
    canPrepare: true,
    canPublish: false,
    requiresHumanApproval: true,
    notes: 'Há geração de vídeo/roteiro, mas upload/publicação nativa no YouTube ainda não está implementado.',
  },
  linkedin: {
    channel: 'linkedin',
    mode: 'prepare-only',
    canPrepare: true,
    canPublish: false,
    requiresHumanApproval: true,
    notes: 'Há geração de conteúdo B2B, mas não há publisher oficial LinkedIn conectado.',
  },
  whatsapp: {
    channel: 'whatsapp',
    mode: 'messaging-native',
    canPrepare: true,
    canPublish: true,
    requiresHumanApproval: true,
    notes: 'Execução ocorre pelos fluxos oficiais de conversa/templates já existentes, não pelo publisher de mídia paga.',
  },
  email: {
    channel: 'email',
    mode: 'messaging-native',
    canPrepare: true,
    canPublish: true,
    requiresHumanApproval: true,
    notes: 'Execução usa os fluxos oficiais de email já existentes, não o publisher de mídia paga.',
  },
};

export function getChannelPublicationCapability(channel: ChannelId): ChannelPublicationCapability {
  return CHANNEL_PUBLICATION_CAPABILITIES[channel];
}

export function assertChannelCanPublish(channel: ChannelId): ChannelPublicationCapability {
  const capability = getChannelPublicationCapability(channel);
  if (!capability.canPublish) {
    throw new Error(`${channel} está em modo prepare-only: ${capability.notes}`);
  }
  return capability;
}
