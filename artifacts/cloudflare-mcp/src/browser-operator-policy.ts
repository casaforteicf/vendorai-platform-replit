export type BrowserOperation = "homolog_run_write";

type BrowserGrant = {
  tenants?: string[];
  actions?: string[];
};

export function authorizeBrowserOperation(input: {
  client: string | null;
  policyText?: string;
  operation: BrowserOperation;
  tenantKey: string;
}): string {
  if (!input.client) throw new Error("OPERATOR_IDENTITY_REQUIRED");
  if (!input.policyText) throw new Error("BROWSER_OPERATOR_POLICY_MISSING");

  let policies: Record<string, BrowserGrant>;
  try {
    policies = JSON.parse(input.policyText) as Record<string, BrowserGrant>;
  } catch {
    throw new Error("BROWSER_OPERATOR_POLICY_INVALID");
  }

  const grant = policies[input.client];
  if (!grant
    || !Array.isArray(grant.actions)
    || !grant.actions.includes(input.operation)
    || !Array.isArray(grant.tenants)
    || !grant.tenants.includes(input.tenantKey)) {
    throw new Error("OPERATOR_NOT_AUTHORIZED");
  }

  return input.client;
}
