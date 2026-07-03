// ─── Reasoning Engine ─────────────────────────────────────────────────────────
// Records structured reasoning chains: premises → rules → justification.
// No internal model reasoning exposed — architecture-only in FASE 19.

import type { ReasoningChain, Premise, Rule } from '../types'

let _seq = 0
function nextId(): string { return `reasoning_${Date.now()}_${++_seq}` }

export interface IReasoningEngine {
  record(params: {
    planId:       string
    stepId?:      string
    premises:     Omit<Premise, 'id'>[]
    rulesApplied: Omit<Rule, 'id'>[]
    sourcesUsed:  string[]
    justification: string
    conclusion:   string
  }): ReasoningChain

  forPlan(planId: string): ReasoningChain[]
  all(): ReasoningChain[]
}

// ─── Built-in domain rules ────────────────────────────────────────────────────

export const DOMAIN_RULES: Rule[] = [
  { id:'rule_tenant_isolation',   name:'Tenant Isolation',     text:'Dados de um tenant nunca podem ser acessados por outro tenant', domain:'security'      },
  { id:'rule_dna_consistency',    name:'DNA Consistency',      text:'Materiais selecionados devem ser compatíveis com o DNA do projeto', domain:'architecture' },
  { id:'rule_agent_capability',   name:'Agent Capability',     text:'Cada agente executa somente as tarefas dentro de sua especialização', domain:'routing'   },
  { id:'rule_confidence_min',     name:'Min Confidence',       text:'Planos com confiança < 0.6 devem ser revisados antes da execução', domain:'planning'   },
  { id:'rule_approval_gate',      name:'Approval Gate',        text:'Decisões de alto impacto (compra > R$5k) requerem aprovação humana', domain:'governance' },
  { id:'rule_audit_trail',        name:'Audit Trail',          text:'Toda decisão deve ser registrada com motivo e dados utilizados', domain:'observability'},
  { id:'rule_kg_precedence',      name:'KG Precedence',        text:'O Knowledge Graph é consultado antes de sugerir materiais ou fornecedores', domain:'knowledge' },
  { id:'rule_plan_max_steps',     name:'Plan Step Limit',      text:'Planos não devem exceder 15 etapas (decompor em sub-planos se necessário)', domain:'planning' },
]

export class InMemoryReasoningEngine implements IReasoningEngine {
  private chains: ReasoningChain[] = []

  record(params: {
    planId:       string
    stepId?:      string
    premises:     Omit<Premise, 'id'>[]
    rulesApplied: Omit<Rule, 'id'>[]
    sourcesUsed:  string[]
    justification: string
    conclusion:   string
  }): ReasoningChain {
    const chain: ReasoningChain = {
      id:           nextId(),
      planId:       params.planId,
      stepId:       params.stepId,
      premises:     params.premises.map((p, i) => ({ ...p, id: `${nextId()}_p${i}` })),
      rulesApplied: params.rulesApplied.map((r, i) => ({ ...r, id: `${nextId()}_r${i}` })),
      sourcesUsed:  params.sourcesUsed,
      justification: params.justification,
      conclusion:   params.conclusion,
      createdAt:    new Date().toISOString(),
    }
    this.chains.unshift(chain)
    return chain
  }

  forPlan(planId: string): ReasoningChain[] {
    return this.chains.filter(c => c.planId === planId)
  }

  all(): ReasoningChain[] {
    return [...this.chains]
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  static premise(text: string, source: string, weight = 0.8): Omit<Premise, 'id'> {
    return { text, source, weight }
  }

  static rule(ruleId: string): Rule {
    return DOMAIN_RULES.find(r => r.id === ruleId) ?? { id: ruleId, name: ruleId, text: '', domain: 'unknown' }
  }
}
