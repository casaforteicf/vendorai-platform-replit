import { Router, type IRouter, type Request } from "express";
import {
  and, eq, count, sql, desc, gte, isNotNull, lte,
} from "drizzle-orm";
import {
  db,
  agentActionsLogTable,
  leadsTable,
  dealsTable,
  messagesTable,
  customerIntelligenceTable,
  agentTasksTable,
  propostasTable,
  conversationsTable,
  agendamentosTable,
  activitiesTable,
  churnActionsTable,
  scoutOportunidadesTable,
  campaignsTable,
  campaignSentLogsTable,
  prospectorQueueTable,
} from "@workspace/db";

import { canonicalDealValueSql } from "../lib/deal-value.js";

const router: IRouter = Router();

function getTenantId(req: Request): string {
  return (req as any).user?.tenantId as string;
}
function canAccess(req: Request, tid: string) {
  const role = (req as any).user?.platformRole;
  return role === "super_admin" || getTenantId(req) === tid;
}

// ─── Agent Performance ────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/analytics/agents", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccess(req, tid)) { res.status(403).json({ error: "Forbidden" }); return; }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [agentActions, agentTasks, messagesByAgent, dealConversions, pipelineAIActions] = await Promise.all([
    // Ações por agente (últimos 30 dias)
    db
      .select({
        agentName: agentActionsLogTable.agentName,
        total: count(),
        executed: sql<number>`count(*) filter (where ${agentActionsLogTable.status} = 'executed')`.mapWith(Number),
        approved: sql<number>`count(*) filter (where ${agentActionsLogTable.status} = 'approved')`.mapWith(Number),
        rejected: sql<number>`count(*) filter (where ${agentActionsLogTable.status} = 'rejected')`.mapWith(Number),
        pending: sql<number>`count(*) filter (where ${agentActionsLogTable.status} = 'pending')`.mapWith(Number),
      })
      .from(agentActionsLogTable)
      .where(and(eq(agentActionsLogTable.tenantId, tid), gte(agentActionsLogTable.createdAt, thirtyDaysAgo)))
      .groupBy(agentActionsLogTable.agentName),

    // Tarefas de agente por status
    db
      .select({
        agentName: agentTasksTable.agentName,
        total: count(),
        completed: sql<number>`count(*) filter (where ${agentTasksTable.status} = 'concluido')`.mapWith(Number),
        failed: sql<number>`count(*) filter (where ${agentTasksTable.status} in ('erro', 'rejeitado'))`.mapWith(Number),
        pending: sql<number>`count(*) filter (where ${agentTasksTable.status} in ('pendente_aprovacao', 'aprovado', 'executando'))`.mapWith(Number),
      })
      .from(agentTasksTable)
      .where(and(eq(agentTasksTable.tenantId, tid), gte(agentTasksTable.createdAt, thirtyDaysAgo)))
      .groupBy(agentTasksTable.agentName),

    // Mensagens enviadas por canal (inferindo agente)
    db
      .select({
        canal: messagesTable.canal,
        total: count(),
      })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.tenantId, tid),
          eq(messagesTable.direcao, "saida"),
          gte(messagesTable.createdAt, thirtyDaysAgo),
        ),
      )
      .groupBy(messagesTable.canal),

    // Deals convertidos por canal de origem do lead
    db
      .select({
        source: leadsTable.source,
        total: count(),
        valor: sql<string>`sum(${canonicalDealValueSql})::text`,
      })
      .from(dealsTable)
      .innerJoin(leadsTable, eq(dealsTable.leadId, leadsTable.id))
      .where(
        and(
          eq(dealsTable.tenantId, tid),
          eq(dealsTable.etapa, "ganho"),
          gte(dealsTable.updatedAt, thirtyDaysAgo),
        ),
      )
      .groupBy(leadsTable.source),

    // Movimentações de pipeline executadas/sugeridas pela IA
    db
      .select({
        agentName: agentActionsLogTable.agentName,
        actionType: agentActionsLogTable.actionType,
        total: count(),
        executed: sql<number>`count(*) filter (where ${agentActionsLogTable.status} = 'executed')`.mapWith(Number),
        pending: sql<number>`count(*) filter (where ${agentActionsLogTable.status} = 'pending')`.mapWith(Number),
        approved: sql<number>`count(*) filter (where ${agentActionsLogTable.status} = 'approved')`.mapWith(Number),
        rejected: sql<number>`count(*) filter (where ${agentActionsLogTable.status} = 'rejected')`.mapWith(Number),
      })
      .from(agentActionsLogTable)
      .where(and(
        eq(agentActionsLogTable.tenantId, tid),
        eq(agentActionsLogTable.actionType, "pipeline_stage_transition"),
        gte(agentActionsLogTable.createdAt, thirtyDaysAgo),
      ))
      .groupBy(agentActionsLogTable.agentName, agentActionsLogTable.actionType),
  ]);

  // Merge agent performance
  const agentMap = new Map<string, Record<string, unknown>>();
  for (const a of agentActions) {
    agentMap.set(a.agentName, {
      agentName: a.agentName,
      actions: {
        total: Number(a.total),
        executed: Number(a.executed),
        approved: Number(a.approved),
        rejected: Number(a.rejected),
        pending: Number(a.pending),
      },
      tasks: { total: 0, completed: 0, failed: 0, pending: 0 },
    });
  }
  for (const t of agentTasks) {
    const existing = agentMap.get(t.agentName) ?? {
      agentName: t.agentName,
      actions: { total: 0, executed: 0, approved: 0, rejected: 0, pending: 0 },
      tasks: { total: 0, completed: 0, failed: 0, pending: 0 },
    };
    existing.tasks = {
      total: Number(t.total),
      completed: Number(t.completed),
      failed: Number(t.failed),
      pending: Number(t.pending),
    };
    agentMap.set(t.agentName, existing);
  }

  res.json({
    periodo: "30d",
    agents: Array.from(agentMap.values()),
    messagesByChannel: messagesByAgent.map((m) => ({ canal: m.canal, total: Number(m.total) })),
    dealConversionsBySource: dealConversions.map((d) => ({
      source: d.source ?? "desconhecido",
      total: Number(d.total),
      valor: d.valor ?? "0",
    })),
    pipelineAI: pipelineAIActions.map((row) => ({
      agentName: row.agentName,
      total: Number(row.total),
      executed: Number(row.executed),
      pendingApprovalOrSuggestion: Number(row.pending),
      approved: Number(row.approved),
      rejected: Number(row.rejected),
    })),
  });
});


// ─── Agent Operational Actions ───────────────────────────────────────────────
// Expõe somente diagnóstico e dados mínimos necessários para uma nova tentativa.
// Nunca devolve o payload bruto ao frontend, reduzindo risco de vazar contexto sensível.

router.get("/tenants/:tenantId/analytics/agent-actions", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccess(req, tid)) { res.status(403).json({ error: "Forbidden" }); return; }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({
      id: agentActionsLogTable.id,
      agentName: agentActionsLogTable.agentName,
      actionType: agentActionsLogTable.actionType,
      status: agentActionsLogTable.status,
      payload: agentActionsLogTable.payload,
      createdAt: agentActionsLogTable.createdAt,
    })
    .from(agentActionsLogTable)
    .where(and(
      eq(agentActionsLogTable.tenantId, tid),
      gte(agentActionsLogTable.createdAt, thirtyDaysAgo),
    ))
    .orderBy(desc(agentActionsLogTable.createdAt))
    .limit(100);

  const operational = rows.filter((row) => row.status === "rejected" || row.status === "pending");
  const extractReason = (payload: unknown) => {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Record<string, any>;
    return p.error
      ?? p.result?.error
      ?? p.result?.reason
      ?? p.result?.message
      ?? p.reason
      ?? null;
  };

  const buildRetry = (payload: unknown) => {
    if (!payload || typeof payload !== "object") return null;
    const p = payload as Record<string, any>;
    const goal = typeof p.goal === "string" ? p.goal.trim() : "";
    const startUrl = typeof p.startUrl === "string" ? p.startUrl : undefined;
    const connectionId = typeof p.connectionId === "string" ? p.connectionId : undefined;
    if (!goal || (!startUrl && !connectionId)) return null;
    return { goal, ...(startUrl ? { startUrl } : {}), ...(connectionId ? { connectionId } : {}) };
  };

  const resolutionHint = (status: string, reason: string | null, retryable: boolean) => {
    const normalized = (reason ?? "").toLowerCase();
    if (normalized.includes("auth") || normalized.includes("credential") || normalized.includes("token")) {
      return "Revise a conexão ou credencial do agente e tente novamente.";
    }
    if (normalized.includes("timeout") || normalized.includes("timed out")) {
      return retryable ? "Tente novamente; se persistir, revise a conexão e o tempo limite." : "Revise a conexão e execute novamente pelo agente.";
    }
    if (status === "pending") return "Abra o agente para concluir a aprovação ou a etapa que está aguardando continuidade.";
    if (retryable) return "Tente novamente por aqui; se falhar de novo, abra a configuração do agente.";
    return "Abra a configuração do agente para revisar os dados necessários e executar novamente.";
  };

  res.json({
    periodo: "30d",
    items: operational.map((row) => {
      const reason = extractReason(row.payload);
      const retry = buildRetry(row.payload);
      return {
        id: row.id,
        agentName: row.agentName,
        actionType: row.actionType,
        status: row.status,
        reason,
        resolutionHint: resolutionHint(row.status, reason, Boolean(retry)),
        isRetryable: Boolean(retry),
        retry,
        createdAt: row.createdAt,
      };
    }),
  });
});

// ─── Channel Conversion Analytics ───────────────────────────────────────────

router.get("/tenants/:tenantId/analytics/channels", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccess(req, tid)) { res.status(403).json({ error: "Forbidden" }); return; }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    leadsBySource,
    dealsBySource,
    messagesByChannel,
    avgResponseTime,
  ] = await Promise.all([
    // Leads por canal
    db
      .select({
        source: leadsTable.source,
        total: count(),
        novos: sql<number>`count(*) filter (where ${leadsTable.createdAt} >= ${thirtyDaysAgo})`.mapWith(Number),
      })
      .from(leadsTable)
      .where(eq(leadsTable.tenantId, tid))
      .groupBy(leadsTable.source),

    // Deals ganhos por canal
    db
      .select({
        source: leadsTable.source,
        total: count(),
        valor: sql<string>`sum(${canonicalDealValueSql})::text`,
      })
      .from(dealsTable)
      .innerJoin(leadsTable, eq(dealsTable.leadId, leadsTable.id))
      .where(
        and(
          eq(dealsTable.tenantId, tid),
          eq(dealsTable.etapa, "ganho"),
        ),
      )
      .groupBy(leadsTable.source),

    // Mensagens por canal
    db
      .select({
        canal: messagesTable.canal,
        entrada: sql<number>`count(*) filter (where ${messagesTable.direcao} = 'entrada')`.mapWith(Number),
        saida: sql<number>`count(*) filter (where ${messagesTable.direcao} = 'saida')`.mapWith(Number),
      })
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.tenantId, tid),
          gte(messagesTable.createdAt, thirtyDaysAgo),
        ),
      )
      .groupBy(messagesTable.canal),

    // Tempo médio de resposta — window fn (lag) calculado em subquery,
    // avg aplicado na query externa para evitar "aggregate over window function"
    db.execute<{ canal: string; avgSeconds: string | null }>(sql`
      SELECT canal, avg(diff_seconds)::text AS "avgSeconds"
      FROM (
        SELECT
          canal,
          extract(epoch from (
            created_at - lag(created_at) OVER (
              PARTITION BY conversation_id ORDER BY created_at
            )
          )) AS diff_seconds
        FROM messages
        WHERE tenant_id = ${tid}
          AND direcao = 'saida'
          AND created_at >= ${thirtyDaysAgo}
      ) rt_sub
      WHERE diff_seconds IS NOT NULL
      GROUP BY canal
    `),
  ]);

  res.json({
    periodo: "30d",
    leadsBySource: leadsBySource.map((r) => ({
      source: r.source ?? "desconhecido",
      total: Number(r.total),
      novos: Number(r.novos),
    })),
    dealsBySource: dealsBySource.map((r) => ({
      source: r.source ?? "desconhecido",
      total: Number(r.total),
      valor: r.valor ?? "0",
    })),
    messagesByChannel: messagesByChannel.map((r) => ({
      canal: r.canal ?? "desconhecido",
      entrada: Number(r.entrada),
      saida: Number(r.saida),
    })),
    avgResponseTimeSeconds: avgResponseTime.rows.map((r) => ({
      canal: (r.canal as string) ?? "desconhecido",
      avgSeconds: r.avgSeconds ? Number(Number(r.avgSeconds as string).toFixed(0)) : null,
    })),
  });
});

// ─── Customer Intelligence Analytics ──────────────────────────────────────────

router.get("/tenants/:tenantId/analytics/intelligence", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccess(req, tid)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [
    churnDist,
    journeyStageDist,
    behaviorScore,
    topChurn,
    intentAnalysis,
    totalAnalyzed,
  ] = await Promise.all([
    // Distribuição de churn risk
    db
      .select({
        baixo: sql<number>`count(*) filter (where ${customerIntelligenceTable.churnRisk} < 30)`.mapWith(Number),
        medio: sql<number>`count(*) filter (where ${customerIntelligenceTable.churnRisk} >= 30 and ${customerIntelligenceTable.churnRisk} <= 70)`.mapWith(Number),
        alto: sql<number>`count(*) filter (where ${customerIntelligenceTable.churnRisk} > 70)`.mapWith(Number),
      })
      .from(customerIntelligenceTable)
      .where(and(eq(customerIntelligenceTable.tenantId, tid), isNotNull(customerIntelligenceTable.churnRisk))),

    // Distribuição de journey stage
    db
      .select({
        stage: customerIntelligenceTable.journeyStage,
        total: count(),
      })
      .from(customerIntelligenceTable)
      .where(and(eq(customerIntelligenceTable.tenantId, tid), isNotNull(customerIntelligenceTable.journeyStage)))
      .groupBy(customerIntelligenceTable.journeyStage),

    // Score médio de comportamento — cast seguro jsonb→numeric via CASE WHEN
    // (avg/max/min não existem para jsonb no PostgreSQL)
    db
      .select({
        avg: sql<string>`avg(CASE WHEN jsonb_typeof(${customerIntelligenceTable.behaviorScore}) = 'number' THEN (${customerIntelligenceTable.behaviorScore}::text)::numeric ELSE NULL END)::text`,
        max: sql<string>`max(CASE WHEN jsonb_typeof(${customerIntelligenceTable.behaviorScore}) = 'number' THEN (${customerIntelligenceTable.behaviorScore}::text)::numeric ELSE NULL END)::text`,
        min: sql<string>`min(CASE WHEN jsonb_typeof(${customerIntelligenceTable.behaviorScore}) = 'number' THEN (${customerIntelligenceTable.behaviorScore}::text)::numeric ELSE NULL END)::text`,
      })
      .from(customerIntelligenceTable)
      .where(and(eq(customerIntelligenceTable.tenantId, tid), isNotNull(customerIntelligenceTable.behaviorScore))),

    // Top 10 leads em churn risk
    db
      .select({
        leadId: customerIntelligenceTable.leadId,
        nome: leadsTable.nome,
        churnRisk: customerIntelligenceTable.churnRisk,
        journeyStage: customerIntelligenceTable.journeyStage,
        nextBestAction: customerIntelligenceTable.nextBestAction,
      })
      .from(customerIntelligenceTable)
      .innerJoin(leadsTable, eq(customerIntelligenceTable.leadId, leadsTable.id))
      .where(
        and(
          eq(customerIntelligenceTable.tenantId, tid),
          isNotNull(customerIntelligenceTable.churnRisk),
        ),
      )
      .orderBy(desc(customerIntelligenceTable.churnRisk))
      .limit(10),

    // Distribuição de intent analysis (top 10)
    db
      .select({
        intent: customerIntelligenceTable.intentAnalysis,
        total: count(),
      })
      .from(customerIntelligenceTable)
      .where(and(eq(customerIntelligenceTable.tenantId, tid), isNotNull(customerIntelligenceTable.intentAnalysis)))
      .groupBy(customerIntelligenceTable.intentAnalysis)
      .orderBy(desc(sql`count(*)`))
      .limit(10),

    // Total de leads analisados
    db
      .select({ total: count() })
      .from(customerIntelligenceTable)
      .where(eq(customerIntelligenceTable.tenantId, tid)),
  ]);

  res.json({
    churnRisk: {
      baixo: churnDist[0]?.baixo ?? 0,
      medio: churnDist[0]?.medio ?? 0,
      alto: churnDist[0]?.alto ?? 0,
    },
    journeyStageDistribution: journeyStageDist.map((r) => ({
      stage: r.stage,
      total: Number(r.total),
    })),
    behaviorScore: {
      avg: behaviorScore[0]?.avg ? Number(Number(behaviorScore[0].avg).toFixed(1)) : null,
      max: behaviorScore[0]?.max ? Number(Number(behaviorScore[0].max).toFixed(1)) : null,
      min: behaviorScore[0]?.min ? Number(Number(behaviorScore[0].min).toFixed(1)) : null,
    },
    topChurnRisk: topChurn.map((r) => ({
      leadId: r.leadId,
      nome: r.nome ?? "—",
      churnRisk: r.churnRisk ?? 0,
      journeyStage: r.journeyStage ?? null,
      nextBestAction: r.nextBestAction ?? null,
    })),
    intentDistribution: intentAnalysis.map((r) => ({
      intent: r.intent,
      total: Number(r.total),
    })),
    totalAnalyzed: Number(totalAnalyzed[0]?.total ?? 0),
  });
});

router.get("/tenants/:tenantId/analytics/vendas", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  if (!canAccess(req, tenantId)) {
    res.status(403).json({ error: "Access denied" });
    return;
  }

  const wins = await db
    .select({
      dealId: dealsTable.id,
      leadId: dealsTable.leadId,
      leadName: leadsTable.nome,
      leadEmail: leadsTable.email,
      leadPhone: leadsTable.telefone,
      etapa: dealsTable.etapa,
      valor: dealsTable.valor,
      closureTriggeredAt: dealsTable.closureTriggeredAt,
      createdAt: dealsTable.createdAt,
      propostaId: propostasTable.id,
      propostaNumero: propostasTable.numero,
      propostaValor: propostasTable.valorTotal,
      propostaFormaPagamento: propostasTable.formaPagamento,
      propostaStatus: propostasTable.status,
      acceptanceMetadata: propostasTable.acceptanceMetadata,
    })
    .from(dealsTable)
    .leftJoin(leadsTable, eq(dealsTable.leadId, leadsTable.id))
    .leftJoin(propostasTable, eq(propostasTable.dealId, dealsTable.id))
    .where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.etapa, "ganho")))
    .orderBy(desc(dealsTable.createdAt));

  const totalFaturado = wins.reduce((sum, w) => {
    const v = typeof w.valor === "string" ? parseFloat(w.valor) : Number(w.valor ?? 0);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  const totalPropostas = wins.reduce((sum, w) => {
    const v = typeof w.propostaValor === "string" ? parseFloat(w.propostaValor) : Number(w.propostaValor ?? 0);
    return sum + (isNaN(v) ? 0 : v);
  }, 0);

  res.json({
    vendas: wins.map((w) => ({
      dealId: w.dealId,
      leadId: w.leadId,
      leadName: w.leadName ?? null,
      leadEmail: w.leadEmail ?? null,
      leadPhone: w.leadPhone ?? null,
      valor: w.valor,
      closureTriggeredAt: w.closureTriggeredAt,
      createdAt: w.createdAt,
      propostaId: w.propostaId ?? null,
      propostaNumero: w.propostaNumero ?? null,
      propostaValor: w.propostaValor ?? null,
      propostaFormaPagamento: w.propostaFormaPagamento ?? null,
      propostaStatus: w.propostaStatus ?? null,
      acceptanceMetadata: w.acceptanceMetadata ?? null,
    })),
    totalFaturado,
    totalPropostas,
    count: wins.length,
  });
});

// ─── Flow Metrics ─────────────────────────────────────────────────────────────

router.get("/tenants/:tenantId/analytics/flow-metrics", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccess(req, tid)) { res.status(403).json({ error: "Forbidden" }); return; }

  const [
    firstResponseResult,
    convToApptResult,
    apptToSaleResult,
    noShowResult,
    escalationsResult,
  ] = await Promise.all([
    // 1. Tempo médio de 1ª resposta — IA vs humano
    // DISTINCT ON selects the first outbound message per conversation after first inbound
    db.execute(sql`
      WITH first_inbound AS (
        SELECT conversation_id, MIN(created_at) AS first_at
        FROM messages
        WHERE tenant_id = ${tid} AND direcao = 'entrada'
        GROUP BY conversation_id
      ),
      first_response AS (
        SELECT DISTINCT ON (m.conversation_id)
          m.conversation_id,
          m.enviado_por,
          m.created_at AS responded_at,
          fi.first_at    AS inbound_at
        FROM messages m
        JOIN first_inbound fi ON fi.conversation_id = m.conversation_id
        WHERE m.tenant_id = ${tid}
          AND m.direcao   = 'saida'
          AND m.created_at > fi.first_at
        ORDER BY m.conversation_id, m.created_at ASC
      )
      SELECT
        enviado_por,
        AVG(EXTRACT(EPOCH FROM (responded_at - inbound_at)))::float AS avg_seconds,
        COUNT(*) AS sample_count
      FROM first_response
      WHERE enviado_por IN ('agente_ia', 'humano')
      GROUP BY enviado_por
    `),

    // 2. Conversa → Agendamento
    db.execute(sql`
      SELECT
        COUNT(DISTINCT c.lead_id) FILTER (WHERE c.lead_id IS NOT NULL) AS total_leads,
        COUNT(DISTINCT CASE WHEN ag.id IS NOT NULL THEN c.lead_id END)  AS converted
      FROM conversations c
      LEFT JOIN agendamentos ag
        ON ag.lead_id   = c.lead_id
       AND ag.tenant_id = c.tenant_id
      WHERE c.tenant_id = ${tid}
    `),

    // 3. Agendamento → Venda (deal ganho)
    db.execute(sql`
      SELECT
        COUNT(*) AS total_appointments,
        COUNT(*) FILTER (
          WHERE EXISTS (
            SELECT 1 FROM deals d
            WHERE d.lead_id    = ag.lead_id
              AND d.tenant_id  = ag.tenant_id
              AND d.etapa      = 'ganho'
          )
        ) AS converted_to_sale
      FROM agendamentos ag
      WHERE ag.tenant_id = ${tid}
    `),

    // 4. No-show rate
    db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'no_show') AS no_show_count
      FROM agendamentos
      WHERE tenant_id = ${tid}
    `),

    // 5. Escalações por razão (resultado_execucao)
    db.execute(sql`
      SELECT
        COALESCE(resultado_execucao, 'sem_razao') AS reason,
        COUNT(*)::int AS count
      FROM activities
      WHERE tenant_id = ${tid} AND tipo = 'escalacao_humano'
      GROUP BY resultado_execucao
      ORDER BY count DESC
      LIMIT 10
    `),
  ]);

  const toRows = (r: unknown) => (r as { rows: Record<string, unknown>[] }).rows;

  const frRows  = toRows(firstResponseResult);
  const iaRow   = frRows.find((r) => r.enviado_por === "agente_ia");
  const humRow  = frRows.find((r) => r.enviado_por === "humano");

  const [convRow]  = toRows(convToApptResult);
  const totalLeads = Number(convRow?.total_leads ?? 0);
  const convLeads  = Number(convRow?.converted  ?? 0);

  const [apptRow]   = toRows(apptToSaleResult);
  const totalAppts  = Number(apptRow?.total_appointments ?? 0);
  const convSales   = Number(apptRow?.converted_to_sale  ?? 0);

  const [nsRow]     = toRows(noShowResult);
  const totalNs     = Number(nsRow?.total          ?? 0);
  const noShowCnt   = Number(nsRow?.no_show_count  ?? 0);

  return res.json({
    firstResponseTime: {
      ia:    iaRow?.avg_seconds  != null ? Number(Number(iaRow.avg_seconds ).toFixed(1)) : null,
      human: humRow?.avg_seconds != null ? Number(Number(humRow.avg_seconds).toFixed(1)) : null,
    },
    conversationToAppointment: {
      total:     totalLeads,
      converted: convLeads,
      rate:      totalLeads > 0 ? Number((convLeads  / totalLeads).toFixed(3)) : 0,
    },
    appointmentToSale: {
      total:     totalAppts,
      converted: convSales,
      rate:      totalAppts > 0 ? Number((convSales  / totalAppts).toFixed(3)) : 0,
    },
    noShowRate: {
      total:  totalNs,
      noShow: noShowCnt,
      rate:   totalNs > 0 ? Number((noShowCnt / totalNs).toFixed(3)) : 0,
    },
    escalationsByReason: toRows(escalationsResult).map((r) => ({
      reason: String(r.reason ?? "sem_razao"),
      count:  Number(r.count  ?? 0),
    })),
  });
});

// ─── Agent Status Dashboard ───────────────────────────────────────────────────
// GET /tenants/:tenantId/analytics/agents-dashboard
// Painel consolidado de saúde de todos os agentes — filas, métricas e execuções recentes.

router.get("/tenants/:tenantId/analytics/agents-dashboard", async (req, res) => {
  const { tenantId: tid } = req.params;
  if (!canAccess(req, tid)) { res.status(403).json({ error: "Forbidden" }); return; }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    totalLeadsRow,
    leadsHojeRow,
    churnedLeadsRow,
    dealsWonRow,
    churnPendingRow,
    churnSuccessRow,
    churnFailedRow,
    scoutPorStatusRow,
    campaignsActiveRow,
    campaignConversionRow,
    prospectorQueueRow,
    agendamentosHojeRow,
    agentActionsRow,
  ] = await Promise.all([
    // Total de leads do tenant
    db.select({ n: count() }).from(leadsTable).where(eq(leadsTable.tenantId, tid)),
    // Leads criados hoje
    db.select({ n: count() }).from(leadsTable).where(and(eq(leadsTable.tenantId, tid), gte(leadsTable.createdAt, today))),
    // Leads marcados como churned
    db.select({ n: count() }).from(leadsTable).where(and(eq(leadsTable.tenantId, tid), eq((leadsTable as any).isChurned, true))),
    // Deals ganhos (últimos 30 dias)
    db.select({ n: count() }).from(dealsTable).where(and(eq(dealsTable.tenantId, tid), eq(dealsTable.etapa, "ganho"), gte(dealsTable.updatedAt, thirtyDaysAgo))),
    // Churn actions por status
    db.select({ n: count() }).from(churnActionsTable).where(and(eq(churnActionsTable.tenantId, tid), sql`${churnActionsTable.actionSuccessful} IS NULL`)),
    db.select({ n: count() }).from(churnActionsTable).where(and(eq(churnActionsTable.tenantId, tid), eq(churnActionsTable.actionSuccessful, true))),
    db.select({ n: count() }).from(churnActionsTable).where(and(eq(churnActionsTable.tenantId, tid), eq(churnActionsTable.actionSuccessful, false))),
    // Scout oportunidades por status
    db
      .select({ status: scoutOportunidadesTable.status, n: count() })
      .from(scoutOportunidadesTable)
      .where(eq(scoutOportunidadesTable.tenantId, tid))
      .groupBy(scoutOportunidadesTable.status),
    // Campanhas ativas
    db.select({ n: count() }).from(campaignsTable).where(and(eq(campaignsTable.tenantId, tid), eq(campaignsTable.status, "enviando"))),
    // Taxa de conversão das campanhas (sent logs com convertedAt)
    db.select({
      total: count(),
      converted: sql<number>`count(*) filter (where ${campaignSentLogsTable.convertedAt} is not null)`.mapWith(Number),
    })
      .from(campaignSentLogsTable)
      .innerJoin(campaignsTable, eq(campaignsTable.id, campaignSentLogsTable.campaignId))
      .where(eq(campaignsTable.tenantId, tid)),
    // Fila do Prospector
    db.select({ n: count() }).from(prospectorQueueTable).where(eq(prospectorQueueTable.tenantId, tid)),
    // Agendamentos de hoje
    db.select({ n: count() }).from(agendamentosTable).where(and(eq(agendamentosTable.tenantId, tid), gte(agendamentosTable.dataHoraInicio, today))),
    // Ações dos agentes (últimos 30 dias)
    db
      .select({
        agentName: agentActionsLogTable.agentName,
        total: count(),
        executed: sql<number>`count(*) filter (where ${agentActionsLogTable.status} = 'executed')`.mapWith(Number),
      })
      .from(agentActionsLogTable)
      .where(and(eq(agentActionsLogTable.tenantId, tid), gte(agentActionsLogTable.createdAt, thirtyDaysAgo)))
      .groupBy(agentActionsLogTable.agentName),
  ]);

  const totalLeads = totalLeadsRow[0]?.n ?? 0;
  const churnedLeads = churnedLeadsRow[0]?.n ?? 0;
  const dealsWon = dealsWonRow[0]?.n ?? 0;
  const campConv = campaignConversionRow[0];
  const campConvRate = campConv && campConv.total > 0
    ? Number((campConv.converted / campConv.total).toFixed(3))
    : 0;

  res.json({
    generatedAt: new Date().toISOString(),
    leads: {
      total: totalLeads,
      hoje: leadsHojeRow[0]?.n ?? 0,
      churned: churnedLeads,
      churnRate: totalLeads > 0 ? Number((churnedLeads / totalLeads).toFixed(3)) : 0,
    },
    deals: {
      wonLast30d: dealsWon,
    },
    churnAgent: {
      actionsPending: churnPendingRow[0]?.n ?? 0,
      actionsSuccess: churnSuccessRow[0]?.n ?? 0,
      actionsFailed: churnFailedRow[0]?.n ?? 0,
    },
    revenueScout: {
      byStatus: scoutPorStatusRow.map((r) => ({ status: r.status, count: r.n })),
    },
    campaigns: {
      active: campaignsActiveRow[0]?.n ?? 0,
      sentLogs: campConv?.total ?? 0,
      converted: campConv?.converted ?? 0,
      conversionRate: campConvRate,
    },
    prospector: {
      queueSize: prospectorQueueRow[0]?.n ?? 0,
    },
    scheduler: {
      agendamentosHoje: agendamentosHojeRow[0]?.n ?? 0,
    },
    agentActions: agentActionsRow.map((r) => ({
      agentName: r.agentName,
      total: r.total,
      executed: r.executed,
    })),
  });
});

export default router;

