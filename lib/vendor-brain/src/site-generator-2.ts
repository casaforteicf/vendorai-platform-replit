import type { WebSurface } from './web-runtime';
import type { MotionLevel } from './site-generator-runtime';

export type SiteSectionKind =
  | 'header'
  | 'hero'
  | 'problem'
  | 'solution'
  | 'benefits'
  | 'proof'
  | 'services'
  | 'products'
  | 'gallery'
  | 'video'
  | 'process'
  | 'pricing'
  | 'comparison'
  | 'faq'
  | 'form'
  | 'cta'
  | 'footer';

export type SiteMotionPreset =
  | 'none'
  | 'fade-up'
  | 'stagger-children'
  | 'hover-lift'
  | 'counter-reveal'
  | 'image-reveal'
  | 'parallax-soft'
  | 'sticky-story'
  | 'marquee-soft'
  | 'hero-cinematic-reveal'
  | 'mask-scroll-reveal'
  | 'text-scroll-reveal'
  | 'page-transition-soft';

export interface SiteComponentVariant {
  id: string;
  kind: SiteSectionKind;
  version: number;
  surfaces: WebSurface[];
  density: 'compact' | 'balanced' | 'immersive';
  media: 'none' | 'optional' | 'preferred' | 'required';
  defaultMotion: SiteMotionPreset;
  tags: string[];
}

export interface SiteDirectorProfile {
  style: 'minimal' | 'editorial' | 'commercial' | 'technical' | 'premium' | 'cinematic';
  density: 'compact' | 'balanced' | 'immersive';
  motionLevel: Exclude<MotionLevel, 'auto'>;
  typographyMood: 'neutral' | 'editorial' | 'technical' | 'premium' | 'friendly';
  imageStrategy: 'real-first' | 'product-first' | 'mixed';
  heroStrategy: 'split' | 'editorial' | 'full-bleed' | 'product' | 'commerce';
  rationale: string[];
}

export interface SiteSectionSpec {
  id: string;
  kind: SiteSectionKind;
  componentId: string;
  motion: SiteMotionPreset;
  locked?: boolean;
  content?: Record<string, unknown>;
  mediaRefs?: string[];
  settings?: Record<string, unknown>;
}

export interface SitePageSpec {
  schemaVersion: '2.0';
  surface: WebSurface;
  director: SiteDirectorProfile;
  sections: SiteSectionSpec[];
  mediaRefs: string[];
  seo: {
    automatic: true;
    draftIndexing: 'noindex';
    publishedIndexing: 'index';
  };
  refinement: {
    mode: 'chat-on-current-version';
    automaticVariants: false;
    preserveUnaffectedSections: true;
  };
}

export interface SiteQaScorecard {
  design: number;
  seo: number;
  mobile: number;
  performance: number;
  accessibility: number;
  conversion: number;
  approved: boolean;
  blockers: string[];
  warnings: string[];
}

export const SITE_COMPONENT_VARIANTS: SiteComponentVariant[] = [
  { id: 'header-minimal-01', kind: 'header', version: 1, surfaces: ['institutional', 'landing', 'product'], density: 'compact', media: 'optional', defaultMotion: 'page-transition-soft', tags: ['clean', 'premium', 'compact'] },
  { id: 'header-commerce-01', kind: 'header', version: 1, surfaces: ['ecommerce', 'product'], density: 'compact', media: 'optional', defaultMotion: 'page-transition-soft', tags: ['commerce', 'catalog', 'cart'] },
  { id: 'header-glass-01', kind: 'header', version: 1, surfaces: ['institutional', 'landing'], density: 'compact', media: 'optional', defaultMotion: 'page-transition-soft', tags: ['glass', 'premium', 'visual'] },
  { id: 'hero-editorial-01', kind: 'hero', version: 1, surfaces: ['institutional', 'landing'], density: 'immersive', media: 'preferred', defaultMotion: 'image-reveal', tags: ['editorial', 'premium', 'image-led'] },
  { id: 'hero-split-01', kind: 'hero', version: 1, surfaces: ['institutional', 'landing', 'product'], density: 'balanced', media: 'preferred', defaultMotion: 'fade-up', tags: ['split', 'conversion', 'balanced'] },
  { id: 'hero-cinematic-01', kind: 'hero', version: 1, surfaces: ['institutional', 'landing', 'product'], density: 'immersive', media: 'required', defaultMotion: 'hero-cinematic-reveal', tags: ['cinematic', 'full-bleed', 'storytelling'] },
  { id: 'hero-product-01', kind: 'hero', version: 1, surfaces: ['product', 'ecommerce'], density: 'balanced', media: 'required', defaultMotion: 'image-reveal', tags: ['product', 'conversion', 'media'] },
  { id: 'hero-commerce-01', kind: 'hero', version: 1, surfaces: ['ecommerce'], density: 'compact', media: 'preferred', defaultMotion: 'fade-up', tags: ['commerce', 'offer', 'catalog-first'] },
  { id: 'problem-editorial-01', kind: 'problem', version: 1, surfaces: ['landing', 'institutional'], density: 'balanced', media: 'optional', defaultMotion: 'stagger-children', tags: ['pain', 'editorial', 'narrative'] },
  { id: 'solution-split-01', kind: 'solution', version: 1, surfaces: ['landing', 'institutional', 'product'], density: 'balanced', media: 'preferred', defaultMotion: 'image-reveal', tags: ['solution', 'split', 'clarity'] },
  { id: 'benefits-editorial-01', kind: 'benefits', version: 1, surfaces: ['institutional', 'landing', 'product', 'ecommerce'], density: 'balanced', media: 'optional', defaultMotion: 'stagger-children', tags: ['benefits', 'editorial', 'scannable'] },
  { id: 'benefits-icons-01', kind: 'benefits', version: 1, surfaces: ['institutional', 'landing', 'product', 'ecommerce'], density: 'compact', media: 'none', defaultMotion: 'stagger-children', tags: ['icons', 'compact', 'conversion'] },
  { id: 'proof-numbers-01', kind: 'proof', version: 1, surfaces: ['institutional', 'landing', 'product'], density: 'compact', media: 'none', defaultMotion: 'counter-reveal', tags: ['metrics', 'proof', 'counter', 'verified-only'] },
  { id: 'proof-logos-01', kind: 'proof', version: 1, surfaces: ['institutional', 'landing', 'product'], density: 'compact', media: 'required', defaultMotion: 'marquee-soft', tags: ['logos', 'clients', 'verified-only'] },
  { id: 'services-editorial-01', kind: 'services', version: 1, surfaces: ['institutional', 'landing'], density: 'balanced', media: 'preferred', defaultMotion: 'stagger-children', tags: ['services', 'editorial', 'visual'] },
  { id: 'products-grid-01', kind: 'products', version: 1, surfaces: ['ecommerce', 'product'], density: 'balanced', media: 'required', defaultMotion: 'stagger-children', tags: ['catalog', 'grid', 'commerce'] },
  { id: 'products-featured-01', kind: 'products', version: 1, surfaces: ['ecommerce', 'product'], density: 'balanced', media: 'required', defaultMotion: 'image-reveal', tags: ['featured', 'commerce', 'story'] },
  { id: 'gallery-masonry-01', kind: 'gallery', version: 1, surfaces: ['institutional', 'product', 'ecommerce'], density: 'immersive', media: 'required', defaultMotion: 'stagger-children', tags: ['media', 'masonry', 'portfolio'] },
  { id: 'gallery-fullscreen-01', kind: 'gallery', version: 1, surfaces: ['institutional', 'landing', 'product'], density: 'immersive', media: 'required', defaultMotion: 'mask-scroll-reveal', tags: ['media', 'fullscreen', 'immersive'] },
  { id: 'gallery-before-after-01', kind: 'gallery', version: 1, surfaces: ['institutional', 'landing', 'product'], density: 'balanced', media: 'required', defaultMotion: 'image-reveal', tags: ['before-after', 'comparison', 'visual-proof'] },
  { id: 'video-feature-01', kind: 'video', version: 1, surfaces: ['institutional', 'landing', 'product'], density: 'immersive', media: 'required', defaultMotion: 'image-reveal', tags: ['video', 'demo', 'story'] },
  { id: 'process-timeline-01', kind: 'process', version: 1, surfaces: ['institutional', 'landing', 'product'], density: 'balanced', media: 'optional', defaultMotion: 'stagger-children', tags: ['process', 'timeline', 'clarity'] },
  { id: 'process-sticky-story-01', kind: 'process', version: 1, surfaces: ['institutional', 'landing'], density: 'immersive', media: 'preferred', defaultMotion: 'sticky-story', tags: ['storytelling', 'sticky', 'premium'] },
  { id: 'pricing-comparison-01', kind: 'pricing', version: 1, surfaces: ['landing', 'product'], density: 'balanced', media: 'none', defaultMotion: 'stagger-children', tags: ['pricing', 'comparison', 'conversion'] },
  { id: 'comparison-table-01', kind: 'comparison', version: 1, surfaces: ['landing', 'product', 'ecommerce'], density: 'balanced', media: 'optional', defaultMotion: 'fade-up', tags: ['comparison', 'decision', 'clarity'] },
  { id: 'faq-accordion-01', kind: 'faq', version: 1, surfaces: ['institutional', 'landing', 'product', 'ecommerce'], density: 'balanced', media: 'none', defaultMotion: 'fade-up', tags: ['faq', 'seo', 'objections'] },
  { id: 'form-lead-01', kind: 'form', version: 1, surfaces: ['institutional', 'landing', 'product'], density: 'compact', media: 'optional', defaultMotion: 'fade-up', tags: ['lead', 'crm', 'conversion'] },
  { id: 'cta-whatsapp-01', kind: 'cta', version: 1, surfaces: ['institutional', 'landing', 'product', 'ecommerce'], density: 'compact', media: 'optional', defaultMotion: 'fade-up', tags: ['whatsapp', 'conversion', 'crm'] },
  { id: 'cta-schedule-01', kind: 'cta', version: 1, surfaces: ['institutional', 'landing', 'product'], density: 'compact', media: 'optional', defaultMotion: 'fade-up', tags: ['schedule', 'conversion', 'calendar'] },
  { id: 'cta-commerce-01', kind: 'cta', version: 1, surfaces: ['ecommerce', 'product'], density: 'compact', media: 'optional', defaultMotion: 'fade-up', tags: ['checkout', 'asaas', 'commerce'] },
  { id: 'footer-rich-01', kind: 'footer', version: 1, surfaces: ['institutional', 'landing', 'product', 'ecommerce'], density: 'balanced', media: 'optional', defaultMotion: 'none', tags: ['seo', 'navigation', 'trust'] },
];

function normalizeText(input: Array<string | null | undefined>): string {
  return input.filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
}

export function resolveSiteDirectorProfile(input: {
  surface: WebSurface;
  sector?: string | null;
  tone?: string | null;
  objective?: string | null;
  visualDirection?: string | null;
  hasProducts?: boolean;
  hasRealMedia?: boolean;
  requestedMotion?: MotionLevel;
}): SiteDirectorProfile {
  const haystack = normalizeText([input.sector, input.tone, input.objective, input.visualDirection]);
  const premium = /premium|luxo|sofistic|arquitet|design|imobili|constr|interiores/.test(haystack);
  const technical = /técnic|tecnic|industrial|engenh|saas|software|automação|automacao|b2b/.test(haystack);
  const commercial = input.surface === 'ecommerce' || /varejo|loja|farmácia|farmacia|supermercado|promo|venda/.test(haystack);
  const cinematic = /cinemat|imersiv|impact|editorial|story/.test(haystack) && input.hasRealMedia;

  const style: SiteDirectorProfile['style'] = cinematic
    ? 'cinematic'
    : premium
      ? 'premium'
      : technical
        ? 'technical'
        : commercial
          ? 'commercial'
          : input.surface === 'institutional'
            ? 'editorial'
            : 'minimal';

  const density: SiteDirectorProfile['density'] = input.surface === 'ecommerce'
    ? 'compact'
    : cinematic
      ? 'immersive'
      : 'balanced';

  const autoMotion: Exclude<MotionLevel, 'auto'> = input.surface === 'ecommerce'
    ? 'subtle'
    : cinematic
      ? 'cinematic'
      : premium || technical
        ? 'dynamic'
        : 'subtle';
  const motionLevel = input.requestedMotion && input.requestedMotion !== 'auto'
    ? input.requestedMotion
    : autoMotion;

  const typographyMood: SiteDirectorProfile['typographyMood'] = premium
    ? 'premium'
    : technical
      ? 'technical'
      : commercial
        ? 'friendly'
        : input.surface === 'institutional'
          ? 'editorial'
          : 'neutral';

  const heroStrategy: SiteDirectorProfile['heroStrategy'] = input.surface === 'ecommerce'
    ? 'commerce'
    : input.surface === 'product'
      ? 'product'
      : cinematic
        ? 'full-bleed'
        : premium
          ? 'editorial'
          : 'split';

  return {
    style,
    density,
    motionLevel,
    typographyMood,
    imageStrategy: input.hasProducts ? 'product-first' : input.hasRealMedia ? 'real-first' : 'mixed',
    heroStrategy,
    rationale: [
      `surface:${input.surface}`,
      input.sector ? `sector:${input.sector}` : 'sector:generic',
      `style:${style}`,
      `motion:${motionLevel}`,
      `media:${input.hasRealMedia ? 'real' : 'fallback'}`,
    ],
  };
}

function pickVariant(kind: SiteSectionKind, surface: WebSurface, director: SiteDirectorProfile): SiteComponentVariant | null {
  const candidates = SITE_COMPONENT_VARIANTS.filter((item) => item.kind === kind && item.surfaces.includes(surface));
  if (!candidates.length) return null;

  const desired = [director.style, director.heroStrategy, director.density];
  return [...candidates].sort((a, b) => {
    const score = (item: SiteComponentVariant) => desired.reduce((total, token) => total + (item.tags.includes(token) ? 2 : 0), 0)
      + (item.density === director.density ? 1 : 0);
    return score(b) - score(a);
  })[0] ?? candidates[0] ?? null;
}

function sectionKindsForSurface(surface: WebSurface): SiteSectionKind[] {
  if (surface === 'ecommerce') return ['header', 'hero', 'products', 'benefits', 'comparison', 'faq', 'cta', 'footer'];
  if (surface === 'product') return ['header', 'hero', 'gallery', 'benefits', 'comparison', 'faq', 'cta', 'footer'];
  if (surface === 'landing') return ['header', 'hero', 'problem', 'solution', 'benefits', 'proof', 'faq', 'form', 'cta', 'footer'];
  return ['header', 'hero', 'services', 'gallery', 'benefits', 'proof', 'process', 'faq', 'form', 'cta', 'footer'];
}

function motionForVariant(variant: SiteComponentVariant, level: Exclude<MotionLevel, 'auto'>): SiteMotionPreset {
  if (level === 'none') return 'none';
  if (level === 'subtle') {
    if (variant.defaultMotion === 'hover-lift' || variant.defaultMotion === 'counter-reveal') return variant.defaultMotion;
    return variant.kind === 'products' || variant.kind === 'benefits' ? 'stagger-children' : 'fade-up';
  }
  if (level === 'dynamic') {
    if (variant.defaultMotion === 'hero-cinematic-reveal' || variant.defaultMotion === 'mask-scroll-reveal') return 'image-reveal';
    return variant.defaultMotion;
  }
  return variant.defaultMotion === 'none' ? 'fade-up' : variant.defaultMotion;
}

export function buildSitePageSpec(input: {
  surface: WebSurface;
  sector?: string | null;
  tone?: string | null;
  objective?: string | null;
  visualDirection?: string | null;
  hasProducts?: boolean;
  hasRealMedia?: boolean;
  requestedMotion?: MotionLevel;
  mediaRefs?: string[];
}): SitePageSpec {
  const director = resolveSiteDirectorProfile(input);
  const sections = sectionKindsForSurface(input.surface)
    .map((kind, index) => {
      const variant = pickVariant(kind, input.surface, director);
      if (!variant) return null;
      return {
        id: `${kind}-${index + 1}`,
        kind,
        componentId: variant.id,
        motion: motionForVariant(variant, director.motionLevel),
      } satisfies SiteSectionSpec;
    })
    .filter((section): section is SiteSectionSpec => Boolean(section));

  return {
    schemaVersion: '2.0',
    surface: input.surface,
    director,
    sections,
    mediaRefs: [...new Set(input.mediaRefs ?? [])],
    seo: { automatic: true, draftIndexing: 'noindex', publishedIndexing: 'index' },
    refinement: {
      mode: 'chat-on-current-version',
      automaticVariants: false,
      preserveUnaffectedSections: true,
    },
  };
}

export function buildSiteGenerator2Prompt(spec: SitePageSpec): string {
  return [
    'SITE GENERATOR 2.0 — EXECUÇÃO ESTRUTURADA OBRIGATÓRIA',
    `Direção criativa: ${spec.director.style}; densidade: ${spec.director.density}; tipografia: ${spec.director.typographyMood}; movimento: ${spec.director.motionLevel}.`,
    `Hero: ${spec.director.heroStrategy}; mídia: ${spec.director.imageStrategy}.`,
    'Use UMA única versão inicial. Não gere alternativas, variações A/B ou múltiplas opções.',
    'Após a primeira versão, qualquer evolução ocorre pelo chat sobre o mesmo site.',
    'Cada seção deve incluir data-vendor-section="KIND" e data-vendor-component="COMPONENT_ID".',
    'Cada seção deve incluir data-motion="PRESET" conforme o plano abaixo.',
    ...spec.sections.map((section) => `- ${section.kind}: ${section.componentId} | motion=${section.motion}`),
    'Não invente estatísticas, depoimentos, logos de clientes, garantias, certificações, preços, prêmios ou números. Se não houver prova real, substitua a seção por benefícios, processo ou conteúdo factual.',
    'Use primeiro as mídias reais recebidas. Mídia artificial é apenas fallback quando não existir material oficial.',
    'Não escreva JavaScript de animação específico por seção. O runtime oficial VendorAI lê data-motion e aplica movimentos testados.',
    'Mobile 360px/390px é obrigatório; sem overflow horizontal e sem controles que quebrem texto verticalmente.',
    'Respeite prefers-reduced-motion. Não use animação que impeça leitura, clique, navegação ou Core Web Vitals.',
    'Preview/rascunho é noindex. Publicação final é indexável apenas após o gate de qualidade.',
  ].join('\n');
}

export function scoreSiteGenerator2Html(input: {
  html: string;
  seoScore?: number | null;
  requiredMediaCount?: number;
  published?: boolean;
}): SiteQaScorecard {
  const html = input.html || '';
  const lower = html.toLowerCase();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const blockers: string[] = [];
  const warnings: string[] = [];
  const hasViewport = /<meta[^>]+name=["']viewport["']/i.test(html);
  const hasH1 = (html.match(/<h1\b/gi) ?? []).length === 1;
  const sectionCount = (html.match(/<section\b/gi) ?? []).length;
  const componentMarkers = (html.match(/data-vendor-component=/gi) ?? []).length;
  const motionMarkers = (html.match(/data-motion=/gi) ?? []).length;
  const images = html.match(/<img\b[^>]*>/gi) ?? [];
  const imagesWithAlt = images.filter((tag) => /\balt=["'][^"']+["']/i.test(tag)).length;
  const imageAltRatio = images.length ? imagesWithAlt / images.length : 1;
  const hasReducedMotion = /prefers-reduced-motion/i.test(html);
  const hasLazyImages = images.length === 0 || images.some((tag) => /loading=["']lazy["']/i.test(tag));
  const hasSchema = /application\/ld\+json/i.test(html);
  const hasCanonical = /rel=["']canonical["']/i.test(html);
  const hasDescription = /name=["']description["']/i.test(html);
  const hasTitle = /<title>[^<]{8,}<\/title>/i.test(html);
  const hasHorizontalRisk = /width\s*:\s*100vw/i.test(html) || /word-break\s*:\s*break-all/i.test(html) || /writing-mode\s*:\s*(vertical|sideways)/i.test(html);
  const excessiveAnimation = (html.match(/animation\s*:/gi) ?? []).length > 24;
  const hasPrimaryCta = /whatsapp|solicitar|agendar|comprar|falar|contato|orçamento|orcamento/i.test(text);
  const usesFakeProofLanguage = /\b\d{2,}\+\s*(clientes|projetos|anos)|mais de \d+ (clientes|projetos)|milhares de clientes/i.test(text);
  const hasNoindex = /name=["']robots["'][^>]+noindex/i.test(html) || /content=["'][^"']*noindex/i.test(html);

  if (!hasViewport) blockers.push('viewport ausente');
  if (hasHorizontalRisk) blockers.push('risco de overflow/quebra horizontal');
  if (excessiveAnimation) blockers.push('animação excessiva');
  if (usesFakeProofLanguage) blockers.push('possível prova social/número inventado');
  if (input.published && hasNoindex) blockers.push('site publicado permanece noindex');
  if (!input.published && !hasNoindex) warnings.push('preview deveria permanecer noindex');
  if (!hasReducedMotion && motionMarkers > 0) warnings.push('prefers-reduced-motion não identificado');
  if (imageAltRatio < 0.9) warnings.push('imagens sem alt suficiente');
  if (componentMarkers < Math.min(3, sectionCount)) warnings.push('parte das seções não está vinculada à biblioteca 2.0');

  const design = Math.max(0, Math.min(100, 72 + Math.min(sectionCount, 8) * 3 + (componentMarkers >= Math.min(sectionCount, 5) ? 8 : 0) - blockers.length * 12));
  const seo = Math.max(0, Math.min(100, input.seoScore ?? ((hasTitle ? 18 : 0) + (hasDescription ? 18 : 0) + (hasCanonical ? 18 : 0) + (hasSchema ? 18 : 0) + (hasH1 ? 18 : 0) + Math.round(imageAltRatio * 10))));
  const mobile = Math.max(0, Math.min(100, (hasViewport ? 45 : 10) + (/\@media[^{}]*(max-width|min-width)/i.test(html) ? 45 : 25) + (hasHorizontalRisk ? -30 : 10)));
  const performance = Math.max(0, Math.min(100, 94 - (excessiveAnimation ? 28 : 0) - (!hasLazyImages ? 12 : 0) - Math.max(0, images.length - 18)));
  const accessibility = Math.max(0, Math.min(100, 55 + Math.round(imageAltRatio * 25) + (hasReducedMotion || motionMarkers === 0 ? 10 : 0) + (hasH1 ? 10 : 0)));
  const conversion = Math.max(0, Math.min(100, hasPrimaryCta ? 94 : 62));
  const approved = blockers.length === 0 && design >= 90 && seo >= 90 && mobile >= 90 && performance >= 85 && accessibility >= 90;

  return { design, seo, mobile, performance, accessibility, conversion, approved, blockers, warnings };
}
