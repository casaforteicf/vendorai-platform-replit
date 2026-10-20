import assert from "node:assert/strict";
import testCase from "node:test";
import { authorizeReleaseOperation } from "../dist/release-operator-policy.js";

const client = "operator-client-hash";
const policyText = JSON.stringify({
  [client]: {
    lots: ["VENDI-05"],
    actions: ["build", "homologate", "publish"],
  },
});

testCase("allows only an explicitly granted release action and lot", () => {
  assert.equal(authorizeReleaseOperation({
    client,
    policyText,
    operation: "publish",
    lot: "VENDI-05",
  }), client);
});

testCase("denies when OAuth operator identity is absent", () => {
  assert.throws(
    () => authorizeReleaseOperation({ client: null, policyText, operation: "publish", lot: "VENDI-05" }),
    /OPERATOR_IDENTITY_REQUIRED/,
  );
});

testCase("fails closed when the release policy is missing or invalid", () => {
  assert.throws(
    () => authorizeReleaseOperation({ client, operation: "publish", lot: "VENDI-05" }),
    /RELEASE_OPERATOR_POLICY_MISSING/,
  );
  assert.throws(
    () => authorizeReleaseOperation({ client, policyText: "{", operation: "publish", lot: "VENDI-05" }),
    /RELEASE_OPERATOR_POLICY_INVALID/,
  );
});

testCase("denies an action that is not granted", () => {
  assert.throws(
    () => authorizeReleaseOperation({ client, policyText, operation: "rollback", lot: "VENDI-05" }),
    /OPERATOR_NOT_AUTHORIZED/,
  );
});

testCase("denies a lot that is not granted", () => {
  assert.throws(
    () => authorizeReleaseOperation({ client, policyText, operation: "publish", lot: "VENDI-06" }),
    /OPERATOR_NOT_AUTHORIZED/,
  );
});

testCase("denies malformed grant scopes", () => {
  const malformed = JSON.stringify({ [client]: { lots: "VENDI-05", actions: ["publish"] } });
  assert.throws(
    () => authorizeReleaseOperation({ client, policyText: malformed, operation: "publish", lot: "VENDI-05" }),
    /OPERATOR_NOT_AUTHORIZED/,
  );
});
