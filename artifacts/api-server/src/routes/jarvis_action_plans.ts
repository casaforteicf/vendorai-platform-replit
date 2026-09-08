import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod/v4";
import {
  db,
  agentConfigsTable,
  agentTasksTable,
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

function isSensitiveAction(actionType: string) {
  return actionType === "aprovacao_desconto"
    || actionType === "aprovacao_fechamento"
    || actionType === "conferencia_estoque";
}

function validateSupportedPayload(actionType: string, payload: Record<string, unknown>, leadId: string) {
  if (actionType === "enviar_whatsapp") {
    const parsed = z.object({
      conteudo: z.string().trim().min(1),
      canal: z.enum(["whatsapp", "instagram", "email", "chat"]).optional(),
    }).passthrough().safeParse(payload);
    if (!parsed.success) return parsed.error.message;
    return null;
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
  return `Executor não suportado para ${actionType} / ${leadId}`;
}

router.get("/jarvis/action-plans", async (req, res) => {
  const tenantId = typeof req.user?.tenantId === "string" ? req.user.tenantId : null;
  if (!tenantId) return res.status(403).json({ error: "Tenant obrigatório" });

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
    return {
      caseId: item.id,
      caseTitle: item.title,
      category: item.category,
      severity: item.severity,
      caseStatus: item.status,
      plan: synced?.plan ?? readJarvisActionPlan(item.evidence),
      updatedAt: item.updatedAt,
    };
  }));

  return res.json({
    generatedAt: new Date(),
    summary: {
      plans: synchronized.length,
      running: synchronized.filter((item) => item.plan?.status === "RUNNING").length,
      pending: synchronized.filter((item) => item.plan?.status === "PENDING").length,
      completed: synchronized.filter((item) => item.plan?.status === "COMPLETED").length,
      failed: synchronized.filter((item) => item.plan?.status === "FAILED").length,
    },
    items: synchronized,
  });
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
    guardrail: "O plano organiza e acompanha o trabalho, mas só delega quando há lead do tenant, agente habilitado, executor suportado e autorização compatível.",
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
  const payloadError = validateSupportedPayload(actionType, payload, leadId);
  if (payloadError) return res.status(422).json({ error: payloadError });

  const [lead] = await db
    .select({ id: leadsTable.id })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);
  if (!lead) return res.status(404).json({ error: "Lead não encontrado neste tenant" });

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
  return res.status(201).json({ task: finished, autonomyLevel, sensitive, executedImmediately: true, plan: "error" in (updatedPlan ?? {}) ? null : updatedPlan?.plan });
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

export default router;
