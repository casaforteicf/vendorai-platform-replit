import assert from "node:assert/strict";
import test from "node:test";
import {inspectVendiOperatorFailure as inspect} from "./vendi-operator-diagnostics.mjs";
test("returns unknown with absent stderr; does not invent cause",()=>{
 const r=inspect({action:"releaseStatus",lot:"AGENT-01",stderr:"",exitCode:1});
 assert.equal(r.category,"UNKNOWN_OPERATOR_FAILURE");assert.equal(r.diagnosticAvailable,false);
});
test("classifies known operator errors safely",()=>{
 const r=inspect({action:"build",lot:"AGENT-01",stderr:"sudo: a password is required TOKEN=secretvalue",exitCode:1});
 assert.equal(r.category,"SUDO_POLICY");assert.equal(r.exitCode,1);
 assert.equal(JSON.stringify(r).includes("secretvalue"),false);
});
test("rejects invalid action and lot",()=>{
 assert.equal(inspect({action:"deploy",lot:"AGENT-01"}).category,"INVALID_ARGUMENT");
 assert.equal(inspect({action:"build",lot:"../../etc/passwd"}).category,"INVALID_ARGUMENT");
});
test("does not erase unknown nonzero exit",()=>{
 const r=inspect({action:"build",lot:"AGENT-01",stderr:"unexpected failure",exitCode:42});
 assert.equal(r.exitCode,42); assert.equal(r.category,"UNKNOWN_OPERATOR_FAILURE");
});

test("categorizes common host failures without emitting stderr",()=>{
 const examples=[
  ["Permission denied (publickey).","SSH_AUTH"],
  ["Host key verification failed","SSH_HOST_KEY"],
  ["No space left on device","DISK_FULL"],
  ["lot AGENT-01 not found","LOT_NOT_REGISTERED"],
  ["migration failed","MIGRATION_FAILED"],
 ];
 for(const [stderr,category] of examples){
  const result=inspect({action:"build",lot:"AGENT-01",stderr,exitCode:1});
  assert.equal(result.category,category);
  assert.equal(JSON.stringify(result).includes(stderr),false);
 }
});

test("classifies the actual opaque SSH wrapper failure without pretending to know host cause",()=>{
 const wrapper="Command failed: ssh -i /app/.vendi-ssh/id_ed25519 -o BatchMode=yes vendorai@172.17.0.1 sudo -n /usr/local/sbin/vendi-contabo-operator releaseStatus AGENT-01\\n";
 const r=inspect({action:"releaseStatus",lot:"AGENT-01",errorMessage:wrapper});
 assert.equal(r.category,"REMOTE_EXIT_UNOBSERVABLE");
 assert.equal(r.exitCode,null);
 assert.equal(JSON.stringify(r).includes("id_ed25519"),false);
 assert.equal(r.diagnosticAvailable,true);
});
test("preserves the actual host error category when wrapper includes stderr",()=>{
 const r=inspect({action:"releaseStatus",lot:"AGENT-01",stderr:"Command failed: ssh operator\\nsudo: a password is required",exitCode:1});
 assert.equal(r.category,"SUDO_POLICY");
 assert.equal(r.exitCode,1);
});
