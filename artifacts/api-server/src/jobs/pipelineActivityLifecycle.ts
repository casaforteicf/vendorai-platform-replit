import { and, asc, eq, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  activitiesTable,
  db,
  dealsTable,
  leadsTable,
  notificationsTable,
  usersTable,
} from "@workspace/db";
import { tenantIsWithinBusinessHours } from "../lib/proactiveMessageGuard.js";
import { sendAgentAttachments, sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { executarAcompanhamento } from "../services/orquestradorAcompanhamento.js";

const DISTRIBUTED_LOCK_KEY = "vendorai:pipeline-activity-lifecycle:v1";
const SUPPORT_TIME_ZONE = "America/Sao_Paulo";

function formatDateTime(value: Date): string {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: SUPPORT_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

function asSocios(value: unknown): Array<{ nome?: string | null; telefone?: string | null }> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  const socios = (value as { socios?: unknown }).socios;
  return Array.isArray(socios) ? socios as Array<{ nome?: string | null; telefone?: string | null }> : [];
}

export async function runPipelineActivityLifecycle(log: Logger): Promise<void> {
  await db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ acquired: boolean }>(sql`
      select pg_try_advisory_xact_lock(hashtext(${DISTRIBUTED_LOCK_KEY})) as acquired
    `);
    if (!Boolean(lockResult.rows?.[0]?.acquired)) {
      log.info("pipeline-activity-lifecycle: ciclo ignorado; outra instância possui o lock");
      return;
    }

    const now = new Date();
    const rows = await tx
      .select({
        activity: activitiesTable,
        lead: {
          nome: leadsTable.nome,
          empresa: leadsTable.empresa,
          telefone: leadsTable.telefone,
          endereco: leadsTable.endereco,
          tipoPessoa: leadsTable.tipoPessoa,
          dadosPj: leadsTable.dadosPj,
        },
        deal: {
          id: dealsTable.id,
          titulo: dealsTable.titulo,
          etapa: dealsTable.etapa,
        },
        owner: {
          id: usersTable.id,
          name: usersTable.name,
          telefone: usersTable.telefone,
        },
      })
      .from(activitiesTable)
      .innerJoin(leadsTable, and(
        eq(leadsTable.id, activitiesTable.leadId),
        eq(leadsTable.tenantId, activitiesTable.tenantId),
      ))
      .leftJoin(dealsTable, eq(dealsTable.id, activitiesTable.dealId))
      .leftJoin(usersTable, eq(usersTable.id, activitiesTable.responsavelId))
      .where(and(
        inArray(activitiesTable.status, ["pendente", "planejado"]),
        isNotNull(activitiesTable.dataVencimento),
        lte(activitiesTable.dataVencimento, now),
      ))
      .orderBy(asc(activitiesTable.dataVencimento))
      .limit(1000);

    const businessHoursCache = new Map<string, boolean>();
    let sent = 0;

    for (const row of rows) {
      const activity = row.activity;

      // Atividades automáticas atribuídas à IA usam o orquestrador oficial de
      // acompanhamento. Ele respeita modo/canais da etapa, regras de risco e
      // escalonamento humano; não cria um segundo mecanismo de mensagem.
      if (activity.categoriaExecucao === "automatica" && activity.agenteResponsavelKey && !activity.responsavelId) {
        try {
          const execution = await executarAcompanhamento({
            tenantId: activity.tenantId,
            leadId: activity.leadId,
            dealId: activity.dealId,
            motivoDisparo: [
              `atividade automática: ${activity.titulo}`,
              activity.objetivo ? `objetivo: ${activity.objetivo}` : null,
              activity.resultadoEsperado ? `resultado esperado: ${activity.resultadoEsperado}` : null,
            ].filter(Boolean).join(" | "),
            modoPadrao: "automatico",
            log,
          });

          if (execution.executado) {
            await tx.update(activitiesTable).set({
              status: "concluida",
              estadoExecucao: "concluida",
              concluidaEm: new Date(),
              resultadoExecucao: `Executada pela IA via ${execution.plano.canalPrincipal ?? "canal disponível"}: ${execution.plano.motivo || "acompanhamento realizado"}`,
              updatedAt: new Date(),
            }).where(eq(activitiesTable.id, activity.id));
            log.info({ activityId: activity.id, tenantId: activity.tenantId }, "pipeline-activity-lifecycle: IA executou atividade");
            continue;
          }

          await tx.update(activitiesTable).set({
            estadoExecucao: execution.plano.requerHumano ? "aguardando" : "planejada",
            resultadoExecucao: execution.plano.requerHumano
              ? "A IA identificou necessidade de intervenção humana antes de executar."
              : "A atividade automática não foi executada porque a configuração/canal da etapa não permite execução automática.",
            updatedAt: new Date(),
          }).where(eq(activitiesTable.id, activity.id));

          // Se o plano pede humano, a notificação abaixo continua e pode ser
          // entregue a um responsável humano quando a atividade for delegada.
          if (!execution.plano.requerHumano) continue;
        } catch (error) {
          log.warn({ err: error, activityId: activity.id, tenantId: activity.tenantId }, "pipeline-activity-lifecycle: falha na execução IA");
          await tx.update(activitiesTable).set({
            estadoExecucao: "aguardando",
            resultadoExecucao: "Falha temporária na execução automática; atividade preservada para nova análise.",
            updatedAt: new Date(),
          }).where(eq(activitiesTable.id, activity.id));
          continue;
        }
      }

      // Assistências têm o fluxo dedicado de suporte, que já envia aviso
      // completo por card. Evita duplicar aviso da mesma ocorrência.
      if (activity.tipo === "assistencia") continue;
      if (!activity.responsavelId) continue;

      let withinBusinessHours = businessHoursCache.get(activity.tenantId);
      if (withinBusinessHours === undefined) {
        withinBusinessHours = await tenantIsWithinBusinessHours(activity.tenantId);
        businessHoursCache.set(activity.tenantId, withinBusinessHours);
      }
      if (!withinBusinessHours) continue;

      const category = `pipeline_activity_due:${activity.id}`;
      const [alreadySent] = await tx
        .select({ id: notificationsTable.id })
        .from(notificationsTable)
        .where(and(
          eq(notificationsTable.tenantId, activity.tenantId),
          eq(notificationsTable.category, category),
        ))
        .limit(1);
      if (alreadySent) continue;

      const socios = asSocios(row.lead.dadosPj);
      const clientName = row.lead.empresa || row.lead.nome || "Cliente não identificado";
      const contactName = row.lead.empresa
        ? row.lead.nome
        : row.lead.tipoPessoa === "juridica"
          ? socios[0]?.nome ?? null
          : null;
      const contactPhone = row.lead.telefone || socios[0]?.telefone || null;
      const dueAt = activity.dataVencimento!;
      const continueUrl = `https://app.appvendorai.com/trabalho/${encodeURIComponent(activity.leadId)}${activity.dealId ? `?dealId=${encodeURIComponent(activity.dealId)}` : ""}`;

      const lines = [
        "📌 Atividade da pipeline",
        `Atividade: ${activity.titulo}`,
        `Cliente: ${clientName}`,
        contactName && contactName !== clientName ? `Contato: ${contactName}` : null,
        contactPhone ? `Telefone: ${contactPhone}` : null,
        row.lead.endereco ? `Endereço: ${row.lead.endereco}` : null,
        row.deal?.titulo ? `Negócio/Pedido: ${row.deal.titulo}` : null,
        row.deal?.etapa ? `Etapa: ${row.deal.etapa}` : null,
        `Data prevista: ${formatDateTime(dueAt)}`,
        `Responsável: ${row.owner?.name || "não informado"}`,
        activity.descricao ? `Detalhes: ${activity.descricao}` : null,
        `🔗 Abrir e continuar no Vendor.ai: ${continueUrl}`,
        activity.anexoNome ? `Anexo: ${activity.anexoNome}` : null,
      ].filter(Boolean).join("\n");

      await tx.insert(notificationsTable).values({
        tenantId: activity.tenantId,
        title: `Atividade prevista: ${activity.titulo}`,
        message: `${clientName} — prevista para ${formatDateTime(dueAt)}.`,
        type: "warning",
        category,
      });

      if (row.owner?.telefone) {
        try {
          await sendDirectWhatsAppMessage(activity.tenantId, row.owner.telefone, lines, log);
          if (
            activity.anexoNome &&
            activity.anexoUrl?.startsWith("/api/storage") &&
            activity.anexoMimeType?.startsWith("image/")
          ) {
            await sendAgentAttachments(activity.tenantId, row.owner.telefone, [{
              name: activity.anexoNome,
              objectPath: activity.anexoUrl.replace(/^\/api\/storage/, ""),
              mimeType: activity.anexoMimeType,
              size: activity.anexoTamanho ?? undefined,
            }], log);
          }
        } catch (error) {
          log.warn({ err: error, activityId: activity.id, tenantId: activity.tenantId }, "pipeline-activity-lifecycle: WhatsApp não enviado");
        }
      }

      sent += 1;
    }

    log.info({ eligible: rows.length, sent }, "pipeline-activity-lifecycle: complete");
  });
}
