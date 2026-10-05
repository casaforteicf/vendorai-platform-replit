import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import {
  db,
  agentActionsLogTable,
  insertAgentActionLogSchema,
  updateAgentActionLogSchema,
} from "@workspace/db";
import { approvePipelineAIAction } from "../services/pipeline-ai-orchestrator.js";

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

router.get("/tenants/:tenantId/pipeline-ai/pending", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    return res.status(403).json({ error: "Access denied to this tenant" });
  }

  const logs = await db.select().from(agentActionsLogTable).where(and(
    eq(agentActionsLogTable.tenantId, tenantId),
    eq(agentActionsLogTable.actionType, "pipeline_stage_transition"),
    eq(agentActionsLogTable.status, "pending"),
  )).orderBy(desc(agentActionsLogTable.createdAt));

  return res.json(logs);
});

router.post("/agent-action-logs/:id/pipeline-ai/decision", async (req, res) => {
  const decision = req.body?.decision;
  if (decision !== "approve" && decision !== "reject") {
    return res.status(422).json({ error: "decision deve ser approve ou reject" });
  }

  const [existing] = await db.select().from(agentActionsLogTable)
    .where(eq(agentActionsLogTable.id, String(req.params.id))).limit(1);
  if (!existing) return res.status(404).json({ error: "Agent action log not found" });
  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== existing.tenantId) {
    return res.status(403).json({ error: "Access denied to this tenant" });
  }
  if (existing.actionType !== "pipeline_stage_transition" || existing.status !== "pending") {
    return res.status(409).json({ error: "Ação não está pendente de decisão." });
  }

  if (decision === "reject") {
    const [updated] = await db.update(agentActionsLogTable)
      .set({ status: "rejected", payload: { ...(existing.payload ?? {}), decidedBy: req.user?.sub ?? null, decidedAt: new Date().toISOString() } })
      .where(eq(agentActionsLogTable.id, existing.id))
      .returning();
    return res.json(updated);
  }

  const result = await approvePipelineAIAction({
    actionLogId: existing.id,
    tenantId: existing.tenantId,
    approvedBy: req.user?.sub ?? null,
    log: req.log,
  });
  return res.json(result);
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
