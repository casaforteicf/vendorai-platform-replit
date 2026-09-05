import type { ChannelId } from './platform-foundation';

export type ChannelPublicationMode = 'paid-native' | 'organic-native' | 'messaging-native' | 'prepare-only';

export interface ChannelPublicationCapability {
  channel: ChannelId;
  mode: ChannelPublicationMode;
  canPrepare: boolean;
  canPublish: boolean;
  requiresHumanApproval: boolean;
  notes: string;
}

export const CHANNEL_PUBLICATION_CAPABILITIES: Record<ChannelId, ChannelPublicationCapability> = {
  meta: { channel: 'meta', mode: 'paid-native', canPrepare: true, canPublish: true, requiresHumanApproval: true, notes: 'Publisher real existente para Meta Ads. Publicação cria estrutura pausada; ativação continua separada.' },
  instagram: { channel: 'instagram', mode: 'organic-native', canPrepare: true, canPublish: true, requiresHumanApproval: true, notes: 'Publisher orgânico existente para Feed, Stories e Reels quando a mídia é compatível.' },
  'google-search': { channel: 'google-search', mode: 'paid-native', canPrepare: true, canPublish: true, requiresHumanApproval: true, notes: 'Publisher real existente para Google Search/RSA. Publicação cria campanha pausada.' },
  'google-pmax': { channel: 'google-pmax', mode: 'paid-native', canPrepare: true, canPublish: true, requiresHumanApproval: true, notes: 'Publisher real cria Performance Max com budget, campanha, assets e asset group mínimos em uma operação governada. Estrutura nasce pausada.' },
  tiktok: { channel: 'tiktok', mode: 'organic-native', canPrepare: true, canPublish: true, requiresHumanApproval: true, notes: 'Publisher nativo usa TikTok Content Posting API Direct Post para vídeos/shorts em conta OAuth conectada.' },
  youtube: { channel: 'youtube', mode: 'organic-native', canPrepare: true, canPublish: true, requiresHumanApproval: true, notes: 'Publisher nativo usa YouTube Data API com upload resumível para vídeos/shorts em canal OAuth conectado.' },
  linkedin: { channel: 'linkedin', mode: 'organic-native', canPrepare: true, canPublish: true, requiresHumanApproval: true, notes: 'Publisher nativo usa LinkedIn Posts API e upload oficial de imagem/vídeo para o membro OAuth conectado.' },
  whatsapp: { channel: 'whatsapp', mode: 'messaging-native', canPrepare: true, canPublish: true, requiresHumanApproval: true, notes: 'Execução ocorre pelos fluxos oficiais de conversa/templates já existentes, não pelo publisher de mídia paga.' },
  email: { channel: 'email', mode: 'messaging-native', canPrepare: true, canPublish: true, requiresHumanApproval: true, notes: 'Execução usa os fluxos oficiais de email já existentes, não o publisher de mídia paga.' },
};

export function getChannelPublicationCapability(channel: ChannelId): ChannelPublicationCapability { return CHANNEL_PUBLICATION_CAPABILITIES[channel]; }
export function assertChannelCanPublish(channel: ChannelId): ChannelPublicationCapability {
  const capability = getChannelPublicationCapability(channel);
  if (!capability.canPublish) throw new Error(`${channel} está em modo prepare-only: ${capability.notes}`);
  return capability;
}
