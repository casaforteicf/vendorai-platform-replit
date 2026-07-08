/**
 * Pós-venda: pesquisa de satisfação automática após entrega concluída.
 *
 * Fluxo:
 *  1. entrega.status → "entregue"  ⇒  triggerDeliveryFeedbackRequest()
 *     dispara "Como foi a entrega? Chegou tudo certinho?" via agente
 *     Pós-Venda (relacionamento) e marca lead.pendingFeedbackEntregaId.
 *  2. Próxima mensagem do lead ⇒ handleDeliveryFeedbackReply() classifica o
 *     sentimento (IA, mesmo estilo do classificador de escalação) e responde:
 *       - positivo (alta confiança): agradece e pede avaliação no Google,
 *         SOMENTE se o tenant configurou googleReviewLink.
 *       - negativo: pede desculpas, pergunta o que poderia ter sido melhor
 *         e aguarda a próxima mensagem para registrar o motivo.
 *       - baixa confiança: agradece sem pedir avaliação (não presume nada).
 */
import { eq, and } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  agentConfigsTable,
  activitiesTable,
  entregasTable,
  leadsTable,
  tenantsTable,
} from "@workspace/db";
import { callOpenAI } from "../lib/ai-gateway.js";
import { computeLimits, updateCounters, insertAndRun } from "../lib/agent-engine.js";

const PERGUNTA_SATISFACAO =
  "Oi! Passando para confirmar: como foi a entrega? Chegou tudo certinho? 😊";

export interface DeliverySentimentResult {
  sentiment: "positivo" | "negativo";
  confident: boolean;
  confidence: number;
}

/**
 * Classifica o sentimento da resposta do lead sobre a entrega, usando uma
 * chamada leve de IA (mesma técnica do classificador de escalação em
 * escalation.ts — JSON estruturado, não keyword matching).
 */
export async function classifyDeliverySentiment(
  mensagem: string,
  tenantId: string,
  log: Logger,
): Promise<DeliverySentimentResult> {
  const prompt =
    `Você é um classificador de satisfação do cliente sobre uma entrega recém-realizada.\n` +
    `Pergunta feita ao cliente: "Como foi a entrega? Chegou tudo certinho?"\n` +
    `\n` +
    `Classifique a resposta do cliente como "positivo" (satisfeito, sem problemas, tudo certo) ou\n` +
    `"negativo" (algo deu errado: atraso, item faltando, avariado, errado, insatisfação de qualquer tipo).\n` +
    `\n` +
    `Regras:\n` +
    `- Só retorne confident: true se tiver ALTA confiança (confidence >= 0.6)\n` +
    `- Se a resposta for ambígua, vaga ou não relacionada, retorne confident: false\n` +
    `\n` +
    `Resposta do cliente:\n"${mensagem}"\n` +
    `\n` +
    `Responda APENAS em JSON válido (sem markdown):\n` +
    `{"sentiment": "positivo"|"negativo", "confident": true|false, "confidence": 0.0}`;

  try {
    const result = await callOpenAI(
      tenantId,
      "intelligence_analysis",
      [{ role: "user", content: prompt }],
      { model: "gpt-4.1-mini", maxTokens: 60, temperature: 0, log },
    );

    const raw = result.content
      .trim()
      .replace(/^```json\s*/, "")
      .replace(/\s*```$/, "");
    const parsed = JSON.parse(raw) as {
      sentiment?: string;
      confident?: boolean;
      confidence?: number;
    };

    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const sentiment: "positivo" | "negativo" = parsed.sentiment === "negativo" ? "negativo" : "positivo";
    const confident = parsed.confident === true && confidence >= 0.6;

    return { sentiment, confident, confidence };
  } catch (err) {
    log.warn({ err, tenantId }, "post-venda: sentiment classification failed — treating as low confidence");
    return { sentiment: "positivo", confident: false, confidence: 0 };
  }
}

/**
 * Envia uma mensagem do agente Pós-Venda (relacionamento) respeitando
 * enabled/limits do tenant. Retorna true se a mensagem foi de fato enfileirada.
 */
async function sendPosVendaMessage(
  tenantId: string,
  leadId: string,
  resposta: string,
  extraPayload: Record<string, unknown> | undefined,
  log: Logger,
): Promise<boolean> {
  const [config] = await db.select().from(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenantId));
  if (!config) {
    log.info({ tenantId, leadId }, "post-venda: no agent config, skipping message");
    return false;
  }

  const agentCfg = config.agents?.relacionamento;
  if (!agentCfg?.enabled) {
    log.info({ tenantId, leadId }, "post-venda: agente relacionamento não habilitado, skipping");
    return false;
  }

  const limits = computeLimits(config);
  if (!limits.ok) {
    log.warn({ tenantId, leadId }, "post-venda: limites do agente atingidos, skipping");
    return false;
  }

  const now = new Date();
  await updateCounters(config, limits, 0, now);

  const isAutonomous = !!config.autonomyEnabledAt;
  await insertAndRun({
    tenantId,
    leadId,
    agentName: "relacionamento",
    actionType: "enviar_whatsapp",
    resposta,
    extraPayload,
    isAutonomous,
    now,
    log,
  });

  return true;
}

/**
 * Dispara a pergunta de satisfação pós-entrega. Chamado quando uma entrega
 * transiciona para status "entregue".
 */
export async function triggerDeliveryFeedbackRequest(params: {
  tenantId: string;
  entregaId: string;
  log: Logger;
}): Promise<void> {
  const { tenantId, entregaId, log } = params;

  const [entrega] = await db
    .select()
    .from(entregasTable)
    .where(and(eq(entregasTable.id, entregaId), eq(entregasTable.tenantId, tenantId)));

  if (!entrega || !entrega.leadId) {
    log.info({ tenantId, entregaId }, "post-venda: entrega sem lead vinculado, skipping pesquisa de satisfação");
    return;
  }

  const sent = await sendPosVendaMessage(
    tenantId,
    entrega.leadId,
    PERGUNTA_SATISFACAO,
    { origin: "entrega_concluida", entregaId },
    log,
  );

  if (!sent) {
    log.info({ tenantId, entregaId }, "post-venda: pergunta de satisfação não enviada (agente indisponível)");
    return;
  }

  await db
    .update(entregasTable)
    .set({ feedbackStatus: "aguardando_resposta", updatedAt: new Date() })
    .where(eq(entregasTable.id, entregaId));

  await db
    .update(leadsTable)
    .set({ pendingFeedbackEntregaId: entregaId, updatedAt: new Date() })
    .where(eq(leadsTable.id, entrega.leadId));

  log.info({ tenantId, entregaId, leadId: entrega.leadId }, "post-venda: pesquisa de satisfação disparada");
}

/**
 * Trata a resposta do lead a uma pesquisa de satisfação pendente. Chamado a
 * partir do dispatcher de agentes quando lead.pendingFeedbackEntregaId está setado.
 */
export async function handleDeliveryFeedbackReply(params: {
  tenantId: string;
  leadId: string;
  entregaId: string;
  mensagem: string;
  log: Logger;
}): Promise<void> {
  const { tenantId, leadId, entregaId, mensagem, log } = params;

  const clearPending = () =>
    db
      .update(leadsTable)
      .set({ pendingFeedbackEntregaId: null, updatedAt: new Date() })
      .where(eq(leadsTable.id, leadId));

  const [entrega] = await db
    .select()
    .from(entregasTable)
    .where(and(eq(entregasTable.id, entregaId), eq(entregasTable.tenantId, tenantId)));

  if (!entrega) {
    log.warn({ tenantId, leadId, entregaId }, "post-venda: entrega não encontrada, limpando pending feedback");
    await clearPending();
    return;
  }

  if (entrega.feedbackStatus === "aguardando_motivo") {
    // Segunda mensagem: cliente descrevendo o que deu errado.
    await db
      .update(entregasTable)
      .set({
        feedbackStatus: "negativo",
        feedbackMotivo: mensagem,
        feedbackRespondidoEm: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(entregasTable.id, entregaId));

    await clearPending();

    await db.insert(activitiesTable).values({
      tenantId,
      leadId,
      dealId: entrega.dealId,
      tipo: "feedback_entrega",
      titulo: "Feedback pós-entrega: insatisfeito",
      descricao: mensagem.slice(0, 500),
      status: "concluida",
      concluidaEm: new Date(),
      resultadoExecucao: `entregaId:${entregaId}`,
    }).catch((err: unknown) => {
      log.warn({ err, tenantId, leadId, entregaId }, "post-venda: falha ao registrar activity de feedback negativo");
    });

    await sendPosVendaMessage(
      tenantId,
      leadId,
      "Muito obrigado por compartilhar! Já registramos seu feedback e nossa equipe vai avaliar como melhorar isso.",
      { origin: "feedback_entrega_motivo", entregaId },
      log,
    );

    log.info({ tenantId, leadId, entregaId }, "post-venda: feedback negativo registrado com motivo");
    return;
  }

  if (entrega.feedbackStatus !== "aguardando_resposta") {
    // Estado obsoleto (já finalizado ou nunca iniciado corretamente) — limpa e ignora.
    await clearPending();
    return;
  }

  const sentiment = await classifyDeliverySentiment(mensagem, tenantId, log);

  if (sentiment.sentiment === "positivo" && sentiment.confident) {
    const [tenant] = await db
      .select({ googleReviewLink: tenantsTable.googleReviewLink })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId));

    const reviewLink = tenant?.googleReviewLink?.trim() || null;
    const resposta = reviewLink
      ? `Que ótimo! Ficamos muito felizes 🎉 Se puder, deixar uma avaliação no Google nos ajuda muito: ${reviewLink}`
      : `Que ótimo! Ficamos muito felizes com isso 🎉 Obrigado por confiar na gente!`;

    await sendPosVendaMessage(tenantId, leadId, resposta, { origin: "feedback_entrega_positivo", entregaId }, log);

    await db
      .update(entregasTable)
      .set({
        feedbackStatus: "positivo",
        avaliacaoSolicitada: !!reviewLink,
        feedbackRespondidoEm: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(entregasTable.id, entregaId));

    await clearPending();

    await db.insert(activitiesTable).values({
      tenantId,
      leadId,
      dealId: entrega.dealId,
      tipo: "feedback_entrega",
      titulo: "Feedback pós-entrega: satisfeito",
      descricao: mensagem.slice(0, 500),
      status: "concluida",
      concluidaEm: new Date(),
      resultadoExecucao: `entregaId:${entregaId}|avaliacaoSolicitada:${!!reviewLink}`,
    }).catch((err: unknown) => {
      log.warn({ err, tenantId, leadId, entregaId }, "post-venda: falha ao registrar activity de feedback positivo");
    });

    log.info({ tenantId, leadId, entregaId, reviewRequested: !!reviewLink }, "post-venda: feedback positivo registrado");
    return;
  }

  if (sentiment.sentiment === "negativo" && sentiment.confident) {
    await db
      .update(entregasTable)
      .set({ feedbackStatus: "aguardando_motivo", updatedAt: new Date() })
      .where(eq(entregasTable.id, entregaId));

    await sendPosVendaMessage(
      tenantId,
      leadId,
      "Poxa, sentimos muito por isso! Pode nos contar o que aconteceu ou o que poderia ter sido melhor? Vamos corrigir.",
      { origin: "feedback_entrega_negativo", entregaId },
      log,
    );

    log.info({ tenantId, leadId, entregaId }, "post-venda: feedback negativo detectado, aguardando motivo");
    return;
  }

  // Baixa confiança: agradece sem presumir nada e sem pedir avaliação.
  await sendPosVendaMessage(
    tenantId,
    leadId,
    "Obrigado pelo retorno! Qualquer coisa, estamos por aqui.",
    { origin: "feedback_entrega_baixa_confianca", entregaId },
    log,
  );

  await db
    .update(entregasTable)
    .set({ feedbackStatus: "positivo", feedbackRespondidoEm: new Date(), updatedAt: new Date() })
    .where(eq(entregasTable.id, entregaId));

  await clearPending();

  log.info({ tenantId, leadId, entregaId, confidence: sentiment.confidence }, "post-venda: baixa confiança, encerrando sem pedir avaliação");
}
