import { Router, type IRouter } from "express";
import { eq, count, and, gte } from "drizzle-orm";
import {
  db,
  tenantsTable,
  insertTenantSchema,
  updateTenantSchema,
  agentConfigsTable,
  businessProfilesTable,
  leadsTable,
  planAssignmentLogTable,
  produtosCatalogoTable,
  conversationsTable,
  dealsTable,
  intelligenceAnalysisLogTable,
  agentActionsLogTable,
} from "@workspace/db";
import { requireRole, requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import { encrypt } from "../lib/crypto.js";

const router: IRouter = Router();

router.get("/tenants", async (req, res) => {
  const tenants = await db.select().from(tenantsTable).orderBy(tenantsTable.createdAt);
  res.json(tenants);
});

router.post("/tenants", requireRole("super_admin"), async (req, res) => {
  const parsed = insertTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const insertData = {
    ...parsed.data,
  };

  try {
    const [tenant] = await db.insert(tenantsTable).values(insertData).returning();
    res.status(201).json(tenant);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Slug already exists" });
      return;
    }
    throw err;
  }
});

router.get("/tenants/:id", requireSameTenanOrSuperAdmin(), async (req, res) => {
  const [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, String(req.params.id)));

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json(tenant);
});

router.patch("/tenants/:id", requireSameTenanOrSuperAdmin(), async (req, res) => {
  const parsed = updateTenantSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const ADMIN_ONLY_FIELDS = ["analysisStalenessHours", "analysisMessageThreshold", "maxAnalysesPerHour"] as const;
  const hasAdminOnlyField = ADMIN_ONLY_FIELDS.some((f) => f in parsed.data && parsed.data[f] !== undefined);
  if (hasAdminOnlyField && req.user?.platformRole === "member") {
    res.status(403).json({ error: "Only admins can update analysis thresholds" });
    return;
  }

  const updateData = {
    ...parsed.data,
    updatedAt: new Date(),
  };

  try {
    const [tenant] = await db
      .update(tenantsTable)
      .set(updateData)
      .where(eq(tenantsTable.id, String(req.params.id)))
      .returning();

    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    res.json(tenant);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Slug already exists" });
      return;
    }
    throw err;
  }
});

// ── Integration Settings ──────────────────────────────────────────────────────

router.get("/tenants/:id/integration-settings", requireSameTenanOrSuperAdmin(), async (req, res) => {
  const [tenant] = await db
    .select({
      webhookEstoqueUrl: tenantsTable.webhookEstoqueUrl,
      apiKeyEstoque: tenantsTable.apiKeyEstoque,
      integrationType: tenantsTable.integrationType,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, String(req.params.id)));

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json({
    webhookEstoqueUrl: tenant.webhookEstoqueUrl ?? null,
    apiKeyEstoque: tenant.apiKeyEstoque ?? null,
    integrationType: tenant.integrationType ?? null,
  });
});

router.patch("/tenants/:id/integration-settings", requireSameTenanOrSuperAdmin(), async (req, res) => {
  const { webhookEstoqueUrl, integrationType } = req.body as { webhookEstoqueUrl?: string | null; integrationType?: "n8n" | "api" | null };

  const [tenant] = await db
    .update(tenantsTable)
    .set({
      webhookEstoqueUrl: webhookEstoqueUrl !== undefined ? (webhookEstoqueUrl || null) : undefined,
      integrationType: integrationType !== undefined ? integrationType : undefined,
      updatedAt: new Date(),
    })
    .where(eq(tenantsTable.id, String(req.params.id)))
    .returning({
      webhookEstoqueUrl: tenantsTable.webhookEstoqueUrl,
      apiKeyEstoque: tenantsTable.apiKeyEstoque,
      integrationType: tenantsTable.integrationType,
    });

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json({
    webhookEstoqueUrl: tenant.webhookEstoqueUrl ?? null,
    apiKeyEstoque: tenant.apiKeyEstoque ?? null,
    integrationType: tenant.integrationType ?? null,
  });
});

router.post("/tenants/:id/integration-settings/regenerate-key", requireSameTenanOrSuperAdmin(), async (req, res) => {
  const newKey = `vak_${crypto.randomUUID().replace(/-/g, "")}`;

  const [tenant] = await db
    .update(tenantsTable)
    .set({ apiKeyEstoque: newKey, updatedAt: new Date() })
    .where(eq(tenantsTable.id, String(req.params.id)))
    .returning({
      webhookEstoqueUrl: tenantsTable.webhookEstoqueUrl,
      apiKeyEstoque: tenantsTable.apiKeyEstoque,
      integrationType: tenantsTable.integrationType,
    });

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.json({
    webhookEstoqueUrl: tenant.webhookEstoqueUrl ?? null,
    apiKeyEstoque: tenant.apiKeyEstoque ?? null,
    integrationType: tenant.integrationType ?? null,
  });
});

router.get("/tenants/:id/setup-status", requireSameTenanOrSuperAdmin(), async (req, res) => {
  const tenantId = String(req.params.id);

  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

  const [agentConfig] = await db
    .select({
      id: agentConfigsTable.id,
      setupCompletedAt: agentConfigsTable.setupCompletedAt,
      autonomyEnabledAt: agentConfigsTable.autonomyEnabledAt,
      zapiInstanceId: agentConfigsTable.zapiInstanceId,
      zapiToken: agentConfigsTable.zapiToken,
      zapiClientToken: agentConfigsTable.zapiClientToken,
      instagramPageId: agentConfigsTable.instagramPageId,
      instagramPageAccessToken: agentConfigsTable.instagramPageAccessToken,
      webhookSecret: agentConfigsTable.webhookSecret,
    })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));
  const [businessProfile] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId));
  const [leadCountRow] = await db.select({ value: count() }).from(leadsTable).where(eq(leadsTable.tenantId, tenantId));

  const onboardingComplete    = !!tenant.setupCompletedAt;
  const businessProfileConfigured = !!businessProfile;
  const productsConfigured    = Array.isArray(businessProfile?.produtos) && (businessProfile.produtos as unknown[]).length > 0;
  const agentConfigured       = !!agentConfig?.setupCompletedAt;
  const autonomyEnabled       = !!agentConfig?.autonomyEnabledAt;
  const whatsappConnected     = !!(agentConfig?.zapiInstanceId && agentConfig?.zapiToken && agentConfig?.zapiClientToken);
  const instagramConnected    = !!(agentConfig?.instagramPageId && agentConfig?.instagramPageAccessToken);
  const webhookConfigured     = !!agentConfig?.webhookSecret;
  const firstLeadAdded        = (leadCountRow?.value ?? 0) > 0;

  const checks = [
    onboardingComplete,
    businessProfileConfigured,
    productsConfigured,
    agentConfigured,
    autonomyEnabled,
    whatsappConnected,
    instagramConnected,
    webhookConfigured,
    firstLeadAdded,
  ];
  const completedSteps = checks.filter(Boolean).length;
  const totalSteps = checks.length;

  res.json({
    onboardingComplete,
    businessProfileConfigured,
    productsConfigured,
    agentConfigured,
    autonomyEnabled,
    whatsappConnected,
    instagramConnected,
    webhookConfigured,
    firstLeadAdded,
    completedSteps,
    totalSteps,
    percentComplete: Math.round((completedSteps / totalSteps) * 100),
  });
});

router.delete("/tenants/:id", requireRole("super_admin"), async (req, res) => {
  const [deleted] = await db
    .delete(tenantsTable)
    .where(eq(tenantsTable.id, String(req.params.id)))
    .returning({ id: tenantsTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  res.status(204).send();
});

// ── POST /admin/tenants/demo ────────────────────────────────────────────
// Cria um tenant de demonstração com expiração de 5 dias e popula com dados fake

router.post("/admin/tenants/demo", requireRole("super_admin"), async (req, res) => {
  const { nomeEmpresa, emailContato } = req.body;
  if (!nomeEmpresa || typeof nomeEmpresa !== "string") {
    res.status(422).json({ error: "nomeEmpresa é obrigatório" });
    return;
  }

  const slugBase = nomeEmpresa.toLowerCase().replace(/[^a-z0-9]/g, "-").substring(0, 30);
  const slug = `${slugBase}-${Math.random().toString(36).substring(2, 8)}`;
  const demoExpiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

  const [tenant] = await db
    .insert(tenantsTable)
    .values({
      name: nomeEmpresa,
      slug,
      status: "active",
      isDemo: true,
      demoExpiresAt,
      planId: null,
    })
    .returning();

  // Popular com dados fake
  await seedDemoData(tenant.id);

  res.status(201).json({
    tenant,
    demoExpiresAt,
    loginUrl: `/login?tenant=${tenant.slug}`,
  });
});

// ── Seed de dados fake para demo ──────────────────────────────────────────

export async function seedDemoData(tenantId: string) {
  // 1. Produtos fake
  const produtosFake = [
    { nome: "Implantação Sistema Premium", sku: "DEMO-001", descricao: "Implantação completa", precoBase: "5000", unidade: "unidade" },
    { nome: "Plano Mensal Growth", sku: "DEMO-002", descricao: "Plano mensal", precoBase: "1000", unidade: "mês" },
    { nome: "Consultoria de Onboarding", sku: "DEMO-003", descricao: "Onboarding 1:1", precoBase: "1500", unidade: "unidade" },
  ];
  await db.insert(produtosCatalogoTable).values(
    produtosFake.map((p) => ({ ...p, tenantId }))
  );

  // 2. Leads fake
  const nomesFake = [
    "Construtora Horizonte", "Distribuidora Sul", "Mercado Bom Preço",
    "Auto Peças Central", "Confecções Maria",
  ];
  const statuses = ["novo", "qualificado", "proposta", "negociacao", "ganho"] as const;
  const scores = [45, 72, 88, 65, 95];
  const churnRisks = [20, 15, 5, 60, 2];
  const leadsFake = nomesFake.map((nome, i) => ({
    tenantId,
    nome: `Contato ${nome}`,
    empresa: nome,
    telefone: `5548999${String(900 + i).padStart(4, "0")}`,
    email: `contato${i}@demo.com`,
    status: statuses[i],
    score: scores[i],
    churnRisk: churnRisks[i],
  }));
  const leadsCriados = await db.insert(leadsTable).values(leadsFake).returning();

  // 3. Conversas fake
  await db.insert(conversationsTable).values(
    leadsCriados.map((l) => ({
      tenantId,
      leadId: l.id,
      channel: "whatsapp" as const,
      status: "aberta" as const,
      ultimaMensagemEm: new Date(),
    }))
  );

  // 4. Deals fake
  const dealsFake = leadsCriados.slice(0, 3).map((lead, i) => ({
    tenantId,
    leadId: lead.id,
    titulo: `Proposta — ${lead.empresa}`,
    valor: String([5000, 8500, 12000][i]),
    etapa: ("proposta" as const),
  }));
  await db.insert(dealsTable).values(dealsFake);

  // 5. Marcar como seedado
  await db
    .update(tenantsTable)
    .set({ demoSeeded: true, updatedAt: new Date() })
    .where(eq(tenantsTable.id, tenantId));
}

// ── GET /tenant/:id/uso-ia ───────────────────────────────────────────────
router.get("/tenants/:id/uso-ia", requireSameTenanOrSuperAdmin(), async (req, res) => {
  const tenantId = String(req.params.id);

  const [tenant] = await db
    .select({
      monthlyTokenLimit: tenantsTable.monthlyTokenLimit,
      tokensUsedCurrentMonth: tenantsTable.tokensUsedCurrentMonth,
      dailyMessageLimit: tenantsTable.dailyMessageLimit,
      messagesSentToday: tenantsTable.messagesSentToday,
      maxAnalysesPerHour: tenantsTable.maxAnalysesPerHour,
      planId: tenantsTable.planId,
      status: tenantsTable.status,
      isDemo: tenantsTable.isDemo,
      demoExpiresAt: tenantsTable.demoExpiresAt,
      tokenCredits: tenantsTable.tokenCredits,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  // Contagens de análises no mês
  const analysesCount = await db
    .select({ count: count() })
    .from(intelligenceAnalysisLogTable)
    .where(
      and(
        eq(intelligenceAnalysisLogTable.tenantId, tenantId),
        gte(intelligenceAnalysisLogTable.createdAt, new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
      )
    )
    .then((rows) => rows[0]?.count ?? 0);

  // Contagens de agent_actions no dia
  const messagesToday = await db
    .select({ count: count() })
    .from(agentActionsLogTable)
    .where(
      and(
        eq(agentActionsLogTable.tenantId, tenantId),
        gte(agentActionsLogTable.createdAt, new Date(Date.now() - 24 * 60 * 60 * 1000))
      )
    )
    .then((rows) => rows[0]?.count ?? 0);

  res.json({
    tenantId,
    status: tenant.status,
    isDemo: tenant.isDemo,
    demoExpiresAt: tenant.demoExpiresAt,
    planId: tenant.planId,
    tokenCredits: tenant.tokenCredits,
    limits: {
      monthlyTokenLimit: tenant.monthlyTokenLimit,
      dailyMessageLimit: tenant.dailyMessageLimit,
      maxAnalysesPerHour: tenant.maxAnalysesPerHour,
    },
    usage: {
      tokensUsedCurrentMonth: tenant.tokensUsedCurrentMonth ?? 0,
      messagesSentToday: tenant.messagesSentToday ?? 0,
      analysesThisMonth: analysesCount,
      messagesSentTodayFromLog: messagesToday,
    },
  });
});

// ── PATCH /tenants/:id/openai-key ───────────────────────────────────────────────
// Configura a chave OpenAI própria do tenant (BYOK). Requer super_admin ou admin do tenant.

router.patch("/tenants/:id/openai-key", requireSameTenanOrSuperAdmin(), async (req, res) => {
  const tenantId = String(req.params.id);
  const { apiKey } = req.body;

  if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith("sk-")) {
    res.status(422).json({ error: "apiKey inválida. Deve ser uma string começando com 'sk-'." });
    return;
  }

  try {
    const encryptedKey = encrypt(apiKey);
    const [tenant] = await db
      .update(tenantsTable)
      .set({
        openaiApiKeyEncrypted: encryptedKey,
        openaiKeyStatus: "ativo",
        openaiKeyConfiguredAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(tenantsTable.id, tenantId))
      .returning({
        id: tenantsTable.id,
        openaiKeyStatus: tenantsTable.openaiKeyStatus,
        openaiKeyConfiguredAt: tenantsTable.openaiKeyConfiguredAt,
      });

    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    res.json({
      tenantId: tenant.id,
      openaiKeyStatus: tenant.openaiKeyStatus,
      configuredAt: tenant.openaiKeyConfiguredAt,
      message: "Chave OpenAI configurada com sucesso.",
    });
  } catch (err) {
    req.log?.warn({ err, tenantId }, "openai-key: failed to encrypt/store key");
    res.status(500).json({ error: "Falha ao criptografar ou salvar a chave OpenAI" });
  }
});

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

export default router;
