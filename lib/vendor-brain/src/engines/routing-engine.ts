// ─── Routing Engine ───────────────────────────────────────────────────────────
// Maps each PlanStep to the most appropriate AgentType.
// Rule-based routing — no LLM. Ready for ML scoring in FASE 20+.

import type { PlanStep, BrainContext, RoutingDecision, AgentType, IntentType } from '../types'

// ─── Routing rules ────────────────────────────────────────────────────────────

interface RoutingRule {
  /** Match step labels containing these words (case-insensitive) */
  labelContains: string[]
  primary:       AgentType
  fallbacks:     AgentType[]
  reason:        string
}

const ROUTING_RULES: RoutingRule[] = [
  { labelContains: ['render', 'imagem', 'prompt'],    primary: 'RENDER_AI',       fallbacks: ['ARCHITECT_AI'],                  reason: 'Tarefas de renderização são tratadas pelo Render AI' },
  { labelContains: ['material', 'knowledge', 'kg'],   primary: 'KNOWLEDGE_AI',    fallbacks: ['ARCHITECT_AI'],                  reason: 'Consultas de conhecimento são roteadas para Knowledge AI' },
  { labelContains: ['crm', 'lead', 'cliente', 'deal'],primary: 'CRM_AI',          fallbacks: ['ORCHESTRATOR'],                  reason: 'Operações de CRM são executadas pelo CRM AI' },
  { labelContains: ['campanha', 'marketing', 'conteúdo', 'canal'], primary: 'MARKETING_AI', fallbacks: ['CRM_AI'],             reason: 'Tarefas de marketing são delegadas ao Marketing AI' },
  { labelContains: ['compra', 'pedido', 'fornecedor', 'cotação'],  primary: 'BUYER_AI',     fallbacks: ['FINANCIAL_AI'],        reason: 'Aquisições são geridas pelo Buyer AI' },
  { labelContains: ['financeiro', 'orçamento', 'custo', 'valor'],  primary: 'FINANCIAL_AI', fallbacks: ['ORCHESTRATOR'],        reason: 'Análises financeiras são processadas pelo Financial AI' },
  { labelContains: ['obra', 'construção', 'canteiro'],             primary: 'CONSTRUCTION_AI', fallbacks: ['ARCHITECT_AI'],    reason: 'Tarefas de obra são geridas pelo Construction AI' },
  { labelContains: ['projeto', 'ambiente', 'dna', 'briefing', 'moodboard'], primary: 'ARCHITECT_AI', fallbacks: ['KNOWLEDGE_AI'], reason: 'Design e arquitetura são delegados ao Architect AI' },
]

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IRoutingEngine {
  route(step: PlanStep, context: BrainContext): RoutingDecision
  routeAll(steps: PlanStep[], context: BrainContext): RoutingDecision[]
  /** Maps IntentType → recommended primary agent */
  intentToAgent(intent: IntentType): AgentType
}

export class RuleBasedRoutingEngine implements IRoutingEngine {
  route(step: PlanStep, context: BrainContext): RoutingDecision {
    // Context-based overrides (e.g. specific agent configured for this tenant)
    const configured = context.agents?.find(a => a.type === step.agentType)
    const agentId = configured?.id

    // Match rules against label
    const labelLower = step.label.toLowerCase() + ' ' + step.description.toLowerCase()
    for (const rule of ROUTING_RULES) {
      if (rule.labelContains.some(w => labelLower.includes(w))) {
        return {
          stepId:       step.id,
          agentType:    rule.primary,
          agentId,
          reason:       rule.reason,
          confidence:   0.85,
          alternatives: rule.fallbacks,
        }
      }
    }

    // Fallback: use the agent declared on the step
    return {
      stepId:       step.id,
      agentType:    step.agentType,
      agentId,
      reason:       'Agente padrão declarado no template de plano',
      confidence:   0.70,
      alternatives: ['ORCHESTRATOR'],
    }
  }

  routeAll(steps: PlanStep[], context: BrainContext): RoutingDecision[] {
    return steps.map(s => this.route(s, context))
  }

  intentToAgent(intent: IntentType): AgentType {
    const map: Partial<Record<IntentType, AgentType>> = {
      GENERATE_RENDER:    'RENDER_AI',
      REVIEW_RENDER:      'RENDER_AI',
      CREATE_PROJECT:     'ARCHITECT_AI',
      GENERATE_MEMORIAL:  'ARCHITECT_AI',
      CREATE_CAMPAIGN:    'MARKETING_AI',
      CREATE_WORKFLOW:    'ORCHESTRATOR',
      CONSULT_CRM:        'CRM_AI',
      CREATE_LEAD:        'CRM_AI',
      SEND_MESSAGE:       'CRM_AI',
      PURCHASE_COMPONENTS:'BUYER_AI',
      CREATE_PROPOSAL:    'FINANCIAL_AI',
      ANALYZE_PROJECT:    'KNOWLEDGE_AI',
      SEARCH_KNOWLEDGE:   'KNOWLEDGE_AI',
      GENERATE_REPORT:    'ORCHESTRATOR',
      ONBOARD_CLIENT:     'CRM_AI',
      SCHEDULE_MEETING:   'CRM_AI',
      EXPORT_DOCUMENT:    'ORCHESTRATOR',
      UPDATE_STATUS:      'ORCHESTRATOR',
      COMPARE_PROJECTS:   'KNOWLEDGE_AI',
      UNKNOWN:            'ORCHESTRATOR',
    }
    return map[intent] ?? 'ORCHESTRATOR'
  }
}
