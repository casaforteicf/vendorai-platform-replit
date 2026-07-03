// ─── Decision Engine ──────────────────────────────────────────────────────────
// Records all decisions made during the project lifecycle.
// Actor: USUARIO | COPILOT | CATALOGO | BIBLIOTECA | FABRICANTE | SISTEMA | IA

import type { Decision, DecisionActor } from '../copilot-types'

let _did = 0

function ts(minutesAgo: number): string {
  const d = new Date(Date.now() - minutesAgo * 60 * 1000)
  return d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
}

function decision(actor: DecisionActor, description: string, minutesAgo: number, objectRef?: string, accepted?: boolean): Decision {
  return { id:`dec-${++_did}`, timestamp:ts(minutesAgo), actor, description, objectRef, accepted }
}

// ─── Mock decision history (most recent first) ───────────────────────────────

export const MOCK_DECISIONS: Decision[] = [
  decision('USUARIO',   'Escolheu Freijó Natural para a marcenaria',           2,  'obj-001', true),
  decision('SISTEMA',   'Sugeriu Portobello para porcelanato do piso',         5,  undefined, undefined),
  decision('USUARIO',   'Aceitou sugestão de Portobello',                      5,  undefined, true),
  decision('COPILOT',   'Detectou bancada sem material definido',              12, 'obj-002', undefined),
  decision('USUARIO',   'Definiu Dekton Laurent para ilha central',            14, 'obj-002', true),
  decision('SISTEMA',   'Aplicou temperatura de cor 3000K automaticamente',   18, undefined, true),
  decision('COPILOT',   'Sugeriu ferragens Blum para marcenaria',              22, 'obj-012', undefined),
  decision('USUARIO',   'Rejeitou ferragens Blum — preferiu puxadores pretos', 22, 'obj-012', false),
  decision('FABRICANTE','Importou catálogo Todeschini linha Volare',           35, undefined, true),
  decision('COPILOT',   'Identificou falta de objetivo de render',             41, undefined, undefined),
  decision('USUARIO',   'Definiu objetivo: Fotorrealista para cliente',        43, undefined, true),
  decision('SISTEMA',   'Gerou DNA arquitetônico automaticamente',             60, undefined, true),
]

export function addDecision(
  history: Decision[],
  actor: DecisionActor,
  description: string,
  objectRef?: string,
  accepted?: boolean,
): Decision[] {
  const newDecision: Decision = {
    id:          `dec-${Date.now()}`,
    timestamp:   new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }),
    actor, description, objectRef, accepted,
  }
  return [newDecision, ...history]
}
