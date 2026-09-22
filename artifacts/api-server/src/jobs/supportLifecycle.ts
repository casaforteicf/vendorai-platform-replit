import { and, eq, inArray } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  leadsTable,
  notificationsTable,
  usersTable,
  workCardsTable,
} from "@workspace/db";
import { tenantIsWithinBusinessHours } from "../lib/proactiveMessageGuard.js";
import { sendDirectWhatsAppMessage } from "../services/omnichannel.js";
import { requestSupportFeedback } from "../services/support-feedback.js";

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
  code: string;
  stage: string;
  title: string;
  log: Logger;
}) {
  await db.insert(notificationsTable).values({
    tenantId: input.tenantId,
    title: input.title,
    message: `A assistência ${input.code} está na etapa ${input.stage} e precisa de acompanhamento.`,
    type: "warning",
    category: "support_lifecycle",
  }).catch(() => undefined);

  if (!input.ownerId) return;
  const [owner] = await db
    .select({ telefone: usersTable.telefone })
    .from(usersTable)
    .where(and(eq(usersTable.id, input.ownerId), eq(usersTable.tenantId, input.tenantId)))
    .limit(1);

  if (!owner?.telefone) return;
  await sendDirectWhatsAppMessage(
    input.tenantId,
    owner.telefone,
    `🛠️ Acompanhamento de suporte
Assistência: ${input.code}
Etapa: ${input.stage}
${input.title}`,
    input.log,
  ).catch((error) => {
    input.log.warn(
      { err: error, tenantId: input.tenantId, code: input.code },
      "support-lifecycle: owner WhatsApp failed",
    );
  });
}

export async function runSupportLifecycle(log: Logger): Promise<void> {
  const cards = await db
    .select()
    .from(workCardsTable)
    .where(
      and(
        eq(workCardsTable.pipeline, "suporte"),
        inArray(workCardsTable.etapa, [...ACTIVE_SUPPORT_STAGES]),
      ),
    )
    .limit(500);

  const now = new Date();
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
            .select({ id: leadsTable.id, telefone: leadsTable.telefone, nome: leadsTable.nome })
            .from(leadsTable)
            .where(and(eq(leadsTable.id, card.leadId), eq(leadsTable.tenantId, card.tenantId)))
            .limit(1)
        : [];

      const stageChanged = metadata.supportLifecycleStage !== stage;
      const stageEnteredAt = stageChanged ? card.updatedAt : stageEntryDate(card, metadata);
      const nextMetadata: Record<string, unknown> = {
        ...metadata,
        supportLifecycleStage: stage,
        supportStageEnteredAt: stageEnteredAt.toISOString(),
        supportLifecycleLastCheckedAt: now.toISOString(),
      };

      // Important stage transitions are proactively communicated once.
      if (stageChanged) {
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
        const reminderCount = Number(metadata.supportFeedbackReminderCount ?? 0);

        if (feedbackAge >= 24 && reminderCount < 3 && lead?.telefone) {
          const text =
            feedbackStatus === "resolved_waiting_rating"
              ? `Falta só sua avaliação final da assistência ${card.codigo}. De 1 a 5, que nota você dá para o atendimento?`
              : `Quero confirmar o resultado da assistência ${card.codigo}. O problema ficou resolvido? Responda SIM ${card.codigo}, PARCIALMENTE ${card.codigo} ou NÃO ${card.codigo}.`;
          const lastReminderAt =
            typeof metadata.supportFeedbackLastReminderAt === "string"
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
        const followupCount = Number(metadata.supportStageFollowupCount ?? 0);
        const lastFollowupAt =
          typeof metadata.supportStageFollowupAt === "string"
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
        typeof metadata.supportOwnerReminderAt === "string"
          ? metadata.supportOwnerReminderAt
          : null;

      if (
        stageAge >= policy.ownerReminderAfterHours &&
        (!lastOwnerReminderAt || hoursSince(lastOwnerReminderAt, now) >= 24)
      ) {
        await notifyOwner({
          tenantId: card.tenantId,
          ownerId: card.responsavelId,
          code: card.codigo,
          stage,
          title:
            stage === "feedback_cliente"
              ? "Cliente ainda não concluiu a avaliação final."
              : "Assistência sem avanço dentro da janela esperada.",
          log,
        });
        nextMetadata.supportOwnerReminderAt = now.toISOString();
        ownerReminders++;
      }

      // Reset stage-scoped counters on a real stage transition.
      if (stageChanged) {
        nextMetadata.supportStageFollowupCount = 0;
        nextMetadata.supportStageFollowupAt = null;
        nextMetadata.supportOwnerReminderAt = null;
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
}
