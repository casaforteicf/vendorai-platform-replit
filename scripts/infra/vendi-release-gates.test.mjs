import test from "node:test";
import assert from "node:assert/strict";
import {assessReleaseReadiness as assess,evaluateApiAuth as auth} from "./vendi-release-gates.mjs";
const valid=()=>({
 lot:"AGENT-01",commitSha:"a".repeat(40),imageDigest:"sha256:"+"b".repeat(64),
 commitImageVerified:true,lotMappingVerified:true,operatorVerified:true,
 homologHealth:"ok",testsPassed:true,backupVerified:true,rollbackVerified:true,
 migrationsVerified:true,tenantIsolationVerified:true,target:"homolog",
 approved:true,approvalReference:"APPROVAL-123",approvedLot:"AGENT-01",approvedCommitSha:"a".repeat(40),
 evidenceSource:"contabo-homolog",evidenceCommitSha:"a".repeat(40),evidenceImageDigest:"sha256:"+"b".repeat(64)
});
test("no input fails closed",()=>assert.deepEqual(assess(),{ready:false,failures:["INVALID_INPUT"],checkedAt:null}));
test("every required gate must be verified",()=>{const r=assess({lot:"AGENT-01",target:"homolog"});assert.equal(r.ready,false);assert.ok(r.failures.includes("BACKUP_UNVERIFIED"));assert.ok(r.failures.includes("COMMIT_INVALID"))});
test("complete mock evidence accepts homologation only",()=>assert.equal(assess(valid()).ready,true));
test("production never allowed by homologation gate",()=>{const r=assess({...valid(),target:"production"});assert.equal(r.ready,false);assert.ok(r.failures.includes("PRODUCTION_MUTATION_REQUESTED"))});
test("immutable commit and image digest mandatory",()=>{const r=assess({...valid(),commitSha:"main",imageDigest:"latest"});assert.ok(r.failures.includes("COMMIT_INVALID"));assert.ok(r.failures.includes("IMAGE_DIGEST_MISSING"))});
test("does not echo secrets",()=>{const r=assess({...valid(),approvalReference:"secret"});assert.equal(JSON.stringify(r).includes("secret"),false)});
test("auth 401 and tenant 404 handled separately without automatic retry",()=>{
 assert.equal(auth({status:401}).category,"API_AUTH_EXPIRED_OR_INVALID");
 assert.equal(auth({status:401}).retryAutomatically,false);
 assert.equal(auth({status:404}).category,"TENANT_OR_ENDPOINT_NOT_FOUND");
 assert.equal(auth({status:403}).category,"API_FORBIDDEN");
});

test("evidence for another commit or image cannot authorize release",()=>{
 const r=assess({...valid(),evidenceCommitSha:"c".repeat(40),evidenceImageDigest:"sha256:"+"d".repeat(64)});
 assert.ok(r.failures.includes("EVIDENCE_COMMIT_MISMATCH"));
 assert.ok(r.failures.includes("EVIDENCE_IMAGE_MISMATCH"));
});
test("approval for a different lot or commit cannot authorize release",()=>{
 const r=assess({...valid(),approvedLot:"OTHER-02",approvedCommitSha:"c".repeat(40)});
 assert.ok(r.failures.includes("APPROVAL_SCOPE_MISMATCH"));
 assert.ok(r.failures.includes("APPROVAL_LOT_MISMATCH"));
});
test("evidence references exclude spaces and newlines",()=>{
 const r=assess({...valid(),evidenceSource:"token=secret value"});
 assert.ok(r.failures.includes("EVIDENCE_SOURCE_MISSING"));
 assert.equal(JSON.stringify(r).includes("secret"),false);
});
