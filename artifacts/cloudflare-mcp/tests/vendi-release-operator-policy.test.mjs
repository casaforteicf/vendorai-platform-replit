import assert from "node:assert/strict";
import testCase from "node:test";
import { authorizeReleaseOperation } from "../dist/release-operator-policy.js";

const client = "operator-client-hash";
const policyText = JSON.stringify({
  [client]: { lots: ["VENDI-05"], actions: ["build", "homologate", "publish"] },
});

testCase("allows an explicitly granted release action and lot", () => {
  assert.equal(authorizeReleaseOperation({ client, policyText, operation: "publish", lot: "VENDI-05" }), client);
});

testCase("denies absent OAuth identity", () => {
  assert.throws(() => authorizeReleaseOperation({ client: null, policyText, operation: "publish", lot: "VENDI-05" }), /OPERATOR_IDENTITY_REQUIRED/);
});

testCase("fails closed on missing or invalid policy", () => {
  assert.throws(() => authorizeReleaseOperation({ client, operation: "publish", lot: "VENDI-05" }), /RELEASE_OPERATOR_POLICY_MISSING/);
  assert.throws(() => authorizeReleaseOperation({ client, policyText: "{", operation: "publish", lot: "VENDI-05" }), /RELEASE_OPERATOR_POLICY_INVALID/);
});

testCase("denies actions not granted", () => {
  assert.throws(() => authorizeReleaseOperation({ client, policyText, operation: "rollback", lot: "VENDI-05" }), /OPERATOR_NOT_AUTHORIZED/);
});

testCase("legacy grant still denies unlisted lots", () => {
  assert.throws(() => authorizeReleaseOperation({ client, policyText, operation: "publish", lot: "VENDI-06" }), /OPERATOR_NOT_AUTHORIZED/);
});

testCase("explicit dynamic delegation accepts multiple valid lot IDs", () => {
  const dynamic = JSON.stringify({ [client]: { allRegisteredLots: true, actions: ["preflight", "build"] } });
  for (const lot of ["VENDI-3616", "VENDI-3659", "VENDI-9999"]) {
    assert.equal(authorizeReleaseOperation({ client, policyText: dynamic, operation: "preflight", lot }), client);
  }
  // Host operator remains responsible for proving that each lot is actually registered.
  assert.throws(() => authorizeReleaseOperation({ client, policyText: dynamic, operation: "publish", lot: "VENDI-3616" }), /OPERATOR_NOT_AUTHORIZED/);
});

testCase("invalid lot identifiers are rejected even for dynamic delegation", () => {
  const dynamic = JSON.stringify({ [client]: { allRegisteredLots: true, actions: ["preflight"] } });
  for (const lot of ["../../etc/passwd", "VENDI-abc", "VENDI-3616;id"]) {
    assert.throws(() => authorizeReleaseOperation({ client, policyText: dynamic, operation: "preflight", lot }), /INVALID_LOT_IDENTIFIER/);
  }
});

testCase("malformed scopes cannot enable dynamic delegation", () => {
  for (const grant of [
    { lots: "VENDI-05", actions: ["publish"] },
    { allRegisteredLots: "true", actions: ["publish"] },
    { allRegisteredLots: true, actions: "publish" },
  ]) {
    assert.throws(() => authorizeReleaseOperation({ client, policyText: JSON.stringify({ [client]: grant }), operation: "publish", lot: "VENDI-05" }), /OPERATOR_NOT_AUTHORIZED/);
  }
});
