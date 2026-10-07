import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  leadsTable,
  notificationsTable,
  usersTable,
  workCardsTable,
  workCardAttachmentsTable,
} from "@workspace/db";
import { tenantIsWithinBusinessHours } from "../lib/proactiveMessageGuard.js";
import { sendAgentAttachments, sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { requestSupportFeedback } from "../services/support-feedback.js";
import { executeConfiguredStageEvents } from "../services/pipeline-stage-events.js";


const DISTRIBUTED_LOCK_KEY = "vendorai:support-lifecycle:v2";
const SUPPORT_TIME_ZONE = "America/Sao_Paulo";

function dateKeyInTimeZone(value: Date, timeZone = SUPPORT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const year = parts.find((part) => part.type === "year")?.value ?? "";
  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = parts.find((part) => part.type === "day")?.value ?? "";
  return `${year}-${month}-${day}`;
}

function plannedDateKey(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // Datas previstas são cadastradas como data civil (input type=date). O banco
  // pode persistir 00:00 UTC; usar a parte ISO evita deslocar um dia no Brasil.
  return date.toISOString().slice(0, 10);
}

function formatDateKeyPtBr(value: string | null): string {
  if (!value) return "Não informada";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

const ACTIVE_SUPPORT_STAGES = [
  "chamado_cliente",
  "agendamento_assistencia",
  "execucao_assistencia",
  "relatorio_assistencia",
  "feedback_cliente",
] as const;

type SupportStage = (typeof ACTIVE_SUPPORT_STAGES)[number];

type SupportLifecyclePolicy = {
  customerFollowupAfterHours: number | null;
  ownerReminderAfterHours: number;
  customerMessage?: (code: string) => string;
};

export function getSupportLifecyclePolicy(stage: string): SupportLifecyclePolicy | null {
  switch (stage) {
    case "chamado_cliente":
      return {
        customerFollowupAfterHours: 6,
        ownerReminderAfterHours: 2,
        customerMessage: (code) =>
          `Seu chamado ${code} continua em acompanhamento pela nossa equipe. Assim que houver avanço, eu te atualizo por aqui.`,
      };
    case "agendamento_assistencia":
      return {
        customerFollowupAfterHours: 24,
        ownerReminderAfterHours: 12,
        customerMessage: (code) =>
          `Seguimos acompanhando o agendamento da assistência ${code}. Assim que o horário estiver confirmado, eu te aviso por aqui.`,
      };
    case "execucao_assistencia":
      return {
        customerFollowupAfterHours: 24,
        ownerReminderAfterHours: 24,
        customerMessage: (code) =>
          `A assistência ${code} segue em acompanhamento. Estou monitorando o andamento e te aviso quando houver a próxima atualização.`,
      };
    case "relatorio_assistencia":
      return {
        customerFollowupAfterHours: 24,
        ownerReminderAfterHours: 12,
        customerMessage: (code) =>
          `A assistência ${code} está na etapa de conferência/relatório final. Assim que concluirmos essa validação, retorno para confirmar o resultado com você.`,
      };
    case "feedback_cliente":
      return {
        customerFollowupAfterHours: null,
        ownerReminderAfterHours: 48,
      };
    default:
      return null;
  }
}

function hoursSince(value: string | Date | null | undefined, now: Date): number {
  if (!value) return 0;
  const date = value instanceof Date ? value : new Date(value);
  const ms = now.getTime() - date.getTime();
  return Number.isFinite(ms) ? Math.max(0, ms / 3_600_000) : 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stageEntryDate(
  card: typeof workCardsTable.$inferSelect,
  metadata: Record<string, unknown>,
): Date {
  if (
    metadata.supportLifecycleStage === card.etapa &&
    typeof metadata.supportStageEnteredAt === "string"
  ) {
    const parsed = new Date(metadata.supportStageEnteredAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return card.updatedAt;
}

function stageCustomerMessage(stage: string, code: string): string | null {
  switch (stage) {
    case "agendamento_assistencia":
      return `Seu chamado ${code} avançou para agendamento da assistência. Vou acompanhar essa etapa com você e te aviso assim que houver confirmação.`;
    case "execucao_assistencia":
      return `Seu chamado ${code} avançou para execução da assistência. Vou continuar acompanhando o processo até a confirmação final.`;
    case "relatorio_assistencia":
      return `A execução do chamado ${code} foi concluída e agora estamos consolidando o relatório da assistência. Depois disso, confirmarei com você se ficou tudo resolvido.`;
    default:
      return null;
  }
}

async function notifyOwner(input: {
  tenantId: string;
  ownerId: string | null;
  cardId: string;
  code: string;
  stage: string;
  title: string;
  dueDateKey: string | null;
  lead: {
    nome: string | null;
    empresa: string | null;
    telefone: string | null;
    endereco: string | null;
    tipoPessoa: string | null;
    dadosPj: { socios?: Array<{ nome?: string | null; telefone?: string | null }> } | null;
  } | null;
  log: Logger;
}) {
  const clientName = input.lead?.empresa || input.lead?.nome || "Cliente não identificado";
  const companyContact =
    input.lead?.empresa
      ? input.lead.nome
      : input.lead?.tipoPessoa === "juridica"
        ? input.lead?.dadosPj?.socios?.[0]?.nome ?? null
        : null;
  const companyPhone =
    input.lead?.telefone || input.lead?.dadosPj?.socios?.[0]?.telefone || null;

  await db.insert(notificationsTable).values({
    tenantId: input.tenantId,
    title: input.title,
    message: `A assistência ${input.code} de ${clientName} está na etapa ${input.stage} e precisa de acompanhamento.`,
    type: "warning",
    category: "support_lifecycle",
  }).catch(() => undefined);

  if (!input.ownerId) return;
  const [owner] = await db
    .select({ telefone: usersTable.telefone, name: usersTable.name })
    .from(usersTable)
    .where(and(eq(usersTable.id, input.ownerId), eq(usersTable.tenantId, input.tenantId)))
    .limit(1);

  if (!owner?.telefone) return;

  const attachments = await db
    .select({
      nome: workCardAttachmentsTable.nome,
      url: workCardAttachmentsTable.url,
      mimeType: workCardAttachmentsTable.mimeType,
    })
    .from(workCardAttachmentsTable)
    .where(and(
      eq(workCardAttachmentsTable.tenantId, input.tenantId),
      eq(workCardAttachmentsTable.workCardId, input.cardId),
    ));

  const images = attachments.filter((attachment) => attachment.mimeType?.startsWith("image/"));
  const fallbackImageLinks = images
    .filter((attachment) => !attachment.url.startsWith("/api/storage"))
    .slice(0, 5)
    .map((attachment) => `📷 ${attachment.nome}: ${attachment.url}`);

  const message = [
    "🛠️ Acompanhamento de suporte",
    `Assistência: ${input.code}`,
    `Cliente: ${clientName}`,
    companyContact && companyContact !== clientName ? `Contato: ${companyContact}` : null,
    companyPhone ? `Telefone: ${companyPhone}` : null,
    input.lead?.endereco ? `Endereço: ${input.lead.endereco}` : null,
    `Data prevista: ${formatDateKeyPtBr(input.dueDateKey)}`,
    `Etapa: ${input.stage}`,
    `Responsável: ${owner.name || "não informado"}`,
    input.title,
    `🔗 Abrir atendimento: https://app.appvendorai.com/pipeline-operacional/suporte?card=${encodeURIComponent(input.cardId)}`,
    images.length ? `Imagens anexadas: ${images.length}` : "Imagens anexadas: nenhuma",
    ...fallbackImageLinks,
  ].filter(Boolean).join("\n");

  await sendDirectWhatsAppMessage(
    input.tenantId,
    owner.telefone,
    message,
    input.log,
  ).catch((error) => {
    input.log.warn(
      { err: error, tenantId: input.tenantId, code: input.code },
      "support-lifecycle: owner WhatsApp failed",
    );
  });

  const media = images
    .filter((attachment) => attachment.url.startsWith("/api/storage") && attachment.mimeType)
    .slice(0, 5)
    .map((attachment) => ({
      name: attachment.nome,
      objectPath: attachment.url.replace(/^\/api\/storage/, ""),
      mimeType: attachment.mimeType!,
    }));
  if (media.length) {
    await sendAgentAttachments(input.tenantId, owner.telefone, media, input.log);
  }
}

export async function runSupportLifecycle(log: Logger): Promise<void> {
  await db.transaction(async (tx) => {
    const lockResult = await tx.execute<{ acquired: boolean }>(sql`
      select pg_try_advisory_xact_lock(hashtext(${DISTRIBUTED_LOCK_KEY})) as acquired
    `);
    const acquired = Boolean(lockResult.rows?.[0]?.acquired);
    if (!acquired) {
      log.info("support-lifecycle: ciclo ignorado; outra instância possui o lock");
      return;
    }

  const cards = await db
    .select()
    .from(workCardsTable)
    .where(
      and(
        eq(workCardsTable.pipeline, "suporte"),
        inArray(workCardsTable.etapa, [...ACTIVE_SUPPORT_STAGES]),
      ),
    )
    .orderBy(asc(workCardsTable.updatedAt))
    .limit(1000);

  const now = new Date();
  const todayKey = dateKeyInTimeZone(now);
  const businessHoursCache = new Map<string, boolean>();
  let customerUpdates = 0;
  let ownerReminders = 0;
  let feedbackRequests = 0;

  for (const card of cards) {
    try {
      let withinBusinessHours = businessHoursCache.get(card.tenantId);
      if (withinBusinessHours === undefined) {
        withinBusinessHours = await tenantIsWithinBusinessHours(card.tenantId);
        businessHoursCache.set(card.tenantId, withinBusinessHours);
      }
      if (!withinBusinessHours) continue;

      const metadata = asRecord(card.metadata);
      const stage = card.etapa as SupportStage;
      const policy = getSupportLifecyclePolicy(stage);
      if (!policy) continue;

      const [lead] = card.leadId
        ? await db
            .select({
              id: leadsTable.id,
              telefone: leadsTable.telefone,
              nome: leadsTable.nome,
              empresa: leadsTable.empresa,
              endereco: leadsTable.endereco,
              tipoPessoa: leadsTable.tipoPessoa,
              dadosPj: leadsTable.dadosPj,
            })
            .from(leadsTable)
            .where(and(eq(leadsTable.id, card.leadId), eq(leadsTable.tenantId, card.tenantId)))
            .limit(1)
        : [];

      const [owner] = card.responsavelId
        ? await db
            .select({ id: usersTable.id, name: usersTable.name, telefone: usersTable.telefone })
            .from(usersTable)
            .where(and(eq(usersTable.id, card.responsavelId), eq(usersTable.tenantId, card.tenantId)))
            .limit(1)
        : [];

      const stageChanged = metadata.supportLifecycleStage !== stage;
      const stageEnteredAt = stageChanged ? card.updatedAt : stageEntryDate(card, metadata);
      const nextMetadata: Record<string, unknown> = {
        ...metadata,
        supportLifecycleStage: stage,
        supportStageEnteredAt: stageEnteredAt.toISOString(),
        supportLifecycleLastCheckedAt: now.toISOString(),
        ...(stageChanged
          ? {
              supportStageFollowupCount: 0,
              supportStageFollowupAt: null,
              supportOwnerReminderAt: null,
            }
          : {}),
      };

      // Important stage transitions are proactively communicated once.
      if (stageChanged) {
        await executeConfiguredStageEvents({
          tenantId: card.tenantId,
          pipeline: "suporte",
          stageKey: stage,
          gatilho: "entrada",
          entityType: "work_card",
          entityId: card.id,
          leadId: card.leadId,
          dealId: card.dealId,
          workCardId: card.id,
          client: {
            name: lead?.empresa || lead?.nome || "Cliente",
            phone: lead?.telefone ?? null,
          },
          owner: {
            id: owner?.id ?? card.responsavelId,
            name: owner?.name ?? null,
            phone: owner?.telefone ?? null,
          },
          processTitle: card.titulo,
          processCode: card.codigo,
          url: `https://app.appvendorai.com/pipeline-operacional/suporte?card=${encodeURIComponent(card.id)}`,
          log,
        });

        const transitionMessage = stageCustomerMessage(stage, card.codigo);
        if (transitionMessage && lead?.telefone) {
          await sendDirectWhatsAppMessage(card.tenantId, lead.telefone, transitionMessage, log);
          nextMetadata.supportStageNotifiedAt = now.toISOString();
          customerUpdates++;
        }

        if (stage === "feedback_cliente" && !metadata.supportFeedbackRequestedAt) {
          const result = await requestSupportFeedback(card.tenantId, card.id, log);
          if (result.sent) {
            nextMetadata.supportFeedbackRequestedAt = now.toISOString();
            nextMetadata.supportFeedbackStatus = "aguardando";
            feedbackRequests++;
          }
        }
      }

      if (stage === "feedback_cliente") {
        const feedbackStatus = String(metadata.supportFeedbackStatus ?? "");
        const baseAt =
          typeof metadata.supportResolutionConfirmedAt === "string"
            ? metadata.supportResolutionConfirmedAt
            : typeof metadata.supportFeedbackRequestedAt === "string"
              ? metadata.supportFeedbackRequestedAt
              : stageEnteredAt.toISOString();
        const feedbackAge = hoursSince(baseAt, now);
        const reminderCount = stageChanged
          ? 0
          : Number(metadata.supportFeedbackReminderCount ?? 0);

        if (feedbackAge >= 24 && reminderCount < 3 && lead?.telefone) {
          const text =
            feedbackStatus === "resolved_waiting_rating"
              ? `Falta só sua avaliação final da assistência ${card.codigo}. De 1 a 5, que nota você dá para o atendimento?`
              : `Quero confirmar o resultado da assistência ${card.codigo}. O problema ficou resolvido? Responda SIM ${card.codigo}, PARCIALMENTE ${card.codigo} ou NÃO ${card.codigo}.`;
          const lastReminderAt =
            !stageChanged && typeof metadata.supportFeedbackLastReminderAt === "string"
              ? metadata.supportFeedbackLastReminderAt
              : null;
          if (!lastReminderAt || hoursSince(lastReminderAt, now) >= 24) {
            await sendDirectWhatsAppMessage(card.tenantId, lead.telefone, text, log);
            nextMetadata.supportFeedbackReminderCount = reminderCount + 1;
            nextMetadata.supportFeedbackLastReminderAt = now.toISOString();
            customerUpdates++;
          }
        }
      } else if (policy.customerFollowupAfterHours != null && lead?.telefone) {
        const age = hoursSince(stageEnteredAt, now);
        const followupCount = stageChanged
          ? 0
          : Number(metadata.supportStageFollowupCount ?? 0);
        const lastFollowupAt =
          !stageChanged && typeof metadata.supportStageFollowupAt === "string"
            ? metadata.supportStageFollowupAt
            : null;

        if (
          age >= policy.customerFollowupAfterHours &&
          followupCount < 3 &&
          (!lastFollowupAt || hoursSince(lastFollowupAt, now) >= 24)
        ) {
          const message = policy.customerMessage?.(card.codigo);
          if (message) {
            await sendDirectWhatsAppMessage(card.tenantId, lead.telefone, message, log);
            nextMetadata.supportStageFollowupCount = followupCount + 1;
            nextMetadata.supportStageFollowupAt = now.toISOString();
            customerUpdates++;
          }
        }
      }

      const stageAge = hoursSince(stageEnteredAt, now);
      const lastOwnerReminderAt =
        !stageChanged && typeof metadata.supportOwnerReminderAt === "string"
          ? metadata.supportOwnerReminderAt
          : null;
      const dueDateKey = plannedDateKey(card.dataFimPrevista);
      const reminderIsDue = dueDateKey
        ? todayKey >= dueDateKey
        : stageAge >= policy.ownerReminderAfterHours;

      // Um único aviso por etapa. Quando existe data prevista, nunca antecipar:
      // o lembrete passa a ficar elegível somente na própria data cadastrada.
      if (reminderIsDue) {
        await executeConfiguredStageEvents({
          tenantId: card.tenantId,
          pipeline: "suporte",
          stageKey: stage,
          gatilho: "atraso",
          entityType: "work_card",
          entityId: card.id,
          leadId: card.leadId,
          dealId: card.dealId,
          workCardId: card.id,
          client: {
            name: lead?.empresa || lead?.nome || "Cliente",
            phone: lead?.telefone ?? null,
          },
          owner: {
            id: owner?.id ?? card.responsavelId,
            name: owner?.name ?? null,
            phone: owner?.telefone ?? null,
          },
          processTitle: card.titulo,
          processCode: card.codigo,
          url: `https://app.appvendorai.com/pipeline-operacional/suporte?card=${encodeURIComponent(card.id)}`,
          log,
        });
      }

      if (reminderIsDue && !lastOwnerReminderAt) {
        await notifyOwner({
          tenantId: card.tenantId,
          ownerId: card.responsavelId,
          cardId: card.id,
          code: card.codigo,
          stage,
          dueDateKey,
          lead: lead
            ? {
                nome: lead.nome ?? null,
                empresa: lead.empresa ?? null,
                telefone: lead.telefone ?? null,
                endereco: lead.endereco ?? null,
                tipoPessoa: lead.tipoPessoa ?? null,
                dadosPj: (lead.dadosPj as { socios?: Array<{ nome?: string | null; telefone?: string | null }> } | null) ?? null,
              }
            : null,
          title:
            stage === "feedback_cliente"
              ? "Cliente ainda não concluiu a avaliação final."
              : "Assistência sem avanço dentro da data prevista.",
          log,
        });
        nextMetadata.supportOwnerReminderAt = now.toISOString();
        ownerReminders++;
      }

      await db
        .update(workCardsTable)
        .set({ metadata: nextMetadata })
        .where(and(eq(workCardsTable.id, card.id), eq(workCardsTable.tenantId, card.tenantId)));
    } catch (error) {
      log.error(
        { err: error, workCardId: card.id, tenantId: card.tenantId },
        "support-lifecycle: card processing failed",
      );
    }
  }

  log.info(
    { cards: cards.length, customerUpdates, ownerReminders, feedbackRequests },
    "support-lifecycle: complete",
  );

  });
}

