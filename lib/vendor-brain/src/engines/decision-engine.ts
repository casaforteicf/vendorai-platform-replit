// ─── Decision Engine ──────────────────────────────────────────────────────────
// Records every decision with full audit trail: reason, alternatives, confidence.
// "Toda decisão deve registrar: Motivo, Contexto, Dados, Alternativas, Confiança"

import type {
  DecisionRecord, DecisionType, DecisionAlternative,
} from '../types'

let _seq = 0
function nextId(): string { return `decision_${Date.now()}_${++_seq}` }

export interface IDecisionEngine {
  record(params: {
    planId:       string
    stepId?:      string
    type:         DecisionType
    question:     string
    chosen:       string
    alternatives: DecisionAlternative[]
    reason:       string
    context:      Record<string, unknown>
    confidence:   number
    dataUsed?:    string[]
  }): DecisionRecord

  forPlan(planId: string): DecisionRecord[]
  forStep(stepId: string): DecisionRecord[]
  audit(tenantId: string, limit?: number): DecisionRecord[]
  all(): DecisionRecord[]
}

export class InMemoryDecisionEngine implements IDecisionEngine {
  private records: DecisionRecord[] = []

  record(params: {
    planId:       string
    stepId?:      string
    type:         DecisionType
    question:     string
    chosen:       string
    alternatives: DecisionAlternative[]
    reason:       string
    context:      Record<string, unknown>
    confidence:   number
    dataUsed?:    string[]
  }): DecisionRecord {
    const rec: DecisionRecord = {
      id:           nextId(),
      planId:       params.planId,
      stepId:       params.stepId,
      type:         params.type,
      question:     params.question,
      chosen:       params.chosen,
      alternatives: params.alternatives,
      reason:       params.reason,
      context:      params.context,
      confidence:   params.confidence,
      dataUsed:     params.dataUsed ?? [],
      createdAt:    new Date().toISOString(),
    }
    this.records.unshift(rec)
    return rec
  }

  forPlan(planId: string): DecisionRecord[] {
    return this.records.filter(r => r.planId === planId)
  }

  forStep(stepId: string): DecisionRecord[] {
    return this.records.filter(r => r.stepId === stepId)
  }

  audit(tenantId: string, limit = 50): DecisionRecord[] {
    // tenantId stored in context.tenantId when present
    return this.records
      .filter(r => !tenantId || (r.context['tenantId'] as string) === tenantId)
      .slice(0, limit)
  }

  all(): DecisionRecord[] {
    return [...this.records]
  }

  // ─── Factory methods for common decisions ─────────────────────────────────

  static agentSelection(
    planId: string, stepId: string, chosen: string,
    alternatives: string[], reason: string, confidence: number,
  ): Parameters<IDecisionEngine['record']>[0] {
    return {
      planId, stepId,
      type:         'AGENT_SELECTION',
      question:     `Qual agente deve executar a etapa "${stepId}"?`,
      chosen,
      alternatives: alternatives.map(a => ({ option: a, confidence: 0.5, reason: 'Alternativa disponível' })),
      reason, confidence,
      context:      {},
      dataUsed:     ['routing-rules', 'agent-registry'],
    }
  }

  static routeSelection(
    planId: string, chosen: string, alternatives: string[], reason: string,
  ): Parameters<IDecisionEngine['record']>[0] {
    return {
      planId,
      type:         'ROUTE_SELECTION',
      question:     'Qual sequência de etapas executar para este objetivo?',
      chosen,
      alternatives: alternatives.map(a => ({ option: a, confidence: 0.5, reason: 'Rota alternativa' })),
      reason, confidence: 0.82,
      context:      {},
      dataUsed:     ['planning-templates', 'intent-classification'],
    }
  }
}
