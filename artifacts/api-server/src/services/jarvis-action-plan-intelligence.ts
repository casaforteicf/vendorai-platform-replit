import { and, eq, inArray } from "drizzle-orm";
import { db, agentTasksTable, jarvisCasesTable } from "@workspace/db";

export type JarvisPlanStatus = "PENDING" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED";
export type JarvisPlanStepStatus = "WAITING" | "READY" | "RUNNING" | "COMPLETED" | "FAILED" | "SKIPPED";
export type JarvisPlanStepKind = "analyze" | "delegate" | "approve" | "execute" | "followup" | "measure";

export type JarvisPlanStep = {
  id: string;
  sequence: number;
  kind: JarvisPlanStepKind;
  label: string;
  description: string;
  operationalAgent: string;
  status: JarvisPlanStepStatus;
  dependsOn: string[];
  executableActionType: string | null;
  taskId: string | null;
  blockingReason: string | null;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: Record<string, unknown> | null;
};

export type JarvisActionPlan = {
  id: string;
  tenantId: string;
  caseId: string;
  goal: string;
  status: JarvisPlanStatus;
  confidence: number;
  source: "jarvis_case";
  createdAt: string;
  updatedAt: string;
  steps: JarvisPlanStep[];
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalizeAgent(category: string) {
  const key = category.toLowerCase();
  if (key.includes("finance") || key.includes("cobran")) return "financeiro";
  if (key.includes("cliente") || key.includes("venda") || key.includes("oportun")) return "closer";
  if (key.includes("prospec")) return "sdr";
  if (key.includes("agenda")) return "scheduler";
  if (key.includes("suporte") || key.includes("sistema")) return "service";
  if (key.includes("pós") || key.includes("pos") || key.includes("relacion")) return "relacionamento";
  return "followup";
}

function buildDefaultPlan(args: {
  tenantId: string;
  caseId: string;
  category: string;
  title: string;
  detail: string;
  recommendedAction: string | null;
  confidence: number | null;
}) {
  const now = new Date().toISOString();
  const planId = crypto.randomUUID();
  const operationalAgent = normalizeAgent(args.category);
  const firstStepId = crypto.randomUUID();
  const secondStepId = crypto.randomUUID();
  const thirdStepId = crypto.randomUUID();
  const fourthStepId = crypto.randomUUID();
  const recommendation = args.recommendedAction?.trim()
    || "Definir a próxima ação com base nas evidências disponíveis antes de executar qualquer mudança.";

  const steps: JarvisPlanStep[] = [
    {
      id: firstStepId,
      sequence: 0,
      kind: "analyze",
      label: "Validar evidências e contexto",
      description: `Confirmar o sinal \"${args.title}\" e revisar as evidências antes de agir.`,
      operationalAgent: "jarvis",
      status: "READY",
      dependsOn: [],
      executableActionType: null,
      taskId: null,
      blockingReason: null,
      createdAt: now,
    },
    {
      id: secondStepId,
      sequence: 1,
      kind: "delegate",
      label: `Preparar ação com ${operationalAgent}`,
      description: recommendation,
      operationalAgent,
      status: "WAITING",
      dependsOn: [firstStepId],
      executableActionType: null,
      taskId: null,
      blockingReason: "A etapa precisa de contexto operacional e de um executor real antes de virar agent_task.",
      createdAt: now,
    },
    {
      id: thirdStepId,
      sequence: 2,
      kind: "followup",
      label: "Acompanhar execução e resposta",
      description: "Verificar se a ação foi executada, se houve erro, rejeição, aprovação pendente ou necessidade de ajuste.",
      operationalAgent: "jarvis",
      status: "WAITING",
      dependsOn: [secondStepId],
      executableActionType: null,
      taskId: null,
      blockingReason: null,
      createdAt: now,
    },
    {
      id: fourthStepId,
      sequence: 3,
      kind: "measure",
      label: "Medir resultado e registrar aprendizado",
      description: "Registrar o resultado observado, a eficácia da ação e o impacto financeiro quando conhecido, fechando o ciclo de aprendizado do tenant.",
      operationalAgent: "jarvis",
      status: "WAITING",
      dependsOn: [thirdStepId],
      executableActionType: null,
      taskId: null,
      blockingReason: null,
      createdAt: now,
    },
  ];

  return {
    id: planId,
    tenantId: args.tenantId,
    caseId: args.caseId,
    goal: recommendation,
    status: "PENDING" as const,
    confidence: Math.max(0, Math.min(1, (args.confidence ?? 50) / 100)),
    source: "jarvis_case" as const,
    createdAt: now,
    updatedAt: now,
    steps,
  } satisfies JarvisActionPlan;
}

function releaseReadyDependencies(steps: JarvisPlanStep[]) {
  const byId = new Map(steps.map((step) => [step.id, step]));
  return steps.map((step) => {
    if (step.status !== "WAITING" || step.dependsOn.length === 0) return step;
    const dependenciesFinished = step.dependsOn.every((dependencyId) => {
      const dependency = byId.get(dependencyId);
      return dependency && (dependency.status === "COMPLETED" || dependency.status === "SKIPPED");
    });
    return dependenciesFinished ? { ...step, status: "READY" as const } : step;
  });
}

function resolvePlanStatus(steps: JarvisPlanStep[]): JarvisPlanStatus {
  const allFinished = steps.every((item) => ["COMPLETED", "SKIPPED"].includes(item.status));
  const anyFailed = steps.some((item) => item.status === "FAILED");
  const anyStarted = steps.some((item) => ["RUNNING", "COMPLETED", "FAILED", "SKIPPED"].includes(item.status));
  if (anyFailed) return "FAILED";
  if (allFinished) return "COMPLETED";
  if (anyStarted) return "RUNNING";
  return "PENDING";
}

function mapTaskStatus(status: string): JarvisPlanStepStatus {
  if (status === "concluido") return "COMPLETED";
  if (status === "erro" || status === "rejeitado") return "FAILED";
  return "RUNNING";
}

export function readJarvisActionPlan(evidence: unknown): JarvisActionPlan | null {
  const record = asRecord(evidence);
  const candidate = record.jarvisActionPlan;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  return candidate as JarvisActionPlan;
}

async function persistPlan(tenantId: string, caseId: string, evidence: unknown, plan: JarvisActionPlan) {
  const record = asRecord(evidence);
  const [updated] = await db
    .update(jarvisCasesTable)
    .set({ evidence: { ...record, jarvisActionPlan: plan }, updatedAt: new Date() })
    .where(and(eq(jarvisCasesTable.id, caseId), eq(jarvisCasesTable.tenantId, tenantId)))
    .returning({ evidence: jarvisCasesTable.evidence });
  return readJarvisActionPlan(updated?.evidence) ?? plan;
}

export async function createJarvisActionPlan(tenantId: string, caseId: string) {
  const [current] = await db
    .select({
      id: jarvisCasesTable.id,
      category: jarvisCasesTable.category,
      title: jarvisCasesTable.title,
      detail: jarvisCasesTable.detail,
      recommendedAction: jarvisCasesTable.recommendedAction,
      confidence: jarvisCasesTable.confidence,
      evidence: jarvisCasesTable.evidence,
    })
    .from(jarvisCasesTable)
    .where(and(eq(jarvisCasesTable.id, caseId), eq(jarvisCasesTable.tenantId, tenantId)))
    .limit(1);

  if (!current) return null;
  const existing = readJarvisActionPlan(current.evidence);
  if (existing) return { plan: existing, created: false };

  const plan = buildDefaultPlan({
    tenantId,
    caseId,
    category: current.category,
    title: current.title,
    detail: current.detail,
    recommendedAction: current.recommendedAction,
    confidence: current.confidence,
  });
  return { plan: await persistPlan(tenantId, caseId, current.evidence, plan), created: true };
}

export async function updateJarvisActionPlanStep(args: {
  tenantId: string;
  caseId: string;
  stepId: string;
  status: JarvisPlanStepStatus;
  result?: Record<string, unknown> | null;
  taskId?: string | null;
  executableActionType?: string | null;
  blockingReason?: string | null;
  operationalAgent?: string;
}) {
  const [current] = await db
    .select({ evidence: jarvisCasesTable.evidence })
    .from(jarvisCasesTable)
    .where(and(eq(jarvisCasesTable.id, args.caseId), eq(jarvisCasesTable.tenantId, args.tenantId)))
    .limit(1);

  if (!current) return null;
  const plan = readJarvisActionPlan(current.evidence);
  if (!plan) return { error: "plan_not_found" as const };

  const index = plan.steps.findIndex((step) => step.id === args.stepId);
  if (index < 0) return { error: "step_not_found" as const };

  const now = new Date().toISOString();
  const step = plan.steps[index];
  const terminal = ["COMPLETED", "FAILED", "SKIPPED"].includes(args.status);
  const updatedStep: JarvisPlanStep = {
    ...step,
    status: args.status,
    taskId: args.taskId === undefined ? step.taskId : args.taskId,
    executableActionType: args.executableActionType === undefined ? step.executableActionType : args.executableActionType,
    blockingReason: args.blockingReason === undefined ? step.blockingReason : args.blockingReason,
    operationalAgent: args.operationalAgent ?? step.operationalAgent,
    result: args.result === undefined ? step.result : args.result,
    startedAt: args.status === "RUNNING" && !step.startedAt ? now : step.startedAt,
    completedAt: terminal ? now : undefined,
  };

  const changedSteps = [...plan.steps];
  changedSteps[index] = updatedStep;
  const steps = releaseReadyDependencies(changedSteps);
  const nextPlan: JarvisActionPlan = { ...plan, status: resolvePlanStatus(steps), updatedAt: now, steps };
  return { plan: await persistPlan(args.tenantId, args.caseId, current.evidence, nextPlan) };
}

export async function synchronizeJarvisActionPlanTasks(tenantId: string, caseId: string) {
  const [current] = await db
    .select({ evidence: jarvisCasesTable.evidence })
    .from(jarvisCasesTable)
    .where(and(eq(jarvisCasesTable.id, caseId), eq(jarvisCasesTable.tenantId, tenantId)))
    .limit(1);
  if (!current) return null;

  const plan = readJarvisActionPlan(current.evidence);
  if (!plan) return { plan: null, changed: false };
  const taskIds = plan.steps.flatMap((step) => step.taskId ? [step.taskId] : []);
  if (!taskIds.length) return { plan, changed: false };

  const tasks = await db
    .select({
      id: agentTasksTable.id,
      tenantId: agentTasksTable.tenantId,
      status: agentTasksTable.status,
      result: agentTasksTable.result,
      errorMessage: agentTasksTable.errorMessage,
      updatedAt: agentTasksTable.updatedAt,
    })
    .from(agentTasksTable)
    .where(and(eq(agentTasksTable.tenantId, tenantId), inArray(agentTasksTable.id, taskIds)));
  const byId = new Map(tasks.map((task) => [task.id, task]));
  let changed = false;
  const now = new Date().toISOString();

  const changedSteps = plan.steps.map((step) => {
    if (!step.taskId) return step;
    const task = byId.get(step.taskId);
    if (!task) return step;
    const status = mapTaskStatus(task.status);
    const taskResult: Record<string, unknown> = {
      taskStatus: task.status,
      taskUpdatedAt: task.updatedAt.toISOString(),
      ...(task.result ? { taskResult: task.result } : {}),
      ...(task.errorMessage ? { errorMessage: task.errorMessage } : {}),
    };
    const sameStatus = step.status === status;
    const previousTaskStatus = step.result?.taskStatus;
    if (sameStatus && previousTaskStatus === task.status) return step;
    changed = true;
    const terminal = status === "COMPLETED" || status === "FAILED";
    return {
      ...step,
      status,
      result: { ...(step.result ?? {}), ...taskResult },
      startedAt: step.startedAt ?? now,
      completedAt: terminal ? now : undefined,
    };
  });

  if (!changed) return { plan, changed: false };
  const steps = releaseReadyDependencies(changedSteps);
  const nextPlan: JarvisActionPlan = { ...plan, status: resolvePlanStatus(steps), updatedAt: now, steps };
  return { plan: await persistPlan(tenantId, caseId, current.evidence, nextPlan), changed: true };
}
