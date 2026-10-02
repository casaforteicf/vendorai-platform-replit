import { and, desc, eq } from "drizzle-orm";
import {
  db,
  customerIntelligenceFactsTable,
  customerIntelligenceSourcesTable,
  customerIntelligenceEventsTable,
  pipelineStagesTable,
} from "@workspace/db";
import type { Logger } from "pino";

type RecordEventInput = {
  tenantId: string;
  leadId: string | null | undefined;
  eventType: string;
  title: string;
  summary?: string | null;
  sourceModule?: string | null;
  sourceId?: string | null;
  occurredAt?: Date | null;
  metadata?: Record<string, unknown> | null;
  log?: Logger;
};

export async function recordIntelligenceEvent(input: RecordEventInput): Promise<void> {
  if (!input.leadId) return;
  try {
    await db.insert(customerIntelligenceEventsTable).values({
      tenantId: input.tenantId,
      leadId: input.leadId,
      eventType: input.eventType,
      title: input.title,
      summary: input.summary ?? null,
      sourceModule: input.sourceModule ?? null,
      sourceId: input.sourceId ?? null,
      occurredAt: input.occurredAt ?? new Date(),
      metadata: input.metadata ?? null,
    });
  } catch (err) {
    input.log?.warn({ err, tenantId: input.tenantId, leadId: input.leadId, eventType: input.eventType }, "customer-intelligence-history: event failed");
  }
}

type RecordFactInput = {
  tenantId: string;
  leadId: string | null | undefined;
  kind: "fato_confirmado" | "declaracao_cliente" | "evento_operacional" | "inferencia_ia";
  factKey: string;
  value: unknown;
  confidence?: number | null;
  sourceType: string;
  sourceModule: string;
  sourceId?: string | null;
  sourceUrl?: string | null;
  title?: string | null;
  metadata?: Record<string, unknown> | null;
  log?: Logger;
};

export async function recordIntelligenceFact(input: RecordFactInput): Promise<void> {
  if (!input.leadId) return;
  try {
    const [latest] = await db.select({
      id: customerIntelligenceFactsTable.id,
      value: customerIntelligenceFactsTable.value,
    }).from(customerIntelligenceFactsTable).where(and(
      eq(customerIntelligenceFactsTable.tenantId, input.tenantId),
      eq(customerIntelligenceFactsTable.leadId, input.leadId),
      eq(customerIntelligenceFactsTable.factKey, input.factKey),
    )).orderBy(desc(customerIntelligenceFactsTable.createdAt)).limit(1);

    if (latest && JSON.stringify(latest.value) === JSON.stringify(input.value)) {
      return;
    }

    if (latest) {
      await db.update(customerIntelligenceFactsTable)
        .set({ validTo: new Date(), updatedAt: new Date() })
        .where(eq(customerIntelligenceFactsTable.id, latest.id));
    }

    const [source] = await db.insert(customerIntelligenceSourcesTable).values({
      tenantId: input.tenantId,
      leadId: input.leadId,
      sourceType: input.sourceType,
      sourceModule: input.sourceModule,
      sourceId: input.sourceId ?? null,
      sourceUrl: input.sourceUrl ?? null,
      title: input.title ?? null,
      metadata: input.metadata ?? null,
    }).returning({ id: customerIntelligenceSourcesTable.id });

    await db.insert(customerIntelligenceFactsTable).values({
      tenantId: input.tenantId,
      leadId: input.leadId,
      kind: input.kind,
      factKey: input.factKey,
      value: input.value,
      confidence: input.confidence ?? null,
      sourceId: source?.id ?? null,
      validFrom: new Date(),
    });
  } catch (err) {
    input.log?.warn({ err, tenantId: input.tenantId, leadId: input.leadId, factKey: input.factKey }, "customer-intelligence-history: fact failed");
  }
}

export async function recordStageAnswers(input: {
  tenantId: string;
  leadId: string | null | undefined;
  dealId: string;
  stageKey: string;
  answers: Record<string, string>;
  log?: Logger;
}): Promise<void> {
  if (!input.leadId) return;
  try {
    const [stage] = await db.select({
      label: pipelineStagesTable.label,
      perguntas: pipelineStagesTable.perguntas,
    }).from(pipelineStagesTable).where(and(
      eq(pipelineStagesTable.tenantId, input.tenantId),
      eq(pipelineStagesTable.pipeline, "comercial"),
      eq(pipelineStagesTable.key, input.stageKey),
    )).limit(1);

    const questions = stage?.perguntas ?? [];
    const labels = new Map(questions.map((question) => [question.id, question.texto]));
    const answeredEntries = Object.entries(input.answers).filter(([, value]) => String(value ?? "").trim());

    for (const [questionId, answer] of answeredEntries) {
      await recordIntelligenceFact({
        tenantId: input.tenantId,
        leadId: input.leadId,
        kind: "declaracao_cliente",
        factKey: `pipeline.${input.stageKey}.${questionId}`,
        value: {
          pergunta: labels.get(questionId) ?? questionId,
          resposta: answer,
          etapa: stage?.label ?? input.stageKey,
        },
        sourceType: "resposta_etapa",
        sourceModule: "deals",
        sourceId: input.dealId,
        title: labels.get(questionId) ?? questionId,
        log: input.log,
      });
    }

    await recordIntelligenceEvent({
      tenantId: input.tenantId,
      leadId: input.leadId,
      eventType: "pipeline_questions_updated",
      title: `Perguntas da etapa ${stage?.label ?? input.stageKey} atualizadas`,
      summary: `${answeredEntries.length} resposta(s) registrada(s).`,
      sourceModule: "deals",
      sourceId: input.dealId,
      metadata: { stageKey: input.stageKey, answeredQuestionIds: answeredEntries.map(([id]) => id) },
      log: input.log,
    });
  } catch (err) {
    input.log?.warn({ err, tenantId: input.tenantId, leadId: input.leadId, dealId: input.dealId }, "customer-intelligence-history: stage answers failed");
  }
}
