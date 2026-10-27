import {Router,type IRouter} from "express";
import {db} from "@workspace/db";
import {sql} from "drizzle-orm";
import {requireRole} from "../middlewares/auth.js";
const router:IRouter=Router(),key="strategic-kpis-v1";
export type StrategicKpi={id:string;decisionId:string;name:string;unit:string;direction:"up"|"down";baseline:number|null;target:number;actual:number|null;periodStart:string;periodEnd:string;source:string;verified:boolean};
export function validStrategicKpis(input:unknown):input is StrategicKpi[]{
 if(!Array.isArray(input)||input.length>200)return false;
 const ids=new Set<string>();
 return input.every(v=>{
  if(!v||typeof v!=="object"||Array.isArray(v))return false;
  const x=v as Record<string,unknown>;
  if(Object.keys(x).some(k=>!["id","decisionId","name","unit","direction","baseline","target","actual","periodStart","periodEnd","source","verified"].includes(k)))return false;
  if(typeof x.id!=="string"||!/^kpi-[a-z0-9_-]{1,80}$/i.test(x.id)||ids.has(x.id))return false;ids.add(x.id);
  if(typeof x.decisionId!=="string"||!/^[a-z0-9_-]{1,70}$/.test(x.decisionId))return false;
  if(typeof x.name!=="string"||!x.name.trim()||x.name.length>180||typeof x.unit!=="string"||!x.unit.trim()||x.unit.length>40)return false;
  if(x.direction!=="up"&&x.direction!=="down")return false;
  const numeric=(n:unknown)=>typeof n==="number"&&Number.isFinite(n)&&Math.abs(n)<=1e12;
  if(!numeric(x.target)||(x.baseline!==null&&!numeric(x.baseline))||(x.actual!==null&&!numeric(x.actual)))return false;
  const date=(d:unknown)=>typeof d==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(d)&&!Number.isNaN(Date.parse(d+"T00:00:00Z"))&&new Date(d+"T00:00:00Z").toISOString().slice(0,10)===d;
  if(!date(x.periodStart)||!date(x.periodEnd)||(x.periodStart as string)>(x.periodEnd as string))return false;
  return typeof x.source==="string"&&x.source.length<=2000&&x.verified===false;
 });
}
router.get("/admin/atlas/strategic-kpis",requireRole("super_admin"),async(_req,res)=>{
 try{const q=await db.execute(sql`SELECT content,revision FROM vendor_atlas_documents WHERE document_key=${key}`);const x=q.rows[0] as {content:unknown;revision:number}|undefined;res.setHeader("Cache-Control","no-store");res.json({items:x?.content??[],revision:Number(x?.revision??0)});}
 catch{res.status(503).json({error:"ATLAS_KPIS_UNAVAILABLE"});}
});
router.put("/admin/atlas/strategic-kpis",requireRole("super_admin"),async(req,res)=>{
 const {items,revision}=req.body??{};
 if(!validStrategicKpis(items)||!Number.isInteger(revision)||revision<0||revision>1000000){res.status(422).json({error:"ATLAS_KPIS_INVALID"});return;}
 const payload=JSON.stringify(items),author=String(req.user?.email||req.user?.sub||"super_admin");
 try{const rev=await db.transaction(async tx=>{
 const q=revision>0?await tx.execute(sql`UPDATE vendor_atlas_documents SET content=${payload}::jsonb,revision=revision+1,updated_by=${author},updated_at=now() WHERE document_key=${key} AND revision=${revision} RETURNING revision`):await tx.execute(sql`INSERT INTO vendor_atlas_documents(document_key,content,revision,updated_by) VALUES(${key},${payload}::jsonb,1,${author}) ON CONFLICT DO NOTHING RETURNING revision`);
 const n=Number((q.rows[0] as {revision:number}|undefined)?.revision??0);
 if(n)await tx.execute(sql`INSERT INTO vendor_atlas_document_history(document_key,revision,content,updated_by) VALUES(${key},${n},${payload}::jsonb,${author})`);
 return n;
 });
 if(!rev){res.status(409).json({error:"ATLAS_KPIS_REVISION_CONFLICT"});return;}
 res.json({ok:true,revision:rev});}catch{res.status(503).json({error:"ATLAS_KPIS_UNAVAILABLE"});}
});
export default router;
