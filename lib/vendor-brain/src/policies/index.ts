// ─── Vendor Brain — Policies ──────────────────────────────────────────────────
// Security and governance rules enforced before any plan executes.
// FASE 14 — Segurança spec requirement.

import type { BrainContext, ExecutionPlan, DecisionRecord } from '../types'

export interface PolicyViolation {
  policy:  string
  message: string
  fatal:   boolean
}

export interface PolicyResult {
  allowed:    boolean
  violations: PolicyViolation[]
}

export interface IBrainPolicy {
  name:    string
  check(context: BrainContext, plan?: ExecutionPlan): PolicyResult
}

// ─── Tenant Isolation Policy ─────────────────────────────────────────────────

export class TenantIsolationPolicy implements IBrainPolicy {
  name = 'tenant-isolation'

  check(context: BrainContext, plan?: ExecutionPlan): PolicyResult {
    const violations: PolicyViolation[] = []

    if (plan && plan.tenantId !== context.tenantId) {
      violations.push({
        policy:  this.name,
        message: `Plano pertence ao tenant ${plan.tenantId} mas contexto é ${context.tenantId}. Acesso negado.`,
        fatal:   true,
      })
    }

    return { allowed: violations.filter(v => v.fatal).length === 0, violations }
  }
}

// ─── Permission Policy ────────────────────────────────────────────────────────

const ROLE_PERMISSIONS: Record<string, string[]> = {
  super_admin:  ['*'],
  tenant_admin: ['read', 'write', 'execute', 'manage_agents', 'approve'],
  member:       ['read', 'write', 'execute'],
  viewer:       ['read'],
}

export class PermissionPolicy implements IBrainPolicy {
  name = 'permission-check'

  constructor(private readonly requiredPermission: string = 'execute') {}

  check(context: BrainContext): PolicyResult {
    const allowed = ROLE_PERMISSIONS[context.userRole] ?? []
    const hasPermission = allowed.includes('*') || allowed.includes(this.requiredPermission)

    const violations: PolicyViolation[] = hasPermission ? [] : [{
      policy:  this.name,
      message: `Papel "${context.userRole}" não possui permissão "${this.requiredPermission}".`,
      fatal:   true,
    }]

    return { allowed: hasPermission, violations }
  }
}

// ─── Confidence Policy ────────────────────────────────────────────────────────

export class MinConfidencePolicy implements IBrainPolicy {
  name = 'min-confidence'

  constructor(private readonly threshold = 0.5) {}

  check(_context: BrainContext, plan?: ExecutionPlan): PolicyResult {
    if (!plan) return { allowed: true, violations: [] }
    const ok = plan.confidence >= this.threshold

    return {
      allowed: ok,
      violations: ok ? [] : [{
        policy:  this.name,
        message: `Confiança do plano (${(plan.confidence * 100).toFixed(0)}%) abaixo do mínimo exigido (${(this.threshold * 100).toFixed(0)}%). Revise antes de executar.`,
        fatal:   false,
      }],
    }
  }
}

// ─── Policy runner ────────────────────────────────────────────────────────────

export class PolicyRunner {
  private policies: IBrainPolicy[] = []

  add(policy: IBrainPolicy): this {
    this.policies.push(policy)
    return this
  }

  runAll(context: BrainContext, plan?: ExecutionPlan): PolicyResult {
    const allViolations: PolicyViolation[] = []
    for (const policy of this.policies) {
      const result = policy.check(context, plan)
      allViolations.push(...result.violations)
    }
    return {
      allowed:    allViolations.filter(v => v.fatal).length === 0,
      violations: allViolations,
    }
  }
}

// ─── Default policy suite ─────────────────────────────────────────────────────

export function createDefaultPolicies(): PolicyRunner {
  return new PolicyRunner()
    .add(new TenantIsolationPolicy())
    .add(new PermissionPolicy('execute'))
    .add(new MinConfidencePolicy(0.45))
}

// ─── Decision audit filter ────────────────────────────────────────────────────

export function filterDecisionsByTenant(
  decisions: DecisionRecord[],
  tenantId:  string,
): DecisionRecord[] {
  return decisions.filter(d => (d.context['tenantId'] as string) === tenantId)
}
