import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import { db, activitiesTable, leadsTable } from "@workspace/db";
import { requireRole } from "../middlewares/auth.js";
import { validTasksJson } from "./atlas_marketing_validation.js";
import { sql } from "drizzle-orm";

const router: IRouter = Router();
const marketingKey = "marketing-phase1-v1";
router.post("/admin/atlas/tasks/:nicheId/:taskId/link-crm", requireRole("super_admin"), async (req,res) => {
 const {nicheId, taskId} = req.params;
 const {tenantId, leadId} = req.body ?? {};
 if (!/^niche-[0-9]{2,4}$/.test(nicheId) || !/^[a-zA-Z0-9_-]{1,80}$/.test(taskId) ||
     typeof tenantId!=="string" || tenantId.length>128 || !tenantId ||
     typeof leadId!=="string" || leadId.length>128 || !leadId) {
  res.status(422).json({error:"ATLAS_CRM_INVALID_LINK"});return;
 }
 try {
  const data=await db.execute(sql`SELECT content FROM vendor_atlas_documents WHERE document_key=${marketingKey}`);
  const content=data.rows[0]?.content as Record<string,Record<string,string>>|undefined;
  const raw=content?.[nicheId]?.tasksJson;
  if (!raw || !validTasksJson(raw)) {res.status(404).json({error:"ATLAS_TASK_NOT_SAVED"});return;}
  const task=(JSON.parse(raw) as Array<{id:string;title:string;owner:string;priority:string;dueDate:string;done:boolean}>).find(t=>t.id===taskId);
  if (!task) {res.status(404).json({error:"ATLAS_TASK_NOT_FOUND"});return;}
  const [lead]=await db.select({id:leadsTable.id}).from(leadsTable).where(and(eq(leadsTable.id,leadId),eq(leadsTable.tenantId,tenantId),isNull(leadsTable.excluidoEm))).limit(1);
  if (!lead) {res.status(422).json({error:"ATLAS_LEAD_TENANT_MISMATCH"});return;}
  const linkKey=`atlas:${nicheId}:${taskId}:${leadId}`;
  const [existing]=await db.select({id:activitiesTable.id}).from(activitiesTable).where(and(eq(activitiesTable.tenantId,tenantId),eq(activitiesTable.leadId,leadId),eq(activitiesTable.origemTemplateKey,linkKey))).limit(1);
  if (existing) {res.json({ok:true,alreadyLinked:true,activityId:existing.id});return;}
  const [created]=await db.insert(activitiesTable).values({
    tenantId,leadId,tipo:"tarefa",titulo:task.title,descricao:`Origem Atlas 360º: ${nicheId} / ${taskId}. Responsável previsto: ${task.owner||"não definido"}`,
    status:task.done?"concluida":"pendente",
    prioridade:task.priority==="high"?"alta":task.priority==="low"?"baixa":"normal",
    dataVencimento:task.dueDate?new Date(task.dueDate+"T12:00:00Z"):null,
    origem:"atlas",origemTemplateKey:linkKey,
  }).returning({id:activitiesTable.id});
  res.status(201).json({ok:true,alreadyLinked:false,activityId:created.id});
 }catch(error){if((error as {code?:string})?.code==="23505"){res.status(409).json({error:"ATLAS_CRM_LINK_ALREADY_CREATED_RELOAD"});return;}res.status(503).json({error:"ATLAS_CRM_LINK_UNAVAILABLE"});}
});
export default router;
