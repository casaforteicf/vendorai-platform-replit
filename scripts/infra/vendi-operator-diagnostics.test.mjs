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
