import type { BrandProfile, CreativeBrief } from './creative-design';

export type WebSurface = 'institutional' | 'landing' | 'product' | 'ecommerce';

export interface WebCreativeGuidance {
  surface: WebSurface;
  language: string[];
  structure: string[];
  metrics: string[];
  qaFocus: string[];
}

const WEB_GUIDANCE: Record<WebSurface, WebCreativeGuidance> = {
  institutional: {
    surface: 'institutional',
    language: ['credible', 'clear', 'brand-led', 'benefit-oriented'],
    structure: ['hero', 'value-proposition', 'services', 'proof', 'process', 'contact-cta'],
    metrics: ['engaged-sessions', 'cta-clicks', 'qualified-leads', 'contact-conversion'],
    qaFocus: ['brand-consistency', 'mobile-readability', 'navigation', 'proof', 'cta-clarity', 'seo-basics'],
  },
  landing: {
    surface: 'landing',
    language: ['specific', 'conversion-oriented', 'single-offer', 'low-friction'],
    structure: ['hero', 'problem', 'solution', 'benefits', 'proof', 'objections', 'primary-cta'],
    metrics: ['conversion-rate', 'cta-clicks', 'form-completion', 'qualified-leads', 'cpa'],
    qaFocus: ['message-match', 'mobile-readability', 'visual-hierarchy', 'form-friction', 'cta-clarity', 'tracking'],
  },
  product: {
    surface: 'product',
    language: ['product-specific', 'evidence-based', 'benefit-led', 'purchase-oriented'],
    structure: ['product-hero', 'real-media', 'benefits', 'specifications', 'applications', 'objections', 'purchase-cta'],
    metrics: ['product-cta-clicks', 'quote-starts', 'purchase-intent', 'conversion-rate'],
    qaFocus: ['product-accuracy', 'real-media', 'price-data-integrity', 'mobile-readability', 'cta-clarity'],
  },
  ecommerce: {
    surface: 'ecommerce',
    language: ['scannable', 'commercial', 'trust-building', 'action-oriented'],
    structure: ['hero', 'categories', 'product-grid', 'availability', 'benefits', 'cart-or-contact', 'support'],
    metrics: ['product-view-rate', 'add-to-cart', 'checkout-or-whatsapp', 'conversion-rate', 'revenue'],
    qaFocus: ['catalog-accuracy', 'stock-integrity', 'pricing-integrity', 'mobile-commerce', 'cta-clarity', 'tracking'],
  },
};

export interface WebCreativeRuntime {
  brief: CreativeBrief;
  brand: BrandProfile;
  guidance: WebCreativeGuidance;
  promptContext: string;
}

export function getWebCreativeGuidance(surface: WebSurface): WebCreativeGuidance {
  return WEB_GUIDANCE[surface];
}

export function buildWebCreativeRuntime(input: {
  brief: CreativeBrief;
  brand: BrandProfile;
  surface: WebSurface;
  businessName?: string | null;
  productName?: string | null;
}): WebCreativeRuntime {
  const guidance = getWebCreativeGuidance(input.surface);
  const promptContext = [
    'DIREÇÃO CRIATIVA WEB OFICIAL DO VENDORAI',
    `Superfície: ${guidance.surface}`,
    input.businessName ? `Empresa: ${input.businessName}` : null,
    input.productName ? `Produto/serviço: ${input.productName}` : null,
    `Objetivo: ${input.brief.objective}`,
    input.brief.audience ? `Público: ${input.brief.audience}` : null,
    input.brief.offer ? `Oferta: ${input.brief.offer}` : null,
    input.brief.cta ? `CTA: ${input.brief.cta}` : null,
    input.brief.visualDirection ? `Direção visual: ${input.brief.visualDirection}` : null,
    input.brand.logoUrl ? 'Usar a logo canônica do tenant.' : 'Não inventar logo; usar identidade textual segura se a logo não estiver disponível.',
    input.brand.colors?.length ? `Cores da marca: ${input.brand.colors.join(', ')}` : null,
    input.brand.tone?.length ? `Tom da marca: ${input.brand.tone.join(' | ')}` : null,
    input.brand.visualStyle?.length ? `Estilo visual: ${input.brand.visualStyle.join(' | ')}` : null,
    `Linguagem web: ${guidance.language.join(' | ')}`,
    `Estrutura recomendada: ${guidance.structure.join(' → ')}`,
    `Foco de QA: ${guidance.qaFocus.join(' | ')}`,
    'Priorizar mobile, clareza, contraste, hierarquia visual, acessibilidade, velocidade e coerência entre anúncio/campanha e página.',
    'Não inventar números, depoimentos, certificações, preços, garantias ou provas sociais que não existam nas fontes oficiais.',
  ].filter(Boolean).join('\n');

  return { brief: input.brief, brand: input.brand, guidance, promptContext };
}
