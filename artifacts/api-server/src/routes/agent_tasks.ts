import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  agentTasksTable,
  agentConfigsTable,
  insertAgentTaskSchema,
  updateAgentTaskSchema,
} from "@workspace/db";
import type { AgentType } from "@workspace/db";

const router: IRouter = Router();

router.post("/agent-tasks", async (req, res) => {
  const parsed = insertAgentTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const { tenantId, agentName } = parsed.data;

  const [config] = await db
    .select()
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  if (!config) {
    res.status(422).json({ error: "No agent config found for this tenant" });
    return;
  }

  const agentEntry = config.agents?.[agentName as AgentType];
  if (!agentEntry?.enabled) {
    res.status(422).json({
      error: `Agent "${agentName}" is not enabled for this tenant`,
    });
    return;
  }

  const [task] = await db
    .insert(agentTasksTable)
    .values(parsed.data)
    .returning();
  res.status(201).json(task);
});

router.get("/tenants/:tenantId/agent-tasks", async (req, res) => {
  const tasks = await db
    .select()
    .from(agentTasksTable)
    .where(eq(agentTasksTable.tenantId, String(req.params.tenantId)))
    .orderBy(agentTasksTable.createdAt);
  res.json(tasks);
});

router.get("/tenants/:tenantId/agent-tasks/pending", async (req, res) => {
  const tasks = await db
    .select()
    .from(agentTasksTable)
    .where(
      and(
        eq(agentTasksTable.tenantId, String(req.params.tenantId)),
        eq(agentTasksTable.status, "pendente_aprovacao")
      )
    )
    .orderBy(agentTasksTable.createdAt);
  res.json(tasks);
});

router.post(
  "/tenants/:tenantId/agent-tasks/:id/approve",
  async (req, res) => {
    const { tenantId, id } = req.params;

    const [task] = await db
      .select()
      .from(agentTasksTable)
      .where(
        and(
          eq(agentTasksTable.id, String(id)),
          eq(agentTasksTable.tenantId, String(tenantId))
        )
      );

    if (!task) {
      res.status(404).json({ error: "Agent task not found" });
      return;
    }

    if (task.status !== "pendente_aprovacao") {
      res.status(422).json({
        error: `Task cannot be approved from status "${task.status}"`,
      });
      return;
    }

    const [config] = await db
      .select()
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, String(tenantId)));

    const now = new Date();
    const autonomy = config?.autonomyEnabledAt;
    const isAutonomous = autonomy !== null && autonomy !== undefined && autonomy <= now;

    const newStatus = isAutonomous ? "executando" : "aprovado";
    const executedAt = isAutonomous ? now : null;

    const [updated] = await db
      .update(agentTasksTable)
      .set({
        status: newStatus,
        ...(executedAt ? { executedAt } : {}),
        updatedAt: now,
      })
      .where(eq(agentTasksTable.id, String(id)))
      .returning();

    res.json(updated);
  }
);

router.post(
  "/tenants/:tenantId/agent-tasks/:id/reject",
  async (req, res) => {
    const { tenantId, id } = req.params;

    const [task] = await db
      .select()
      .from(agentTasksTable)
      .where(
        and(
          eq(agentTasksTable.id, String(id)),
          eq(agentTasksTable.tenantId, String(tenantId))
        )
      );

    if (!task) {
      res.status(404).json({ error: "Agent task not found" });
      return;
    }

    if (task.status !== "pendente_aprovacao") {
      res.status(422).json({
        error: `Task cannot be rejected from status "${task.status}"`,
      });
      return;
    }

    const [updated] = await db
      .update(agentTasksTable)
      .set({ status: "rejeitado", updatedAt: new Date() })
      .where(eq(agentTasksTable.id, String(id)))
      .returning();

    res.json(updated);
  }
);

router.get("/agent-tasks/:id", async (req, res) => {
  const [task] = await db
    .select()
    .from(agentTasksTable)
    .where(eq(agentTasksTable.id, String(req.params.id)));

  if (!task) {
    res.status(404).json({ error: "Agent task not found" });
    return;
  }

  res.json(task);
});

router.patch("/agent-tasks/:id", async (req, res) => {
  const parsed = updateAgentTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [task] = await db
    .update(agentTasksTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(agentTasksTable.id, String(req.params.id)))
    .returning();

  if (!task) {
    res.status(404).json({ error: "Agent task not found" });
    return;
  }

  res.json(task);
});

router.delete("/agent-tasks/:id", async (req, res) => {
  const [deleted] = await db
    .delete(agentTasksTable)
    .where(eq(agentTasksTable.id, String(req.params.id)))
    .returning({ id: agentTasksTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Agent task not found" });
    return;
  }

  res.status(204).send();
});

export default router;
