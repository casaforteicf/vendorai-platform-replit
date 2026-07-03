// ─── Learning Engine ──────────────────────────────────────────────────────────
// Accumulates architect preferences from project history.
// Architecture only — no persistence yet.

import type { ProjectContext, LearningProfile, LightingType, LensType, ColorTemperature } from '../aie-types'

const DEFAULT_PROFILE: LearningProfile = {
  architectId:        'default',
  preferredWoods:     ['Freijó Natural', 'Carvalho Europeu'],
  preferredStones:    ['Porcelanato Cimento'],
  preferredMetals:    ['Inox Escovado'],
  preferredBrands:    ['Portobello', 'Todeschini', 'Docol'],
  preferredLens:      '35mm',
  preferredLighting:  'NATURAL',
  preferredStyles:    ['Contemporâneo', 'Minimalista'],
  preferredColorTemp: 'WARM',
  projectCount:       7,
  lastUpdated:        new Date().toISOString().substring(0, 10),
  confidenceScore:    68,
}

export function buildLearningProfile(ctxHistory: ProjectContext[]): LearningProfile {
  if (ctxHistory.length === 0) return DEFAULT_PROFILE

  // Collect material preferences from history
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
      if (['freijó','carvalho','nogal','pinho','mdf'].some(k=>name.includes(k))) {
        woodFreq[m.name] = (woodFreq[m.name]??0) + 1
      }
      if (['porcelanato','granito','mármore','pedra'].some(k=>name.includes(k))) {
        stoneFreq[m.name] = (stoneFreq[m.name]??0) + 1
      }
      if (['inox','cobre','latão','alumínio'].some(k=>name.includes(k))) {
        metalFreq[m.name] = (metalFreq[m.name]??0) + 1
      }
      if (m.manufacturer) brandFreq[m.manufacturer] = (brandFreq[m.manufacturer]??0) + 1
    }
    if (ctx.style) styleFreq[ctx.style.name] = (styleFreq[ctx.style.name]??0) + 1
    if (ctx.cameraAngle) lensFreq[ctx.cameraAngle] = (lensFreq[ctx.cameraAngle]??0) + 1
    if (ctx.lightingType) lightFreq[ctx.lightingType] = (lightFreq[ctx.lightingType]??0) + 1
  }

  const top = (freq: Record<string,number>, n: number) =>
    Object.entries(freq).sort((a,b)=>b[1]-a[1]).slice(0,n).map(([k])=>k)

  const preferredLens   = (top(lensFreq, 1)[0] ?? '35mm') as LensType
  const preferredLight  = (top(lightFreq, 1)[0] ?? 'NATURAL') as LightingType
  const preferredStyles = top(styleFreq, 3)
  const confidenceScore = Math.min(100, Math.round((ctxHistory.length / 10) * 100))

  return {
    architectId:        'user',
    preferredWoods:     top(woodFreq, 3),
    preferredStones:    top(stoneFreq, 3),
    preferredMetals:    top(metalFreq, 2),
    preferredBrands:    top(brandFreq, 5),
    preferredLens,
    preferredLighting:  preferredLight,
    preferredStyles:    preferredStyles.length > 0 ? preferredStyles : DEFAULT_PROFILE.preferredStyles,
    preferredColorTemp: 'WARM' as ColorTemperature,
    projectCount:       ctxHistory.length,
    lastUpdated:        new Date().toISOString().substring(0, 10),
    confidenceScore,
  }
}

export function getMockLearningProfile(): LearningProfile {
  return DEFAULT_PROFILE
}
