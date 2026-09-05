import { getOpenAIForTenant } from "../lib/agent-engine.js";
import {
  getMainGovernanceSnapshot,
  githubGovernanceReadinessReason,
} from "../lib/dev-agent-main-governance.js";

export type DevAgentReadinessState = "ready" | "degraded" | "blocked";

type CheckState = "ready" | "degraded" | "blocked";

type ExecutorProbe = {
  available: boolean;
  mode: "primary" | "fallback" | "unavailable";
  activeModel: string | null;
  primaryModel: string;
  fallbackModel: string;
  primaryOk: boolean;
  fallbackOk: boolean;
  primaryError: string | null;
  fallbackError: string | null;
  checkedAt: string;
  expiresAt: string;
};

export type DevAgentReadiness = {
  state: DevAgentReadinessState;
  checkedAt: string;
  reasons: string[];
  checks: {
    github: CheckState;
    executor: CheckState;
    memory: CheckState;
    runtime: CheckState;
    production: CheckState;
  };
  executor: ExecutorProbe;
};

const EXECUTOR_PRIMARY_MODEL = process.env["DEV_IA_EXECUTOR_MODEL"]?.trim() || "gpt-5.6-terra";
const EXECUTOR_FALLBACK_MODEL = process.env["DEV_IA_EXECUTOR_FALLBACK_MODEL"]?.trim() || "gpt-4o-mini";
const READINESS_CACHE_MS = 30 * 60 * 1000;

let cachedExecutorProbe: ExecutorProbe | null = null;
let executorProbePromise: Promise<ExecutorProbe> | null = null;

function compactError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "erro desconhecido");
  return message.replace(/\s+/g, " ").trim().slice(0, 280);
}

function probeTool() {
  return [{
    type: "function" as const,
    function: {
      name: "readiness_probe",
      description: "Confirma que o modelo do executor suporta chamada de ferramenta.",
      parameters: {
        type: "object",
        properties: { ok: { type: "boolean" } },
        required: ["ok"],
        additionalProperties: false,
      },
    },
  }];
}

function hasReadinessToolCall(completion: any) {
  const calls = completion?.choices?.[0]?.message?.tool_calls;
  return Array.isArray(calls) && calls.some((call: any) => call?.function?.name === "readiness_probe");
}

async function probePrimary(openai: any) {
  const completion = await openai.chat.completions.create({
    model: EXECUTOR_PRIMARY_MODEL,
    max_completion_tokens: 96,
    reasoning_effort: "low",
    messages: [
      { role: "system", content: "Teste de prontidão. Chame readiness_probe com ok=true. Não execute nenhuma outra ação." },
      { role: "user", content: "Confirme prontidão do executor." },
    ],
    tools: probeTool(),
    tool_choice: "required",
  } as any);
  if (!hasReadinessToolCall(completion)) throw new Error("modelo principal respondeu sem tool call obrigatório");
}

async function probeFallback(openai: any) {
  const completion = await openai.chat.completions.create({
    model: EXECUTOR_FALLBACK_MODEL,
    temperature: 0,
    max_tokens: 96,
    messages: [
      { role: "system", content: "Teste de prontidão. Chame readiness_probe com ok=true. Não execute nenhuma outra ação." },
      { role: "user", content: "Confirme prontidão do executor." },
    ],
    tools: probeTool(),
    tool_choice: "required",
  } as any);
  if (!hasReadinessToolCall(completion)) throw new Error("modelo fallback respondeu sem tool call obrigatório");
}

async function runExecutorProbe(): Promise<ExecutorProbe> {
  const checkedAt = new Date();
  const expiresAt = new Date(checkedAt.getTime() + READINESS_CACHE_MS);
  let primaryOk = false;
  let fallbackOk = false;
  let primaryError: string | null = null;
  let fallbackError: string | null = null;

  try {
    const openai = await getOpenAIForTenant("");
    try {
      await probePrimary(openai);
      primaryOk = true;
    } catch (error) {
      primaryError = compactError(error);
      try {
        await probeFallback(openai);
        fallbackOk = true;
      } catch (fallbackErr) {
        fallbackError = compactError(fallbackErr);
      }
    }
  } catch (error) {
    primaryError = compactError(error);
    fallbackError = "cliente OpenAI indisponível";
  }

  return {
    available: primaryOk || fallbackOk,
    mode: primaryOk ? "primary" : fallbackOk ? "fallback" : "unavailable",
    activeModel: primaryOk ? EXECUTOR_PRIMARY_MODEL : fallbackOk ? EXECUTOR_FALLBACK_MODEL : null,
    primaryModel: EXECUTOR_PRIMARY_MODEL,
    fallbackModel: EXECUTOR_FALLBACK_MODEL,
    primaryOk,
    fallbackOk,
    primaryError,
    fallbackError,
    checkedAt: checkedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
}

export async function getExecutorReadiness(force = false): Promise<ExecutorProbe> {
  if (!force && cachedExecutorProbe && Date.parse(cachedExecutorProbe.expiresAt) > Date.now()) {
    return cachedExecutorProbe;
  }
  if (!force && executorProbePromise) return executorProbePromise;

  executorProbePromise = runExecutorProbe()
    .then((probe) => {
      cachedExecutorProbe = probe;
      return probe;
    })
    .finally(() => {
      executorProbePromise = null;
    });

  return executorProbePromise;
}

export async function getDevAgentReadiness(args: {
  githubAvailable: boolean;
  memoryAvailable: boolean;
  observedRevision: string | null;
  productionState: "aligned" | "stale" | "unknown";
}): Promise<DevAgentReadiness> {
  const executor = await getExecutorReadiness();
  const reasons: string[] = [];
  const governance = getMainGovernanceSnapshot();

  const github: CheckState = args.githubAvailable ? "ready" : "blocked";
  const executorState: CheckState = executor.available ? (executor.mode === "primary" ? "ready" : "degraded") : "blocked";
  const memory: CheckState = args.memoryAvailable ? "ready" : "degraded";
  const runtime: CheckState = args.observedRevision ? "ready" : "degraded";
  const production: CheckState = args.productionState === "aligned" ? "ready" : "degraded";

  if (github === "blocked") reasons.push(githubGovernanceReadinessReason(governance.lastError));
  if (executorState === "blocked") reasons.push("Executor principal e fallback indisponíveis.");
  if (executor.mode === "fallback") reasons.push(`Executor principal indisponível; operando com fallback ${executor.fallbackModel}.`);
  if (memory === "degraded") reasons.push("Memória técnica indisponível nesta leitura; execução perde contexto histórico.");
  if (runtime === "degraded") reasons.push("SHA do runtime não identificado; validação pós-deploy fica degradada.");
  if (production === "degraded") reasons.push(`Produção em estado ${args.productionState}; confirmar deploy antes de assumir alinhamento com a main.`);

  const state: DevAgentReadinessState = github === "blocked" || executorState === "blocked"
    ? "blocked"
    : [executorState, memory, runtime, production].includes("degraded")
      ? "degraded"
      : "ready";

  return {
    state,
    checkedAt: new Date().toISOString(),
    reasons: reasons.slice(0, 8),
    checks: { github, executor: executorState, memory, runtime, production },
    executor,
  };
}
