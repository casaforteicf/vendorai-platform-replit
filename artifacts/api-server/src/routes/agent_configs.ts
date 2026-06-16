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

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
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

  const [existing] = await db
    .select({ id: agentConfigsTable.id, tenantId: agentConfigsTable.tenantId })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agent config not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [config] = await db
    .update(agentConfigsTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(agentConfigsTable.id, existing.id))
    .returning();

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
    .select({ id: agentConfigsTable.id, tenantId: agentConfigsTable.tenantId })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agent config not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const setupCompletedAt = new Date();
  const autonomyEnabledAt = new Date(setupCompletedAt);
  autonomyEnabledAt.setDate(autonomyEnabledAt.getDate() + 5);

  const [config] = await db
    .update(agentConfigsTable)
    .set({ setupCompletedAt, autonomyEnabledAt, updatedAt: new Date() })
    .where(eq(agentConfigsTable.id, existing.id))
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

  const [existing] = await db
    .select({ id: agentConfigsTable.id, tenantId: agentConfigsTable.tenantId })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agent config not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
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
    .where(eq(agentConfigsTable.id, existing.id))
    .returning();

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

  const [existing] = await db
    .select({ id: agentConfigsTable.id, tenantId: agentConfigsTable.tenantId })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agent config not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
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
    .where(eq(agentConfigsTable.id, existing.id))
    .returning();

  res.json(config);
});

router.post("/agent-configs/:id/regenerate-webhook-secret", async (req, res) => {
  const [existing] = await db
    .select({ id: agentConfigsTable.id, tenantId: agentConfigsTable.tenantId })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agent config not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const secret = `whs_${crypto.randomUUID().replace(/-/g, "")}`;

  const [config] = await db
    .update(agentConfigsTable)
    .set({ webhookSecret: secret, updatedAt: new Date() })
    .where(eq(agentConfigsTable.id, existing.id))
    .returning();

  req.log.info({ agentConfigId: existing.id }, "webhook secret regenerated");
  res.json(config);
});

router.delete("/agent-configs/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: agentConfigsTable.id, tenantId: agentConfigsTable.tenantId })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Agent config not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(agentConfigsTable).where(eq(agentConfigsTable.id, existing.id));

  res.status(204).send();
});

// ── POST /agent-configs/:id/zapi-setup-webhook ────────────────────────────────
// Registers the VendorAI Z-API native webhook URL in the Z-API instance so
// incoming messages are forwarded automatically.
router.post("/agent-configs/:id/zapi-setup-webhook", async (req, res) => {
  const [config] = await db
    .select()
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.id, String(req.params.id)));

  if (!config) {
    res.status(404).json({ error: "Agent config not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && config.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (!config.zapiInstanceId || !config.zapiToken || !config.zapiClientToken) {
    res.status(422).json({ error: "Z-API credentials not configured" });
    return;
  }

  if (!config.webhookSecret) {
    res.status(422).json({ error: "Webhook secret not generated — regenerate it first" });
    return;
  }

  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  if (!domain) {
    res.status(500).json({ error: "Cannot determine public domain (REPLIT_DOMAINS not set)" });
    return;
  }

  const webhookUrl = `https://${domain}/api/tenants/${config.tenantId}/webhooks/zapi?secret=${config.webhookSecret}`;

  try {
    const zapiRes = await fetch(
      `https://api.z-api.io/instances/${config.zapiInstanceId}/token/${config.zapiToken}/update-webhook-received`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Client-Token": config.zapiClientToken,
        },
        body: JSON.stringify({ value: webhookUrl }),
      }
    );

    if (!zapiRes.ok) {
      const body = await zapiRes.text();
      req.log.warn({ status: zapiRes.status, body }, "zapi-setup-webhook: Z-API error");
      res.status(502).json({ error: `Z-API returned ${zapiRes.status}: ${body}` });
      return;
    }

    req.log.info({ webhookUrl }, "zapi-setup-webhook: webhook registered successfully");
    res.json({ ok: true, webhookUrl });
  } catch (err) {
    req.log.error({ err }, "zapi-setup-webhook: fetch failed");
    res.status(502).json({ error: "Failed to reach Z-API" });
  }
});

router.get("/agent-configs/:id/zapi-status", async (req, res) => {
  const [config] = await db
    .select({
      id: agentConfigsTable.id,
      tenantId: agentConfigsTable.tenantId,
      zapiInstanceId: agentConfigsTable.zapiInstanceId,
      zapiToken: agentConfigsTable.zapiToken,
      zapiClientToken: agentConfigsTable.zapiClientToken,
    })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.id, String(req.params.id)));

  if (!config) {
    res.status(404).json({ error: "Agent config not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && config.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  if (!config.zapiInstanceId || !config.zapiToken || !config.zapiClientToken) {
    res.json({ configured: false, connected: false, session: false });
    return;
  }

  try {
    const zapiRes = await fetch(
      `https://api.z-api.io/instances/${config.zapiInstanceId}/token/${config.zapiToken}/status`,
      { headers: { "Client-Token": config.zapiClientToken } }
    );
    if (!zapiRes.ok) {
      res.json({ configured: true, connected: false, session: false, error: `Z-API HTTP ${zapiRes.status}` });
      return;
    }
    const data = (await zapiRes.json()) as { connected?: boolean; session?: boolean; smartphoneConnected?: boolean };
    res.json({
      configured: true,
      connected: data.connected ?? false,
      session: data.session ?? false,
      smartphoneConnected: data.smartphoneConnected ?? false,
    });
  } catch (err) {
    req.log.warn({ err }, "zapi-status check failed");
    res.json({ configured: true, connected: false, session: false, error: "fetch failed" });
  }
});

function isPgCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code: string }).code === code) return true;
  if ("cause" in err) return isPgCode((err as { cause: unknown }).cause, code);
  return false;
}

export default router;
