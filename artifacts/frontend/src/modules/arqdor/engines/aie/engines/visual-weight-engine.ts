// ─── Visual Weight Engine ─────────────────────────────────────────────────────
// Assigns visual weight (0–100) to each object and assigns attention zones.

import type { ProjectContext, VisualWeightResult, ObjectWeight, AttentionZone } from '../aie-types'

const WEIGHT_BY_CATEGORY: Record<string, number> = {
  SOFA:70, TABLE:65, BED:75, KITCHEN:80, CABINETRY:85, REFRIGERATOR:60,
  OVEN:55, COOKTOP:50, MICROWAVE:45, LIGHTING:40, PLANT:15, CHAIR:35,
  ARMCHAIR:50, MATTRESS:20, FAUCET:25, SINK:30, HANDLE:10, HARDWARE:8,
  WINDOW:20, DOOR:30, FLOORING:55, WALL_COVERING:45, STONE:70,
  DECOR:20, CUSTOM:40, WASHER:40, FRAME:25,
}

function baseWeight(obj: { category: string; visualWeight?: number }): number {
  if (obj.visualWeight !== undefined) return Math.min(100, Math.max(0, obj.visualWeight))
  return WEIGHT_BY_CATEGORY[obj.category] ?? 40
}

function assignZone(weight: number, rank: number, total: number): AttentionZone {
  const topPct = rank / total
  if (topPct <= 0.10 && weight >= 70) return 'HERO'
  if (topPct <= 0.30 || weight >= 55)  return 'PRIMARY'
  if (topPct <= 0.65 || weight >= 30)  return 'SECONDARY'
  return 'BACKGROUND'
}

export function runVisualWeightEngine(ctx: ProjectContext): VisualWeightResult {
  const sorted = [...ctx.objects].sort((a, b) => baseWeight(b) - baseWeight(a))
  const totalLoad = sorted.reduce((s, o) => s + baseWeight(o), 0)

  const weights: ObjectWeight[] = sorted.map((obj, idx) => {
    const w = baseWeight(obj)
    return {
      objectId:     obj.id,
      objectName:   obj.name,
      weight:       w,
      zone:         assignZone(w, idx, sorted.length),
      contribution: totalLoad > 0 ? Math.round((w / totalLoad) * 1000) / 10 : 0,
    }
  })

  // Balance: perfect = 100, decreases with concentration
  const heroWeight = weights.filter(w => w.zone === 'HERO').reduce((s, w) => s + w.weight, 0)
  const concentrationRatio = totalLoad > 0 ? heroWeight / totalLoad : 1
  const balance = Math.round(Math.max(0, 100 - concentrationRatio * 60))

  return { weights, totalLoad, balance }
}
