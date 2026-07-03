// ─── DNA Generator Engine ─────────────────────────────────────────────────────
// Pure function: ProjectContext → string
// Derives a descriptive DNA string by combining style, dominant materials,
// recurring design intents, and palette.

import type { ProjectContext } from '../aie-types'

export function generateDNA(ctx: ProjectContext): string {
  const segments: string[] = []

  // 1 — Style name
  if (ctx.style?.name) {
    segments.push(ctx.style.name)
  }

  // 2 — Top material categories by usage volume
  const catVolume = new Map<string, number>()
  for (const mat of ctx.materials) {
    catVolume.set(mat.category, (catVolume.get(mat.category) ?? 0) + mat.usedByObjects.length)
  }
  const topCategories = [...catVolume.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat.toLowerCase())
  if (topCategories.length > 0) {
    segments.push(topCategories.join(' + '))
  }

  // 3 — Dominant specific material names (most-used, max 2)
  const dominantMats = [...ctx.materials]
    .filter(m => m.usedByObjects.length > 0)
    .sort((a, b) => b.usedByObjects.length - a.usedByObjects.length)
    .slice(0, 2)
    .map(m => m.name)
  if (dominantMats.length > 0) {
    segments.push(dominantMats.join(', '))
  }

  // 4 — Recurring design intents (top 3 across all objects)
  const intentFreq = new Map<string, number>()
  for (const obj of ctx.objects) {
    for (const intent of (obj.designIntent ?? [])) {
      intentFreq.set(intent, (intentFreq.get(intent) ?? 0) + 1)
    }
  }
  let topIntents = [...intentFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([intent]) => intent)

  // Fall back to style intents if objects don't carry intents
  if (topIntents.length === 0 && ctx.style?.designIntent) {
    topIntents = ctx.style.designIntent.slice(0, 3)
  }
  if (topIntents.length > 0) {
    segments.push(topIntents.join(', '))
  }

  // 5 — Palette (deduplicated, up to 4 colors from materials + style)
  const palette: string[] = []
  const seen = new Set<string>()
  const addColor = (c: string) => {
    const normalized = c.toUpperCase()
    if (!seen.has(normalized) && palette.length < 4) {
      seen.add(normalized)
      palette.push(normalized)
    }
  }
  for (const mat of ctx.materials) {
    for (const c of mat.palette) addColor(c)
  }
  if (ctx.style?.palette) {
    for (const c of ctx.style.palette) addColor(c)
  }
  if (palette.length > 0) {
    segments.push(`paleta ${palette.join(' · ')}`)
  }

  // 6 — Render goal as closing intent
  if (ctx.renderGoal) {
    segments.push(ctx.renderGoal)
  }

  if (segments.length === 0) {
    return 'Projeto sem informações suficientes para gerar DNA arquitetônico.'
  }

  return segments.join(' — ')
}
