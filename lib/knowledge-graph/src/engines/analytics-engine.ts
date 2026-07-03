// ─── Analytics Engine ─────────────────────────────────────────────────────────
// Answers business questions from the graph topology.
// Pure computation — no I/O, no side effects.

import type { VKGNode, VKGEdge, NodeType, RelationshipType, NodeFrequency, RelationshipPattern } from '../types'
import type { INodeEngine } from './node-engine'
import type { IRelationshipEngine } from './relationship-engine'

export interface AnalyticsSummary {
  totalNodes:    number
  totalEdges:    number
  byType:        Partial<Record<NodeType, number>>
  byRelation:    Partial<Record<RelationshipType, number>>
  topConnected:  NodeFrequency[]
  orphanCount:   number
}

export interface ManufacturerInsight {
  node:       VKGNode
  projectCount:  number
  materialCount: number
  score:         number
}

export class AnalyticsEngine {
  constructor(
    private readonly nodes: INodeEngine,
    private readonly edges: IRelationshipEngine,
  ) {}

  // ─── Summary ──────────────────────────────────────────────────────────────

  summary(): AnalyticsSummary {
    const allNodes  = this.nodes.all()
    const allEdges  = this.edges.all()
    const connected = new Set([...allEdges.map(e => e.sourceId), ...allEdges.map(e => e.targetId)])

    const byType: Partial<Record<NodeType, number>> = {}
    for (const n of allNodes) byType[n.type] = (byType[n.type] ?? 0) + 1

    const byRelation: Partial<Record<RelationshipType, number>> = {}
    for (const e of allEdges) byRelation[e.type] = (byRelation[e.type] ?? 0) + 1

    const degreeMap = new Map<string, number>()
    for (const e of allEdges) {
      degreeMap.set(e.sourceId, (degreeMap.get(e.sourceId) ?? 0) + 1)
      degreeMap.set(e.targetId, (degreeMap.get(e.targetId) ?? 0) + 1)
    }

    const topConnected: NodeFrequency[] = [...degreeMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([nodeId, count]) => {
        const n = this.nodes.get(nodeId)!
        return { nodeId, label: n?.label ?? nodeId, type: n?.type ?? 'Knowledge', count }
      })

    return {
      totalNodes: allNodes.length,
      totalEdges: allEdges.length,
      byType,
      byRelation,
      topConnected,
      orphanCount: allNodes.filter(n => !connected.has(n.id)).length,
    }
  }

  // ─── "Quais fabricantes aparecem mais?" ───────────────────────────────────

  topManufacturers(tenantId?: string): ManufacturerInsight[] {
    const mfgNodes = this.nodes.query({ type: 'Manufacturer', tenantId })
    return mfgNodes
      .map(node => {
        const edges = this.edges.neighborsOf(node.id, 'both')
        const projectCount  = edges.filter(e => {
          const other = e.sourceId === node.id ? e.targetId : e.sourceId
          return this.nodes.get(other)?.type === 'Project'
        }).length
        const materialCount = edges.filter(e => {
          const other = e.sourceId === node.id ? e.targetId : e.sourceId
          return this.nodes.get(other)?.type === 'Material'
        }).length
        return { node, projectCount, materialCount, score: projectCount + materialCount }
      })
      .sort((a, b) => b.score - a.score)
  }

  // ─── "Qual material gera maior aprovação?" ─────────────────────────────────

  materialApprovalRates(): Array<{ node: VKGNode; approvalRate: number; totalReviews: number }> {
    return this.nodes.query({ type: 'Material' }).map(mat => {
      const renders  = this.edges.query({ sourceId: mat.id, type: 'RENDERED_WITH' })
      const reviewed = renders.filter(r => {
        const review = this.edges.query({ sourceId: r.targetId, type: 'GENERATED_BY' })
        return review.length > 0
      })
      const approved = reviewed.filter(r => {
        const revNode = this.nodes.get(r.targetId)
        return revNode?.properties?.['approved'] === true
      })
      return {
        node: mat,
        approvalRate: reviewed.length > 0 ? approved.length / reviewed.length : 0,
        totalReviews: reviewed.length,
      }
    }).sort((a, b) => b.approvalRate - a.approvalRate)
  }

  // ─── Relationship patterns ─────────────────────────────────────────────────

  relationshipPatterns(): RelationshipPattern[] {
    const patternMap = new Map<string, { count: number; totalWeight: number }>()

    for (const edge of this.edges.all()) {
      const source = this.nodes.get(edge.sourceId)
      const target = this.nodes.get(edge.targetId)
      if (!source || !target) continue
      const key = `${source.type}→${edge.type}→${target.type}`
      const prev = patternMap.get(key) ?? { count: 0, totalWeight: 0 }
      patternMap.set(key, { count: prev.count + 1, totalWeight: prev.totalWeight + edge.weight })
    }

    return [...patternMap.entries()]
      .map(([key, { count, totalWeight }]) => {
        const [fromType, relation, toType] = key.split('→') as [NodeType, RelationshipType, NodeType]
        return { fromType, toType, relation, count, avgWeight: totalWeight / count }
      })
      .sort((a, b) => b.count - a.count)
  }

  // ─── Degree distribution ──────────────────────────────────────────────────

  degreeOf(nodeId: string): { in: number; out: number; total: number } {
    const outbound = this.edges.query({ sourceId: nodeId }).length
    const inbound  = this.edges.query({ targetId: nodeId }).length
    return { in: inbound, out: outbound, total: inbound + outbound }
  }
}
