import type { Project, RenderReviewScore } from './arqdor-domain-types'
import { getAllObjects } from './arqdor-relationships'

// ─── Structural Readiness ─────────────────────────────────────────────────────
// Deterministic project-readiness calculation. This is NOT visual AI review and
// MUST NOT be presented as Fidelity or as a comparison between base/render images.

export const STRUCTURAL_READINESS_TITLE = 'Structural Readiness'

export function calculateStructuralReadiness(project: Project): RenderReviewScore {
  const objs        = getAllObjects(project)
  const nonEnv      = objs.filter(o => o.category !== 'AMBIENTE')
  const total       = nonEnv.length || 1

  // Geometry: penalize low-confidence objects with canChangeGeometry=false
  const geoIssues   = nonEnv.filter(o => o.confidence < 60 && !o.aiPermissions.canChangeGeometry)
  const geometryScore = Math.max(0, Math.round(100 - (geoIssues.length / total) * 100 * 0.6))

  // Material: penalize objects with canChangeMaterial=true but no material specified
  const matIssues   = nonEnv.filter(o => o.aiPermissions.canChangeMaterial && !o.material?.name)
  const materialScore = Math.max(0, Math.round(100 - (matIssues.length / total) * 100 * 0.8))

  // Lighting: check if lighting config is complete
  const rc          = project.renderConfig
  const lightingOk  = rc.lightingMood && rc.hdri && rc.whiteBalance
  const lightingScore = lightingOk ? 88 : 65

  // Furniture: penalize very high risk objects
  const furnitureIssues = nonEnv.filter(o => o.aiRisk.level === 'VERY_HIGH')
  const furnitureScore  = Math.max(0, Math.round(100 - (furnitureIssues.length / total) * 100 * 0.7))

  // Camera: check if render config is filled
  const cameraOk   = rc.lens && rc.cameraHeight && rc.resolution
  const cameraScore = cameraOk ? 100 : 70

  const overallScore = Math.round(
    (geometryScore * 0.25 + materialScore * 0.3 + lightingScore * 0.2 +
     furnitureScore * 0.15 + cameraScore * 0.1)
  )

  const issues:  string[] = []
  const fixes:   string[] = []

  if (geoIssues.length) {
    issues.push(`${geoIssues.length} objeto(s) com confiança baixa e geometria bloqueada`)
    fixes.push('Adicione imagens de referência para objetos com baixa confiança')
  }
  if (matIssues.length) {
    issues.push(`${matIssues.length} objeto(s) sem material especificado`)
    fixes.push('Especifique materiais para todos os objetos com permissão de alteração')
  }
  if (!lightingOk) {
    issues.push('Configuração de iluminação incompleta')
    fixes.push('Preencha HDRI, mood e balanço de branco no Render Config')
  }
  if (furnitureIssues.length) {
    issues.push(`${furnitureIssues.length} objeto(s) com risco MUITO ALTO de alteração não intencional`)
    fixes.push('Bloqueie permissões dos objetos com risco MUITO ALTO ou adicione referências')
  }
  if (!cameraOk) {
    issues.push('Configuração de câmera incompleta')
    fixes.push('Defina lente, altura e resolução no Render Config')
  }

  return {
    geometryScore,
    materialScore,
    lightingScore,
    furnitureScore,
    cameraScore,
    overallScore,
    detectedIssues: issues,
    suggestedFixes: fixes,
  }
}

/**
 * @deprecated Use calculateStructuralReadiness. Kept temporarily so legacy UI
 * callers do not break while the monolithic ArqdorPage is migrated safely.
 */
export const calculateMockRenderScore = calculateStructuralReadiness

// ─── Readiness label helpers ──────────────────────────────────────────────────

export function scoreColor(score: number): string {
  if (score >= 90) return '#22c55e'
  if (score >= 75) return '#eab308'
  if (score >= 60) return '#f97316'
  return '#ef4444'
}

export function scoreLabel(score: number): string {
  if (score >= 90) return 'Excelente'
  if (score >= 75) return 'Bom'
  if (score >= 60) return 'Regular'
  return 'Crítico'
}

export const STRUCTURAL_READINESS_DIMENSIONS: { key: keyof RenderReviewScore; label: string }[] = [
  { key: 'geometryScore',  label: 'Geometria'  },
  { key: 'materialScore',  label: 'Materiais'  },
  { key: 'lightingScore',  label: 'Iluminação' },
  { key: 'furnitureScore', label: 'Mobiliário' },
  { key: 'cameraScore',    label: 'Câmera'     },
]

/** @deprecated Use STRUCTURAL_READINESS_DIMENSIONS. */
export const SCORE_DIMENSIONS = STRUCTURAL_READINESS_DIMENSIONS
