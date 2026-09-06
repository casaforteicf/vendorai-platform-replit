/**
 * Painel Financeiro / FinOps da Plataforma (super_admin)
 *
 * Consolida receita, custo de IA rastreado por uso e custos reais de
 * infraestrutura/fornecedores registrados no ledger platform_cost_entries.
 */
import { Router, type IRouter } from "express";
import { gte, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, pool, tenantsTable, plansTable, aiUsageLogsTable } from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

const costEntrySchema = z.object({
  provider: z.string().trim().min(1).max(80),
  category: z.string().trim().min(1).max(80),
  amountUsd: z.coerce.number().finite().min(0),
  periodStart: z.string().date(),
  periodEnd: z.string().date(),
  tenantId: z.string().trim().min(1).nullable().optional(),
  source: z.enum(["manual", "api", "import"]).default("manual"),
  externalReference: z.string().trim().max(255).nullable().optional(),
  note: z.string().trim().max(1000).nullable().optional(),
});

function monthBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}

function usdBrlRate(): number {
  const raw = Number(process.env.FINOPS_USD_BRL ?? "5.20");
  return Number.isFinite(raw) && raw > 0 ? raw : 5.2;
}

async function readPlatformCosts(startDate: string, endDate: string) {
  const { rows } = await pool.query<{
    id: string;
    provider: string;
    category: string;
    amount_usd: string;
    period_start: string;
    period_end: string;
    tenant_id: string | null;
    tenant_name: string | null;
    source: string;
    external_reference: string | null;
    note: string | null;
    created_at: string;
  }>(
    `SELECT pce.id,
            pce.provider,
            pce.category,
            pce.amount_usd,
            pce.period_start::text,
            pce.period_end::text,
            pce.tenant_id,
            t.name AS tenant_name,
            pce.source,
            pce.external_reference,
            pce.note,
            pce.created_at::text
       FROM platform_cost_entries pce
       LEFT JOIN tenants t ON t.id = pce.tenant_id
      WHERE pce.period_start <= $2::date
        AND pce.period_end >= $1::date
      ORDER BY pce.amount_usd DESC, pce.created_at DESC`,
    [startDate, endDate],
  );

  const entries = rows.map((r) => ({
    id: r.id,
    provider: r.provider,
    category: r.category,
    amountUsd: Number(r.amount_usd),
    periodStart: r.period_start,
    periodEnd: r.period_end,
    tenantId: r.tenant_id,
    tenantName: r.tenant_name,
    source: r.source,
    externalReference: r.external_reference,
    note: r.note,
    createdAt: r.created_at,
  }));

  const byProvider = new Map<string, number>();
  const byCategory = new Map<string, number>();
  const directByTenant = new Map<string, number>();
  let sharedUsd = 0;

  for (const entry of entries) {
    byProvider.set(entry.provider, (byProvider.get(entry.provider) ?? 0) + entry.amountUsd);
    byCategory.set(entry.category, (byCategory.get(entry.category) ?? 0) + entry.amountUsd);
    if (entry.tenantId) {
      directByTenant.set(entry.tenantId, (directByTenant.get(entry.tenantId) ?? 0) + entry.amountUsd);
    } else {
      sharedUsd += entry.amountUsd;
    }
  }

  return {
    totalUsd: entries.reduce((sum, e) => sum + e.amountUsd, 0),
    sharedUsd,
    directByTenant,
    byProvider: [...byProvider.entries()]
      .map(([provider, amountUsd]) => ({ provider, amountUsd }))
      .sort((a, b) => b.amountUsd - a.amountUsd),
    byCategory: [...byCategory.entries()]
      .map(([category, amountUsd]) => ({ category, amountUsd }))
      .sort((a, b) => b.amountUsd - a.amountUsd),
    entries,
  };
}

router.post(
  "/admin/platform-costs",
  authenticate,
  requireRole("super_admin"),
  async (req, res) => {
    const parsed = costEntrySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados de custo inválidos", details: parsed.error.flatten() });
    }
    const value = parsed.data;
    if (value.periodEnd < value.periodStart) {
      return res.status(400).json({ error: "periodEnd deve ser maior ou igual a periodStart" });
    }
    if (value.category.trim().toLowerCase() === "ia") {
      return res.status(409).json({
        error: "Custo de IA já é rastreado automaticamente pelos logs de uso. O lançamento manual de IA está bloqueado para evitar contagem duplicada até a reconciliação de faturas estar conectada.",
      });
    }

    const { rows } = await pool.query<{ id: string }>(
      `INSERT INTO platform_cost_entries
        (provider, category, amount_usd, period_start, period_end, tenant_id, source,
         external_reference, note, created_by)
       VALUES ($1, $2, $3, $4::date, $5::date, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        value.provider,
        value.category,
        value.amountUsd,
        value.periodStart,
        value.periodEnd,
        value.tenantId ?? null,
        value.source,
        value.externalReference ?? null,
        value.note ?? null,
        req.user?.sub ?? null,
      ],
    );

    return res.status(201).json({ id: rows[0]?.id });
  },
);

router.delete(
  "/admin/platform-costs/:id",
  authenticate,
  requireRole("super_admin"),
  async (req, res) => {
    const { rowCount } = await pool.query(
      `DELETE FROM platform_cost_entries WHERE id = $1`,
      [req.params.id],
    );
    if (!rowCount) return res.status(404).json({ error: "Custo não encontrado" });
    return res.status(204).send();
  },
);

router.get(
  "/admin/financial-summary",
  authenticate,
  requireRole("super_admin"),
  async (_req, res) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const { startDate, endDate } = monthBounds(now);
    const usdToBrl = usdBrlRate();

    const tenants = await db
      .select({
        id: tenantsTable.id,
        name: tenantsTable.name,
        status: tenantsTable.status,
        suspendedReason: tenantsTable.suspendedReason,
        planId: tenantsTable.planId,
        billingCycle: tenantsTable.billingCycle,
        planStartedAt: tenantsTable.planStartedAt,
        mensalidadeValor: tenantsTable.mensalidadeValor,
        isDemo: tenantsTable.isDemo,
        createdAt: tenantsTable.createdAt,
      })
      .from(tenantsTable)
      .where(ne(tenantsTable.status, "cancelled"));

    const plans = await db
      .select({ id: plansTable.id, name: plansTable.name, monthlyPriceCents: plansTable.monthlyPriceCents })
      .from(plansTable);
    const planMap = new Map(plans.map((p) => [p.id, p]));

    const aiRows = await db
      .select({
        tenantId: aiUsageLogsTable.tenantId,
        custoMes: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)`,
      })
      .from(aiUsageLogsTable)
      .where(gte(aiUsageLogsTable.createdAt, startOfMonth))
      .groupBy(aiUsageLogsTable.tenantId);
    const aiCostMap = new Map(aiRows.map((r) => [r.tenantId, Number(r.custoMes)]));
    const aiCostTotalUsd = aiRows.reduce((sum, r) => sum + Number(r.custoMes), 0);
    const platformCosts = await readPlatformCosts(startDate, endDate);

    function mrrDeTenant(t: typeof tenants[number]): number {
      if (t.isDemo) return 0;
      if (t.mensalidadeValor && Number(t.mensalidadeValor) > 0) return Number(t.mensalidadeValor);
      if (t.planId) {
        const plan = planMap.get(t.planId);
        if (plan?.monthlyPriceCents) return plan.monthlyPriceCents / 100;
      }
      return 0;
    }

    const baseTenants = tenants.map((t) => ({
      tenant: t,
      mrr: mrrDeTenant(t),
      aiUsd: aiCostMap.get(t.id) ?? 0,
      directExternalUsd: platformCosts.directByTenant.get(t.id) ?? 0,
      plan: t.planId ? planMap.get(t.planId) : undefined,
    }));

    const activeCount = baseTenants.filter(({ tenant }) => tenant.status === "active" && !tenant.isDemo).length;
    const sharedPerActiveTenantUsd = activeCount > 0 ? platformCosts.sharedUsd / activeCount : 0;

    const enriched = baseTenants.map(({ tenant: t, mrr, aiUsd, directExternalUsd, plan }) => {
      const sharedAllocatedUsd = t.status === "active" && !t.isDemo ? sharedPerActiveTenantUsd : 0;
      const operationalCostUsd = aiUsd + directExternalUsd + sharedAllocatedUsd;
      const operationalCostBrl = operationalCostUsd * usdToBrl;
      const margemMes = mrr - operationalCostBrl;
      return {
        id: t.id,
        name: t.name,
        status: t.status,
        suspendedReason: t.suspendedReason,
        isDemo: t.isDemo,
        planId: t.planId,
        planNome: plan?.name ?? null,
        billingCycle: t.billingCycle,
        planStartedAt: t.planStartedAt,
        mensalidadeValor: t.mensalidadeValor ? Number(t.mensalidadeValor) : null,
        mrr,
        custoIaMes: aiUsd,
        custoExternoDiretoUsd: directExternalUsd,
        custoCompartilhadoRateadoUsd: sharedAllocatedUsd,
        custoOperacionalUsd: operationalCostUsd,
        custoOperacionalBrl: operationalCostBrl,
        margemMes,
        margemPercent: mrr > 0 ? (margemMes / mrr) * 100 : null,
        createdAt: t.createdAt,
      };
    });

    const ativos = enriched.filter((t) => t.status === "active" && !t.isDemo);
    const mrrTotal = ativos.reduce((sum, t) => sum + t.mrr, 0);
    const arrTotal = mrrTotal * 12;

    const planBreakdown = new Map<string, { planId: string; planNome: string; count: number; mrr: number }>();
    for (const t of ativos) {
      const key = t.planId ?? "sem_plano";
      const nome = t.planNome ?? "Sem plano";
      const entry = planBreakdown.get(key) ?? { planId: key, planNome: nome, count: 0, mrr: 0 };
      entry.count++;
      entry.mrr += t.mrr;
      planBreakdown.set(key, entry);
    }

    const inadimplentes = enriched
      .filter((t) => t.status === "suspended")
      .map((t) => ({
        id: t.id,
        name: t.name,
        mrr: t.mrr,
        planNome: t.planNome,
        suspendedReason: t.suspendedReason,
        planStartedAt: t.planStartedAt,
        custoIaMes: t.custoIaMes,
        custoOperacionalUsd: t.custoOperacionalUsd,
      }));

    const rankingMargem = [...ativos]
      .sort((a, b) => a.margemMes - b.margemMes)
      .map((t) => ({
        id: t.id,
        name: t.name,
        mrr: t.mrr,
        custoIaMes: t.custoIaMes,
        custoExternoDiretoUsd: t.custoExternoDiretoUsd,
        custoCompartilhadoRateadoUsd: t.custoCompartilhadoRateadoUsd,
        custoOperacionalUsd: t.custoOperacionalUsd,
        custoOperacionalBrl: t.custoOperacionalBrl,
        margemMes: t.margemMes,
        margemPercent: t.margemPercent,
        planNome: t.planNome,
      }));

    const semPlano = ativos.filter((t) => !t.planId && t.mrr === 0).length;
    const operationalTotalUsd = platformCosts.totalUsd + aiCostTotalUsd;

    res.json({
      geradoEm: now.toISOString(),
      periodo: { startDate, endDate },
      cambio: { usdToBrl, source: process.env.FINOPS_USD_BRL ? "env" : "default" },
      mrr: {
        total: mrrTotal,
        arr: arrTotal,
        tenantsAtivos: ativos.length,
        tenantsDemo: enriched.filter((t) => t.isDemo).length,
        tenantsSemPlano: semPlano,
      },
      planBreakdown: Array.from(planBreakdown.values()).sort((a, b) => b.mrr - a.mrr),
      inadimplencia: {
        total: inadimplentes.length,
        mrrEmRisco: inadimplentes.reduce((sum, t) => sum + t.mrr, 0),
        tenants: inadimplentes,
      },
      ia: {
        custoTotalMes: aiCostTotalUsd,
        margemTotalMes: ativos.reduce((sum, t) => sum + t.margemMes, 0),
        rankingMargem,
      },
      custos: {
        totalUsd: platformCosts.totalUsd,
        sharedUsd: platformCosts.sharedUsd,
        byProvider: platformCosts.byProvider,
        byCategory: platformCosts.byCategory,
        entries: platformCosts.entries,
        aiTrackedUsd: aiCostTotalUsd,
        operationalTotalUsd,
        operationalTotalBrl: operationalTotalUsd * usdToBrl,
        allocation: {
          method: "equal_active_tenants_v1",
          sharedPerActiveTenantUsd,
        },
        tracking: {
          ai: "automatic_estimate",
          infrastructure: platformCosts.entries.length > 0 ? "ledger" : "awaiting_provider_connection",
        },
      },
    });
  },
);

export default router;
