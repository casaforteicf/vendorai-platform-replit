import { and, desc, eq } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  customerIntelligenceTable,
  dealsTable,
  leadStageDynamicQuestionsTable,
  pipelineStagesTable,
} from "@workspace/db";
import type { AgentName } from "../lib/agent-engine.js";

function selectAgent(input: {
  stageKey: string;
  objectiveSource: FollowupObjective["source"];
  riskType: string | null | undefined;
}): AgentName {
  if (input.riskType === "financeiro") return "cobranca";
  if (input.riskType === "operacional" || input.riskType === "insatisfacao") return "service";
  if (input.riskType === "churn" || input.riskType === "desengajamento") return "reactivation";

  if (input.objectiveSource === "stage_question" || input.objectiveSource === "dynamic_question") {
    if (input.stageKey === "novo" || input.stageKey === "qualificado") return "sdr";
    if (["proposta", "negociacao", "conferencia_estoque", "contrato"].includes(input.stageKey)) return "closer";
  }

  if (input.stageKey === "novo" || input.stageKey === "qualificado") return "sdr";
  if (["proposta", "negociacao", "conferencia_estoque", "contrato"].includes(input.stageKey)) return "closer";
  return "followup";
}

export type FollowupObjective = {
  source: "dynamic_question" | "stage_question" | "risk" | "stage_default";
  title: string;
  detail: string;
  questionId?: string;
};

export async function resolveFollowupObjective(input: {
  tenantId: string;
  leadId: string;
  dealId: string;
  log: Logger;
}): Promise<{
  stageKey: string;
  stageLabel: string;
  config: Record<string, unknown>;
  objective: FollowupObjective;
  agentName: AgentName;
  health: {
    score: number | null;
    riskType: string | null;
    riskLevel: string | null;
    trend: string | null;
    confidence: number | null;
    nextBestAction: string | null;
    nextBestActionReason: string | null;
  } | null;
}> {
  const [deal] = await db.select().from(dealsTable).where(and(
    eq(dealsTable.id, input.dealId),
    eq(dealsTable.tenantId, input.tenantId),
    eq(dealsTable.leadId, input.leadId),
  )).limit(1);
  if (!deal) throw new Error("Negócio não encontrado para acompanhamento.");

  const [[stage], [ci], dynamicQuestions] = await Promise.all([
    db.select().from(pipelineStagesTable).where(and(
      eq(pipelineStagesTable.tenantId, input.tenantId),
      eq(pipelineStagesTable.pipeline, "comercial"),
      eq(pipelineStagesTable.key, deal.etapa),
    )).limit(1),
    db.select().from(customerIntelligenceTable).where(and(
      eq(customerIntelligenceTable.tenantId, input.tenantId),
      eq(customerIntelligenceTable.leadId, input.leadId),
    )).limit(1),
    db.select().from(leadStageDynamicQuestionsTable).where(and(
      eq(leadStageDynamicQuestionsTable.tenantId, input.tenantId),
      eq(leadStageDynamicQuestionsTable.leadId, input.leadId),
      eq(leadStageDynamicQuestionsTable.dealId, input.dealId),
      eq(leadStageDynamicQuestionsTable.stageKey, deal.etapa),
      eq(leadStageDynamicQuestionsTable.status, "pendente"),
    )).orderBy(desc(leadStageDynamicQuestionsTable.createdAt)).limit(10),
  ]);

  const config = (stage?.acompanhamentoConfig ?? {}) as Record<string, unknown>;
  const answers = ((deal.respostasEtapas ?? {}) as Record<string, Record<string, string>>)[deal.etapa] ?? {};
  const standardQuestions = stage?.perguntas ?? [];
  const pendingStandard = standardQuestions
    .filter((q) => !String(answers[q.id] ?? "").trim())
    .sort((a, b) => Number(Boolean(b.obrigatoria)) - Number(Boolean(a.obrigatoria)) || (a.ordem ?? 999) - (b.ordem ?? 999));

  const prioritizeGaps = config.priorizarLacunasDaEtapa !== false;
  const prioritizeRisk = config.priorizarRiscoAtual !== false;

  let objective: FollowupObjective | null = null;

  if (prioritizeGaps && dynamicQuestions.length > 0) {
    const q = dynamicQuestions[0]!;
    objective = {
      source: "dynamic_question",
      title: q.objective?.trim() || "Preencher uma lacuna importante desta etapa",
      detail: q.questionText,
      questionId: q.id,
    };
  }

  if (!objective && prioritizeGaps && pendingStandard.length > 0) {
    const q = pendingStandard[0]!;
    objective = {
      source: "stage_question",
      title: q.objetivo?.trim() || "Completar o diagnóstico da etapa",
      detail: q.texto,
      questionId: q.id,
    };
  }

  if (!objective && prioritizeRisk && ci?.nextBestAction) {
    objective = {
      source: "risk",
      title: ci.nextBestAction,
      detail: ci.nextBestActionReason || "Reduzir o principal risco atual do relacionamento.",
    };
  }

  if (!objective) {
    const configured = typeof config.objetivo === "string" ? config.objetivo.trim() : "";
    objective = {
      source: "stage_default",
      title: configured || "Conduzir o cliente ao próximo passo coerente da etapa",
      detail: typeof config.instrucoes === "string" && config.instrucoes.trim()
        ? config.instrucoes.trim()
        : `Dar continuidade à etapa ${stage?.label ?? deal.etapa} sem repetir perguntas já respondidas.`,
    };
  }

  const agentName = selectAgent({
    stageKey: deal.etapa,
    objectiveSource: objective.source,
    riskType: ci?.riskType,
  });

  return {
    stageKey: deal.etapa,
    stageLabel: stage?.label ?? deal.etapa,
    config,
    objective,
    agentName,
    health: ci ? {
      score: ci.healthScore ?? null,
      riskType: ci.riskType ?? null,
      riskLevel: ci.riskLevel ?? null,
      trend: ci.riskTrend ?? null,
      confidence: ci.analysisConfidence ?? null,
      nextBestAction: ci.nextBestAction ?? null,
      nextBestActionReason: ci.nextBestActionReason ?? null,
    } : null,
  };
}
