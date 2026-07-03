// ─── Orchestration Engine ─────────────────────────────────────────────────────
// Coordinates execution of an ExecutionPlan: advances steps, resolves dependencies.
// In FASE 19: simulated execution (no real agent calls yet).

import type { ExecutionPlan, PlanStep, StepStatus, PlanStatus, TaskGraph } from '../types'

export interface IOrchestrationEngine {
  start(plan: ExecutionPlan): ExecutionPlan
  advance(plan: ExecutionPlan, stepId: string, result: { success: boolean; output?: unknown; error?: string }): ExecutionPlan
  cancel(plan: ExecutionPlan): ExecutionPlan
  readySteps(plan: ExecutionPlan): PlanStep[]
  toTaskGraph(plan: ExecutionPlan): TaskGraph
  simulateRun(plan: ExecutionPlan): ExecutionPlan
}

export class InMemoryOrchestrationEngine implements IOrchestrationEngine {
  start(plan: ExecutionPlan): ExecutionPlan {
    return {
      ...plan,
      status:    'RUNNING',
      startedAt: new Date().toISOString(),
      steps:     plan.steps.map(s =>
        s.dependsOn.length === 0
          ? { ...s, status: 'READY' as StepStatus }
          : s
      ),
    }
  }

  advance(
    plan: ExecutionPlan,
    stepId: string,
    result: { success: boolean; output?: unknown; error?: string },
  ): ExecutionPlan {
    const now   = new Date().toISOString()
    const steps = plan.steps.map(s => {
      if (s.id !== stepId) return s
      return {
        ...s,
        status:      (result.success ? 'COMPLETED' : 'FAILED') as StepStatus,
        completedAt: now,
        output:      result.output,
        error:       result.error,
      }
    })

    // Unlock steps whose dependencies are now all COMPLETED
    const completedIds = new Set(steps.filter(s => s.status === 'COMPLETED').map(s => s.id))
    const unblocked    = steps.map(s =>
      s.status === 'WAITING' && s.dependsOn.every(dep => completedIds.has(dep))
        ? { ...s, status: 'READY' as StepStatus }
        : s
    )

    const allDone   = unblocked.every(s => s.status === 'COMPLETED' || s.status === 'SKIPPED')
    const anyFailed = unblocked.some(s => s.status === 'FAILED')

    const status: PlanStatus = anyFailed ? 'FAILED' : allDone ? 'COMPLETED' : 'RUNNING'

    return {
      ...plan,
      steps:       unblocked,
      status,
      completedAt: (allDone || anyFailed) ? now : undefined,
    }
  }

  cancel(plan: ExecutionPlan): ExecutionPlan {
    return {
      ...plan,
      status:      'CANCELLED',
      completedAt: new Date().toISOString(),
      steps:       plan.steps.map(s =>
        s.status === 'WAITING' || s.status === 'READY'
          ? { ...s, status: 'SKIPPED' as StepStatus }
          : s
      ),
    }
  }

  readySteps(plan: ExecutionPlan): PlanStep[] {
    return plan.steps.filter(s => s.status === 'READY')
  }

  // ─── Task graph ───────────────────────────────────────────────────────────

  toTaskGraph(plan: ExecutionPlan): TaskGraph {
    const nodes = [
      { id: 'goal', label: plan.goal, type: 'goal' as const, status: 'RUNNING' as const },
      ...plan.steps.map(s => ({
        id:        s.id,
        label:     s.label,
        type:      'task' as const,
        status:    s.status,
        agentType: s.agentType,
      })),
    ]

    const edges = [
      // Goal → first ready steps
      ...plan.steps.filter(s => s.dependsOn.length === 0).map(s => ({
        from: 'goal', to: s.id,
      })),
      // Step → Step dependencies
      ...plan.steps.flatMap(s =>
        s.dependsOn.map(dep => ({ from: dep, to: s.id, label: 'requires' }))
      ),
    ]

    return { goalId: plan.id, goal: plan.goal, nodes, edges }
  }

  // ─── Simulated run (FASE 19 — no real agents yet) ────────────────────────

  simulateRun(plan: ExecutionPlan): ExecutionPlan {
    let current = this.start(plan)
    const maxIterations = plan.steps.length * 2 + 1

    for (let i = 0; i < maxIterations; i++) {
      const ready = this.readySteps(current)
      if (ready.length === 0) break

      for (const step of ready) {
        // Simulate: mark as RUNNING then COMPLETED
        current = {
          ...current,
          steps: current.steps.map(s =>
            s.id === step.id ? { ...s, status: 'RUNNING' as StepStatus, startedAt: new Date().toISOString() } : s
          ),
        }
        current = this.advance(current, step.id, {
          success: true,
          output:  { simulated: true, stepLabel: step.label },
        })
      }
    }

    return current
  }
}
