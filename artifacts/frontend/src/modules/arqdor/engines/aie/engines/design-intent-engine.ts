// ─── Design Intent Engine ────────────────────────────────────────────────────
// Analyzes design intent coverage and conflicts across project objects.

import type { ProjectContext, DesignIntentResult, IntentConflict } from '../aie-types'

const CONFLICTING_INTENTS: Array<[string, string, string]> = [
  ['Destaque', 'Sem destaque', 'Dois objetos com intenções opostas de visibilidade'],
  ['Leveza', 'Peso visual', 'Materiais pesados vs. intenção leve'],
  ['Minimalismo', 'Decoração excessiva', 'Linguagem decorativa contradiz minimalismo'],
  ['Linearidade', 'Orgânico', 'Formas orgânicas conflitam com linhas retas'],
  ['Luxo', 'Simplicidade', 'Excesso de curadoria conflita com luxo'],
]

export function runDesignIntentEngine(ctx: ProjectContext): DesignIntentResult {
  const withIntent    = ctx.objects.filter(o => o.designIntent && o.designIntent.length > 0)
  const withoutIntent = ctx.objects.filter(o => !o.designIntent || o.designIntent.length === 0)

  // Collect all intents and find dominant ones
  const intentCounts: Record<string, number> = {}
  for (const obj of withIntent) {
    for (const intent of (obj.designIntent ?? [])) {
      intentCounts[intent] = (intentCounts[intent] ?? 0) + 1
    }
  }
  const dominantIntents = Object.entries(intentCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([intent]) => intent)

  // Detect conflicts
  const conflicts: IntentConflict[] = []
  for (let i = 0; i < withIntent.length; i++) {
    for (let j = i + 1; j < withIntent.length; j++) {
      const a = withIntent[i]
      const b = withIntent[j]
      const intentsA = a.designIntent ?? []
      const intentsB = b.designIntent ?? []
      for (const [ia, ib, reason] of CONFLICTING_INTENTS) {
        if (intentsA.includes(ia) && intentsB.includes(ib)) {
          conflicts.push({ objectA: a.name, objectB: b.name, conflict: reason, severity: 'MEDIUM' })
        }
        if (intentsB.includes(ia) && intentsA.includes(ib)) {
          conflicts.push({ objectA: b.name, objectB: a.name, conflict: reason, severity: 'MEDIUM' })
        }
      }
    }
  }

  const coverageScore = ctx.objects.length > 0
    ? Math.round((withIntent.length / ctx.objects.length) * 100)
    : 0

  return {
    objectsWithIntent:    withIntent.length,
    objectsWithoutIntent: withoutIntent.length,
    dominantIntents,
    intentConflicts:      conflicts,
    coverageScore,
  }
}
