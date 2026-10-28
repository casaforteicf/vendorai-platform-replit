export type ReleaseOperation = "build" | "homologate" | "rollback" | "preflight" | "publish" | "upgradeOperator" | "releaseStatus" | "auditReadiness";

type ReleaseGrant = {
  lots?: string[];
  actions?: string[];
};

export function authorizeReleaseOperation(input: {
  client: string | null;
  policyText?: string;
  operation: ReleaseOperation;
  lot: string;
}): string {
  if (!input.client) throw new Error("OPERATOR_IDENTITY_REQUIRED");
  if (!input.policyText) throw new Error("RELEASE_OPERATOR_POLICY_MISSING");

  let policies: Record<string, ReleaseGrant>;
  try {
    policies = JSON.parse(input.policyText) as Record<string, ReleaseGrant>;
  } catch {
    throw new Error("RELEASE_OPERATOR_POLICY_INVALID");
  }

  if (!policies || typeof policies !== "object" || Array.isArray(policies)) {
    throw new Error("RELEASE_OPERATOR_POLICY_INVALID");
  }
  const grant = Object.hasOwn(policies, input.client) ? policies[input.client] : undefined;
  if (!grant
    || !Array.isArray(grant.actions)
    || !grant.actions.includes(input.operation)
    || !Array.isArray(grant.lots)
    || !grant.lots.includes(input.lot)) {
    throw new Error("OPERATOR_NOT_AUTHORIZED");
  }

  return input.client;
}
