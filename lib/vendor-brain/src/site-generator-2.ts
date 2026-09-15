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
  const technical = /técnic|tecnic|industrial|engenh|saas|software|automação|automacao|b2b|crm|vendas|comercial/.test(haystack);
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

function sectionKindsForSurface(input: {
  surface: WebSurface;
  director: SiteDirectorProfile;
  hasRealMedia: boolean;
}): SiteSectionKind[] {
  const { surface, director, hasRealMedia } = input;
  if (surface === 'ecommerce') return ['header', 'hero', 'products', 'benefits', 'comparison', 'faq', 'cta', 'footer'];
  if (surface === 'product') return ['header', 'hero', ...(hasRealMedia ? ['gallery' as const] : []), 'benefits', 'comparison', 'faq', 'cta', 'footer'];
  if (surface === 'landing') {
    if (director.style === 'technical') {
      return ['header', 'hero', 'problem', 'solution', 'process', ...(hasRealMedia ? ['gallery' as const] : []), 'benefits', 'faq', 'form', 'cta', 'footer'];
    }
    if (director.style === 'premium' || director.style === 'cinematic') {
      return ['header', 'hero', 'problem', ...(hasRealMedia ? ['gallery' as const] : []), 'solution', 'process', 'benefits', 'faq', 'form', 'cta', 'footer'];
    }
    return ['header', 'hero', 'problem', 'solution', 'process', 'benefits', ...(hasRealMedia ? ['gallery' as const] : []), 'faq', 'form', 'cta', 'footer'];
  }
  return ['header', 'hero', 'services', ...(hasRealMedia ? ['gallery' as const] : []), 'benefits', 'process', 'faq', 'form', 'cta', 'footer'];
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
  const hasRealMedia = Boolean(input.hasRealMedia || input.mediaRefs?.length);
  const sections = sectionKindsForSurface({ surface: input.surface, director, hasRealMedia })
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
  const realMediaCount = spec.mediaRefs.length;
  return [
    'SITE GENERATOR 2.0 — CONTRATO CRIATIVO CANÔNICO E OBRIGATÓRIO',
    'ATENÇÃO: este contrato SUBSTITUI qualquer estrutura legada rígida que apareça depois no prompt. Se houver uma instrução posterior dizendo “nesta ordem exata”, “NÚMEROS & CONQUISTAS”, “grid 2x3” ou sequência fixa de cards, trate-a apenas como referência histórica e NÃO como obrigação.',
    `Direção criativa: ${spec.director.style}; densidade: ${spec.director.density}; tipografia: ${spec.director.typographyMood}; movimento: ${spec.director.motionLevel}.`,
    `Hero: ${spec.director.heroStrategy}; mídia: ${spec.director.imageStrategy}; mídias reais disponíveis: ${realMediaCount}.`,
    'OBJETIVO PRINCIPAL: criar uma página que demonstre o produto/serviço e conduza à conversão, não uma coleção de blocos genéricos.',
    'A composição deve nascer do contexto real do negócio, do público, da oferta e das mídias disponíveis. Não reproduza automaticamente hero + 3 cards + 3 cards + números + CTA.',
    'Use UMA única versão inicial. Não gere alternativas, variações A/B ou múltiplas opções.',
    'Após a primeira versão, qualquer evolução ocorre pelo chat sobre o mesmo site.',
    'Cada seção deve incluir data-vendor-section="KIND" e data-vendor-component="COMPONENT_ID".',
    'Cada seção deve incluir data-motion="PRESET" conforme o plano abaixo.',
    ...spec.sections.map((section) => `- ${section.kind}: ${section.componentId} | motion=${section.motion}`),
    'REGRAS ANTI-TEMPLATE:',
    '- Não use mais de duas seções consecutivas baseadas em cards. Alterne composição editorial, mídia real, split layout, timeline, comparação, demonstração e formulário conforme fizer sentido.',
    '- Não crie uma seção de números só para preencher espaço. Números entram SOMENTE quando vierem explicitamente dos dados reais do tenant/produto.',
    '- Não invente estatísticas, depoimentos, logos de clientes, garantias, certificações, preços, prêmios, “anos de mercado”, “clientes atendidos” ou percentuais.',
    '- Se não houver prova real, NÃO renderize proof/números. Substitua por demonstração do fluxo, processo, comparação factual, integração real ou benefício operacional.',
    '- Para SaaS/CRM/automação, priorize mostrar como o sistema funciona na prática: entrada do lead → contexto → próximo passo → acompanhamento → decisão. Use screenshots/mídias reais quando existirem.',
    '- Benefícios devem ser operacionais e concretos. Evite frases vagas como “mais eficiência”, “mais resultados” ou “transforme seu negócio” sem explicar o mecanismo.',
    '- Cada seção precisa responder uma pergunta distinta do visitante. Não repita a mesma ideia com títulos diferentes.',
    '- O CTA deve evoluir com a intenção: entender/visualizar primeiro, agendar/falar/comprar depois. Não repita o mesmo botão sem contexto em todas as seções.',
    'MÍDIA E PRODUTO REAL:',
    '- Use primeiro as mídias reais recebidas e dê a elas função narrativa. Não deixe screenshots/fotos reais como pequenos enfeites se podem demonstrar o produto.',
    '- Quando houver mídia real, pelo menos uma seção além do hero deve usá-la para explicar produto, fluxo, aplicação, resultado ou contexto de uso.',
    '- Mídia artificial é apenas fallback quando não existir material oficial. Nunca invente screenshots de produto como se fossem telas reais.',
    'COPY E CONVERSÃO:',
    '- Escreva para o problema específico do público, com linguagem concreta e comercial. Menos slogans institucionais; mais mecanismo, consequência, operação e próximo passo.',
    '- A primeira dobra precisa dizer claramente o que muda para o cliente e o que ele pode fazer agora.',
    '- Dê prioridade a prova demonstrável do produto, integrações reais, processo e uso. Prova social só existe se houver dados reais fornecidos.',
    'Não escreva JavaScript de animação específico por seção. O runtime oficial VendorAI lê data-motion e aplica movimentos testados.',
    'Mobile 360px/390px é obrigatório; sem overflow horizontal e sem controles que quebrem texto verticalmente.',
    'Respeite prefers-reduced-motion. Não use animação que impeça leitura, clique, navegação ou Core Web Vitals.',
    'Preview/rascunho é noindex. Publicação final é indexável apenas após o gate de qualidade.',
    'ANTES DE RESPONDER, faça uma autocrítica: se a página puder trocar de logo e servir para qualquer CRM/empresa sem grandes mudanças, ela ainda está genérica e deve ser refeita antes da resposta final.',
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
  const videos = html.match(/<(video|iframe)\b[^>]*>/gi) ?? [];
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
  const usesFakeProofLanguage = /\b\d{2,}\+\s*(clientes|projetos|anos)|mais de \d+ (clientes|projetos)|milhares de clientes|\b100%\b.*(resultado|garantia|satisfa|demonstra)/i.test(text);
  const hasNoindex = /name=["']robots["'][^>]+noindex/i.test(html) || /content=["'][^"']*noindex/i.test(html);
  const realMediaRendered = images.length + videos.length;
  const requiredMediaCount = Math.max(0, input.requiredMediaCount ?? 0);
  const cardClassCount = (html.match(/class=["'][^"']*\bcard\b[^"']*["']/gi) ?? []).length;
  const repeatedGridSignals = (html.match(/grid-template-columns/gi) ?? []).length;
  const looksLikeCardWall = cardClassCount >= 10 || (cardClassCount >= 6 && repeatedGridSignals >= 4);

  if (!hasViewport) blockers.push('viewport ausente');
  if (hasHorizontalRisk) blockers.push('risco de overflow/quebra horizontal');
  if (excessiveAnimation) blockers.push('animação excessiva');
  if (usesFakeProofLanguage) blockers.push('possível prova social/número inventado');
  if (requiredMediaCount > 0 && realMediaRendered === 0) blockers.push('mídia real disponível não foi demonstrada');
  if (input.published && hasNoindex) blockers.push('site publicado permanece noindex');
  if (!input.published && !hasNoindex) warnings.push('preview deveria permanecer noindex');
  if (!hasReducedMotion && motionMarkers > 0) warnings.push('prefers-reduced-motion não identificado');
  if (imageAltRatio < 0.9) warnings.push('imagens sem alt suficiente');
  if (componentMarkers < Math.min(3, sectionCount)) warnings.push('parte das seções não está vinculada à biblioteca 2.0');
  if (looksLikeCardWall) warnings.push('composição excessivamente baseada em cards; revisar diversidade visual');
  if (requiredMediaCount > 0 && realMediaRendered < Math.min(2, requiredMediaCount)) warnings.push('pouca demonstração das mídias reais disponíveis');

  const designPenalty = blockers.length * 12 + (looksLikeCardWall ? 10 : 0);
  const design = Math.max(0, Math.min(100, 72 + Math.min(sectionCount, 8) * 3 + (componentMarkers >= Math.min(sectionCount, 5) ? 8 : 0) - designPenalty));
  const seo = Math.max(0, Math.min(100, input.seoScore ?? ((hasTitle ? 18 : 0) + (hasDescription ? 18 : 0) + (hasCanonical ? 18 : 0) + (hasSchema ? 18 : 0) + (hasH1 ? 18 : 0) + Math.round(imageAltRatio * 10))));
  const mobile = Math.max(0, Math.min(100, (hasViewport ? 45 : 10) + (/\@media[^{}]*(max-width|min-width)/i.test(html) ? 45 : 25) + (hasHorizontalRisk ? -30 : 10)));
  const performance = Math.max(0, Math.min(100, 94 - (excessiveAnimation ? 28 : 0) - (!hasLazyImages ? 12 : 0) - Math.max(0, images.length - 18)));
  const accessibility = Math.max(0, Math.min(100, 55 + Math.round(imageAltRatio * 25) + (hasReducedMotion || motionMarkers === 0 ? 10 : 0) + (hasH1 ? 10 : 0)));
  const conversion = Math.max(0, Math.min(100, hasPrimaryCta ? 94 : 62));
  const approved = blockers.length === 0 && design >= 90 && seo >= 90 && mobile >= 90 && performance >= 85 && accessibility >= 90;

  void lower;
  return { design, seo, mobile, performance, accessibility, conversion, approved, blockers, warnings };
}
