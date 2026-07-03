// ─── Recommendation Engine ────────────────────────────────────────────────────
// Collaborative filtering + graph similarity. No LLM — pure topology.
// Ready for embedding-based similarity in a future phase.

import type { VKGNode, NodeType, Recommendation } from '../types'
import type { INodeEngine } from './node-engine'
import type { IRelationshipEngine } from './relationship-engine'

export interface IRecommendationEngine {
  recommend(nodeId: string, targetType?: NodeType, limit?: number): Recommendation[]
  similarNodes(nodeId: string, limit?: number): Array<{ node: VKGNode; similarity: number }>
}

export class GraphRecommendationEngine implements IRecommendationEngine {
  constructor(
    private readonly nodes: INodeEngine,
    private readonly edges: IRelationshipEngine,
  ) {}

  // ─── "Usuário escolheu Portobello → sugerir Rodapé, Rejunte, Louças" ──────

  recommend(nodeId: string, targetType?: NodeType, limit = 10): Recommendation[] {
    const source = this.nodes.get(nodeId)
    if (!source) return []

    // Collect all nodes 2 hops away
    const hop1 = this.edges.neighborsOf(nodeId, 'both').map(e =>
      e.sourceId === nodeId ? e.targetId : e.sourceId
    )
    const hop2Counts = new Map<string, { count: number; sources: string[] }>()

    for (const mid of hop1) {
      const further = this.edges.neighborsOf(mid, 'both').map(e =>
        e.sourceId === mid ? e.targetId : e.sourceId
      )
      for (const far of further) {
        if (far === nodeId || hop1.includes(far)) continue
        const prev = hop2Counts.get(far) ?? { count: 0, sources: [] }
        hop2Counts.set(far, { count: prev.count + 1, sources: [...prev.sources, mid].slice(0, 3) })
      }
    }

    const candidates: Recommendation[] = []
    for (const [candidateId, { count, sources }] of hop2Counts.entries()) {
      const candidate = this.nodes.get(candidateId)
      if (!candidate) continue
      if (targetType && candidate.type !== targetType) continue

      candidates.push({
        targetNode:  candidate,
        reason:      `Frequentemente usado junto com ${source.label}`,
        confidence:  Math.min(0.95, count / Math.max(hop1.length, 1)),
        sourceNodes: sources,
      })
    }

    return candidates
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, limit)
  }

  // ─── Node similarity (Jaccard on neighbor sets) ───────────────────────────

  similarNodes(nodeId: string, limit = 5): Array<{ node: VKGNode; similarity: number }> {
    const source = this.nodes.get(nodeId)
    if (!source) return []

    const sourceNeighbors = new Set(
      this.edges.neighborsOf(nodeId, 'both').map(e => e.sourceId === nodeId ? e.targetId : e.sourceId)
    )
    if (sourceNeighbors.size === 0) return []

    const candidates = this.nodes.query({ type: source.type })
    const results: Array<{ node: VKGNode; similarity: number }> = []

    for (const candidate of candidates) {
      if (candidate.id === nodeId) continue
      const candNeighbors = new Set(
        this.edges.neighborsOf(candidate.id, 'both').map(e => e.sourceId === candidate.id ? e.targetId : e.sourceId)
      )
      const intersection = [...sourceNeighbors].filter(id => candNeighbors.has(id)).length
      const union        = new Set([...sourceNeighbors, ...candNeighbors]).size
      const jaccard      = union > 0 ? intersection / union : 0
      if (jaccard > 0) results.push({ node: candidate, similarity: jaccard })
    }

    return results.sort((a, b) => b.similarity - a.similarity).slice(0, limit)
  }

  // ─── Material bundle recommendations ──────────────────────────────────────
  // "Quem usa Dekton Laurent também usa X"

  bundleRecommendations(
    materialNodeId: string,
  ): Array<{ node: VKGNode; coOccurrenceCount: number }> {
    const projectEdges = this.edges.query({ targetId: materialNodeId, type: 'USES' })
    const projectIds   = projectEdges.map(e => e.sourceId)

    const materialCount = new Map<string, number>()
    for (const projectId of projectIds) {
      const matEdges = this.edges.query({ sourceId: projectId, type: 'USES' })
      for (const e of matEdges) {
        if (e.targetId === materialNodeId) continue
        const target = this.nodes.get(e.targetId)
        if (target?.type !== 'Material') continue
        materialCount.set(e.targetId, (materialCount.get(e.targetId) ?? 0) + 1)
      }
    }

    return [...materialCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([id, count]) => ({ node: this.nodes.get(id)!, coOccurrenceCount: count }))
      .filter(r => r.node != null)
  }
}
