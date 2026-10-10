import test from "node:test";
import assert from "node:assert/strict";
import {validateHomologExchange as validate} from "../../artifacts/api-server/src/lib/homolog-token-exchange.ts";
test("accepts scoped homolog token",()=>{
 const r=validate({token:"opaque-token",tenantId:"tenant-a",userCache:{tenantId:"tenant-a",id:"user-a"}},"tenant-a");
 assert.equal(r.token,"opaque-token");
});
test("refuses mismatch in envelope or user cache",()=>{
 for(const payload of [
  {token:"secret",tenantId:"tenant-b",userCache:{tenantId:"tenant-a"}},
  {token:"secret",tenantId:"tenant-a",userCache:{tenantId:"tenant-b"}},
 ]) assert.throws(()=>validate(payload,"tenant-a"),/TENANT_MISMATCH/);
});
test("rejects empty token, null response and invalid cache",()=>{
 for(const payload of [null,{},[],{token:"",tenantId:"a",userCache:{tenantId:"a"}},{token:"secret",tenantId:"a",userCache:null}])
  assert.throws(()=>validate(payload,"a"),/INVALID_RESPONSE/);
});
test("error messages never contain tokens",()=>{
 try{validate({token:"private-secret",tenantId:"wrong",userCache:{tenantId:"correct"}},"correct")}catch(error){
  assert.equal(String(error).includes("private-secret"),false);
 }
});

test("rejects oversized token and blank requested tenant",()=>{
 assert.throws(()=>validate({token:"x".repeat(8193),tenantId:"a",userCache:{tenantId:"a"}},"a"),/INVALID_RESPONSE/);
 assert.throws(()=>validate({token:"opaque-token",tenantId:"a",userCache:{tenantId:"a"}}," "),/TENANT_MISMATCH/);
});
