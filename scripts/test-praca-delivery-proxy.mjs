import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {stripTypeScriptTypes} from "node:module";
import vm from "node:vm";
const handlers=new Map(),router=new Proxy({},{get:(_t,method)=>(path,handler)=>{handlers.set(method.toUpperCase()+" "+path,handler);return router}});
const mod=new vm.SourceTextModule(stripTypeScriptTypes(await readFile(new URL("../artifacts/api-server/src/routes/praca_rounds.ts",import.meta.url),"utf8"),{mode:"transform"}));
await mod.link(async name=>{assert.equal(name,"express");return new vm.SyntheticModule(["Router"],function(){this.setExport("Router",()=>router)})});await mod.evaluate();
const oldUrl=process.env.PRACA_AI_INTERNAL_API_URL,oldToken=process.env.PRACA_ROUNDS_VENDOR_TOKEN,oldFetch=globalThis.fetch;
process.env.PRACA_AI_INTERNAL_API_URL="https://praca-test.invalid/api";process.env.PRACA_ROUNDS_VENDOR_TOKEN="a".repeat(40);
let forwarded;
globalThis.fetch=async(url,init)=>{forwarded={url,init};return {status:201,json:async()=>({status:"awaiting_buyer_confirmation"})}};
async function call(user,body={}){let status=200;const res={status(v){status=v;return this},set(){return this},json(){return this}};await handlers.get("POST /praca-pedidos/:type/:id/comprovante")({user,params:{type:"quote",id:"11111111-1111-4111-8111-111111111111"},body},res);return status;}
try{
 assert.equal(await call(null),403);assert.equal(forwarded,undefined);
 assert.equal(await call({tenantId:"signed-tenant"},{photo:"x".repeat(1000001)}),422);
 assert.equal(await call({tenantId:"signed-tenant"},{tenantId:"other-tenant",photo:"data:image/jpeg;base64,TEST",receivedBy:"Pessoa",allItemsDelivered:true}),201);
 assert.equal(JSON.parse(forwarded.init.body).tenantId,"signed-tenant");
 assert.ok(forwarded.url.includes("/internal/vendor-orders/quote/"));
 console.log("PASS: sessão obrigatória, limite do payload e tenant derivado da sessão assinada; upstream simulado.");
}finally{
 globalThis.fetch=oldFetch;
 for(const[k,v]of [["PRACA_AI_INTERNAL_API_URL",oldUrl],["PRACA_ROUNDS_VENDOR_TOKEN",oldToken]])if(v===undefined)delete process.env[k];else process.env[k]=v;
}
