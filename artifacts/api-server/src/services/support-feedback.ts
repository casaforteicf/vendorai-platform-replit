import { and, desc, eq } from "drizzle-orm";
import {
  activitiesTable,
  db,
  leadsTable,
  workCardsTable,
} from "@workspace/db";
import { sendDirectWhatsAppMessage } from "./omnichannel.js";
import { findLeadByDedup } from "../lib/dedup.js";

export type SupportFeedbackResult =
  | { handled: false }
  | { handled: true; cardId?: string; codigo?: string; result: "resolved" | "reopened" | "ambiguous" | "unrecognized" };

function extractCode(text: string) {
  return text.match(/\bAST-[A-Z0-9]+-[A-Z0-9]+\b/i)?.[0]?.toUpperCase() ?? null;
}

function classify(text: string): "sim" | "parcial" | "nao" | null {
  const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/\b(nao|não|negativo|continua|nao resolveu|não resolveu)\b/.test(normalized)) return "nao";
  if (/\b(parcial|parcialmente|mais ou menos|melhorou)\b/.test(normalized)) return "parcial";
  if (/\b(sim|resolvido|resolveu|positivo|ok|certo)\b/.test(normalized)) return "sim";
  return null;
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
    "Se não tiver sido resolvido, o chamado volta automaticamente para execução.",
  ].join("\n");

  try {
    await sendDirectWhatsAppMessage(tenantId, lead.telefone, text, log);
    await db.update(workCardsTable).set({
      metadata: {
        ...(card.metadata ?? {}),
        supportFeedbackRequestedAt: new Date().toISOString(),
        supportFeedbackStatus: "aguardando",
      },
      updatedAt: new Date(),
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
  const result = classify(input.text);
  if (!result) return { handled: false };

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
  let card = code ? cards.find((c) => c.codigo.toUpperCase() === code) : undefined;
  if (!card && cards.length === 1) card = cards[0];
  if (!card) {
    try {
      await sendDirectWhatsAppMessage(
        input.tenantId,
        input.phone,
        `Você tem mais de uma assistência aguardando feedback. Responda incluindo o código AST correspondente: ${cards.map((c) => c.codigo).slice(0, 5).join(", ")}.`,
        input.log,
      );
    } catch {}
    return { handled: true, result: "ambiguous" };
  }

  const now = new Date();
  const resolved = result === "sim";
  const nextStage = resolved ? "fechamento_assistencia" : "execucao_assistencia";
  const feedbackLabel = result === "sim" ? "Resolvido" : result === "parcial" ? "Parcialmente resolvido" : "Não resolvido";

  await db.update(workCardsTable).set({
    etapa: nextStage,
    ...(resolved ? { dataFimEfetiva: now } : {}),
    metadata: {
      ...(card.metadata ?? {}),
      supportFeedbackStatus: result,
      supportFeedbackText: input.text.slice(0, 5000),
      supportFeedbackAt: now.toISOString(),
      supportReopenCount: resolved ? Number((card.metadata as any)?.supportReopenCount ?? 0) : Number((card.metadata as any)?.supportReopenCount ?? 0) + 1,
    },
    updatedAt: now,
  }).where(eq(workCardsTable.id, card.id));

  await db.insert(activitiesTable).values({
    tenantId: input.tenantId,
    leadId: lead.id,
    dealId: card.dealId,
    tipo: "assistencia",
    titulo: `${card.codigo}: feedback do cliente — ${feedbackLabel}`,
    descricao: resolved
      ? "Cliente confirmou que a assistência resolveu o problema. Chamado encaminhado para fechamento."
      : "Cliente informou que a assistência não foi totalmente resolvida. Chamado reaberto automaticamente em Execução da Assistência.",
    status: "concluida",
    concluidaEm: now,
    responsavelId: card.responsavelId,
  });

  if (!resolved) {
    await db.insert(activitiesTable).values({
      tenantId: input.tenantId,
      leadId: lead.id,
      dealId: card.dealId,
      tipo: "assistencia",
      titulo: `Retomar ${card.codigo} — cliente não confirmou solução`,
      descricao: `Feedback recebido: ${feedbackLabel}. Revisar diagnóstico, definir próxima ação e reagendar se necessário.`,
      status: "planejado",
      responsavelId: card.responsavelId,
      dataVencimento: new Date(now.getTime() + 24 * 60 * 60 * 1000),
    });
  }

  input.log?.info?.({ workCardId: card.id, codigo: card.codigo, feedback: result, nextStage }, "support-feedback: resposta processada");
  return { handled: true, cardId: card.id, codigo: card.codigo, result: resolved ? "resolved" : "reopened" };
}
