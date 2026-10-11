import {Router,type Request,type Response} from "express";
import {z} from "zod/v4";
import {db,arqdorWorkspaceProjectsTable} from "@workspace/db";
import {and,eq,sql} from "drizzle-orm";
/** Only mount under the globally authenticated API router. No whole-context overwrite. */
const router=Router();
const number=z.number().finite();
const part=z.object({id:z.string().min(1),tenantId:z.string(),projectId:z.string(),furnitureId:z.string(),materialId:z.string(),widthMm:number.positive(),lengthMm:number.positive(),quantity:z.number().int().positive()}).passthrough();
const furniture=z.object({id:z.string().min(1),tenantId:z.string(),projectId:z.string(),roomId:z.string(),
 parameters:z.object({furnitureId:z.string(),tenantId:z.string(),projectId:z.string(),roomId:z.string()}).passthrough(),
 parts:z.array(part).max(2000),bounds:z.object({id:z.string(),roomId:z.string(),xMm:number,yMm:number,widthMm:number.positive(),depthMm:number.positive(),rotationDeg:z.number()}),
 status:z.literal("local-draft")}).passthrough();
const payload=z.object({schemaVersion:z.literal(1),tenantId:z.string().min(1),projectId:z.string().min(1),roomId:z.string().min(1),
 revision:z.string().min(1),baseRevision:z.string().nullable().optional(),createdAt:z.string().min(1),furniture:z.array(furniture).max(500)}).strict();
const scope=(req:Request)=>req.tenantId??req.user?.tenantId;
router.get("/arqdor/projects/:id/furniture",async(req:Request,res:Response)=>{
 const tenantId=scope(req),projectId=String(req.params.id);
 if(!tenantId)return res.status(401).json({error:"Tenant obrigatório"});
 try{
  const [record]=await db.select({contextBlob:arqdorWorkspaceProjectsTable.contextBlob}).from(arqdorWorkspaceProjectsTable)
   .where(and(eq(arqdorWorkspaceProjectsTable.tenantId,tenantId),eq(arqdorWorkspaceProjectsTable.id,projectId))).limit(1);
  if(!record)return res.status(404).json({error:"Projeto não encontrado"});
  return res.json({furnitureSnapshots:(record.contextBlob as Record<string,unknown>).furnitureSnapshots??{}});
 }catch(e){req.log?.error(e,"furniture get");return res.status(500).json({error:"Falha ao carregar mobiliário"});}
});
router.put("/arqdor/projects/:id/furniture/:roomId",async(req:Request,res:Response)=>{
 const tenantId=scope(req),projectId=String(req.params.id),roomId=String(req.params.roomId);
 if(!tenantId)return res.status(401).json({error:"Tenant obrigatório"});
 const parsed=payload.safeParse(req.body);
 if(!parsed.success)return res.status(400).json({error:"Snapshot inválido"});
 const data=parsed.data;
 if(![tenantId,"local-preview"].includes(data.tenantId)||data.projectId!==projectId||data.roomId!==roomId)return res.status(403).json({error:"Projeto/tenant/ambiente incompatível"});
 const ids=new Set<string>(),partIds=new Set<string>();
 for(const f of data.furniture){
  if(ids.has(f.id)||f.tenantId!==data.tenantId||f.projectId!==projectId||f.roomId!==roomId||f.bounds.id!==f.id||f.bounds.roomId!==roomId||
   f.parameters.furnitureId!==f.id||f.parameters.tenantId!==data.tenantId||f.parameters.projectId!==projectId||f.parameters.roomId!==roomId)return res.status(400).json({error:"Identidade inválida"});
  ids.add(f.id);
  for(const p of f.parts){if(partIds.has(p.id)||p.furnitureId!==f.id||p.tenantId!==data.tenantId||p.projectId!==projectId)return res.status(400).json({error:"Peças inválidas"});partIds.add(p.id);}
 }
 const normalized={...data,tenantId,furniture:data.furniture.map(f=>({...f,tenantId,parameters:{...f.parameters,tenantId},parts:f.parts.map(p=>({...p,tenantId}))}))};
 try{
  const expected=data.baseRevision??null;
  const records=await db.update(arqdorWorkspaceProjectsTable)
   .set({contextBlob:sql`jsonb_set(jsonb_set(COALESCE(${arqdorWorkspaceProjectsTable.contextBlob}, '{}'::jsonb), '{furnitureSnapshots}', COALESCE(${arqdorWorkspaceProjectsTable.contextBlob}->'furnitureSnapshots','{}'::jsonb), true), ARRAY['furnitureSnapshots', ${roomId}]::text[], ${JSON.stringify(normalized)}::jsonb, true)`,updatedAt:new Date()})
   .where(and(eq(arqdorWorkspaceProjectsTable.id,projectId),eq(arqdorWorkspaceProjectsTable.tenantId,tenantId),
    sql`(${arqdorWorkspaceProjectsTable.contextBlob} #>> ARRAY['furnitureSnapshots', ${roomId}, 'revision']::text[]) IS NOT DISTINCT FROM ${expected}`)).returning({id:arqdorWorkspaceProjectsTable.id});
  if(!records.length)return res.status(409).json({error:"Projeto não encontrado ou mobiliário alterado por outro usuário; recarregue antes de salvar"});
  return res.json({saved:true,projectId,roomId,revision:data.revision});
 }catch(e){req.log?.error(e,"furniture save");return res.status(500).json({error:"Falha ao salvar mobiliário"});}
});
export default router;
