import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import {
  db,
  agentConfigsTable,
  insertAgentConfigSchema,
  updateAgentConfigSchema,
} from "@workspace/db";

const incrementCountSchema = {
  parse(body: unknown): number {
    const count = Number((body as Record<string, unknown>)?.count ?? 1);
    if (!Number.isInteger(count) || count < 1) {
      throw new Error("count must be a positive integer");
    }
    return count;
  },
};

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

router.get("/agent-configs/:id/usage", async (req, res) => {
  const [config] = await db
    .select()
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.id, String(req.params.id)));

  if (!config) {
    res.status(404).json({ error: "Agent config not found" });
    return;
  }

  const dailyPct =
    config.dailyMessageLimit > 0
      ? Math.round((config.messagesSentToday / config.dailyMessageLimit) * 100)
      : 0;
  const monthlyPct =
    config.monthlyTokenLimit > 0
      ? Math.round((config.tokensUsedCurrentMonth / config.monthlyTokenLimit) * 100)
      : 0;

  res.json({
    messages: {
      sent: config.messagesSentToday,
      limit: config.dailyMessageLimit,
      percentUsed: dailyPct,
      nearLimit: dailyPct >= 80,
      overLimit: config.messagesSentToday >= config.dailyMessageLimit,
    },
    tokens: {
      used: config.tokensUsedCurrentMonth,
      limit: config.monthlyTokenLimit,
      percentUsed: monthlyPct,
      nearLimit: monthlyPct >= 80,
      overLimit: config.tokensUsedCurrentMonth >= config.monthlyTokenLimit,
    },
  });
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

router.post("/agent-configs/:id/increment-messages", async (req, res) => {
  let count: number;
  try {
    count = incrementCountSchema.parse(req.body);
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
    return;
  }

  const [config] = await db
    .update(agentConfigsTable)
    .set({
      messagesSentToday: sql<number>`CASE
        WHEN ${agentConfigsTable.messagesSentTodayResetAt} IS NULL
          OR ${agentConfigsTable.messagesSentTodayResetAt}::date < CURRENT_DATE
        THEN ${count}
        ELSE ${agentConfigsTable.messagesSentToday} + ${count}
      END`,
      messagesSentTodayResetAt: sql<Date>`CASE
        WHEN ${agentConfigsTable.messagesSentTodayResetAt} IS NULL
          OR ${agentConfigsTable.messagesSentTodayResetAt}::date < CURRENT_DATE
        THEN NOW()
        ELSE ${agentConfigsTable.messagesSentTodayResetAt}
      END`,
      updatedAt: new Date(),
    })
    .where(eq(agentConfigsTable.id, String(req.params.id)))
    .returning();

  if (!config) {
    res.status(404).json({ error: "Agent config not found" });
    return;
  }

  res.json(config);
});

router.post("/agent-configs/:id/increment-tokens", async (req, res) => {
  let count: number;
  try {
    count = incrementCountSchema.parse(req.body);
  } catch (err) {
    res.status(422).json({ error: (err as Error).message });
    return;
  }

  const [config] = await db
    .update(agentConfigsTable)
    .set({
      tokensUsedCurrentMonth: sql<number>`CASE
        WHEN ${agentConfigsTable.tokensResetAt} IS NULL
          OR DATE_TRUNC('month', ${agentConfigsTable.tokensResetAt}) < DATE_TRUNC('month', NOW())
        THEN ${count}
        ELSE ${agentConfigsTable.tokensUsedCurrentMonth} + ${count}
      END`,
      tokensResetAt: sql<Date>`CASE
        WHEN ${agentConfigsTable.tokensResetAt} IS NULL
          OR DATE_TRUNC('month', ${agentConfigsTable.tokensResetAt}) < DATE_TRUNC('month', NOW())
        THEN NOW()
        ELSE ${agentConfigsTable.tokensResetAt}
      END`,
      updatedAt: new Date(),
    })
    .where(eq(agentConfigsTable.id, String(req.params.id)))
    .returning();

  if (!config) {
    res.status(404).json({ error: "Agent config not found" });
    return;
  }

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
