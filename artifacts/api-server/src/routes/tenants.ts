import { Router, type IRouter } from "express";
import { eq, count, and, gte } from "drizzle-orm";
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
} from "@workspace/db";
import { requireRole, requireSameTenanOrSuperAdmin } from "../middlewares/auth";
import { encrypt } from "../lib/crypto.js";
import { sendWelcomeEmail } from "../lib/email.js";

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
    await db.insert(onboardingProgressTable).values({ tenantId: tenant.id }).onConflictDoNothing();
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

  await db.insert(onboardingProgressTable).values({ tenantId: tenant.id }).onConflictDoNothing();

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
  const now = new Date();

  // 1. Produtos fake (10)
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

  // 2. Leads fake (20)
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
  const leadsFake = leadDefs.map((l, i) => ({
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

  // 3. Customer Intelligence fake
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

  // 4. Conversas fake (8)
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

  // 5. Mensagens fake
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

  // 6. Deals fake (10)
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

  // 7. Propostas fake (6)
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

  // 8. Inventory fake (5) — precisa produtoId primeiro
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

  // 9. Agendas fake (1)
  const [agenda] = await db.insert(agendasTable).values({
    tenantId,
    nome: "Agenda Demo",
    isDefault: true,
  }).returning();

  // 10. Atividades fake (8)
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

  // 11. Agent tasks fake (3)
  await db.insert(agentTasksTable).values([
    { tenantId, leadId: leadsCriados[0]!.id, agentName: "sdr", actionType: "enviar_whatsapp", payload: { leadId: leadsCriados[0]!.id, conteudo: "Olá! Vi que você tem interesse em nosso CRM. Posso te ajudar?", agentName: "sdr", canal: "whatsapp" }, status: "executando" as const, executedAt: new Date(now.getTime() - 3600000) },
    { tenantId, leadId: leadsCriados[1]!.id, agentName: "closer", actionType: "enviar_email", payload: { leadId: leadsCriados[1]!.id, conteudo: "Proposta enviada! Aguardo sua resposta.", agentName: "closer", canal: "email" }, status: "pendente_aprovacao" as const },
    { tenantId, leadId: leadsCriados[3]!.id, agentName: "reactivation", actionType: "enviar_whatsapp", payload: { leadId: leadsCriados[3]!.id, conteudo: "Sentimos sua falta! Temos novidades.", agentName: "reactivation", canal: "whatsapp" }, status: "pendente_aprovacao" as const },
  ]);

  // 12. Marcar como seedado
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

// ── Provision tenant (super admin) ──────────────────────────────────────────
function generateTempPassword(length = 8): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let result = "";
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  for (const byte of array) result += chars[byte % chars.length];
  return result;
}

router.post("/superadmin/tenants/provision", requireRole("super_admin"), async (req, res) => {
  const { z } = await import("zod/v4");
  const schema = z.object({
    companyName: z.string().min(1),
    responsibleName: z.string().min(1),
    email: z.email(),
    phone: z.string().optional(),
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
  const { companyName, responsibleName, email, phone, cnpj, planId, billingCycle, internalNotes, sendWelcomeEmailFlag } = parsed.data;

  const slug = companyName
    .trim().toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .substring(0, 40) + "-" + Math.random().toString(36).substring(2, 6);

  const tempPassword = generateTempPassword(8);
  const hashed = await bcrypt.hash(tempPassword, 12);

  try {
    const [tenant] = await db.insert(tenantsTable).values({
      name: companyName,
      slug,
      status: "active",
      provisioningMethod: "manual",
      createdByAdminId: req.user?.sub,
      ...(cnpj ? { internalNotes: [cnpj, internalNotes].filter(Boolean).join(" | ") } : { internalNotes: internalNotes ?? null }),
      ...(planId ? { planId, billingCycle: billingCycle ?? "monthly", planStartedAt: new Date() } : {}),
    }).returning();

    if (!tenant) throw new Error("Failed to create tenant");

    await db.insert(onboardingProgressTable).values({ tenantId: tenant.id }).onConflictDoNothing();

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
      const loginUrl = process.env["REPLIT_DOMAINS"]
        ? `https://${process.env["REPLIT_DOMAINS"].split(",")[0]}/login`
        : "https://vendorai.replit.app/login";
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

  const loginUrl = process.env["REPLIT_DOMAINS"]
    ? `https://${process.env["REPLIT_DOMAINS"].split(",")[0]}/login`
    : "https://vendorai.replit.app/login";

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

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: string }).code === "23505"
  );
}

export default router;
