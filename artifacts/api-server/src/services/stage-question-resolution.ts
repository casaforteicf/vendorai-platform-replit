import { and, desc, eq, notInArray } from "drizzle-orm";
import { z } from "zod";
import type { Logger } from "pino";
import {
  db,
  dealsTable,
  leadStageDynamicQuestionsTable,
  pipelineStagesTable,
} from "@workspace/db";
import { callOpenAI as gatewayCallOpenAI } from "../lib/ai-gateway.js";
import { recordIntelligenceEvent, recordStageAnswers } from "./customer-intelligence-history.js";

const terminalStages = ["ganho", "perdido", "entregue", "concluido", "cancelado"] as const;

const aiResponseSchema = z.object({
  standard: z.array(z.object({
    questionId: z.string(),
    answer: z.string().trim().min(1).max(2000),
    evidence: z.string().trim().min(1).max(1000),
    confidence: z.number().int().min(0).max(100),
  })).default([]),
  dynamic: z.array(z.object({
    questionId: z.string(),
    answer: z.string().trim().min(1).max(2000),
    evidence: z.string().trim().min(1).max(1000),
    confidence: z.number().int().min(0).max(100),
  })).default([]),
});

export async function resolveStageQuestionsFromInboundMessage(input: {
  tenantId: string;
  leadId: string;
  messageId: string;
  message: string;
  log: Logger;
}): Promise<{ standardResolved: number; dynamicResolved: number }> {
  const [deal] = await db
    .select()
    .from(dealsTable)
    .where(and(
      eq(dealsTable.tenantId, input.tenantId),
      eq(dealsTable.leadId, input.leadId),
      notInArray(dealsTable.etapa, [...terminalStages]),
    ))
    .orderBy(desc(dealsTable.updatedAt))
    .limit(1);

  if (!deal) return { standardResolved: 0, dynamicResolved: 0 };

  const [[stage], dynamicQuestions] = await Promise.all([
    db.select({
      key: pipelineStagesTable.key,
      label: pipelineStagesTable.label,
      perguntas: pipelineStagesTable.perguntas,
    }).from(pipelineStagesTable).where(and(
      eq(pipelineStagesTable.tenantId, input.tenantId),
      eq(pipelineStagesTable.pipeline, "comercial"),
      eq(pipelineStagesTable.key, deal.etapa),
    )).limit(1),
    db.select().from(leadStageDynamicQuestionsTable).where(and(
      eq(leadStageDynamicQuestionsTable.tenantId, input.tenantId),
      eq(leadStageDynamicQuestionsTable.leadId, input.leadId),
      eq(leadStageDynamicQuestionsTable.dealId, deal.id),
      eq(leadStageDynamicQuestionsTable.stageKey, deal.etapa),
      eq(leadStageDynamicQuestionsTable.status, "pendente"),
    )).orderBy(desc(leadStageDynamicQuestionsTable.createdAt)).limit(10),
  ]);

  const standardQuestions = stage?.perguntas ?? [];
  const currentByStage = (deal.respostasEtapas ?? {}) as Record<string, Record<string, string>>;
  const currentAnswers = currentByStage[deal.etapa] ?? {};

  const eligibleStandard = standardQuestions.filter((q) =>
    !String(currentAnswers[q.id] ?? "").trim() &&
    q.iaPodeResponder !== false &&
    q.exigeConfirmacaoHumana !== true
  );

  if (!eligibleStandard.length && !dynamicQuestions.length) {
    return { standardResolved: 0, dynamicResolved: 0 };
  }

  const result = await gatewayCallOpenAI(
    input.tenantId,
    "intelligence_analysis",
    [
      {
        role: "system",
        content: [
          "Você mapeia uma NOVA mensagem recebida do cliente para perguntas internas de uma etapa comercial.",
          "Só responda uma pergunta quando a própria mensagem trouxer evidência explícita e suficiente.",
          "Não complete lacunas por inferência, não use suposição, não invente contexto e não transforme intenção vaga em fato.",
          "Se a mensagem não responder claramente uma pergunta, omita essa pergunta.",
          "A resposta deve ser curta, fiel ao que o cliente disse e incluir um trecho de evidência.",
          "Use confidence >= 85 apenas quando a evidência for realmente clara.",
          "Retorne somente JSON válido."
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          etapa: stage?.label ?? deal.etapa,
          novaMensagemDoCliente: input.message,
          perguntasPadraoPendentes: eligibleStandard.map((q) => ({
            id: q.id,
            texto: q.texto,
            objetivo: q.objetivo ?? null,
          })),
          perguntasDinamicasPendentes: dynamicQuestions.map((q) => ({
            id: q.id,
            texto: q.questionText,
            objetivo: q.objective,
          })),
          formato: {
            standard: [{ questionId: "id", answer: "...", evidence: "...", confidence: 95 }],
            dynamic: [{ questionId: "id", answer: "...", evidence: "...", confidence: 95 }],
          },
        }),
      },
    ],
    {
      model: "gpt-4o-mini",
      responseFormat: { type: "json_object" },
      temperature: 0,
      maxTokens: 700,
      log: input.log,
    },
  );

  const parsed = aiResponseSchema.parse(JSON.parse(result.content || "{}"));
  const standardAllowed = new Set(eligibleStandard.map((q) => q.id));
  const dynamicAllowed = new Set(dynamicQuestions.map((q) => q.id));

  const standardMatches = parsed.standard.filter((item) =>
    standardAllowed.has(item.questionId) && item.confidence >= 85
  );
  const dynamicMatches = parsed.dynamic.filter((item) =>
    dynamicAllowed.has(item.questionId) && item.confidence >= 85
  );

  if (!standardMatches.length && !dynamicMatches.length) {
    return { standardResolved: 0, dynamicResolved: 0 };
  }

  const nextStageAnswers = { ...currentAnswers };
  for (const item of standardMatches) {
    nextStageAnswers[item.questionId] = item.answer;
  }

  await db.transaction(async (tx) => {
    if (standardMatches.length) {
      await tx.update(dealsTable).set({
        respostasEtapas: {
          ...currentByStage,
          [deal.etapa]: nextStageAnswers,
        },
        updatedAt: new Date(),
      }).where(eq(dealsTable.id, deal.id));
    }

    for (const item of dynamicMatches) {
      await tx.update(leadStageDynamicQuestionsTable).set({
        answer: item.answer,
        status: "respondida",
        confidence: item.confidence,
        answeredAt: new Date(),
        updatedAt: new Date(),
      }).where(and(
        eq(leadStageDynamicQuestionsTable.id, item.questionId),
        eq(leadStageDynamicQuestionsTable.tenantId, input.tenantId),
        eq(leadStageDynamicQuestionsTable.leadId, input.leadId),
      ));
    }
  });

  if (standardMatches.length) {
    await recordStageAnswers({
      tenantId: input.tenantId,
      leadId: input.leadId,
      dealId: deal.id,
      stageKey: deal.etapa,
      answers: Object.fromEntries(standardMatches.map((item) => [item.questionId, item.answer])),
      log: input.log,
    });
  }

  await recordIntelligenceEvent({
    tenantId: input.tenantId,
    leadId: input.leadId,
    eventType: "stage_questions_auto_resolved",
    title: "Vendi atualizou o diagnóstico da etapa",
    summary: `${standardMatches.length + dynamicMatches.length} pergunta(s) respondida(s) automaticamente com base na nova mensagem do cliente.`,
    sourceModule: "messages",
    sourceId: input.messageId,
    metadata: {
      dealId: deal.id,
      stageKey: deal.etapa,
      standard: standardMatches,
      dynamic: dynamicMatches,
    },
    log: input.log,
  });

  return {
    standardResolved: standardMatches.length,
    dynamicResolved: dynamicMatches.length,
  };
}
