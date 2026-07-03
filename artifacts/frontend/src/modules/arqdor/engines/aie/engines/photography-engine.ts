// ─── Photography Engine ───────────────────────────────────────────────────────
// Derives or builds a photography profile from the project context.

import type { ProjectContext, PhotographyProfile, LensType, CompositionRule, DOFType, MoodType } from '../aie-types'

const STYLE_TO_PHOTO: Record<string, Partial<PhotographyProfile>> = {
  MINIMALISTA:   { lens:'35mm', cameraHeight:1.0, compositionRule:'RULE_OF_THIRDS', mood:'NEUTRAL', contrast:'LOW',    dof:'DEEP',    perspective:'EYE_LEVEL', narrative:'Silêncio visual e espaço negativo intencional' },
  CONTEMPORANEO: { lens:'35mm', cameraHeight:1.2, compositionRule:'RULE_OF_THIRDS', mood:'NEUTRAL', contrast:'MEDIUM', dof:'MEDIUM',  perspective:'EYE_LEVEL', narrative:'Elegante e acessível, equilíbrio entre perspectiva e detalhe' },
  ESCANDINAVO:   { lens:'28mm', cameraHeight:1.0, compositionRule:'GOLDEN_RATIO',   mood:'WARM',    contrast:'LOW',    dof:'MEDIUM',  perspective:'EYE_LEVEL', narrative:'Wide com luz lateral, tons quentes, estilo editorial hygge' },
  INDUSTRIAL:    { lens:'24mm', cameraHeight:1.4, compositionRule:'LEADING_LINES',  mood:'DRAMATIC',contrast:'HIGH',   dof:'DEEP',    perspective:'LOW_ANGLE',  narrative:'Angular dramático, alto contraste, estilo editorial urbano' },
  JAPANDI:       { lens:'35mm', cameraHeight:0.8, compositionRule:'GOLDEN_RATIO',   mood:'NEUTRAL', contrast:'LOW',    dof:'SHALLOW', perspective:'LOW_ANGLE',  narrative:'Angular baixo, espaço negativo intencional, equilíbrio zen' },
  BOHO:          { lens:'28mm', cameraHeight:1.0, compositionRule:'RULE_OF_THIRDS', mood:'WARM',    contrast:'MEDIUM', dof:'SHALLOW', perspective:'EYE_LEVEL',  narrative:'Wide colorido, estilo lifestyle descontraído' },
  LUXO:          { lens:'35mm', cameraHeight:1.1, compositionRule:'SYMMETRIC',      mood:'MOODY',   contrast:'MEDIUM', dof:'SHALLOW', perspective:'EYE_LEVEL',  narrative:'Iluminação de joia, estilo hotel boutique' },
  ORGANICO:      { lens:'28mm', cameraHeight:1.0, compositionRule:'GOLDEN_RATIO',   mood:'AIRY',    contrast:'LOW',    dof:'MEDIUM',  perspective:'EYE_LEVEL',  narrative:'Orgânico, ausência de retas, conexão com natureza' },
}

export function runPhotographyEngine(ctx: ProjectContext): PhotographyProfile {
  const styleName = ctx.style?.name?.toUpperCase() ?? ''
  const preset    = STYLE_TO_PHOTO[styleName] ?? {}

  const lens:            LensType        = (ctx.cameraAngle as LensType) || preset.lens || '35mm'
  const cameraHeight:    number           = preset.cameraHeight ?? 1.1
  const compositionRule: CompositionRule  = preset.compositionRule || 'RULE_OF_THIRDS'
  const mood:            MoodType         = preset.mood || 'NEUTRAL'
  const contrast                          = preset.contrast || 'MEDIUM'
  const dof:             DOFType          = preset.dof || 'MEDIUM'
  const perspective                       = preset.perspective || 'EYE_LEVEL'
  const narrative                         = preset.narrative || 'Render arquitetônico padrão'
  const defined = !!(ctx.cameraAngle || ctx.style)

  const score = defined
    ? (ctx.photographyProfile ? 90 : 70)
    : 35

  return {
    lens, cameraHeight, compositionRule, mood, contrast,
    exposure:'NORMAL', whiteBalance:'AUTO', dof, perspective, narrative,
    defined, score,
  }
}
