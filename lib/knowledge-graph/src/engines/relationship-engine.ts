// ─── Relationship Engine ──────────────────────────────────────────────────────
// SOLID: Single Responsibility — manages only edge lifecycle.
// Maintains adjacency indexes for O(1) neighbor lookups.

import type { VKGEdge, RelationshipType, EdgeQuery } from '../types'

export interface IRelationshipEngine {
  create(edge: Omit<VKGEdge, 'createdAt'>): VKGEdge
  get(id: string): VKGEdge | undefined
  remove(id: string): boolean
  query(q: EdgeQuery): VKGEdge[]
  neighborsOf(nodeId: string, direction?: 'outbound' | 'inbound' | 'both'): VKGEdge[]
  hasEdge(sourceId: string, targetId: string, type: RelationshipType): boolean
  all(): VKGEdge[]
  count(): number
}

export class InMemoryRelationshipEngine implements IRelationshipEngine {
  private store     = new Map<string, VKGEdge>()
  // Adjacency: nodeId → edge ids (outbound)
  private outbound  = new Map<string, Set<string>>()
  // Adjacency: nodeId → edge ids (inbound)
  private inbound   = new Map<string, Set<string>>()

  private index(edge: VKGEdge) {
    if (!this.outbound.has(edge.sourceId)) this.outbound.set(edge.sourceId, new Set())
    if (!this.inbound.has(edge.targetId))  this.inbound.set(edge.targetId,  new Set())
    this.outbound.get(edge.sourceId)!.add(edge.id)
    this.inbound.get(edge.targetId)!.add(edge.id)
  }

  private deindex(edge: VKGEdge) {
    this.outbound.get(edge.sourceId)?.delete(edge.id)
    this.inbound.get(edge.targetId)?.delete(edge.id)
  }

  create(edge: Omit<VKGEdge, 'createdAt'>): VKGEdge {
    const full: VKGEdge = { ...edge, createdAt: new Date().toISOString() }
    this.store.set(edge.id, full)
    this.index(full)
    return full
  }

  get(id: string): VKGEdge | undefined {
    return this.store.get(id)
  }

  remove(id: string): boolean {
    const edge = this.store.get(id)
    if (!edge) return false
    this.deindex(edge)
    return this.store.delete(id)
  }

  query(q: EdgeQuery): VKGEdge[] {
    let results = [...this.store.values()]
    if (q.sourceId)  results = results.filter(e => e.sourceId  === q.sourceId)
    if (q.targetId)  results = results.filter(e => e.targetId  === q.targetId)
    if (q.type)      results = results.filter(e => e.type      === q.type)
    if (q.tenantId)  results = results.filter(e => e.tenantId  === q.tenantId)
    if (q.minWeight) results = results.filter(e => e.weight   >= q.minWeight!)
    return results
  }

  neighborsOf(nodeId: string, direction: 'outbound' | 'inbound' | 'both' = 'both'): VKGEdge[] {
    const edges: VKGEdge[] = []
    if (direction === 'outbound' || direction === 'both') {
      for (const id of this.outbound.get(nodeId) ?? []) {
        const e = this.store.get(id)
        if (e) edges.push(e)
      }
    }
    if (direction === 'inbound' || direction === 'both') {
      for (const id of this.inbound.get(nodeId) ?? []) {
        const e = this.store.get(id)
        if (e) edges.push(e)
      }
    }
    return edges
  }

  all(): VKGEdge[] {
    return [...this.store.values()]
  }

  count(): number {
    return this.store.size
  }

  // ─── Duplicate guard ──────────────────────────────────────────────────────

  hasEdge(sourceId: string, targetId: string, type: RelationshipType): boolean {
    const outIds = this.outbound.get(sourceId)
    if (!outIds) return false
    for (const id of outIds) {
      const e = this.store.get(id)
      if (e && e.targetId === targetId && e.type === type) return true
    }
    return false
  }

  snapshot(): VKGEdge[] {
    return this.all()
  }

  hydrate(edges: VKGEdge[]): void {
    this.store.clear()
    this.outbound.clear()
    this.inbound.clear()
    for (const e of edges) { this.store.set(e.id, e); this.index(e) }
  }
}
