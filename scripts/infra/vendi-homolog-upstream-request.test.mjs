import test from "node:test";
import assert from "node:assert/strict";
import {homologUpstreamRequest} from "../../artifacts/api-server/src/lib/homolog-upstream-request.ts";
test("prevents forwarding bearer on HTTP redirects",()=>{
 const request=homologUpstreamRequest("opaque");
 assert.equal(request.redirect,"manual");
 assert.equal(request.headers.authorization,"Bearer opaque");
});
test("sets bounded request deadline",()=>{
 const request=homologUpstreamRequest("opaque");
 assert.ok(request.signal instanceof AbortSignal);
 assert.equal(request.signal.aborted,false);
});
test("fails closed if upstream token is absent",()=>{
 assert.throws(()=>homologUpstreamRequest(""),/UPSTREAM_TOKEN_MISSING/);
 assert.throws(()=>homologUpstreamRequest(" "),/UPSTREAM_TOKEN_MISSING/);
});
