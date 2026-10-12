import {Router,type Request,type Response} from "express";
import {z} from "zod/v4";
import {db,arqdorWorkspaceProjectsTable,archConceptProjectsTable} from "@workspace/db";
import {and,eq,or,sql} from "drizzle-orm";
import {authenticate} from "../middlewares/auth.js";
import {validateBimFurnitureFootprints} from "./arqdor_furniture_bim_geometry.js";
/** Only mount under the globally authenticated API router. No whole-context overwrite. */
const router=Router();
router.use("/arqdor/projects/:id/furniture",authenticate);
const number=z.number().finite();
const part=z.object({id:z.string().min(1).max(160),tenantId:z.string().min(1),projectId:z.string().min(1),furnitureId:z.string().min(1),materialId:z.string().trim().min(1),widthMm:number.positive().max(500000),lengthMm:number.positive().max(500000),quantity:z.number().int().positive().max(100000)}).passthrough();
const furniture=z.object({id:z.string().min(1).max(160),tenantId:z.string(),projectId:z.string(),roomId:z.string(),
 parameters:z.object({furnitureId:z.string().min(1),tenantId:z.string().min(1),projectId:z.string().min(1),roomId:z.string().min(1),widthMm:number.positive(),depthMm:number.positive(),heightMm:number.positive().optional()}).passthrough(),
 parts:z.array(part).max(2000),bounds:z.object({id:z.string(),roomId:z.string(),xMm:number,yMm:number,widthMm:number.positive(),depthMm:number.positive(),rotationDeg:z.union([z.literal(0),z.literal(90),z.literal(180),z.literal(270)])}),
 status:z.literal("local-draft")}).passthrough();
const payload=z.object({schemaVersion:z.literal(1),tenantId:z.string().min(1),projectId:z.string().min(1),roomId:z.string().min(1),
 revision:z.string().min(1).max(160),geometryRevision:z.string().min(1).max(160),baseRevision:z.string().min(1).max(160).nullable().optional(),createdAt:z.string().datetime({offset:true}),furniture:z.array(furniture).max(500)}).strict();
const scope=(req:Request)=>req.user?.tenantId;
const footprint=(b:{widthMm:number;depthMm:number;rotationDeg:0|90|180|270})=>b.rotationDeg===90||b.rotationDeg===270?{w:b.depthMm,d:b.widthMm}:{w:b.widthMm,d:b.depthMm};
const overlaps=(a:{xMm:number;yMm:number;widthMm:number;depthMm:number;rotationDeg:0|90|180|270},b:{xMm:number;yMm:number;widthMm:number;depthMm:number;rotationDeg:0|90|180|270})=>{
 const x=footprint(a),y=footprint(b);
 return a.xMm<b.xMm+y.w+20&&a.xMm+x.w+20>b.xMm&&a.yMm<b.yMm+y.d+20&&a.yMm+x.d+20>b.yMm;
};
router.get("/arqdor/projects/:id/furniture",async(req:Request,res:Response)=>{
 const tenantId=scope(req),projectId=String(req.params.id);
 if(!tenantId)return res.status(401).json({error:"Tenant obrigatório"});
 try{
  const [record]=await db.select({contextBlob:arqdorWorkspaceProjectsTable.contextBlob}).from(arqdorWorkspaceProjectsTable)
   .where(and(eq(arqdorWorkspaceProjectsTable.tenantId,tenantId),eq(arqdorWorkspaceProjectsTable.id,projectId))).limit(1);
  if(!record)return res.status(404).json({error:"Projeto não encontrado"});
  const blob=record.contextBlob;
  if(!blob||Array.isArray(blob)||typeof blob!=="object")return res.status(409).json({error:"Estrutura do projeto inválida"});
  const stored=(blob as Record<string,unknown>).furnitureSnapshots;
  if(stored!==undefined&&(!stored||typeof stored!=="object"||Array.isArray(stored)))return res.status(409).json({error:"Estrutura do mobiliário inválida"});
  const geometry=(blob as Record<string,unknown>).furnitureGeometryV1;
  const geometryRevision=geometry&&typeof geometry==="object"&&!Array.isArray(geometry)&&typeof (geometry as Record<string,unknown>).revision==="string"?(geometry as Record<string,string>).revision:null;
  return res.json({tenantId,furnitureSnapshots:stored??{},geometryRevision});
 }catch(e){console.error("furniture get",e);return res.status(500).json({error:"Falha ao carregar mobiliário"});}
});
/** Opt-in bootstrap from tenant-owned Concept rectangles only.
 * Projects with explicit custom walls/openings require the full BIM publisher instead.
 */
router.post("/arqdor/projects/:id/furniture/geometry-from-concept",async(req:Request,res:Response)=>{
 const tenantId=scope(req),projectId=String(req.params.id);
 if(!tenantId)return res.status(401).json({error:"Tenant obrigatório"});
 try{
  const [concept]=await db.select().from(archConceptProjectsTable)
   .where(and(eq(archConceptProjectsTable.tenantId,tenantId),or(eq(archConceptProjectsTable.id,projectId),eq(archConceptProjectsTable.archProjetoId,projectId)))).limit(1);
  if(!concept)return res.status(404).json({error:"Concept vinculado não encontrado"});
  const config=concept.configuration;
  if((config.customWalls?.length??0)>0||(config.customOpenings?.length??0)>0||Object.keys(concept.openingOverrides??{}).length>0)
   return res.status(422).json({error:"Geometria personalizada exige publicação BIM completa"});
  const rooms:Record<string,{outline:Array<{xMm:number;yMm:number}>;exclusions:never[]}>= {};
  if(!Array.isArray(concept.rooms)||concept.rooms.length===0||concept.rooms.length>150)return res.status(422).json({error:"Ambientes Concept inválidos"});
  for(const room of concept.rooms){
   const {id,x,y,width,depth}=room;
   if(typeof id!=="string"||!id||rooms[id]||![x,y,width,depth].every(Number.isFinite)||width<=0||depth<=0||width>500||depth>500)
    return res.status(422).json({error:"Ambiente Concept sem geometria retangular válida"});
   const x0=0,y0=0,x1=Math.round(width*1000),y1=Math.round(depth*1000);
   rooms[id]={outline:[{xMm:x0,yMm:y0},{xMm:x1,yMm:y0},{xMm:x1,yMm:y1},{xMm:x0,yMm:y1}],exclusions:[]};
  }
  const revision=concept.id+":"+concept.updatedAt.toISOString();
  const geometry={schemaVersion:1 as const,source:"bim-server" as const,revision,rooms};
  const [saved]=await db.update(arqdorWorkspaceProjectsTable)
   .set({contextBlob:sql`jsonb_set(${arqdorWorkspaceProjectsTable.contextBlob},'{furnitureGeometryV1}',${JSON.stringify(geometry)}::jsonb,true)`,updatedAt:new Date()})
   .where(and(eq(arqdorWorkspaceProjectsTable.id,projectId),eq(arqdorWorkspaceProjectsTable.tenantId,tenantId),
    sql`jsonb_typeof(${arqdorWorkspaceProjectsTable.contextBlob})='object'`,
    sql`(${arqdorWorkspaceProjectsTable.contextBlob}->'furnitureGeometryV1' IS NULL OR ${arqdorWorkspaceProjectsTable.contextBlob} #>> '{furnitureGeometryV1,revision}' = ${revision})`,
    sql`NOT EXISTS (SELECT 1 FROM jsonb_each(CASE WHEN jsonb_typeof(${arqdorWorkspaceProjectsTable.contextBlob}->'furnitureSnapshots')='object' THEN ${arqdorWorkspaceProjectsTable.contextBlob}->'furnitureSnapshots' ELSE '{}'::jsonb END) AS item WHERE item.value->>'geometryRevision' IS DISTINCT FROM ${revision})`)).returning({id:arqdorWorkspaceProjectsTable.id});
  if(!saved)return res.status(409).json({error:"Publicação rejeitada: revisão BIM ou mobiliário já existente exige reconciliação"});
  return res.json({published:true,geometryRevision:revision,rooms:Object.keys(rooms).length});
 }catch(error){console.error("furniture concept geometry",error);return res.status(500).json({error:"Falha ao publicar geometria Concept"});}
});
router.put("/arqdor/projects/:id/furniture/:roomId",async(req:Request,res:Response)=>{
 const tenantId=scope(req),projectId=String(req.params.id),roomId=String(req.params.roomId);
 if(!tenantId)return res.status(401).json({error:"Tenant obrigatório"});
 const parsed=payload.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Snapshot inválido"});
 const data=parsed.data;
 if(data.revision===data.baseRevision)return res.status(400).json({error:"A revisão nova precisa ser diferente da anterior"});
 if(data.tenantId!==tenantId||data.projectId!==projectId||data.roomId!==roomId)return res.status(403).json({error:"Projeto/tenant/ambiente incompatível"});
 const ids=new Set<string>(),partIds=new Set<string>();
 const footprints:typeof data.furniture[number]["bounds"][]=[];
 if(roomId.length>160||projectId.length>160||JSON.stringify(data).length>1500000||data.furniture.reduce((count,f)=>count+f.parts.length,0)>5000)return res.status(400).json({error:"Limite do projeto excedido"});
 for(const f of data.furniture){
  if(ids.has(f.id)||f.tenantId!==data.tenantId||f.projectId!==projectId||f.roomId!==roomId||f.bounds.id!==f.id||f.bounds.roomId!==roomId||
   f.bounds.xMm<0||f.bounds.yMm<0||f.bounds.xMm+footprint(f.bounds).w>500000||f.bounds.yMm+footprint(f.bounds).d>500000||f.parameters.furnitureId!==f.id||f.parameters.tenantId!==data.tenantId||f.parameters.projectId!==projectId||f.parameters.roomId!==roomId)return res.status(400).json({error:"Identidade inválida"});
  if(!Number.isFinite(f.parameters.widthMm)||!Number.isFinite(f.parameters.depthMm)||f.parameters.widthMm!==f.bounds.widthMm||f.parameters.depthMm!==f.bounds.depthMm||
    footprints.some(existing=>overlaps(existing,f.bounds)))return res.status(400).json({error:"Dimensões inconsistentes ou móveis sobrepostos"});
  footprints.push(f.bounds);
  ids.add(f.id);
  for(const p of f.parts){if(partIds.has(p.id)||!p.materialId.trim()||p.furnitureId!==f.id||p.tenantId!==data.tenantId||p.projectId!==projectId)return res.status(400).json({error:"Peças inválidas"});partIds.add(p.id);}
 }
 const normalized={...data,tenantId,furniture:data.furniture.map(f=>({...f,tenantId,parameters:{...f.parameters,tenantId},parts:f.parts.map(p=>({...p,tenantId}))}))};
 try{
  const expected=data.baseRevision??null;
  const [project]=await db.select({contextBlob:arqdorWorkspaceProjectsTable.contextBlob}).from(arqdorWorkspaceProjectsTable)
   .where(and(eq(arqdorWorkspaceProjectsTable.id,projectId),eq(arqdorWorkspaceProjectsTable.tenantId,tenantId))).limit(1);
  if(!project)return res.status(404).json({error:"Projeto não encontrado"});
  const context=project.contextBlob;
  if(!context||typeof context!=="object"||Array.isArray(context))return res.status(409).json({error:"Contexto do projeto inválido"});
  const authoritative=(context as Record<string,unknown>).furnitureGeometryV1;
  if(authoritative===undefined)return res.status(409).json({error:"Geometria BIM oficial ausente; publicação arquitetônica necessária antes de salvar"});
  const validation=validateBimFurnitureFootprints(authoritative,roomId,data.furniture.map(f=>f.bounds));
  if(!validation.ok)return res.status(422).json({error:"Geometria BIM rejeitou posicionamento",reason:validation.reason});
  const geometryRevision=validation.revision;
  if(data.geometryRevision!==geometryRevision)return res.status(409).json({error:"Revisão arquitetônica desatualizada"});
  const records=await db.update(arqdorWorkspaceProjectsTable)
   .set({contextBlob:sql`jsonb_set(jsonb_set(COALESCE(${arqdorWorkspaceProjectsTable.contextBlob}, '{}'::jsonb), '{furnitureSnapshots}', CASE WHEN jsonb_typeof(${arqdorWorkspaceProjectsTable.contextBlob}->'furnitureSnapshots')='object' THEN ${arqdorWorkspaceProjectsTable.contextBlob}->'furnitureSnapshots' ELSE '{}'::jsonb END, true), ARRAY['furnitureSnapshots', ${roomId}]::text[], ${JSON.stringify(normalized)}::jsonb, true)`,updatedAt:new Date()})
   .where(and(eq(arqdorWorkspaceProjectsTable.id,projectId),eq(arqdorWorkspaceProjectsTable.tenantId,tenantId),
    sql`jsonb_typeof(${arqdorWorkspaceProjectsTable.contextBlob}) = 'object'`,
    sql`(${arqdorWorkspaceProjectsTable.contextBlob} #>> '{furnitureGeometryV1,revision}') = ${geometryRevision}`,
    sql`(jsonb_typeof(${arqdorWorkspaceProjectsTable.contextBlob}->'furnitureSnapshots') IS NULL OR jsonb_typeof(${arqdorWorkspaceProjectsTable.contextBlob}->'furnitureSnapshots') = 'object')`,
    sql`(${arqdorWorkspaceProjectsTable.contextBlob} #>> ARRAY['furnitureSnapshots', ${roomId}, 'revision']::text[]) IS NOT DISTINCT FROM ${expected}`)).returning({id:arqdorWorkspaceProjectsTable.id});
  if(!records.length)return res.status(409).json({error:"Projeto não encontrado ou mobiliário alterado por outro usuário; recarregue antes de salvar"});
  return res.json({saved:true,tenantId,projectId,roomId,revision:data.revision});
 }catch(e){console.error("furniture save",e);return res.status(500).json({error:"Falha ao salvar mobiliário"});}
});
export default router;
