import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  agentActionsLogTable,
  insertAgentActionLogSchema,
  updateAgentActionLogSchema,
} from "@workspace/db";

const router: IRouter = Router();

router.get("/agent-action-logs", async (req, res) => {
  const logs = await db
    .select()
    .from(agentActionsLogTable)
    .orderBy(agentActionsLogTable.createdAt);
  res.json(logs);
});

router.post("/agent-action-logs", async (req, res) => {
  const parsed = insertAgentActionLogSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [log] = await db
    .insert(agentActionsLogTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(log);
});

router.get("/tenants/:tenantId/agent-action-logs", async (req, res) => {
  const logs = await db
    .select()
    .from(agentActionsLogTable)
    .where(eq(agentActionsLogTable.tenantId, req.params.tenantId))
    .orderBy(agentActionsLogTable.createdAt);
  res.json(logs);
});

router.get("/agent-action-logs/:id", async (req, res) => {
  const [log] = await db
    .select()
    .from(agentActionsLogTable)
    .where(eq(agentActionsLogTable.id, req.params.id));

  if (!log) {
    res.status(404).json({ error: "Agent action log not found" });
    return;
  }

  res.json(log);
});

router.patch("/agent-action-logs/:id", async (req, res) => {
  const parsed = updateAgentActionLogSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: agentActionsLogTable.id, tenantId: agentActionsLogTable.tenantId })
    .from(agentActionsLogTable)
    .where(eq(agentActionsLogTable.id, req.params.id));

  if (!existing) {
    res.status(404).json({ error: "Agent action log not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [log] = await db
    .update(agentActionsLogTable)
    .set(parsed.data)
    .where(eq(agentActionsLogTable.id, existing.id))
    .returning();

  res.json(log);
});

router.delete("/agent-action-logs/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: agentActionsLogTable.id, tenantId: agentActionsLogTable.tenantId })
    .from(agentActionsLogTable)
    .where(eq(agentActionsLogTable.id, req.params.id));

  if (!existing) {
    res.status(404).json({ error: "Agent action log not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(agentActionsLogTable).where(eq(agentActionsLogTable.id, existing.id));

  res.status(204).send();
});

export default router;
