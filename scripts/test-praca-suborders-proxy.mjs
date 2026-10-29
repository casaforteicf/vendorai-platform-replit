import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {stripTypeScriptTypes} from "node:module";
import vm from "node:vm";
const source=stripTypeScriptTypes(readFileSync("artifacts/api-server/src/routes/praca_rounds.ts","utf8"),{mode:"transform"}).replace(/^import .*;\n/gm,"").replace(/export default router;?/g,"");
const routes=new Map(),calls=[];
const c={Router:()=>({get:(p,f)=>routes.set("GET "+p,f),post:(p,f)=>routes.set("POST "+p,f),patch:(p,f)=>routes.set("PATCH "+p,f)}),process:{env:{PRACA_AI_INTERNAL_API_URL:"https://test.invalid/api",PRACA_ROUNDS_VENDOR_TOKEN:"x".repeat(40)}},URLSearchParams,console,fetch:async(url,init)=>{calls.push({url,init});return {status:200,json:async()=>({ok:true})}}};
vm.createContext(c);vm.runInContext(source,c);
function res(){return {code:200,status(n){this.code=n;return this},set(){return this},json(b){this.body=b;return this}}}
const id="11111111-1111-4111-8111-111111111111";
await routes.get("POST /praca-subpedidos/:id/comprovantes")({user:{tenantId:"signed-shop"},params:{id},body:{tenantId:"attacker",photo:"data:image/jpeg;base64,a",receivedBy:"Teste",items:[],requestKey:id}},res());
assert.equal(JSON.parse(calls[0].init.body).tenantId,"signed-shop");assert(calls[0].url.includes("/internal/vendor-suborders/"+id+"/receipts"));
await routes.get("GET /praca-subpedidos/:id/historico")({user:{tenantId:"signed-shop"},params:{id},query:{tenantId:"attacker",after:"9007199254740993"}},res());
const u=new URL(calls[1].url);assert.equal(u.searchParams.get("tenantId"),"signed-shop");assert.equal(u.searchParams.get("after"),"9007199254740993");
const denied=res();await routes.get("GET /praca-subpedidos")({user:{},query:{tenantId:"attacker"}},denied);assert.equal(denied.code,403);assert.equal(calls.length,2);
console.log("PASS: proxy de subpedidos usa loja da sessão, ignora tenant adulterado, preserva cursor e bloqueia usuário sem loja");
