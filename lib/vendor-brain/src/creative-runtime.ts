import { getChannelAdaptation } from './channel-adapters';
import type { ChannelId } from './platform-foundation';
import { calculateDesignQaScore, validateCreativeBrief, type BrandProfile, type CreativeBrief, type DesignQaResult } from './creative-design';

export interface BusinessBrandSource {
  tenantId: string;
  logoUrl?: string | null;
  brandColor?: string | null;
  tone?: string | null;
  visualStyle?: string | null;
  photoStyle?: string | null;
  videoStyle?: string | null;
}

export interface CreativeExecutionPlan {
  brief: CreativeBrief;
  brand: BrandProfile;
  channel: ReturnType<typeof getChannelAdaptation>;
  requiredChecks: Array<'brand' | 'readability' | 'composition' | 'channel-fit' | 'cta' | 'technical'>;
  allowedToPublish: false;
  validationErrors: string[];
}

/**
 * Adapts the existing tenant/business profile into the shared BrandProfile
 * contract. This deliberately does not create another brand store: the current
 * tenant/business profile remains canonical.
 */
export function resolveBrandProfileFromBusinessSource(source: BusinessBrandSource): BrandProfile {
  return {
    tenantId: source.tenantId,
    logoUrl: source.logoUrl ?? null,
    colors: source.brandColor ? [source.brandColor] : [],
    tone: source.tone ? [source.tone] : [],
    visualStyle: source.visualStyle ? [source.visualStyle] : [],
    photoStyle: source.photoStyle ? [source.photoStyle] : [],
    videoStyle: source.videoStyle ? [source.videoStyle] : [],
  };
}

export function buildCreativeExecutionPlan(
  brief: CreativeBrief,
  brand: BrandProfile,
): CreativeExecutionPlan {
  const validationErrors = validateCreativeBrief(brief);
  const channel = getChannelAdaptation(brief.channel as ChannelId);

  if (brand.tenantId !== brief.tenantId) {
    validationErrors.push('brand tenant does not match creative tenant');
  }

  return {
    brief,
    brand,
    channel,
    requiredChecks: ['brand', 'readability', 'composition', 'channel-fit', 'cta', 'technical'],
    allowedToPublish: false,
    validationErrors,
  };
}

export interface DesignQaInput {
  brandScore: number;
  readabilityScore: number;
  compositionScore: number;
  channelFitScore: number;
  ctaScore: number;
  technicalScore: number;
  warnings?: string[];
  recommendations?: string[];
}

/**
 * Normalizes Design QA from Content Studio, Site/LP and Video outputs into one
 * score model. Publication authorization is still owned by the caller's
 * permission/autonomy checks.
 */
export function finalizeDesignQa(input: DesignQaInput, threshold = 75): DesignQaResult {
  return calculateDesignQaScore({
    brandScore: input.brandScore,
    readabilityScore: input.readabilityScore,
    compositionScore: input.compositionScore,
    channelFitScore: input.channelFitScore,
    ctaScore: input.ctaScore,
    technicalScore: input.technicalScore,
    warnings: input.warnings ?? [],
    recommendations: input.recommendations ?? [],
  }, threshold);
}
