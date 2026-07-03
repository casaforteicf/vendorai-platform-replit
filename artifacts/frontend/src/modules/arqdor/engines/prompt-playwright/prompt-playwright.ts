// ─── Prompt Playwright ────────────────────────────────────────────────────────
// Converts AIEResult + ProjectContext into render-ready prompts
// for different AI image translators, with adjustable detail level.
// Pure function — no external dependencies.

import type { AIEResult, ProjectContext, LightingProfile, PhotographyProfile } from '../aie/aie-types'

// ════════════════════════════════════════════════════════════════════════════
// Public types
// ════════════════════════════════════════════════════════════════════════════

export type TranslatorId = 'flux-1.1' | 'kontext' | 'midjourney' | 'gpt-image-1'
export type DetailLevel  = 'conciso' | 'detalhado' | 'tecnico'

export interface TranslatorInfo {
  id:       TranslatorId
  label:    string
  icon:     string
  desc:     string
  badge:    string
  color:    string
}

export interface PromptSection {
  id:     string
  label:  string
  text:   string
  accent: string
}

export interface PlaywrightPrompt {
  translator:      TranslatorId
  detailLevel:     DetailLevel
  prompt:          string
  negativePrompt:  string
  parameters:      string      // translator-specific params (e.g. --ar 16:9 for MJ)
  estimatedTokens: number
  sections:        PromptSection[]
}

// ════════════════════════════════════════════════════════════════════════════
// Translator metadata
// ════════════════════════════════════════════════════════════════════════════

export const TRANSLATORS: TranslatorInfo[] = [
  {
    id:    'flux-1.1',
    label: 'Flux 1.1 Pro Ultra',
    icon:  '⚡',
    desc:  'Fotorrealismo de alta fidelidade',
    badge: 'RAW',
    color: '#f59e0b',
  },
  {
    id:    'kontext',
    label: 'Flux Kontext Pro',
    icon:  '🔧',
    desc:  'Edição preservando geometria',
    badge: 'EDIT',
    color: '#3b82f6',
  },
  {
    id:    'midjourney',
    label: 'Midjourney v6',
    icon:  '🎨',
    desc:  'Alta qualidade artística',
    badge: 'v6',
    color: '#8b5cf6',
  },
  {
    id:    'gpt-image-1',
    label: 'GPT-image-1',
    icon:  '🤖',
    desc:  'OpenAI nativo',
    badge: 'GPT',
    color: '#10b981',
  },
]

export const DETAIL_LEVELS: { id: DetailLevel; label: string; desc: string }[] = [
  { id:'conciso',   label:'Conciso',   desc:'Elementos essenciais — ideal para testes rápidos' },
  { id:'detalhado', label:'Detalhado', desc:'Materiais, composição, atmosfera completa' },
  { id:'tecnico',   label:'Técnico',   desc:'Valores exatos do AIE — máxima precisão' },
]

// ════════════════════════════════════════════════════════════════════════════
// Internal helpers
// ════════════════════════════════════════════════════════════════════════════

function lightingToText(l: LightingProfile, detail: DetailLevel): string {
  const temp = l.colorTemperature === 'WARM' ? 'warm' : l.colorTemperature === 'COOL' ? 'cool' : 'neutral'
  const dir  = { FRONT:'front-lit', SIDE:'side-lit', BACK:'backlit', TOP:'top-lit', AMBIENT:'ambient' }[l.direction]
  const shad = { SOFT:'soft shadows', HARD:'hard shadows', NONE:'shadowless' }[l.shadows]

  if (detail === 'conciso') return `${temp} ${l.primaryType.toLowerCase()} lighting, ${dir}`
  if (detail === 'detalhado') return `${l.primaryType.toLowerCase()} lighting ${temp} tone, ${dir}, ${l.intensity.toLowerCase()} intensity, ${shad}`
  return `${l.primaryType.toLowerCase()} lighting, ${l.kelvin}K ${temp}, ${dir}, ${l.intensity.toLowerCase()} intensity, ${shad}${l.hdri ? `, HDRI: ${l.hdri}` : ''}`
}

function photographyToText(p: PhotographyProfile, detail: DetailLevel): string {
  const persp = { EYE_LEVEL:'eye-level shot', LOW_ANGLE:'low angle shot', HIGH_ANGLE:'high angle shot', BIRD_EYE:"bird's-eye view" }[p.perspective]
  const dof   = { SHALLOW:'shallow depth of field', MEDIUM:'medium depth of field', DEEP:'deep depth of field' }[p.dof]
  const mood  = p.mood.toLowerCase()

  if (detail === 'conciso') return `${p.lens} lens, ${persp}, ${mood} mood`
  if (detail === 'detalhado') return `${p.lens} lens, ${persp}, ${dof}, ${mood} mood, ${p.contrast.toLowerCase()} contrast, ${p.compositionRule.replace(/_/g,' ').toLowerCase()}`
  return `${p.lens} focal length, ${persp}, camera height ${p.cameraHeight}m, ${dof}, ${mood} mood, ${p.contrast.toLowerCase()} contrast, ${p.whiteBalance.toLowerCase().replace(/_/g,' ')} white balance, ${p.compositionRule.replace(/_/g,' ').toLowerCase()}`
}

function heroMaterialsToText(ctx: ProjectContext, detail: DetailLevel): string {
  const heroObjects = ctx.objects
    .filter(o => (o.visualWeight ?? 0) >= 60 && o.material)
    .sort((a, b) => (b.visualWeight ?? 0) - (a.visualWeight ?? 0))
    .slice(0, detail === 'conciso' ? 2 : detail === 'detalhado' ? 4 : 6)

  if (heroObjects.length === 0) return ''

  return heroObjects.map(o => {
    if (detail === 'conciso') return `${o.material}`
    if (detail === 'detalhado') return `${o.name} in ${o.material} (${o.finish ?? 'natural finish'})`
    return `${o.name}: ${o.material}, ${o.finish ?? 'natural finish'}${o.color ? `, tone ${o.color}` : ''}`
  }).join(', ')
}

function sceneDescriptionToText(ctx: ProjectContext, aie: AIEResult, detail: DetailLevel): string {
  const style = ctx.style?.name ?? 'contemporary'
  const heroObj = ctx.objects
    .sort((a, b) => (b.visualWeight ?? 0) - (a.visualWeight ?? 0))[0]

  if (detail === 'conciso') {
    return `${style} interior design render, ${heroObj ? heroObj.name.toLowerCase() : 'interior scene'}`
  }

  const composition = aie.composition
  const symm = composition.symmetry === 'SYMMETRIC' ? 'symmetric composition' : 'balanced asymmetric composition'
  const intent = ctx.style?.designIntent?.slice(0, 2).join(', ').toLowerCase() ?? ''

  if (detail === 'detalhado') {
    return `${style} interior design, ${heroObj?.name.toLowerCase() ?? 'space'} as hero element, ${symm}${intent ? `, ${intent}` : ''}`
  }

  const hierarchy = aie.composition.hierarchy
    .filter(h => h.level === 1)
    .flatMap(h => h.objects)
    .slice(0, 2)
    .join(', ')

  return `${style} interior design, hero: ${hierarchy || heroObj?.name.toLowerCase() || 'main element'}, ${symm}, overall score ${aie.scores.overall}/100, render readiness ${aie.scores.renderReadiness}/100`
}

function dnaToText(ctx: ProjectContext, detail: DetailLevel): string {
  if (!ctx.dna) return ''
  if (detail === 'conciso') {
    const parts = ctx.dna.split(',').slice(0, 1)
    return parts[0]?.trim() ?? ''
  }
  return ctx.dna
}

function qualityTagsForTranslator(translator: TranslatorId, detail: DetailLevel): string {
  const base: Record<TranslatorId, string[]> = {
    'flux-1.1':    ['photorealistic', 'architectural visualization', '8K resolution', 'professional lighting', 'ultra-detailed'],
    'kontext':     ['preserve structure', 'maintain geometry', 'photorealistic render', 'architectural quality'],
    'midjourney':  ['architectural visualization', 'photorealistic', 'professional photography', 'interior design'],
    'gpt-image-1': ['photorealistic architectural render', 'professional interior photography', 'high resolution'],
  }

  const extra: Record<TranslatorId, string[]> = {
    'flux-1.1':    ['raw photo', 'cinematic', 'hyperrealistic textures'],
    'kontext':     ['realistic materials', 'accurate shadows'],
    'midjourney':  ['award-winning photography', 'magazine quality'],
    'gpt-image-1': ['detailed textures', 'accurate lighting', 'professional staging'],
  }

  const tags = detail === 'conciso' ? base[translator].slice(0, 2) : [...base[translator], ...extra[translator]]
  return tags.join(', ')
}

function negativePromptFor(translator: TranslatorId): string {
  const common = 'cartoon, sketch, drawing, anime, distorted proportions, bad geometry, blurry, low quality, watermark, text, people, humans, unrealistic materials'
  if (translator === 'midjourney') return ''  // MJ uses --no for negatives
  return common
}

function parametersFor(translator: TranslatorId, aie: AIEResult): string {
  if (translator === 'midjourney') {
    const ar = '16:9'
    const style = aie.scores.overall >= 80 ? 'raw' : 'cute'
    return `--ar ${ar} --v 6.1 --style ${style} --q 2 --no cartoon, sketch, distorted`
  }
  if (translator === 'flux-1.1') {
    return 'aspect_ratio: 16:9, output_format: jpeg, output_quality: 95, safety_tolerance: 2'
  }
  if (translator === 'kontext') {
    return 'aspect_ratio: 16:9, output_format: jpeg, output_quality: 95'
  }
  return 'size: 1792x1024, quality: hd, style: vivid'
}

// ════════════════════════════════════════════════════════════════════════════
// Main builder
// ════════════════════════════════════════════════════════════════════════════

export function buildPrompt(
  ctx:       ProjectContext,
  aie:       AIEResult,
  translator: TranslatorId,
  detail:    DetailLevel,
): PlaywrightPrompt {
  const scene     = sceneDescriptionToText(ctx, aie, detail)
  const materials = heroMaterialsToText(ctx, detail)
  const lighting  = lightingToText(aie.lighting, detail)
  const camera    = photographyToText(aie.photography, detail)
  const dna       = dnaToText(ctx, detail)
  const quality   = qualityTagsForTranslator(translator, detail)

  const sections: PromptSection[] = []

  sections.push({ id:'scene', label:'Cena',        text: scene,     accent: '124,58,237' })
  if (materials) sections.push({ id:'materials', label:'Materiais', text: materials, accent: '16,185,129' })
  sections.push({ id:'lighting', label:'Iluminação', text: lighting, accent: '245,158,11' })
  sections.push({ id:'camera',   label:'Câmera',     text: camera,   accent: '59,130,246' })
  if (dna) sections.push({ id:'dna', label:'DNA', text: dna, accent: '168,85,247' })
  sections.push({ id:'quality',  label:'Qualidade',  text: quality,  accent: '52,211,153' })

  let prompt: string

  if (translator === 'kontext') {
    const narrative = aie.photography.narrative
    const instrPrefix = narrative
      ? `${narrative} `
      : `Render this interior scene professionally. `
    prompt = instrPrefix + sections.map(s => s.text).filter(Boolean).join('. ') + '.'
  } else if (translator === 'midjourney') {
    prompt = sections.map(s => s.text).filter(Boolean).join(', ')
  } else {
    prompt = sections.map(s => s.text).filter(Boolean).join(', ')
  }

  return {
    translator,
    detailLevel: detail,
    prompt,
    negativePrompt: negativePromptFor(translator),
    parameters: parametersFor(translator, aie),
    estimatedTokens: Math.round(prompt.length / 4),
    sections,
  }
}
