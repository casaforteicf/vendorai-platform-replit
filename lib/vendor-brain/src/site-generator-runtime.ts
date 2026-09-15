import type { WebSurface } from './web-runtime';

export type MotionLevel = 'auto' | 'none' | 'subtle' | 'dynamic' | 'cinematic';
export type ComponentCategory =
  | 'header'
  | 'hero'
  | 'content'
  | 'benefits'
  | 'proof'
  | 'gallery'
  | 'products'
  | 'pricing'
  | 'faq'
  | 'form'
  | 'cta'
  | 'footer';

export interface SiteComponentDefinition {
  id: string;
  category: ComponentCategory;
  version: number;
  surfaces: WebSurface[];
  tags: string[];
  supportsMotion: boolean;
  mobileSafe: boolean;
  status: 'active' | 'deprecated';
}

export interface MotionPreset {
  id: string;
  level: Exclude<MotionLevel, 'auto'>;
  trigger: 'load' | 'viewport' | 'hover' | 'scroll';
  mobileFallback?: string;
  reducedMotionFallback: 'none' | 'fade';
  performanceCost: 'low' | 'medium' | 'high';
}

export interface SeoPolicy {
  enabledByDefault: true;
  draftIndexing: 'noindex';
  publishedIndexing: 'index';
  requireCanonical: true;
  requireMetaTitle: true;
  requireMetaDescription: true;
  requireStructuredData: true;
  requireSitemapEntry: true;
  requireImageAlt: true;
  requireSemanticHeadings: true;
}

export interface QualityThresholds {
  design: number;
  seo: number;
  mobile: number;
  performance: number;
  accessibility: number;
}

export interface SiteGeneratorPolicy {
  generationMode: 'single-initial-version';
  refinementMode: 'chat-on-current-version';
  automaticVariants: false;
  preserveUnaffectedSections: true;
  componentLibrary: 'versioned-and-extensible';
  motionLevel: MotionLevel;
  seo: SeoPolicy;
  quality: QualityThresholds;
}

export interface SiteGeneratorPlan {
  surface: WebSurface;
  policy: SiteGeneratorPolicy;
  recommendedComponents: string[];
  recommendedMotion: MotionLevel;
  qaChecks: string[];
  promptContract: string;
}

export const SITE_COMPONENT_LIBRARY: SiteComponentDefinition[] = [
  { id: 'header-minimal-01', category: 'header', version: 1, surfaces: ['institutional', 'landing', 'product', 'ecommerce'], tags: ['clean', 'premium', 'compact'], supportsMotion: true, mobileSafe: true, status: 'active' },
  { id: 'header-commerce-01', category: 'header', version: 1, surfaces: ['ecommerce', 'product'], tags: ['commerce', 'catalog', 'cart'], supportsMotion: true, mobileSafe: true, status: 'active' },
  { id: 'hero-editorial-01', category: 'hero', version: 1, surfaces: ['institutional', 'landing'], tags: ['editorial', 'premium', 'image-led'], supportsMotion: true, mobileSafe: true, status: 'active' },
  { id: 'hero-cinematic-01', category: 'hero', version: 1, surfaces: ['institutional', 'landing', 'product'], tags: ['cinematic', 'full-bleed', 'storytelling'], supportsMotion: true, mobileSafe: true, status: 'active' },
  { id: 'hero-product-01', category: 'hero', version: 1, surfaces: ['product', 'ecommerce'], tags: ['product', 'conversion', 'media'], supportsMotion: true, mobileSafe: true, status: 'active' },
  { id: 'benefits-editorial-01', category: 'benefits', version: 1, surfaces: ['institutional', 'landing', 'product'], tags: ['benefits', 'editorial', 'scannable'], supportsMotion: true, mobileSafe: true, status: 'active' },
  { id: 'proof-numbers-01', category: 'proof', version: 1, surfaces: ['institutional', 'landing', 'product'], tags: ['metrics', 'proof', 'counter'], supportsMotion: true, mobileSafe: true, status: 'active' },
  { id: 'gallery-masonry-01', category: 'gallery', version: 1, surfaces: ['institutional', 'product', 'ecommerce'], tags: ['media', 'masonry', 'portfolio'], supportsMotion: true, mobileSafe: true, status: 'active' },
  { id: 'gallery-fullscreen-01', category: 'gallery', version: 1, surfaces: ['institutional', 'landing', 'product'], tags: ['media', 'fullscreen', 'immersive'], supportsMotion: true, mobileSafe: true, status: 'active' },
  { id: 'products-grid-01', category: 'products', version: 1, surfaces: ['ecommerce', 'product'], tags: ['catalog', 'grid', 'commerce'], supportsMotion: true, mobileSafe: true, status: 'active' },
  { id: 'pricing-comparison-01', category: 'pricing', version: 1, surfaces: ['landing', 'product'], tags: ['pricing', 'comparison', 'conversion'], supportsMotion: true, mobileSafe: true, status: 'active' },
  { id: 'faq-accordion-01', category: 'faq', version: 1, surfaces: ['institutional', 'landing', 'product', 'ecommerce'], tags: ['faq', 'seo', 'objections'], supportsMotion: true, mobileSafe: true, status: 'active' },
  { id: 'form-lead-01', category: 'form', version: 1, surfaces: ['institutional', 'landing', 'product'], tags: ['lead', 'crm', 'conversion'], supportsMotion: true, mobileSafe: true, status: 'active' },
  { id: 'cta-whatsapp-01', category: 'cta', version: 1, surfaces: ['institutional', 'landing', 'product', 'ecommerce'], tags: ['whatsapp', 'conversion', 'crm'], supportsMotion: true, mobileSafe: true, status: 'active' },
  { id: 'footer-rich-01', category: 'footer', version: 1, surfaces: ['institutional', 'landing', 'product', 'ecommerce'], tags: ['seo', 'navigation', 'trust'], supportsMotion: false, mobileSafe: true, status: 'active' },
];

export const SITE_MOTION_PRESETS: MotionPreset[] = [
  { id: 'fade-up', level: 'subtle', trigger: 'viewport', reducedMotionFallback: 'fade', performanceCost: 'low' },
  { id: 'stagger-children', level: 'subtle', trigger: 'viewport', reducedMotionFallback: 'fade', performanceCost: 'low' },
  { id: 'hover-lift', level: 'subtle', trigger: 'hover', reducedMotionFallback: 'none', performanceCost: 'low' },
  { id: 'counter-reveal', level: 'subtle', trigger: 'viewport', reducedMotionFallback: 'none', performanceCost: 'low' },
  { id: 'image-reveal', level: 'dynamic', trigger: 'viewport', mobileFallback: 'fade-up', reducedMotionFallback: 'fade', performanceCost: 'medium' },
  { id: 'parallax-soft', level: 'dynamic', trigger: 'scroll', mobileFallback: 'fade-up', reducedMotionFallback: 'none', performanceCost: 'medium' },
  { id: 'sticky-story', level: 'dynamic', trigger: 'scroll', mobileFallback: 'stagger-children', reducedMotionFallback: 'fade', performanceCost: 'medium' },
  { id: 'marquee-soft', level: 'dynamic', trigger: 'load', mobileFallback: 'fade-up', reducedMotionFallback: 'none', performanceCost: 'medium' },
  { id: 'hero-cinematic-reveal', level: 'cinematic', trigger: 'load', mobileFallback: 'image-reveal', reducedMotionFallback: 'fade', performanceCost: 'high' },
  { id: 'mask-scroll-reveal', level: 'cinematic', trigger: 'scroll', mobileFallback: 'image-reveal', reducedMotionFallback: 'fade', performanceCost: 'high' },
  { id: 'text-scroll-reveal', level: 'cinematic', trigger: 'scroll', mobileFallback: 'fade-up', reducedMotionFallback: 'fade', performanceCost: 'medium' },
  { id: 'page-transition-soft', level: 'cinematic', trigger: 'load', mobileFallback: 'fade-up', reducedMotionFallback: 'fade', performanceCost: 'medium' },
];

export const DEFAULT_SITE_GENERATOR_POLICY: SiteGeneratorPolicy = {
  generationMode: 'single-initial-version',
  refinementMode: 'chat-on-current-version',
  automaticVariants: false,
  preserveUnaffectedSections: true,
  componentLibrary: 'versioned-and-extensible',
  motionLevel: 'auto',
  seo: {
    enabledByDefault: true,
    draftIndexing: 'noindex',
    publishedIndexing: 'index',
    requireCanonical: true,
    requireMetaTitle: true,
    requireMetaDescription: true,
    requireStructuredData: true,
    requireSitemapEntry: true,
    requireImageAlt: true,
    requireSemanticHeadings: true,
  },
  quality: {
    design: 90,
    seo: 90,
    mobile: 90,
    performance: 85,
    accessibility: 90,
  },
};

function defaultMotionForSurface(surface: WebSurface): MotionLevel {
  if (surface === 'ecommerce') return 'subtle';
  if (surface === 'product') return 'dynamic';
  return 'dynamic';
}

export function getAvailableSiteComponents(surface: WebSurface): SiteComponentDefinition[] {
  return SITE_COMPONENT_LIBRARY.filter((component) => component.status === 'active' && component.surfaces.includes(surface));
}

export function buildSiteGeneratorPlan(input: {
  surface: WebSurface;
  motionLevel?: MotionLevel;
}): SiteGeneratorPlan {
  const motionLevel = input.motionLevel ?? 'auto';
  const recommendedMotion = motionLevel === 'auto' ? defaultMotionForSurface(input.surface) : motionLevel;
  const components = getAvailableSiteComponents(input.surface);

  const promptContract = [
    'SITE GENERATOR 2.0 — CONTRATO OBRIGATÓRIO',
    '- Gere UMA única versão inicial completa e forte. Não gere alternativas automáticas, A/B ou variações paralelas.',
    '- Após a versão inicial, qualquer evolução acontece por chat sobre a versão atual.',
    '- Em refinamentos, altere apenas seções afetadas pelo pedido e preserve todo o restante.',
    '- Monte a página com componentes versionados da biblioteca oficial; não invente padrões estruturais frágeis quando houver componente adequado.',
    `- Perfil de movimento recomendado: ${recommendedMotion}.`,
    '- Movimento deve reforçar hierarquia e storytelling, nunca competir com conteúdo ou prejudicar conversão.',
    '- Sempre respeitar prefers-reduced-motion e aplicar fallback mobile para efeitos de custo médio/alto.',
    '- Rascunho/preview deve permanecer noindex; somente publicação final pode ser indexável.',
    '- SEO automático é obrigatório: title, description, headings semânticos, canonical, schema, alt de imagens, links internos e sitemap.',
    '- Usar primeiro logo, fotos, vídeos e produtos reais do tenant; mídia artificial é fallback.',
    '- QA obrigatório antes de publicação: design >= 90, SEO >= 90, mobile >= 90, performance >= 85 e acessibilidade >= 90; nenhum erro crítico pode ser ignorado.',
  ].join('\n');

  return {
    surface: input.surface,
    policy: { ...DEFAULT_SITE_GENERATOR_POLICY, motionLevel },
    recommendedComponents: components.map((component) => component.id),
    recommendedMotion,
    qaChecks: [
      'design-system-consistency',
      'mobile-360-390',
      'core-web-vitals',
      'wcag-aa',
      'reduced-motion',
      'seo-indexability',
      'canonical-and-sitemap',
      'real-media-first',
      'cta-and-tracking',
      'preserve-unaffected-sections-on-refine',
    ],
    promptContract,
  };
}
