import { and, eq } from "drizzle-orm";
import { db, jarvisCasesTable } from "@workspace/db";

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
  if (key.includes("marketing")) return "marketing";
  if (key.includes("finance") || key.includes("cobran")) return "financeiro";
  if (key.includes("cliente") || key.includes("venda") || key.includes("oportun")) return "closer";
  if (key.includes("prospec")) return "sdr";
  if (key.includes("pós") || key.includes("pos")) return "pos_venda";
  if (key.includes("agenda")) return "agendamento";
  if (key.includes("suporte") || key.includes("sistema")) return "suporte";
  return "jarvis";
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

  const plan: JarvisActionPlan = {
    id: planId,
    tenantId: args.tenantId,
    caseId: args.caseId,
    goal: recommendation,
    status: "PENDING",
    confidence: Math.max(0, Math.min(1, (args.confidence ?? 50) / 100)),
    source: "jarvis_case",
    createdAt: now,
    updatedAt: now,
    steps,
  };

  return plan;
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

export function readJarvisActionPlan(evidence: unknown): JarvisActionPlan | null {
  const record = asRecord(evidence);
  const candidate = record.jarvisActionPlan;
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  return candidate as JarvisActionPlan;
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
    .where(and(
      eq(jarvisCasesTable.id, caseId),
      eq(jarvisCasesTable.tenantId, tenantId),
    ))
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

  const evidence = asRecord(current.evidence);
  const [updated] = await db
    .update(jarvisCasesTable)
    .set({
      evidence: { ...evidence, jarvisActionPlan: plan },
      updatedAt: new Date(),
    })
    .where(and(
      eq(jarvisCasesTable.id, caseId),
      eq(jarvisCasesTable.tenantId, tenantId),
    ))
    .returning({ evidence: jarvisCasesTable.evidence });

  return {
    plan: readJarvisActionPlan(updated?.evidence) ?? plan,
    created: true,
  };
}

export async function updateJarvisActionPlanStep(args: {
  tenantId: string;
  caseId: string;
  stepId: string;
  status: JarvisPlanStepStatus;
  result?: Record<string, unknown> | null;
  taskId?: string | null;
}) {
  const [current] = await db
    .select({ evidence: jarvisCasesTable.evidence })
    .from(jarvisCasesTable)
    .where(and(
      eq(jarvisCasesTable.id, args.caseId),
      eq(jarvisCasesTable.tenantId, args.tenantId),
    ))
    .limit(1);

  if (!current) return null;
  const plan = readJarvisActionPlan(current.evidence);
  if (!plan) return { error: "plan_not_found" as const };

  const index = plan.steps.findIndex((step) => step.id === args.stepId);
  if (index < 0) return { error: "step_not_found" as const };

  const now = new Date().toISOString();
  const step = plan.steps[index];
  const completed = args.status === "COMPLETED" || args.status === "FAILED" || args.status === "SKIPPED";
  const updatedStep: JarvisPlanStep = {
    ...step,
    status: args.status,
    taskId: args.taskId === undefined ? step.taskId : args.taskId,
    result: args.result === undefined ? step.result : args.result,
    startedAt: args.status === "RUNNING" && !step.startedAt ? now : step.startedAt,
    completedAt: completed ? now : undefined,
  };

  const changedSteps = [...plan.steps];
  changedSteps[index] = updatedStep;
  const steps = releaseReadyDependencies(changedSteps);

  const allFinished = steps.every((item) => ["COMPLETED", "SKIPPED"].includes(item.status));
  const anyFailed = steps.some((item) => item.status === "FAILED");
  const anyStarted = steps.some((item) => ["RUNNING", "COMPLETED", "FAILED", "SKIPPED"].includes(item.status));
  const status: JarvisPlanStatus = anyFailed
    ? "FAILED"
    : allFinished
      ? "COMPLETED"
      : anyStarted
        ? "RUNNING"
        : "PENDING";

  const nextPlan: JarvisActionPlan = {
    ...plan,
    status,
    updatedAt: now,
    steps,
  };

  const evidence = asRecord(current.evidence);
  const [updated] = await db
    .update(jarvisCasesTable)
    .set({ evidence: { ...evidence, jarvisActionPlan: nextPlan }, updatedAt: new Date() })
    .where(and(
      eq(jarvisCasesTable.id, args.caseId),
      eq(jarvisCasesTable.tenantId, args.tenantId),
    ))
    .returning({ evidence: jarvisCasesTable.evidence });

  return { plan: readJarvisActionPlan(updated?.evidence) ?? nextPlan };
}
