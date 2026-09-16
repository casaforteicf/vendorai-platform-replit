// ─── Learning Engine ──────────────────────────────────────────────────────────
// Accumulates architect preferences exclusively from real project history.
// Empty history must stay empty: production UI must never invent preferences.

import type { ProjectContext, LearningProfile, LightingType, LensType, ColorTemperature } from '../aie-types'

export const EMPTY_LEARNING_PROFILE: LearningProfile = {
  architectId:        'unassigned',
  preferredWoods:     [],
  preferredStones:    [],
  preferredMetals:    [],
  preferredBrands:    [],
  preferredLens:      '35mm',
  preferredLighting:  'NATURAL',
  preferredStyles:    [],
  preferredColorTemp: 'WARM',
  projectCount:       0,
  lastUpdated:        '',
  confidenceScore:    0,
}

export function buildLearningProfile(ctxHistory: ProjectContext[]): LearningProfile {
  if (ctxHistory.length === 0) return { ...EMPTY_LEARNING_PROFILE }

  const woodFreq: Record<string, number> = {}
  const stoneFreq: Record<string, number> = {}
  const metalFreq: Record<string, number> = {}
  const brandFreq: Record<string, number> = {}
  const styleFreq: Record<string, number> = {}
  const lensFreq:  Record<string, number> = {}
  const lightFreq: Record<string, number> = {}

  for (const ctx of ctxHistory) {
    for (const m of ctx.materials) {
      const name = m.name.toLowerCase()
      if (['freijó','carvalho','nogal','pinho','mdf'].some(k => name.includes(k))) {
        woodFreq[m.name] = (woodFreq[m.name] ?? 0) + 1
      }
      if (['porcelanato','granito','mármore','pedra'].some(k => name.includes(k))) {
        stoneFreq[m.name] = (stoneFreq[m.name] ?? 0) + 1
      }
      if (['inox','cobre','latão','alumínio'].some(k => name.includes(k))) {
        metalFreq[m.name] = (metalFreq[m.name] ?? 0) + 1
      }
      if (m.manufacturer) brandFreq[m.manufacturer] = (brandFreq[m.manufacturer] ?? 0) + 1
    }
    if (ctx.style?.name) styleFreq[ctx.style.name] = (styleFreq[ctx.style.name] ?? 0) + 1
    if (ctx.cameraAngle) lensFreq[ctx.cameraAngle] = (lensFreq[ctx.cameraAngle] ?? 0) + 1
    if (ctx.lightingType) lightFreq[ctx.lightingType] = (lightFreq[ctx.lightingType] ?? 0) + 1
  }

  const top = (freq: Record<string, number>, n: number) =>
    Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, n).map(([key]) => key)

  const preferredLens = (top(lensFreq, 1)[0] ?? EMPTY_LEARNING_PROFILE.preferredLens) as LensType
  const preferredLight = (top(lightFreq, 1)[0] ?? EMPTY_LEARNING_PROFILE.preferredLighting) as LightingType
  const confidenceScore = Math.min(100, Math.round((ctxHistory.length / 10) * 100))

  return {
    architectId:        'user',
    preferredWoods:     top(woodFreq, 3),
    preferredStones:    top(stoneFreq, 3),
    preferredMetals:    top(metalFreq, 2),
    preferredBrands:    top(brandFreq, 5),
    preferredLens,
    preferredLighting:  preferredLight,
    preferredStyles:    top(styleFreq, 3),
    preferredColorTemp: 'WARM' as ColorTemperature,
    projectCount:       ctxHistory.length,
    lastUpdated:        new Date().toISOString().substring(0, 10),
    confidenceScore,
  }
}

/**
 * Compatibility shim for older imports.
 * It intentionally returns an empty profile; no mock preference is allowed in production.
 */
export function getMockLearningProfile(): LearningProfile {
  return { ...EMPTY_LEARNING_PROFILE }
}
