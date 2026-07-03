// ─── Execution Engine ─────────────────────────────────────────────────────────
// Prepares the interface for delegated task execution.
// FASE 19: MOCKED — no real agent calls. Architecture scaffold only.

import type { PlanStep, AgentType, ExecutionPlan } from '../types'

export interface ExecutionRequest {
  stepId:    string
  planId:    string
  agentType: AgentType
  agentId?:  string
  input:     Record<string, unknown>
  tenantId:  string
  userId:    string
  createdAt: string
}

export interface ExecutionResponse {
  requestId: string
  stepId:    string
  success:   boolean
  output?:   unknown
  error?:    string
  durationMs: number
  executedAt: string
}

export interface IExecutionEngine {
  prepare(step: PlanStep, plan: ExecutionPlan, input?: Record<string, unknown>): ExecutionRequest
  /** FASE 19: mock-only. Real implementation in FASE 20+. */
  dispatch(request: ExecutionRequest): Promise<ExecutionResponse>
  pending(): ExecutionRequest[]
  history(tenantId: string, limit?: number): ExecutionResponse[]
}

let _reqSeq = 0
function nextReqId(): string { return `req_${Date.now()}_${++_reqSeq}` }

export class MockedExecutionEngine implements IExecutionEngine {
  private queue:   ExecutionRequest[]  = []
  private history_: ExecutionResponse[] = []

  prepare(step: PlanStep, plan: ExecutionPlan, input: Record<string, unknown> = {}): ExecutionRequest {
    return {
      stepId:    step.id,
      planId:    plan.id,
      agentType: step.agentType,
      input:     { stepLabel: step.label, ...input },
      tenantId:  plan.tenantId,
      userId:    '',
      createdAt: new Date().toISOString(),
    }
  }

  async dispatch(request: ExecutionRequest): Promise<ExecutionResponse> {
    this.queue.push(request)
    // Simulate a short async delay
    await new Promise(r => setTimeout(r, 50))

    const response: ExecutionResponse = {
      requestId:  nextReqId(),
      stepId:     request.stepId,
      success:    true,
      output:     { mocked: true, agent: request.agentType, step: request.stepId },
      durationMs: Math.floor(Math.random() * 800) + 200,
      executedAt: new Date().toISOString(),
    }

    this.queue = this.queue.filter(r => r.stepId !== request.stepId)
    this.history_.unshift(response)
    return response
  }

  pending(): ExecutionRequest[] {
    return [...this.queue]
  }

  history(tenantId: string, limit = 50): ExecutionResponse[] {
    return this.history_
      .filter(() => true) // tenant not stored on response — filter at Engine level
      .slice(0, limit)
  }
}
