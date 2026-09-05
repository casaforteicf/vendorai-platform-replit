import { buildWebCreativeRuntime, type WebSurface } from '@workspace/vendor-brain/web-runtime';
import type { CreativeBrief } from '@workspace/vendor-brain/creative-design';
import { resolveContentAutopilotBrandContext } from './contentAutopilotCreativeBridge';
import { buildGenerationDesignQa } from './contentCreativeRuntime';
import { buildPaidMediaLearningPromptBlock } from './paidMediaLearning';

export interface SiteCreativeRuntimeInput {
  tenantId: string;
  surface: WebSurface;
  campaignId?: string | null;
  campaignName?: string | null;
  businessName?: string | null;
  productId?: string | null;
  productName?: string | null;
  objective: string;
  audience?: string | null;
  offer?: string | null;
  cta?: string | null;
  visualDirection?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  assetIds?: string[];
}

export async function resolveSiteCreativeRuntime(input: SiteCreativeRuntimeInput) {
  const brand = await resolveContentAutopilotBrandContext({
    tenantId: input.tenantId,
    logoUrl: input.logoUrl ?? null,
    brandColor: input.brandColor ?? null,
  });

  const brief: CreativeBrief = {
    tenantId: input.tenantId,
    campaignId: input.campaignId ?? null,
    objective: input.objective,
    audience: input.audience ?? null,
    productId: input.productId ?? null,
    offer: input.offer ?? null,
    channel: 'web',
    format: input.surface,
    cta: input.cta ?? null,
    visualDirection: input.visualDirection ?? null,
    assetIds: input.assetIds ?? [],
  };

  const runtime = buildWebCreativeRuntime({
    brief,
    brand,
    surface: input.surface,
    businessName: input.businessName ?? input.campaignName ?? null,
    productName: input.productName ?? null,
  });

  // O learning usa o Ads Intelligence/CRM oficial do tenant e apenas orienta
  // a próxima página. Falha de analytics nunca deve bloquear Site/LP.
  let paidMediaLearning = '';
  try {
    paidMediaLearning = await buildPaidMediaLearningPromptBlock(input.tenantId);
  } catch {
    paidMediaLearning = '';
  }

  return {
    ...runtime,
    promptContext: runtime.promptContext + paidMediaLearning,
  };
}

/**
 * Hook único para o executor oficial do Site Generator. Mantém o prompt atual
 * intacto e apenas o precede com direção criativa/brand/learning do tenant.
 * Se o runtime falhar, devolve o prompt base e a geração continua normalmente.
 */
export async function enrichSiteGeneratorPrompt(input: {
  basePrompt: string;
  runtime: SiteCreativeRuntimeInput;
}): Promise<{ prompt: string; runtimeApplied: boolean }> {
  try {
    const creativeRuntime = await resolveSiteCreativeRuntime(input.runtime);
    return {
      prompt: `${creativeRuntime.promptContext}\n\n${input.basePrompt}`,
      runtimeApplied: true,
    };
  } catch {
    return { prompt: input.basePrompt, runtimeApplied: false };
  }
}

export function inspectGeneratedSite(input: {
  html: string;
  hasBrandContext: boolean;
  expectedCta?: string | null;
  requiredImageCount?: number;
  injectedImageCount?: number;
  seoScore?: number | null;
  technicalValid: boolean;
}) {
  const html = input.html || '';
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const hasH1 = /<h1\b/i.test(html);
  const hasMain = /<main\b/i.test(html);
  const hasSections = (html.match(/<section\b/gi) ?? []).length >= 3;
  const hasResponsiveMeta = /<meta[^>]+name=["']viewport["']/i.test(html);
  const hasCta = input.expectedCta?.trim()
    ? text.toLowerCase().includes(input.expectedCta.trim().toLowerCase())
    : /fale|solicite|compre|agende|saiba mais|entre em contato|whatsapp/i.test(text);
  const words = text.split(/\s+/).filter(Boolean).length;
  const imageIntegrity = input.requiredImageCount && input.requiredImageCount > 0
    ? Math.max(0, Math.min(100, Math.round(((input.requiredImageCount - (input.injectedImageCount ?? 0)) / input.requiredImageCount) * 100)))
    : 92;
  const seo = typeof input.seoScore === 'number' ? Math.max(0, Math.min(100, input.seoScore)) : 85;

  return buildGenerationDesignQa({
    brandScore: input.hasBrandContext ? 94 : 76,
    readabilityScore: words > 80 && words < 5_000 ? 92 : 80,
    compositionScore: hasH1 && hasMain && hasSections ? 94 : 80,
    channelFitScore: Math.round((hasResponsiveMeta ? 96 : 72) * 0.55 + seo * 0.45),
    ctaScore: hasCta ? 96 : 65,
    technicalScore: input.technicalValid ? Math.round((96 + imageIntegrity) / 2) : 55,
    warnings: [
      ...(!input.hasBrandContext ? ['Contexto de marca incompleto para a página.'] : []),
      ...(!hasResponsiveMeta ? ['Viewport responsivo não identificado.'] : []),
      ...(!hasCta ? ['CTA principal não identificado com clareza.'] : []),
      ...(!input.technicalValid ? ['HTML não passou na validação técnica do Site Generator.'] : []),
      ...((input.injectedImageCount ?? 0) > 0 ? ['Parte das mídias obrigatórias precisou ser reinserida pelo fallback determinístico.'] : []),
    ],
    recommendations: [
      ...(!hasCta ? ['Reforçar um único CTA principal alinhado ao objetivo da campanha.'] : []),
      ...(!input.hasBrandContext ? ['Completar logo, cor e tom no Perfil da Empresa.'] : []),
      ...(!hasResponsiveMeta ? ['Garantir comportamento mobile-first e viewport responsivo.'] : []),
    ],
    threshold: 78,
  });
}
