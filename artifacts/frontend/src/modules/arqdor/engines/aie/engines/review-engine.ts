// ─── Review Engine ────────────────────────────────────────────────────────────
// Compares a rendered image against the project model.
// Architecture only — comparison is mocked pending real AI integration.

import type { ProjectContext, ReviewComparison, ReviewDifference } from '../aie-types'

export function runReviewEngine(ctx: ProjectContext): ReviewComparison | undefined {
  if (!ctx.lastRenderUrl) return undefined

  // Mocked differences based on common render issues
  const differences: ReviewDifference[] = [
    { type:'MATERIAL', description:'Acabamento do MDF aparece mais brilhante do que o especificado', severity:'MINOR', object:'Marcenaria' },
    { type:'LIGHTING', description:'Sombras mais duras do que o perfil de iluminação suave definido', severity:'MINOR' },
    { type:'COMPOSITION', description:'Ângulo da câmera ligeiramente diferente do especificado (35mm)', severity:'MINOR' },
  ]

  // Mock score based on how many objects have material
  const materialCoverage = ctx.objects.length > 0
    ? (ctx.objects.filter(o=>o.material).length / ctx.objects.length) * 100
    : 50
  const matchScore = Math.min(100, Math.round(materialCoverage * 0.7 + 30))

  const suggestions = [
    'Reduzir intensidade das sombras para corresponder ao perfil de iluminação difusa',
    'Ajustar temperatura de cor do ambiente para 3200K conforme especificado',
    'Verificar acabamento fosco no MDF — o render está interpretando como semi-brilho',
  ]

  return {
    projectId:   ctx.id,
    renderUrl:   ctx.lastRenderUrl,
    differences,
    matchScore,
    suggestions,
    status: matchScore >= 90 ? 'APPROVED' : matchScore >= 75 ? 'IN_REVIEW' : 'NEEDS_CORRECTION',
  }
}
