/**
 * Portal Unificado — invariantes do vínculo global (sem I/O).
 * This module deliberately does NOT link accounts, issue sessions, or authorize tenant data.
 * Any activation must obtain verified proof of ownership of EACH legacy account.
 */
export type LegacyAccountProof = {
  legacyPortalUserId: string;
  tenantId: string;
  sessionVerified: boolean;
  challengeVerified: boolean;
  proofConsumed: boolean;
  verifiedAt: Date | null;
};
export type GlobalLinkDecision =
  | { allowed: true; status: "verified" }
  | { allowed: false; reason: "MISSING_PROOF" | "TENANT_MISMATCH" | "PROOF_EXPIRED" | "PROOF_REUSED" | "SELF_LINK" };

export function evaluateCustomerLink(
  identityId: string,
  account: { id: string; tenantId: string },
  proof: LegacyAccountProof,
  now: Date,
  maxAgeMs = 10 * 60 * 1000,
): GlobalLinkDecision {
  if (!identityId.trim() || !account.id.trim() || !account.tenantId.trim()) {
    return { allowed: false, reason: "MISSING_PROOF" };
  }
  if (account.id !== proof.legacyPortalUserId || account.tenantId !== proof.tenantId) {
    return { allowed: false, reason: "TENANT_MISMATCH" };
  }
  if (!proof.sessionVerified || !proof.challengeVerified || !proof.verifiedAt) {
    return { allowed: false, reason: "MISSING_PROOF" };
  }
  if (proof.proofConsumed) return { allowed: false, reason: "PROOF_REUSED" };
  const age = now.getTime() - proof.verifiedAt.getTime();
  if (!Number.isFinite(age) || age < 0 || age > maxAgeMs) {
    return { allowed: false, reason: "PROOF_EXPIRED" };
  }
  return { allowed: true, status: "verified" };
}

/** No email similarity, CRM import or tenant membership is authorization. */
export function canReadCustomerResource(input: {
  identityVerified: boolean;
  linkStatus: "pending" | "verified" | "revoked";
  linkedTenantId: string;
  resourceTenantId: string;
  resourceGrant: boolean;
}): boolean {
  return input.identityVerified &&
    input.linkStatus === "verified" &&
    input.linkedTenantId === input.resourceTenantId &&
    input.resourceGrant === true;
}
