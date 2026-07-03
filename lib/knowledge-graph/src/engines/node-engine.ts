// ─── Node Engine ─────────────────────────────────────────────────────────────
// SOLID: Single Responsibility — manages only node lifecycle.
// Interface-driven for easy swap to DB-backed implementation.

import type { VKGNode, NodeType, NodeQuery } from '../types'

// ─── Port (interface) ─────────────────────────────────────────────────────────

export interface INodeEngine {
  add(node: Omit<VKGNode, 'createdAt' | 'updatedAt'>): VKGNode
  get(id: string): VKGNode | undefined
  update(id: string, patch: Partial<Pick<VKGNode, 'label' | 'properties' | 'embedding'>>): VKGNode | undefined
  remove(id: string): boolean
  query(q: NodeQuery): VKGNode[]
  all(): VKGNode[]
  count(): number
}

// ─── In-memory adapter (default) ─────────────────────────────────────────────

export class InMemoryNodeEngine implements INodeEngine {
  private store = new Map<string, VKGNode>()

  add(node: Omit<VKGNode, 'createdAt' | 'updatedAt'>): VKGNode {
    const now = new Date().toISOString()
    const full: VKGNode = { ...node, createdAt: now, updatedAt: now }
    this.store.set(node.id, full)
    return full
  }

  get(id: string): VKGNode | undefined {
    return this.store.get(id)
  }

  update(id: string, patch: Partial<Pick<VKGNode, 'label' | 'properties' | 'embedding'>>): VKGNode | undefined {
    const existing = this.store.get(id)
    if (!existing) return undefined
    const updated: VKGNode = { ...existing, ...patch, updatedAt: new Date().toISOString() }
    this.store.set(id, updated)
    return updated
  }

  remove(id: string): boolean {
    return this.store.delete(id)
  }

  query(q: NodeQuery): VKGNode[] {
    let results = [...this.store.values()]
    if (q.type)      results = results.filter(n => n.type === q.type)
    if (q.tenantId)  results = results.filter(n => n.tenantId === q.tenantId)
    if (q.labelLike) {
      const lower = q.labelLike.toLowerCase()
      results = results.filter(n => n.label.toLowerCase().includes(lower))
    }
    if (q.properties) {
      results = results.filter(n =>
        Object.entries(q.properties!).every(([k, v]) => n.properties[k] === v)
      )
    }
    if (q.limit) results = results.slice(0, q.limit)
    return results
  }

  all(): VKGNode[] {
    return [...this.store.values()]
  }

  count(): number {
    return this.store.size
  }

  // ─── Snapshot (for serialisation / hydration) ──────────────────────────────

  snapshot(): VKGNode[] {
    return this.all()
  }

  hydrate(nodes: VKGNode[]): void {
    this.store.clear()
    for (const n of nodes) this.store.set(n.id, n)
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function nodeId(type: NodeType, externalId: string): string {
  return `${type.toLowerCase()}_${externalId}`
}
