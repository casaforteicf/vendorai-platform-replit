import { createHash } from "node:crypto";
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

const MANAGER_DOMAINS: readonly string[] = ["master", "crm", "pipeline", "marketing", "omnichannel", "integrations", "agenda", "proposals", "prospecting", "construction", "finance", "arqdor", "ux", "security"];
const MANAGER_SUPPORT_KINDS: readonly string[] = ["platform_defect", "platform_improvement", "shared_behavior", "security_incident"];

/** Scope support-review deduplication to a tenant, or explicitly to global. */
export function managerSupportSourceRef(
  module: ManagerDomain,
  kind: DemandKind,
  fingerprint: string,
  tenantId?: string,
): string {
  if (typeof fingerprint !== "string" || !fingerprint.trim()) throw new Error("FINGERPRINT_REQUIRED");
  const normalizedFingerprint = fingerprint.trim();
  if (normalizedFingerprint.length > 512) throw new Error("FINGERPRINT_TOO_LONG");
  // Never treat unsupported runtime module/kind values as a valid review identity.
  if (!MANAGER_DOMAINS.includes(module)) throw new Error("INVALID_MANAGER_DOMAIN");
  if (!MANAGER_SUPPORT_KINDS.includes(kind)) throw new Error("MANAGER_SUPPORT_KIND_INVALID");
  if (tenantId !== undefined && typeof tenantId !== "string") throw new Error("TENANT_REQUIRED");
  const scope = tenantId === undefined ? null : tenantId.trim();
  if (scope === "") throw new Error("TENANT_REQUIRED");
  // Namespace global and tenant scopes separately, even if a tenant slug is "global".
  const scopedIdentity = scope === null ? ["global"] : ["tenant", scope];
  return "manager:" + createHash("sha256")
    .update(JSON.stringify([scopedIdentity, module, kind, normalizedFingerprint]))
    .digest("hex").slice(0, 40);
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

/**
 * Choose one stable tenant page for each domain and cadence bucket.
 * Rotation is independent by domain; the page cannot exceed the active
 * tenant count, even when the population is smaller than a full page.
 */
export function managerTenantPageOffset(
  domain: Exclude<ManagerDomain, "security">,
  now: Date,
  totalTenants: number,
  pageSize = 500,
): number {
  if (!Number.isFinite(now.getTime())) throw new Error("INVALID_MANAGER_TIME");
  const interval = MANAGER_INTERVAL_MINUTES[domain];
  if (!Number.isFinite(interval) || interval <= 0) throw new Error("INVALID_MANAGER_DOMAIN");
  if (!Number.isSafeInteger(totalTenants) || totalTenants < 0 ||
      !Number.isSafeInteger(pageSize) || pageSize <= 0) {
    throw new Error("INVALID_MANAGER_PAGINATION");
  }
  const pageCount = Math.max(1, Math.ceil(totalTenants / pageSize));
  const bucket = Math.floor(now.getTime() / (interval * 60_000));
  return (bucket % pageCount) * pageSize;
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
  if (!input || typeof input !== "object") throw new Error("MANAGER_OPPORTUNITY_INVALID");
  if (typeof input.tenantId !== "string" || !input.tenantId.trim()) throw new Error("TENANT_REQUIRED");
  if (!MANAGER_DOMAINS.includes(input.domain)) throw new Error("INVALID_MANAGER_DOMAIN");
  const allowedKinds: readonly string[] = [
    "tenant_guidance", "tenant_configuration", "tenant_operation",
    "platform_defect", "platform_improvement", "shared_behavior",
    "security_incident", "unknown",
  ];
  if (!allowedKinds.includes(input.kind)) throw new Error("INVALID_MANAGER_DEMAND_KIND");
  if (typeof input.fingerprint !== "string" || !input.fingerprint.trim()) throw new Error("FINGERPRINT_REQUIRED");
  if (input.fingerprint.length > 512) throw new Error("FINGERPRINT_TOO_LONG");
  if (typeof input.evidence !== "string" || !input.evidence.trim()) throw new Error("EVIDENCE_REQUIRED");
  if (input.evidence.length > 16_000 || input.fingerprint.length > 512) throw new Error("MANAGER_FINDING_TOO_LARGE");
  if (input.evidence.length > 8000) throw new Error("EVIDENCE_TOO_LONG");
}
