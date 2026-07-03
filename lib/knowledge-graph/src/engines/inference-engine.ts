// ─── Inference Engine ─────────────────────────────────────────────────────────
// Generates knowledge from graph patterns.
// "Não implementar IA" — pattern matching only, no LLM calls.
// Architecture is ready for LLM augmentation in a future phase.

import type { VKGNode, NodeType, InferenceResult } from '../types'
import type { INodeEngine } from './node-engine'
import type { IRelationshipEngine } from './relationship-engine'

export interface IInferenceEngine {
  inferPatterns(nodeType: NodeType): InferenceResult[]
  detectCoOccurrence(type1: NodeType, type2: NodeType): Array<{ pair: [VKGNode, VKGNode]; strength: number }>
  suggestRelationships(): Array<{ sourceId: string; targetId: string; type: string; confidence: number }>
}

export class PatternInferenceEngine implements IInferenceEngine {
  constructor(
    private readonly nodes: INodeEngine,
    private readonly edges: IRelationshipEngine,
  ) {}

  // ─── "80% dos projetos Japandi usam madeira clara" ────────────────────────

  inferPatterns(nodeType: NodeType): InferenceResult[] {
    const results: InferenceResult[] = []
    const typeNodes = this.nodes.query({ type: nodeType })
    if (typeNodes.length < 2) return results

    // Find shared neighbors by type
    const neighborTypeCount = new Map<string, { count: number; examples: string[] }>()

    for (const node of typeNodes) {
      const neighbors = this.edges.neighborsOf(node.id, 'outbound')
      for (const edge of neighbors) {
        const neighbor = this.nodes.get(edge.targetId)
        if (!neighbor) continue
        const key = `${neighbor.type}:${neighbor.label}`
        const prev = neighborTypeCount.get(key) ?? { count: 0, examples: [] }
        neighborTypeCount.set(key, {
          count: prev.count + 1,
          examples: [...prev.examples, node.label].slice(0, 3),
        })
      }
    }

    for (const [key, { count, examples }] of neighborTypeCount.entries()) {
      const [type, label] = key.split(':')
      const confidence = count / typeNodes.length
      if (confidence < 0.4) continue

      results.push({
        pattern:    `${Math.round(confidence * 100)}% dos ${nodeType}s usam ${label}`,
        confidence,
        examples,
        insight:    `${type} "${label}" é frequentemente associado a projetos do tipo ${nodeType}`,
      })
    }

    return results.sort((a, b) => b.confidence - a.confidence).slice(0, 10)
  }

  // ─── Co-occurrence analysis ────────────────────────────────────────────────

  detectCoOccurrence(
    type1: NodeType,
    type2: NodeType,
  ): Array<{ pair: [VKGNode, VKGNode]; strength: number }> {
    const nodes1 = this.nodes.query({ type: type1 })
    const nodes2 = this.nodes.query({ type: type2 })
    const results: Array<{ pair: [VKGNode, VKGNode]; strength: number }> = []

    for (const n1 of nodes1) {
      const n1Neighbors = new Set(
        this.edges.neighborsOf(n1.id, 'both').map(e => e.sourceId === n1.id ? e.targetId : e.sourceId)
      )
      for (const n2 of nodes2) {
        const n2Neighbors = new Set(
          this.edges.neighborsOf(n2.id, 'both').map(e => e.sourceId === n2.id ? e.targetId : e.sourceId)
        )
        const shared = [...n1Neighbors].filter(id => n2Neighbors.has(id)).length
        if (shared === 0) continue
        const union = new Set([...n1Neighbors, ...n2Neighbors]).size
        const jaccard = shared / union
        if (jaccard > 0.2) results.push({ pair: [n1, n2], strength: jaccard })
      }
    }

    return results.sort((a, b) => b.strength - a.strength).slice(0, 20)
  }

  // ─── Link prediction (simple common-neighbors heuristic) ─────────────────

  suggestRelationships(): Array<{ sourceId: string; targetId: string; type: string; confidence: number }> {
    const suggestions: Array<{ sourceId: string; targetId: string; type: string; confidence: number }> = []
    const allNodes = this.nodes.all()

    for (let i = 0; i < Math.min(allNodes.length, 100); i++) {
      const n1 = allNodes[i]
      const n1Neighbors = new Set(
        this.edges.neighborsOf(n1.id, 'both').map(e => e.sourceId === n1.id ? e.targetId : e.sourceId)
      )

      for (let j = i + 1; j < Math.min(allNodes.length, 100); j++) {
        const n2 = allNodes[j]
        if (this.edges.hasEdge(n1.id, n2.id, 'RELATED_TO')) continue

        const n2Neighbors = new Set(
          this.edges.neighborsOf(n2.id, 'both').map(e => e.sourceId === n2.id ? e.targetId : e.sourceId)
        )
        const commonNeighbors = [...n1Neighbors].filter(id => n2Neighbors.has(id)).length
        if (commonNeighbors >= 2) {
          suggestions.push({
            sourceId:   n1.id,
            targetId:   n2.id,
            type:       'RELATED_TO',
            confidence: Math.min(0.9, commonNeighbors / 5),
          })
        }
      }
    }

    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 50)
  }
}
