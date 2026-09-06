import { Router, type IRouter } from "express";
import { eq, count, and, gte, or } from "drizzle-orm";
import bcrypt from "bcryptjs";
import {
  db,
  tenantsTable,
  usersTable,
  insertTenantSchema,
  updateTenantSchema,
  agentConfigsTable,
  businessProfilesTable,
  leadsTable,
  planAssignmentLogTable,
  produtosCatalogoTable,
  conversationsTable,
  brandProgramsTable,
  dealsTable,
  intelligenceAnalysisLogTable,
  agentActionsLogTable,
  propostasTable,
  agendasTable,
  activitiesTable,
  messagesTable,
  inventoryItemsTable,
  customerIntelligenceTable,
  agentTasksTable,
  onboardingProgressTable,
  agentDefaultsTable,
  tenantAgentConfigsTable,
  knowledgeBaseTable,
  plansTable,
} from "@workspace/db";
import { requireRole, requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import { encrypt } from "../lib/crypto.js";
import { sendWelcomeEmail } from "../lib/email.js";
import { generateSubdomainSlug } from "../lib/subdomain.js";
import { createCustomHostname } from "../lib/cloudflare.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { getActiveCatalogCount } from "../lib/catalog-readiness.js";
import { parseCsvLine, normalizeCsvHeader } from "./produtos_catalogo.js";

const router: IRouter = Router();

/**
 * Compatibilidade com formulários antigos que enviavam o slug do plano
 * (ex.: "enterprise") no campo planId. A persistência continua usando o UUID.
 */
async function resolveActivePlanId(planIdOrSlug: string): Promise<string | null> {
  const [plan] = await db
    .select({ id: plansTable.id })
    .from(plansTable)
    .where(and(
      or(eq(plansTable.id, planIdOrSlug), eq(plansTable.slug, planIdOrSlug)),
      eq(plansTable.isActive, true),
    ))
    .limit(1);
  return plan?.id ?? null;
}

router.get("/tenants", async (req, res) => {
  const tenants = await db.select().from(tenantsTable).orderBy(tenantsTable.createdAt);
  res.json(tenants);
});

// GET /brand-programs — programas de marca disponíveis (pro seletor ao criar/editar tenant)
router.get("/brand-programs", requireRole("super_admin"), async (_req, res) => {
  const programs = await db.select().from(brandProgramsTable);
  res.json(programs);
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
    if (insertData.planId) {
      const resolvedPlanId = await resolveActivePlanId(insertData.planId);
      if (!resolvedPlanId) {
        res.status(422).json({ error: "Plano selecionado não existe ou está inativo" });
        return;
      }
      insertData.planId = resolvedPlanId;
    }

    const [tenant] = await db.insert(tenantsTable).values(insertData).returning();
    await db.insert(onboardingProgressTable).values({ tenantId: tenant.id }).onConflictDoNothing();

    let finalTenant = tenant;
    if (tenant.programaMarca) {
      const [program] = await db.select().from(brandProgramsTable).where(eq(brandProgramsTable.id, tenant.programaMarca));
      if (program) {
        const [updated] = await db.update(tenantsTable)
          .set({
            ...(program.logoUrl ? { logoUrl: program.logoUrl } : {}),
            ...(program.corPrimaria ? { corPrimaria: program.corPrimaria } : {}),
            whiteLabelCompleto: program.whiteLabelCompleto,
          })
          .where(eq(tenantsTable.id, tenant.id))
          .returning();
        finalTenant = updated ?? tenant;
      }
    }

    res.status(201).json(finalTenant);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Slug already exists" });
      return;
    }
    throw err;
  }
});

router.get("/tenants/:id", requireSameTenanOrSuperAdmin(), async (req, res) => {
  let [tenant] = await db
    .select()
    .from(tenantsTable)
    .where(eq(tenantsTable.id, String(req.params.id)));

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  if (!tenant.vertical) {
    const [profile] = await db
      .select({ vertical: businessProfilesTable.vertical })
      .from(businessProfilesTable)
      .where(eq(businessProfilesTable.tenantId, tenant.id))
      .limit(1);
    if (profile?.vertical) {
      const [repairedTenant] = await db
        .update(tenantsTable)
        .set({ vertical: profile.vertical, segmento: profile.vertical, updatedAt: new Date() })
        .where(eq(tenantsTable.id, tenant.id))
        .returning();
      tenant = repairedTenant ?? tenant;
    }
  }

  let planSlug: string | null = null;
  if (tenant.planId) {
    const [plan] = await db.select({ slug: plansTable.slug }).from(plansTable).where(eq(plansTable.id, tenant.planId));
    planSlug = plan?.slug ?? null;
  }

  res.json({ ...tenant, planSlug });
});

router.get("/superadmin/tenants/:id/agents", requireRole("super_admin"), async (req, res) => {
  const tenantId = String(req.params.id);
  const [tenant] = await db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

  const [defaults, tenantConfigs, knowledge] = await Promise.all([
    db.select().from(agentDefaultsTable).where(eq(agentDefaultsTable.ativo, true)),
    db.select().from(tenantAgentConfigsTable).where(eq(tenantAgentConfigsTable.tenantId, tenantId)),
    db.select().from(knowledgeBaseTable).where(eq(knowledgeBaseTable.tenantId, tenantId)),
  ]);
  const configMap = new Map(tenantConfigs.map((config) => [config.agentKey, config]));
  const knowledgeMap = new Map(knowledge.map((item) => [item.id, item]));

  res.json({
    agents: defaults.map((agent) => {
      const config = configMap.get(agent.agentKey);
      const parameters = (config?.parametros ?? {}) as Record<string, unknown>;
      const attachments = Array.isArray(parameters["attachments"]) ? parameters["attachments"] : [];
      const knowledgeItems = (config?.knowledgeBaseIds ?? [])
        .map((knowledgeId) => knowledgeMap.get(knowledgeId))
        .filter(Boolean);
      return {
        agentKey: agent.agentKey,
        nome: agent.nome,
        descricao: agent.descricao ?? "",
        categoria: agent.categoria ?? "",
        ativo: config?.ativo ?? false,
        nomePerfil: config?.nomePerfil ?? null,
        tom: config?.tom ?? "profissional",
        restricoes: config?.restricoes ?? null,
        systemPromptBase: agent.systemPromptBase,
        systemPromptCustom: config?.systemPromptCustom ?? null,
        attachments,
        knowledgeItems,
      };
    }),
    knowledgeBase: knowledge,
  });
});

router.get("/superadmin/tenants/:id/zapi-status", requireRole("super_admin"), async (req, res) => {
  const tenantId = String(req.params.id);
  const [config] = await db
    .select({
      zapiInstanceId: agentConfigsTable.zapiInstanceId,
      zapiToken: agentConfigsTable.zapiToken,
      zapiClientToken: agentConfigsTable.zapiClientToken,
    })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId))
    .limit(1);

  const credentials = {
    instanceId: Boolean(config?.zapiInstanceId),
    token: Boolean(config?.zapiToken),
    clientToken: Boolean(config?.zapiClientToken),
  };
  const configured = credentials.instanceId && credentials.token && credentials.clientToken;
  if (!configured) {
    return res.json({ configured: false, connected: false, credentials });
  }

  try {
    const response = await fetch(
      `https://api.z-api.io/instances/${config!.zapiInstanceId}/token/${config!.zapiToken}/status`,
      { headers: { "Client-Token": config!.zapiClientToken! } },
    );
    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    return res.json({
      configured: true,
      connected: response.ok && data.connected === true,
      session: data.session === true,
      smartphoneConnected: data.smartphoneConnected === true,
      credentials,
      providerStatus: response.status,
    });
  } catch (error) {
    req.log.error({ error, tenantId }, "superadmin tenant zapi status failed");
    return res.status(502).json({ configured: true, connected: false, credentials, error: "Falha ao consultar a Z-API" });
  }
});

router.patch("/superadmin/tenants/:id/zapi-credentials", requireRole("super_admin"), async (req, res) => {
  const tenantId = String(req.params.id);
  const instanceId = typeof req.body?.instanceId === "string" ? req.body.instanceId.trim() : undefined;
  const token = typeof req.body?.token === "string" ? req.body.token.trim() : undefined;
  const clientToken = typeof req.body?.clientToken === "string" ? req.body.clientToken.trim() : undefined;

  if ([instanceId, token, clientToken].every((value) => value === undefined)) {
    return res.status(422).json({ error: "Informe ao menos uma credencial para atualizar." });
  }
  if ([instanceId, token, clientToken].some((value) => value !== undefined && value.length < 3)) {
    return res.status(422).json({ error: "Credencial inválida." });
  }

  const [tenant] = await db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) return res.status(404).json({ error: "Tenant não encontrado." });

  const update: Partial<typeof agentConfigsTable.$inferInsert> = { updatedAt: new Date() };
  if (instanceId !== undefined) update.zapiInstanceId = instanceId;
  if (token !== undefined) update.zapiToken = token;
  if (clientToken !== undefined) update.zapiClientToken = clientToken;

  await db
    .insert(agentConfigsTable)
    .values({ tenantId, ...update })
    .onConflictDoUpdate({ target: agentConfigsTable.tenantId, set: update });

  req.log.info({ tenantId, fields: Object.keys(update).filter((field) => field !== "updatedAt") }, "superadmin updated tenant zapi credentials");
  return res.json({ ok: true });
});

router.post("/superadmin/tenants/:id/zapi-test", requireRole("super_admin"), async (req, res) => {
  const tenantId = String(req.params.id);
  const phone = String(req.body?.phone ?? "").replace(/\D/g, "");
  const message = String(req.body?.message ?? "").trim();
  if (phone.length < 10 || phone.length > 15) {
    return res.status(422).json({ error: "Informe um telefone válido com DDD." });
  }
  if (!message || message.length > 500) {
    return res.status(422).json({ error: "A mensagem deve ter entre 1 e 500 caracteres." });
  }

  const [tenant] = await db.select({ id: tenantsTable.id }).from(tenantsTable).where(eq(tenantsTable.id, tenantId));
  if (!tenant) return res.status(404).json({ error: "Tenant não encontrado." });

  try {
    await sendDirectWhatsAppMessage(tenantId, phone, message, req.log);
    return res.json({ ok: true, phone });
  } catch (error) {
    req.log.error({ error, tenantId }, "superadmin tenant zapi test failed");
    return res.status(502).json({ error: error instanceof Error ? error.message : "Falha ao enviar mensagem de teste." });
  }
});

router.patch("/superadmin/tenants/:id/praca-ai", requireRole("super_admin"), async (req, res) => {
  const tenantId = String(req.params.id);
  const enabled = req.body?.enabled;

  if (typeof enabled !== "boolean") {
    return res.status(422).json({ error: "O campo enabled deve ser booleano." });
  }

  const [tenant] = await db
    .update(tenantsTable)
    .set({ vendeNoPracaAi: enabled, updatedAt: new Date() })
    .where(eq(tenantsTable.id, tenantId))
    .returning({
      id: tenantsTable.id,
      vendeNoPracaAi: tenantsTable.vendeNoPracaAi,
      comissaoPracaAiPercentual: tenantsTable.comissaoPracaAiPercentual,
    });

  if (!tenant) {
    return res.status(404).json({ error: "Tenant não encontrado." });
  }

  req.log.info(
    { tenantId, enabled, actorId: req.user?.sub },
    "superadmin updated tenant Praça.ai access",
  );

  return res.json(tenant);
});

router.patch("/tenants/:id", requireRole("super_admin", "tenant_admin"), requireSameTenanOrSuperAdmin(), async (req, res) => {
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

  const PRACA_AI_PLATFORM_FIELDS = ["comissaoPracaAiPercentual", "vendeNoPracaAi"] as const;
  const hasPracaAiPlatformField = PRACA_AI_PLATFORM_FIELDS.some(
    (field) => field in parsed.data && parsed.data[field] !== undefined,
  );
  if (hasPracaAiPlatformField && req.user?.platformRole !== "super_admin") {
    res.status(403).json({ error: "Só o admin da plataforma pode alterar a liberação ou comissão do Praça.ai" });
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

    let finalTenant = tenant;
    if ("programaMarca" in parsed.data && parsed.data.programaMarca) {
      const [program] = await db.select().from(brandProgramsTable).where(eq(brandProgramsTable.id, parsed.data.programaMarca));
      if (program && (program.logoUrl || program.corPrimaria)) {
        const [updated] = await db.update(tenantsTable)
          .set({
            ...(program.logoUrl ? { logoUrl: program.logoUrl } : {}),
            ...(program.corPrimaria ? { corPrimaria: program.corPrimaria } : {}),
            whiteLabelCompleto: program.whiteLabelCompleto,
          })
          .where(eq(tenantsTable.id, tenant.id))
          .returning();
        finalTenant = updated ?? tenant;
      }
    }

    res.json(finalTenant);
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "Slug already exists" });
      return;
    }
    throw err;
  }
});

router.get("/tenants/:id/integration-settings", requireRole("super_admin", "tenant_admin"), requireSameTenanOrSuperAdmin(), async (req, res) => {
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

router.patch("/tenants/:id/integration-settings", requireRole("super_admin", "tenant_admin"), requireSameTenanOrSuperAdmin(), async (req, res) => {
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
      metaPhoneNumberId: agentConfigsTable.metaPhoneNumberId,
      metaAccessToken: agentConfigsTable.metaAccessToken,
      evolutionConnected: agentConfigsTable.evolutionConnected,
      instagramPageId: agentConfigsTable.instagramPageId,
      instagramPageAccessToken: agentConfigsTable.instagramPageAccessToken,
      webhookSecret: agentConfigsTable.webhookSecret,
    })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));
  const [businessProfile] = await db.select().from(businessProfilesTable).where(eq(businessProfilesTable.tenantId, tenantId));
  const [leadCountRow] = await db.select({ value: count() }).from(leadsTable).where(eq(leadsTable.tenantId, tenantId));
  const catalogCount = await getActiveCatalogCount(tenantId);

  const onboardingComplete    = !!tenant.setupCompletedAt;
  const businessProfileConfigured = !!businessProfile;
  const productsConfigured    = catalogCount > 0;
  const agentConfigured       = !!agentConfig?.setupCompletedAt;
  const autonomyEnabled       = !!agentConfig?.autonomyEnabledAt;
  const whatsappConnected     = !!((agentConfig?.metaPhoneNumberId && agentConfig?.metaAccessToken) || agentConfig?.evolutionConnected);
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

  await db.insert(onboardingProgressTable).values({ tenantId: tenant.id }).onConflictDoNothing();

  res.status(201).json({
    tenant,
    demoExpiresAt,
    loginUrl: `/login?tenant=${tenant.slug}`,
  });
});

export async function seedDemoData(tenantId: string) {
  const now = new Date();

  const produtosFake = [
    { nome: "Implantação Sistema Premium", sku: "DEMO-001", descricao: "Implantação completa do CRM", precoBase: "5000", unidade: "unidade" },
    { nome: "Plano Mensal Growth", sku: "DEMO-002", descricao: "Licença mensal", precoBase: "1000", unidade: "mês" },
    { nome: "Consultoria de Onboarding", sku: "DEMO-003", descricao: "Onboarding 1:1", precoBase: "1500", unidade: "unidade" },
    { nome: "Integração WhatsApp", sku: "DEMO-004", descricao: "Conector Z-API", precoBase: "300", unidade: "mês" },
    { nome: "Integração Instagram", sku: "DEMO-005", descricao: "Conector Instagram DM", precoBase: "300", unidade: "mês" },
    { nome: "Treinamento Equipe", sku: "DEMO-006", descricao: "Treinamento 4h", precoBase: "2000", unidade: "unidade" },
    { nome: "Suporte Prioritário", sku: "DEMO-007", descricao: "Atendimento 24h", precoBase: "500", unidade: "mês" },
    { nome: "Relatórios Avançados", sku: "DEMO-008", descricao: "Dashboard BI", precoBase: "400", unidade: "mês" },
    { nome: "IA Extra", sku: "DEMO-009", descricao: "Pacote 100k tokens", precoBase: "200", unidade: "pacote" },
    { nome: "Customização", sku: "DEMO-010", descricao: "Desenvolvimento sob medida", precoBase: "8000", unidade: "projeto" },
  ];
  await db.insert(produtosCatalogoTable).values(
    produtosFake.map((p) => ({ ...p, tenantId }))
  );

  const leadDefs = [
    { nome: "Construtora Horizonte", status: "novo", score: 45, churnRisk: 20, empresa: "Construtora Horizonte", telefone: "5548999900001", email: "contato1@demo.com", tipo: "cliente" as const },
    { nome: "Distribuidora Sul", status: "qualificado", score: 72, churnRisk: 15, empresa: "Distribuidora Sul", telefone: "5548999900002", email: "contato2@demo.com", tipo: "cliente" as const },
    { nome: "Mercado Bom Preço", status: "proposta", score: 88, churnRisk: 5, empresa: "Mercado Bom Preço", telefone: "5548999900003", email: "contato3@demo.com", tipo: "cliente" as const },
    { nome: "Auto Peças Central", status: "negociacao", score: 65, churnRisk: 60, empresa: "Auto Peças Central", telefone: "5548999900004", email: "contato4@demo.com", tipo: "cliente" as const },
    { nome: "Confecções Maria", status: "ganho", score: 95, churnRisk: 2, empresa: "Confecções Maria", telefone: "5548999900005", email: "contato5@demo.com", tipo: "cliente" as const },
    { nome: "Padaria do João", status: "novo", score: 30, churnRisk: 80, empresa: "Padaria do João", telefone: "5548999900006", email: "contato6@demo.com", tipo: "prospect" as const },
    { nome: "Loja de Eletrônicos", status: "qualificado", score: 55, churnRisk: 10, empresa: "Loja de Eletrônicos", telefone: "5548999900007", email: "contato7@demo.com", tipo: "prospect" as const },
    { nome: "Clínica Saúde", status: "proposta", score: 78, churnRisk: 25, empresa: "Clínica Saúde", telefone: "5548999900008", email: "contato8@demo.com", tipo: "prospect" as const },
    { nome: "Escola Futuro", status: "negociacao", score: 82, churnRisk: 8, empresa: "Escola Futuro", telefone: "5548999900009", email: "contato9@demo.com", tipo: "prospect" as const },
    { nome: "Restaurante Sabor", status: "ganho", score: 90, churnRisk: 3, empresa: "Restaurante Sabor", telefone: "5548999900010", email: "contato10@demo.com", tipo: "prospect" as const },
    { nome: "Farmácia Vida", status: "novo", score: 40, churnRisk: 45, empresa: "Farmácia Vida", telefone: "5548999900011", email: "contato11@demo.com", tipo: "cliente" as const },
    { nome: "Oficina Mecânica", status: "qualificado", score: 60, churnRisk: 20, empresa: "Oficina Mecânica", telefone: "5548999900012", email: "contato12@demo.com", tipo: "cliente" as const },
    { nome: "Imobiliária Prime", status: "proposta", score: 85, churnRisk: 12, empresa: "Imobiliária Prime", telefone: "5548999900013", email: "contato13@demo.com", tipo: "prospect" as const },
    { nome: "Transporte Rápido", status: "negociacao", score: 70, churnRisk: 35, empresa: "Transporte Rápido", telefone: "5548999900014", email: "contato14@demo.com", tipo: "prospect" as const },
    { nome: "Lavanderia Clean", status: "ganho", score: 92, churnRisk: 5, empresa: "Lavanderia Clean", telefone: "5548999900015", email: "contato15@demo.com", tipo: "prospect" as const },
    { nome: "Pet Shop Amigo", status: "novo", score: 50, churnRisk: 70, empresa: "Pet Shop Amigo", telefone: "5548999900016", email: "contato16@demo.com", tipo: "prospect" as const },
    { nome: "Academia Fitness", status: "qualificado", score: 68, churnRisk: 18, empresa: "Academia Fitness", telefone: "5548999900017", email: "contato17@demo.com", tipo: "prospect" as const },
    { nome: "Drogaria Popular", status: "proposta", score: 75, churnRisk: 22, empresa: "Drogaria Popular", telefone: "5548999900018", email: "contato18@demo.com", tipo: "prospect" as const },
    { nome: "Marmoraria Arte", status: "negociacao", score: 80, churnRisk: 15, empresa: "Marmoraria Arte", telefone: "5548999900019", email: "contato19@demo.com", tipo: "prospect" as const },
    { nome: "Gráfica Express", status: "ganho", score: 93, churnRisk: 4, empresa: "Gráfica Express", telefone: "5548999900020", email: "contato20@demo.com", tipo: "prospect" as const },
  ];
  const leadsFake = leadDefs.map((l) => ({
    tenantId,
    nome: l.nome,
    empresa: l.empresa,
    telefone: l.telefone,
    email: l.email,
    status: l.status,
    score: l.score,
    churnRisk: l.churnRisk,
    tipo: l.tipo,
    source: "demo" as const,
  }));
  const leadsCriados = await db.insert(leadsTable).values(leadsFake).returning();

  const ciFake = leadsCriados.map((l, i) => ({
    tenantId,
    leadId: l.id,
    journeyStage: ["awareness", "consideration", "decision", "retention", "advocacy"][i % 5]!,
    intentAnalysis: `Lead demonstra interesse em ${["CRM", "automação", "vendas", "suporte", "análise"][i % 5]!}.`,
    goalAnalysis: `Objetivo: ${["aumentar vendas", "reduzir churn", "automatizar processos", "melhorar atendimento", "ganhar insights"][i % 5]!}.`,
    nextBestAction: ["Agendar demo", "Enviar proposta", "Ligar follow-up", "Enviar case study", "Oferecer desconto"][i % 5]!,
    painSignals: [`Dor: ${["falta de tempo", "processos manuais", "dados dispersos", "atendimento lento", "falta de visibilidade"][i % 5]!}`],
    personaFit: ["ideal", "bom", "regular", "ideal", "bom"][i % 5]!,
    score: leadDefs[i]!.score,
    churnRisk: leadDefs[i]!.churnRisk,
  }));
  await db.insert(customerIntelligenceTable).values(ciFake);

  const convLeads = leadsCriados.slice(0, 8);
  const convsCriadas = await db.insert(conversationsTable).values(
    convLeads.map((l, i) => ({
      tenantId,
      leadId: l.id,
      channel: i % 2 === 0 ? "whatsapp" : "instagram",
      status: "open",
      ultimaMensagemEm: new Date(now.getTime() - i * 3600000),
    }))
  ).returning();

  const mensagensFake = [];
  for (const conv of convsCriadas) {
    const lead = convLeads.find((l) => l.id === conv.leadId)!;
    mensagensFake.push(
      { tenantId, conversationId: conv.id, leadId: conv.leadId!, conteudo: `Olá, sou da ${lead.empresa}. Gostaria de saber mais sobre o sistema.`, direcao: "entrada" as const, enviadoPor: "lead" as const, canal: conv.channel, tipoConteudo: "texto" as const, status: "entregue" as const },
      { tenantId, conversationId: conv.id, leadId: conv.leadId!, conteudo: "Olá! Claro, vou te ajudar. Qual o tamanho da sua equipe?", direcao: "saida" as const, enviadoPor: "humano" as const, canal: conv.channel, tipoConteudo: "texto" as const, status: "entregue" as const },
      { tenantId, conversationId: conv.id, leadId: conv.leadId!, conteudo: "Somos 12 pessoas. Precisamos de algo para gerenciar leads e vendas.", direcao: "entrada" as const, enviadoPor: "lead" as const, canal: conv.channel, tipoConteudo: "texto" as const, status: "entregue" as const },
    );
  }
  await db.insert(messagesTable).values(mensagensFake as any);

  const dealDefs = [
    { leadIdx: 0, titulo: "Proposta — Construtora Horizonte", valor: "5000", etapa: "novo" as const },
    { leadIdx: 1, titulo: "Proposta — Distribuidora Sul", valor: "8500", etapa: "qualificado" as const },
    { leadIdx: 2, titulo: "Proposta — Mercado Bom Preço", valor: "12000", etapa: "proposta" as const },
    { leadIdx: 3, titulo: "Proposta — Auto Peças Central", valor: "6500", etapa: "negociacao" as const },
    { leadIdx: 4, titulo: "Fechado — Confecções Maria", valor: "15000", etapa: "ganho" as const },
    { leadIdx: 5, titulo: "Proposta — Padaria do João", valor: "3000", etapa: "novo" as const },
    { leadIdx: 6, titulo: "Proposta — Loja de Eletrônicos", valor: "9000", etapa: "qualificado" as const },
    { leadIdx: 7, titulo: "Proposta — Clínica Saúde", valor: "7000", etapa: "proposta" as const },
    { leadIdx: 8, titulo: "Proposta — Escola Futuro", valor: "11000", etapa: "negociacao" as const },
    { leadIdx: 9, titulo: "Fechado — Restaurante Sabor", valor: "6000", etapa: "ganho" as const },
  ];
  const dealsFake = dealDefs.map((d) => ({
    tenantId,
    leadId: leadsCriados[d.leadIdx]!.id,
    titulo: d.titulo,
    valor: d.valor,
    etapa: d.etapa,
  }));
  await db.insert(dealsTable).values(dealsFake);

  const propostasFake = [
    { leadId: leadsCriados[2]!.id, titulo: "Orçamento Mensal — Mercado Bom Preço", valor: "12000", status: "enviada" as const, recorrente: true, itens: [{ nome: "Plano Mensal Growth", quantidade: 1, valorUnitario: 1000 }] },
    { leadId: leadsCriados[3]!.id, titulo: "Orçamento — Auto Peças Central", valor: "6500", status: "rascunho" as const, recorrente: false, itens: [{ nome: "Implantação Sistema Premium", quantidade: 1, valorUnitario: 5000 }, { nome: "Integração WhatsApp", quantidade: 1, valorUnitario: 300 }] },
    { leadId: leadsCriados[4]!.id, titulo: "Orçamento — Confecções Maria", valor: "15000", status: "aceita" as const, recorrente: false, itens: [{ nome: "Implantação Sistema Premium", quantidade: 1, valorUnitario: 5000 }, { nome: "Consultoria de Onboarding", quantidade: 1, valorUnitario: 1500 }, { nome: "Treinamento Equipe", quantidade: 1, valorUnitario: 2000 }, { nome: "Customização", quantidade: 1, valorUnitario: 8000 }] },
    { leadId: leadsCriados[7]!.id, titulo: "Orçamento — Clínica Saúde", valor: "7000", status: "enviada" as const, recorrente: false, itens: [{ nome: "Implantação Sistema Premium", quantidade: 1, valorUnitario: 5000 }, { nome: "Suporte Prioritário", quantidade: 1, valorUnitario: 500 }] },
    { leadId: leadsCriados[8]!.id, titulo: "Orçamento — Escola Futuro", valor: "11000", status: "pendente" as const, recorrente: false, itens: [{ nome: "Implantação Sistema Premium", quantidade: 1, valorUnitario: 5000 }, { nome: "Plano Mensal Growth", quantidade: 1, valorUnitario: 1000 }, { nome: "Relatórios Avançados", quantidade: 1, valorUnitario: 400 }] },
    { leadId: leadsCriados[13]!.id, titulo: "Orçamento — Imobiliária Prime", valor: "8500", status: "rejeitada" as const, recorrente: false, itens: [{ nome: "Implantação Sistema Premium", quantidade: 1, valorUnitario: 5000 }, { nome: "Consultoria de Onboarding", quantidade: 1, valorUnitario: 1500 }] },
  ];
  await db.insert(propostasTable).values(
    propostasFake.map((p) => ({ ...p, tenantId }))
  );

  const produtosInseridos = await db.select({ id: produtosCatalogoTable.id }).from(produtosCatalogoTable).where(eq(produtosCatalogoTable.tenantId, tenantId));
  const inventoryFake = [
    { produtoId: produtosInseridos[0]!.id, quantidadeAtual: "10", localizacao: "Serviço", unidade: "un" },
    { produtoId: produtosInseridos[1]!.id, quantidadeAtual: "100", localizacao: "Digital", unidade: "mês" },
    { produtoId: produtosInseridos[2]!.id, quantidadeAtual: "5", localizacao: "Serviço", unidade: "un" },
    { produtoId: produtosInseridos[5]!.id, quantidadeAtual: "8", localizacao: "Serviço", unidade: "un" },
    { produtoId: produtosInseridos[8]!.id, quantidadeAtual: "50", localizacao: "Digital", unidade: "pacote" },
  ];
  await db.insert(inventoryItemsTable).values(
    inventoryFake.map((i) => ({ ...i, tenantId }))
  );

  const [agenda] = await db.insert(agendasTable).values({
    tenantId,
    nome: "Agenda Demo",
    isDefault: true,
  }).returning();

  const atividadesFake = [
    { leadId: leadsCriados[0]!.id, tipo: "ligacao" as const, titulo: "Ligar para Construtora Horizonte", descricao: "Apresentar sistema", status: "pendente" as const, dataVencimento: new Date(now.getTime() + 86400000) },
    { leadId: leadsCriados[1]!.id, tipo: "whatsapp" as const, titulo: "Enviar catálogo Distribuidora Sul", descricao: "Enviar PDF", status: "concluida" as const, dataVencimento: new Date(now.getTime() - 86400000), concluidaEm: new Date(now.getTime() - 3600000) },
    { leadId: leadsCriados[2]!.id, tipo: "email" as const, titulo: "Enviar proposta Mercado Bom Preço", descricao: "Proposta formal", status: "pendente" as const, dataVencimento: new Date(now.getTime() + 172800000) },
    { leadId: leadsCriados[3]!.id, tipo: "visita" as const, titulo: "Visita Auto Peças Central", descricao: "Demo presencial", status: "pendente" as const, dataVencimento: new Date(now.getTime() + 432000000) },
    { leadId: leadsCriados[4]!.id, tipo: "reuniao" as const, titulo: "Reunião de kickoff Confecções Maria", descricao: "Início do projeto", status: "concluida" as const, dataVencimento: new Date(now.getTime() - 172800000), concluidaEm: new Date(now.getTime() - 86400000), dataHoraInicio: new Date(now.getTime() - 172800000), dataHoraFim: new Date(now.getTime() - 169200000), meetLink: "https://meet.google.com/demo-kickoff", googleEventId: "demo_event_1" },
    { leadId: leadsCriados[5]!.id, tipo: "tarefa" as const, titulo: "Preparar demo Padaria do João", descricao: "Configurar ambiente", status: "pendente" as const, dataVencimento: new Date(now.getTime() + 259200000) },
    { leadId: leadsCriados[6]!.id, tipo: "ligacao" as const, titulo: "Follow-up Loja de Eletrônicos", descricao: "Verificar interesse", status: "pendente" as const, dataVencimento: new Date(now.getTime() + 43200000) },
    { leadId: leadsCriados[7]!.id, tipo: "whatsapp" as const, titulo: "Lembrar proposta Clínica Saúde", descricao: "Urgência", status: "pendente" as const, dataVencimento: new Date(now.getTime() + 86400000) },
  ];
  await db.insert(activitiesTable).values(
    atividadesFake.map((a) => ({
      ...a,
      tenantId,
      dealId: null,
      agendaId: a.tipo === "reuniao" ? agenda.id : null,
    }))
  );

  await db.insert(agentTasksTable).values([
    { tenantId, leadId: leadsCriados[0]!.id, agentName: "sdr", actionType: "enviar_whatsapp", payload: { leadId: leadsCriados[0]!.id, conteudo: "Olá! Vi que você tem interesse em nosso CRM. Posso te ajudar?", agentName: "sdr", canal: "whatsapp" }, status: "executando" as const, executedAt: new Date(now.getTime() - 3600000) },
    { tenantId, leadId: leadsCriados[1]!.id, agentName: "closer", actionType: "enviar_email", payload: { leadId: leadsCriados[1]!.id, conteudo: "Proposta enviada! Aguardo sua resposta.", agentName: "closer", canal: "email" }, status: "pendente_aprovacao" as const },
    { tenantId, leadId: leadsCriados[3]!.id, agentName: "reactivation", actionType: "enviar_whatsapp", payload: { leadId: leadsCriados[3]!.id, conteudo: "Sentimos sua falta! Temos novidades.", agentName: "reactivation", canal: "whatsapp" }, status: "pendente_aprovacao" as const },
  ]);

  await db
    .update(tenantsTable)
    .set({ demoSeeded: true, updatedAt: new Date() })
    .where(eq(tenantsTable.id, tenantId));
}

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

router.patch("/tenants/:id/openai-key", requireRole("super_admin", "tenant_admin"), requireSameTenanOrSuperAdmin(), async (req, res) => {
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

function generateTempPassword(length = 8): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (const byte of array) result += chars[byte % chars.length];
  return result;
}

const TENANT_COUNTRY_PROFILES = {
  BR: { defaultLocale: "pt-BR", timezone: "America/Sao_Paulo", defaultCurrency: "BRL", taxIdentifierType: "CNPJ" },
  PY: { defaultLocale: "es-PY", timezone: "America/Asuncion", defaultCurrency: "PYG", taxIdentifierType: "RUC" },
  AR: { defaultLocale: "es-AR", timezone: "America/Argentina/Buenos_Aires", defaultCurrency: "ARS", taxIdentifierType: "CUIT" },
  UY: { defaultLocale: "es-UY", timezone: "America/Montevideo", defaultCurrency: "UYU", taxIdentifierType: "RUT" },
  CL: { defaultLocale: "es-CL", timezone: "America/Santiago", defaultCurrency: "CLP", taxIdentifierType: "RUT" },
} as const;

type ProvisionCountryCode = keyof typeof TENANT_COUNTRY_PROFILES;

function normalizeProvisionCountryCode(value?: string): ProvisionCountryCode | null {
  if (!value?.trim()) return "BR";
  const normalized = value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  const aliases: Record<string, ProvisionCountryCode> = {
    br: "BR", brasil: "BR", brazil: "BR",
    py: "PY", paraguai: "PY", paraguay: "PY",
    ar: "AR", argentina: "AR",
    uy: "UY", uruguai: "UY", uruguay: "UY",
    cl: "CL", chile: "CL",
  };
  return aliases[normalized] ?? null;
}

router.post("/superadmin/tenants/provision", requireRole("super_admin"), async (req, res) => {
  const { z } = await import("zod/v4");
  const schema = z.object({
    companyName: z.string().min(1),
    responsibleName: z.string().min(1),
    email: z.email(),
    phone: z.string().optional(),
    countryCode: z.enum(["BR", "PY", "AR", "UY", "CL"]).optional().default("BR"),
    taxIdentifier: z.string().optional(),
    cnpj: z.string().optional(),
    planId: z.string().optional(),
    billingCycle: z.enum(["monthly", "annual"]).optional(),
    internalNotes: z.string().optional(),
    sendWelcomeEmailFlag: z.boolean().optional().default(false),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const {
    companyName,
    responsibleName,
    email,
    phone,
    countryCode,
    taxIdentifier,
    cnpj,
    planId,
    billingCycle,
    internalNotes,
    sendWelcomeEmailFlag,
  } = parsed.data;
  const countryProfile = TENANT_COUNTRY_PROFILES[countryCode as ProvisionCountryCode];
  const normalizedTaxIdentifier = (taxIdentifier ?? cnpj)?.trim() || null;

  const slug = companyName
    .trim().toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, 40) + "-" + Math.random().toString(36).substring(2, 6);

  const subdomainSlug = await generateSubdomainSlug(companyName);

  const tempPassword = generateTempPassword(8);
  const hashed = await bcrypt.hash(tempPassword, 12);

  try {
    let resolvedPlanId: string | null = null;
    if (planId) {
      resolvedPlanId = await resolveActivePlanId(planId);
      if (!resolvedPlanId) {
        res.status(422).json({ error: "Plano selecionado não existe ou está inativo" });
        return;
      }
    }

    const [tenant] = await db.insert(tenantsTable).values({
      name: companyName,
      slug,
      subdomainSlug,
      status: "active",
      provisioningMethod: "manual",
      createdByAdminId: req.user?.sub,
      countryCode,
      defaultLocale: countryProfile.defaultLocale,
      timezone: countryProfile.timezone,
      defaultCurrency: countryProfile.defaultCurrency,
      supportedCurrencies: [countryProfile.defaultCurrency],
      taxIdentifierType: countryProfile.taxIdentifierType,
      taxIdentifier: normalizedTaxIdentifier,
      internalNotes: internalNotes ?? null,
      ...(resolvedPlanId ? { planId: resolvedPlanId, billingCycle: billingCycle ?? "monthly", planStartedAt: new Date() } : {}),
    }).returning();

    if (!tenant) throw new Error("Failed to create tenant");

    await db.insert(onboardingProgressTable).values({ tenantId: tenant.id }).onConflictDoNothing();
    createCustomHostname(`${subdomainSlug}.appvendorai.com`).catch(() => { });

    const [user] = await db.insert(usersTable).values({
      tenantId: tenant.id,
      name: responsibleName,
      email,
      password: hashed,
      role: "admin",
      platformRole: "tenant_admin",
      telefone: phone ?? null,
      forcePasswordReset: true,
    }).returning();

    if (!user) throw new Error("Failed to create user");

    let emailSent = false;
    if (sendWelcomeEmailFlag) {
      const loginUrl = "https://appvendorai.com/app/";
      emailSent = await sendWelcomeEmail({
        to: email,
        name: responsibleName,
        tenantName: companyName,
        loginUrl,
        tempPassword,
      });
      if (emailSent) {
        await db.update(tenantsTable).set({ accessSentAt: new Date() }).where(eq(tenantsTable.id, tenant.id));
      }
    }

    const { password: _pw, ...publicUser } = user;
    res.status(201).json({ tenant, user: publicUser, tempPassword, emailSent });
  } catch (err: unknown) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "E-mail ou slug já existe" });
      return;
    }
    throw err;
  }
});

router.post("/superadmin/tenants/import", requireRole("super_admin"), async (req, res) => {
  const { z } = await import("zod/v4");
  const bodySchema = z.object({ csv: z.string().min(1) });
  const parsedBody = bodySchema.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(422).json({ error: "CSV ausente ou inválido" });
    return;
  }

  const lines = parsedBody.data.csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    res.status(422).json({ error: "CSV deve ter cabeçalho + ao menos uma linha de dados" });
    return;
  }

  const headers = parseCsvLine(lines[0]).map(normalizeCsvHeader);
  const idx = (aliases: string[]) => {
    for (const a of aliases) {
      const i = headers.indexOf(a);
      if (i >= 0) return i;
    }
    return -1;
  };
  const iEmpresa = idx(["empresa", "razao_social", "nome_da_empresa", "company", "loja"]);
  const iResponsavel = idx(["responsavel", "nome_responsavel", "contato", "name"]);
  const iEmail = idx(["email", "e_mail"]);
  const iTelefone = idx(["telefone", "whatsapp", "phone", "celular"]);
  const iPais = idx(["pais", "country", "country_code", "codigo_pais"]);
  const iTaxIdentifier = idx(["documento_fiscal", "identificacao_fiscal", "identificador_fiscal", "tax_identifier", "ruc", "cuit", "rut"]);
  const iCnpj = idx(["cnpj"]);

  if (iEmpresa < 0 || iResponsavel < 0 || iEmail < 0) {
    res.status(422).json({
      error: "CSV precisa das colunas: empresa, responsavel, email (telefone, pais e documento_fiscal são opcionais)",
    });
    return;
  }

  const results: Array<{
    linha: number;
    empresa: string;
    email: string;
    countryCode?: ProvisionCountryCode;
    status: "criado" | "erro";
    emailEnviado?: boolean;
    erro?: string;
  }> = [];

  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li]!);
    const companyName = cols[iEmpresa]?.trim();
    const responsibleName = cols[iResponsavel]?.trim();
    const email = cols[iEmail]?.trim();
    const phone = iTelefone >= 0 ? cols[iTelefone]?.trim() || undefined : undefined;
    const rawCountry = iPais >= 0 ? cols[iPais]?.trim() || undefined : undefined;
    const countryCode = normalizeProvisionCountryCode(rawCountry);
    const genericTaxIdentifier = iTaxIdentifier >= 0 ? cols[iTaxIdentifier]?.trim() || undefined : undefined;
    const legacyCnpj = iCnpj >= 0 ? cols[iCnpj]?.trim() || undefined : undefined;
    const taxIdentifier = genericTaxIdentifier ?? legacyCnpj ?? null;

    if (!companyName || !responsibleName || !email) {
      results.push({ linha: li + 1, empresa: companyName ?? "", email: email ?? "", status: "erro", erro: "Empresa, responsável e e-mail são obrigatórios" });
      continue;
    }

    if (!countryCode) {
      results.push({
        linha: li + 1,
        empresa: companyName,
        email,
        status: "erro",
        erro: `País inválido: ${rawCountry}. Use BR, PY, AR, UY ou CL (ou o nome do país).`,
      });
      continue;
    }

    const countryProfile = TENANT_COUNTRY_PROFILES[countryCode];
    const slug = companyName
      .trim().toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .substring(0, 40) + "-" + Math.random().toString(36).substring(2, 6);

    try {
      const subdomainSlug = await generateSubdomainSlug(companyName);
      const tempPassword = generateTempPassword(8);
      const hashed = await bcrypt.hash(tempPassword, 12);

      const [tenant] = await db.insert(tenantsTable).values({
        name: companyName,
        slug,
        subdomainSlug,
        status: "active",
        provisioningMethod: "manual",
        createdByAdminId: req.user?.sub,
        countryCode,
        defaultLocale: countryProfile.defaultLocale,
        timezone: countryProfile.timezone,
        defaultCurrency: countryProfile.defaultCurrency,
        supportedCurrencies: [countryProfile.defaultCurrency],
        taxIdentifierType: countryProfile.taxIdentifierType,
        taxIdentifier,
        internalNotes: null,
      }).returning();

      if (!tenant) throw new Error("Falha ao criar tenant");

      await db.insert(onboardingProgressTable).values({ tenantId: tenant.id }).onConflictDoNothing();
      createCustomHostname(`${subdomainSlug}.appvendorai.com`).catch(() => { });

      const [user] = await db.insert(usersTable).values({
        tenantId: tenant.id,
        name: responsibleName,
        email,
        password: hashed,
        role: "admin",
        platformRole: "tenant_admin",
        telefone: phone ?? null,
        forcePasswordReset: true,
      }).returning();

      if (!user) throw new Error("Falha ao criar usuário");

      const emailSent = await sendWelcomeEmail({
        to: email,
        name: responsibleName,
        tenantName: companyName,
        loginUrl: "https://appvendorai.com/app/",
        tempPassword,
      });
      if (emailSent) {
        await db.update(tenantsTable).set({ accessSentAt: new Date() }).where(eq(tenantsTable.id, tenant.id));
      }

      results.push({ linha: li + 1, empresa: companyName, email, countryCode, status: "criado", emailEnviado: emailSent });
    } catch (err: unknown) {
      const erro = isUniqueViolation(err) ? "E-mail ou empresa já cadastrado" : (err instanceof Error ? err.message : "Erro desconhecido");
      results.push({ linha: li + 1, empresa: companyName, email, countryCode, status: "erro", erro });
    }
  }

  res.json({
    total: results.length,
    criados: results.filter((r) => r.status === "criado").length,
    comErro: results.filter((r) => r.status === "erro").length,
    results,
  });
});

router.post("/superadmin/tenants/:id/resend-access", requireRole("super_admin"), async (req, res) => {
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, String(req.params.id)));
  if (!tenant) { res.status(404).json({ error: "Tenant not found" }); return; }

  const [adminUser] = await db.select().from(usersTable)
    .where(eq(usersTable.tenantId, tenant.id))
    .limit(1);
  if (!adminUser) { res.status(404).json({ error: "No user found for this tenant" }); return; }

  const tempPassword = generateTempPassword(8);
  const hashed = await bcrypt.hash(tempPassword, 12);

  await db.update(usersTable).set({ password: hashed, forcePasswordReset: true, updatedAt: new Date() })
    .where(eq(usersTable.id, adminUser.id));

  const loginUrl = "https://appvendorai.com/app/";

  const emailSent = await sendWelcomeEmail({
    to: adminUser.email,
    name: adminUser.name,
    tenantName: tenant.name,
    loginUrl,
    tempPassword,
  });

  if (emailSent) {
    await db.update(tenantsTable).set({ accessSentAt: new Date() }).where(eq(tenantsTable.id, tenant.id));
  }

  res.json({ tempPassword, emailSent, email: adminUser.email });
});

router.patch(
  "/tenants/:id/users/:userId/role",
  requireRole("tenant_admin", "super_admin"),
  requireSameTenanOrSuperAdmin(),
  async (req, res) => {
    const tenantId = String(req.params["id"]);
    const userId = String(req.params["userId"]);
    const { role } = req.body as { role?: string };

    const allowed = ["tenant_admin", "tenant_seller", "member"];
    if (!role || !allowed.includes(role)) {
      res.status(400).json({ error: "ROLE_INVALIDO", message: `Role deve ser: ${allowed.join(", ")}` });
      return;
    }

    const roleMap: Record<string, { role: "admin" | "member"; platformRole: "tenant_admin" | "tenant_seller" | "member" }> = {
      tenant_admin:  { role: "admin",  platformRole: "tenant_admin"  },
      tenant_seller: { role: "member", platformRole: "tenant_seller" },
      member:        { role: "member", platformRole: "member"        },
    };
    const values = roleMap[role]!;

    const [updated] = await db
      .update(usersTable)
      .set({ role: values.role, platformRole: values.platformRole as "tenant_admin" | "tenant_seller" | "member", updatedAt: new Date() })
      .where(and(eq(usersTable.id, userId), eq(usersTable.tenantId, tenantId)))
      .returning({ id: usersTable.id, email: usersTable.email, platformRole: usersTable.platformRole });

    if (!updated) {
      res.status(404).json({ error: "NOT_FOUND" });
      return;
    }

    res.json(updated);
  }
);

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

export default router;
