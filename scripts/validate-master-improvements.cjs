#!/usr/bin/env node
/** MASTER registry integrity check; no external packages or network required. */
const fs=require("node:fs");
const path=require("node:path");
const registry=JSON.parse(fs.readFileSync(path.join(__dirname,"..","docs","master","improvements-registry.json"),"utf8"));
const valid=new Set(["verification_required","code_in_pr","blocked","verified_implemented","verified_published"]);
const seen=new Set();
let errors=[];
for(const [i,item] of registry.items.entries()){
 if(!/^[A-Z]+-\d{2,3}$/.test(item.id))errors.push("Invalid ID at row "+i);
 if(seen.has(item.id))errors.push("Duplicate "+item.id); seen.add(item.id);
 if(!item.module||!item.title)errors.push("Missing module/title "+item.id);
 if(!valid.has(item.status))errors.push("Invalid status "+item.id);
 if(item.status==="code_in_pr"&&!item.tracking_url)errors.push("Code in PR missing tracking URL "+item.id);
 if(item.production==="published"&&item.status!=="verified_published")errors.push("Production evidence missing "+item.id);
}
if(errors.length){console.error(errors.join("\n"));process.exit(1)}
console.log("MASTER registry OK: "+registry.items.length+" records, "+Object.keys(registry.items.reduce((a,v)=>(a[v.module]=1,a),{})).length+" modules");
