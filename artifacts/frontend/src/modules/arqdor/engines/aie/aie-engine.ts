// ─── AIE — Architectural Intelligence Engine (Orchestrator) ──────────────────
// Runs all sub-engines and returns a complete AIEResult.
// Architecture only — no external AI integration.

import type { ProjectContext, AIEResult, ProjectScores } from './aie-types'
import { runDesignIntentEngine }  from './engines/design-intent-engine'
import { runCompositionEngine }   from './engines/composition-engine'
import { runVisualWeightEngine }  from './engines/visual-weight-engine'
import { runConsistencyEngine }   from './engines/consistency-engine'
import { runMaterialEngine }      from './engines/material-engine'
import { runLightingEngine }      from './engines/lighting-engine'
import { runPhotographyEngine }   from './engines/photography-engine'
import { runValidationEngine }    from './engines/validation-engine'
import { runReviewEngine }        from './engines/review-engine'
import { runCorrectionEngine }    from './engines/correction-engine'
import { getMockLearningProfile } from './engines/learning-engine'
import { buildRecommendations }   from './engines/recommendation-engine'

function computeRenderReadiness(ctx: ProjectContext, partial: Omit<AIEResult, 'renderReadiness'|'recommendations'>) {
  const { material, lighting, photography, validation } = partial

  const blocking = []
  const warnings = []
  const passed   = []

  if (material.coverage < 70) {
    blocking.push({ label:'Material ausente em maioria dos objetos', description:`Cobertura atual: ${material.coverage}%`, blocking:true })
  } else {
    passed.push({ label:`Material: ${material.coverage}% de cobertura`, blocking:false })
  }

  if (!lighting.defined) {
    blocking.push({ label:'Perfil de iluminação não definido', blocking:true })
  } else {
    passed.push({ label:`Iluminação: ${lighting.primaryType} ${lighting.kelvin}K`, blocking:false })
  }

  if (validation.fail > 0) {
    blocking.push({ label:`${validation.fail} validação(ões) crítica(s) pendente(s)`, blocking:true })
  } else {
    passed.push({ label:'Validações críticas: nenhuma', blocking:false })
  }

  if (!ctx.renderGoal) {
    warnings.push({ label:'Objetivo de render não definido', blocking:false })
  } else {
    passed.push({ label:`Objetivo: ${ctx.renderGoal}`, blocking:false })
  }

  if (!photography.defined) {
    warnings.push({ label:'Perfil fotográfico não definido', blocking:false })
  } else {
    passed.push({ label:`Câmera: ${photography.lens} — ${photography.perspective}`, blocking:false })
  }

  if (material.missingMaterials.length > 0) {
    warnings.push({ label:`${material.missingMaterials.length} objeto(s) sem material`, description:material.missingMaterials.slice(0,3).join(', '), blocking:false })
  }

  if (!ctx.dna) {
    warnings.push({ label:'DNA do projeto ausente', blocking:false })
  } else {
    passed.push({ label:'DNA: definido', blocking:false })
  }

  const blockingPenalty = blocking.length * 15
  const warningPenalty  = warnings.length * 5
  const score = Math.max(0, Math.min(100, 100 - blockingPenalty - warningPenalty))
  const ready = score >= 80 && blocking.length === 0

  return { score, ready, missing:blocking, warnings, passed }
}

function buildScores(partial: {
  material:     { score: number }
  consistency:  { score: number }
  composition:  { score: number }
  lighting:     { score: number }
  photography:  { score: number }
  validation:   { score: number }
  designIntent: { coverageScore: number }
  renderReadiness: { score: number }
}): ProjectScores {
  const geometry      = partial.validation.score
  const material      = partial.material.score
  const composition   = partial.composition.score
  const lighting      = partial.lighting.score
  const photography   = partial.photography.score
  const consistency   = partial.consistency.score
  const renderReadiness = partial.renderReadiness.score
  const promptQuality = Math.round((partial.designIntent.coverageScore + renderReadiness) / 2)
  const overall       = Math.round(
    geometry * 0.10 + material * 0.20 + composition * 0.15 +
    lighting * 0.15 + photography * 0.10 + consistency * 0.15 +
    renderReadiness * 0.15
  )

  return { geometry, material, composition, lighting, photography, consistency, renderReadiness, promptQuality, overall }
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function runAIE(ctx: ProjectContext): AIEResult {
  const timestamp    = new Date().toISOString()

  const designIntent  = runDesignIntentEngine(ctx)
  const composition   = runCompositionEngine(ctx)
  const visualWeight  = runVisualWeightEngine(ctx)
  const consistency   = runConsistencyEngine(ctx)
  const material      = runMaterialEngine(ctx)
  const lighting      = runLightingEngine(ctx)
  const photography   = runPhotographyEngine(ctx)
  const validation    = runValidationEngine(ctx)
  const review        = runReviewEngine(ctx)
  const learning      = getMockLearningProfile()

  const partial = {
    projectId: ctx.id, timestamp,
    designIntent, composition, visualWeight, consistency, material,
    lighting, photography, validation,
    review, learning,
    scores: {} as ProjectScores,  // filled below
    renderReadiness: { score:0, ready:false, missing:[], warnings:[], passed:[] }, // filled below
    recommendations: [],
  }

  const renderReadiness = computeRenderReadiness(ctx, partial)
  const scores          = buildScores({ ...partial, renderReadiness })

  const withReadiness = { ...partial, renderReadiness, scores }
  const recommendations = buildRecommendations(ctx, withReadiness)

  return { ...withReadiness, recommendations }
}
