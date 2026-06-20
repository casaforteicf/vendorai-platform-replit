import { Router, IRouter } from "express";
import {
  db,
  rulesTable,
  leadsTable,
  customerIntelligenceTable,
  conversationsTable,
  agentTasksTable,
  activitiesTable,
  insertRuleSchema,
  updateRuleSchema,
} from "@workspace/db";
import type { Logger } from "pino";
import { eq, and, gt, desc, inArray } from "drizzle-orm";

// ── Local types ───────────────────────────────────────────────────────────────
type Rule          = typeof rulesTable.$inferSelect;
type Lead          = typeof leadsTable.$inferSelect;
type CI            = typeof customerIntelligenceTable.$inferSelect;
type Conversation  = typeof conversationsTable.$inferSelect;
type Facts         = Record<string, unknown>;

type RuleTrigger =
  | "lead_criado"
  | "churn_risk_alto"
  | "proposta_enviada"
  | "agendamento_proximo"
  | "sem_atividade_x_dias"
  | "deal_ganho"
  | "deal_perdido";

const VALID_TRIGGERS: RuleTrigger[] = [
  "lead_criado", "churn_risk_alto", "proposta_enviada",
  "agendamento_proximo", "sem_atividade_x_dias", "deal_ganho", "deal_perdido",
];

type EvaluateResult = {
  ruleId:   string;
  ruleName: string;
  acao:     string;
  triggered: boolean;
  reason?:  string;
  result?:  Record<string, unknown>;
};

const router: IRouter = Router();

// ═════════════════════════════════════════════════════════════════════════════
//  CONDITION ENGINE
// ═════════════════════════════════════════════════════════════════════════════

/** Monta um objeto plano de fatos a partir dos dados do lead e CI. */
function buildFacts(
  lead:         Lead | null,
  ci:           CI | null,
  conversation: Conversation | null
): Facts {
  const facts: Facts = {};

  if (lead) {
    Object.assign(facts, {
      status:          lead.status,
      nome:            lead.nome,
      empresa:         lead.empresa ?? null,
      tamanhoEquipe:   lead.tamanhoEquipe ?? null,
      urgencia:        lead.urgencia ?? null,
      orcamento:       lead.orcamento ?? null,
      objetivo:        lead.objetivo ?? null,
      dorPrincipal:    lead.dorPrincipal ?? null,
      planoRecomendado:lead.planoRecomendado ?? null,
      proximaAcao:     lead.proximaAcao ?? null,
    });
  }

  if (ci) {
    Object.assign(facts, {
      churnRisk:        ci.churnRisk ?? null,
      journeyStage:     ci.journeyStage ?? null,
      intentAnalysis:   ci.intentAnalysis ?? null,
      nextBestAction:   ci.nextBestAction ?? null,
    });
  }

  // Computed
  if (conversation?.ultimaMensagemEm) {
    facts.diasSemAtividade = Math.floor(
      (Date.now() - new Date(conversation.ultimaMensagemEm).getTime()) / (1000 * 60 * 60 * 24)
    );
  } else {
    facts.diasSemAtividade = null;
  }
  facts.temConversacao = !!conversation;

  return facts;
}

type CondResult = { passed: boolean; reason: string };

/** Avalia uma única condição contra os fatos. */
function evaluateCondicao(
  c: { campo: string; operador: string; valor: unknown },
  facts: Facts
): CondResult {
  const actual  = facts[c.campo];
  const expected = c.valor;
  const ctx = `${c.campo} (atual: ${JSON.stringify(actual)}) ${c.operador} ${JSON.stringify(expected)}`;

  switch (c.operador) {
    case "maior_que":
    case "gt":
      if (typeof actual !== "number") return { passed: false, reason: `${ctx} — campo não é numérico` };
      return { passed: actual > Number(expected), reason: ctx };

    case "menor_que":
    case "lt":
      if (typeof actual !== "number") return { passed: false, reason: `${ctx} — campo não é numérico` };
      return { passed: actual < Number(expected), reason: ctx };

    case "maior_igual":
    case "gte":
      if (typeof actual !== "number") return { passed: false, reason: `${ctx} — campo não é numérico` };
      return { passed: actual >= Number(expected), reason: ctx };

    case "menor_igual":
    case "lte":
      if (typeof actual !== "number") return { passed: false, reason: `${ctx} — campo não é numérico` };
      return { passed: actual <= Number(expected), reason: ctx };

    case "igual":
    case "eq":
      // eslint-disable-next-line eqeqeq
      return { passed: actual == expected, reason: ctx };

    case "diferente":
    case "neq":
      // eslint-disable-next-line eqeqeq
      return { passed: actual != expected, reason: ctx };

    case "contem":
      if (typeof actual === "string") return { passed: actual.toLowerCase().includes(String(expected).toLowerCase()), reason: ctx };
      if (Array.isArray(actual))      return { passed: actual.includes(expected), reason: ctx };
      return { passed: false, reason: `${ctx} — campo não é string nem array` };

    case "nao_contem":
      if (typeof actual === "string") return { passed: !actual.toLowerCase().includes(String(expected).toLowerCase()), reason: ctx };
      if (Array.isArray(actual))      return { passed: !actual.includes(expected), reason: ctx };
      return { passed: false, reason: `${ctx} — campo não é string nem array` };

    case "existe":
      return { passed: actual !== null && actual !== undefined, reason: ctx };

    case "nao_existe":
      return { passed: actual === null || actual === undefined, reason: ctx };

    default:
      return { passed: false, reason: `Operador desconhecido: ${c.operador}` };
  }
}

/** Avalia todas as condições de uma rule (AND lógico). */
function checkAllCondicoes(rule: Rule, facts: Facts): CondResult {
  const condicoes = Array.isArray(rule.condicoes) ? rule.condicoes : [];

  // Sem condições → sempre passa (unconditional rule)
  if (condicoes.length === 0) return { passed: true, reason: "sem condições (sempre executa)" };

  for (const c of condicoes) {
    const r = evaluateCondicao(c, facts);
    if (!r.passed) return { passed: false, reason: `condição falhou: ${r.reason}` };
  }

  return { passed: true, reason: `${condicoes.length} condição(ões) satisfeita(s)` };
}

// ═════════════════════════════════════════════════════════════════════════════
//  ACTION EXECUTOR
// ═════════════════════════════════════════════════════════════════════════════

async function executeAction(
  rule:    Rule,
  tenantId: string,
  leadId:  string | null,
  log:     Logger
): Promise<Record<string, unknown>> {
  const payload = rule.acaoPayload ?? {};

  switch (rule.acao) {

    case "criar_agent_task": {
      if (!leadId) return { skipped: true, reason: "leadId obrigatório para criar_agent_task" };

      const agentName  = String(payload.agentName  ?? "sdr");
      const actionType = String(payload.actionType ?? "enviar_whatsapp");

      // Dedup: skip if a non-terminal task for the same lead + actionType + rule already exists
      const [existingTask] = await db
        .select({ id: agentTasksTable.id })
        .from(agentTasksTable)
        .where(
          and(
            eq(agentTasksTable.tenantId,   tenantId),
            eq(agentTasksTable.leadId,     leadId),
            eq(agentTasksTable.actionType, actionType),
            inArray(agentTasksTable.status, ["pendente_aprovacao", "aprovado", "executando"])
          )
        )
        .limit(1);

      if (existingTask) {
        log.info({ existingTaskId: existingTask.id, ruleName: rule.nome }, "rules: agent_task already exists — skipping dedup");
        return { skipped: true, reason: "task já existe (dedup)", existingTaskId: existingTask.id };
      }

      const [task] = await db.insert(agentTasksTable).values({
        tenantId,
        leadId,
        agentName:  agentName as typeof agentTasksTable.$inferInsert["agentName"],
        actionType,
        payload:    { ...payload, leadId, ruleName: rule.nome },
        status:     "pendente_aprovacao",
      }).returning();

      log.info({ taskId: task.id, agentName, ruleName: rule.nome }, "rules: agent_task created");
      return { taskId: task.id, agentName, actionType, status: task.status };
    }

    case "criar_atividade": {
      if (!leadId) return { skipped: true, reason: "leadId obrigatório para criar_atividade" };

      const tipo   = (payload.tipo as typeof activitiesTable.$inferInsert["tipo"]) ?? "tarefa";
      const titulo = String(payload.titulo ?? `Ação automática — ${rule.nome}`);

      // Dedup: skip if a pending or planned activity with the same title already exists for this lead
      const [existingActivity] = await db
        .select({ id: activitiesTable.id })
        .from(activitiesTable)
        .where(
          and(
            eq(activitiesTable.tenantId, tenantId),
            eq(activitiesTable.leadId,   leadId),
            eq(activitiesTable.titulo,   titulo),
            inArray(activitiesTable.status, ["pendente", "planejado"])
          )
        )
        .limit(1);

      if (existingActivity) {
        log.info({ existingActivityId: existingActivity.id, ruleName: rule.nome }, "rules: activity already exists — skipping dedup");
        return { skipped: true, reason: "atividade já existe (dedup)", existingActivityId: existingActivity.id };
      }

      const [activity] = await db.insert(activitiesTable).values({
        tenantId,
        leadId,
        tipo,
        titulo,
        descricao:      payload.descricao      ? String(payload.descricao)                   : undefined,
        dataVencimento: payload.dataVencimento  ? new Date(String(payload.dataVencimento))    : undefined,
        status:         "pendente",
      }).returning();

      log.info({ activityId: activity.id, tipo, ruleName: rule.nome }, "rules: activity created");
      return { activityId: activity.id, tipo, titulo };
    }

    case "notificar_usuario": {
      if (!leadId) return { skipped: true, reason: "leadId obrigatório para notificar_usuario" };

      const titulo = String(payload.titulo ?? `Notificação: ${rule.nome}`);

      // Dedup: skip if a pending or planned notification with the same title already exists for this lead
      const [existingNotif] = await db
        .select({ id: activitiesTable.id })
        .from(activitiesTable)
        .where(
          and(
            eq(activitiesTable.tenantId, tenantId),
            eq(activitiesTable.leadId,   leadId),
            eq(activitiesTable.titulo,   titulo),
            inArray(activitiesTable.status, ["pendente", "planejado"])
          )
        )
        .limit(1);

      if (existingNotif) {
        log.info({ existingActivityId: existingNotif.id, ruleName: rule.nome }, "rules: notification already exists — skipping dedup");
        return { skipped: true, reason: "notificação já existe (dedup)", existingActivityId: existingNotif.id };
      }

      const [activity] = await db.insert(activitiesTable).values({
        tenantId,
        leadId,
        tipo:      "tarefa",
        titulo,
        descricao: String(payload.descricao ?? `Regra disparada automaticamente: ${rule.nome}`),
        status:    "pendente",
      }).returning();

      log.info({ activityId: activity.id, ruleName: rule.nome }, "rules: notification (tarefa) created");
      return { activityId: activity.id, tipo: "tarefa", titulo };
    }

    case "criar_campanha": {
      log.info({ ruleName: rule.nome, payload }, "rules: criar_campanha — não implementado, apenas registrado");
      return { skipped: true, reason: "criar_campanha ainda não implementado" };
    }

    default:
      return { skipped: true, reason: `ação desconhecida: ${rule.acao}` };
  }
}

// ═════════════════════════════════════════════════════════════════════════════
//  CORE EVALUATE FUNCTION  (usado pelo endpoint e pelo batch job)
// ═════════════════════════════════════════════════════════════════════════════

async function evaluateForLead(params: {
  tenantId:  string;
  trigger:   RuleTrigger;
  leadId:    string | null;
  log:       Logger;
}): Promise<{ evaluated: number; triggered: number; results: EvaluateResult[] }> {
  const { tenantId, trigger, leadId, log } = params;

  // 1. Fetch active rules for this tenant + trigger
  const rules = await db
    .select()
    .from(rulesTable)
    .where(and(eq(rulesTable.tenantId, tenantId), eq(rulesTable.trigger, trigger), eq(rulesTable.ativo, true)));

  if (rules.length === 0) {
    return { evaluated: 0, triggered: 0, results: [] };
  }

  // 2. Load context if leadId is present
  let lead: Lead | null = null;
  let ci:   CI   | null = null;
  let conv: Conversation | null = null;

  if (leadId) {
    [lead = null] = await db.select().from(leadsTable)
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

    if (lead) {
      [ci   = null] = await db.select().from(customerIntelligenceTable)
        .where(and(eq(customerIntelligenceTable.leadId, leadId), eq(customerIntelligenceTable.tenantId, tenantId)));

      [conv = null] = await db.select().from(conversationsTable)
        .where(and(eq(conversationsTable.leadId, leadId), eq(conversationsTable.tenantId, tenantId)))
        .orderBy(desc(conversationsTable.ultimaMensagemEm))
        .limit(1);
    }
  }

  const facts = buildFacts(lead, ci, conv);

  // 3. Evaluate each rule
  const results: EvaluateResult[] = [];
  let triggered = 0;

  for (const rule of rules) {
    const check = checkAllCondicoes(rule, facts);

    if (!check.passed) {
      results.push({ ruleId: rule.id, ruleName: rule.nome, acao: rule.acao, triggered: false, reason: check.reason });
      continue;
    }

    try {
      const actionResult = await executeAction(rule, tenantId, leadId, log);
      triggered++;
      results.push({ ruleId: rule.id, ruleName: rule.nome, acao: rule.acao, triggered: true, reason: check.reason, result: actionResult });
    } catch (err) {
      log.error({ err, ruleId: rule.id, ruleName: rule.nome }, "rules: action execution failed");
      results.push({ ruleId: rule.id, ruleName: rule.nome, acao: rule.acao, triggered: false, reason: `erro na execução: ${String(err)}` });
    }
  }

  log.info({ trigger, leadId, evaluated: rules.length, triggered }, "rules: evaluate complete");
  return { evaluated: rules.length, triggered, results };
}

// ═════════════════════════════════════════════════════════════════════════════
//  EXISTING CRUD ROUTES
// ═════════════════════════════════════════════════════════════════════════════

// POST /rules
router.post("/rules", async (req, res) => {
  const parsed = insertRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Validation error", details: parsed.error.issues });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== parsed.data.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [row] = await db.insert(rulesTable).values(parsed.data).returning();
  res.status(201).json(row);
});

// GET /tenants/:tenantId/rules  ?trigger=  ?ativo=
router.get("/tenants/:tenantId/rules", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const { trigger, ativo } = req.query as Record<string, string | undefined>;

  const conditions = [eq(rulesTable.tenantId, tenantId)];

  if (trigger) {
    if (!VALID_TRIGGERS.includes(trigger as RuleTrigger)) {
      res.status(422).json({ error: "Invalid trigger value" });
      return;
    }
    conditions.push(eq(rulesTable.trigger, trigger as RuleTrigger));
  }

  if (ativo !== undefined) {
    conditions.push(eq(rulesTable.ativo, ativo === "true"));
  }

  const rows = await db
    .select()
    .from(rulesTable)
    .where(and(...conditions))
    .orderBy(rulesTable.createdAt);

  res.json(rows);
});

// GET /rules/:id
router.get("/rules/:id", async (req, res) => {
  const id = String(req.params.id);
  const [row] = await db.select().from(rulesTable).where(eq(rulesTable.id, id));
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  res.json(row);
});

// PATCH /rules/:id
router.patch("/rules/:id", async (req, res) => {
  const id = String(req.params.id);
  const parsed = updateRuleSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: "Validation error", details: parsed.error.issues });
    return;
  }

  const [existing] = await db
    .select({ id: rulesTable.id, tenantId: rulesTable.tenantId })
    .from(rulesTable)
    .where(eq(rulesTable.id, id));

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [row] = await db
    .update(rulesTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(rulesTable.id, existing.id))
    .returning();
  res.json(row);
});

// DELETE /rules/:id
router.delete("/rules/:id", async (req, res) => {
  const id = String(req.params.id);

  const [existing] = await db
    .select({ id: rulesTable.id, tenantId: rulesTable.tenantId })
    .from(rulesTable)
    .where(eq(rulesTable.id, id));

  if (!existing) { res.status(404).json({ error: "Not found" }); return; }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db.delete(rulesTable).where(eq(rulesTable.id, existing.id));
  res.status(204).send();
});

// ═════════════════════════════════════════════════════════════════════════════
//  ENGINE ROUTES
// ═════════════════════════════════════════════════════════════════════════════

/**
 * POST /tenants/:tenantId/rules/evaluate
 *
 * Avalia todas as rules ativas do tenant para um dado trigger e leadId opcional.
 * Para cada rule que passar as condições, executa a ação configurada.
 *
 * Body: { trigger: RuleTrigger, leadId?: string }
 *
 * Response: { trigger, leadId, evaluated, triggered, results[] }
 */
router.post("/tenants/:tenantId/rules/evaluate", async (req, res) => {
  const tenantId = String(req.params.tenantId);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const { trigger, leadId } = req.body as { trigger?: string; leadId?: string };

  if (!trigger || !VALID_TRIGGERS.includes(trigger as RuleTrigger)) {
    res.status(422).json({ error: `trigger inválido. Valores aceitos: ${VALID_TRIGGERS.join(", ")}` });
    return;
  }

  const result = await evaluateForLead({
    tenantId,
    trigger: trigger as RuleTrigger,
    leadId:  leadId ?? null,
    log:     req.log,
  });

  res.json({ trigger, leadId: leadId ?? null, ...result });
});

/**
 * POST /tenants/:tenantId/rules/run-churn-check
 *
 * Job batch: busca todos os leads com churnRisk > 70 no tenant,
 * e para cada um executa evaluate com trigger="churn_risk_alto".
 * Destinado a ser chamado por cron externo.
 *
 * Query param opcional: ?threshold=70 (padrão: 70)
 * Response: { leadsProcessed, totalTriggered, totalEvaluated, details[] }
 */
router.post("/tenants/:tenantId/rules/run-churn-check", async (req, res) => {
  const tenantId  = String(req.params.tenantId);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const threshold = Number(req.query.threshold ?? 70);

  if (isNaN(threshold) || threshold < 0 || threshold > 100) {
    res.status(422).json({ error: "threshold deve ser um número entre 0 e 100" });
    return;
  }

  // Find leads with high churn risk in this tenant (limit 200 para segurança)
  const highRiskRows = await db
    .select({ leadId: customerIntelligenceTable.leadId, churnRisk: customerIntelligenceTable.churnRisk })
    .from(customerIntelligenceTable)
    .where(
      and(
        eq(customerIntelligenceTable.tenantId, tenantId),
        gt(customerIntelligenceTable.churnRisk, threshold)
      )
    )
    .limit(200);

  req.log.info({ tenantId, threshold, count: highRiskRows.length }, "rules: run-churn-check started");

  let totalEvaluated = 0;
  let totalTriggered = 0;
  const details: Array<{ leadId: string; churnRisk: number | null; evaluated: number; triggered: number }> = [];

  for (const row of highRiskRows) {
    const result = await evaluateForLead({
      tenantId,
      trigger: "churn_risk_alto",
      leadId:  row.leadId,
      log:     req.log,
    });

    totalEvaluated += result.evaluated;
    totalTriggered += result.triggered;
    details.push({ leadId: row.leadId, churnRisk: row.churnRisk, evaluated: result.evaluated, triggered: result.triggered });
  }

  req.log.info({ tenantId, threshold, leadsProcessed: highRiskRows.length, totalTriggered }, "rules: run-churn-check complete");

  res.json({
    leadsProcessed: highRiskRows.length,
    threshold,
    totalEvaluated,
    totalTriggered,
    details,
  });
});

export { evaluateForLead };
export default router;
