import {Router,type Request,type Response} from "express";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {pool} from "@workspace/db";

/** Protected Arqdor partner lot routes.
 * Mount under the existing authenticated router ONLY, never under publicRouter.
 * Writes use authenticated tenant, never a tenantId supplied by the browser.
 */
export const arqdorPartnerLotsRouter=Router();
function tenant(req:Request):string|null{
 const id=req.tenantId??req.user?.tenantId;return typeof id==="string"&&id.trim()?id:null;
}
function authorized(req:Request):boolean{
 const role=String((req.user as {role?:string}|undefined)?.role??"").toLowerCase();
 return ["admin","tenant_admin","super_admin","superadmin","owner"].includes(role);
}
const developmentSchema=z.object({name:z.string().trim().min(2).max(160),partnerName:z.string().trim().max(160).optional()}).strict();
const pointSchema=z.object({xM:z.number().finite(),yM:z.number().finite()});
const lotSchema=z.object({
 developmentId:z.string().trim().min(1).max(160),block:z.string().trim().min(1).max(80),
 lotNumber:z.string().trim().min(1).max(80),crs:z.string().trim().min(1).max(120),
 coordinates:z.array(pointSchema).min(3).max(10000),
 surveySource:z.string().trim().min(2).max(400),surveyDate:z.string().date().optional(),
 rules:z.record(z.string(),z.unknown()).optional(),
}).strict();
function areaAndPerimeter(points:{xM:number;yM:number}[]){
 let a=0,p=0;
 for(let i=0;i<points.length;i++){
  const x=points[i],y=points[(i+1)%points.length];a+=x.xM*y.yM-y.xM*x.yM;p+=Math.hypot(x.xM-y.xM,x.yM-y.yM);
 }
 return {areaM2:Math.abs(a)/2,perimeterM:p};
}
arqdorPartnerLotsRouter.use("/arqdor/partner-lots", (req,res,next)=>{
 if(!tenant(req))return res.status(401).json({error:"Tenant obrigatório"});
 if(!authorized(req))return res.status(403).json({error:"Permissão administrativa necessária"});
 next();
});
arqdorPartnerLotsRouter.post("/arqdor/partner-lots/developments",async(req:Request,res:Response)=>{
 const t=tenant(req)!;const parsed=developmentSchema.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Dados inválidos",details:parsed.error.flatten()});
 try{
  const id=randomUUID();
  await pool.query(`INSERT INTO arqdor_partner_developments(id,tenant_id,name,partner_name)
   VALUES($1,$2,$3,$4)`,[id,t,parsed.data.name,parsed.data.partnerName??null]);
  return res.status(201).json({id,tenantId:t,name:parsed.data.name,status:"draft"});
 }catch(e){req.log?.error(e,"partner development create");return res.status(500).json({error:"Falha no cadastro do empreendimento"});}
});
arqdorPartnerLotsRouter.get("/arqdor/partner-lots/developments",async(req:Request,res:Response)=>{
 try{const r=await pool.query(`SELECT id,name,partner_name,status,created_at FROM arqdor_partner_developments WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 200`,[tenant(req)!]);return res.json({items:r.rows});}
 catch(e){req.log?.error(e,"partner development list");return res.status(500).json({error:"Falha ao consultar empreendimentos"});}
});
arqdorPartnerLotsRouter.post("/arqdor/partner-lots",async(req:Request,res:Response)=>{
 const t=tenant(req)!,parsed=lotSchema.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Dados inválidos",details:parsed.error.flatten()});
 const d=parsed.data,geom=areaAndPerimeter(d.coordinates);
 if(geom.areaM2<=.001||!Number.isFinite(geom.perimeterM))return res.status(400).json({error:"Polígono degenerado"});
 const id=randomUUID();
 const client=await pool.connect();
 try{
  await client.query("BEGIN");
  const found=await client.query("SELECT 1 FROM arqdor_partner_developments WHERE tenant_id=$1 AND id=$2 FOR UPDATE",[t,d.developmentId]);
  if(!found.rows.length){await client.query("ROLLBACK");return res.status(404).json({error:"Empreendimento não encontrado"});}
  await client.query(`INSERT INTO arqdor_partner_lots(id,tenant_id,development_id,block,lot_number) VALUES($1,$2,$3,$4,$5)`,[id,t,d.developmentId,d.block,d.lotNumber]);
  await client.query(`INSERT INTO arqdor_partner_lot_revisions(tenant_id,lot_id,revision,geometry_json,crs,area_m2,perimeter_m,survey_source,survey_date,rules_json)
   VALUES($1,$2,1,$3,$4,$5,$6,$7,$8,$9)`,[t,id,JSON.stringify(d.coordinates),d.crs,geom.areaM2,geom.perimeterM,d.surveySource,d.surveyDate??null,JSON.stringify(d.rules??{})]);
  await client.query("COMMIT");
  return res.status(201).json({id,tenantId:t,revision:1,availability:"unavailable",...geom});
 }catch(e){await client.query("ROLLBACK");req.log?.error(e,"partner lot create");return res.status(500).json({error:"Falha ao cadastrar lote"});}
 finally{client.release();}
});
arqdorPartnerLotsRouter.get("/arqdor/partner-lots",async(req:Request,res:Response)=>{
 try{const r=await pool.query(`SELECT l.id,l.development_id,l.block,l.lot_number,l.technical_revision,l.availability,
 r.area_m2,r.perimeter_m,r.crs,r.survey_source FROM arqdor_partner_lots l
 JOIN arqdor_partner_lot_revisions r ON r.tenant_id=l.tenant_id AND r.lot_id=l.id AND r.revision=l.technical_revision
 WHERE l.tenant_id=$1 ORDER BY l.created_at DESC LIMIT 200`,[tenant(req)!]);return res.json({items:r.rows});}
 catch(e){req.log?.error(e,"partner lots list");return res.status(500).json({error:"Falha ao consultar lotes"});}
});
export default arqdorPartnerLotsRouter;
