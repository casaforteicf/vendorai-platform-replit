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
import { executarAcompanhamento, planejarAcompanhamento } from "../services/orquestradorAcompanhamento.js";


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
  const stages = await db
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
  const deals = await db
    .select()
    .from(dealsTable)
    .where(
      inArray(
        dealsTable.etapa,
        [...new Set(activeStages.map((stage) => stage.key))] as any[],
      ),
    )
    .orderBy(desc(dealsTable.updatedAt))
    .limit(500);

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
      const tentativas = await db
        .select({
          id: activitiesTable.id,
          resultado: activitiesTable.resultadoExecucao,
          createdAt: activitiesTable.createdAt,
          status: activitiesTable.status,
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

      if (cfg.pararAoResponder !== false && lastAttempt) {
        const [recentInbound] = await db
          .select({ id: messagesTable.id })
          .from(messagesTable)
          .where(and(
            eq(messagesTable.tenantId, deal.tenantId),
            eq(messagesTable.leadId, deal.leadId),
            eq(messagesTable.direcao, "entrada"),
            sql`${messagesTable.createdAt} > ${lastAttempt.createdAt}`,
          ))
          .orderBy(desc(messagesTable.createdAt))
          .limit(1);

        if (recentInbound) {
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

      // Reserva a tentativa antes de chamar IA/canal externo. O índice parcial
      // garante que duas instâncias não executem a mesma tentativa.
      const [reservation] = await db
        .insert(activitiesTable)
        .values({
          tenantId: deal.tenantId,
          leadId: deal.leadId,
          dealId: deal.id,
          tipo: "tarefa",
          titulo: `Vendi — preparando acompanhamento · ${stage.label}`,
          descricao: `Tentativa ${tentativa} de ${maxTentativas}.`,
          status: "planejado",
          resultadoExecucao: dedupeKey,
        })
        .onConflictDoNothing()
        .returning({ id: activitiesTable.id });

      if (!reservation) {
        ignorados++;
        continue;
      }

      try {
        if (cfg.modo === "automatico") {
          const result = await executarAcompanhamento({
            tenantId: deal.tenantId,
            leadId: deal.leadId,
            dealId: deal.id,
            motivoDisparo: `acompanhamento da etapa ${stage.label}; tentativa ${tentativa} de ${maxTentativas}`,
            modoPadrao: "automatico",
            log,
          });

          await db.update(activitiesTable).set({
            titulo: result.executado
              ? `Vendi — acompanhamento automático · ${stage.label}`
              : `Vendi — acompanhamento requer atenção · ${stage.label}`,
            descricao: [
              `Objetivo: ${result.plano.objetivo}`,
              result.plano.canalPrincipal ? `Canal: ${result.plano.canalPrincipal}` : null,
              result.plano.argumento ? `Argumento: ${result.plano.argumento}` : null,
              result.plano.beneficio ? `Benefício: ${result.plano.beneficio}` : null,
              result.plano.prova ? `Prova: ${result.plano.prova}` : null,
              result.plano.motivo ? `Motivo: ${result.plano.motivo}` : null,
            ].filter(Boolean).join("\n\n"),
            status: result.executado ? "concluida" : "pendente",
            concluidaEm: result.executado ? new Date() : null,
            updatedAt: new Date(),
          }).where(eq(activitiesTable.id, reservation.id));

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

        await db.update(activitiesTable).set({
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
          updatedAt: new Date(),
        }).where(eq(activitiesTable.id, reservation.id));
        tarefas++;
      } catch (error) {
        // Falha técnica não consome tentativa. Remove a reserva para permitir
        // nova tentativa no próximo ciclo, sem avançar a cadência comercial.
        await db.delete(activitiesTable)
          .where(eq(activitiesTable.id, reservation.id))
          .catch(() => undefined);
        throw error;
      }
    } catch (error) {
      log.warn({ err: error, dealId: deal.id, tenantId: deal.tenantId }, "acompanhamento-jornada: falha não fatal");
    }
  }

  log.info({ enviados, tarefas, ignorados, etapasAtivas: activeStages.length }, "acompanhamento-jornada: ciclo concluído");
}
