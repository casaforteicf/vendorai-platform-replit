// ─── Decision Engine ──────────────────────────────────────────────────────────
// Records decisions made during the project lifecycle.
// Actor: USUARIO | COPILOT | CATALOGO | BIBLIOTECA | FABRICANTE | SISTEMA | IA
//
// Important: this module never fabricates project history. A project with no
// persisted decisions starts with an empty list.

import type { Decision, DecisionActor } from '../copilot-types'

/**
 * Compatibility export for callers that still import the old symbol.
 * It intentionally returns no fake decisions.
 * @deprecated Use an empty array or persisted project decisions instead.
 */
export const MOCK_DECISIONS: Decision[] = []

export function addDecision(
  history: Decision[],
  actor: DecisionActor,
  description: string,
  objectRef?: string,
  accepted?: boolean,
): Decision[] {
  const newDecision: Decision = {
    id:          `dec-${Date.now()}`,
    timestamp:   new Date().toISOString(),
    actor,
    description,
    objectRef,
    accepted,
  }
  return [newDecision, ...history]
}
