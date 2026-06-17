import { Router, type IRouter } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  agentTasksTable,
  agentConfigsTable,
  insertAgentTaskSchema,
  updateAgentTaskSchema,
} from "@workspace/db";
import type { AgentTask, AgentType } from "@workspace/db";
import { z } from "zod";
import {
  sendOutgoingMessage,
  LeadNotFoundError,
} from "../services/omnichannel.js";
import type { Logger } from "pino";

const router: IRouter = Router();

// ── Payload schema for actionType="enviar_whatsapp" ──────────────────────────
const whatsappPayloadSchema = z.object({
  leadId: z.string().min(1),
  conteudo: z.string().min(1),
  agentName: z.string().optional(),
  canal: z
    .enum(["whatsapp", "instagram", "email", "chat"])
    .optional()
    .default("whatsapp"),
});

// ── Shared action executor ────────────────────────────────────────────────────
// Runs the action for a task that is already in "executando" status.
// Updates the task to "concluido" with result, or "erro" with errorMessage.
export async function executeTaskAction(
  task: AgentTask,
  log: Logger
): Promise<AgentTask> {
  if (task.actionType !== "enviar_whatsapp") {
    // Unknown action — mark as error so the task doesn't get stuck
    const [updated] = await db
      .update(agentTasksTable)
      .set({
        status: "erro",
        errorMessage: `Unknown actionType: "${task.actionType}"`,
        updatedAt: new Date(),
      })
      .where(eq(agentTasksTable.id, task.id))
      .returning();
    log.warn({ taskId: task.id, actionType: task.actionType }, "agent_task: unknown actionType");
    return updated;
  }

  // ── enviar_whatsapp ───────────────────────────────────────────────────────
  const parsedPayload = whatsappPayloadSchema.safeParse(task.payload ?? {});
  if (!parsedPayload.success) {
    const [updated] = await db
      .update(agentTasksTable)
      .set({
        status: "erro",
        errorMessage: `Invalid payload: ${parsedPayload.error.message}`,
        updatedAt: new Date(),
      })
      .where(eq(agentTasksTable.id, task.id))
      .returning();
    log.warn({ taskId: task.id }, "agent_task: invalid whatsapp payload");
    return updated;
  }

  const { leadId, conteudo, agentName, canal } = parsedPayload.data;

  try {
    const { message, telefoneDestino } = await sendOutgoingMessage(
      { tenantId: task.tenantId, leadId, conteudo, agentName, canal },
      log
    );

    const [updated] = await db
      .update(agentTasksTable)
      .set({
        status: "concluido",
        result: { messageId: message.id, telefoneDestino },
        executedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(agentTasksTable.id, task.id))
      .returning();

    log.info(
      { taskId: task.id, messageId: message.id },
      "agent_task: enviar_whatsapp concluido"
    );
    return updated;
  } catch (err) {
    const errorMessage =
      err instanceof LeadNotFoundError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Unknown error during task execution";

    const [updated] = await db
      .update(agentTasksTable)
      .set({ status: "erro", errorMessage, updatedAt: new Date() })
      .where(eq(agentTasksTable.id, task.id))
      .returning();

    log.error({ taskId: task.id, err }, "agent_task: execution failed");
    return updated;
  }
}

// ── POST /agent-tasks ─────────────────────────────────────────────────────────
router.post("/agent-tasks", async (req, res) => {
  const parsed = insertAgentTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const { tenantId, agentName } = parsed.data;

  const [config] = await db
    .select({ id: agentConfigsTable.id, agents: agentConfigsTable.agents })
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

// ── GET /tenants/:tenantId/agent-tasks ────────────────────────────────────────
router.get("/tenants/:tenantId/agent-tasks", async (req, res) => {
  const tasks = await db
    .select()
    .from(agentTasksTable)
    .where(eq(agentTasksTable.tenantId, String(req.params.tenantId)))
    .orderBy(agentTasksTable.createdAt);
  res.json(tasks);
});

// ── GET /tenants/:tenantId/agent-tasks/pending ────────────────────────────────
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

// ── POST /tenants/:tenantId/agent-tasks/:id/approve ───────────────────────────
// Transitions: pendente_aprovacao → executando (+ runs action) when autonomous
//              pendente_aprovacao → executando (+ runs action) for enviar_whatsapp always
//              pendente_aprovacao → aprovado for non-whatsapp tasks without autonomy
router.post(
  "/tenants/:tenantId/agent-tasks/:id/approve",
  async (req, res) => {
    const { tenantId, id } = req.params;

    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

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
      .select({ id: agentConfigsTable.id, autonomyEnabledAt: agentConfigsTable.autonomyEnabledAt })
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, String(tenantId)));

    const now = new Date();
    const autonomy = config?.autonomyEnabledAt;
    const isAutonomous =
      autonomy !== null && autonomy !== undefined && autonomy <= now;

    // enviar_whatsapp always executes immediately on approval (no holding state)
    const shouldExecuteNow = isAutonomous || task.actionType === "enviar_whatsapp";

    if (shouldExecuteNow) {
      // Move to "executando" first, then run the action
      const [executing] = await db
        .update(agentTasksTable)
        .set({ status: "executando", executedAt: now, updatedAt: now })
        .where(eq(agentTasksTable.id, String(id)))
        .returning();

      const finished = await executeTaskAction(executing, req.log);
      res.json(finished);
    } else {
      // Non-autonomous, non-whatsapp: hold in "aprovado" for explicit execute
      const [updated] = await db
        .update(agentTasksTable)
        .set({ status: "aprovado", updatedAt: now })
        .where(eq(agentTasksTable.id, String(id)))
        .returning();

      res.json(updated);
    }
  }
);

// ── POST /tenants/:tenantId/agent-tasks/:id/execute ───────────────────────────
// Explicitly executes a task in "aprovado" status.
// Useful for non-autonomous tasks or future action types that need manual trigger.
router.post(
  "/tenants/:tenantId/agent-tasks/:id/execute",
  async (req, res) => {
    const { tenantId, id } = req.params;

    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

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

    if (task.status !== "aprovado") {
      res.status(422).json({
        error: `Task cannot be executed from status "${task.status}" — must be "aprovado"`,
      });
      return;
    }

    // Move to "executando"
    const [executing] = await db
      .update(agentTasksTable)
      .set({ status: "executando", executedAt: new Date(), updatedAt: new Date() })
      .where(eq(agentTasksTable.id, String(id)))
      .returning();

    const finished = await executeTaskAction(executing, req.log);
    res.json(finished);
  }
);

// ── POST /tenants/:tenantId/agent-tasks/:id/reject ────────────────────────────
router.post(
  "/tenants/:tenantId/agent-tasks/:id/reject",
  async (req, res) => {
    const { tenantId, id } = req.params;

    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

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

// ── GET /agent-tasks/:id ──────────────────────────────────────────────────────
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

// ── PATCH /agent-tasks/:id ────────────────────────────────────────────────────
router.patch("/agent-tasks/:id", async (req, res) => {
  const parsed = updateAgentTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: agentTasksTable.id, tenantId: agentTasksTable.tenantId })
    .from(agentTasksTable)
    .where(eq(agentTasksTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agent task not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [task] = await db
    .update(agentTasksTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(agentTasksTable.id, existing.id))
    .returning();

  res.json(task);
});

// ── DELETE /agent-tasks/:id ───────────────────────────────────────────────────
router.delete("/agent-tasks/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: agentTasksTable.id, tenantId: agentTasksTable.tenantId })
    .from(agentTasksTable)
    .where(eq(agentTasksTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agent task not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(agentTasksTable).where(eq(agentTasksTable.id, existing.id));

  res.status(204).send();
});

export default router;
