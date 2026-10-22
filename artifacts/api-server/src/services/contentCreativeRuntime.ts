import type { MarketingAgentPlan } from '@workspace/vendor-brain/marketing-agent';
import type { CreativeBrief, DesignQaResult } from '@workspace/vendor-brain/creative-design';
import { resolveTenantCreativePlan, resolveCreativeDesignQa } from './creativeDesignBridge';
import { resolveContentContext } from './contentContextLibrary';

export interface MarketingGenerationContext {
  campaignId?: string | null;
  campaignName?: string | null;
  objective?: string | null;
  audience?: string | null;
  productId?: string | null;
  productName?: string | null;
  offer?: string | null;
  channel: string;
  format: string;
  cta?: string | null;
  message?: string | null;
  visualDirection?: string | null;
  assetIds?: string[];
}

export async function buildContentCreativeRuntime(input: {
  tenantId: string;
  context: MarketingGenerationContext;
  agentPlan?: MarketingAgentPlan | null;
}) {
  const brief: CreativeBrief = {
    tenantId: input.tenantId,
    campaignId: input.context.campaignId ?? null,
    objective: input.context.objective?.trim() || 'gerar conteúdo alinhado ao objetivo da campanha',
    audience: input.context.audience?.trim() || null,
    productId: input.context.productId ?? null,
    offer: input.context.offer?.trim() || null,
    channel: input.context.channel,
    format: input.context.format,
    message: input.context.message?.trim() || null,
    cta: input.context.cta?.trim() || null,
    visualDirection: input.context.visualDirection?.trim() || null,
    assetIds: input.context.assetIds ?? [],
  };

  const [creativePlan, libraryContext] = await Promise.all([
    resolveTenantCreativePlan(input.tenantId, brief),
    resolveContentContext({
      tenantId: input.tenantId,
      query: [input.context.objective, input.context.message, input.context.productName, input.context.visualDirection].filter(Boolean).join(' '),
      productIds: input.context.productId ? [input.context.productId] : [],
      limit: 8,
    }),
  ]);
  brief.assetIds = [...new Set([...(brief.assetIds ?? []), ...libraryContext.assetIds])];
  const promptContext = [
    `Campanha: ${input.context.campaignName || input.context.campaignId || 'não vinculada'}`,
    `Objetivo: ${brief.objective}`,
    brief.audience ? `Público: ${brief.audience}` : null,
    input.context.productName ? `Produto: ${input.context.productName}` : null,
    brief.offer ? `Oferta: ${brief.offer}` : null,
    `Canal: ${creativePlan.channel?.channel ?? input.context.channel}`,
    `Formato: ${brief.format}`,
    brief.cta ? `CTA: ${brief.cta}` : null,
    creativePlan.brand.tone?.length ? `Tom da marca: ${creativePlan.brand.tone.join(' | ')}` : null,
    creativePlan.brand.colors?.length ? `Cores da marca: ${creativePlan.brand.colors.join(', ')}` : null,
    creativePlan.brand.visualStyle?.length ? `Estilo visual: ${creativePlan.brand.visualStyle.join(' | ')}` : null,
    `Linguagem do canal: ${creativePlan.channel?.language.join(" | ") ?? ""}`,
    `Regras do canal: ${creativePlan.channel?.executionNotes.join(' | ') ?? ""}`,
    input.agentPlan?.skills?.length ? `Skills do Marketing Agent: ${input.agentPlan.skills.join(', ')}` : null,
    '',
    libraryContext.promptBlock,
  ].filter((value) => value !== null && value !== undefined).join('\n');

  return { brief, creativePlan, promptContext, contextSources: libraryContext.sources };
}

/**
 * Normaliza QA para conteúdo, site/LP e vídeo usando o mesmo contrato.
 * O chamador fornece os escores medidos pelo pipeline específico.
 */
export function buildGenerationDesignQa(input: {
  brandScore: number;
  readabilityScore: number;
  compositionScore: number;
  channelFitScore: number;
  ctaScore: number;
  technicalScore: number;
  warnings?: string[];
  recommendations?: string[];
  threshold?: number;
}): DesignQaResult {
  return resolveCreativeDesignQa({
    brandScore: input.brandScore,
    readabilityScore: input.readabilityScore,
    compositionScore: input.compositionScore,
    channelFitScore: input.channelFitScore,
    ctaScore: input.ctaScore,
    technicalScore: input.technicalScore,
    warnings: input.warnings,
    recommendations: input.recommendations,
  }, input.threshold);
}
