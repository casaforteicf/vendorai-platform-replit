import { and, asc, eq, gt } from "drizzle-orm";
import type { Logger } from "pino";
import {
  agentActionsLogTable,
  activitiesTable,
  customerIntelligenceTable,
  db,
  dealsTable,
  leadsTable,
  notificationsTable,
  pipelineStagesTable,
  propostasTable,
} from "@workspace/db";
import type { PipelineStageAIConfig, PipelineStageAICriterion } from "@workspace/db";
import { recordIntelligenceEvent } from "./customer-intelligence-history.js";

type Trigger = "agent_message" | "stage_changed" | "activity_completed" | "sla_check" | "manual";

export type PipelineAIEvaluation = {
  evaluated: boolean;
  mode: PipelineStageAIConfig["mode"];
  currentStage: string;
  nextStage: string | null;
  criteriaMet: boolean;
  missingCriteria: string[];
  action: "none" | "suggested" | "pending_approval" | "advanced";
  reason: string;
};

function readPath(source: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => {
    if (value == null || typeof value !== "object") return undefined;
    return (value as Record<string, unknown>)[key];
  }, source);
}

function compareCriterion(actual: unknown, criterion: PipelineStageAICriterion): boolean {
  const operator = criterion.operator ?? "exists";
  const expected = criterion.value;
  if (operator === "exists") return actual !== undefined && actual !== null && actual !== "";
  if (operator === "eq") return actual === expected || String(actual ?? "") === String(expected ?? "");
  if (operator === "neq") return !(actual === expected || String(actual ?? "") === String(expected ?? ""));
  if (operator === "contains") {
    if (Array.isArray(actual)) return actual.some((value) => String(value).includes(String(expected ?? "")));
    return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  }
  const a = Number(actual);
  const b = Number(expected);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (operator === "gt") return a > b;
  if (operator === "gte") return a >= b;
  if (operator === "lt") return a < b;
  if (operator === "lte") return a <= b;
  return false;
}

function evaluateCriteria(facts: Record<string, unknown>, criteria: PipelineStageAICriterion[]) {
  const required = criteria.filter((criterion) => criterion.required !== false);
  const failed = required.filter((criterion) => !compareCriterion(readPath(facts, criterion.field), criterion));
  return {
    met: failed.length === 0,
    missing: failed.map((criterion) => criterion.field),
  };
}

async function logAction(params: {
  tenantId: string;
  leadId: string | null;
  agentName: string;
  status: "pending" | "approved" | "executed" | "rejected" | "blocked_by_plan";
  payload: Record<string, unknown>;
}) {
  await db.insert(agentActionsLogTable).values({
    tenantId: params.tenantId,
    leadId: params.leadId,
    agentName: params.agentName,
    actionType: "pipeline_stage_transition",
    status: params.status,
    payload: params.payload,
  });
}

export async function evaluatePipelineAI(params: {
  tenantId: string;
  dealId: string;
  trigger: Trigger;
  log: Logger;
}): Promise<PipelineAIEvaluation> {
  const { tenantId, dealId, trigger, log } = params;

  const [deal] = await db.select().from(dealsTable)
    .where(and(eq(dealsTable.id, dealId), eq(dealsTable.tenantId, tenantId))).limit(1);
  if (!deal) {
    return { evaluated: false, mode: "desativada", currentStage: "", nextStage: null, criteriaMet: false, missingCriteria: [], action: "none", reason: "deal_not_found" };
  }

  const [stage] = await db.select().from(pipelineStagesTable).where(and(
    eq(pipelineStagesTable.tenantId, tenantId),
    eq(pipelineStagesTable.pipeline, "comercial"),
    eq(pipelineStagesTable.key, deal.etapa),
  )).limit(1);

  const config = stage?.aiConfig;
  const mode = config?.mode ?? "desativada";
  if (!stage || !config || mode === "desativada") {
    return { evaluated: true, mode, currentStage: deal.etapa, nextStage: null, criteriaMet: false, missingCriteria: [], action: "none", reason: "stage_ai_disabled" };
  }

  const [[lead], [intelligence], nextStages] = await Promise.all([
    deal.leadId ? db.select().from(leadsTable).where(and(eq(leadsTable.id, deal.leadId), eq(leadsTable.tenantId, tenantId))).limit(1) : Promise.resolve([]),
    deal.leadId ? db.select().from(customerIntelligenceTable).where(and(eq(customerIntelligenceTable.leadId, deal.leadId), eq(customerIntelligenceTable.tenantId, tenantId))).limit(1) : Promise.resolve([]),
    db.select().from(pipelineStagesTable).where(and(
      eq(pipelineStagesTable.tenantId, tenantId),
      eq(pipelineStagesTable.pipeline, "comercial"),
      gt(pipelineStagesTable.ordem, stage.ordem),
    )).orderBy(asc(pipelineStagesTable.ordem)).limit(1),
  ]);

  const nextStage = nextStages[0] ?? null;
  const facts: Record<string, unknown> = {
    deal,
    lead: lead ?? {},
    intelligence: intelligence ?? {},
    trigger,
    stage: {
      key: stage.key,
      label: stage.label,
      respostas: (deal.respostasEtapas as Record<string, unknown> | null | undefined)?.[stage.key] ?? {},
    },
  };

  // Segurança: autonomia real só avança quando existem critérios de saída
  // explícitos. Isso impede cascatas por configuração incompleta.
  const exitCriteria = config.exitCriteria ?? [];
  const criteria = evaluateCriteria(facts, exitCriteria);
  if (exitCriteria.length === 0) {
    criteria.met = false;
    criteria.missing.push("exitCriteria");
  }

  if (!nextStage) {
    return { evaluated: true, mode, currentStage: deal.etapa, nextStage: null, criteriaMet: criteria.met, missingCriteria: criteria.missing, action: "none", reason: "no_next_stage" };
  }

  const basePayload = {
    trigger,
    dealId: deal.id,
    fromStage: deal.etapa,
    toStage: nextStage.key,
    stageId: stage.id,
    mode,
    criteriaMet: criteria.met,
    missingCriteria: criteria.missing,
    allowedActions: config.allowedActions ?? [],
  };

  if (!criteria.met || !(config.allowedActions ?? []).includes("advance_stage")) {
    if (config.nextBestActionEnabled) {
      await logAction({
        tenantId,
        leadId: deal.leadId ?? null,
        agentName: stage.responsavelAgenteKey ?? "orchestrator",
        status: "pending",
        payload: { ...basePayload, kind: "next_best_action", reason: criteria.met ? "advance_stage_not_allowed" : "criteria_not_met" },
      }).catch((err) => log.warn({ err, tenantId, dealId }, "pipeline-ai: failed to log suggestion"));
    }
    return {
      evaluated: true, mode, currentStage: deal.etapa, nextStage: nextStage.key,
      criteriaMet: criteria.met, missingCriteria: criteria.missing, action: "suggested",
      reason: criteria.met ? "advance_stage_not_allowed" : "criteria_not_met",
    };
  }

  const approvalRequired = mode === "assistida" || (config.approvalRequiredActions ?? []).includes("advance_stage");
  if (approvalRequired) {
    await logAction({
      tenantId,
      leadId: deal.leadId ?? null,
      agentName: stage.responsavelAgenteKey ?? "orchestrator",
      status: "pending",
      payload: { ...basePayload, kind: "approval_required" },
    });
    await db.insert(notificationsTable).values({
      tenantId,
      title: "IA sugere avanço de etapa",
      message: `O negócio "${deal.titulo}" atende os critérios para avançar de ${stage.label} para ${nextStage.label}. Aprovação humana necessária.`,
      type: "info",
      category: "pipeline_ai_approval",
    }).catch((err) => log.warn({ err, tenantId, dealId }, "pipeline-ai: notification failed"));

    return { evaluated: true, mode, currentStage: deal.etapa, nextStage: nextStage.key, criteriaMet: true, missingCriteria: [], action: "pending_approval", reason: "approval_required" };
  }

  // Etapas terminais nunca são fechadas silenciosamente pelo orquestrador.
  // Ganho/perdido podem disparar contrato, pagamento, reserva e outras regras.
  if (["ganho", "perdido", "cancelado", "concluido"].includes(nextStage.key)) {
    await logAction({
      tenantId,
      leadId: deal.leadId ?? null,
      agentName: stage.responsavelAgenteKey ?? "orchestrator",
      status: "pending",
      payload: { ...basePayload, kind: "terminal_stage_requires_approval" },
    });
    return { evaluated: true, mode, currentStage: deal.etapa, nextStage: nextStage.key, criteriaMet: true, missingCriteria: [], action: "pending_approval", reason: "terminal_stage_requires_approval" };
  }

  const [updated] = await db.update(dealsTable).set({
    etapa: nextStage.key,
    etapaAlteradaEm: new Date(),
    updatedAt: new Date(),
  }).where(and(eq(dealsTable.id, deal.id), eq(dealsTable.tenantId, tenantId), eq(dealsTable.etapa, deal.etapa))).returning();

  if (!updated) {
    return { evaluated: true, mode, currentStage: deal.etapa, nextStage: nextStage.key, criteriaMet: true, missingCriteria: [], action: "none", reason: "concurrent_stage_change" };
  }

  if (updated.leadId) {
    await db.insert(activitiesTable).values({
      tenantId,
      leadId: updated.leadId,
      dealId: updated.id,
      tipo: "tarefa",
      titulo: `IA avançou para ${nextStage.label}`,
      descricao: `Movimentação automática após critérios da etapa ${stage.label} serem atendidos. Gatilho: ${trigger}.`,
      status: "concluida",
      concluidaEm: new Date(),
      responsavelId: updated.assignedTo ?? null,
    }).catch((err) => log.warn({ err, tenantId, dealId }, "pipeline-ai: journey activity failed"));
  }

  if (nextStage.key === "proposta" && updated.leadId) {
    const [existingProposal] = await db.select({ id: propostasTable.id }).from(propostasTable).where(and(
      eq(propostasTable.tenantId, tenantId),
      eq(propostasTable.dealId, updated.id),
    )).limit(1);
    if (!existingProposal) {
      await db.insert(propostasTable).values({
        tenantId,
        leadId: updated.leadId,
        dealId: updated.id,
        titulo: `Orçamento — ${updated.titulo}`,
        itens: [],
        valorTotal: updated.valor ? String(updated.valor) : null,
        status: "rascunho",
        autoGenerated: true,
        observacoes: "Orçamento criado automaticamente pela IA ao avançar a pipeline.",
      });
    }
  }

  await logAction({
    tenantId,
    leadId: updated.leadId ?? null,
    agentName: stage.responsavelAgenteKey ?? "orchestrator",
    status: "executed",
    payload: { ...basePayload, kind: "automatic_advance" },
  });

  if (updated.leadId) {
    void recordIntelligenceEvent({
      tenantId,
      leadId: updated.leadId,
      eventType: "deal_stage_changed_ai",
      title: `IA avançou o negócio para ${nextStage.label}`,
      summary: `Etapa anterior: ${stage.label}. Nova etapa: ${nextStage.label}. Gatilho: ${trigger}.`,
      sourceModule: "pipeline_ai",
      sourceId: updated.id,
      metadata: { previousStage: stage.key, stage: nextStage.key, trigger, agentKey: stage.responsavelAgenteKey ?? null },
      log,
    });
  }

  return { evaluated: true, mode, currentStage: deal.etapa, nextStage: nextStage.key, criteriaMet: true, missingCriteria: [], action: "advanced", reason: "criteria_met_autonomous" };
}
