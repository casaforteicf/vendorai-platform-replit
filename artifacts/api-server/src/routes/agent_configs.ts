import { Router, type IRouter } from "express";
import { eq, sql, and } from "drizzle-orm";
import {
  db,
  agentConfigsTable,
  agentDefaultsTable,
  tenantAgentConfigsTable,
  insertAgentConfigSchema,
  updateAgentConfigSchema,
  updateTenantAgentConfigSchema,
} from "@workspace/db";
import { getOpenAI } from "../lib/agent-engine.js";

const KNOWN_AGENT_KEYS = new Set([
  "sdr", "closer", "financeiro", "cobranca",
  "suporte", "agendamento", "pos_venda", "prospector",
]);

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

// ── Colunas sem Meta (compatível com prod onde essas colunas ainda não existem) ──
const NON_META_COLS = {
  id: agentConfigsTable.id,
  tenantId: agentConfigsTable.tenantId,
  agents: agentConfigsTable.agents,
  dailyMessageLimit: agentConfigsTable.dailyMessageLimit,
  messagesSentToday: agentConfigsTable.messagesSentToday,
  monthlyTokenLimit: agentConfigsTable.monthlyTokenLimit,
  tokensUsedCurrentMonth: agentConfigsTable.tokensUsedCurrentMonth,
  webhookSecret: agentConfigsTable.webhookSecret,
  setupCompletedAt: agentConfigsTable.setupCompletedAt,
  autonomyEnabledAt: agentConfigsTable.autonomyEnabledAt,
  messagesSentTodayResetAt: agentConfigsTable.messagesSentTodayResetAt,
  tokensResetAt: agentConfigsTable.tokensResetAt,
  contentGenerationsThisMonth: agentConfigsTable.contentGenerationsThisMonth,
  contentGenerationsResetAt: agentConfigsTable.contentGenerationsResetAt,
  churnAutoWhatsapp: agentConfigsTable.churnAutoWhatsapp,
  instagramPageAccessToken: agentConfigsTable.instagramPageAccessToken,
  instagramPageId: agentConfigsTable.instagramPageId,
  instagramUsername: agentConfigsTable.instagramUsername,
  zapiInstanceId: agentConfigsTable.zapiInstanceId,
  zapiToken: agentConfigsTable.zapiToken,
  zapiClientToken: agentConfigsTable.zapiClientToken,
  createdAt: agentConfigsTable.createdAt,
  updatedAt: agentConfigsTable.updatedAt,
};
const META_NULL = { metaPhoneNumberId: null, metaWabaId: null, metaAccessToken: null, metaVerifyToken: null };

function isColMissingError(err: unknown): boolean {
  return err instanceof Error && err.message.includes("does not exist");
}

async function selectConfigByTenantId(tenantId: string) {
  try {
    const [c] = await db.select().from(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenantId));
    return c ?? null;
  } catch (err) {
    if (!isColMissingError(err)) throw err;
    const [c] = await db.select(NON_META_COLS).from(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenantId));
    return c ? { ...c, ...META_NULL } : null;
  }
}

async function selectConfigById(id: string) {
  try {
    const [c] = await db.select().from(agentConfigsTable).where(eq(agentConfigsTable.id, id));
    return c ?? null;
  } catch (err) {
    if (!isColMissingError(err)) throw err;
    const [c] = await db.select(NON_META_COLS).from(agentConfigsTable).where(eq(agentConfigsTable.id, id));
    return c ? { ...c, ...META_NULL } : null;
  }
}

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
  const config = await selectConfigByTenantId(String(req.params.tenantId));
  if (!config) { res.status(404).json({ error: "Agent config not found" }); return; }
  res.json(config);
});

// ── GET /agent-configs — lista unificada de agent_defaults + tenant_agent_configs ──
router.get("/agent-configs", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const [defaults, tenantConfigs] = await Promise.all([
    db.select().from(agentDefaultsTable).where(eq(agentDefaultsTable.ativo, true)),
    db.select().from(tenantAgentConfigsTable).where(eq(tenantAgentConfigsTable.tenantId, tenantId)),
  ]);

  const configMap = new Map(tenantConfigs.map((c) => [c.agentKey, c]));

  const result = defaults.map((d) => {
    const tc = configMap.get(d.agentKey);
    return {
      agentKey:           d.agentKey,
      nome:               d.nome,
      descricao:          d.descricao ?? "",
      categoria:          d.categoria ?? "",
      ativo:              tc ? tc.ativo : false,
      nomePerfil:         tc?.nomePerfil ?? null,
      tom:                tc?.tom ?? "profissional",
      restricoes:         tc?.restricoes ?? null,
      systemPromptBase:   d.systemPromptBase,
      systemPromptCustom: tc?.systemPromptCustom ?? null,
    };
  });

  return res.json(result);
});

// ── POST /agent-configs/:agentKey/activate ──────────────────────────────────────
router.post("/agent-configs/:agentKey/activate", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { agentKey } = req.params as { agentKey: string };

  await db
    .insert(tenantAgentConfigsTable)
    .values({ tenantId, agentKey, ativo: true })
    .onConflictDoUpdate({
      target: [tenantAgentConfigsTable.tenantId, tenantAgentConfigsTable.agentKey],
      set: { ativo: true, updatedAt: new Date() },
    });

  return res.json({ agentKey, ativo: true });
});

// ── POST /agent-configs/:agentKey/deactivate ────────────────────────────────────
router.post("/agent-configs/:agentKey/deactivate", async (req, res) => {
  const tenantId = req.user?.tenantId;
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }
  const { agentKey } = req.params as { agentKey: string };

  await db
    .insert(tenantAgentConfigsTable)
    .values({ tenantId, agentKey, ativo: false })
    .onConflictDoUpdate({
      target: [tenantAgentConfigsTable.tenantId, tenantAgentConfigsTable.agentKey],
      set: { ativo: false, updatedAt: new Date() },
    });

  return res.json({ agentKey, ativo: false });
});

// ── POST /agent-configs/:agentKey/test — testa o agente com mensagem simulada ──
router.post("/agent-configs/:agentKey/test", async (req, res, next) => {
  const { agentKey } = req.params as { agentKey: string };
  if (!KNOWN_AGENT_KEYS.has(agentKey)) return next();

  const tenantId = req.user?.tenantId;
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const { mensagem } = req.body as { mensagem?: string };
  if (!mensagem?.trim()) { res.status(422).json({ error: "mensagem é obrigatória" }); return; }

  const [[defaultCfg], [tenantCfg]] = await Promise.all([
    db.select().from(agentDefaultsTable).where(eq(agentDefaultsTable.agentKey, agentKey)),
    db.select().from(tenantAgentConfigsTable).where(
      and(eq(tenantAgentConfigsTable.tenantId, tenantId), eq(tenantAgentConfigsTable.agentKey, agentKey))
    ),
  ]);

  if (!defaultCfg) { res.status(404).json({ error: "Agente não encontrado" }); return; }

  const systemPrompt = tenantCfg?.systemPromptCustom?.trim() || defaultCfg.systemPromptBase;
  const tom          = tenantCfg?.tom ?? "profissional";
  const TOM_INST: Record<string, string> = {
    profissional: "Responda de forma profissional, clara e objetiva.",
    amigavel:     "Responda de forma amigável, calorosa e acessível.",
    tecnico:      "Responda com precisão técnica e detalhamento.",
    vendedor:     "Responda com energia, foco em benefícios e chamadas para ação.",
    neutro:       "Responda de forma neutra e informativa.",
  };
  const fullPrompt = [systemPrompt, TOM_INST[tom] ?? ""].filter(Boolean).join("\n\n");

  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model:       "gpt-4o-mini",
    messages:    [{ role: "system", content: fullPrompt }, { role: "user", content: mensagem.trim() }],
    temperature: 0.7,
    max_tokens:  600,
  });

  const resposta   = completion.choices[0]?.message?.content?.trim() ?? "";
  const tokensUsed = completion.usage?.total_tokens ?? 0;

  return res.json({ resposta, tokensUsed, tom });
});

// ── PATCH /agent-configs/:agentKey — salva perfil + prompt do tenant ───────────
// Falls through to PATCH /agent-configs/:id (UUID-based) if agentKey is unknown
router.patch("/agent-configs/:agentKey", async (req, res, next) => {
  const { agentKey } = req.params as { agentKey: string };
  if (!KNOWN_AGENT_KEYS.has(agentKey)) return next();

  const tenantId = req.user?.tenantId;
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  const parsed = updateTenantAgentConfigSchema.safeParse(req.body);
  if (!parsed.success) { res.status(422).json({ error: parsed.error.message }); return; }

  await db
    .insert(tenantAgentConfigsTable)
    .values({ tenantId, agentKey, ...parsed.data })
    .onConflictDoUpdate({
      target: [tenantAgentConfigsTable.tenantId, tenantAgentConfigsTable.agentKey],
      set: { ...parsed.data, updatedAt: new Date() },
    });

  return res.json({ agentKey, ...parsed.data });
});

// ── POST /agent-configs/:agentKey/reset — limpa systemPromptCustom ────────────
router.post("/agent-configs/:agentKey/reset", async (req, res, next) => {
  const { agentKey } = req.params as { agentKey: string };
  if (!KNOWN_AGENT_KEYS.has(agentKey)) return next();

  const tenantId = req.user?.tenantId;
  if (!tenantId) { res.status(401).json({ error: "Unauthorized" }); return; }

  await db
    .insert(tenantAgentConfigsTable)
    .values({ tenantId, agentKey, systemPromptCustom: null })
    .onConflictDoUpdate({
      target: [tenantAgentConfigsTable.tenantId, tenantAgentConfigsTable.agentKey],
      set: { systemPromptCustom: null, updatedAt: new Date() },
    });

  return res.json({ agentKey, systemPromptCustom: null });
});

router.get("/agent-configs/:id", async (req, res) => {
  const config = await selectConfigById(String(req.params.id));
  if (!config) { res.status(404).json({ error: "Agent config not found" }); return; }
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

  let config: typeof agentConfigsTable.$inferSelect | undefined;
  try {
    [config] = await db
      .update(agentConfigsTable)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(agentConfigsTable.id, existing.id))
      .returning();
  } catch (err) {
    if (!isColMissingError(err)) throw err;
    const metaFields = ["metaPhoneNumberId", "metaWabaId", "metaAccessToken", "metaVerifyToken"] as const;
    const safeData = Object.fromEntries(
      Object.entries(parsed.data).filter(([k]) => !metaFields.includes(k as typeof metaFields[number]))
    );
    const [partial] = await db
      .update(agentConfigsTable)
      .set({ ...safeData, updatedAt: new Date() })
      .where(eq(agentConfigsTable.id, existing.id))
      .returning(NON_META_COLS);
    config = partial ? ({ ...partial, ...META_NULL } as typeof agentConfigsTable.$inferSelect) : undefined;
  }

  res.json(config);
});

router.get("/agent-configs/:id/usage", async (req, res) => {
  const [config] = await db
    .select({
      id: agentConfigsTable.id,
      dailyMessageLimit: agentConfigsTable.dailyMessageLimit,
      messagesSentToday: agentConfigsTable.messagesSentToday,
      monthlyTokenLimit: agentConfigsTable.monthlyTokenLimit,
      tokensUsedCurrentMonth: agentConfigsTable.tokensUsedCurrentMonth,
    })
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

// ── GET /agent-configs/:id/meta-status ───────────────────────────────────────
router.get("/agent-configs/:id/meta-status", async (req, res) => {
  const [config] = await db
    .select({
      id: agentConfigsTable.id,
      tenantId: agentConfigsTable.tenantId,
      metaPhoneNumberId: agentConfigsTable.metaPhoneNumberId,
      metaAccessToken: agentConfigsTable.metaAccessToken,
    })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.id, String(req.params.id)));

  if (!config) {
    return res.status(404).json({ error: "Agent config not found" });
  }

  if (req.user?.platformRole !== "super_admin" && config.tenantId !== req.user?.tenantId) {
    return res.status(403).json({ error: "Access denied" });
  }

  if (!config.metaPhoneNumberId || !config.metaAccessToken) {
    return res.json({ configured: false, verified: false });
  }

  try {
    const metaRes = await fetch(
      `https://graph.facebook.com/v20.0/${config.metaPhoneNumberId}?fields=id,display_phone_number,verified_name,quality_rating`,
      { headers: { Authorization: `Bearer ${config.metaAccessToken}` } }
    );
    const data = await metaRes.json().catch(() => ({})) as Record<string, string>;
    if (!metaRes.ok) {
      return res.json({ configured: true, verified: false, error: `Meta API ${metaRes.status}`, details: data });
    }
    return res.json({
      configured: true,
      verified: true,
      displayPhoneNumber: data["display_phone_number"] ?? null,
      verifiedName: data["verified_name"] ?? null,
      qualityRating: data["quality_rating"] ?? null,
    });
  } catch (err) {
    req.log.warn({ err }, "meta-status check failed");
    return res.json({ configured: true, verified: false, error: "fetch failed" });
  }
});

// ── POST /agent-configs/:id/zapi-setup-webhook — DEPRECATED ──────────────────
// Z-API has been replaced by Meta Cloud API. Webhook registration is automatic.
router.post("/agent-configs/:id/zapi-setup-webhook", (req, res) => {
  req.log.warn({ id: req.params.id }, "zapi-setup-webhook: called but Z-API is deprecated");
  res.status(410).json({
    error: "Z-API foi substituído pela Meta Cloud API. Configure o webhook no painel Meta Business.",
    deprecated: true,
  });
});

// ── GET /agent-configs/:id/zapi-status — DEPRECATED ──────────────────────────
router.get("/agent-configs/:id/zapi-status", (req, res) => {
  req.log.warn({ id: req.params.id }, "zapi-status: called but Z-API is deprecated");
  res.status(410).json({
    error: "Z-API foi substituído pela Meta Cloud API. Use /agent-configs/:id/meta-status.",
    deprecated: true,
    configured: false,
    connected: false,
    session: false,
    smartphoneConnected: false,
  });
});

function isPgCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code: string }).code === code) return true;
  if ("cause" in err) return isPgCode((err as { cause: unknown }).cause, code);
  return false;
}

export default router;
