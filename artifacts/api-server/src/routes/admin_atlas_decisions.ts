import {Router,type IRouter} from "express";
import {db} from "@workspace/db";
import {sql} from "drizzle-orm";
import {requireRole} from "../middlewares/auth.js";
const router:IRouter=Router(),key="strategic-decisions-v1";
type Decision={impact:number;effort:number;source:string;status:"review"|"approved"|"rejected"|"measured";outcome:string;updatedAt:string};
function valid(input:unknown):input is Record<string,Decision>{
 if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).length>100)return false;
 return Object.entries(input).every(([id,v])=>{
  if(!/^[a-z0-9_-]{1,70}$/.test(id)||!v||typeof v!=="object"||Array.isArray(v))return false;
  const d=v as Record<string,unknown>;
  return Object.keys(d).every(k=>["impact","effort","source","status","outcome","updatedAt"].includes(k))&&
    Number.isInteger(d.impact)&&Number(d.impact)>=1&&Number(d.impact)<=5&&
    Number.isInteger(d.effort)&&Number(d.effort)>=1&&Number(d.effort)<=5&&
    typeof d.source==="string"&&d.source.length<=3000&&
    ["review","approved","rejected","measured"].includes(String(d.status))&&
    typeof d.outcome==="string"&&d.outcome.length<=5000&&
    typeof d.updatedAt==="string"&&d.updatedAt.length<=40;
 });
}
router.get("/admin/atlas/strategic-decisions",requireRole("super_admin"),async(_req,res)=>{
 try{const result=await db.execute(sql`SELECT content,revision FROM vendor_atlas_documents WHERE document_key=${key}`);
 const row=result.rows[0] as {content:unknown;revision:number}|undefined;
 res.setHeader("Cache-Control","no-store");res.json({decisions:row?.content??{},revision:Number(row?.revision??0)});
 }catch{res.status(503).json({error:"ATLAS_DECISIONS_UNAVAILABLE"});}
});
router.put("/admin/atlas/strategic-decisions",requireRole("super_admin"),async(req,res)=>{
 const {decisions,revision}=req.body??{};
 if(!valid(decisions)||!Number.isInteger(revision)||revision<0||revision>1000000){res.status(422).json({error:"ATLAS_DECISIONS_INVALID"});return;}
 const payload=JSON.stringify(decisions),author=String(req.user?.email||req.user?.sub||"super_admin");
 try{const updated=await db.transaction(async tx=>{
 const result=revision>0?await tx.execute(sql`UPDATE vendor_atlas_documents SET content=${payload}::jsonb,revision=revision+1,updated_by=${author},updated_at=now() WHERE document_key=${key} AND revision=${revision} RETURNING revision`):await tx.execute(sql`INSERT INTO vendor_atlas_documents(document_key,content,revision,updated_by) VALUES(${key},${payload}::jsonb,1,${author}) ON CONFLICT DO NOTHING RETURNING revision`);
 const rev=Number((result.rows[0] as {revision:number}|undefined)?.revision??0);
 if(rev)await tx.execute(sql`INSERT INTO vendor_atlas_document_history(document_key,revision,content,updated_by) VALUES(${key},${rev},${payload}::jsonb,${author})`);
 return rev;
 });
 if(!updated){res.status(409).json({error:"ATLAS_DECISIONS_CONFLICT"});return;}
 res.json({ok:true,revision:updated});
 }catch{res.status(503).json({error:"ATLAS_DECISIONS_UNAVAILABLE"});}
});
export default router;
