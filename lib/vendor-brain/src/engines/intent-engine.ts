// ─── Intent Engine ────────────────────────────────────────────────────────────
// Classifies raw user requests into typed intents with confidence scores.
// No LLM — keyword/pattern matching, ready for model upgrade in FASE 20+.

import type { Intent, IntentType, IntentEntity } from '../types'

let _seq = 0
function nextId(): string { return `intent_${Date.now()}_${++_seq}` }

// ─── Keyword ruleset (order = priority) ──────────────────────────────────────

const RULES: Array<{ patterns: RegExp[]; type: IntentType; baseConfidence: number }> = [
  { type: 'GENERATE_RENDER',    baseConfidence: 0.92, patterns: [/render(izar|izar|ização)?/i, /gerar?\s+imagem/i, /criar?\s+render/i] },
  { type: 'REVIEW_RENDER',      baseConfidence: 0.90, patterns: [/revisar?\s+render/i, /feedback.*render/i, /analis[ae].*render/i] },
  { type: 'CREATE_PROJECT',     baseConfidence: 0.90, patterns: [/criar?\s+projeto/i, /novo\s+projeto/i, /iniciar?\s+projeto/i] },
  { type: 'GENERATE_MEMORIAL',  baseConfidence: 0.88, patterns: [/memorial/i, /gerar?\s+doc/i, /gerar?\s+relat/i] },
  { type: 'CREATE_CAMPAIGN',    baseConfidence: 0.88, patterns: [/campanha/i, /criar?\s+campanha/i, /marketing/i] },
  { type: 'CREATE_WORKFLOW',    baseConfidence: 0.87, patterns: [/workflow/i, /automação/i, /fluxo\s+de\s+trabalho/i] },
  { type: 'CONSULT_CRM',        baseConfidence: 0.86, patterns: [/crm/i, /lead/i, /cliente/i, /negócio/i] },
  { type: 'COMPARE_PROJECTS',   baseConfidence: 0.85, patterns: [/comparar?\s+projeto/i, /diferença.*projeto/i] },
  { type: 'PURCHASE_COMPONENTS',baseConfidence: 0.88, patterns: [/comprar?/i, /pedido/i, /fornecedor/i, /aquisição/i] },
  { type: 'CREATE_PROPOSAL',    baseConfidence: 0.87, patterns: [/proposta/i, /criar?\s+proposta/i, /orçamento/i] },
  { type: 'ANALYZE_PROJECT',    baseConfidence: 0.85, patterns: [/analis[ae]/i, /avaliar?/i, /diagnóstico/i] },
  { type: 'SEARCH_KNOWLEDGE',   baseConfidence: 0.83, patterns: [/buscar?/i, /encontrar?/i, /pesquisar?/i, /procurar?/i] },
  { type: 'CREATE_LEAD',        baseConfidence: 0.85, patterns: [/novo?\s+lead/i, /cadastrar?\s+lead/i, /adicionar?\s+lead/i] },
  { type: 'SEND_MESSAGE',       baseConfidence: 0.84, patterns: [/enviar?\s+mensagem/i, /mandar?\s+msg/i, /whatsapp/i] },
  { type: 'UPDATE_STATUS',      baseConfidence: 0.82, patterns: [/atualizar?\s+status/i, /mudar?\s+status/i, /alterar?\s+status/i] },
  { type: 'GENERATE_REPORT',    baseConfidence: 0.84, patterns: [/relatório/i, /gerar?\s+relatório/i, /exportar?\s+dados/i] },
  { type: 'ONBOARD_CLIENT',     baseConfidence: 0.85, patterns: [/onboard/i, /integrar?\s+cliente/i, /cadastrar?\s+cliente/i] },
  { type: 'SCHEDULE_MEETING',   baseConfidence: 0.86, patterns: [/agend[ae]/i, /reunião/i, /meeting/i, /agendar?\s+call/i] },
  { type: 'EXPORT_DOCUMENT',    baseConfidence: 0.83, patterns: [/exportar?/i, /baixar?\s+pdf/i, /gerar?\s+pdf/i] },
]

// ─── Entity extractor ─────────────────────────────────────────────────────────

const ENTITY_PATTERNS: Array<{ kind: IntentEntity['kind']; re: RegExp }> = [
  { kind: 'material',   re: /\b(dekton|porcelanato|mdf|granito|mármore|cerâmica|parquet|revestimento)\b/gi },
  { kind: 'agent',      re: /\b(copiloto?|arq|render\s*ia|crm\s*ia|comprador|marketing)\b/gi },
  { kind: 'workspace',  re: /\b(workspace|arqdor|varejo|construção|clínica|beauty)\b/gi },
  { kind: 'amount',     re: /R\$[\d.,]+|\d+\s*m[²2]/gi },
  { kind: 'date',       re: /\b(hoje|amanhã|semana\s+que\s+vem|\d{1,2}\/\d{1,2})\b/gi },
]

function extractEntities(text: string): IntentEntity[] {
  const entities: IntentEntity[] = []
  for (const { kind, re } of ENTITY_PATTERNS) {
    let m: RegExpExecArray | null
    re.lastIndex = 0
    while ((m = re.exec(text)) !== null) {
      entities.push({ kind, value: m[0], start: m.index, end: m.index + m[0].length })
    }
  }
  return entities
}

// ─── Interface ────────────────────────────────────────────────────────────────

export interface IIntentEngine {
  classify(raw: string, tenantId: string, userId: string): Intent
  candidates(raw: string): Array<{ type: IntentType; confidence: number }>
}

export class KeywordIntentEngine implements IIntentEngine {
  classify(raw: string, tenantId: string, userId: string): Intent {
    const top = this.candidates(raw)[0] ?? { type: 'UNKNOWN' as IntentType, confidence: 0.3 }
    return {
      id:         nextId(),
      type:       top.type,
      raw,
      entities:   extractEntities(raw),
      confidence: top.confidence,
      tenantId,
      userId,
      createdAt:  new Date().toISOString(),
    }
  }

  candidates(raw: string): Array<{ type: IntentType; confidence: number }> {
    const results: Array<{ type: IntentType; confidence: number }> = []
    for (const rule of RULES) {
      const matched = rule.patterns.filter(p => p.test(raw)).length
      if (matched > 0) {
        const bonus = Math.min(0.08, (matched - 1) * 0.04)
        results.push({ type: rule.type, confidence: Math.min(0.99, rule.baseConfidence + bonus) })
      }
    }
    if (results.length === 0) results.push({ type: 'UNKNOWN', confidence: 0.3 })
    return results.sort((a, b) => b.confidence - a.confidence)
  }
}
