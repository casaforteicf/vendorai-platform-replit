// ─── Observability Engine ─────────────────────────────────────────────────────
// Records full execution audit: who, when, plan, agents, duration, result.
// FASE 13 — Observabilidade spec requirement.

import type { ObservabilityRecord, AgentType } from '../types'

let _seq = 0
function nextId(): string { return `obs_${Date.now()}_${++_seq}` }

export interface IObservabilityEngine {
  start(params: {
    tenantId:  string
    userId:    string
    intentId:  string
    planId:    string
  }): ObservabilityRecord

  complete(
    record: ObservabilityRecord,
    result: { success: boolean; error?: string; agentsUsed?: AgentType[] },
  ): ObservabilityRecord

  query(tenantId: string, limit?: number): ObservabilityRecord[]
  byPlan(planId: string): ObservabilityRecord | undefined
  stats(tenantId: string): ObservabilityStats
}

export interface ObservabilityStats {
  totalRuns:       number
  successRate:     number
  avgDurationMs:   number
  topAgentsUsed:   Array<{ agent: AgentType; count: number }>
  last24hRuns:     number
}

export class InMemoryObservabilityEngine implements IObservabilityEngine {
  private records: ObservabilityRecord[] = []

  start(params: {
    tenantId: string; userId: string; intentId: string; planId: string
  }): ObservabilityRecord {
    const record: ObservabilityRecord = {
      id:          nextId(),
      tenantId:    params.tenantId,
      userId:      params.userId,
      intentId:    params.intentId,
      planId:      params.planId,
      agentsUsed:  [],
      startedAt:   new Date().toISOString(),
      success:     false,
      metadata:    {},
    }
    this.records.unshift(record)
    return record
  }

  complete(
    record: ObservabilityRecord,
    result: { success: boolean; error?: string; agentsUsed?: AgentType[] },
  ): ObservabilityRecord {
    const now       = new Date().toISOString()
    const startMs   = new Date(record.startedAt).getTime()
    const durationMs = Date.now() - startMs

    const updated: ObservabilityRecord = {
      ...record,
      success:      result.success,
      error:        result.error,
      agentsUsed:   result.agentsUsed ?? record.agentsUsed,
      completedAt:  now,
      durationMs,
    }

    const idx = this.records.findIndex(r => r.id === record.id)
    if (idx >= 0) this.records[idx] = updated
    return updated
  }

  query(tenantId: string, limit = 50): ObservabilityRecord[] {
    return this.records.filter(r => r.tenantId === tenantId).slice(0, limit)
  }

  byPlan(planId: string): ObservabilityRecord | undefined {
    return this.records.find(r => r.planId === planId)
  }

  stats(tenantId: string): ObservabilityStats {
    const tenantRecords = this.records.filter(r => r.tenantId === tenantId)
    const completed     = tenantRecords.filter(r => r.completedAt)
    const now           = Date.now()
    const last24h       = tenantRecords.filter(r =>
      now - new Date(r.startedAt).getTime() < 86_400_000
    ).length

    const agentCounts: Partial<Record<AgentType, number>> = {}
    for (const r of tenantRecords) {
      for (const agent of r.agentsUsed) {
        agentCounts[agent] = (agentCounts[agent] ?? 0) + 1
      }
    }

    const topAgentsUsed = (Object.entries(agentCounts) as [AgentType, number][])
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([agent, count]) => ({ agent, count }))

    return {
      totalRuns:     tenantRecords.length,
      successRate:   completed.length > 0 ? completed.filter(r => r.success).length / completed.length : 0,
      avgDurationMs: completed.length > 0
        ? completed.reduce((a, r) => a + (r.durationMs ?? 0), 0) / completed.length
        : 0,
      topAgentsUsed,
      last24hRuns: last24h,
    }
  }
}
