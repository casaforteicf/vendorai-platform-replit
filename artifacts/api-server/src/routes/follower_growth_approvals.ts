import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@workspace/db";

const router: IRouter = Router();

function canAccess(req: any, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

const syncSchema = z.object({
  items: z.array(z.object({
    actionType: z.enum(["content", "replicate", "paid"]),
    sourceId: z.string().min(1),
    title: z.string().min(1),
    payload: z.record(z.string(), z.unknown()).optional(),
  })).max(30),
});

const batchSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(30),
  status: z.enum(["approved", "rejected"]),
});

const executionSchema = z.object({
  executionStatus: z.enum(["released", "running", "done"]),
});

const selectToday = (tenantId: string) => db.execute(sql`
  SELECT id, approval_date AS "approvalDate", action_type AS "actionType", source_id AS "sourceId",
         title, status, payload, decided_by_user_id AS "decidedByUserId", decided_at AS "decidedAt",
         execution_status AS "executionStatus", execution_started_at AS "executionStartedAt",
         executed_at AS "executedAt", executed_by_user_id AS "executedByUserId",
         execution_evidence_type AS "executionEvidenceType", execution_evidence_id AS "executionEvidenceId",
         execution_evidence_label AS "executionEvidenceLabel", execution_evidence_at AS "executionEvidenceAt",
         created_at AS "createdAt", updated_at AS "updatedAt"
    FROM follower_growth_daily_approvals
   WHERE tenant_id = ${tenantId} AND approval_date = CURRENT_DATE
   ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at ASC
`);

router.get("/tenants/:tenantId/follower-growth/approvals", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const result = await selectToday(tenantId);
  return res.json(result.rows ?? []);
});

router.post("/tenants/:tenantId/follower-growth/approvals/sync", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const parsed = syncSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  for (const item of parsed.data.items) {
    await db.execute(sql`
      INSERT INTO follower_growth_daily_approvals (tenant_id, action_type, source_id, title, payload)
      VALUES (${tenantId}, ${item.actionType}, ${item.sourceId}, ${item.title}, ${JSON.stringify(item.payload ?? {})}::jsonb)
      ON CONFLICT (tenant_id, approval_date, action_type, source_id) DO UPDATE SET
        title = EXCLUDED.title, payload = EXCLUDED.payload, updated_at = now()
    `);
  }
  const result = await selectToday(tenantId);
  return res.json(result.rows ?? []);
});

router.post("/tenants/:tenantId/follower-growth/approvals/batch", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const parsed = batchSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const actorUserId = req.user?.sub ?? req.user?.id ?? null;
  await db.execute(sql`
    UPDATE follower_growth_daily_approvals
       SET status = ${parsed.data.status}, decided_by_user_id = ${actorUserId}, decided_at = now(),
           execution_status = CASE WHEN ${parsed.data.status} = 'approved' THEN 'released' ELSE execution_status END,
           updated_at = now()
     WHERE tenant_id = ${tenantId} AND approval_date = CURRENT_DATE
       AND id = ANY(${parsed.data.ids}::text[])
  `);
  const result = await selectToday(tenantId);
  return res.json(result.rows ?? []);
});

router.patch("/tenants/:tenantId/follower-growth/approvals/:id/execution", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const id = String(req.params.id);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const parsed = executionSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  if (parsed.data.executionStatus === "done") {
    const evidence = await db.execute(sql`
      SELECT execution_evidence_id
        FROM follower_growth_daily_approvals
       WHERE tenant_id = ${tenantId} AND approval_date = CURRENT_DATE AND id = ${id} AND status = 'approved'
       LIMIT 1
    `);
    if (!evidence.rows?.[0]?.execution_evidence_id) {
      return res.status(409).json({ error: "Vincule uma publicação ou campanha real antes de concluir esta ação." });
    }
  }
  const actorUserId = req.user?.sub ?? req.user?.id ?? null;
  const updated = await db.execute(sql`
    UPDATE follower_growth_daily_approvals
       SET execution_status = ${parsed.data.executionStatus},
           execution_started_at = CASE WHEN ${parsed.data.executionStatus} = 'running' THEN COALESCE(execution_started_at, now()) ELSE execution_started_at END,
           executed_at = CASE WHEN ${parsed.data.executionStatus} = 'done' THEN now() ELSE executed_at END,
           executed_by_user_id = CASE WHEN ${parsed.data.executionStatus} = 'done' THEN ${actorUserId} ELSE executed_by_user_id END,
           updated_at = now()
     WHERE tenant_id = ${tenantId} AND approval_date = CURRENT_DATE AND id = ${id} AND status = 'approved'
     RETURNING id
  `);
  if (!updated.rows?.length) return res.status(409).json({ error: "A ação precisa estar aprovada antes de ser executada." });
  const result = await selectToday(tenantId);
  return res.json(result.rows ?? []);
});

export default router;
