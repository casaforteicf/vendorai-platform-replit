import assert from "node:assert/strict";
import{readFile}from"node:fs/promises";import{stripTypeScriptTypes}from"node:module";import vm from"node:vm";
const routes=new Map(),router=new Proxy({},{get:(_t,method)=>(path,fn)=>{routes.set(method.toUpperCase()+" "+path,fn);return router}});
const mod=new vm.SourceTextModule(stripTypeScriptTypes(await readFile(new URL("../artifacts/api-server/src/routes/praca_rounds.ts",import.meta.url),"utf8"),{mode:"transform"}));
await mod.link(async name=>{assert.equal(name,"express");return new vm.SyntheticModule(["Router"],function(){this.setExport("Router",()=>router)})});await mod.evaluate();
const oldFetch=globalThis.fetch,oldUrl=process.env.PRACA_AI_INTERNAL_API_URL,oldToken=process.env.PRACA_ROUNDS_VENDOR_TOKEN;
process.env.PRACA_AI_INTERNAL_API_URL="https://praca-test.invalid/api";process.env.PRACA_ROUNDS_VENDOR_TOKEN="a".repeat(40);let upstream;
globalThis.fetch=async(url)=>{upstream=url;return{status:200,json:async()=>({masterNsu:"NSU-10",events:[]})}};
async function call(user){let status=200;const req={user,params:{type:"round",id:"11111111-1111-4111-8111-111111111111"},query:{tenantId:"other-vendor",after:"9007199254740993"}};const res={status(v){status=v;return this},set(){return this},json(){return this}};await routes.get("GET /praca-pedidos/:type/:id/historico")(req,res);return status}
try{assert.equal(await call(null),403);assert.equal(upstream,undefined);assert.equal(await call({tenantId:"signed-vendor"}),200);const u=new URL(upstream);assert.equal(u.searchParams.get("tenantId"),"signed-vendor");assert.equal(u.searchParams.get("after"),"9007199254740993");console.log("PASS: histórico usa tenant da sessão assinada e preserva cursor; upstream simulado.")}
finally{globalThis.fetch=oldFetch;for(const[k,v]of[["PRACA_AI_INTERNAL_API_URL",oldUrl],["PRACA_ROUNDS_VENDOR_TOKEN",oldToken]])if(v===undefined)delete process.env[k];else process.env[k]=v}
