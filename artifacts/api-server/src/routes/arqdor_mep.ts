import { Router, type IRouter } from "express";
import { z } from "zod/v4";
import { pool, inspectMepWallImpact } from "@workspace/db";

/**
 * MEP-01 API slice. Must be mounted behind the authenticated API router.
 * Tenant is always derived from server request context, never request body.
 */
export const arqdorMepRouter: IRouter = Router();
const id = z.string().trim().min(1).max(160);
const discipline = z.enum(["electrical", "cold_water", "hot_water", "sanitary"]);
const systemInput = z.object({ discipline, name: z.string().trim().min(1).max(200) }).strict();
const networkInput = z.object({ systemId: id, name: z.string().trim().min(1).max(200) }).strict();
const nodeInput = z.object({
  networkId: id, floorId: id, roomId: id.nullable().optional(), hostElementId: id.nullable().optional(),
  kind: z.string().trim().min(1).max(80),
  xMm: z.number().int().safe(), yMm: z.number().int().safe(), zMm: z.number().int().safe(),
}).strict();
const segmentInput = z.object({
  networkId: id, fromNodeId: id, toNodeId: id, material: z.string().max(120).nullable().optional(),
  nominalSizeMm: z.number().int().positive().nullable().optional(),
}).strict().refine(s => s.fromNodeId !== s.toNodeId, { message: "Nós de origem e destino devem ser diferentes" });

function tenant(req: any, res: any): string | null {
  const tenantId = req.user?.tenantId ?? req.tenantId;
  if (typeof tenantId === "string" && tenantId.length > 0) return tenantId;
  res.status(403).json({ error: "Tenant ativo obrigatório" });
  return null;
}
async function projectExists(tenantId: string, projectId: string): Promise<boolean> {
  const r = await pool.query("SELECT 1 FROM arqdor_workspace_projects WHERE tenant_id=$1 AND id=$2 LIMIT 1", [tenantId,projectId]);
  return r.rowCount === 1;
}
function routeId(req: any, res: any): string | null {
  const parsed=id.safeParse(req.params.projectId);
  if(parsed.success) return parsed.data;
  res.status(400).json({error:"Projeto inválido"});
  return null;
}
function validation<T extends z.ZodTypeAny>(schema:T, req:any, res:any):z.output<T>|null {
  const p=schema.safeParse(req.body);
  if(p.success) return p.data;
  res.status(422).json({error:"Dados inválidos",details:p.error.flatten()});
  return null;
}

arqdorMepRouter.get("/arch/projects/:projectId/mep", async(req,res,next)=>{
  try {
    const tid=tenant(req,res), pid=routeId(req,res); if(!tid||!pid)return;
    if(!await projectExists(tid,pid)){res.status(404).json({error:"Projeto não encontrado"});return;}
    const [systems,networks,nodes,segments]=await Promise.all([
      pool.query("SELECT * FROM arqdor_mep_systems WHERE tenant_id=$1 AND project_id=$2 ORDER BY created_at,id",[tid,pid]),
      pool.query("SELECT * FROM arqdor_mep_networks WHERE tenant_id=$1 AND project_id=$2 ORDER BY id",[tid,pid]),
      pool.query("SELECT * FROM arqdor_mep_nodes WHERE tenant_id=$1 AND project_id=$2 ORDER BY network_id,id",[tid,pid]),
      pool.query("SELECT * FROM arqdor_mep_segments WHERE tenant_id=$1 AND project_id=$2 ORDER BY network_id,id",[tid,pid]),
    ]);
    res.json({systems:systems.rows,networks:networks.rows,nodes:nodes.rows,segments:segments.rows});
  } catch(err){next(err);}
});
arqdorMepRouter.post("/arch/projects/:projectId/mep/systems",async(req,res,next)=>{
  try {
    const tid=tenant(req,res),pid=routeId(req,res);if(!tid||!pid)return;
    const body=validation(systemInput,req,res);if(!body)return;
    if(!await projectExists(tid,pid)){res.status(404).json({error:"Projeto não encontrado"});return;}
    const r=await pool.query("INSERT INTO arqdor_mep_systems(id,tenant_id,project_id,discipline,name) VALUES ($1,$2,$3,$4,$5) RETURNING *",[crypto.randomUUID(),tid,pid,body.discipline,body.name]);
    res.status(201).json({system:r.rows[0]});
  }catch(err){next(err);}
});
arqdorMepRouter.post("/arch/projects/:projectId/mep/networks",async(req,res,next)=>{
  try {
    const tid=tenant(req,res),pid=routeId(req,res);if(!tid||!pid)return;
    const body=validation(networkInput,req,res);if(!body)return;
    if(!await projectExists(tid,pid)){res.status(404).json({error:"Projeto não encontrado"});return;}
    const r=await pool.query(`INSERT INTO arqdor_mep_networks(id,tenant_id,project_id,system_id,name)
      SELECT $1,tenant_id,project_id,id,$5 FROM arqdor_mep_systems WHERE tenant_id=$2 AND project_id=$3 AND id=$4 RETURNING *`,
      [crypto.randomUUID(),tid,pid,body.systemId,body.name]);
    if(!r.rowCount){res.status(404).json({error:"Sistema não encontrado no projeto"});return;}
    res.status(201).json({network:r.rows[0]});
  }catch(err){next(err);}
});
arqdorMepRouter.post("/arch/projects/:projectId/mep/nodes",async(req,res,next)=>{
  try {
    const tid=tenant(req,res),pid=routeId(req,res);if(!tid||!pid)return;
    const body=validation(nodeInput,req,res);if(!body)return;
    if(!await projectExists(tid,pid)){res.status(404).json({error:"Projeto não encontrado"});return;}
    const r=await pool.query(`INSERT INTO arqdor_mep_nodes
      (id,tenant_id,project_id,network_id,floor_id,room_id,host_element_id,kind,x_mm,y_mm,z_mm)
      SELECT $1,n.tenant_id,n.project_id,n.id,$5,$6,$7,$8,$9,$10,$11
      FROM arqdor_mep_networks n WHERE n.tenant_id=$2 AND n.project_id=$3 AND n.id=$4 RETURNING *`,
      [crypto.randomUUID(),tid,pid,body.networkId,body.floorId,body.roomId??null,body.hostElementId??null,body.kind,body.xMm,body.yMm,body.zMm]);
    if(!r.rowCount){res.status(404).json({error:"Rede não encontrada no projeto"});return;}
    res.status(201).json({node:r.rows[0]});
  }catch(err){next(err);}
});
arqdorMepRouter.post("/arch/projects/:projectId/mep/segments",async(req,res,next)=>{
  try {
    const tid=tenant(req,res),pid=routeId(req,res);if(!tid||!pid)return;
    const body=validation(segmentInput,req,res);if(!body)return;
    if(!await projectExists(tid,pid)){res.status(404).json({error:"Projeto não encontrado"});return;}
    const r=await pool.query(`INSERT INTO arqdor_mep_segments
      (id,tenant_id,project_id,network_id,from_node_id,to_node_id,material,nominal_size_mm)
      SELECT $1,n.tenant_id,n.project_id,n.id,a.id,b.id,$7,$8
      FROM arqdor_mep_networks n
      JOIN arqdor_mep_nodes a ON a.tenant_id=n.tenant_id AND a.project_id=n.project_id AND a.network_id=n.id AND a.id=$5
      JOIN arqdor_mep_nodes b ON b.tenant_id=n.tenant_id AND b.project_id=n.project_id AND b.network_id=n.id AND b.id=$6
      WHERE n.tenant_id=$2 AND n.project_id=$3 AND n.id=$4 RETURNING *`,
      [crypto.randomUUID(),tid,pid,body.networkId,body.fromNodeId,body.toNodeId,body.material??null,body.nominalSizeMm??null]);
    if(!r.rowCount){res.status(422).json({error:"Trecho exige dois nós da mesma rede/projeto"});return;}
    res.status(201).json({segment:r.rows[0]});
  }catch(err){next(err);}
});


const nodePatch = z.object({
  xMm: z.number().int().safe().optional(), yMm: z.number().int().safe().optional(), zMm: z.number().int().safe().optional(),
  kind: z.string().trim().min(1).max(80).optional(), roomId: id.nullable().optional(), hostElementId: id.nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0);
const segmentPatch = z.object({
  material: z.string().max(120).nullable().optional(), nominalSizeMm: z.number().int().positive().nullable().optional(),
}).strict().refine(value => Object.keys(value).length > 0);

arqdorMepRouter.patch("/arch/projects/:projectId/mep/nodes/:nodeId",async(req,res,next)=>{
  try{
    const tid=tenant(req,res),pid=routeId(req,res),nodeId=id.safeParse(req.params.nodeId);
    if(!tid||!pid)return;if(!nodeId.success){res.status(400).json({error:"Ponto inválido"});return;}
    const body=validation(nodePatch,req,res);if(!body)return;
    const changes:{column:string;value:unknown}[]=[];
    for(const [key,column] of Object.entries({xMm:"x_mm",yMm:"y_mm",zMm:"z_mm",kind:"kind",roomId:"room_id",hostElementId:"host_element_id"})){
      if(Object.prototype.hasOwnProperty.call(body,key))changes.push({column,value:(body as Record<string,unknown>)[key]});
    }
    const values:unknown[]=[tid,pid,nodeId.data];
    const sets=changes.map(({column,value})=>{values.push(value);return column+"=$"+values.length;});
    const r=await pool.query("UPDATE arqdor_mep_nodes SET "+sets.join(",")+" WHERE tenant_id=$1 AND project_id=$2 AND id=$3 RETURNING *",values);
    if(!r.rowCount){res.status(404).json({error:"Ponto não encontrado"});return;}
    res.json({node:r.rows[0]});
  }catch(err){next(err);}
});
arqdorMepRouter.delete("/arch/projects/:projectId/mep/nodes/:nodeId",async(req,res,next)=>{
  try{
    const tid=tenant(req,res),pid=routeId(req,res),nodeId=id.safeParse(req.params.nodeId);
    if(!tid||!pid)return;if(!nodeId.success){res.status(400).json({error:"Ponto inválido"});return;}
    const r=await pool.query("DELETE FROM arqdor_mep_nodes WHERE tenant_id=$1 AND project_id=$2 AND id=$3 RETURNING id",[tid,pid,nodeId.data]);
    if(!r.rowCount){res.status(404).json({error:"Ponto não encontrado"});return;}
    res.json({deleted:true,id:nodeId.data,warning:"Trechos vinculados foram excluídos por cascata"});
  }catch(err){next(err);}
});
arqdorMepRouter.patch("/arch/projects/:projectId/mep/segments/:segmentId",async(req,res,next)=>{
  try{
    const tid=tenant(req,res),pid=routeId(req,res),segmentId=id.safeParse(req.params.segmentId);
    if(!tid||!pid)return;if(!segmentId.success){res.status(400).json({error:"Trecho inválido"});return;}
    const body=validation(segmentPatch,req,res);if(!body)return;
    const fields:{column:string;value:unknown}[]=[];
    if("material" in body)fields.push({column:"material",value:body.material??null});
    if("nominalSizeMm" in body)fields.push({column:"nominal_size_mm",value:body.nominalSizeMm??null});
    const values:unknown[]=[tid,pid,segmentId.data];
    const sets=fields.map(x=>{values.push(x.value);return x.column+"=$"+values.length;});
    const r=await pool.query("UPDATE arqdor_mep_segments SET "+sets.join(",")+" WHERE tenant_id=$1 AND project_id=$2 AND id=$3 RETURNING *",values);
    if(!r.rowCount){res.status(404).json({error:"Trecho não encontrado"});return;}
    res.json({segment:r.rows[0]});
  }catch(err){next(err);}
});
arqdorMepRouter.delete("/arch/projects/:projectId/mep/segments/:segmentId",async(req,res,next)=>{
  try{
    const tid=tenant(req,res),pid=routeId(req,res),segmentId=id.safeParse(req.params.segmentId);
    if(!tid||!pid)return;if(!segmentId.success){res.status(400).json({error:"Trecho inválido"});return;}
    const r=await pool.query("DELETE FROM arqdor_mep_segments WHERE tenant_id=$1 AND project_id=$2 AND id=$3 RETURNING id",[tid,pid,segmentId.data]);
    if(!r.rowCount){res.status(404).json({error:"Trecho não encontrado"});return;}
    res.json({deleted:true,id:segmentId.data});
  }catch(err){next(err);}
});


/**
 * Resolve the concept-to-workspace mapping without guessing that the two
 * project IDs are equal. A missing binding is a blocked integration, not a
 * reason to create a new independent model.
 */
arqdorMepRouter.get("/arch/concept-projects/:conceptId/mep-binding", async(req,res,next)=>{
  try {
    const tid=tenant(req,res);if(!tid)return;
    const parsed=id.safeParse(req.params.conceptId);
    if(!parsed.success){res.status(400).json({error:"Pré-projeto inválido"});return;}
    const project=await pool.query(
      "SELECT id FROM arch_concept_projects WHERE id=$1 AND tenant_id=$2 LIMIT 1",
      [parsed.data,tid]);
    if(!project.rowCount){res.status(404).json({error:"Pré-projeto não encontrado"});return;}
    const result=await pool.query(
      `SELECT b.workspace_project_id FROM arqdor_mep_project_bindings b
       JOIN arqdor_workspace_projects w ON w.id=b.workspace_project_id AND w.tenant_id=b.tenant_id
       WHERE b.concept_project_id=$1 AND b.tenant_id=$2 LIMIT 1`,
      [parsed.data,tid]);
    if(!result.rowCount){
      res.status(409).json({code:"MEP_BINDING_REQUIRED",error:"O pré-projeto ainda não possui vínculo BIM validado. Instalações bloqueadas até a vinculação."});
      return;
    }
    res.json({conceptProjectId:parsed.data,workspaceProjectId:result.rows[0].workspace_project_id});
  } catch(err){next(err);}
});


/**
 * Explicit linking is permitted only when the workspace itself declares the
 * same concept identity in its persisted context. Never infer from title/IDs.
 */
arqdorMepRouter.post("/arch/concept-projects/:conceptId/mep-binding", async(req,res,next)=>{
  const tid=tenant(req,res);if(!tid)return;
  const concept=id.safeParse(req.params.conceptId);
  const body=z.object({workspaceProjectId:id}).strict().safeParse(req.body);
  if(!concept.success||!body.success){res.status(422).json({error:"Identificadores inválidos"});return;}
  const client=await pool.connect();
  try{
    await client.query("BEGIN");
    const project=await client.query(
      "SELECT id FROM arch_concept_projects WHERE id=$1 AND tenant_id=$2 FOR UPDATE",
      [concept.data,tid]);
    const workspace=await client.query(
      "SELECT id,context_blob FROM arqdor_workspace_projects WHERE id=$1 AND tenant_id=$2 FOR UPDATE",
      [body.data.workspaceProjectId,tid]);
    if(!project.rowCount||!workspace.rowCount){
      await client.query("ROLLBACK");res.status(404).json({error:"Pré-projeto ou workspace não encontrado"});return;
    }
    const context=workspace.rows[0].context_blob as Record<string,unknown>|null;
    if(!context || context.conceptProjectId!==concept.data){
      await client.query("ROLLBACK");
      res.status(409).json({code:"MEP_WORKSPACE_IDENTITY_MISMATCH",error:"Workspace não identifica este pré-projeto; vínculo recusado"});
      return;
    }
    const collision=await client.query(
      `SELECT concept_project_id,workspace_project_id FROM arqdor_mep_project_bindings
       WHERE tenant_id=$1 AND (concept_project_id=$2 OR workspace_project_id=$3) FOR UPDATE`,
      [tid,concept.data,body.data.workspaceProjectId]);
    if(collision.rows.some(row=>row.concept_project_id!==concept.data||row.workspace_project_id!==body.data.workspaceProjectId)){
      await client.query("ROLLBACK");res.status(409).json({code:"MEP_BINDING_CONFLICT",error:"Projeto já possui outro vínculo"});return;
    }
    await client.query(
      `INSERT INTO arqdor_mep_project_bindings(tenant_id,concept_project_id,workspace_project_id)
       VALUES($1,$2,$3) ON CONFLICT (tenant_id,concept_project_id) DO NOTHING`,
      [tid,concept.data,body.data.workspaceProjectId]);
    await client.query("COMMIT");
    res.json({conceptProjectId:concept.data,workspaceProjectId:body.data.workspaceProjectId,verified:true});
  }catch(err){await client.query("ROLLBACK").catch(()=>{});next(err);}
  finally{client.release();}
});

/** Preview wall impacts. Does not mutate BIM geometry or installation points. */
const wallShape=z.object({id, floor:z.number().int(),x1:z.number().finite(),y1:z.number().finite(),x2:z.number().finite(),y2:z.number().finite(),thickness:z.number().finite().optional()}).strict();
const hostPreviewSchema=z.object({
 after:z.array(wallShape).max(5000),
 expectedProjectUpdatedAt:z.string().datetime({offset:true}),
}).strict();
arqdorMepRouter.post("/arch/concept-projects/:conceptId/mep/host-impact-preview",async(req,res,next)=>{
 try{
  const tid=tenant(req,res);if(!tid)return;
  const concept=id.safeParse(req.params.conceptId);
  const body=hostPreviewSchema.safeParse(req.body);
  if(!concept.success||!body.success){res.status(422).json({error:"Geometria ou versão inválida"});return;}
  const baseline=await pool.query(
    `SELECT c.configuration,c.updated_at,b.workspace_project_id
       FROM arch_concept_projects c
       JOIN arqdor_mep_project_bindings b ON b.concept_project_id=c.id AND b.tenant_id=c.tenant_id
       JOIN arqdor_workspace_projects w ON w.id=b.workspace_project_id AND w.tenant_id=b.tenant_id
       WHERE c.tenant_id=$1 AND c.id=$2 LIMIT 1`,[tid,concept.data]);
  if(!baseline.rowCount){res.status(409).json({code:"MEP_BINDING_REQUIRED"});return;}
  const record=baseline.rows[0];
  const storedVersion=new Date(record.updated_at).getTime();
  const expectedVersion=new Date(body.data.expectedProjectUpdatedAt).getTime();
  if(!Number.isFinite(expectedVersion)||storedVersion!==expectedVersion){
    res.status(409).json({code:"MEP_STALE_GEOMETRY",error:"O pré-projeto foi alterado; recarregue antes de conferir as instalações."});return;
  }
  const storedWalls=wallShape.array().max(5000).safeParse(record.configuration?.customWalls);
  if(!storedWalls.success){
    res.status(409).json({code:"MEP_BASELINE_UNAVAILABLE",error:"Não foi possível validar a geometria oficial salva no projeto."});return;
  }
  const workspaceId=record.workspace_project_id;
  const points=await pool.query(
    "SELECT id,host_element_id,floor_id FROM arqdor_mep_nodes WHERE tenant_id=$1 AND project_id=$2 AND host_element_id IS NOT NULL",
    [tid,workspaceId]);
  const impacts=inspectMepWallImpact(storedWalls.data,body.data.after,points.rows.map(p=>({id:p.id,hostElementId:p.host_element_id,floorId:p.floor_id})));
  res.json({workspaceProjectId:workspaceId,baselineUpdatedAt:record.updated_at,impacts,requiresReview:impacts.length>0,applied:false,warning:"Comparação com paredes persistidas; nenhuma instalação foi movida ou aprovada."});
 }catch(err){next(err);}
});


/** List persisted unresolved impacts; reviewer actions are separate from geometrical updates. */
arqdorMepRouter.get("/arch/concept-projects/:conceptId/mep/host-reviews",async(req,res,next)=>{
 try{
  const tid=tenant(req,res);if(!tid)return;
  const concept=id.safeParse(req.params.conceptId);
  if(!concept.success){res.status(400).json({error:"Pré-projeto inválido"});return;}
  const rows=await pool.query(
   `SELECT r.id,r.node_id,r.host_element_id,r.reason,r.status,r.architecture_updated_at,r.created_at
    FROM arqdor_mep_host_reviews r
    JOIN arqdor_mep_project_bindings b ON b.tenant_id=r.tenant_id AND b.workspace_project_id=r.project_id
      AND b.concept_project_id=r.concept_project_id
    WHERE r.tenant_id=$1 AND r.concept_project_id=$2
    ORDER BY r.created_at DESC LIMIT 500`,[tid,concept.data]);
  res.json({reviews:rows.rows});
 }catch(err){next(err);}
});
/** Explicitly record a review-required state, scoped by verified binding, current stored
 *  concept revision and recomputed host impact. Reject client-supplied impact claims. */
arqdorMepRouter.post("/arch/concept-projects/:conceptId/mep/host-reviews",async(req,res,next)=>{
 try{
  const tid=tenant(req,res);if(!tid)return;
  const concept=id.safeParse(req.params.conceptId);
  const body=hostPreviewSchema.safeParse(req.body);
  if(!concept.success||!body.success){res.status(422).json({error:"Geometria ou versão inválida"});return;}
  const client=await pool.connect();
  try{
   await client.query("BEGIN");
   const baseline=await client.query(
    `SELECT c.configuration,c.updated_at,b.workspace_project_id
     FROM arch_concept_projects c
     JOIN arqdor_mep_project_bindings b ON b.tenant_id=c.tenant_id AND b.concept_project_id=c.id
     JOIN arqdor_workspace_projects w ON w.tenant_id=b.tenant_id AND w.id=b.workspace_project_id
     WHERE c.tenant_id=$1 AND c.id=$2 FOR UPDATE OF c`,[tid,concept.data]);
   if(!baseline.rowCount){await client.query("ROLLBACK");res.status(409).json({code:"MEP_BINDING_REQUIRED"});return;}
   const record=baseline.rows[0];
   if(new Date(record.updated_at).getTime()!==new Date(body.data.expectedProjectUpdatedAt).getTime()){
    await client.query("ROLLBACK");res.status(409).json({code:"MEP_STALE_GEOMETRY"});return;
   }
   const stored=wallShape.array().max(5000).safeParse(record.configuration?.customWalls);
   if(!stored.success){await client.query("ROLLBACK");res.status(409).json({code:"MEP_BASELINE_UNAVAILABLE"});return;}
   const nodes=await client.query(
    "SELECT id,host_element_id,floor_id FROM arqdor_mep_nodes WHERE tenant_id=$1 AND project_id=$2 AND host_element_id IS NOT NULL",
    [tid,record.workspace_project_id]);
   const impact=inspectMepWallImpact(stored.data,body.data.after,nodes.rows.map(p=>({id:p.id,hostElementId:p.host_element_id,floorId:p.floor_id})));
   for(const item of impact){
    await client.query(
     `INSERT INTO arqdor_mep_host_reviews
      (id,tenant_id,project_id,node_id,host_element_id,reason,concept_project_id,architecture_updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,
     [crypto.randomUUID(),tid,record.workspace_project_id,item.nodeId,item.hostElementId,item.reason,concept.data,record.updated_at]);
   }
   await client.query("COMMIT");
   res.status(201).json({recorded:impact.length,requiresReview:impact.length>0,applied:false,
    warning:"Revisões registradas. Nenhuma parede ou instalação foi movida."});
  }catch(err){await client.query("ROLLBACK").catch(()=>{});throw err;}finally{client.release();}
 }catch(err){next(err);}
});
