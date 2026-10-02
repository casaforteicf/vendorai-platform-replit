import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  activitiesTable,
  db,
  dealsTable,
  leadsTable,
  messagesTable,
  pipelineStagesTable,
} from "@workspace/db";
import { tenantIsWithinBusinessHours } from "../lib/proactiveMessageGuard.js";
import { executarAcompanhamento, planejarAcompanhamento } from "../services/orquestradorAcompanhamento.js";

const DISTRIBUTED_LOCK_KEY = "vendorai:acompanhamento-jornada:v1";

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

export async function runAcompanhamentoJornada(log: Logger): Promise<void> {
  await db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ acquired: boolean }>(sql`
      select pg_try_advisory_xact_lock(hashtext(${DISTRIBUTED_LOCK_KEY})) as acquired
    `);
    if (!Boolean(lockResult.rows?.[0]?.acquired)) {
      log.info("acompanhamento-jornada: outra instância possui o lock");
      return;
    }

    const stages = await tx
      .select()
      .from(pipelineStagesTable)
      .where(eq(pipelineStagesTable.pipeline, "comercial"));

    const activeStages = stages.filter((stage) => configOf(stage.acompanhamentoConfig).ativo === true);
    if (!activeStages.length) {
      log.debug("acompanhamento-jornada: nenhuma etapa ativa");
      return;
    }

    const stageByTenantKey = new Map(activeStages.map((stage) => [`${stage.tenantId}:${stage.key}`, stage]));
    const now = new Date();
    const deals = await tx
      .select()
      .from(dealsTable)
      .where(
        inArray(
          dealsTable.etapa,
          [...new Set(activeStages.map((stage) => stage.key))] as any[],
        ),
      )
      .orderBy(desc(dealsTable.updatedAt))
      .limit(1500);

    let enviados = 0;
    let tarefas = 0;
    let ignorados = 0;

    for (const deal of deals) {
      try {
        if (!deal.leadId) { ignorados++; continue; }
        if (["ganho", "entregue", "perdido"].includes(deal.etapa)) { ignorados++; continue; }

        const stage = stageByTenantKey.get(`${deal.tenantId}:${deal.etapa}`);
        if (!stage) { ignorados++; continue; }

        const cfg = configOf(stage.acompanhamentoConfig);
        const atrasoInicial = Math.max(0, cfg.atrasoInicialMinutos ?? 1440);
        const intervaloMinimo = Math.max(60, cfg.intervaloMinimoMinutos ?? 1440);
        const maxTentativas = Math.min(20, Math.max(1, cfg.maxTentativas ?? 4));
        const enteredAt = stageEnteredAt(deal);

        if (minutesSince(enteredAt, now) < atrasoInicial) {
          ignorados++;
          continue;
        }

        const tentativaPrefix = `acompanhamento:${deal.id}:${deal.etapa}:`;
        const tentativas = await tx
          .select({
            id: activitiesTable.id,
            resultado: activitiesTable.resultadoExecucao,
            createdAt: activitiesTable.createdAt,
          })
          .from(activitiesTable)
          .where(and(
            eq(activitiesTable.tenantId, deal.tenantId),
            eq(activitiesTable.leadId, deal.leadId),
            sql`${activitiesTable.resultadoExecucao} LIKE ${tentativaPrefix + "%"}`,
          ))
          .orderBy(desc(activitiesTable.createdAt))
          .limit(maxTentativas + 2);

        if (tentativas.length >= maxTentativas) {
          ignorados++;
          continue;
        }

        const lastAttempt = tentativas[0];
        if (lastAttempt && minutesSince(lastAttempt.createdAt, now) < intervaloMinimo) {
          ignorados++;
          continue;
        }

        if (cfg.pararAoResponder !== false) {
          const cutoff = lastAttempt?.createdAt ?? enteredAt;
          const [recentInbound] = await tx
            .select({ id: messagesTable.id })
            .from(messagesTable)
            .where(and(
              eq(messagesTable.tenantId, deal.tenantId),
              eq(messagesTable.leadId, deal.leadId),
              eq(messagesTable.direcao, "entrada"),
              sql`${messagesTable.createdAt} > ${cutoff}`,
            ))
            .orderBy(desc(messagesTable.createdAt))
            .limit(1);

          if (recentInbound && lastAttempt) {
            ignorados++;
            continue;
          }
        }

        if (!(await tenantIsWithinBusinessHours(deal.tenantId))) {
          ignorados++;
          continue;
        }

        const tentativa = tentativas.length + 1;
        const dedupeKey = `${tentativaPrefix}${tentativa}`;

        if (cfg.modo === "automatico") {
          const result = await executarAcompanhamento({
            tenantId: deal.tenantId,
            leadId: deal.leadId,
            dealId: deal.id,
            motivoDisparo: `acompanhamento da etapa ${stage.label}; tentativa ${tentativa} de ${maxTentativas}`,
            modoPadrao: "automatico",
            log,
          });

          await tx.insert(activitiesTable).values({
            tenantId: deal.tenantId,
            leadId: deal.leadId,
            dealId: deal.id,
            tipo: result.executado && result.plano.canalPrincipal === "email" ? "email" : "tarefa",
            titulo: result.executado ? `Vendi — acompanhamento automático · ${stage.label}` : `Vendi — acompanhamento requer atenção · ${stage.label}`,
            descricao: [
              result.plano.objetivo,
              result.plano.motivo,
              result.plano.canalPrincipal ? `Canal: ${result.plano.canalPrincipal}` : null,
            ].filter(Boolean).join("\n"),
            status: result.executado ? "concluida" : "pendente",
            concluidaEm: result.executado ? new Date() : null,
            resultadoExecucao: dedupeKey,
          });

          if (result.executado) enviados++;
          else tarefas++;
          continue;
        }

        const plano = await planejarAcompanhamento({
          tenantId: deal.tenantId,
          leadId: deal.leadId,
          dealId: deal.id,
          motivoDisparo: `acompanhamento da etapa ${stage.label}; tentativa ${tentativa} de ${maxTentativas}`,
          modoPadrao: cfg.modo ?? "gerar_aprovar",
          log,
        });

        await tx.insert(activitiesTable).values({
          tenantId: deal.tenantId,
          leadId: deal.leadId,
          dealId: deal.id,
          tipo: "tarefa",
          titulo: cfg.modo === "somente_sugestao"
            ? `Vendi sugere próxima ação · ${stage.label}`
            : `Vendi preparou follow-up para aprovação · ${stage.label}`,
          descricao: [
            `Objetivo: ${plano.objetivo}`,
            plano.canalPrincipal ? `Canal sugerido: ${plano.canalPrincipal}` : null,
            plano.argumento ? `Argumento: ${plano.argumento}` : null,
            plano.beneficio ? `Benefício: ${plano.beneficio}` : null,
            plano.diferencial ? `Diferencial: ${plano.diferencial}` : null,
            plano.prova ? `Prova: ${plano.prova}` : null,
            plano.chamadaParaAcao ? `CTA: ${plano.chamadaParaAcao}` : null,
            plano.conteudo ? `Conteúdo sugerido:\n${plano.conteudo}` : null,
            plano.motivo ? `Motivo: ${plano.motivo}` : null,
          ].filter(Boolean).join("\n\n"),
          status: "pendente",
          dataVencimento: new Date(),
          resultadoExecucao: dedupeKey,
        });
        tarefas++;
      } catch (error) {
        log.warn({ err: error, dealId: deal.id, tenantId: deal.tenantId }, "acompanhamento-jornada: falha não fatal");
      }
    }

    log.info({ enviados, tarefas, ignorados, etapasAtivas: activeStages.length }, "acompanhamento-jornada: ciclo concluído");
  });
}
