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

router.get("/tenants/:tenantId/follower-growth/approvals", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const result = await db.execute(sql`
    SELECT id, approval_date AS "approvalDate", action_type AS "actionType", source_id AS "sourceId",
           title, status, payload, decided_by_user_id AS "decidedByUserId", decided_at AS "decidedAt",
           created_at AS "createdAt", updated_at AS "updatedAt"
      FROM follower_growth_daily_approvals
     WHERE tenant_id = ${tenantId} AND approval_date = CURRENT_DATE
     ORDER BY CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, created_at ASC
  `);
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
  const result = await db.execute(sql`
    SELECT id, approval_date AS "approvalDate", action_type AS "actionType", source_id AS "sourceId",
           title, status, payload, decided_by_user_id AS "decidedByUserId", decided_at AS "decidedAt"
      FROM follower_growth_daily_approvals
     WHERE tenant_id = ${tenantId} AND approval_date = CURRENT_DATE
     ORDER BY created_at ASC
  `);
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
       SET status = ${parsed.data.status}, decided_by_user_id = ${actorUserId}, decided_at = now(), updated_at = now()
     WHERE tenant_id = ${tenantId} AND approval_date = CURRENT_DATE
       AND id = ANY(${parsed.data.ids}::text[])
  `);
  const result = await db.execute(sql`
    SELECT id, action_type AS "actionType", source_id AS "sourceId", title, status, payload,
           decided_by_user_id AS "decidedByUserId", decided_at AS "decidedAt"
      FROM follower_growth_daily_approvals
     WHERE tenant_id = ${tenantId} AND approval_date = CURRENT_DATE
     ORDER BY created_at ASC
  `);
  return res.json(result.rows ?? []);
});

export default router;
