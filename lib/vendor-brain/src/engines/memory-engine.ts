// ─── Brain Memory Engine ──────────────────────────────────────────────────────
// Records goal → plan → result → learnings for the Vendor Brain.
// Separate from the VKG memory engine — Brain memory is higher-level.

import type { BrainMemoryEvent } from '../types'

let _seq = 0
function nextId(): string { return `brainmem_${Date.now()}_${++_seq}` }

export interface IBrainMemoryEngine {
  record(event: Omit<BrainMemoryEvent, 'id' | 'occurredAt'>): BrainMemoryEvent
  trail(userId: string, tenantId: string, limit?: number): BrainMemoryEvent[]
  forGoal(goal: string, tenantId: string): BrainMemoryEvent[]
  learnings(tenantId: string): string[]
  clear(tenantId: string): void
}

export class InMemoryBrainMemoryEngine implements IBrainMemoryEngine {
  private events: BrainMemoryEvent[] = []

  record(event: Omit<BrainMemoryEvent, 'id' | 'occurredAt'>): BrainMemoryEvent {
    const full: BrainMemoryEvent = {
      ...event,
      id:         nextId(),
      occurredAt: new Date().toISOString(),
    }
    this.events.unshift(full)
    if (this.events.length > 5000) this.events.pop()
    return full
  }

  trail(userId: string, tenantId: string, limit = 50): BrainMemoryEvent[] {
    return this.events
      .filter(e => e.userId === userId && e.tenantId === tenantId)
      .slice(0, limit)
  }

  forGoal(goal: string, tenantId: string): BrainMemoryEvent[] {
    const goalLower = goal.toLowerCase()
    return this.events
      .filter(e => e.tenantId === tenantId && e.goal.toLowerCase().includes(goalLower))
  }

  learnings(tenantId: string): string[] {
    return this.events
      .filter(e => e.tenantId === tenantId && e.learnings.length > 0)
      .flatMap(e => e.learnings)
      .filter((v, i, a) => a.indexOf(v) === i)  // unique
      .slice(0, 50)
  }

  clear(tenantId: string): void {
    this.events = this.events.filter(e => e.tenantId !== tenantId)
  }
}
