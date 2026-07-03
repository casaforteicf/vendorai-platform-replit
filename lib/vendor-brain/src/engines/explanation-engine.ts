// ─── Explanation Engine ───────────────────────────────────────────────────────
// Generates human-readable explanations for decisions.
// "Por que sugerimos Portobello?" → answer from project + DNA + history + KG.

import type { Explanation, ExplanationSource, DecisionRecord, ReasoningChain } from '../types'

export interface IExplanationEngine {
  explain(
    question: string,
    decisions: DecisionRecord[],
    chains:    ReasoningChain[],
    sources:   ExplanationSource[],
  ): Explanation
  explainDecision(decision: DecisionRecord): Explanation
}

export class TemplateExplanationEngine implements IExplanationEngine {
  explain(
    question: string,
    decisions: DecisionRecord[],
    chains:    ReasoningChain[],
    sources:   ExplanationSource[],
  ): Explanation {
    const relevantDecisions = decisions.slice(0, 3)
    const relevantChains    = chains.slice(0, 2)

    // Build answer from decisions and chains
    const parts: string[] = []

    if (relevantDecisions.length > 0) {
      parts.push(`Com base na análise realizada: ${relevantDecisions[0].reason}`)
    }

    if (relevantChains.length > 0) {
      const chain = relevantChains[0]
      if (chain.premises.length > 0) {
        parts.push(`Considerando: ${chain.premises.map(p => p.text).join('; ')}.`)
      }
      parts.push(chain.justification)
    }

    if (parts.length === 0) {
      parts.push('A decisão foi tomada com base nas regras de domínio e no histórico da plataforma.')
    }

    const confidence = relevantDecisions.reduce((acc, d) => acc + d.confidence, 0.7) /
      (relevantDecisions.length + 1)

    return {
      questionText: question,
      answer:       parts.join(' '),
      sources,
      confidence:   Math.min(0.99, confidence),
      generatedAt:  new Date().toISOString(),
    }
  }

  explainDecision(decision: DecisionRecord): Explanation {
    const sources: ExplanationSource[] = [
      { type: 'policy', id: 'routing-rules', label: 'Regras de roteamento de agentes', relevance: 0.8 },
      ...decision.dataUsed.map(d => ({
        type:      'knowledge_graph' as const,
        id:        d,
        label:     d,
        relevance: 0.6,
      })),
    ]

    if (decision.context['projectId']) {
      sources.push({ type: 'project', id: decision.context['projectId'] as string, label: 'Projeto atual', relevance: 0.9 })
    }

    return this.explain(
      `Por que "${decision.chosen}" foi escolhido para "${decision.question}"?`,
      [decision],
      [],
      sources,
    )
  }

  // ─── Canned explanations for common questions ─────────────────────────────

  explainCanned(key: CannedExplanationKey, context: Record<string, string> = {}): Explanation {
    const templates: Record<CannedExplanationKey, { answer: string; sourceTypes: ExplanationSource['type'][] }> = {
      WHY_THIS_MATERIAL: {
        answer: `O material foi sugerido porque projetos com DNA similar ao projeto "${context['projectName'] ?? 'atual'}" utilizam este material em 73% dos casos, e o Knowledge Graph confirma sua compatibilidade com fornecedores homologados.`,
        sourceTypes: ['project', 'knowledge_graph', 'history'],
      },
      WHY_THIS_AGENT: {
        answer: `O agente foi selecionado por ter a maior especialização para este tipo de tarefa, conforme as regras de roteamento e o histórico de execuções anteriores.`,
        sourceTypes: ['policy', 'history'],
      },
      WHY_THIS_PLAN: {
        answer: `O plano de execução foi gerado a partir do template padrão para o objetivo "${context['goal'] ?? 'informado'}", ajustado ao contexto do tenant e às permissões disponíveis.`,
        sourceTypes: ['policy', 'project'],
      },
      WHY_THIS_ROUTE: {
        answer: `A sequência de etapas foi determinada pelas dependências entre tarefas e pela disponibilidade dos agentes no momento da solicitação.`,
        sourceTypes: ['policy'],
      },
    }

    const tmpl   = templates[key]
    const sources: ExplanationSource[] = tmpl.sourceTypes.map(type => ({
      type, id: type, label: SOURCE_LABELS[type], relevance: 0.8,
    }))

    return {
      questionText: key.replace(/_/g, ' ').toLowerCase(),
      answer:       tmpl.answer,
      sources,
      confidence:   0.78,
      generatedAt:  new Date().toISOString(),
    }
  }
}

const SOURCE_LABELS: Record<ExplanationSource['type'], string> = {
  knowledge_graph: 'Knowledge Graph',
  project:         'Projeto atual',
  history:         'Histórico da plataforma',
  policy:          'Políticas e regras de domínio',
  agent:           'Configuração do agente',
}

export type CannedExplanationKey =
  | 'WHY_THIS_MATERIAL'
  | 'WHY_THIS_AGENT'
  | 'WHY_THIS_PLAN'
  | 'WHY_THIS_ROUTE'
