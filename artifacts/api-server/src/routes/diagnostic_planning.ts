import jwt from "jsonwebtoken";
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  businessProfilesTable,
  db,
  pool,
  dealsTable,
  mediaPlansTable,
  tenantsTable,
} from "@workspace/db";
import { canonicalDealValueSql } from "../lib/deal-value.js";

const secret = process.env["JWT_SECRET"] ?? process.env["SESSION_SECRET"];
if (!secret) throw new Error("JWT_SECRET (or SESSION_SECRET) is required");
const diagnosticSecret = `${secret}:business-diagnostic-v1`;

export const diagnosticPlanningPublicRouter: IRouter = Router();
export const diagnosticPlanningProtectedRouter: IRouter = Router();

type LinkPayload = {
  scope: "business_diagnostic";
  tenantId: string;
  iat?: number;
  exp?: number;
};

function canAccess(req: any, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

function signPublicLink(tenantId: string) {
  return jwt.sign({ scope: "business_diagnostic", tenantId } satisfies Omit<LinkPayload, "iat" | "exp">, diagnosticSecret, { expiresIn: "7d" });
}

function verifyPublicLink(token: string): LinkPayload | null {
  try {
    const payload = jwt.verify(token, diagnosticSecret) as LinkPayload;
    return payload?.scope === "business_diagnostic" && typeof payload.tenantId === "string" ? payload : null;
  } catch {
    return null;
  }
}

const publicProfileSchema = z.object({
  razaoSocial: z.string().trim().max(240).optional(),
  nomeFantasia: z.string().trim().max(240).optional(),
  cnpj: z.string().trim().max(40).optional(),
  telefone: z.string().trim().max(60).optional(),
  email: z.string().trim().max(240).optional(),
  vertical: z.string().trim().max(180).optional(),
  diferenciais: z.string().trim().max(6000).optional(),
  publicoAlvo: z.string().trim().max(6000).optional(),
  canaisVenda: z.array(z.string().trim().max(180)).max(30).optional(),
  metodoVendas: z.string().trim().max(6000).optional(),
  descricaoNegocio: z.string().trim().max(8000).optional(),
  objetivoPrincipal: z.string().trim().max(4000).optional(),
  desafioPrincipal: z.string().trim().max(4000).optional(),
  ticketMedio: z.number().finite().nonnegative().optional(),
  leadsMes: z.number().finite().nonnegative().optional(),
  investimentoMarketingMes: z.number().finite().nonnegative().optional(),
});

const historyRowSchema = z.object({
  date: z.string().trim().min(4).max(40),
  revenue: z.number().finite().nonnegative(),
  orders: z.number().finite().nonnegative().default(0),
  leads: z.number().finite().nonnegative().default(0),
  marketingSpend: z.number().finite().nonnegative().default(0),
  channel: z.string().trim().max(120).optional(),
  product: z.string().trim().max(180).optional(),
});

const salesHistorySchema = z.object({
  rows: z.array(historyRowSchema).min(1).max(5000),
  sourceName: z.string().trim().max(240).optional(),
});

const actionPlanSchema = z.object({
  actions: z.array(z.object({
    title: z.string().trim().min(1).max(240),
    action: z.string().trim().min(1).max(4000),
    reason: z.string().trim().max(4000).default(""),
    priority: z.enum(["alta", "media", "baixa"]),
    executionType: z.enum(["automatic", "assisted", "human"]).default("assisted"),
  })).min(1).max(30),
});

function safeDiscovery(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

async function profileForTenant(tenantId: string) {
  const [profile] = await db.select().from(businessProfilesTable)
    .where(eq(businessProfilesTable.tenantId, tenantId)).limit(1);
  return profile ?? null;
}

diagnosticPlanningPublicRouter.get("/public/diagnostico-negocio/:token", async (req, res) => {
  const payload = verifyPublicLink(String(req.params.token ?? ""));
  if (!payload) return res.status(404).json({ error: "Link inválido ou expirado" });

  const [tenant, profile] = await Promise.all([
    db.select({ id: tenantsTable.id, name: tenantsTable.name, logoUrl: tenantsTable.logoUrl })
      .from(tenantsTable).where(eq(tenantsTable.id, payload.tenantId)).limit(1).then((rows) => rows[0] ?? null),
    profileForTenant(payload.tenantId),
  ]);
  if (!tenant) return res.status(404).json({ error: "Empresa não encontrada" });

  const discovery = safeDiscovery(profile?.discoveryData);
  return res.json({
    tenant: { name: tenant.name, logoUrl: tenant.logoUrl },
    profile: profile ? {
      razaoSocial: profile.razaoSocial,
      nomeFantasia: profile.nomeFantasia,
      cnpj: profile.cnpj,
      telefone: profile.telefone,
      email: profile.email,
      vertical: profile.vertical,
      diferenciais: profile.diferenciais,
      publicoAlvo: profile.publicoAlvo,
      canaisVenda: profile.canaisVenda ?? [],
      metodoVendas: profile.metodoVendas,
      descricaoNegocio: discovery["descricaoNegocio"] ?? "",
      objetivoPrincipal: discovery["objetivoPrincipal"] ?? "",
      desafioPrincipal: discovery["desafioPrincipal"] ?? "",
      ticketMedio: discovery["ticketMedio"] ?? null,
      leadsMes: discovery["leadsMes"] ?? null,
      investimentoMarketingMes: discovery["investimentoMarketingMes"] ?? null,
    } : null,
  });
});

diagnosticPlanningPublicRouter.put("/public/diagnostico-negocio/:token", async (req, res) => {
  const payload = verifyPublicLink(String(req.params.token ?? ""));
  if (!payload) return res.status(404).json({ error: "Link inválido ou expirado" });
  const parsed = publicProfileSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const [tenant] = await db.select({ id: tenantsTable.id, name: tenantsTable.name })
    .from(tenantsTable).where(eq(tenantsTable.id, payload.tenantId)).limit(1);
  if (!tenant) return res.status(404).json({ error: "Empresa não encontrada" });

  const current = await profileForTenant(payload.tenantId);
  const d = parsed.data;
  const discoveryData = {
    ...safeDiscovery(current?.discoveryData),
    descricaoNegocio: d.descricaoNegocio ?? safeDiscovery(current?.discoveryData)["descricaoNegocio"],
    objetivoPrincipal: d.objetivoPrincipal ?? safeDiscovery(current?.discoveryData)["objetivoPrincipal"],
    desafioPrincipal: d.desafioPrincipal ?? safeDiscovery(current?.discoveryData)["desafioPrincipal"],
    ticketMedio: d.ticketMedio ?? safeDiscovery(current?.discoveryData)["ticketMedio"],
    leadsMes: d.leadsMes ?? safeDiscovery(current?.discoveryData)["leadsMes"],
    investimentoMarketingMes: d.investimentoMarketingMes ?? safeDiscovery(current?.discoveryData)["investimentoMarketingMes"],
    publicDiagnosticUpdatedAt: new Date().toISOString(),
  };

  if (current) {
    await db.update(businessProfilesTable).set({
      razaoSocial: d.razaoSocial || current.razaoSocial,
      nomeFantasia: d.nomeFantasia ?? current.nomeFantasia,
      cnpj: d.cnpj ?? current.cnpj,
      telefone: d.telefone ?? current.telefone,
      email: d.email ?? current.email,
      vertical: d.vertical ?? current.vertical,
      diferenciais: d.diferenciais ?? current.diferenciais,
      publicoAlvo: d.publicoAlvo ?? current.publicoAlvo,
      canaisVenda: d.canaisVenda ?? current.canaisVenda,
      metodoVendas: d.metodoVendas ?? current.metodoVendas,
      discoveryData,
      updatedAt: new Date(),
    }).where(eq(businessProfilesTable.id, current.id));
  } else {
    await db.insert(businessProfilesTable).values({
      tenantId: payload.tenantId,
      razaoSocial: d.razaoSocial || tenant.name,
      nomeFantasia: d.nomeFantasia || tenant.name,
      cnpj: d.cnpj,
      telefone: d.telefone,
      email: d.email,
      vertical: d.vertical,
      diferenciais: d.diferenciais,
      publicoAlvo: d.publicoAlvo,
      canaisVenda: d.canaisVenda,
      metodoVendas: d.metodoVendas,
      discoveryData,
    });
  }
  return res.json({ ok: true, savedAt: new Date().toISOString() });
});

diagnosticPlanningProtectedRouter.post("/tenants/:tenantId/diagnostico-planejamento/public-link", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately checked against authenticated tenant/super-admin before tenant data access.
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });
  const token = signPublicLink(tenantId);
  return res.status(201).json({
    token,
    expiresInDays: 7,
    path: `/diagnostico-negocio/${encodeURIComponent(token)}`,
  });
});

diagnosticPlanningProtectedRouter.post("/tenants/:tenantId/diagnostico-planejamento/sales-history", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately checked against authenticated tenant/super-admin before tenant data access.
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });
  const parsed = salesHistorySchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const current = await profileForTenant(tenantId);
  if (!current) return res.status(409).json({ error: "Cadastre primeiro o Perfil Mestre da empresa" });
  const discoveryData = {
    ...safeDiscovery(current.discoveryData),
    salesHistory: parsed.data.rows,
    salesHistorySource: parsed.data.sourceName ?? "arquivo",
    salesHistoryImportedAt: new Date().toISOString(),
  };
  await db.update(businessProfilesTable)
    .set({ discoveryData, updatedAt: new Date() })
    .where(eq(businessProfilesTable.id, current.id));
  return res.json({ ok: true, rows: parsed.data.rows.length });
});

function monthKey(value: Date) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

diagnosticPlanningProtectedRouter.post("/tenants/:tenantId/diagnostico-planejamento/action-plan", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately checked against authenticated tenant/super-admin before tenant data access.
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });
  const parsed = actionPlanSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const current = await profileForTenant(tenantId);
  if (!current) return res.status(409).json({ error: "Cadastre primeiro o Perfil Mestre da empresa" });
  const now = new Date().toISOString();
  const actions = parsed.data.actions.map((item, index) => ({
    id: `diagnostic-action-${Date.now()}-${index + 1}`,
    ...item,
    status: "pending",
    createdAt: now,
  }));
  const discoveryData = {
    ...safeDiscovery(current.discoveryData),
    diagnosticActionPlan: { generatedAt: now, actions },
  };
  await db.update(businessProfilesTable)
    .set({ discoveryData, updatedAt: new Date() })
    .where(eq(businessProfilesTable.id, current.id));
  return res.status(201).json({ generatedAt: now, actions });
});

diagnosticPlanningProtectedRouter.get("/tenants/:tenantId/diagnostico-planejamento/action-plan", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately checked against authenticated tenant/super-admin before tenant data access.
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });
  const current = await profileForTenant(tenantId);
  return res.json(safeDiscovery(current?.discoveryData)["diagnosticActionPlan"] ?? { generatedAt: null, actions: [] });
});

diagnosticPlanningProtectedRouter.get("/tenants/:tenantId/diagnostico-planejamento/growth-scenarios", async (req, res) => {
  // tenant-audit: reviewed route tenant is immediately checked against authenticated tenant/super-admin before tenant data access.
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Acesso negado" });

  const [profile, deals, latestMediaPlan] = await Promise.all([
    profileForTenant(tenantId),
    db.select({
      valor: canonicalDealValueSql,
      etapa: dealsTable.etapa,
      wonAt: dealsTable.wonAt,
      dataFechamento: dealsTable.dataFechamento,
      createdAt: dealsTable.createdAt,
    }).from(dealsTable).where(eq(dealsTable.tenantId, tenantId)),
    db.select({ conteudo: mediaPlansTable.conteudo }).from(mediaPlansTable)
      .where(eq(mediaPlansTable.tenantId, tenantId)).orderBy(desc(mediaPlansTable.createdAt)).limit(1)
      .then((rows) => rows[0] ?? null),
  ]);

  const discovery = safeDiscovery(profile?.discoveryData);
  const imported = Array.isArray(discovery["salesHistory"]) ? discovery["salesHistory"] as Array<Record<string, unknown>> : [];
  const months = new Map<string, { revenue: number; orders: number; leads: number; marketingSpend: number }>();

  if (imported.length > 0) {
    for (const raw of imported) {
      const date = new Date(String(raw["date"] ?? ""));
      if (!Number.isFinite(date.getTime())) continue;
      const key = monthKey(date);
      const row = months.get(key) ?? { revenue: 0, orders: 0, leads: 0, marketingSpend: 0 };
      row.revenue += Number(raw["revenue"] ?? 0) || 0;
      row.orders += Number(raw["orders"] ?? 0) || 0;
      row.leads += Number(raw["leads"] ?? 0) || 0;
      row.marketingSpend += Number(raw["marketingSpend"] ?? 0) || 0;
      months.set(key, row);
    }
  } else {
    for (const deal of deals) {
      if (deal.etapa !== "ganho") continue;
      const date = deal.wonAt ?? deal.dataFechamento ?? deal.createdAt;
      const key = monthKey(date);
      const row = months.get(key) ?? { revenue: 0, orders: 0, leads: 0, marketingSpend: 0 };
      row.revenue += Number(deal.valor ?? 0) || 0;
      row.orders += 1;
      months.set(key, row);
    }
  }

  const series = Array.from(months.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-24)
    .map(([month, values]) => ({ month, ...values }));
  const sampleMonths = Math.max(1, series.length);
  const revenueTotal = series.reduce((s, row) => s + row.revenue, 0);
  const ordersTotal = series.reduce((s, row) => s + row.orders, 0);
  const leadsTotal = series.reduce((s, row) => s + row.leads, 0);
  const spendTotal = series.reduce((s, row) => s + row.marketingSpend, 0);
  const liveDeals = deals.length;
  const liveWon = deals.filter((d) => d.etapa === "ganho").length;

  const avgMonthlyRevenue = revenueTotal / sampleMonths;
  const avgMonthlyOrders = ordersTotal / sampleMonths;
  const ticket = ordersTotal > 0 ? revenueTotal / ordersTotal : Number(discovery["ticketMedio"] ?? 0) || 0;
  const conversion = leadsTotal > 0
    ? Math.min(1, ordersTotal / leadsTotal)
    : liveDeals > 0 ? Math.min(1, liveWon / liveDeals) : 0;
  const mediaPlanBudget = Number((latestMediaPlan?.conteudo as any)?.orcamento?.valor ?? 0) || 0;
  const avgMonthlySpend = spendTotal > 0 ? spendTotal / sampleMonths : Number(discovery["investimentoMarketingMes"] ?? 0) || mediaPlanBudget;
  const cpl = leadsTotal > 0 && spendTotal > 0 ? spendTotal / leadsTotal : 0;
  const cac = ordersTotal > 0 && spendTotal > 0 ? spendTotal / ordersTotal : 0;

  const confidence = sampleMonths >= 12 && ordersTotal >= 20 ? "alta"
    : sampleMonths >= 6 && ordersTotal >= 8 ? "media"
    : "baixa";

  const baseRevenue = avgMonthlyRevenue || (ticket > 0 && avgMonthlyOrders > 0 ? ticket * avgMonthlyOrders : 0);
  const scenarioDefs = [
    { id: "conservador", label: "Conservador", factor: 0.85 },
    { id: "base", label: "Base", factor: 1 },
    { id: "expansao", label: "Expansão", factor: 1.2 },
  ] as const;

  const scenarios = scenarioDefs.map((scenario) => {
    const revenue = baseRevenue * scenario.factor;
    const sales = ticket > 0 ? revenue / ticket : avgMonthlyOrders * scenario.factor;
    const leadsNeeded = conversion > 0 ? sales / conversion : null;
    const investment = cpl > 0 && leadsNeeded != null
      ? cpl * leadsNeeded
      : avgMonthlySpend * scenario.factor;
    return {
      ...scenario,
      projectedMonthlyRevenue: Math.round(revenue * 100) / 100,
      projectedSales: Math.round(sales * 10) / 10,
      leadsNeeded: leadsNeeded == null ? null : Math.ceil(leadsNeeded),
      projectedMarketingInvestment: Math.round(investment * 100) / 100,
      projectedCAC: sales > 0 ? Math.round((investment / sales) * 100) / 100 : null,
      projectedROAS: investment > 0 ? Math.round((revenue / investment) * 100) / 100 : null,
    };
  });

  const goals = await pool.query(
    `SELECT metric_key, label, target_value, unit, starts_at, ends_at
       FROM business_goals
      WHERE tenant_id=$1 AND active=true AND ends_at >= now()
      ORDER BY ends_at ASC
      LIMIT 20`,
    [tenantId],
  ).catch(() => ({ rows: [] as any[] }));

  const recommendations: Array<{ priority: "alta" | "media" | "baixa"; title: string; action: string; reason: string }> = [];
  if (confidence === "baixa") recommendations.push({ priority: "alta", title: "Melhorar base histórica", action: "Importar pelo menos 6 a 12 meses de vendas, leads e investimento em mídia.", reason: "A confiança da projeção ainda é baixa." });
  if (conversion > 0 && conversion < 0.1) recommendations.push({ priority: "alta", title: "Melhorar conversão comercial", action: "Revisar qualificação, velocidade de resposta, proposta e follow-up antes de ampliar mídia.", reason: `Conversão observada de ${Math.round(conversion * 10000) / 100}%.` });
  if (cpl > 0 && cac > 0) recommendations.push({ priority: "media", title: "Otimizar aquisição por resultado", action: "Priorizar canais e campanhas que sustentem CAC e ROAS melhores, não apenas CPL menor.", reason: `CPL observado R$ ${cpl.toFixed(2)} e CAC R$ ${cac.toFixed(2)}.` });
  if (baseRevenue > 0) recommendations.push({ priority: "media", title: "Acompanhar cenário base", action: "Comparar semanalmente realizado x cenário e recalibrar investimento com o BI.", reason: "Há histórico suficiente para usar o cenário como referência operacional." });

  const goalRows = ((goals as any).rows ?? []) as Array<Record<string, any>>;
  const planVsExecution = goalRows.map((goal) => {
    const key = String(goal.metric_key ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const startsAt = new Date(goal.starts_at);
    const endsAt = new Date(goal.ends_at);
    const relevant = series.filter((row) => {
      const date = new Date(`${row.month}-01T00:00:00Z`);
      return date >= startsAt && date <= endsAt;
    });
    let actual = 0;
    let actualBasis = "historico";
    if (/receita|revenue|faturamento/.test(key)) actual = relevant.reduce((sum, row) => sum + row.revenue, 0);
    else if (/vendas|sales|pedidos|orders|won/.test(key)) actual = relevant.reduce((sum, row) => sum + row.orders, 0);
    else if (/leads|oportunidades/.test(key)) actual = relevant.reduce((sum, row) => sum + row.leads, 0);
    else if (/investimento|spend|marketing/.test(key)) actual = relevant.reduce((sum, row) => sum + row.marketingSpend, 0);
    else if (/conversao|conversion/.test(key)) {
      actual = conversion * 100;
      actualBasis = "conversao_global_observada";
    } else {
      actualBasis = "sem_mapeamento_automatico";
    }
    const target = Number(goal.target_value ?? 0) || 0;
    return {
      ...goal,
      actualValue: Math.round(actual * 100) / 100,
      actualBasis,
      progressPercent: target > 0 ? Math.round((actual / target) * 10000) / 100 : null,
    };
  });

  return res.json({
    generatedAt: new Date().toISOString(),
    source: imported.length > 0 ? "imported_sales_history" : "crm_won_deals",
    confidence,
    sample: { months: series.length, orders: ordersTotal, leads: leadsTotal, liveDeals, liveWon },
    baseline: {
      avgMonthlyRevenue: Math.round(avgMonthlyRevenue * 100) / 100,
      avgMonthlyOrders: Math.round(avgMonthlyOrders * 10) / 10,
      avgTicket: Math.round(ticket * 100) / 100,
      conversionPercent: Math.round(conversion * 10000) / 100,
      avgMonthlyMarketingSpend: Math.round(avgMonthlySpend * 100) / 100,
      cpl: cpl ? Math.round(cpl * 100) / 100 : null,
      cac: cac ? Math.round(cac * 100) / 100 : null,
    },
    series,
    scenarios,
    planVsExecution,
    valueGenerated: {
      trackedRevenue: Math.round(revenueTotal * 100) / 100,
      trackedOrders: ordersTotal,
      trackedMarketingSpend: Math.round(spendTotal * 100) / 100,
      trackedMonths: series.length,
      source: imported.length > 0 ? "historico_importado" : "crm",
    },
    recommendations,
    assumptions: [
      imported.length > 0 ? "Histórico importado priorizado para receita, pedidos, leads e mídia." : "Receita calculada a partir de negócios ganhos no CRM.",
      conversion > 0 ? "Conversão derivada de dados observados." : "Sem conversão observada suficiente; leads necessários não são estimados.",
      cpl > 0 ? "Investimento projetado a partir do CPL histórico." : "Sem CPL histórico suficiente; investimento escala o orçamento médio disponível.",
    ],
  });
});
