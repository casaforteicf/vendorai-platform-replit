// ─── Context Engine ───────────────────────────────────────────────────────────
// Assembles BrainContext from available sources (tenant, workspace, project, etc.)
// SOLID: each source is a separate ContextProvider that can be swapped.

import type { BrainContext, KGNodeRef, AgentRef } from '../types'

export interface ContextSource {
  name:     string
  priority: number
  /** Returns partial context or null if not applicable */
  provide(tenantId: string, userId: string): Partial<BrainContext> | Promise<Partial<BrainContext>>
}

export interface IContextEngine {
  assemble(tenantId: string, userId: string): Promise<BrainContext>
  addSource(source: ContextSource): void
}

export class ContextEngine implements IContextEngine {
  private sources: ContextSource[] = []

  addSource(source: ContextSource): void {
    this.sources.push(source)
    this.sources.sort((a, b) => b.priority - a.priority)
  }

  async assemble(tenantId: string, userId: string): Promise<BrainContext> {
    const base: BrainContext = {
      tenantId,
      userId,
      userRole:    'member',
      permissions: [],
      assembledAt: new Date().toISOString(),
    }

    for (const source of this.sources) {
      try {
        const partial = await source.provide(tenantId, userId)
        Object.assign(base, partial)
      } catch {
        // Source failure is non-fatal — degrade gracefully
      }
    }

    base.assembledAt = new Date().toISOString()
    return base
  }
}

// ─── Built-in context providers ───────────────────────────────────────────────

export class StaticContextSource implements ContextSource {
  name     = 'static'
  priority = 0

  constructor(private readonly partial: Partial<BrainContext>) {}

  provide(): Partial<BrainContext> {
    return this.partial
  }
}

export class KGContextSource implements ContextSource {
  name     = 'knowledge-graph'
  priority = 5

  constructor(
    private readonly getNodes: (tenantId: string) => KGNodeRef[],
  ) {}

  provide(tenantId: string): Partial<BrainContext> {
    const nodes = this.getNodes(tenantId).slice(0, 20)
    return { kgNodes: nodes }
  }
}

export class AgentRegistryContextSource implements ContextSource {
  name     = 'agent-registry'
  priority = 4

  constructor(
    private readonly getAgents: (tenantId: string) => AgentRef[],
  ) {}

  provide(tenantId: string): Partial<BrainContext> {
    return { agents: this.getAgents(tenantId) }
  }
}

// ─── Default factory ──────────────────────────────────────────────────────────

export function createContextEngine(): ContextEngine {
  return new ContextEngine()
}
