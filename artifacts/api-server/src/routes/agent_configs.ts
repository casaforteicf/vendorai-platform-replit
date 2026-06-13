import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  agentConfigsTable,
  insertAgentConfigSchema,
  updateAgentConfigSchema,
} from "@workspace/db";

const router: IRouter = Router();

router.post("/agent-configs", async (req, res) => {
  const parsed = insertAgentConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  try {
    const [config] = await db
      .insert(agentConfigsTable)
      .values(parsed.data)
      .returning();
    res.status(201).json(config);
  } catch (err: unknown) {
    if (isPgCode(err, "23505")) {
      res.status(409).json({ error: "Tenant already has an agent config" });
      return;
    }
    throw err;
  }
});

router.get("/tenants/:tenantId/agent-config", async (req, res) => {
  const [config] = await db
    .select()
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, String(req.params.tenantId)));

  if (!config) {
    res.status(404).json({ error: "Agent config not found" });
    return;
  }

  res.json(config);
});

router.get("/agent-configs/:id", async (req, res) => {
  const [config] = await db
    .select()
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.id, String(req.params.id)));

  if (!config) {
    res.status(404).json({ error: "Agent config not found" });
    return;
  }

  res.json(config);
});

router.patch("/agent-configs/:id", async (req, res) => {
  const parsed = updateAgentConfigSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [config] = await db
    .update(agentConfigsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(agentConfigsTable.id, String(req.params.id)))
    .returning();

  if (!config) {
    res.status(404).json({ error: "Agent config not found" });
    return;
  }

  res.json(config);
});

router.post("/agent-configs/:id/complete-setup", async (req, res) => {
  const [existing] = await db
    .select()
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agent config not found" });
    return;
  }

  const setupCompletedAt = new Date();
  const autonomyEnabledAt = new Date(setupCompletedAt);
  autonomyEnabledAt.setDate(autonomyEnabledAt.getDate() + 5);

  const [config] = await db
    .update(agentConfigsTable)
    .set({ setupCompletedAt, autonomyEnabledAt, updatedAt: new Date() })
    .where(eq(agentConfigsTable.id, String(req.params.id)))
    .returning();

  res.json(config);
});

router.delete("/agent-configs/:id", async (req, res) => {
  const [deleted] = await db
    .delete(agentConfigsTable)
    .where(eq(agentConfigsTable.id, String(req.params.id)))
    .returning({ id: agentConfigsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Agent config not found" });
    return;
  }

  res.status(204).send();
});

function isPgCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code: string }).code === code) return true;
  if ("cause" in err) return isPgCode((err as { cause: unknown }).cause, code);
  return false;
}

export default router;
