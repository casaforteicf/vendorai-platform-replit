import test from "node:test";
import assert from "node:assert/strict";
import { assessReleaseReadiness } from "./vendi-release-gates.mjs";

test("malformed release identity never passes preflight", () => {
  for (const input of [null, [], {}, {lot:42}, {commitSha:123}, {imageDigest:{}},
    {lot:"INFRA-01",commitSha:"not-a-sha",imageDigest:"sha256:invalid"}]) {
    const result=assessReleaseReadiness(input);
    assert.equal(result.ready,false);
    assert.ok(result.failures.length>0);
  }
});
test("an approval flag alone does not override missing evidence", () => {
  const result=assessReleaseReadiness({approved:true,target:"homolog"});
  assert.equal(result.ready,false);
  assert.ok(result.failures.includes("EVIDENCE_SOURCE_MISSING"));
  assert.ok(result.failures.includes("COMMIT_IMAGE_NOT_VERIFIED"));
});
