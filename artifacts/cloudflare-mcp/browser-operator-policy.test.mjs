import test from "node:test";
import assert from "node:assert/strict";
import { authorizeBrowserOperation } from "./dist/browser-operator-policy.js";

const client = "oauth-client-hash";
const policyText = JSON.stringify({
  [client]: { actions: ["homolog_run_write"], tenants: ["tenant-a"] },
});

test("authorizes only the configured OAuth client, action, and tenant", () => {
  assert.equal(authorizeBrowserOperation({ client, policyText, operation: "homolog_run_write", tenantKey: "tenant-a" }), client);
  assert.throws(() => authorizeBrowserOperation({ client, policyText, operation: "homolog_run_write", tenantKey: "tenant-b" }), /OPERATOR_NOT_AUTHORIZED/);
  assert.throws(() => authorizeBrowserOperation({ client: "other", policyText, operation: "homolog_run_write", tenantKey: "tenant-a" }), /OPERATOR_NOT_AUTHORIZED/);
});

test("fails closed when identity or policy is missing or malformed", () => {
  assert.throws(() => authorizeBrowserOperation({ client: null, policyText, operation: "homolog_run_write", tenantKey: "tenant-a" }), /OPERATOR_IDENTITY_REQUIRED/);
  assert.throws(() => authorizeBrowserOperation({ client, operation: "homolog_run_write", tenantKey: "tenant-a" }), /BROWSER_OPERATOR_POLICY_MISSING/);
  assert.throws(() => authorizeBrowserOperation({ client, policyText: "{", operation: "homolog_run_write", tenantKey: "tenant-a" }), /BROWSER_OPERATOR_POLICY_INVALID/);
});
