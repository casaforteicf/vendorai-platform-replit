import { and, desc, eq } from "drizzle-orm";
import {
  activitiesTable,
  db,
  leadsTable,
  workCardsTable,
} from "@workspace/db";
import { sendDirectWhatsAppMessage } from "./omnichannel.js";
import { findLeadByDedup } from "../lib/dedup.js";
import { randomUUID } from "node:crypto";

export type SupportFeedbackResult =
  | { handled: false }
  | {
      handled: true;
      cardId?: string;
      codigo?: string;
      result:
        | "awaiting_rating"
        | "rated"
        | "rating_declined"
        | "reopened"
        | "ambiguous"
        | "unrecognized";
    };

function extractCode(text: string) {
  return text.match(/\bAST-[A-Z0-9]+-[A-Z0-9]+\b/i)?.[0]?.toUpperCase() ?? null;
}

function classifyResolution(text: string): "sim" | "parcial" | "nao" | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(nao|negativo|continua|nao resolveu)\b/.test(normalized)) return "nao";
  if (/\b(parcial|parcialmente|mais ou menos|melhorou)\b/.test(normalized)) return "parcial";
  if (/\b(sim|resolvido|resolveu|positivo|ok|certo)\b/.test(normalized)) return "sim";
  return null;
}

function extractRating(text: string): number | null {
  const withoutCode = text.replace(/\bAST-[A-Z0-9]+-[A-Z0-9]+\b/gi, " ").trim();
  const explicit = withoutCode.match(/\bnota\s*[:=-]?\s*([1-5])\b/i);
  if (explicit?.[1]) return Number(explicit[1]);
  const standalone = withoutCode.match(/(?:^|\D)([1-5])(?:\D|$)/);
  return standalone?.[1] ? Number(standalone[1]) : null;
}

function declinedRating(text: string): boolean {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /\b(prefiro nao avaliar|nao quero avaliar|sem avaliacao|nao vou avaliar)\b/.test(normalized);
}

export async function requestSupportFeedback(tenantId: string, workCardId: string, log?: any) {
  const [card] = await db.select().from(workCardsTable).where(and(
    eq(workCardsTable.id, workCardId),
    eq(workCardsTable.tenantId, tenantId),
    eq(workCardsTable.pipeline, "suporte"),
  )).limit(1);
  if (!card?.leadId) return { sent: false, reason: "no_lead" } as const;

  const [lead] = await db.select({ id: leadsTable.id, nome: leadsTable.nome, telefone: leadsTable.telefone })
    .from(leadsTable)
    .where(and(eq(leadsTable.id, card.leadId), eq(leadsTable.tenantId, tenantId)))
    .limit(1);
  if (!lead?.telefone) return { sent: false, reason: "no_phone" } as const;

  const text = [
    `Olá${lead.nome ? `, ${lead.nome}` : ""}. A assistência ${card.codigo} foi executada.`,
    "O problema ficou resolvido?",
    `Responda: SIM ${card.codigo}, PARCIALMENTE ${card.codigo} ou NÃO ${card.codigo}.`,
    "Se não tiver sido resolvido, abriremos automaticamente um retorno vinculado a esta assistência.",
  ].join("\n");

  try {
    const now = new Date();
    await sendDirectWhatsAppMessage(tenantId, lead.telefone, text, log);
    await db.update(workCardsTable).set({
      metadata: {
        ...(card.metadata ?? {}),
        supportFeedbackRequestedAt: now.toISOString(),
        supportFeedbackStatus: "aguardando",
        supportFeedbackReminderCount: 0,
        supportFeedbackLastReminderAt: null,
      },
      updatedAt: now,
    }).where(eq(workCardsTable.id, card.id));
    return { sent: true } as const;
  } catch (error) {
    log?.warn?.({ err: error, workCardId }, "support-feedback: falha ao enviar pesquisa");
    return { sent: false, reason: "send_error" } as const;
  }
}

export async function tryHandleSupportFeedbackMessage(input: {
  tenantId: string;
  phone: string;
  text: string;
  log?: any;
}): Promise<SupportFeedbackResult> {
  const match = await findLeadByDedup(input.tenantId, input.phone, null, null);
  if (!match.found) return { handled: false };
  const lead = match.lead;

  const cards = await db.select().from(workCardsTable).where(and(
    eq(workCardsTable.tenantId, input.tenantId),
    eq(workCardsTable.pipeline, "suporte"),
    eq(workCardsTable.leadId, lead.id),
    eq(workCardsTable.etapa, "feedback_cliente"),
  )).orderBy(desc(workCardsTable.updatedAt));
  if (!cards.length) return { handled: false };

  const code = extractCode(input.text);
  const rating = extractRating(input.text);
  const waitingRatingCards = cards.filter(
    (candidate) =>
      String((candidate.metadata as Record<string, unknown> | null)?.["supportFeedbackStatus"] ?? "") ===
      "resolved_waiting_rating",
  );

  if (rating !== null || declinedRating(input.text)) {
    let ratingCard = code
      ? waitingRatingCards.find((candidate) => candidate.codigo.toUpperCase() === code)
      : undefined;
    if (!ratingCard && waitingRatingCards.length === 1) ratingCard = waitingRatingCards[0];

    if (!ratingCard && waitingRatingCards.length > 1) {
      await sendDirectWhatsAppMessage(
        input.tenantId,
        input.phone,
        `Você tem mais de uma assistência aguardando avaliação. Envie a nota junto com o código: ${waitingRatingCards.map((candidate) => candidate.codigo).slice(0, 5).join(", ")}.`,
        input.log,
      ).catch(() => undefined);
      return { handled: true, result: "ambiguous" };
    }

    if (ratingCard) {
      const now = new Date();
      const declined = rating === null;
      await db.update(workCardsTable).set({
        etapa: "fechamento_assistencia",
        dataFimEfetiva: now,
        metadata: {
          ...(ratingCard.metadata ?? {}),
          supportFeedbackStatus: declined ? "rating_declined" : "rated",
          supportRating: rating,
          supportRatingText: input.text.slice(0, 5000),
          supportRatingAt: now.toISOString(),
          supportCycleOutcome: "resolvido",
        },
        updatedAt: now,
      }).where(eq(workCardsTable.id, ratingCard.id));

      await db.insert(activitiesTable).values({
        tenantId: input.tenantId,
        leadId: lead.id,
        dealId: ratingCard.dealId,
        tipo: "assistencia",
        titulo: declined
          ? `${ratingCard.codigo}: avaliação final não informada`
          : `${ratingCard.codigo}: avaliação final — ${rating}/5`,
        descricao: declined
          ? "Cliente confirmou a resolução, mas preferiu não atribuir nota. Ciclo encerrado."
          : `Cliente confirmou a resolução e avaliou o atendimento com nota ${rating}/5.`,
        status: "concluida",
        concluidaEm: now,
        responsavelId: ratingCard.responsavelId,
      });

      await sendDirectWhatsAppMessage(
        input.tenantId,
        input.phone,
        declined
          ? `Tudo certo. Obrigado por confirmar a resolução da assistência ${ratingCard.codigo}. Se precisar novamente, seguimos à disposição.`
          : `Obrigado pela avaliação ${rating}/5 da assistência ${ratingCard.codigo}. O atendimento foi encerrado e seu feedback ficou registrado.`,
        input.log,
      ).catch(() => undefined);

      input.log?.info?.(
        { workCardId: ratingCard.id, codigo: ratingCard.codigo, rating },
        "support-feedback: avaliação final registrada",
      );
      return {
        handled: true,
        cardId: ratingCard.id,
        codigo: ratingCard.codigo,
        result: declined ? "rating_declined" : "rated",
      };
    }
  }

  const result = classifyResolution(input.text);
  if (!result) return { handled: false };

  let card = code ? cards.find((candidate) => candidate.codigo.toUpperCase() === code) : undefined;
  if (!card && cards.length === 1) card = cards[0];
  if (!card) {
    try {
      await sendDirectWhatsAppMessage(
        input.tenantId,
        input.phone,
        `Você tem mais de uma assistência aguardando feedback. Responda incluindo o código AST correspondente: ${cards.map((candidate) => candidate.codigo).slice(0, 5).join(", ")}.`,
        input.log,
      );
    } catch {}
    return { handled: true, result: "ambiguous" };
  }

  const now = new Date();
  const resolved = result === "sim";
  const feedbackLabel =
    result === "sim"
      ? "Resolvido"
      : result === "parcial"
        ? "Parcialmente resolvido"
        : "Não resolvido";

  if (resolved) {
    await db.update(workCardsTable).set({
      metadata: {
        ...(card.metadata ?? {}),
        supportFeedbackStatus: "resolved_waiting_rating",
        supportFeedbackText: input.text.slice(0, 5000),
        supportFeedbackAt: now.toISOString(),
        supportResolutionConfirmedAt: now.toISOString(),
        supportFeedbackReminderCount: 0,
        supportFeedbackLastReminderAt: null,
        supportCycleOutcome: "resolvido_aguardando_avaliacao",
      },
      updatedAt: now,
    }).where(eq(workCardsTable.id, card.id));

    await db.insert(activitiesTable).values({
      tenantId: input.tenantId,
      leadId: lead.id,
      dealId: card.dealId,
      tipo: "assistencia",
      titulo: `${card.codigo}: problema confirmado como resolvido`,
      descricao: "Cliente confirmou que o problema foi resolvido. Aguardando somente a avaliação final de satisfação.",
      status: "concluida",
      concluidaEm: now,
      responsavelId: card.responsavelId,
    });

    await sendDirectWhatsAppMessage(
      input.tenantId,
      input.phone,
      `Ótimo, obrigado por confirmar que a assistência ${card.codigo} resolveu o problema. Para finalizar: de 1 a 5, que nota você dá para o atendimento? Responda somente com a nota ou “NOTA 5”, por exemplo.`,
      input.log,
    ).catch(() => undefined);

    input.log?.info?.(
      { workCardId: card.id, codigo: card.codigo },
      "support-feedback: resolução confirmada; aguardando avaliação final",
    );
    return { handled: true, cardId: card.id, codigo: card.codigo, result: "awaiting_rating" };
  }

  const reopenCount = Number((card.metadata as any)?.supportReopenCount ?? 0) + 1;
  await db.update(workCardsTable).set({
    etapa: "fechamento_assistencia",
    dataFimEfetiva: now,
    metadata: {
      ...(card.metadata ?? {}),
      supportFeedbackStatus: result,
      supportFeedbackText: input.text.slice(0, 5000),
      supportFeedbackAt: now.toISOString(),
      supportReopenCount: reopenCount,
      supportCycleOutcome: "necessita_retorno",
    },
    updatedAt: now,
  }).where(eq(workCardsTable.id, card.id));

  const returnCode = `AST-${Date.now().toString(36).toUpperCase()}-${randomUUID().slice(0, 4).toUpperCase()}`;
  const [returnCard] = await db.insert(workCardsTable).values({
    tenantId: input.tenantId,
    codigo: returnCode,
    pipeline: "suporte",
    tipo: "assistencia_retorno",
    etapa: "execucao_assistencia",
    titulo: `Retorno • ${card.titulo}`,
    descricao: `Retorno aberto após feedback do cliente: ${feedbackLabel}.`,
    prioridade: card.prioridade,
    leadId: card.leadId,
    dealId: card.dealId,
    propostaId: card.propostaId,
    parentCardId: card.id,
    responsavelId: card.responsavelId,
    dataInicioEfetiva: now,
    metadata: {
      categoria: (card.metadata as any)?.categoria ?? null,
      produtos: (card.metadata as any)?.produtos ?? [],
      origem: "feedback_cliente",
      returnOf: card.codigo,
      previousWorkCardId: card.id,
      previousFeedback: result,
      supportReopenCount: reopenCount,
      supportCycle: Number((card.metadata as any)?.supportCycle ?? 1) + 1,
    },
  }).returning();

  await db.insert(activitiesTable).values({
    tenantId: input.tenantId,
    leadId: lead.id,
    dealId: card.dealId,
    tipo: "assistencia",
    titulo: `${card.codigo}: feedback do cliente — ${feedbackLabel}`,
    descricao: `O card anterior foi encerrado sem regressão. Retorno ${returnCard.codigo} criado automaticamente para nova execução.`,
    status: "concluida",
    concluidaEm: now,
    responsavelId: card.responsavelId,
  });
  await db.insert(activitiesTable).values({
    tenantId: input.tenantId,
    leadId: lead.id,
    dealId: card.dealId,
    tipo: "assistencia",
    titulo: `Executar retorno ${returnCard.codigo}`,
    descricao: `Feedback recebido: ${feedbackLabel}. Revisar diagnóstico, definir próxima ação e reagendar se necessário.`,
    status: "planejado",
    responsavelId: card.responsavelId,
    dataVencimento: new Date(now.getTime() + 24 * 60 * 60 * 1000),
  });

  await sendDirectWhatsAppMessage(
    input.tenantId,
    input.phone,
    `Entendi. Como a assistência ${card.codigo} ainda não resolveu completamente, abri o retorno ${returnCard.codigo} para continuarmos o acompanhamento. Você não precisa começar tudo de novo; o histórico ficou vinculado.`,
    input.log,
  ).catch(() => undefined);

  input.log?.info?.(
    { previousWorkCardId: card.id, workCardId: returnCard.id, codigo: returnCard.codigo, feedback: result },
    "support-feedback: retorno criado sem regressão",
  );
  return { handled: true, cardId: returnCard.id, codigo: returnCard.codigo, result: "reopened" };
}
