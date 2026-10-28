export type ReleaseOperation = "build" | "homologate" | "rollback" | "preflight" | "publish";

type ReleaseGrant = {
  lots?: string[];
  actions?: string[];
  // Delegates lot existence/registration validation to the existing restricted host operator.
  // Does not grant additional actions or access to arbitrary host commands.
  allRegisteredLots?: boolean;
};

export function authorizeReleaseOperation(input: {
  client: string | null | undefined;
  policyText?: string;
  operation: ReleaseOperation;
  lot: string;
}): string {
  if (!input.client) throw new Error("OPERATOR_IDENTITY_REQUIRED");
  if (!input.policyText) throw new Error("RELEASE_OPERATOR_POLICY_MISSING");
  if (!/^[A-Z][A-Z0-9]{1,15}-[0-9]{1,6}$/.test(input.lot)) throw new Error("INVALID_LOT_IDENTIFIER");

  let policies: Record<string, ReleaseGrant>;
  try {
    policies = JSON.parse(input.policyText) as Record<string, ReleaseGrant>;
  } catch {
    throw new Error("RELEASE_OPERATOR_POLICY_INVALID");
  }

  const grant = policies[input.client];
  if (!grant
    || !Array.isArray(grant.actions)
    || !grant.actions.includes(input.operation)
    || !(grant.allRegisteredLots === true
      || (Array.isArray(grant.lots) && grant.lots.includes(input.lot)))) {
    throw new Error("OPERATOR_NOT_AUTHORIZED");
  }

  return input.client;
}
