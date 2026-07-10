/**
 * BLOCO 18 — Painel Financeiro da Plataforma (super_admin)
 *
 * Visão agregada da saúde financeira do próprio SaaS (VendorAI/Windoor).
 * Dados lidos de tabelas já existentes — sem criação de novos campos.
 *
 * Prioridade 1 (implementado):
 *  - MRR/ARR por tenant ativo
 *  - Receita por plano (breakdown Growth/PME+/Enterprise)
 *  - Inadimplência (tenants suspended)
 *  - Custo IA vs receita — margem por tenant (ranking do pior para o melhor)
 *
 * Prioridade 2 (não incluída nesta rodada por escopo):
 *  - Churn/retenção histórico
 *  - Previsão de receita
 */
import { Router, type IRouter } from "express";
import { and, eq, gte, isNotNull, ne, sql } from "drizzle-orm";
import { db, tenantsTable, plansTable, aiUsageLogsTable } from "@workspace/db";
import { authenticate, requireRole } from "../middlewares/auth.js";

const router: IRouter = Router();

// ── GET /admin/financial-summary ─────────────────────────────────────────────
router.get(
  "/admin/financial-summary",
  authenticate,
  requireRole("super_admin"),
  async (req, res) => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // ── Buscar todos os tenants ativos (não demo, não cancelados) com plano ──
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

    // ── Buscar planos ─────────────────────────────────────────────────────────
    const plans = await db
      .select({ id: plansTable.id, name: plansTable.name, monthlyPriceCents: plansTable.monthlyPriceCents })
      .from(plansTable);
    const planMap = new Map(plans.map((p) => [p.id, p]));

    // ── AI cost este mês por tenant ───────────────────────────────────────────
    const aiRows = await db
      .select({
        tenantId: aiUsageLogsTable.tenantId,
        custoMes: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)`,
      })
      .from(aiUsageLogsTable)
      .where(gte(aiUsageLogsTable.createdAt, startOfMonth))
      .groupBy(aiUsageLogsTable.tenantId);
    const aiCostMap = new Map(aiRows.map((r) => [r.tenantId, Number(r.custoMes)]));

    // ── Calcular MRR por tenant ───────────────────────────────────────────────
    // MRR = mensalidadeValor explícito OU plans.monthlyPriceCents/100 se vinculado.
    // Tenants demo ou sem valor de plano não entram no MRR.
    function mrrDeTenant(t: typeof tenants[number]): number {
      if (t.isDemo) return 0;
      if (t.mensalidadeValor && Number(t.mensalidadeValor) > 0) {
        return Number(t.mensalidadeValor);
      }
      if (t.planId) {
        const plan = planMap.get(t.planId);
        if (plan?.monthlyPriceCents) {
          const monthly = plan.monthlyPriceCents / 100;
          // Plano anual: desconto típico de 15% já refletido no monthlyPriceAnnualCents
          // Aqui usamos o monthlyPriceCents como referência mesmo no ciclo anual
          return monthly;
        }
      }
      return 0;
    }

    // ── Enriquecer tenants com métricas ───────────────────────────────────────
    const enriched = tenants.map((t) => {
      const mrr = mrrDeTenant(t);
      const custoIaMes = aiCostMap.get(t.id) ?? 0;
      const plan = t.planId ? planMap.get(t.planId) : undefined;
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
        custoIaMes,
        margemMes: mrr - custoIaMes,
        margemPercent: mrr > 0 ? ((mrr - custoIaMes) / mrr) * 100 : null,
        createdAt: t.createdAt,
      };
    });

    // ── MRR/ARR total (apenas ativos, não-demo) ───────────────────────────────
    const ativos = enriched.filter((t) => t.status === "active" && !t.isDemo);
    const mrrTotal = ativos.reduce((sum, t) => sum + t.mrr, 0);
    const arrTotal = mrrTotal * 12;

    // ── Breakdown por plano ───────────────────────────────────────────────────
    const planBreakdown = new Map<
      string,
      { planId: string; planNome: string; count: number; mrr: number }
    >();
    for (const t of ativos) {
      const key = t.planId ?? "sem_plano";
      const nome = t.planNome ?? "Sem plano";
      const entry = planBreakdown.get(key) ?? { planId: key, planNome: nome, count: 0, mrr: 0 };
      entry.count++;
      entry.mrr += t.mrr;
      planBreakdown.set(key, entry);
    }

    // ── Inadimplência (tenants suspended) ────────────────────────────────────
    // O status "suspended" é aplicado pela Central de Tenants quando há atraso.
    // Expomos o motivo da suspensão para identificar inadimplência vs. outras razões.
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
      }));

    // ── Ranking de margem — piores primeiro (risco de prejuízo) ──────────────
    const rankingMargem = [...ativos]
      .sort((a, b) => a.margemMes - b.margemMes)
      .map((t) => ({
        id: t.id,
        name: t.name,
        mrr: t.mrr,
        custoIaMes: t.custoIaMes,
        margemMes: t.margemMes,
        margemPercent: t.margemPercent,
        planNome: t.planNome,
      }));

    // ── Tenants sem plano mas ativos ──────────────────────────────────────────
    const semPlano = ativos.filter((t) => !t.planId && t.mrr === 0).length;

    res.json({
      geradoEm: now.toISOString(),
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
        custoTotalMes: aiRows.reduce((sum, r) => sum + Number(r.custoMes), 0),
        margemTotalMes: ativos.reduce((sum, t) => sum + t.margemMes, 0),
        rankingMargem,
      },
    });
  },
);

export default router;
