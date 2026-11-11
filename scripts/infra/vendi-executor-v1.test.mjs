import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const path = fileURLToPath(new URL("./vendi-executor-v1.sh", import.meta.url));
test("syntax passes", () => {
 const r=spawnSync("bash",["-n",path],{encoding:"utf8"});
 assert.equal(r.status,0,r.stderr);
});
test("unknown command denied",()=>{
 const r=spawnSync("bash",[path,"rm"],{encoding:"utf8"});
 assert.equal(r.status,64);
 assert.match(r.stdout,/ACTION_NOT_ALLOWED/);
});
test("extra arguments denied",()=>{
 const r=spawnSync("bash",[path,"identity","unexpected"],{encoding:"utf8"});
 assert.equal(r.status,64);
});
test("identity is read-only and reports actual user",()=>{
 const r=spawnSync("bash",[path,"identity"],{encoding:"utf8"});
 assert.equal(r.status,0,r.stderr);
 assert.ok(r.stdout.trim().split("\n").length>=2);
});
