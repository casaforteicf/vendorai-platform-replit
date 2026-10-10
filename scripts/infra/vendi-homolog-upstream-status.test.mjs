import test from "node:test";
import assert from "node:assert/strict";
import {classifyHomologUpstreamStatus as classify} from "../../artifacts/api-server/src/lib/homolog-upstream-status.ts";
test("accepts upstream success",()=>assert.equal(classify(200),null));
test("separates expired credentials from permission denial",()=>{
 assert.deepEqual(classify(401),{status:401,error:"upstream_token_rejected"});
 assert.deepEqual(classify(403),{status:403,error:"upstream_permission_denied"});
});
test("does not report upstream availability failures as expired credentials",()=>{
 for(const status of [404,429,500,502,503,504]) assert.deepEqual(classify(status),{status:502,error:"upstream_auth_unavailable"});
});
