// ─── Graph Engine ─────────────────────────────────────────────────────────────
// Orchestrates node-engine + relationship-engine.
// Provides high-level graph operations: add, link, traverse, subgraph.
// SOLID: Open/Closed — new operations via extension, not modification.

import type {
  VKGNode, VKGEdge, VKGGraph,
  NodeType, RelationshipType,
  TraversalResult, TraversalOptions,
} from '../types'
import { InMemoryNodeEngine, type INodeEngine } from './node-engine'
import { InMemoryRelationshipEngine, type IRelationshipEngine } from './relationship-engine'
import { RELATIONSHIP_TAXONOMY } from '../taxonomy'

let _edgeSeq = 0
function nextEdgeId(): string {
  return `edge_${Date.now()}_${++_edgeSeq}`
}

export class GraphEngine {
  constructor(
    readonly nodes: INodeEngine            = new InMemoryNodeEngine(),
    readonly edges: IRelationshipEngine    = new InMemoryRelationshipEngine(),
  ) {}

  // ─── Nodes ─────────────────────────────────────────────────────────────────

  addNode(node: Omit<VKGNode, 'createdAt' | 'updatedAt'>): VKGNode {
    return this.nodes.add(node)
  }

  upsertNode(node: Omit<VKGNode, 'createdAt' | 'updatedAt'>): VKGNode {
    const existing = this.nodes.get(node.id)
    if (existing) {
      return this.nodes.update(node.id, { label: node.label, properties: node.properties }) ?? existing
    }
    return this.nodes.add(node)
  }

  removeNode(id: string): boolean {
    // Remove all edges incident to this node first
    const incident = this.edges.neighborsOf(id, 'both')
    for (const e of incident) this.edges.remove(e.id)
    return this.nodes.remove(id)
  }

  // ─── Edges ─────────────────────────────────────────────────────────────────

  link(
    sourceId: string,
    type: RelationshipType,
    targetId: string,
    options?: { weight?: number; properties?: Record<string, unknown>; tenantId?: string; inferred?: boolean }
  ): VKGEdge | null {
    const source = this.nodes.get(sourceId)
    const target = this.nodes.get(targetId)
    if (!source || !target) return null

    // Deduplicate
    if (this.edges.hasEdge(sourceId, targetId, type)) {
      return this.edges.query({ sourceId, targetId, type })[0] ?? null
    }

    const meta = RELATIONSHIP_TAXONOMY[type]
    return this.edges.create({
      id:         nextEdgeId(),
      type,
      sourceId,
      targetId,
      tenantId:   options?.tenantId ?? source.tenantId,
      weight:     options?.weight   ?? meta.defaultWeight,
      properties: options?.properties ?? {},
      inferred:   options?.inferred ?? false,
    })
  }

  unlink(sourceId: string, type: RelationshipType, targetId: string): boolean {
    const edge = this.edges.query({ sourceId, targetId, type })[0]
    if (!edge) return false
    return this.edges.remove(edge.id)
  }

  // ─── Traversal ─────────────────────────────────────────────────────────────

  traverse(startId: string, options?: TraversalOptions): TraversalResult[] {
    const maxDepth    = options?.maxDepth ?? 3
    const direction   = options?.direction ?? 'outbound'
    const relFilter   = options?.relationshipTypes

    const visited  = new Set<string>([startId])
    const results: TraversalResult[] = []
    const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: startId, depth: 0 }]

    while (queue.length > 0) {
      const { nodeId, depth } = queue.shift()!
      if (depth >= maxDepth) continue

      const incident = this.edges.neighborsOf(nodeId, direction)
      for (const edge of incident) {
        if (relFilter && !relFilter.includes(edge.type)) continue
        const neighborId = direction === 'inbound' ? edge.sourceId : edge.targetId
        if (visited.has(neighborId)) continue
        visited.add(neighborId)
        const neighborNode = this.nodes.get(neighborId)
        if (!neighborNode) continue
        results.push({ node: neighborNode, edge, depth: depth + 1 })
        queue.push({ nodeId: neighborId, depth: depth + 1 })
      }
    }

    return results
  }

  // ─── Subgraph ──────────────────────────────────────────────────────────────

  subgraph(nodeIds: string[]): VKGGraph {
    const idSet = new Set(nodeIds)
    const nodes = nodeIds.map(id => this.nodes.get(id)).filter(Boolean) as VKGNode[]
    const edges = this.edges.all().filter(e => idSet.has(e.sourceId) && idSet.has(e.targetId))
    return { nodes, edges }
  }

  // ─── Full graph export ─────────────────────────────────────────────────────

  export(): VKGGraph {
    return {
      nodes: this.nodes.all(),
      edges: this.edges.all(),
    }
  }

  // ─── Hydrate from snapshot ────────────────────────────────────────────────

  hydrate(graph: VKGGraph): void {
    if ('hydrate' in this.nodes) (this.nodes as InMemoryNodeEngine).hydrate(graph.nodes)
    if ('hydrate' in this.edges) (this.edges as InMemoryRelationshipEngine).hydrate(graph.edges)
  }

  // ─── Stats ────────────────────────────────────────────────────────────────

  stats() {
    return {
      nodeCount: this.nodes.count(),
      edgeCount: this.edges.count(),
    }
  }

  // ─── Neighborhood ─────────────────────────────────────────────────────────

  neighborhood(nodeId: string, depth = 1): VKGGraph {
    const traversed = this.traverse(nodeId, { maxDepth: depth, direction: 'both' })
    const nodeIds   = [nodeId, ...traversed.map(r => r.node.id)]
    return this.subgraph(nodeIds)
  }

  // ─── Path finding (BFS) ───────────────────────────────────────────────────

  shortestPath(fromId: string, toId: string): VKGEdge[] {
    if (fromId === toId) return []
    const prev = new Map<string, { via: string; edge: VKGEdge }>()
    const visited = new Set<string>([fromId])
    const queue = [fromId]

    while (queue.length > 0) {
      const current = queue.shift()!
      const incident = this.edges.neighborsOf(current, 'both')
      for (const edge of incident) {
        const neighbor = edge.sourceId === current ? edge.targetId : edge.sourceId
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        prev.set(neighbor, { via: current, edge })
        if (neighbor === toId) {
          // Reconstruct
          const path: VKGEdge[] = []
          let cur = toId
          while (prev.has(cur)) {
            const { via, edge: e } = prev.get(cur)!
            path.unshift(e)
            cur = via
          }
          return path
        }
        queue.push(neighbor)
      }
    }
    return [] // no path
  }

  // ─── Node type distribution ───────────────────────────────────────────────

  typeDistribution(): Record<NodeType, number> {
    const dist: Partial<Record<NodeType, number>> = {}
    for (const node of this.nodes.all()) {
      dist[node.type] = (dist[node.type] ?? 0) + 1
    }
    return dist as Record<NodeType, number>
  }
}
