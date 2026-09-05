import { CHANNEL_REGISTRY, type ChannelId } from './platform-foundation';

export interface ChannelCampaignInput {
  campaignId?: string | null;
  objective: string;
  audience?: string | null;
  offer?: string | null;
  message: string;
  cta?: string | null;
}

export interface ChannelAdaptation {
  channel: ChannelId;
  language: string[];
  formatGuidance: string[];
  metricFocus: string[];
  executionNotes: string[];
}

const CHANNEL_GUIDANCE: Record<ChannelId, Omit<ChannelAdaptation, 'channel'>> = {
  meta: {
    language: ['visual-first', 'benefit-led', 'social proof', 'clear CTA'],
    formatGuidance: ['feed', 'stories', 'reels', 'carousel'],
    metricFocus: ['CTR', 'CPL', 'CPA', 'ROAS', 'frequency'],
    executionNotes: ['Create distinct variants per placement instead of resizing one asset.'],
  },
  instagram: {
    language: ['native', 'visual', 'concise hook', 'human tone'],
    formatGuidance: ['reels', 'stories', 'carousel', 'feed'],
    metricFocus: ['retention', 'saves', 'shares', 'profile actions', 'leads'],
    executionNotes: ['Prioritize visual storytelling and platform-native presentation.'],
  },
  'google-search': {
    language: ['high-intent', 'direct', 'specific', 'query-aligned'],
    formatGuidance: ['responsive search ad', 'assets', 'landing page'],
    metricFocus: ['CTR', 'CPC', 'conversion rate', 'CPA', 'search terms'],
    executionNotes: ['Match user intent and landing-page promise; avoid social-style storytelling.'],
  },
  'performance-max': {
    language: ['offer-consistent', 'asset-diverse', 'conversion-oriented'],
    formatGuidance: ['headlines', 'descriptions', 'images', 'logos', 'video'],
    metricFocus: ['conversions', 'CPA', 'ROAS', 'asset group performance'],
    executionNotes: ['Provide diverse, brand-consistent assets rather than duplicate variants.'],
  },
  tiktok: {
    language: ['native', 'fast hook', 'creator-like', 'low-friction'],
    formatGuidance: ['vertical video', 'UGC-style', 'text overlays'],
    metricFocus: ['hook retention', 'watch time', 'CTR', 'CPA'],
    executionNotes: ['Do not repurpose a static Instagram creative without re-authoring it for TikTok.'],
  },
  youtube: {
    language: ['story-led', 'demonstrative', 'proof-oriented'],
    formatGuidance: ['shorts', 'skippable video', 'longer explainer'],
    metricFocus: ['view rate', 'watch time', 'CTR', 'conversions'],
    executionNotes: ['Front-load value and adapt the opening seconds to placement length.'],
  },
  linkedin: {
    language: ['professional', 'business-outcome', 'credible', 'specific'],
    formatGuidance: ['single image', 'document', 'video', 'lead gen'],
    metricFocus: ['CTR', 'lead quality', 'CPL', 'pipeline influence'],
    executionNotes: ['Emphasize business impact, proof and decision-maker relevance.'],
  },
  whatsapp: {
    language: ['personal', 'direct', 'contextual', 'permission-aware'],
    formatGuidance: ['template', 'text', 'image', 'catalog/product'],
    metricFocus: ['delivery', 'read', 'reply', 'qualified conversation', 'conversion'],
    executionNotes: ['Treat as relationship messaging, not as a public-feed advertisement.'],
  },
  email: {
    language: ['clear subject', 'scannable', 'segmented', 'single-primary-action'],
    formatGuidance: ['newsletter', 'promotion', 'reactivation', 'nurture'],
    metricFocus: ['delivery', 'open', 'click', 'reply', 'conversion'],
    executionNotes: ['Adapt subject, preview and body to lifecycle stage and audience segment.'],
  },
};

export function getChannelAdaptation(channel: ChannelId): ChannelAdaptation {
  const registry = CHANNEL_REGISTRY[channel];
  if (!registry) throw new Error(`Unsupported marketing channel: ${channel}`);
  return { channel, ...CHANNEL_GUIDANCE[channel] };
}

export function getChannelAdaptations(channels: ChannelId[]): ChannelAdaptation[] {
  return [...new Set(channels)].map(getChannelAdaptation);
}
