// ─── Composition Engine ───────────────────────────────────────────────────────
// Calculates visual composition metrics: weight, hierarchy, symmetry, balance.

import type {
  ProjectContext, CompositionMetrics, WeightDistribution,
  HierarchyLevel, AttentionCenter, SymmetryType, RhythmType,
} from '../aie-types'

function calcVisualWeight(obj: { category: string; visualWeight?: number }): number {
  if (obj.visualWeight !== undefined) return obj.visualWeight
  const defaultsByCategory: Record<string, number> = {
    SOFA:70, TABLE:65, BED:75, KITCHEN:80, CABINETRY:85, REFRIGERATOR:60,
    OVEN:55, LIGHTING:40, PLANT:15, CHAIR:35, ARMCHAIR:45, MATTRESS:20,
    FAUCET:25, SINK:30, HANDLE:10, HARDWARE:8, WINDOW:20, DOOR:30,
    FLOORING:50, WALL_COVERING:45, STONE:70, DECOR:20, CUSTOM:40,
  }
  return defaultsByCategory[obj.category] ?? 40
}

export function runCompositionEngine(ctx: ProjectContext): CompositionMetrics {
  const objects = ctx.objects
  if (objects.length === 0) {
    return {
      totalVisualWeight: 0,
      weightDistribution: { left:0, right:0, top:0, bottom:0, center:0 },
      dominantAxis: 'HORIZONTAL',
      symmetry: 'ASYMMETRIC_UNBALANCED',
      rhythm: 'RANDOM',
      contrastLevel: 'LOW',
      hierarchy: [],
      attentionCenter: { x:0.5, y:0.5, object:'(vazio)' },
      score: 0,
    }
  }

  const weights = objects.map(o => calcVisualWeight(o))
  const total   = weights.reduce((a, b) => a + b, 0)
  const avg     = total / weights.length

  // Simulate spatial distribution based on object order (mock heuristic)
  const leftObjs   = objects.slice(0, Math.floor(objects.length / 2))
  const rightObjs  = objects.slice(Math.floor(objects.length / 2))
  const leftWeight  = leftObjs.reduce((s, o) => s + calcVisualWeight(o), 0)
  const rightWeight = rightObjs.reduce((s, o) => s + calcVisualWeight(o), 0)
  const topWeight   = objects.slice(0, Math.ceil(objects.length * 0.3)).reduce((s,o)=>s+calcVisualWeight(o),0)
  const bottomWeight= objects.slice(Math.floor(objects.length * 0.7)).reduce((s,o)=>s+calcVisualWeight(o),0)

  const dist: WeightDistribution = {
    left:   total > 0 ? Math.round(leftWeight  / total * 100) : 50,
    right:  total > 0 ? Math.round(rightWeight / total * 100) : 50,
    top:    total > 0 ? Math.round(topWeight   / total * 100) : 50,
    bottom: total > 0 ? Math.round(bottomWeight/ total * 100) : 50,
    center: Math.max(0, 100 - Math.abs(50 - Math.round(leftWeight / total * 100)) * 2),
  }

  // Symmetry
  const imbalance = Math.abs(dist.left - dist.right)
  const symmetry: SymmetryType =
    imbalance < 10 ? 'SYMMETRIC' :
    imbalance < 25 ? 'ASYMMETRIC_BALANCED' : 'ASYMMETRIC_UNBALANCED'

  // Rhythm based on weight variance
  const variance = weights.reduce((s,w) => s + Math.pow(w - avg, 2), 0) / weights.length
  const stdDev   = Math.sqrt(variance)
  const rhythm: RhythmType =
    stdDev < 10 ? 'REGULAR' :
    stdDev < 20 ? 'ALTERNATING' :
    stdDev < 35 ? 'PROGRESSIVE' : 'RANDOM'

  // Contrast
  const maxW = Math.max(...weights)
  const minW = Math.min(...weights)
  const contrastRatio = maxW - minW
  const contrastLevel =
    contrastRatio < 20 ? 'LOW' :
    contrastRatio < 40 ? 'MEDIUM' :
    contrastRatio < 65 ? 'HIGH' : 'EXTREME'

  // Hierarchy
  const sorted = [...objects].sort((a,b) => calcVisualWeight(b) - calcVisualWeight(a))
  const hierarchy: HierarchyLevel[] = (
    [
      { level:1 as const, objects: sorted.slice(0, 1).map(o=>o.name) },
      { level:2 as const, objects: sorted.slice(1, 3).map(o=>o.name) },
      { level:3 as const, objects: sorted.slice(3, 7).map(o=>o.name) },
    ] satisfies HierarchyLevel[]
  ).filter(h => h.objects.length > 0)

  // Attention center
  const heroObj = sorted[0]
  const attentionCenter: AttentionCenter = {
    x: dist.left > dist.right ? 0.3 : 0.7,
    y: dist.top  > dist.bottom ? 0.3 : 0.7,
    object: heroObj?.name ?? '(nenhum)',
  }

  // Score
  const balanceBonus  = symmetry === 'SYMMETRIC' ? 15 : symmetry === 'ASYMMETRIC_BALANCED' ? 8 : 0
  const hierarchyBonus = hierarchy.length >= 2 ? 15 : 5
  const rhythmBonus   = rhythm !== 'RANDOM' ? 10 : 0
  const score = Math.min(100, Math.round(50 + balanceBonus + hierarchyBonus + rhythmBonus))

  return {
    totalVisualWeight: total,
    weightDistribution: dist,
    dominantAxis: Math.abs(dist.left - dist.right) < Math.abs(dist.top - dist.bottom) ? 'VERTICAL' : 'HORIZONTAL',
    symmetry,
    rhythm,
    contrastLevel,
    hierarchy,
    attentionCenter,
    score,
  }
}
