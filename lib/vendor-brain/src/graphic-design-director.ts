import { selectFontPair } from './font-catalog';

export type GraphicDirectionId =
  | 'performance-bold'
  | 'product-clean'
  | 'premium-editorial'
  | 'architecture-luxury'
  | 'tech-modern'
  | 'authority-minimal';

export type GraphicLayoutId =
  | 'split-left'
  | 'split-right'
  | 'center-hero'
  | 'poster'
  | 'lower-third'
  | 'editorial-asym';

export type GraphicFormat = '9:16' | '16:9' | '1:1' | '4:5';
export type GraphicTextAlign = 'left' | 'center' | 'right';

export interface GraphicSlot {
  x: number;
  y: number;
  width: number;
  align: GraphicTextAlign;
  maxLines: number;
}

export interface GraphicLayoutDefinition {
  id: GraphicLayoutId;
  name: string;
  description: string;
  mediaFocus: 'full' | 'left' | 'right' | 'background';
  headline: GraphicSlot;
  supporting: GraphicSlot;
  cta: GraphicSlot;
  logo: GraphicSlot;
}

export interface GraphicDirectionDefinition {
  id: GraphicDirectionId;
  name: string;
  description: string;
  tags: string[];
  palette: [string, string, string, string];
  textColor: string;
  mutedTextColor: string;
  ctaBackground: string;
  ctaColor: string;
  overlayOpacity: number;
  borderRadius: number;
  uppercaseHeadline: boolean;
  preferredLayouts: GraphicLayoutId[];
}

export interface GraphicSceneInput {
  headline: string;
  supportingText?: string | null;
  cta?: string | null;
  hasMedia?: boolean;
}

export interface GraphicScenePlan {
  sceneIndex: number;
  layoutId: GraphicLayoutId;
  headline: string;
  supportingText: string;
  cta: string;
  headlineFont: string;
  bodyFont: string;
  headlineWeight: number;
  headlineTracking: number;
  layout: GraphicLayoutDefinition;
  score: number;
  scores: {
    hierarchy: number;
    contrast: number;
    balance: number;
    density: number;
    safeArea: number;
    brandConsistency: number;
  };
  warnings: string[];
}

export interface GraphicDesignPlan {
  version: 1;
  directionId: GraphicDirectionId;
  directionName: string;
  format: GraphicFormat;
  palette: [string, string, string, string];
  typography: {
    headingFamily: string;
    bodyFamily: string;
  };
  safeAreaPct: number;
  overlayOpacity: number;
  borderRadius: number;
  scenes: GraphicScenePlan[];
  overallScore: number;
  approved: boolean;
  warnings: string[];
}

export interface BuildGraphicDesignPlanInput {
  directionId?: GraphicDirectionId;
  channel: string;
  format?: GraphicFormat;
  profile?: string | null;
  brandColors?: string[];
  tags?: string[];
  scenes: GraphicSceneInput[];
  layoutOverrides?: Partial<Record<number, GraphicLayoutId>>;
  headlineOverrides?: Partial<Record<number, string>>;
}

export const GRAPHIC_LAYOUTS: GraphicLayoutDefinition[] = [
  {
    id: 'split-left',
    name: 'Split esquerda',
    description: 'Texto forte à esquerda, mídia respirando à direita.',
    mediaFocus: 'right',
    headline: { x: 8, y: 18, width: 46, align: 'left', maxLines: 4 },
    supporting: { x: 8, y: 58, width: 42, align: 'left', maxLines: 3 },
    cta: { x: 8, y: 78, width: 38, align: 'left', maxLines: 2 },
    logo: { x: 8, y: 6, width: 26, align: 'left', maxLines: 1 },
  },
  {
    id: 'split-right',
    name: 'Split direita',
    description: 'Mídia à esquerda e bloco editorial à direita.',
    mediaFocus: 'left',
    headline: { x: 54, y: 18, width: 38, align: 'left', maxLines: 4 },
    supporting: { x: 56, y: 58, width: 34, align: 'left', maxLines: 3 },
    cta: { x: 56, y: 78, width: 32, align: 'left', maxLines: 2 },
    logo: { x: 70, y: 6, width: 22, align: 'right', maxLines: 1 },
  },
  {
    id: 'center-hero',
    name: 'Hero central',
    description: 'Imagem dominante com hierarquia central e alto impacto.',
    mediaFocus: 'background',
    headline: { x: 10, y: 24, width: 80, align: 'center', maxLines: 4 },
    supporting: { x: 17, y: 62, width: 66, align: 'center', maxLines: 3 },
    cta: { x: 24, y: 80, width: 52, align: 'center', maxLines: 2 },
    logo: { x: 35, y: 6, width: 30, align: 'center', maxLines: 1 },
  },
  {
    id: 'poster',
    name: 'Poster',
    description: 'Título dominante, composição de campanha e CTA forte.',
    mediaFocus: 'full',
    headline: { x: 7, y: 12, width: 86, align: 'left', maxLines: 5 },
    supporting: { x: 8, y: 66, width: 62, align: 'left', maxLines: 3 },
    cta: { x: 8, y: 84, width: 48, align: 'left', maxLines: 2 },
    logo: { x: 70, y: 7, width: 22, align: 'right', maxLines: 1 },
  },
  {
    id: 'lower-third',
    name: 'Lower third',
    description: 'Mídia preservada com bloco gráfico no terço inferior.',
    mediaFocus: 'full',
    headline: { x: 8, y: 62, width: 72, align: 'left', maxLines: 3 },
    supporting: { x: 8, y: 77, width: 66, align: 'left', maxLines: 2 },
    cta: { x: 72, y: 82, width: 20, align: 'right', maxLines: 1 },
    logo: { x: 8, y: 7, width: 25, align: 'left', maxLines: 1 },
  },
  {
    id: 'editorial-asym',
    name: 'Editorial assimétrico',
    description: 'Composição sofisticada com tensão visual e espaço negativo.',
    mediaFocus: 'left',
    headline: { x: 48, y: 12, width: 44, align: 'left', maxLines: 5 },
    supporting: { x: 56, y: 60, width: 34, align: 'left', maxLines: 3 },
    cta: { x: 56, y: 82, width: 30, align: 'left', maxLines: 2 },
    logo: { x: 7, y: 7, width: 22, align: 'left', maxLines: 1 },
  },
];

export const GRAPHIC_DIRECTIONS: GraphicDirectionDefinition[] = [
  {
    id: 'performance-bold',
    name: 'Performance Bold',
    description: 'Contraste alto, headline curta e CTA agressivo sem poluição visual.',
    tags: ['bold', 'impact', 'promo', 'social', 'modern'],
    palette: ['#111827', '#F97316', '#FFFFFF', '#F3F4F6'],
    textColor: '#FFFFFF',
    mutedTextColor: '#E5E7EB',
    ctaBackground: '#F97316',
    ctaColor: '#FFFFFF',
    overlayOpacity: 0.48,
    borderRadius: 18,
    uppercaseHeadline: true,
    preferredLayouts: ['poster', 'split-left', 'center-hero'],
  },
  {
    id: 'product-clean',
    name: 'Product Clean',
    description: 'Produto em primeiro plano, respiro, hierarquia comercial limpa.',
    tags: ['product', 'clean', 'premium', 'modern'],
    palette: ['#F8FAFC', '#111827', '#0F766E', '#FFFFFF'],
    textColor: '#111827',
    mutedTextColor: '#475569',
    ctaBackground: '#111827',
    ctaColor: '#FFFFFF',
    overlayOpacity: 0.18,
    borderRadius: 22,
    uppercaseHeadline: false,
    preferredLayouts: ['split-left', 'split-right', 'lower-third'],
  },
  {
    id: 'premium-editorial',
    name: 'Premium Editorial',
    description: 'Tipografia sofisticada, espaço negativo e ritmo de revista.',
    tags: ['premium', 'editorial', 'luxury', 'elegant'],
    palette: ['#0C0C0C', '#F4EFE7', '#B79A6B', '#FFFFFF'],
    textColor: '#F8F5EF',
    mutedTextColor: '#D7D0C6',
    ctaBackground: '#F4EFE7',
    ctaColor: '#111111',
    overlayOpacity: 0.34,
    borderRadius: 8,
    uppercaseHeadline: false,
    preferredLayouts: ['editorial-asym', 'split-right', 'center-hero'],
  },
  {
    id: 'architecture-luxury',
    name: 'Architecture Luxury',
    description: 'Imagem dominante, composição minimalista e linguagem premium de arquitetura.',
    tags: ['architecture', 'luxury', 'premium', 'editorial'],
    palette: ['#121212', '#E7E0D5', '#8C7A62', '#FFFFFF'],
    textColor: '#FFFFFF',
    mutedTextColor: '#D6D3D1',
    ctaBackground: '#E7E0D5',
    ctaColor: '#121212',
    overlayOpacity: 0.28,
    borderRadius: 4,
    uppercaseHeadline: false,
    preferredLayouts: ['lower-third', 'editorial-asym', 'split-left'],
  },
  {
    id: 'tech-modern',
    name: 'Tech Modern',
    description: 'Grid preciso, contraste digital e leitura rápida para tecnologia.',
    tags: ['tech', 'modern', 'digital', 'clean'],
    palette: ['#0B1020', '#6D5DFB', '#18C8FF', '#FFFFFF'],
    textColor: '#FFFFFF',
    mutedTextColor: '#CBD5E1',
    ctaBackground: '#6D5DFB',
    ctaColor: '#FFFFFF',
    overlayOpacity: 0.42,
    borderRadius: 20,
    uppercaseHeadline: false,
    preferredLayouts: ['split-left', 'poster', 'center-hero'],
  },
  {
    id: 'authority-minimal',
    name: 'Authority Minimal',
    description: 'Clareza, credibilidade e ritmo didático com baixa carga visual.',
    tags: ['clean', 'editorial', 'professional', 'minimal'],
    palette: ['#FAFAF9', '#1C1917', '#2563EB', '#FFFFFF'],
    textColor: '#1C1917',
    mutedTextColor: '#57534E',
    ctaBackground: '#2563EB',
    ctaColor: '#FFFFFF',
    overlayOpacity: 0.12,
    borderRadius: 16,
    uppercaseHeadline: false,
    preferredLayouts: ['split-right', 'lower-third', 'center-hero'],
  },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function layoutById(id: GraphicLayoutId): GraphicLayoutDefinition {
  return GRAPHIC_LAYOUTS.find((layout) => layout.id === id) ?? GRAPHIC_LAYOUTS[0]!;
}

function directionById(id: GraphicDirectionId): GraphicDirectionDefinition {
  return GRAPHIC_DIRECTIONS.find((direction) => direction.id === id) ?? GRAPHIC_DIRECTIONS[0]!;
}

function inferDirection(profile?: string | null): GraphicDirectionId {
  const normalized = String(profile ?? '').toLowerCase();
  if (normalized.includes('product')) return 'product-clean';
  if (normalized.includes('institutional')) return 'premium-editorial';
  if (normalized.includes('educational')) return 'authority-minimal';
  if (normalized.includes('testimonial')) return 'authority-minimal';
  if (normalized.includes('architecture')) return 'architecture-luxury';
  return 'performance-bold';
}

export function graphicFormatForChannel(channel: string): GraphicFormat {
  const normalized = channel.toLowerCase();
  if (normalized.includes('youtube') || normalized.includes('site') || normalized.includes('landing')) return '16:9';
  if (normalized.includes('feed')) return '4:5';
  return '9:16';
}

function channelKey(channel: string): string {
  const normalized = channel.toLowerCase();
  if (normalized.includes('tiktok')) return 'tiktok';
  if (normalized.includes('youtube')) return 'youtube';
  if (normalized.includes('whatsapp')) return 'whatsapp';
  if (normalized.includes('site')) return 'website';
  if (normalized.includes('landing')) return 'landing-page';
  return 'instagram';
}

function sceneScore(input: {
  headline: string;
  supporting: string;
  cta: string;
  layout: GraphicLayoutDefinition;
  direction: GraphicDirectionDefinition;
  hasMedia: boolean;
  brandColorCount: number;
}) {
  const warnings: string[] = [];
  const headlineLength = input.headline.trim().length;
  const supportingLength = input.supporting.trim().length;
  const hierarchy = headlineLength > 0 && headlineLength <= 72 ? 96 : headlineLength <= 110 ? 82 : 64;
  if (headlineLength > 110) warnings.push('Headline longa; reduza para preservar hierarquia e leitura rápida.');
  const contrast = input.direction.overlayOpacity >= 0.28 || ['#FFFFFF', '#111827', '#1C1917'].includes(input.direction.textColor) ? 94 : 84;
  const balance = input.layout.id === 'poster' && supportingLength > 150 ? 74 : 92;
  if (supportingLength > 180) warnings.push('Texto de apoio denso para o layout escolhido.');
  const density = supportingLength <= 120 && input.cta.length <= 52 ? 94 : supportingLength <= 180 ? 82 : 68;
  const safeArea = input.layout.headline.x >= 6 && input.layout.headline.x + input.layout.headline.width <= 94 && input.layout.cta.y <= 88 ? 97 : 80;
  const brandConsistency = clamp(78 + input.brandColorCount * 7 + (input.hasMedia ? 7 : 0), 0, 100);
  if (!input.hasMedia) warnings.push('Cena sem mídia real vinculada; o layout pode parecer genérico.');
  const score = Math.round((hierarchy + contrast + balance + density + safeArea + brandConsistency) / 6);
  return { score, scores: { hierarchy, contrast, balance, density, safeArea, brandConsistency }, warnings };
}

function normalizeHeadline(value: string, uppercase: boolean) {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return 'Mensagem principal';
  const shortened = trimmed.length > 120 ? `${trimmed.slice(0, 117).trim()}…` : trimmed;
  return uppercase ? shortened.toUpperCase() : shortened;
}

export function buildGraphicDesignPlan(input: BuildGraphicDesignPlanInput): GraphicDesignPlan {
  const direction = directionById(input.directionId ?? inferDirection(input.profile));
  const format = input.format ?? graphicFormatForChannel(input.channel);
  const tags = Array.from(new Set([...direction.tags, ...(input.tags ?? [])]));
  const pair = selectFontPair(channelKey(input.channel), tags);
  const brandColors = (input.brandColors ?? []).filter(Boolean).slice(0, 4);
  const palette = ([...brandColors, ...direction.palette].slice(0, 4)) as [string, string, string, string];
  const safeAreaPct = format === '9:16' ? 7 : 5;

  const scenes = input.scenes.map((scene, sceneIndex) => {
    const override = input.layoutOverrides?.[sceneIndex];
    const layoutId = override ?? direction.preferredLayouts[sceneIndex % direction.preferredLayouts.length]!;
    const layout = layoutById(layoutId);
    const headline = normalizeHeadline(input.headlineOverrides?.[sceneIndex] ?? scene.headline, direction.uppercaseHeadline);
    const supportingText = String(scene.supportingText ?? '').replace(/\s+/g, ' ').trim();
    const cta = String(scene.cta ?? '').replace(/\s+/g, ' ').trim();
    const scoreResult = sceneScore({
      headline,
      supporting: supportingText,
      cta,
      layout,
      direction,
      hasMedia: Boolean(scene.hasMedia),
      brandColorCount: brandColors.length,
    });
    return {
      sceneIndex,
      layoutId,
      headline,
      supportingText,
      cta,
      headlineFont: pair.heading.family,
      bodyFont: pair.body.family,
      headlineWeight: direction.id === 'performance-bold' ? 800 : direction.id === 'premium-editorial' || direction.id === 'architecture-luxury' ? 600 : 700,
      headlineTracking: direction.id === 'performance-bold' ? -0.03 : direction.id === 'premium-editorial' ? -0.015 : -0.02,
      layout,
      ...scoreResult,
    } satisfies GraphicScenePlan;
  });

  const overallScore = scenes.length
    ? Math.round(scenes.reduce((sum, scene) => sum + scene.score, 0) / scenes.length)
    : 0;
  const warnings = Array.from(new Set(scenes.flatMap((scene) => scene.warnings)));

  return {
    version: 1,
    directionId: direction.id,
    directionName: direction.name,
    format,
    palette,
    typography: { headingFamily: pair.heading.family, bodyFamily: pair.body.family },
    safeAreaPct,
    overlayOpacity: direction.overlayOpacity,
    borderRadius: direction.borderRadius,
    scenes,
    overallScore,
    approved: scenes.length > 0 && overallScore >= 82 && scenes.every((scene) => scene.score >= 76),
    warnings,
  };
}

export function graphicDirection(id: GraphicDirectionId): GraphicDirectionDefinition {
  return directionById(id);
}

export function graphicLayout(id: GraphicLayoutId): GraphicLayoutDefinition {
  return layoutById(id);
}
