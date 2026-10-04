import { and, asc, eq } from "drizzle-orm";
import {
  db,
  vendiMissionsTable,
  vendiMissionEventsTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import { callOpenAI } from "../lib/ai-gateway.js";
import { sendDirectWhatsAppMessage } from "./omnichannel.js";
import { logger } from "../lib/logger.js";
import {
  executeVendiTool,
  getVendiTool,
  listVendiTools,
  type VendiToolRisk,
} from "./vendi-tool-registry.js";

export type VendiMissionStep = {
  toolId: string;
  input: Record<string, unknown>;
  reason: string;
};

export type VendiMissionPlan = {
  steps: VendiMissionStep[];
  successCriteria: string[];
};

export function toolNeedsApproval(risk: VendiToolRisk, riskPolicy = "standard") {
  if (riskPolicy === "read_only") return risk !== "low";
  if (riskPolicy === "strict") return risk === "medium" || risk === "high";
  return risk === "high";
}

function nextSequence(events: Array<{ sequence: number }>) {
  return events.reduce((max, event) => Math.max(max, event.sequence), 0) + 1;
}

async function appendEvent(input: {
  tenantId: string;
  missionId: string;
  sequence: number;
  type: string;
  toolId?: string;
  status?: string;
  toolInput?: Record<string, unknown>;
  output?: Record<string, unknown>;
  evidence?: Record<string, unknown>;
  error?: string;
}) {
  await db.insert(vendiMissionEventsTable).values({
    tenantId: input.tenantId,
    missionId: input.missionId,
    sequence: input.sequence,
    type: input.type,
    toolId: input.toolId ?? null,
    status: input.status ?? "recorded",
    input: input.toolInput ?? null,
    output: input.output ?? null,
    evidence: input.evidence ?? null,
    error: input.error ?? null,
  });
}

export async function planVendiMission(input: {
  tenantId: string;
  objective: string;
  context?: Record<string, unknown> | null;
}): Promise<VendiMissionPlan> {
  const tools = listVendiTools();
  const result = await callOpenAI(
    input.tenantId,
    "agent_runtime" as any,
    [
      {
        role: "system",
        content: [
          "Você é o planejador operacional do Vendi.",
          "Transforme o objetivo em um plano curto usando SOMENTE tools fornecidas.",
          "Não invente endpoints, módulos ou IDs.",
          "Prefira ferramentas internas antes de web.",
          "Use web apenas quando a informação/ação não estiver disponível internamente.",
          "Não inclua ação externa ou escrita desnecessária.",
          "Retorne SOMENTE JSON válido no formato:",
          '{"steps":[{"toolId":"...","input":{},"reason":"..."}],"successCriteria":["..."]}',
          "Máximo de 10 passos.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          objective: input.objective,
          context: input.context ?? {},
          tools,
        }),
      },
    ],
    {
      temperature: 0,
      maxTokens: 1800,
      responseFormat: { type: "json_object" },
      billingScope: "platform_runtime",
    },
  );

  const parsed = JSON.parse(result.content) as Partial<VendiMissionPlan>;
  const rawSteps = Array.isArray(parsed.steps) ? parsed.steps.slice(0, 10) : [];
  const steps = rawSteps
    .filter((step): step is VendiMissionStep => Boolean(
      step
      && typeof step.toolId === "string"
      && getVendiTool(step.toolId)
      && step.input
      && typeof step.input === "object"
      && !Array.isArray(step.input),
    ))
    .map((step) => ({
      toolId: step.toolId,
      input: step.input,
      reason: typeof step.reason === "string" ? step.reason : "",
    }));

  if (!steps.length) throw new Error("VENDI_PLAN_EMPTY");

  const successCriteria = Array.isArray(parsed.successCriteria)
    ? parsed.successCriteria.filter((item): item is string => typeof item === "string").slice(0, 8)
    : [];

  return { steps, successCriteria };
}

export async function executeVendiMission(input: {
  tenantId: string;
  missionId: string;
  approvedToolIds?: string[];
}) {
  const [mission] = await db
    .select()
    .from(vendiMissionsTable)
    .where(and(
      eq(vendiMissionsTable.id, input.missionId),
      eq(vendiMissionsTable.tenantId, input.tenantId),
    ))
    .limit(1);
  if (!mission) throw new Error("VENDI_MISSION_NOT_FOUND");

  const existingEvents = await db
    .select()
    .from(vendiMissionEventsTable)
    .where(and(
      eq(vendiMissionEventsTable.missionId, mission.id),
      eq(vendiMissionEventsTable.tenantId, input.tenantId),
    ))
    .orderBy(asc(vendiMissionEventsTable.sequence));

  let sequence = nextSequence(existingEvents);
  let plan = (mission.plan ?? []) as unknown as VendiMissionStep[];

  if (!plan.length) {
    const generated = await planVendiMission({
      tenantId: input.tenantId,
      objective: mission.objective,
      context: mission.context,
    });
    plan = generated.steps;
    await db.update(vendiMissionsTable)
      .set({
        plan: plan as Array<Record<string, unknown>>,
        successCriteria: generated.successCriteria,
        status: "running",
        startedAt: mission.startedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(vendiMissionsTable.id, mission.id));
    await appendEvent({
      tenantId: input.tenantId,
      missionId: mission.id,
      sequence: sequence++,
      type: "plan",
      status: "executed",
      output: { steps: plan.length, successCriteria: generated.successCriteria },
    });
  } else {
    await db.update(vendiMissionsTable)
      .set({ status: "running", startedAt: mission.startedAt ?? new Date(), updatedAt: new Date() })
      .where(eq(vendiMissionsTable.id, mission.id));
  }

  const completedToolIndices = new Set(
    existingEvents
      .filter((event) => event.type === "tool_result" && event.status === "executed")
      .map((event) => Number((event.output as any)?.stepIndex))
      .filter(Number.isFinite),
  );

  const approved = new Set(input.approvedToolIds ?? []);
  const outputs: Array<Record<string, unknown>> = [];
  let recoveryCount = 0;
  const maxRecoveries = 3;
  let adaptiveReplanCount = 0;
  const maxAdaptiveReplans = 3;
  let currentSuccessCriteria = Array.isArray(mission.successCriteria) ? mission.successCriteria : [];

  for (let stepIndex = 0; stepIndex < plan.length; stepIndex++) {
    if (completedToolIndices.has(stepIndex)) continue;
    const step = plan[stepIndex]!;
    const tool = getVendiTool(step.toolId);
    if (!tool) throw new Error("VENDI_TOOL_NOT_FOUND:" + step.toolId);

    if (toolNeedsApproval(tool.risk, mission.riskPolicy) && !approved.has(tool.id)) {
      await appendEvent({
        tenantId: input.tenantId,
        missionId: mission.id,
        sequence: sequence++,
        type: "approval_required",
        toolId: tool.id,
        status: "pending",
        toolInput: step.input,
        output: { stepIndex, reason: step.reason, risk: tool.risk },
      });
      await db.update(vendiMissionsTable)
        .set({ status: "paused_approval", updatedAt: new Date() })
        .where(eq(vendiMissionsTable.id, mission.id));

      const approvalMessage = `A missão "${mission.objective}" precisa da sua aprovação para executar ${tool.label ?? tool.id}. Motivo: ${step.reason || "ação de alto risco"}.`;
      await db.insert(notificationsTable).values({
        tenantId: input.tenantId,
        recipientUserId: mission.createdByUserId ?? null,
        type: "warning",
        category: "vendi_approval_required",
        title: "Vendi aguardando sua aprovação",
        message: approvalMessage,
      });

      if (mission.createdByUserId) {
        try {
          const [owner] = await db
            .select({ telefone: usersTable.telefone })
            .from(usersTable)
            .where(eq(usersTable.id, mission.createdByUserId))
            .limit(1);
          if (owner?.telefone) {
            await sendDirectWhatsAppMessage(
              input.tenantId,
              owner.telefone,
              `⚠️ Vendi precisa da sua aprovação\n\n${approvalMessage}\n\nAbra a Central para aprovar ou rejeitar.`,
              logger,
            );
          }
        } catch (notificationError) {
          logger.warn({ notificationError, missionId: mission.id }, "vendi: falha ao enviar aprovação por WhatsApp");
        }
      }

      return {
        ok: false,
        status: "paused_approval" as const,
        missionId: mission.id,
        pending: { stepIndex, toolId: tool.id, risk: tool.risk, input: step.input, reason: step.reason },
        outputs,
      };
    }

    await appendEvent({
      tenantId: input.tenantId,
      missionId: mission.id,
      sequence: sequence++,
      type: "tool_start",
      toolId: tool.id,
      status: "running",
      toolInput: step.input,
      output: { stepIndex, reason: step.reason, risk: tool.risk },
    });

    try {
      const executed = await executeVendiTool(tool.id, {
        tenantId: input.tenantId,
        userId: mission.createdByUserId,
        missionId: mission.id,
      }, step.input);

      const output = {
        stepIndex,
        toolId: tool.id,
        ok: executed.result.ok,
        data: executed.result.data,
        message: executed.result.message,
      };
      outputs.push(output);

      await appendEvent({
        tenantId: input.tenantId,
        missionId: mission.id,
        sequence: sequence++,
        type: "tool_result",
        toolId: tool.id,
        status: executed.result.ok ? "executed" : "failed",
        toolInput: step.input,
        output,
        evidence: executed.result.evidence,
      });

      if (!executed.result.ok) throw new Error(executed.result.message ?? "VENDI_TOOL_FAILED:" + tool.id);

      const hasUsefulObservation =
        !tool.mutates &&
        executed.result.data !== undefined &&
        stepIndex < plan.length - 1 &&
        adaptiveReplanCount < maxAdaptiveReplans;

      if (hasUsefulObservation) {
        try {
          adaptiveReplanCount++;
          const adaptive = await planVendiMission({
            tenantId: input.tenantId,
            objective: mission.objective,
            context: {
              ...(mission.context && typeof mission.context === "object" ? mission.context : {}),
              adaptiveExecution: {
                attempt: adaptiveReplanCount,
                maxAdaptiveReplans,
                completedSteps: outputs.slice(-8),
                latestObservation: {
                  toolId: tool.id,
                  stepIndex,
                  data: executed.result.data,
                  evidence: executed.result.evidence,
                },
                instruction: [
                  "Reavalie SOMENTE os próximos passos à luz dos dados reais observados.",
                  "Não repita passos já concluídos.",
                  "Prefira ações específicas para os IDs/itens encontrados.",
                  "Não aumente risco nem contorne aprovação humana.",
                  "Se o plano original restante já for adequado, mantenha-o semanticamente equivalente.",
                ].join(" "),
              },
            },
          });

          if (adaptive.steps.length) {
            const completedPrefix = plan.slice(0, stepIndex + 1);
            plan = [...completedPrefix, ...adaptive.steps];
            if (adaptive.successCriteria.length) currentSuccessCriteria = adaptive.successCriteria;

            await db.update(vendiMissionsTable)
              .set({
                plan: plan as Array<Record<string, unknown>>,
                successCriteria: currentSuccessCriteria,
                updatedAt: new Date(),
              })
              .where(eq(vendiMissionsTable.id, mission.id));

            await appendEvent({
              tenantId: input.tenantId,
              missionId: mission.id,
              sequence: sequence++,
              type: "adaptive_plan",
              status: "executed",
              toolId: tool.id,
              output: {
                stepIndex,
                adaptiveReplanCount,
                remainingSteps: adaptive.steps.map((item) => item.toolId),
              },
              evidence: {
                strategy: "observation_driven_replan",
                sourceTool: tool.id,
              },
            });
          }
        } catch (adaptiveError: any) {
          await appendEvent({
            tenantId: input.tenantId,
            missionId: mission.id,
            sequence: sequence++,
            type: "adaptive_plan_error",
            status: "failed",
            toolId: tool.id,
            output: { stepIndex, adaptiveReplanCount },
            error: adaptiveError?.message ?? "VENDI_ADAPTIVE_PLAN_FAILED",
          });
        }
      }
    } catch (error: any) {
      const message = error?.message ?? "VENDI_TOOL_FAILED";
      await appendEvent({
        tenantId: input.tenantId,
        missionId: mission.id,
        sequence: sequence++,
        type: "error",
        toolId: tool.id,
        status: "failed",
        toolInput: step.input,
        output: { stepIndex, recoveryCount },
        error: message,
      });

      if (recoveryCount < maxRecoveries) {
        recoveryCount++;
        try {
          const recovery = await planVendiMission({
            tenantId: input.tenantId,
            objective: mission.objective,
            context: {
              ...(mission.context && typeof mission.context === "object" ? mission.context : {}),
              recovery: {
                attempt: recoveryCount,
                maxRecoveries,
                failedStep: { stepIndex, toolId: tool.id, input: step.input, reason: step.reason },
                error: message,
                completedOutputs: outputs.slice(-8),
                instruction: "Replaneje a partir da falha. Prefira uma ferramenta/caminho alternativo; não repita cegamente a mesma ação que acabou de falhar.",
              },
            },
          });

          const replacement = recovery.steps;
          if (recovery.successCriteria.length) currentSuccessCriteria = recovery.successCriteria;
          if (replacement.length) {
            plan = [...plan.slice(0, stepIndex), ...replacement];
            await db.update(vendiMissionsTable)
              .set({
                plan: plan as Array<Record<string, unknown>>,
                successCriteria: recovery.successCriteria.length
                  ? recovery.successCriteria
                  : currentSuccessCriteria,
                status: "running",
                lastError: message,
                updatedAt: new Date(),
              })
              .where(eq(vendiMissionsTable.id, mission.id));

            await appendEvent({
              tenantId: input.tenantId,
              missionId: mission.id,
              sequence: sequence++,
              type: "recovery_plan",
              status: "executed",
              output: {
                failedStepIndex: stepIndex,
                failedToolId: tool.id,
                recoveryAttempt: recoveryCount,
                replacementSteps: replacement.map((item) => item.toolId),
              },
              evidence: { strategy: "automatic_replan", previousError: message },
            });

            stepIndex--;
            continue;
          }
        } catch (recoveryError: any) {
          await appendEvent({
            tenantId: input.tenantId,
            missionId: mission.id,
            sequence: sequence++,
            type: "recovery_error",
            status: "failed",
            output: { stepIndex, recoveryAttempt: recoveryCount },
            error: recoveryError?.message ?? "VENDI_RECOVERY_PLAN_FAILED",
          });
        }
      }

      await db.update(vendiMissionsTable)
        .set({
          status: "failed",
          lastError: message,
          result: { outputs, recoveryCount, maxRecoveries },
          updatedAt: new Date(),
        })
        .where(eq(vendiMissionsTable.id, mission.id));
      return {
        ok: false,
        status: "failed" as const,
        missionId: mission.id,
        error: message,
        outputs,
        recoveryCount,
      };
    }
  }

  const result = {
    outputs,
    executedSteps: outputs.length,
    recoveryCount,
    adaptiveReplanCount,
    verification: {
      allExecutedStepsSucceeded: outputs.every((item) => item.ok === true),
      evidenceCount: outputs.filter((item) => item.data !== undefined || item.message !== undefined).length,
      successCriteria: currentSuccessCriteria,
    },
  };
  await db.update(vendiMissionsTable)
    .set({
      status: "completed",
      result,
      lastError: null,
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(vendiMissionsTable.id, mission.id));

  await appendEvent({
    tenantId: input.tenantId,
    missionId: mission.id,
    sequence: sequence++,
    type: "complete",
    status: "executed",
    output: { executedSteps: outputs.length },
  });

  return { ok: true, status: "completed" as const, missionId: mission.id, result };
}
