import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { z } from "zod/v4";

const router: IRouter = Router();

function canAccess(req: any, tenantId: string) {
  return req.user?.platformRole === "super_admin" || req.user?.tenantId === tenantId;
}

const KPI_DICTIONARY = [
  { key: "new_leads", label: "Leads novos", source: "leads.created_at", formula: "Leads válidos criados no período", availability: "native" },
  { key: "active_opportunities", label: "Oportunidades ativas", source: "deals.etapa + leads", formula: "Deals ativos vinculados a leads válidos, não excluídos e não classificados como não-lead", availability: "native" },
  { key: "confirmed_sales", label: "Vendas confirmadas", source: "deals.etapa + data_fechamento/won_at", formula: "Deals ganhos cuja data real de fechamento está no período", availability: "native" },
  { key: "sold_revenue", label: "Receita vendida", source: "deals.valor", formula: "Soma do valor dos deals ganhos no período", availability: "native" },
  { key: "average_ticket", label: "Ticket médio", source: "deals.valor", formula: "Receita vendida / vendas confirmadas", availability: "native" },
  { key: "commercial_conversion", label: "Conversão comercial", source: "deals + leads", formula: "Deals válidos ganhos criados no período / oportunidades válidas criadas no período", availability: "native" },
  { key: "overdue_tasks", label: "Tarefas vencidas", source: "activities", formula: "Atividades pendentes ou planejadas com vencimento anterior a agora", availability: "native" },
  { key: "unassigned_leads", label: "Leads sem responsável", source: "leads.assigned_to", formula: "Leads ativos e válidos sem responsável definido", availability: "native" },
  { key: "execution_active", label: "Execução ativa", source: "work_cards", formula: "Cards de execução não terminais", availability: "native" },
  { key: "support_active", label: "Suporte ativo", source: "work_cards", formula: "Cards de suporte não terminais", availability: "native" },
  { key: "customers_at_risk", label: "Clientes em risco", source: "customer_intelligence.churn_risk", formula: "Leads válidos com churnRisk > 60 e não encerrados", availability: "native" },
  { key: "ai_actions_executed", label: "Ações executadas pela IA", source: "agent_actions_log", formula: "Ações com status executed no período", availability: "native" },
  { key: "stage_time", label: "Tempo por etapa", source: "process_stage_events", formula: "Duração real entre entrada e saída, excluindo backfill sem histórico", availability: "historical" },
  { key: "stage_sla", label: "SLA por etapa", source: "process_stage_events + process_stage_policies", formula: "Duração real comparada ao SLA configurado", availability: "historical" },
  { key: "goal_progress", label: "Meta x realizado", source: "business_goals + fontes transacionais", formula: "Realizado oficial / meta ativa", availability: "configured" },
  { key: "csat", label: "CSAT", source: "customer_feedback", formula: "Média normalizada das respostas CSAT", availability: "feedback" },
  { key: "nps", label: "NPS", source: "customer_feedback", formula: "% promotores - % detratores", availability: "feedback" },
  { key: "marketing_roas", label: "ROAS", source: "Meta/Google Ads + atribuição", formula: "Receita atribuída / investimento confirmado", availability: "integration" },
] as const;

type GoalRow = {
  id: string;
  metric_key: string;
  label: string;
  period_type: string;
  target_value: string | number;
  unit: string;
  starts_at: Date | string;
  ends_at: Date | string;
  responsible_id: string | null;
  team_key: string | null;
  responsible_name?: string | null;
};

const validCommercialDealSql = (dealAlias: string) => sql.raw(`
  EXISTS (
    SELECT 1
    FROM leads l
    WHERE l.id = ${dealAlias}.lead_id
      AND l.tenant_id = ${dealAlias}.tenant_id
      AND l.excluido_em IS NULL
      AND l.nao_lead_tipo IS NULL
  )
`);

async function calculateGoalActual(tenantId: string, goal: GoalRow): Promise<number | null> {
  const start = new Date(goal.starts_at);
  const end = new Date(goal.ends_at);
  const responsibleId = goal.responsible_id ?? null;

  if (goal.metric_key === "new_leads") {
    const result = await db.execute(sql`
      SELECT count(*)::int AS actual
      FROM leads l
      WHERE l.tenant_id = ${tenantId}
        AND l.nao_lead_tipo IS NULL
        AND l.excluido_em IS NULL
        AND l.created_at >= ${start} AND l.created_at <= ${end}
        AND (${responsibleId}::text IS NULL OR l.assigned_to = ${responsibleId})
    `);
    return Number((result.rows[0] as any)?.actual ?? 0);
  }

  if (goal.metric_key === "active_opportunities") {
    const result = await db.execute(sql`
      SELECT count(*)::int AS actual
      FROM deals d
      WHERE d.tenant_id = ${tenantId}
        AND d.etapa NOT IN ('em_aquecimento', 'parceiro', 'em_execucao', 'ganho', 'entregue', 'perdido')
        AND ${validCommercialDealSql("d")}
        AND (${responsibleId}::text IS NULL OR d.assigned_to = ${responsibleId})
    `);
    return Number((result.rows[0] as any)?.actual ?? 0);
  }

  if (["confirmed_sales", "sold_revenue", "average_ticket"].includes(goal.metric_key)) {
    const result = await db.execute(sql`
      WITH won AS (
        SELECT d.*, COALESCE(d.data_fechamento, d.won_at, d.updated_at) AS closed_at
        FROM deals d
        WHERE d.tenant_id = ${tenantId}
          AND d.etapa = 'ganho'
          AND ${validCommercialDealSql("d")}
          AND (${responsibleId}::text IS NULL OR d.assigned_to = ${responsibleId})
      )
      SELECT
        count(*) FILTER (WHERE closed_at >= ${start} AND closed_at <= ${end})::int AS confirmed_sales,
        COALESCE(sum(valor) FILTER (WHERE closed_at >= ${start} AND closed_at <= ${end}), 0)::numeric AS sold_revenue,
        COALESCE(avg(valor) FILTER (WHERE closed_at >= ${start} AND closed_at <= ${end} AND valor IS NOT NULL), 0)::numeric AS average_ticket
      FROM won
    `);
    const row = (result.rows[0] ?? {}) as any;
    if (goal.metric_key === "confirmed_sales") return Number(row.confirmed_sales ?? 0);
    if (goal.metric_key === "sold_revenue") return Number(row.sold_revenue ?? 0);
    return Number(row.average_ticket ?? 0);
  }

  if (goal.metric_key === "commercial_conversion") {
    const result = await db.execute(sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE etapa = 'ganho')::int AS won
      FROM deals d
      WHERE d.tenant_id = ${tenantId}
        AND d.created_at >= ${start} AND d.created_at <= ${end}
        AND d.etapa NOT IN ('em_aquecimento','parceiro','em_execucao','entregue')
        AND ${validCommercialDealSql("d")}
        AND (${responsibleId}::text IS NULL OR d.assigned_to = ${responsibleId})
    `);
    const row = (result.rows[0] ?? {}) as any;
    const total = Number(row.total ?? 0);
    return total > 0 ? (Number(row.won ?? 0) / total) * 100 : 0;
  }

  if (goal.metric_key === "ai_actions_executed") {
    if (responsibleId) return null;
    const result = await db.execute(sql`
      SELECT count(*)::int AS actual
      FROM agent_actions_log
      WHERE tenant_id = ${tenantId}
        AND status = 'executed'
        AND created_at >= ${start} AND created_at <= ${end}
    `);
    return Number((result.rows[0] as any)?.actual ?? 0);
  }

  return null;
}

router.get("/tenants/:tenantId/dashboard/metric-definitions", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  return res.json({ version: 1, definitions: KPI_DICTIONARY });
});

router.get("/tenants/:tenantId/dashboard/command-center", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });

  const now = new Date();
  const startParam = typeof req.query.start === "string" ? new Date(req.query.start) : null;
  const endParam = typeof req.query.end === "string" ? new Date(req.query.end) : null;
  const periodStart = startParam && !Number.isNaN(startParam.getTime())
    ? startParam
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const periodEnd = endParam && !Number.isNaN(endParam.getTime()) ? endParam : now;

  const [core, operational, intelligence, ai, stageRows, currentCommercialStages, goals, feedback, integrations, dataQuality] = await Promise.all([
    db.execute(sql`
      WITH won AS (
        SELECT d.*, COALESCE(d.data_fechamento, d.won_at, d.updated_at) AS closed_at
        FROM deals d
        WHERE d.tenant_id = ${tenantId}
          AND d.etapa = 'ganho'
          AND ${validCommercialDealSql("d")}
      ), created_deals AS (
        SELECT d.* FROM deals d
        WHERE d.tenant_id = ${tenantId}
          AND d.created_at >= ${periodStart} AND d.created_at <= ${periodEnd}
          AND d.etapa NOT IN ('em_aquecimento','parceiro','em_execucao','entregue')
          AND ${validCommercialDealSql("d")}
      )
      SELECT
        (SELECT count(*)::int FROM leads l
          WHERE l.tenant_id = ${tenantId}
            AND l.nao_lead_tipo IS NULL
            AND l.excluido_em IS NULL
            AND l.created_at >= ${periodStart} AND l.created_at <= ${periodEnd}) AS new_leads,
        (SELECT count(*)::int FROM deals d
          WHERE d.tenant_id = ${tenantId}
            AND d.etapa NOT IN ('em_aquecimento','parceiro','em_execucao','ganho','entregue','perdido')
            AND ${validCommercialDealSql("d")}) AS active_opportunities,
        (SELECT COALESCE(sum(d.valor), 0)::numeric FROM deals d
          WHERE d.tenant_id = ${tenantId}
            AND d.etapa NOT IN ('em_aquecimento','parceiro','em_execucao','ganho','entregue','perdido')
            AND ${validCommercialDealSql("d")}) AS active_pipeline_value,
        (SELECT count(*)::int FROM won w
          WHERE w.closed_at >= ${periodStart} AND w.closed_at <= ${periodEnd}) AS confirmed_sales,
        (SELECT COALESCE(sum(w.valor), 0)::numeric FROM won w
          WHERE w.closed_at >= ${periodStart} AND w.closed_at <= ${periodEnd}) AS sold_revenue,
        (SELECT COALESCE(avg(w.valor), 0)::numeric FROM won w
          WHERE w.closed_at >= ${periodStart} AND w.closed_at <= ${periodEnd} AND w.valor IS NOT NULL) AS average_ticket,
        (SELECT count(*)::int FROM created_deals) AS opportunities_created,
        (SELECT count(*)::int FROM created_deals WHERE etapa = 'ganho') AS opportunities_created_and_won,
        (SELECT count(*)::int FROM leads l
          WHERE l.tenant_id = ${tenantId}
            AND l.nao_lead_tipo IS NULL
            AND l.excluido_em IS NULL
            AND l.assigned_to IS NULL
            AND COALESCE(l.status,'') NOT IN ('cliente','perdido')) AS unassigned_leads,
        (SELECT count(*)::int FROM activities a
          WHERE a.tenant_id = ${tenantId}
            AND a.status IN ('pendente','planejado')
            AND a.data_vencimento IS NOT NULL
            AND a.data_vencimento < ${periodEnd}
            AND EXISTS (
              SELECT 1
              FROM leads l
              WHERE l.id = a.lead_id
                AND l.tenant_id = a.tenant_id
                AND l.excluido_em IS NULL
                AND l.nao_lead_tipo IS NULL
            )) AS overdue_tasks,
        (SELECT COALESCE(json_agg(json_build_object(
            'id', overdue.id,
            'leadId', overdue.lead_id,
            'dealId', overdue.deal_id,
            'title', overdue.titulo,
            'dueAt', overdue.data_vencimento
          ) ORDER BY overdue.data_vencimento ASC), '[]'::json)
          FROM (
            SELECT a.id, a.lead_id, a.deal_id, a.titulo, a.data_vencimento
            FROM activities a
            WHERE a.tenant_id = ${tenantId}
              AND a.status IN ('pendente','planejado')
              AND a.data_vencimento IS NOT NULL
              AND a.data_vencimento < ${periodEnd}
              AND EXISTS (
                SELECT 1
                FROM leads l
                WHERE l.id = a.lead_id
                  AND l.tenant_id = a.tenant_id
                  AND l.excluido_em IS NULL
                  AND l.nao_lead_tipo IS NULL
              )
            ORDER BY a.data_vencimento ASC
            LIMIT 5
          ) overdue) AS overdue_task_items
    `),
    db.execute(sql`
      SELECT
        count(*) FILTER (WHERE pipeline = 'execucao' AND etapa NOT IN ('concluido','cancelado'))::int AS execution_active,
        count(*) FILTER (WHERE pipeline = 'suporte' AND etapa NOT IN ('fechamento_assistencia','cancelado'))::int AS support_active,
        count(*) FILTER (WHERE responsavel_id IS NULL AND etapa NOT IN ('concluido','fechamento_assistencia','cancelado'))::int AS unassigned_active
      FROM work_cards WHERE tenant_id = ${tenantId}
    `),
    db.execute(sql`
      SELECT
        count(*) FILTER (WHERE ci.churn_risk > 60 AND COALESCE(l.status,'') NOT IN ('cliente','perdido'))::int AS customers_at_risk,
        count(*) FILTER (WHERE ci.next_best_action IS NOT NULL AND ci.next_best_action <> '')::int AS with_next_best_action,
        count(*)::int AS intelligence_profiles
      FROM customer_intelligence ci
      JOIN leads l ON l.id = ci.lead_id
      WHERE ci.tenant_id = ${tenantId}
        AND l.nao_lead_tipo IS NULL
        AND l.excluido_em IS NULL
    `),
    db.execute(sql`
      SELECT
        count(*) FILTER (WHERE status = 'executed' AND created_at >= ${periodStart} AND created_at <= ${periodEnd})::int AS executed,
        count(*) FILTER (WHERE status = 'pending')::int AS pending,
        count(*) FILTER (WHERE status = 'rejected' AND created_at >= ${periodStart} AND created_at <= ${periodEnd})::int AS rejected
      FROM agent_actions_log WHERE tenant_id = ${tenantId}
    `),
    db.execute(sql`
      SELECT
        e.pipeline,
        e.to_stage AS stage_key,
        COALESCE(p.label, e.to_stage) AS label,
        p.sla_minutes,
        count(*) FILTER (WHERE e.exited_at IS NOT NULL AND e.origin <> 'backfill_current_state')::int AS completed_samples,
        round(avg(e.duration_seconds) FILTER (WHERE e.duration_seconds IS NOT NULL AND e.origin <> 'backfill_current_state'))::int AS avg_duration_seconds,
        (percentile_cont(0.5) WITHIN GROUP (ORDER BY e.duration_seconds)
          FILTER (WHERE e.duration_seconds IS NOT NULL AND e.origin <> 'backfill_current_state'))::int AS median_duration_seconds,
        count(*) FILTER (
          WHERE e.duration_seconds IS NOT NULL
            AND e.origin <> 'backfill_current_state'
            AND p.sla_minutes IS NOT NULL
            AND e.duration_seconds > p.sla_minutes * 60
        )::int AS sla_breaches,
        count(*) FILTER (WHERE e.exited_at IS NULL AND e.origin <> 'backfill_current_state')::int AS event_active_count
      FROM process_stage_events e
      LEFT JOIN process_stage_policies p
        ON p.tenant_id = e.tenant_id AND p.pipeline = e.pipeline AND p.stage_key = e.to_stage AND p.active = true
      WHERE e.tenant_id = ${tenantId}
        AND e.pipeline = 'comercial'
        AND e.to_stage NOT IN ('em_aquecimento','parceiro','em_execucao','ganho','entregue','perdido')
      GROUP BY e.pipeline, e.to_stage, p.label, p.sla_minutes, p.position
      ORDER BY e.pipeline, COALESCE(p.position, 999), e.to_stage
    `),
    db.execute(sql`
      SELECT
        d.etapa AS stage_key,
        COALESCE(
          p.label,
          CASE d.etapa
            WHEN 'novo' THEN 'Novo'
            WHEN 'qualificado' THEN 'Qualificado'
            WHEN 'proposta' THEN 'Orçamento'
            WHEN 'negociacao' THEN 'Negociação'
            WHEN 'conferencia_estoque' THEN 'Fechamento'
            WHEN 'contrato' THEN 'Contrato'
            ELSE initcap(replace(d.etapa::text, '_', ' '))
          END
        ) AS label,
        count(*)::int AS active_count,
        COALESCE(sum(d.valor), 0)::numeric AS active_value,
        COALESCE(p.position,
          CASE d.etapa
            WHEN 'novo' THEN 10
            WHEN 'qualificado' THEN 20
            WHEN 'proposta' THEN 30
            WHEN 'negociacao' THEN 40
            WHEN 'conferencia_estoque' THEN 50
            WHEN 'contrato' THEN 60
            ELSE 900
          END
        ) AS position
      FROM deals d
      LEFT JOIN process_stage_policies p
        ON p.tenant_id = d.tenant_id
       AND p.pipeline = 'comercial'
       AND p.stage_key = d.etapa::text
       AND p.active = true
      WHERE d.tenant_id = ${tenantId}
        AND d.etapa NOT IN ('em_aquecimento','parceiro','em_execucao','ganho','entregue','perdido')
        AND ${validCommercialDealSql("d")}
      GROUP BY d.etapa, p.label, p.position
      ORDER BY position, d.etapa
    `),
    db.execute(sql`
      SELECT g.id, g.metric_key, g.label, g.period_type, g.target_value, g.unit, g.starts_at, g.ends_at,
             g.responsible_id, g.team_key, u.name AS responsible_name
      FROM business_goals g
      LEFT JOIN users u ON u.id = g.responsible_id AND u.tenant_id = g.tenant_id
      WHERE g.tenant_id = ${tenantId} AND g.active = true
        AND g.starts_at <= ${periodEnd} AND g.ends_at >= ${periodStart}
      ORDER BY g.starts_at DESC
    `),
    db.execute(sql`
      SELECT
        count(*) FILTER (WHERE feedback_type = 'csat')::int AS csat_responses,
        avg(score) FILTER (WHERE feedback_type = 'csat' AND score IS NOT NULL) AS csat_average,
        count(*) FILTER (WHERE feedback_type = 'nps' AND score IS NOT NULL)::int AS nps_responses,
        count(*) FILTER (WHERE feedback_type = 'nps' AND score >= 9)::int AS nps_promoters,
        count(*) FILTER (WHERE feedback_type = 'nps' AND score <= 6)::int AS nps_detractors
      FROM customer_feedback
      WHERE tenant_id = ${tenantId}
        AND responded_at >= ${periodStart} AND responded_at <= ${periodEnd}
    `),
    db.execute(sql`
      SELECT
        EXISTS(SELECT 1 FROM meta_ads_connections m WHERE m.tenant_id = ${tenantId} AND COALESCE(m.status,'') IN ('connected','active')) AS meta_ads,
        EXISTS(SELECT 1 FROM google_ads_connections g WHERE g.tenant_id = ${tenantId} AND COALESCE(g.status,'') IN ('connected','active')) AS google_ads
    `),
    db.execute(sql`
      SELECT
        count(*)::int AS valid_leads,
        count(*) FILTER (WHERE COALESCE(trim(nome),'') = '')::int AS missing_name,
        count(*) FILTER (WHERE COALESCE(trim(telefone),'') = '' AND COALESCE(trim(email),'') = '')::int AS missing_contact,
        count(*) FILTER (WHERE COALESCE(trim(source),'') = '')::int AS missing_origin
      FROM leads
      WHERE tenant_id = ${tenantId} AND nao_lead_tipo IS NULL AND excluido_em IS NULL
    `),
  ]);

  const c = (core.rows[0] ?? {}) as any;
  const o = (operational.rows[0] ?? {}) as any;
  const i = (intelligence.rows[0] ?? {}) as any;
  const a = (ai.rows[0] ?? {}) as any;
  const f = (feedback.rows[0] ?? {}) as any;
  const integ = (integrations.rows[0] ?? {}) as any;
  const dq = (dataQuality.rows[0] ?? {}) as any;

  const created = Number(c.opportunities_created ?? 0);
  const createdWon = Number(c.opportunities_created_and_won ?? 0);
  const conversion = created > 0 ? createdWon / created : null;

  const npsCount = Number(f.nps_responses ?? 0);
  const nps = npsCount > 0
    ? ((Number(f.nps_promoters ?? 0) - Number(f.nps_detractors ?? 0)) / npsCount) * 100
    : null;

  const validLeads = Number(dq.valid_leads ?? 0);
  const incomplete = Number(dq.missing_name ?? 0) + Number(dq.missing_contact ?? 0) + Number(dq.missing_origin ?? 0);
  const qualityScore = validLeads > 0
    ? Math.max(0, 100 - (incomplete / (validLeads * 3)) * 100)
    : null;

  const goalRows = await Promise.all((goals.rows as GoalRow[]).map(async (g) => {
    const actual = await calculateGoalActual(tenantId, g);
    const target = Number(g.target_value ?? 0);
    return {
      id: g.id,
      metricKey: g.metric_key,
      label: g.label,
      unit: g.unit,
      periodType: g.period_type,
      startsAt: g.starts_at,
      endsAt: g.ends_at,
      target,
      actual,
      progress: actual != null && target > 0 ? actual / target : null,
      scope: g.responsible_id ? "seller" : g.team_key ? "team" : "company",
      responsibleId: g.responsible_id,
      responsibleName: g.responsible_name ?? null,
      teamKey: g.team_key,
    };
  }));

  const historicalStageMap = new Map(
    (stageRows.rows as any[]).map((row) => [String(row.stage_key), row]),
  );
  const currentStageMap = new Map(
    (currentCommercialStages.rows as any[]).map((row) => [String(row.stage_key), row]),
  );
  const stageKeys = Array.from(new Set([...historicalStageMap.keys(), ...currentStageMap.keys()]));

  const stageMetrics = stageKeys
    .map((stageKey) => {
      const history = historicalStageMap.get(stageKey) as any;
      const current = currentStageMap.get(stageKey) as any;
      return {
        pipeline: "comercial",
        stageKey,
        label: current?.label ?? history?.label ?? stageKey,
        slaMinutes: history?.sla_minutes == null ? null : Number(history.sla_minutes),
        completedSamples: Number(history?.completed_samples ?? 0),
        avgDurationSeconds: history?.avg_duration_seconds == null ? null : Number(history.avg_duration_seconds),
        medianDurationSeconds: history?.median_duration_seconds == null ? null : Number(history.median_duration_seconds),
        slaBreaches: Number(history?.sla_breaches ?? 0),
        activeWithRealEntry: Number(current?.active_count ?? 0),
        activeValue: Number(current?.active_value ?? 0),
        position: Number(current?.position ?? 999),
        historical: Number(history?.completed_samples ?? 0) > 0,
      };
    })
    .sort((a, b) => a.position - b.position || a.stageKey.localeCompare(b.stageKey));

  const commercialStageTotal = stageMetrics.reduce((sum, row) => sum + row.activeWithRealEntry, 0);
  const commercialStageValue = stageMetrics.reduce((sum, row) => sum + row.activeValue, 0);
  const commercialActive = Number(c.active_opportunities ?? 0);
  const commercialValue = Number(c.active_pipeline_value ?? 0);
  const countMatches = commercialStageTotal === commercialActive;
  const valueMatches = Math.abs(commercialStageValue - commercialValue) < 0.01;
  const commercialReconciled = countMatches && valueMatches;

  return res.json({
    version: 1,
    period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
    definitions: KPI_DICTIONARY,
    commercial: {
      newLeads: Number(c.new_leads ?? 0),
      activeOpportunities: Number(c.active_opportunities ?? 0),
      activePipelineValue: Number(c.active_pipeline_value ?? 0),
      confirmedSales: Number(c.confirmed_sales ?? 0),
      soldRevenue: Number(c.sold_revenue ?? 0),
      averageTicket: Number(c.average_ticket ?? 0),
      commercialConversion: conversion,
      conversionDenominator: created,
      conversionNumerator: createdWon,
      unassignedLeads: Number(c.unassigned_leads ?? 0),
      closingDateRule: "COALESCE(data_fechamento, won_at, updated_at)",
    },
    operation: {
      executionActive: Number(o.execution_active ?? 0),
      supportActive: Number(o.support_active ?? 0),
      unassignedActive: Number(o.unassigned_active ?? 0),
      overdueTasks: Number(c.overdue_tasks ?? 0),
      overdueTaskItems: Array.isArray(c.overdue_task_items) ? c.overdue_task_items : [],
    },
    intelligence: {
      customersAtRisk: Number(i.customers_at_risk ?? 0),
      withNextBestAction: Number(i.with_next_best_action ?? 0),
      profiles: Number(i.intelligence_profiles ?? 0),
    },
    ai: {
      actionsExecuted: Number(a.executed ?? 0),
      actionsPending: Number(a.pending ?? 0),
      actionsRejected: Number(a.rejected ?? 0),
    },
    stages: stageMetrics,
    reconciliation: {
      commercial: {
        activeOpportunities: commercialActive,
        stageActiveTotal: commercialStageTotal,
        pipelineValue: commercialValue,
        stageValueTotal: commercialStageValue,
        countMatches,
        valueMatches,
        consistent: commercialReconciled,
      },
    },
    goals: goalRows,
    feedback: {
      csat: Number(f.csat_responses ?? 0) > 0 ? Number(f.csat_average) : null,
      csatResponses: Number(f.csat_responses ?? 0),
      nps,
      npsResponses: npsCount,
    },
    marketing: {
      metaAdsConnected: Boolean(integ.meta_ads),
      googleAdsConnected: Boolean(integ.google_ads),
      roas: null,
      cpl: null,
      status: integ.meta_ads || integ.google_ads ? "connected_metrics_pending_sync" : "integration_required",
      note: "ROAS/CPL permanecem nulos até existir investimento sincronizado e atribuição confirmada. Nunca são simulados.",
    },
    dataQuality: {
      validLeads,
      missingName: Number(dq.missing_name ?? 0),
      missingContact: Number(dq.missing_contact ?? 0),
      missingOrigin: Number(dq.missing_origin ?? 0),
      score: qualityScore == null ? null : Math.round(qualityScore * 10) / 10,
    },
    guarantees: {
      placeholders: false,
      missingDataReturnedAsNull: true,
      historicalStageDurationsExcludeBackfill: true,
      sourceOfTruth: "transactional_database",
    },
  });
});

const goalSchema = z.object({
  metricKey: z.enum(["new_leads", "confirmed_sales", "sold_revenue", "active_opportunities", "average_ticket", "commercial_conversion", "ai_actions_executed"]),
  label: z.string().min(2).max(120),
  targetValue: z.number().nonnegative(),
  unit: z.enum(["count", "currency", "percent"]).default("count"),
  periodType: z.enum(["weekly", "monthly", "quarterly", "yearly", "custom"]).default("monthly"),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  responsibleId: z.string().nullable().optional(),
  teamKey: z.string().nullable().optional(),
});

router.get("/tenants/:tenantId/business-goals", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const result = await db.execute(sql`
    SELECT g.*, u.name AS responsible_name
    FROM business_goals g
    LEFT JOIN users u ON u.id = g.responsible_id AND u.tenant_id = g.tenant_id
    WHERE g.tenant_id = ${tenantId}
    ORDER BY g.active DESC, g.starts_at DESC
  `);
  return res.json(result.rows);
});

router.post("/tenants/:tenantId/business-goals", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const parsed = goalSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  if (parsed.data.endsAt <= parsed.data.startsAt) return res.status(422).json({ error: "endsAt deve ser posterior a startsAt" });
  const g = parsed.data;

  if (g.responsibleId) {
    const seller = await db.execute(sql`
      SELECT id FROM users
      WHERE id = ${g.responsibleId}
        AND tenant_id = ${tenantId}
        AND active = true
        AND user_function = 'vendedor'
      LIMIT 1
    `);
    if (!seller.rows[0]) return res.status(422).json({ error: "Vendedor inválido ou inativo para este tenant" });
    if (g.metricKey === "ai_actions_executed") return res.status(422).json({ error: "Ações de IA não possuem apuração individual por vendedor" });
  }

  const duplicate = await db.execute(sql`
    SELECT id FROM business_goals
    WHERE tenant_id = ${tenantId}
      AND metric_key = ${g.metricKey}
      AND starts_at = ${g.startsAt}
      AND ends_at = ${g.endsAt}
      AND COALESCE(responsible_id, '') = COALESCE(${g.responsibleId ?? null}, '')
      AND COALESCE(team_key, '') = COALESCE(${g.teamKey ?? null}, '')
      AND active = true
    LIMIT 1
  `);
  if (duplicate.rows[0]) return res.status(409).json({ error: "Já existe uma meta ativa para este indicador, escopo e período" });

  const result = await db.execute(sql`
    INSERT INTO business_goals (
      tenant_id, metric_key, label, period_type, target_value, unit,
      starts_at, ends_at, responsible_id, team_key
    ) VALUES (
      ${tenantId}, ${g.metricKey}, ${g.label}, ${g.periodType}, ${g.targetValue}, ${g.unit},
      ${g.startsAt}, ${g.endsAt}, ${g.responsibleId ?? null}, ${g.teamKey ?? null}
    ) RETURNING *
  `);
  return res.status(201).json(result.rows[0]);
});

router.patch("/tenants/:tenantId/business-goals/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const schema = z.object({ active: z.boolean() });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const result = await db.execute(sql`
    UPDATE business_goals SET active = ${parsed.data.active}, updated_at = now()
    WHERE id = ${String(req.params.id)} AND tenant_id = ${tenantId}
    RETURNING *
  `);
  if (!result.rows[0]) return res.status(404).json({ error: "Meta não encontrada" });
  return res.json(result.rows[0]);
});

const feedbackSchema = z.object({
  leadId: z.string().nullable().optional(),
  dealId: z.string().nullable().optional(),
  workCardId: z.string().nullable().optional(),
  feedbackType: z.enum(["csat", "nps", "entrega", "assistencia"]),
  score: z.number().nullable().optional(),
  scaleMin: z.number().nullable().optional(),
  scaleMax: z.number().nullable().optional(),
  answer: z.string().max(200).nullable().optional(),
  comment: z.string().max(4000).nullable().optional(),
  channel: z.string().max(80).nullable().optional(),
});

router.post("/tenants/:tenantId/customer-feedback", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const parsed = feedbackSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const f = parsed.data;
  if (f.feedbackType === "nps" && f.score != null && (f.score < 0 || f.score > 10)) {
    return res.status(422).json({ error: "NPS deve estar entre 0 e 10" });
  }
  const result = await db.execute(sql`
    INSERT INTO customer_feedback (
      tenant_id, lead_id, deal_id, work_card_id, feedback_type, score,
      scale_min, scale_max, answer, comment, channel
    ) VALUES (
      ${tenantId}, ${f.leadId ?? null}, ${f.dealId ?? null}, ${f.workCardId ?? null}, ${f.feedbackType},
      ${f.score ?? null}, ${f.scaleMin ?? null}, ${f.scaleMax ?? null}, ${f.answer ?? null},
      ${f.comment ?? null}, ${f.channel ?? null}
    ) RETURNING *
  `);
  return res.status(201).json(result.rows[0]);
});

router.get("/tenants/:tenantId/process-stage-policies", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const result = await db.execute(sql`
    SELECT * FROM process_stage_policies
    WHERE tenant_id = ${tenantId} AND active = true
    ORDER BY pipeline, position, stage_key
  `);
  return res.json(result.rows);
});

router.patch("/tenants/:tenantId/process-stage-policies/:id", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) return res.status(403).json({ error: "Forbidden" });
  const parsed = z.object({
    slaMinutes: z.number().int().positive().nullable().optional(),
    criticality: z.enum(["low", "normal", "high", "critical"]).optional(),
    visibleOnDashboard: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });
  const p = parsed.data;
  const result = await db.execute(sql`
    UPDATE process_stage_policies
    SET sla_minutes = COALESCE(${p.slaMinutes === undefined ? null : p.slaMinutes}, sla_minutes),
        criticality = COALESCE(${p.criticality ?? null}, criticality),
        visible_on_dashboard = COALESCE(${p.visibleOnDashboard === undefined ? null : p.visibleOnDashboard}, visible_on_dashboard),
        updated_at = now()
    WHERE id = ${String(req.params.id)} AND tenant_id = ${tenantId}
    RETURNING *
  `);
  if (!result.rows[0]) return res.status(404).json({ error: "Política não encontrada" });
  return res.json(result.rows[0]);
});

export default router;
