// ─── Material Engine ──────────────────────────────────────────────────────────
// Analyzes material coverage, compatibility, palette conflicts and finish issues.

import type { ProjectContext, MaterialEngineResult, PaletteConflict, FinishConflict } from '../aie-types'

// Known incompatible combinations (simplified rules)
const INCOMPATIBLE_PAIRS: Array<[string, string, string]> = [
  ['cobre', 'prateado', 'Cobre e acabamentos prateados conflitam na paleta metálica'],
  ['rustico', 'polido', 'Acabamento rústico conflita com polido de alta reflexão'],
  ['fosco', 'espelhado', 'Fosco e espelhado no mesmo ambiente criam conflito de reflexão'],
  ['madeira escura', 'pedra escura', 'Dois materiais escuros dominantes criam peso excessivo'],
]

export function runMaterialEngine(ctx: ProjectContext): MaterialEngineResult {
  const objectsWithMaterial = ctx.objects.filter(o => o.material)
  const coverage = ctx.objects.length > 0
    ? Math.round((objectsWithMaterial.length / ctx.objects.length) * 100)
    : 0

  const missingMaterials = ctx.objects
    .filter(o => !o.material && o.category !== 'PLANT' && o.category !== 'DECOR')
    .map(o => o.name)

  const uniqueMaterials = new Set(ctx.materials.map(m => m.id)).size

  // Palette conflict detection
  const paletteConflicts: PaletteConflict[] = []
  for (let i = 0; i < ctx.materials.length; i++) {
    for (let j = i + 1; j < ctx.materials.length; j++) {
      const a = ctx.materials[i]
      const b = ctx.materials[j]
      for (const [kw1, kw2, reason] of INCOMPATIBLE_PAIRS) {
        if (
          (a.name.toLowerCase().includes(kw1) && b.name.toLowerCase().includes(kw2)) ||
          (b.name.toLowerCase().includes(kw1) && a.name.toLowerCase().includes(kw2))
        ) {
          paletteConflicts.push({ material1:a.name, material2:b.name, reason })
        }
      }
    }
  }

  // Finish conflict detection between objects
  const finishConflicts: FinishConflict[] = []
  const finishedObjs = ctx.objects.filter(o => o.finish)
  for (let i = 0; i < finishedObjs.length; i++) {
    for (let j = i + 1; j < finishedObjs.length; j++) {
      const a = finishedObjs[i]
      const b = finishedObjs[j]
      const fA = (a.finish ?? '').toLowerCase()
      const fB = (b.finish ?? '').toLowerCase()
      if ((fA.includes('fosco') && fB.includes('espelhado')) ||
          (fA.includes('espelhado') && fB.includes('fosco'))) {
        finishConflicts.push({
          objectA:a.name, finishA:a.finish!,
          objectB:b.name, finishB:b.finish!,
          reason:'Acabamentos opostos podem criar conflito visual',
        })
      }
    }
  }

  const compatible = paletteConflicts.length === 0 && finishConflicts.length === 0

  const deductions = (missingMaterials.length * 5) + (paletteConflicts.length * 10) + (finishConflicts.length * 5)
  const coverageScore = coverage * 0.6
  const conflictPenalty = Math.min(40, deductions)
  const score = Math.max(0, Math.round(coverageScore + 40 - conflictPenalty))

  return {
    coverage, uniqueMaterials, compatible,
    paletteConflicts, missingMaterials, finishConflicts,
    score,
  }
}
