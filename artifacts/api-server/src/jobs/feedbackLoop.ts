import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  churnActionsTable,
  prospectFeedbackTable,
  leadsTable,
  tenantsTable,
  scoutOportunidadesTable,
} from "@workspace/db";

// ─── Análise 1: Taxa de sucesso das ações de churn por tipo ──────────────────
async function analyzeChurnActions(
  tenantId: string,
  log: Logger
): Promise<void> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      actionType: churnActionsTable.actionType,
      successful: sql<number>`count(*) filter (where ${churnActionsTable.actionSuccessful} = true)`.mapWith(Number),
      failed: sql<number>`count(*) filter (where ${churnActionsTable.actionSuccessful} = false)`.mapWith(Number),
      total: sql<number>`count(*)`.mapWith(Number),
    })
    .from(churnActionsTable)
    .where(
      and(
        eq(churnActionsTable.tenantId, tenantId),
        gte(churnActionsTable.executedAt, since)
      )
    )
    .groupBy(churnActionsTable.actionType);

  if (rows.length === 0) {
    log.info({ tenantId }, "feedbackLoop/churn: sem dados suficientes (últimos 30 dias)");
    return;
  }

  const analysis = rows.map((r) => ({
    actionType: r.actionType,
    successRate: r.total > 0 ? Number((r.successful / r.total).toFixed(2)) : 0,
    total: r.total,
  }));

  const best = analysis.sort((a, b) => b.successRate - a.successRate)[0];
  const worst = analysis[analysis.length - 1];

  log.info(
    { tenantId, analysis, best: best?.actionType, worst: worst?.actionType },
    "feedbackLoop/churn: análise de efetividade de ações (últimos 30 dias)"
  );

  if (best && best.successRate > 0.6) {
    log.info(
      { tenantId, actionType: best.actionType, successRate: best.successRate },
      "feedbackLoop/churn: recomendação — priorizar esta ação de retenção"
    );
  }
}

// ─── Análise 2: Conversão de leads do Prospector ──────────────────────────────
async function analyzeProspectorConversion(
  tenantId: string,
  log: Logger
): Promise<void> {
  const rows = await db
    .select({
      total: sql<number>`count(*)`.mapWith(Number),
      converted: sql<number>`count(*) filter (where ${prospectFeedbackTable.converted} = true)`.mapWith(Number),
      avgRating: sql<number>`avg(${prospectFeedbackTable.rating})`.mapWith(Number),
    })
    .from(prospectFeedbackTable)
    .innerJoin(leadsTable, eq(leadsTable.id, prospectFeedbackTable.leadId))
    .where(eq(leadsTable.tenantId, tenantId));

  const [stats] = rows;
  if (!stats || stats.total < 5) {
    log.info({ tenantId }, "feedbackLoop/prospector: poucos feedbacks ainda (mínimo 5)");
    return;
  }

  const convRate = stats.total > 0 ? stats.converted / stats.total : 0;
  log.info(
    {
      tenantId,
      totalFeedbacks: stats.total,
      converted: stats.converted,
      conversionRate: Number(convRate.toFixed(2)),
      avgRating: stats.avgRating ? Number(stats.avgRating.toFixed(1)) : null,
    },
    "feedbackLoop/prospector: taxa de conversão de leads prospectados"
  );

  if (convRate < 0.1) {
    log.warn(
      { tenantId, convRate },
      "feedbackLoop/prospector: taxa de conversão abaixo de 10% — revisar critérios de ICP do Prospector"
    );
  }
}

// ─── Análise 3: Efetividade do Revenue Scout por tipo de oportunidade ─────────
async function analyzeScoutEffectiveness(
  tenantId: string,
  log: Logger
): Promise<void> {
  const rows = await db
    .select({
      tipo: scoutOportunidadesTable.tipo,
      total: sql<number>`count(*)`.mapWith(Number),
      converteu: sql<number>`count(*) filter (where ${scoutOportunidadesTable.converteu} = true)`.mapWith(Number),
      ignorado: sql<number>`count(*) filter (where ${scoutOportunidadesTable.status} = 'ignorado')`.mapWith(Number),
      avgScore: sql<number>`avg(${scoutOportunidadesTable.scoreOportunidade})`.mapWith(Number),
    })
    .from(scoutOportunidadesTable)
    .where(eq(scoutOportunidadesTable.tenantId, tenantId))
    .groupBy(scoutOportunidadesTable.tipo);

  if (rows.length === 0) {
    log.info({ tenantId }, "feedbackLoop/scout: sem oportunidades ainda");
    return;
  }

  const analysis = rows.map((r) => ({
    tipo: r.tipo,
    convRate: r.total > 0 ? Number((r.converteu / r.total).toFixed(2)) : 0,
    ignoreRate: r.total > 0 ? Number((r.ignorado / r.total).toFixed(2)) : 0,
    total: r.total,
    avgScore: r.avgScore ? Number(r.avgScore.toFixed(1)) : null,
  }));

  log.info({ tenantId, analysis }, "feedbackLoop/scout: efetividade por tipo de oportunidade");

  const highIgnore = analysis.filter((a) => a.ignoreRate > 0.5);
  if (highIgnore.length > 0) {
    log.warn(
      { tenantId, tipos: highIgnore.map((h) => h.tipo) },
      "feedbackLoop/scout: tipos com >50% de ignorados — considerar ajustar regras ou mensagem"
    );
  }
}

// ─── Job principal ─────────────────────────────────────────────────────────────

export async function runWeeklyFeedbackLoop(log: Logger): Promise<void> {
  log.info("feedbackLoop: iniciando análise semanal");

  const tenants = await db
    .select({ id: tenantsTable.id, nome: tenantsTable.nomeEmpresa })
    .from(tenantsTable)
    .where(eq(tenantsTable.status, "active"));

  if (tenants.length === 0) {
    log.info("feedbackLoop: nenhum tenant ativo");
    return;
  }

  log.info({ count: tenants.length }, "feedbackLoop: tenants ativos encontrados");

  for (const tenant of tenants) {
    try {
      await analyzeChurnActions(tenant.id, log);
      await analyzeProspectorConversion(tenant.id, log);
      await analyzeScoutEffectiveness(tenant.id, log);
    } catch (err) {
      log.error({ err, tenantId: tenant.id }, "feedbackLoop: erro ao processar tenant (non-fatal)");
    }
  }

  log.info("feedbackLoop: análise semanal concluída");
}
