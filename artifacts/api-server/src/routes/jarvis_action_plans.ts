import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  agentConfigsTable,
  agentTasksTable,
  dealsTable,
  jarvisCasesTable,
  leadsTable,
  resolveAgentAutonomyLevel,
  type AgentType,
} from "@workspace/db";
import { executeTaskAction } from "./agent_tasks.js";
import {
  createJarvisActionPlan,
  readJarvisActionPlan,
  synchronizeJarvisActionPlanTasks,
  updateJarvisActionPlanStep,
  type JarvisActionPlan,
} from "../services/jarvis-action-plan-intelligence.js";

const router: IRouter = Router();

const agentNameSchema = z.enum([
  "sdr", "closer", "followup", "reactivation", "scheduler", "service",
  "onboarding", "relacionamento", "financeiro", "cobranca", "reception",
]);

const supportedActionSchema = z.enum([
  "enviar_whatsapp",
  "aprovacao_desconto",
  "aprovacao_fechamento",
  "conferencia_estoque",
]);

const stepUpdateSchema = z.object({
  status: z.enum(["WAITING", "READY", "RUNNING", "COMPLETED", "FAILED", "SKIPPED"]),
  result: z.record(z.string(), z.unknown()).nullable().optional(),
  taskId: z.string().trim().min(1).nullable().optional(),
});

const delegateSchema = z.object({
  leadId: z.string().trim().min(1),
  agentName: agentNameSchema,
  actionType: supportedActionSchema,
  payload: z.record(z.string(), z.unknown()),
});

type PlanItem = {
  caseId: string;
  caseTitle: string;
  category: string;
  severity: string;
  caseStatus: string;
  plan: JarvisActionPlan;
  updatedAt: Date;
};

function isSensitiveAction(actionType: string) {
  return actionType === "aprovacao_desconto"
    || actionType === "aprovacao_fechamento"
    || actionType === "conferencia_estoque";
}

function validateSupportedPayload(actionType: string, payload: Record<string, unknown>) {
  if (actionType === "enviar_whatsapp") {
    const parsed = z.object({
      conteudo: z.string().trim().min(1),
      canal: z.enum(["whatsapp", "instagram", "email", "chat"]).optional(),
    }).passthrough().safeParse(payload);
    return parsed.success ? null : parsed.error.message;
  }
  if (actionType === "aprovacao_desconto") {
    const parsed = z.object({
      dealId: z.string().min(1),
      discountPercent: z.number().min(0).max(100),
      reason: z.string().min(3),
      originalValue: z.number(),
      discountedValue: z.number().min(0),
    }).passthrough().safeParse(payload);
    return parsed.success ? null : parsed.error.message;
  }
  if (actionType === "aprovacao_fechamento") {
    const parsed = z.object({
      origin: z.enum(["proposal_accepted", "confirm_closure"]),
      dealId: z.string().min(1),
      propostaId: z.string().optional(),
    }).passthrough().safeParse(payload);
    return parsed.success ? null : parsed.error.message;
  }
  if (actionType === "conferencia_estoque") {
    const parsed = z.object({
      origin: z.enum(["proposal_accepted", "confirm_closure"]),
      dealId: z.string().min(1),
      propostaId: z.string().optional(),
      etapaAnterior: z.string().min(1),
    }).passthrough().safeParse(payload);
    return parsed.success ? null : parsed.error.message;
  }
  return `Executor não suportado para ${actionType}`;
}

function lastUserMessage(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const messages = Reflect.get(body, "messages");
  if (!Array.isArray(messages)) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || typeof message !== "object") continue;
    if (Reflect.get(message, "role") !== "user") continue;
    const content = Reflect.get(message, "content");
    return typeof content === "string" ? content.trim() : null;
  }
  return null;
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function wantsExecutionBrief(text: string) {
  const normalized = normalize(text);
  const executionSubject = /\b(plano|planos|andamento|execucao|execucoes|acao|acoes|delegacao|delegacoes|bloqueado|bloqueados|pendencia|pendencias)\b/.test(normalized);
  const statusIntent = /\b(como esta|como estao|status|o que falta|o que esta em andamento|o que esta bloqueado|o que terminou|o que foi concluido|qual o andamento|quais pendencias)\b/.test(normalized);
  return executionSubject && statusIntent;
}

function writeSse(res: any, content: string, extra: Record<string, unknown> = {}) {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ content })}\n\n`);
  res.write(`data: ${JSON.stringify({ done: true, ...extra })}\n\n`);
  res.end();
}

async function loadSynchronizedPlans(tenantId: string): Promise<PlanItem[]> {
  const rows = await db
    .select({
      id: jarvisCasesTable.id,
      title: jarvisCasesTable.title,
      category: jarvisCasesTable.category,
      severity: jarvisCasesTable.severity,
      status: jarvisCasesTable.status,
      evidence: jarvisCasesTable.evidence,
      updatedAt: jarvisCasesTable.updatedAt,
    })
    .from(jarvisCasesTable)
    .where(eq(jarvisCasesTable.tenantId, tenantId))
    .orderBy(desc(jarvisCasesTable.updatedAt))
    .limit(100);

  const withPlans = rows.filter((item) => readJarvisActionPlan(item.evidence));
  const synchronized = await Promise.all(withPlans.map(async (item) => {
    const synced = await synchronizeJarvisActionPlanTasks(tenantId, item.id);
    const plan = synced?.plan ?? readJarvisActionPlan(item.evidence);
    if (!plan) return null;
    return {
      caseId: item.id,
      caseTitle: item.title,
      category: item.category,
      severity: item.severity,
      caseStatus: item.status,
      plan,
      updatedAt: item.updatedAt,
    } satisfies PlanItem;
  }));

  return synchronized.filter((item): item is PlanItem => item !== null);
}

function taskStatus(step: JarvisActionPlan["steps"][number]) {
  const value = step.result?.taskStatus;
  return typeof value === "string" ? value : null;
}

function buildExecutionBrief(items: PlanItem[]) {
  const active = items.filter((item) => ["PENDING", "RUNNING", "PAUSED"].includes(item.plan.status));
  const completed = items.filter((item) => item.plan.status === "COMPLETED");
  const failed = items.filter((item) => item.plan.status === "FAILED");

  const steps = active.flatMap((item) => item.plan.steps.map((step) => ({ item, step, taskStatus: taskStatus(step) })));
  const pendingApproval = steps.filter(({ taskStatus }) => taskStatus === "pendente_aprovacao");
  const approvedManual = steps.filter(({ taskStatus }) => taskStatus === "aprovado");
  const executing = steps.filter(({ taskStatus }) => taskStatus === "executando");
  const readyToDelegate = steps.filter(({ step }) => step.status === "READY" && !step.taskId && (step.kind === "delegate" || step.kind === "execute"));
  const readyInternal = steps.filter(({ step }) => step.status === "READY" && !step.taskId && step.kind !== "delegate" && step.kind !== "execute");
  const measuring = steps.filter(({ step }) => step.kind === "measure" && (step.status === "READY" || step.status === "RUNNING"));
  const blocked = steps.filter(({ step }) => Boolean(step.blockingReason) && step.status !== "COMPLETED" && step.status !== "SKIPPED");
  const failedSteps = items.flatMap((item) => item.plan.steps
    .filter((step) => step.status === "FAILED")
    .map((step) => ({ item, step, taskStatus: taskStatus(step) })));

  return {
    generatedAt: new Date(),
    summary: {
      plans: items.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      pendingApproval: pendingApproval.length,
      approvedAwaitingManualExecution: approvedManual.length,
      executing: executing.length,
      readyToDelegate: readyToDelegate.length,
      readyInternal: readyInternal.length,
      measuring: measuring.length,
      blocked: blocked.length,
      failedSteps: failedSteps.length,
    },
    active: active.slice(0, 12),
    attention: {
      pendingApproval: pendingApproval.slice(0, 8),
      approvedAwaitingManualExecution: approvedManual.slice(0, 8),
      executing: executing.slice(0, 8),
      readyToDelegate: readyToDelegate.slice(0, 8),
      measuring: measuring.slice(0, 8),
      blocked: blocked.slice(0, 8),
      failedSteps: failedSteps.slice(0, 8),
    },
    recentCompleted: completed.slice(0, 8),
    guardrail: "Este brief reflete somente estados persistidos dos planos e da fila agent_tasks. READY não significa executado; pendente_aprovacao exige decisão humana; aprovado no modo manual ainda exige execução explícita.",
  };
}

function briefText(brief: ReturnType<typeof buildExecutionBrief>) {
  const s = brief.summary;
  if (s.plans === 0) return "Ainda não há planos de ação do JARVIS registrados neste tenant.";

  const parts = [
    `Tenho ${s.active} plano(s) ativo(s), ${s.completed} concluído(s) e ${s.failed} com falha.`,
  ];
  if (s.pendingApproval) parts.push(`${s.pendingApproval} etapa(s) aguardam aprovação humana.`);
  if (s.approvedAwaitingManualExecution) parts.push(`${s.approvedAwaitingManualExecution} etapa(s) já foram aprovadas, mas ainda aguardam execução explícita no modo manual.`);
  if (s.executing) parts.push(`${s.executing} etapa(s) estão em execução.`);
  if (s.readyToDelegate) parts.push(`${s.readyToDelegate} etapa(s) estão prontas para delegação, mas ainda não possuem tarefa vinculada.`);
  if (s.measuring) parts.push(`${s.measuring} etapa(s) estão na fase de medir resultado e fechar aprendizado.`);
  if (s.blocked) parts.push(`${s.blocked} etapa(s) têm bloqueio explícito registrado.`);
  if (s.failedSteps) parts.push(`${s.failedSteps} etapa(s) falharam e precisam de revisão.`);

  const top = brief.active[0];
  if (top) {
    const currentStep = top.plan.steps.find((step) => step.status === "RUNNING")
      ?? top.plan.steps.find((step) => step.status === "READY")
      ?? top.plan.steps.find((step) => step.status === "WAITING");
    if (currentStep) parts.push(`Principal andamento: “${top.caseTitle}” — ${currentStep.label} (${currentStep.status}).`);
  }
  return parts.join(" ");
}

router.get("/jarvis/action-plans", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

  const synchronized = await loadSynchronizedPlans(tenantId);
  return res.json({
    generatedAt: new Date(),
    summary: {
      plans: synchronized.length,
      running: synchronized.filter((item) => item.plan.status === "RUNNING").length,
      pending: synchronized.filter((item) => item.plan.status === "PENDING").length,
      completed: synchronized.filter((item) => item.plan.status === "COMPLETED").length,
      failed: synchronized.filter((item) => item.plan.status === "FAILED").length,
    },
    items: synchronized,
  });
});

router.get("/jarvis/execution-brief", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });
  const items = await loadSynchronizedPlans(tenantId);
  return res.json(buildExecutionBrief(items));
});

router.get("/jarvis/cases/:id/action-plan", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });
  const caseId = String(req.params.id ?? "").trim();
  const synced = await synchronizeJarvisActionPlanTasks(tenantId, caseId);
  if (!synced) return res.status(404).json({ error: "Caso Vendor não encontrado" });
  return res.json({ plan: synced.plan });
});

router.post("/jarvis/cases/:id/action-plan", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });
  const caseId = String(req.params.id ?? "").trim();
  if (!caseId) return res.status(400).json({ error: "Caso Vendor obrigatório" });

  const result = await createJarvisActionPlan(tenantId, caseId);
  if (!result) return res.status(404).json({ error: "Caso Vendor não encontrado" });
  return res.status(result.created ? 201 : 200).json({
    ...result,
    guardrail: "O plano organiza e acompanha o trabalho, mas só delega quando há lead/negócio do tenant, agente habilitado, executor suportado e autorização compatível.",
  });
});

router.post("/jarvis/cases/:id/action-plan/steps/:stepId/delegate", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });
  const parsed = delegateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const caseId = String(req.params.id ?? "").trim();
  const stepId = String(req.params.stepId ?? "").trim();
  const synced = await synchronizeJarvisActionPlanTasks(tenantId, caseId);
  if (!synced) return res.status(404).json({ error: "Caso Vendor não encontrado" });
  const plan = synced.plan;
  if (!plan) return res.status(404).json({ error: "Plano de ação não encontrado" });
  const step = plan.steps.find((item) => item.id === stepId);
  if (!step) return res.status(404).json({ error: "Etapa do plano não encontrada" });
  if (step.taskId) return res.status(409).json({ error: "Esta etapa já possui uma agent_task vinculada", taskId: step.taskId });
  if (step.status !== "READY") return res.status(422).json({ error: `Etapa não está pronta para delegação: ${step.status}` });
  if (step.kind !== "delegate" && step.kind !== "execute") {
    return res.status(422).json({ error: `Etapa ${step.kind} não pode criar agent_task` });
  }

  const { leadId, agentName, actionType, payload } = parsed.data;
  const payloadError = validateSupportedPayload(actionType, payload);
  if (payloadError) return res.status(422).json({ error: payloadError });

  const [lead] = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);
  if (!lead) return res.status(404).json({ error: "Lead não encontrado neste tenant" });

  const dealId = typeof payload.dealId === "string" ? payload.dealId : null;
  if (dealId) {
    const [deal] = await db
      .select({ id: dealsTable.id, leadId: dealsTable.leadId })
      .from(dealsTable)
      .where(and(eq(dealsTable.id, dealId), eq(dealsTable.tenantId, tenantId)))
      .limit(1);
    if (!deal) return res.status(404).json({ error: "Negócio não encontrado neste tenant" });
    if (deal.leadId && deal.leadId !== leadId) {
      return res.status(422).json({ error: "O negócio informado não pertence ao lead usado na delegação" });
    }
  }

  const [config] = await db
    .select({ agents: agentConfigsTable.agents, autonomyEnabledAt: agentConfigsTable.autonomyEnabledAt })
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId))
    .limit(1);
  if (!config) return res.status(422).json({ error: "Configuração de agentes não encontrada para o tenant" });
  const agentEntry = config.agents?.[agentName as AgentType];
  if (!agentEntry?.enabled) return res.status(422).json({ error: `Agente ${agentName} não está habilitado neste tenant` });

  const now = new Date();
  const legacyAutonomyEnabled = Boolean(config.autonomyEnabledAt && config.autonomyEnabledAt <= now);
  const autonomyLevel = resolveAgentAutonomyLevel(config.agents, agentName, legacyAutonomyEnabled);
  const sensitive = isSensitiveAction(actionType);
  const executeImmediately = autonomyLevel === "autonomo" && !sensitive;
  const taskPayload: Record<string, unknown> = {
    ...payload,
    ...(actionType === "enviar_whatsapp" ? { leadId } : {}),
    _jarvisPlan: { caseId, planId: plan.id, stepId },
  };

  const [task] = await db.insert(agentTasksTable).values({
    tenantId,
    leadId,
    agentName,
    actionType,
    payload: taskPayload,
    status: executeImmediately ? "executando" : "pendente_aprovacao",
    executedAt: executeImmediately ? now : null,
  }).returning();

  await updateJarvisActionPlanStep({
    tenantId,
    caseId,
    stepId,
    status: "RUNNING",
    taskId: task.id,
    executableActionType: actionType,
    blockingReason: sensitive
      ? "Ação sensível exige aprovação humana antes da execução."
      : executeImmediately
        ? null
        : autonomyLevel === "manual"
          ? "Aguardando aprovação humana; depois a execução permanece explícita no modo manual."
          : "Aguardando aprovação humana; após aprovação o modo assistido executa automaticamente.",
    operationalAgent: agentName,
    result: { taskStatus: task.status, autonomyLevel, sensitive },
  });

  if (!executeImmediately) {
    return res.status(201).json({ task, autonomyLevel, sensitive, executedImmediately: false });
  }

  const finished = await executeTaskAction(task, req.log);
  const finalStatus = finished.status === "concluido" ? "COMPLETED" : "FAILED";
  const updatedPlan = await updateJarvisActionPlanStep({
    tenantId,
    caseId,
    stepId,
    status: finalStatus,
    taskId: finished.id,
    executableActionType: actionType,
    blockingReason: null,
    operationalAgent: agentName,
    result: {
      taskStatus: finished.status,
      autonomyLevel,
      sensitive,
      ...(finished.result ? { taskResult: finished.result } : {}),
      ...(finished.errorMessage ? { errorMessage: finished.errorMessage } : {}),
    },
  });
  const planResponse = updatedPlan && !("error" in updatedPlan) ? updatedPlan.plan : null;
  return res.status(201).json({ task: finished, autonomyLevel, sensitive, executedImmediately: true, plan: planResponse });
});

router.patch("/jarvis/cases/:id/action-plan/steps/:stepId", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });
  const parsed = stepUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: parsed.error.message });

  const result = await updateJarvisActionPlanStep({
    tenantId,
    caseId: String(req.params.id ?? "").trim(),
    stepId: String(req.params.stepId ?? "").trim(),
    status: parsed.data.status,
    result: parsed.data.result,
    taskId: parsed.data.taskId,
  });
  if (!result) return res.status(404).json({ error: "Caso Vendor não encontrado" });
  if ("error" in result) {
    return res.status(404).json({ error: result.error === "plan_not_found" ? "Plano de ação não encontrado" : "Etapa do plano não encontrada" });
  }
  return res.json(result);
});

// Resposta determinística para perguntas de acompanhamento de execução.
// O router de ações naturais roda antes deste e continua responsável por aprovar/executar.
router.post("/support/chat", async (req, res, next) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  const text = lastUserMessage(req.body);
  if (!tenantId || !text || !wantsExecutionBrief(text)) return next();

  try {
    const items = await loadSynchronizedPlans(tenantId);
    const brief = buildExecutionBrief(items);
    writeSse(res, briefText(brief), {
      jarvisAction: "execution_brief",
      actionStatus: "read_only",
      executionSummary: brief.summary,
    });
  } catch (err) {
    req.log?.warn({ err, tenantId }, "jarvis: execution brief falhou; seguindo para chat normal");
    next();
  }
});

export default router;