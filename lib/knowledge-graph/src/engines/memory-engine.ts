// ─── Memory Engine ────────────────────────────────────────────────────────────
// Records every significant interaction and builds a temporal knowledge trail.
// "Toda interação gera memória." — FASE 18 spec.

import type { MemoryEvent } from '../types'

export interface IMemoryEngine {
  record(event: Omit<MemoryEvent, 'id' | 'occurredAt'>): MemoryEvent
  trail(userId: string, tenantId: string, limit?: number): MemoryEvent[]
  trailForNode(nodeId: string, limit?: number): MemoryEvent[]
  clear(tenantId: string): void
}

let _memSeq = 0

export class InMemoryMemoryEngine implements IMemoryEngine {
  private events: MemoryEvent[] = []

  record(event: Omit<MemoryEvent, 'id' | 'occurredAt'>): MemoryEvent {
    const full: MemoryEvent = {
      ...event,
      id:         `mem_${Date.now()}_${++_memSeq}`,
      occurredAt: new Date().toISOString(),
    }
    this.events.unshift(full) // newest first
    if (this.events.length > 10_000) this.events.pop() // cap
    return full
  }

  trail(userId: string, tenantId: string, limit = 50): MemoryEvent[] {
    return this.events
      .filter(e => e.userId === userId && e.tenantId === tenantId)
      .slice(0, limit)
  }

  trailForNode(nodeId: string, limit = 20): MemoryEvent[] {
    return this.events
      .filter(e => e.nodeIds.includes(nodeId))
      .slice(0, limit)
  }

  clear(tenantId: string): void {
    this.events = this.events.filter(e => e.tenantId !== tenantId)
  }

  // ─── Event factory helpers ────────────────────────────────────────────────

  static projectCreated(tenantId: string, userId: string, projectNodeId: string): Omit<MemoryEvent, 'id' | 'occurredAt'> {
    return { tenantId, userId, eventType: 'PROJECT_CREATED', nodeIds: [projectNodeId], edgeIds: [], context: {} }
  }

  static renderGenerated(
    tenantId: string, userId: string, renderNodeId: string, promptNodeId: string,
  ): Omit<MemoryEvent, 'id' | 'occurredAt'> {
    return { tenantId, userId, eventType: 'RENDER_GENERATED', nodeIds: [renderNodeId, promptNodeId], edgeIds: [], context: {} }
  }

  static materialUsed(
    tenantId: string, userId: string, materialNodeId: string, projectNodeId: string,
  ): Omit<MemoryEvent, 'id' | 'occurredAt'> {
    return { tenantId, userId, eventType: 'MATERIAL_USED', nodeIds: [materialNodeId, projectNodeId], edgeIds: [], context: {} }
  }

  static purchaseMade(
    tenantId: string, userId: string, purchaseNodeId: string, supplierNodeId: string,
  ): Omit<MemoryEvent, 'id' | 'occurredAt'> {
    return { tenantId, userId, eventType: 'PURCHASE_MADE', nodeIds: [purchaseNodeId, supplierNodeId], edgeIds: [], context: {} }
  }
}
