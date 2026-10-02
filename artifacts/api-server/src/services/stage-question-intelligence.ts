import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type { Logger } from "pino";
import {
  db,
  customerIntelligenceTable,
  dealsTable,
  leadStageDynamicQuestionsTable,
  messagesTable,
  pipelineStagesTable,
} from "@workspace/db";
import { callOpenAI as gatewayCallOpenAI } from "../lib/ai-gateway.js";

const responseSchema = z.object({
  questions: z.array(z.object({
    texto: z.string().trim().min(3).max(300),
    objetivo: z.string().trim().min(3).max(500),
    confidence: z.number().int().min(0).max(100).default(70),
  })).max(3).default([]),
});

export async function suggestDynamicStageQuestions(input: {
  tenantId: string;
  leadId: string;
  dealId: string;
  log: Logger;
}): Promise<typeof leadStageDynamicQuestionsTable.$inferSelect[]> {
  const [deal] = await db.select({
    id: dealsTable.id,
    etapa: dealsTable.etapa,
    respostasEtapas: dealsTable.respostasEtapas,
  }).from(dealsTable).where(and(
    eq(dealsTable.id, input.dealId),
    eq(dealsTable.tenantId, input.tenantId),
    eq(dealsTable.leadId, input.leadId),
  )).limit(1);

  if (!deal) return [];

  const [[stage], [ci], messages, existing] = await Promise.all([
    db.select({
      label: pipelineStagesTable.label,
      perguntas: pipelineStagesTable.perguntas,
    }).from(pipelineStagesTable).where(and(
      eq(pipelineStagesTable.tenantId, input.tenantId),
      eq(pipelineStagesTable.pipeline, "comercial"),
      eq(pipelineStagesTable.key, deal.etapa),
    )).limit(1),
    db.select().from(customerIntelligenceTable).where(and(
      eq(customerIntelligenceTable.tenantId, input.tenantId),
      eq(customerIntelligenceTable.leadId, input.leadId),
    )).limit(1),
    db.select({
      direcao: messagesTable.direcao,
      conteudo: messagesTable.conteudo,
      createdAt: messagesTable.createdAt,
    }).from(messagesTable).where(and(
      eq(messagesTable.tenantId, input.tenantId),
      eq(messagesTable.leadId, input.leadId),
    )).orderBy(desc(messagesTable.createdAt)).limit(20),
    db.select().from(leadStageDynamicQuestionsTable).where(and(
      eq(leadStageDynamicQuestionsTable.tenantId, input.tenantId),
      eq(leadStageDynamicQuestionsTable.leadId, input.leadId),
      eq(leadStageDynamicQuestionsTable.dealId, input.dealId),
      eq(leadStageDynamicQuestionsTable.stageKey, deal.etapa),
      eq(leadStageDynamicQuestionsTable.status, "pendente"),
    )).orderBy(desc(leadStageDynamicQuestionsTable.createdAt)).limit(10),
  ]);

  const defaultQuestions = stage?.perguntas ?? [];
  const stageAnswers = (deal.respostasEtapas ?? {})[deal.etapa] ?? {};
  const missingDefaults = defaultQuestions.filter((q) => !String(stageAnswers[q.id] ?? "").trim());

  const context = {
    etapa: stage?.label ?? deal.etapa,
    perguntasPadrao: defaultQuestions.map((q) => ({
      id: q.id,
      texto: q.texto,
      resposta: stageAnswers[q.id] ?? null,
      obrigatoria: q.obrigatoria ?? false,
      objetivo: q.objetivo ?? null,
    })),
    faltantesPadrao: missingDefaults.map((q) => q.texto),
    perguntasDinamicasPendentes: existing.map((q) => q.questionText),
    inteligencia: ci ? {
      journeyStage: ci.journeyStage,
      intentAnalysis: ci.intentAnalysis,
      healthScore: ci.healthScore,
      riskType: ci.riskType,
      riskLevel: ci.riskLevel,
      riskFactors: ci.riskFactors,
      nextBestAction: ci.nextBestAction,
    } : null,
    mensagensRecentes: messages.reverse().map((m) => ({
      origem: m.direcao === "entrada" ? "cliente" : "empresa",
      texto: m.conteudo,
    })),
  };

  const result = await gatewayCallOpenAI(
    input.tenantId,
    "intelligence_analysis",
    [
      {
        role: "system",
        content: [
          "Você ajuda o Vendi a conduzir uma etapa comercial sem transformar a conversa em interrogatório.",
          "Sugira SOMENTE perguntas internas adicionais que preencham lacunas relevantes para avançar esta etapa.",
          "Não repita perguntas padrão, não repita perguntas já respondidas e não crie pergunta se a informação já estiver nas mensagens ou na inteligência.",
          "Cada pergunta precisa ter um objetivo comercial/operacional claro.",
          "No máximo 3 perguntas. Se não houver lacuna real, retorne questions: [].",
          "Responda somente JSON no formato {\"questions\":[{\"texto\":\"...\",\"objetivo\":\"...\",\"confidence\":80}]}."
        ].join("\n"),
      },
      { role: "user", content: JSON.stringify(context) },
    ],
    {
      model: "gpt-4o-mini",
      responseFormat: { type: "json_object" },
      temperature: 0.2,
      maxTokens: 500,
      log: input.log,
    },
  );

  const parsed = responseSchema.parse(JSON.parse(result.content || "{}"));
  if (!parsed.questions.length) return [];

  const normalizedExisting = new Set([
    ...defaultQuestions.map((q) => q.texto.trim().toLocaleLowerCase("pt-BR")),
    ...existing.map((q) => q.questionText.trim().toLocaleLowerCase("pt-BR")),
  ]);

  const unique = parsed.questions.filter((q) => {
    const key = q.texto.trim().toLocaleLowerCase("pt-BR");
    if (normalizedExisting.has(key)) return false;
    normalizedExisting.add(key);
    return true;
  });

  if (!unique.length) return [];

  return db.insert(leadStageDynamicQuestionsTable).values(unique.map((q) => ({
    tenantId: input.tenantId,
    leadId: input.leadId,
    dealId: input.dealId,
    stageKey: deal.etapa,
    questionText: q.texto,
    objective: q.objetivo,
    confidence: q.confidence,
    source: "ai" as const,
  }))).returning();
}
