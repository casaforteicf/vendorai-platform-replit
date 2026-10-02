import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  activitiesTable,
  db,
  dealsTable,
  messagesTable,
  pipelineStagesTable,
} from "@workspace/db";
import { tenantIsWithinBusinessHours } from "../lib/proactiveMessageGuard.js";
import { processAgentInternal } from "../services/agent-dispatch.js";
import { resolveFollowupObjective } from "../services/customer-intelligence-followup.js";
import { recordIntelligenceEvent } from "../services/customer-intelligence-history.js";

type Config = {
  ativo?: boolean;
  modo?: "automatico" | "gerar_aprovar" | "somente_sugestao";
  atrasoInicialMinutos?: number;
  intervaloMinimoMinutos?: number;
  maxTentativas?: number;
  pararAoResponder?: boolean;
};

function configOf(value: unknown): Config {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Config : {};
}

function minutesSince(value: Date | string | null | undefined, now: Date): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.max(0, (now.getTime() - date.getTime()) / 60000);
}

function stageEnteredAt(deal: typeof dealsTable.$inferSelect): Date {
  const value = deal.etapaAlteradaEm ?? deal.updatedAt ?? deal.createdAt;
  return value instanceof Date ? value : new Date(value);
}

export async function runCustomerIntelligenceFollowup(log: Logger): Promise<void> {
  const stages = await db.select().from(pipelineStagesTable)
    .where(eq(pipelineStagesTable.pipeline, "comercial"));

  const activeStages = stages.filter((stage) => configOf(stage.acompanhamentoConfig).ativo === true);
  if (!activeStages.length) {
    log.debug("ci-followup: nenhuma etapa ativa");
    return;
  }

  const stageByTenantKey = new Map(activeStages.map((stage) => [`${stage.tenantId}:${stage.key}`, stage]));
  const stageKeys = [...new Set(activeStages.map((stage) => stage.key))];
  const now = new Date();

  const deals = await db.select().from(dealsTable)
    .where(inArray(dealsTable.etapa, stageKeys as any[]))
    .orderBy(desc(dealsTable.updatedAt))
    .limit(500);

  let automaticos = 0;
  let tarefas = 0;
  let ignorados = 0;

  for (const deal of deals) {
    try {
      if (!deal.leadId || ["ganho", "perdido", "entregue", "concluido", "cancelado"].includes(deal.etapa)) {
        ignorados++;
        continue;
      }

      const stage = stageByTenantKey.get(`${deal.tenantId}:${deal.etapa}`);
      if (!stage) { ignorados++; continue; }

      const cfg = configOf(stage.acompanhamentoConfig);
      const atrasoInicial = Math.max(0, cfg.atrasoInicialMinutos ?? 1440);
      const intervaloMinimo = Math.max(60, cfg.intervaloMinimoMinutos ?? 1440);
      const maxTentativas = Math.min(20, Math.max(1, cfg.maxTentativas ?? 4));

      if (minutesSince(stageEnteredAt(deal), now) < atrasoInicial) {
        ignorados++;
        continue;
      }

      const prefix = `ci-followup:${deal.id}:${deal.etapa}:`;
      const attempts = await db.select({
        id: activitiesTable.id,
        createdAt: activitiesTable.createdAt,
        status: activitiesTable.status,
        resultadoExecucao: activitiesTable.resultadoExecucao,
      }).from(activitiesTable).where(and(
        eq(activitiesTable.tenantId, deal.tenantId),
        eq(activitiesTable.leadId, deal.leadId),
        sql`${activitiesTable.resultadoExecucao} LIKE ${prefix + "%"}`,
      )).orderBy(desc(activitiesTable.createdAt)).limit(maxTentativas + 2);

      if (attempts.length >= maxTentativas) { ignorados++; continue; }

      const lastAttempt = attempts[0];
      if (lastAttempt && minutesSince(lastAttempt.createdAt, now) < intervaloMinimo) {
        ignorados++;
        continue;
      }

      if (cfg.pararAoResponder !== false && lastAttempt) {
        const [recentInbound] = await db.select({ id: messagesTable.id }).from(messagesTable).where(and(
          eq(messagesTable.tenantId, deal.tenantId),
          eq(messagesTable.leadId, deal.leadId),
          eq(messagesTable.direcao, "entrada"),
          sql`${messagesTable.createdAt} > ${lastAttempt.createdAt}`,
        )).orderBy(desc(messagesTable.createdAt)).limit(1);
        if (recentInbound) { ignorados++; continue; }
      }

      if (!(await tenantIsWithinBusinessHours(deal.tenantId))) {
        ignorados++;
        continue;
      }

      const attempt = attempts.length + 1;
      const dedupeKey = `${prefix}${attempt}`;
      const objective = await resolveFollowupObjective({
        tenantId: deal.tenantId,
        leadId: deal.leadId,
        dealId: deal.id,
        log,
      });

      const [reservation] = await db.insert(activitiesTable).values({
        tenantId: deal.tenantId,
        leadId: deal.leadId,
        dealId: deal.id,
        tipo: "tarefa",
        titulo: `Vendi — preparando acompanhamento · ${objective.stageLabel}`,
        descricao: [
          `Objetivo: ${objective.objective.title}`,
          `Contexto: ${objective.objective.detail}`,
          objective.health?.riskType ? `Risco atual: ${objective.health.riskType} (${objective.health.riskLevel ?? "sem nível"})` : null,
        ].filter(Boolean).join("\n"),
        status: "planejado",
        resultadoExecucao: dedupeKey,
      }).onConflictDoNothing().returning({ id: activitiesTable.id });

      if (!reservation) { ignorados++; continue; }

      try {
        if (cfg.modo === "automatico") {
          const dispatch = await processAgentInternal({
            tenantId: deal.tenantId,
            leadId: deal.leadId,
            forcedAgent: objective.agentName,
            mensagem: `PROATIVO: acompanhamento inteligente da etapa ${objective.stageLabel}. Agente responsável: ${objective.agentName}. Objetivo atual: ${objective.objective.title}. Lacuna/contexto: ${objective.objective.detail}. Não pergunte novamente informações já conhecidas.`,
            scenario: {
              intelligentFollowup: {
                source: objective.objective.source,
                objective: objective.objective.title,
                detail: objective.objective.detail,
                questionId: objective.objective.questionId ?? null,
                health: objective.health,
                stageKey: objective.stageKey,
                stageLabel: objective.stageLabel,
              },
            },
            log,
          });

          const executed = dispatch.status === "sent";
          await db.update(activitiesTable).set({
            titulo: executed
              ? `Vendi — acompanhamento executado · ${objective.stageLabel}`
              : `Vendi — acompanhamento requer atenção · ${objective.stageLabel}`,
            descricao: [
              `Objetivo: ${objective.objective.title}`,
              `Contexto: ${objective.objective.detail}`,
              `Agente: ${objective.agentName}`,
              `Resultado do agente: ${dispatch.status}`,
              "reason" in dispatch ? `Motivo: ${dispatch.reason}` : null,
            ].filter(Boolean).join("\n"),
            status: executed ? "concluida" : "pendente",
            concluidaEm: executed ? new Date() : null,
            updatedAt: new Date(),
          }).where(eq(activitiesTable.id, reservation.id));

          await recordIntelligenceEvent({
            tenantId: deal.tenantId,
            leadId: deal.leadId,
            eventType: executed ? "intelligent_followup_executed" : "intelligent_followup_attention",
            title: executed ? "Vendi executou acompanhamento inteligente" : "Acompanhamento inteligente precisa de atenção",
            summary: objective.objective.title,
            sourceModule: "activities",
            sourceId: reservation.id,
            metadata: { dealId: deal.id, stage: deal.etapa, objective, dispatch },
            log,
          });

          if (executed) automaticos++;
          else tarefas++;
          continue;
        }

        await db.update(activitiesTable).set({
          titulo: cfg.modo === "somente_sugestao"
            ? `Vendi sugere próxima ação · ${objective.stageLabel}`
            : `Vendi preparou acompanhamento para aprovação · ${objective.stageLabel}`,
          descricao: [
            `Objetivo: ${objective.objective.title}`,
            `Contexto: ${objective.objective.detail}`,
            objective.health?.riskType ? `Risco: ${objective.health.riskType} · ${objective.health.riskLevel ?? ""}` : null,
            objective.health?.nextBestAction ? `Próxima melhor ação: ${objective.health.nextBestAction}` : null,
          ].filter(Boolean).join("\n"),
          status: "pendente",
          dataVencimento: new Date(),
          updatedAt: new Date(),
        }).where(eq(activitiesTable.id, reservation.id));

        await recordIntelligenceEvent({
          tenantId: deal.tenantId,
          leadId: deal.leadId,
          eventType: "intelligent_followup_prepared",
          title: "Vendi preparou o próximo acompanhamento",
          summary: objective.objective.title,
          sourceModule: "activities",
          sourceId: reservation.id,
          metadata: { dealId: deal.id, stage: deal.etapa, objective, agentName: objective.agentName, mode: cfg.modo ?? "gerar_aprovar" },
          log,
        });
        tarefas++;
      } catch (error) {
        await db.delete(activitiesTable).where(eq(activitiesTable.id, reservation.id)).catch(() => undefined);
        throw error;
      }
    } catch (error) {
      log.warn({ err: error, dealId: deal.id, tenantId: deal.tenantId }, "ci-followup: falha não fatal");
    }
  }

  log.info({ automaticos, tarefas, ignorados, etapasAtivas: activeStages.length }, "ci-followup: ciclo concluído");
}
