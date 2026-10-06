import { and, eq } from "drizzle-orm";
import type { Logger } from "pino";
import {
  activitiesTable,
  db,
  notificationsTable,
  pipelineStageEventRunsTable,
  pipelineStagesTable,
  type PipelineStageEventTemplate,
} from "@workspace/db";
import { sendAgentAttachments, sendDirectWhatsAppMessage } from "./omnichannel.js";

type EventParty = {
  id?: string | null;
  name?: string | null;
  phone?: string | null;
};

export type PipelineStageEventContext = {
  tenantId: string;
  pipeline: string;
  stageKey: string;
  gatilho: "entrada" | "atraso";
  entityType: "deal" | "work_card" | "scout";
  entityId: string;
  leadId?: string | null;
  dealId?: string | null;
  workCardId?: string | null;
  client?: EventParty | null;
  owner?: EventParty | null;
  processTitle?: string | null;
  processCode?: string | null;
  url?: string | null;
  log: Logger;
};

function renderTemplate(template: string | null | undefined, input: PipelineStageEventContext, stageLabel: string): string {
  const values: Record<string, string> = {
    cliente: input.client?.name || "Cliente",
    responsavel: input.owner?.name || "Responsável",
    etapa: stageLabel,
    pipeline: input.pipeline,
    titulo: input.processTitle || "",
    codigo: input.processCode || "",
    link: input.url || "",
  };
  return String(template ?? "").replace(/{{\s*(cliente|responsavel|etapa|pipeline|titulo|codigo|link)\s*}}/gi, (_, key: string) =>
    values[key.toLowerCase()] ?? "",
  );
}

async function claimEventRun(input: PipelineStageEventContext, stageId: string, eventId: string) {
  const [claimed] = await db.insert(pipelineStageEventRunsTable).values({
    tenantId: input.tenantId,
    stageId,
    eventId,
    entityType: input.entityType,
    entityId: input.entityId,
    stageKey: input.stageKey,
    gatilho: input.gatilho,
    status: "executing",
    attempts: 1,
  }).onConflictDoNothing().returning();

  if (claimed) return claimed;

  const [existing] = await db.select().from(pipelineStageEventRunsTable).where(and(
    eq(pipelineStageEventRunsTable.tenantId, input.tenantId),
    eq(pipelineStageEventRunsTable.stageId, stageId),
    eq(pipelineStageEventRunsTable.eventId, eventId),
    eq(pipelineStageEventRunsTable.entityType, input.entityType),
    eq(pipelineStageEventRunsTable.entityId, input.entityId),
    eq(pipelineStageEventRunsTable.stageKey, input.stageKey),
    eq(pipelineStageEventRunsTable.gatilho, input.gatilho),
  )).limit(1);

  if (!existing || existing.status === "success" || existing.attempts >= 3) return null;

  const [retry] = await db.update(pipelineStageEventRunsTable).set({
    status: "executing",
    attempts: existing.attempts + 1,
    error: null,
  }).where(eq(pipelineStageEventRunsTable.id, existing.id)).returning();
  return retry ?? null;
}

async function markRun(id: string, status: "success" | "failed", error?: string) {
  await db.update(pipelineStageEventRunsTable).set({
    status,
    error: error ? error.slice(0, 4000) : null,
    executedAt: status === "success" ? new Date() : null,
  }).where(eq(pipelineStageEventRunsTable.id, id));
}

async function sendAttachment(
  tenantId: string,
  phone: string,
  event: PipelineStageEventTemplate,
  log: Logger,
) {
  if (!event.anexo?.url) return;
  if (!event.anexo.url.startsWith("/api/storage")) {
    await sendDirectWhatsAppMessage(tenantId, phone, event.anexo.url, log);
    return;
  }
  await sendAgentAttachments(tenantId, phone, [{
    name: event.anexo.nome,
    objectPath: event.anexo.url.replace(/^\/api\/storage/, ""),
    mimeType: event.anexo.mimeType || "application/octet-stream",
  }], log);
}

async function executeMessageEvent(
  event: PipelineStageEventTemplate,
  input: PipelineStageEventContext,
  stageLabel: string,
) {
  const message = renderTemplate(event.mensagem, input, stageLabel).trim();
  const phones: string[] = [];
  if ((event.destinatario === "cliente" || event.destinatario === "ambos") && input.client?.phone) phones.push(input.client.phone);
  if ((event.destinatario === "responsavel" || event.destinatario === "ambos") && input.owner?.phone) phones.push(input.owner.phone);

  if (event.canal === "notificacao") {
    const recipients: Array<string | null> =
      event.destinatario === "responsavel"
        ? [input.owner?.id ?? null]
        : event.destinatario === "ambos"
          ? [input.owner?.id ?? null, null]
          : [null];

    for (const recipientUserId of recipients) {
      await db.insert(notificationsTable).values({
        tenantId: input.tenantId,
        recipientUserId,
        leadId: input.leadId ?? null,
        title: event.nome,
        message: message || `${stageLabel}: evento automático executado.`,
        type: "info",
        category: `pipeline_stage_event:${input.pipeline}:${input.stageKey}:${event.id}`,
      });
    }
    return;
  }

  const uniquePhones = [...new Set(phones.filter(Boolean))];
  if (uniquePhones.length === 0) {
    throw new Error("Nenhum telefone disponível para o destinatário configurado.");
  }

  for (const phone of uniquePhones) {
    if (message) await sendDirectWhatsAppMessage(input.tenantId, phone, message, input.log);
    if (event.anexo) await sendAttachment(input.tenantId, phone, event, input.log);
  }
}

async function executeDemandEvent(
  event: PipelineStageEventTemplate,
  input: PipelineStageEventContext,
  stageId: string,
  stageLabel: string,
) {
  if (!input.leadId || !event.demanda?.titulo?.trim()) {
    throw new Error("A demanda exige lead vinculado e título.");
  }
  const dueMinutes = event.demanda.prazoMinutos ?? 1440;
  await db.insert(activitiesTable).values({
    tenantId: input.tenantId,
    leadId: input.leadId,
    dealId: input.dealId ?? null,
    workCardId: input.workCardId ?? null,
    tipo: "tarefa",
    titulo: renderTemplate(event.demanda.titulo, input, stageLabel),
    descricao: renderTemplate(event.demanda.descricao, input, stageLabel) || null,
    status: "planejado",
    dataVencimento: new Date(Date.now() + dueMinutes * 60_000),
    prioridade: event.demanda.prioridade ?? "normal",
    estadoExecucao: "planejada",
    categoriaExecucao: event.demanda.bloqueiaAvanco ? "obrigatoria" : "sugerida",
    origem: "pipeline_stage_event",
    origemEtapaId: stageId,
    origemEtapaKey: input.stageKey,
    origemTemplateKey: event.id,
    bloqueiaAvanco: Boolean(event.demanda.bloqueiaAvanco),
    responsavelId: input.owner?.id ?? null,
  });
}

export async function executeConfiguredStageEvents(input: PipelineStageEventContext): Promise<{ executed: number; failed: number }> {
  const [stage] = await db.select().from(pipelineStagesTable).where(and(
    eq(pipelineStagesTable.tenantId, input.tenantId),
    eq(pipelineStagesTable.pipeline, input.pipeline),
    eq(pipelineStagesTable.key, input.stageKey),
  )).limit(1);

  if (!stage) return { executed: 0, failed: 0 };

  const events = ((stage.eventos ?? []) as PipelineStageEventTemplate[])
    .filter((event) => event && event.ativo !== false && event.gatilho === input.gatilho);

  let executed = 0;
  let failed = 0;

  for (const event of events) {
    const run = await claimEventRun(input, stage.id, event.id);
    if (!run) continue;

    try {
      if (event.tipo === "demanda") {
        await executeDemandEvent(event, input, stage.id, stage.label);
      } else {
        await executeMessageEvent(event, input, stage.label);
      }
      await markRun(run.id, "success");
      executed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markRun(run.id, "failed", message);
      input.log.warn({
        err: error,
        tenantId: input.tenantId,
        pipeline: input.pipeline,
        stage: input.stageKey,
        eventId: event.id,
        entityId: input.entityId,
      }, "pipeline-stage-event: falha na execução");
      failed += 1;
    }
  }

  return { executed, failed };
}
