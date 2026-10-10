/**
 * AGENT-01: deterministic policy shared by the recurring manager workers.
 * Pure module: no messages, DB writes, or deployments are performed here.
 * Keeping routing and cadence deterministic makes safety gates testable.
 */
export type ManagerDomain =
  | "master" | "crm" | "pipeline" | "marketing" | "omnichannel"
  | "integrations" | "agenda" | "proposals" | "prospecting"
  | "construction" | "finance" | "arqdor" | "ux" | "security";

export type DemandKind =
  | "tenant_guidance" | "tenant_configuration" | "tenant_operation"
  | "platform_defect" | "platform_improvement" | "shared_behavior"
  | "security_incident" | "unknown";

export type ManagerRoute = "jarvis" | "superadmin_support";
export type ApprovalAuthority = "tenant_when_required" | "superadmin_required";

export interface DemandDecision {
  route: ManagerRoute;
  approval: ApprovalAuthority;
  mayChangePlatformCode: false;
  requiresImmediateAttention: boolean;
  reason: string;
}

/** Initial cadence, configurable by the worker in future revisions. */
export const MANAGER_INTERVAL_MINUTES: Readonly<Record<Exclude<ManagerDomain, "security">, number>> = {
  master: 15,
  crm: 15,
  pipeline: 15,
  marketing: 60,
  omnichannel: 15,
  integrations: 15,
  agenda: 30,
  proposals: 30,
  prospecting: 60,
  construction: 60,
  finance: 60,
  arqdor: 1440,
  ux: 1440,
};

/**
 * This decision can safely be made before any expensive model invocation.
 * Uncertain findings go to Support rather than risk an unauthorized change.
 */
export function classifyManagerDemand(kind: DemandKind): DemandDecision {
  if (kind === "tenant_guidance" || kind === "tenant_configuration" || kind === "tenant_operation") {
    return {
      route: "jarvis",
      approval: "tenant_when_required",
      mayChangePlatformCode: false,
      requiresImmediateAttention: false,
      reason: "Tenant-specific activity must be handled by Jarvis within tenant permissions.",
    };
  }
  return {
    route: "superadmin_support",
    approval: "superadmin_required",
    mayChangePlatformCode: false,
    requiresImmediateAttention: kind === "security_incident",
    reason: "Platform changes, security findings and uncertain cases require Superadmin review.",
  };
}

/** Pure deterministic bucketing for idempotency and duplicate suppression. */
export function managerExecutionBucket(
  domain: Exclude<ManagerDomain, "security">,
  now: Date,
): string {
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_MANAGER_TIME");
  const interval = MANAGER_INTERVAL_MINUTES[domain];
  if (!Number.isFinite(interval) || interval <= 0) throw new Error("INVALID_MANAGER_DOMAIN");
  const bucket = Math.floor(now.getTime() / (interval * 60_000));
  return `manager:${domain}:${bucket}`;
}

export function isManagerDue(
  domain: Exclude<ManagerDomain, "security">,
  lastSuccessfulRun: Date | null,
  now: Date,
): boolean {
  if (!Number.isFinite(now.getTime())) return false;
  const interval = MANAGER_INTERVAL_MINUTES[domain];
  if (!Number.isFinite(interval) || interval <= 0) return false;
  if (lastSuccessfulRun === null) return true;
  if (!Number.isFinite(lastSuccessfulRun.getTime())) return true;
  // A future timestamp (clock skew or corrupt data) must not indefinitely starve scans.
  if (lastSuccessfulRun.getTime() > now.getTime()) return true;
  return now.getTime() - lastSuccessfulRun.getTime()
    >= interval * 60_000;
}

/**
 * Communication eligibility must still be checked using the tenant business
 * hours, channel opt-ins, RBAC and the existing Jarvis action guard.
 */
export interface ManagerOpportunity {
  tenantId: string;
  domain: ManagerDomain;
  kind: DemandKind;
  fingerprint: string;
  evidence: string;
}

export function validateManagerOpportunity(input: ManagerOpportunity): void {
  if (!input.tenantId.trim()) throw new Error("TENANT_REQUIRED");
  if (!input.fingerprint.trim()) throw new Error("FINGERPRINT_REQUIRED");
  if (!input.evidence.trim()) throw new Error("EVIDENCE_REQUIRED");
}
