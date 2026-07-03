// ─── Search Engine ────────────────────────────────────────────────────────────
// Keyword + property search over the graph. Ready for semantic (vector) upgrade.
// "Não implementar IA" — using TF-IDF-style scoring for now.

import type { VKGNode, NodeType, SearchResult } from '../types'
import type { INodeEngine } from './node-engine'

export interface ISearchEngine {
  search(query: string, options?: SearchOptions): SearchResult[]
  searchByType(type: NodeType, query: string, limit?: number): SearchResult[]
}

export interface SearchOptions {
  types?:    NodeType[]
  tenantId?: string
  limit?:    number
  /** Minimum score threshold 0-1 */
  minScore?: number
}

// ─── Tokenize ─────────────────────────────────────────────────────────────────

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean)
}

// ─── Score node against query tokens ─────────────────────────────────────────

function scoreNode(node: VKGNode, queryTokens: string[]): { score: number; highlights: string[] } {
  const highlights: string[] = []
  let score = 0

  const propsFlat = JSON.stringify(node.properties).toLowerCase()
  const labelLower = node.label.toLowerCase()

  for (const token of queryTokens) {
    // Label match (highest weight)
    if (labelLower.includes(token)) {
      score += 3
      highlights.push(node.label)
    }
    // Type match
    if (node.type.toLowerCase().includes(token)) {
      score += 2
    }
    // Property match
    if (propsFlat.includes(token)) {
      score += 1
      // Find which property matched
      const matched = Object.entries(node.properties)
        .filter(([, v]) => String(v).toLowerCase().includes(token))
        .map(([k, v]) => `${k}: ${v}`)
      highlights.push(...matched.slice(0, 2))
    }
  }

  // Normalize by query length
  const normalizedScore = queryTokens.length > 0 ? score / (queryTokens.length * 3) : 0

  return {
    score: Math.min(1, normalizedScore),
    highlights: [...new Set(highlights)].slice(0, 3),
  }
}

export class KeywordSearchEngine implements ISearchEngine {
  constructor(private readonly nodes: INodeEngine) {}

  search(query: string, options?: SearchOptions): SearchResult[] {
    const tokens   = tokenize(query)
    if (tokens.length === 0) return []

    const minScore = options?.minScore ?? 0.1
    const limit    = options?.limit    ?? 20

    let candidates = this.nodes.all()
    if (options?.tenantId) candidates = candidates.filter(n => n.tenantId === options.tenantId)
    if (options?.types)    candidates = candidates.filter(n => options.types!.includes(n.type))

    const results: SearchResult[] = []
    for (const node of candidates) {
      const { score, highlights } = scoreNode(node, tokens)
      if (score >= minScore) results.push({ node, score, highlights })
    }

    return results
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }

  searchByType(type: NodeType, query: string, limit = 10): SearchResult[] {
    return this.search(query, { types: [type], limit })
  }

  // ─── Example queries (FASE 18 spec) ──────────────────────────────────────

  // "Projetos usando Dekton"     → search Material nodes for "Dekton", then traverse to Project
  // "Todos os Japandi"           → search Style nodes + DNA nodes for "Japandi"
  // "Projetos com Brastemp"      → search Manufacturer + Brand for "Brastemp"
  // "Cozinhas com iluminação"    → search Environment for "cozinha" + Material for "iluminação"
}
