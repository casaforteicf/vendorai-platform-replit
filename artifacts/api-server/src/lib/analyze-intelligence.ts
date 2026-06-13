import { and, count, desc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import OpenAI from "openai";
import type { Logger } from "pino";
import {
  db,
  customerIntelligenceTable,
  intelligenceAnalysisLogTable,
  leadsTable,
  conversationsTable,
  messagesTable,
  activitiesTable,
} from "@workspace/db";
import { evaluateForLead } from "../routes/rules.js";

/**
 * How old (in hours) the last analysis must be before we automatically
 * re-analyze when a new message arrives.
 * Override via ANALYSIS_STALENESS_HOURS env var.
 */
export const ANALYSIS_STALENESS_HOURS =
  Number(process.env["ANALYSIS_STALENESS_HOURS"] ?? 24);

/**
 * Number of new messages since the last analysis that triggers automatic
 * re-analysis regardless of staleness threshold.
 * Override via ANALYSIS_MESSAGE_THRESHOLD env var.
 */
export const ANALYSIS_MESSAGE_THRESHOLD =
  Number(process.env["ANALYSIS_MESSAGE_THRESHOLD"] ?? 5);

/**
 * Minimum minutes that must pass before a lead can be manually re-analyzed.
 * Prevents runaway token costs from rapid repeated calls on the same lead.
 * Override via ANALYSIS_COOLDOWN_MINUTES env var.
 */
export const ANALYSIS_COOLDOWN_MINUTES =
  Number(process.env["ANALYSIS_COOLDOWN_MINUTES"] ?? 5);

// ── In-process concurrency guard ─────────────────────────────────────────────
/**
 * Tracks lead IDs for which an AI analysis is currently in flight.
 * Scoped to this process — sufficient for a single-instance API server.
 */
const inFlightAnalyses = new Set<string>();

/**
 * Thrown when `analyzeLeadIntelligence` is called for a lead that already has
 * an analysis running. Callers should treat this as a benign "already busy"
 * signal, not a hard error.
 */
export class AnalysisAlreadyInFlightError extends Error {
  constructor(leadId: string) {
    super(`Analysis already in flight for lead ${leadId}`);
    this.name = "AnalysisAlreadyInFlightError";
  }
}

// ── AI response schema ────────────────────────────────────────────────────────
const aiAnalysisSchema = z.object({
  churnRisk:            z.number().int().min(0).max(100),
  churnReasons:         z.array(z.string()).default([]),
  journeyStage:         z.string(),
  intentAnalysis:       z.string(),
  opportunities:        z.array(z.string()).default([]),
  nextBestAction:       z.string(),
  nextBestActionReason: z.string(),
});

export type AiAnalysisResult = z.infer<typeof aiAnalysisSchema>;

function getOpenAI(): OpenAI {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is not set");
  return new OpenAI({ apiKey });
}

export interface AnalyzeResult {
  intelligence: typeof customerIntelligenceTable.$inferSelect;
  tokensUsed: number;
  rulesTriggered: number;
  rulesResults: unknown[];
}

/**
 * Runs the full AI analysis pipeline for a lead:
 *   1. Load lead + recent conversation + activities
 *   2. Call GPT-4o-mini
 *   3. Upsert the customer_intelligence record
 *   4. Insert a row in intelligence_analysis_log for cost attribution
 *   5. Fire the churn_risk_alto rules engine if churnRisk >= 60
 *
 * Throws on unrecoverable errors (lead not found, AI unavailable, bad AI
 * response format). Callers that fire this as a background task should catch
 * and log all errors.
 *
 * @param triggeredBy - "manual" for explicit API calls, "auto" for background
 *   re-analysis triggered by message-count or staleness thresholds.
 */
export async function analyzeLeadIntelligence(params: {
  tenantId: string;
  leadId: string;
  log: Logger;
  triggeredBy?: "manual" | "auto";
}): Promise<AnalyzeResult> {
  const { tenantId, leadId, log, triggeredBy = "manual" } = params;

  // Guard: reject concurrent calls for the same lead
  if (inFlightAnalyses.has(leadId)) {
    throw new AnalysisAlreadyInFlightError(leadId);
  }
  inFlightAnalyses.add(leadId);

  try {
  // 1. Load lead — must exist and belong to this tenant
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

  if (!lead) {
    throw new Error(`Lead ${leadId} not found in tenant ${tenantId}`);
  }

  // 2. Load most recent conversation + last 15 messages
  const [conversation = null] = await db
    .select()
    .from(conversationsTable)
    .where(and(eq(conversationsTable.leadId, leadId), eq(conversationsTable.tenantId, tenantId)))
    .orderBy(desc(conversationsTable.ultimaMensagemEm))
    .limit(1);

  const recentMessages = conversation
    ? await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conversation.id))
        .orderBy(desc(messagesTable.createdAt))
        .limit(15)
        .then((rows) => rows.reverse())
    : [];

  // 3. Load last 10 activities
  const recentActivities = await db
    .select()
    .from(activitiesTable)
    .where(and(eq(activitiesTable.leadId, leadId), eq(activitiesTable.tenantId, tenantId)))
    .orderBy(desc(activitiesTable.createdAt))
    .limit(10);

  // 4. Build prompt
  const leadSection = [
    `Nome: ${lead.nome}`,
    lead.empresa          ? `Empresa: ${lead.empresa}` : null,
    lead.tamanhoEquipe    ? `Tamanho da equipe: ${lead.tamanhoEquipe}` : null,
    `Status no CRM: ${lead.status}`,
    lead.objetivo         ? `Objetivo declarado: ${lead.objetivo}` : null,
    lead.dorPrincipal     ? `Dor principal: ${lead.dorPrincipal}` : null,
    lead.urgencia         ? `Urgência: ${lead.urgencia}` : null,
    lead.orcamento        ? `Orçamento: ${lead.orcamento}` : null,
    lead.planoRecomendado ? `Plano recomendado: ${lead.planoRecomendado}` : null,
  ].filter(Boolean).join("\n");

  const messagesSection = recentMessages.length > 0
    ? recentMessages
        .map((m) => `[${m.direcao === "entrada" ? "LEAD" : "AGENTE"}] ${m.conteudo}`)
        .join("\n")
    : "Nenhuma mensagem registrada.";

  const activitiesSection = recentActivities.length > 0
    ? recentActivities
        .map((a) => `- [${a.tipo}] ${a.titulo} (${a.status})${a.descricao ? `: ${a.descricao}` : ""}`)
        .join("\n")
    : "Nenhuma atividade registrada.";

  const diasSemContato = conversation?.ultimaMensagemEm
    ? Math.floor((Date.now() - new Date(conversation.ultimaMensagemEm).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const systemPrompt = `Você é um especialista em Customer Success e análise de risco de churn B2B SaaS.
Analise os dados do lead abaixo — perfil, histórico de conversas e atividades recentes — e retorne um objeto JSON com os seguintes campos:

{
  "churnRisk": <0-100, inteiro — probabilidade de churn/cancelamento>,
  "churnReasons": ["razão 1", "razão 2", ...],
  "journeyStage": "<estágio atual na jornada: ex. prospect, considerando, negociando, cliente_ativo, em_risco, inativo>",
  "intentAnalysis": "<texto curto descrevendo a intenção real e motivação do lead>",
  "opportunities": ["oportunidade 1", "oportunidade 2", ...],
  "nextBestAction": "<ação concreta que a equipe deve realizar agora>",
  "nextBestActionReason": "<justificativa curta para a ação recomendada>"
}

Regras:
- Responda SOMENTE com o JSON, sem texto adicional
- churnRisk deve refletir sinais reais: inatividade, objeções, redução de engajamento, falta de progresso
- journeyStage deve ser um valor curto descritivo
- opportunities são upsell, expansão, ou resolução de problemas identificados
- nextBestAction deve ser específica e executável pela equipe de vendas/CS${diasSemContato !== null ? `\n- O lead está sem contato há ${diasSemContato} dia${diasSemContato !== 1 ? "s" : ""}` : ""}`;

  const userContent = `## PERFIL DO LEAD\n${leadSection}\n\n## HISTÓRICO DE MENSAGENS (últimas ${recentMessages.length})\n${messagesSection}\n\n## ATIVIDADES RECENTES\n${activitiesSection}`;

  // 5. Call GPT-4o-mini
  let rawJson: string;
  let tokensUsed: number;
  try {
    const completion = await getOpenAI().chat.completions.create({
      model:           "gpt-4o-mini",
      messages:        [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userContent },
      ],
      response_format: { type: "json_object" },
      temperature:     0.3,
      max_tokens:      800,
    });
    rawJson    = completion.choices[0]?.message?.content?.trim() ?? "{}";
    tokensUsed = completion.usage?.total_tokens ?? 0;
    log.info({ leadId, tenantId, tokensUsed }, "intelligence/analyze: openai call succeeded");
  } catch (err) {
    log.error({ err, leadId, tenantId }, "intelligence/analyze: openai call failed");
    throw new Error("AI service unavailable");
  }

  // 6. Parse and validate AI response
  let parsed: AiAnalysisResult;
  try {
    parsed = aiAnalysisSchema.parse(JSON.parse(rawJson));
  } catch (err) {
    log.error({ err, rawJson, leadId }, "intelligence/analyze: failed to parse AI response");
    throw new Error("AI returned an unexpected response format");
  }

  // 7. Upsert customer intelligence record
  const now = new Date();
  const existing = await db
    .select({ id: customerIntelligenceTable.id })
    .from(customerIntelligenceTable)
    .where(
      and(
        eq(customerIntelligenceTable.leadId, leadId),
        eq(customerIntelligenceTable.tenantId, tenantId)
      )
    )
    .then((rows) => rows[0] ?? null);

  let intelligence: typeof customerIntelligenceTable.$inferSelect;

  const updateFields = {
    churnRisk:            parsed.churnRisk,
    churnReasons:         parsed.churnReasons,
    journeyStage:         parsed.journeyStage,
    intentAnalysis:       parsed.intentAnalysis,
    opportunities:        parsed.opportunities,
    nextBestAction:       parsed.nextBestAction,
    nextBestActionReason: parsed.nextBestActionReason,
    lastAnalyzedAt:       now,
    updatedAt:            now,
  };

  if (existing) {
    [intelligence] = await db
      .update(customerIntelligenceTable)
      .set(updateFields)
      .where(eq(customerIntelligenceTable.id, existing.id))
      .returning();
  } else {
    [intelligence] = await db
      .insert(customerIntelligenceTable)
      .values({ tenantId, leadId, ...updateFields })
      .returning();
  }

  log.info(
    { leadId, tenantId, churnRisk: parsed.churnRisk, journeyStage: parsed.journeyStage },
    "intelligence/analyze: record upserted"
  );

  // 8. Record this analysis call for cost attribution (non-fatal if it fails)
  try {
    await db.insert(intelligenceAnalysisLogTable).values({
      tenantId,
      leadId,
      tokensUsed,
      churnRisk: parsed.churnRisk,
      triggeredBy,
    });
    log.info(
      { leadId, tenantId, tokensUsed, triggeredBy },
      "intelligence/analyze: analysis logged"
    );
  } catch (err) {
    log.error({ err, leadId, tenantId }, "intelligence/analyze: failed to write analysis log (non-fatal)");
  }

  // 9. Fire rules engine if churnRisk >= 60
  let rulesTriggered = 0;
  let rulesResults: unknown[] = [];

  if (parsed.churnRisk >= 60) {
    try {
      const rulesResult = await evaluateForLead({
        tenantId,
        trigger: "churn_risk_alto",
        leadId,
        log,
      });
      rulesTriggered = rulesResult.triggered;
      rulesResults   = rulesResult.results;
      log.info(
        { leadId, tenantId, churnRisk: parsed.churnRisk, rulesTriggered },
        "intelligence/analyze: rules engine fired"
      );
    } catch (err) {
      log.error({ err, leadId, tenantId }, "intelligence/analyze: rules engine evaluation failed (non-fatal)");
    }
  }

  return { intelligence, tokensUsed, rulesTriggered, rulesResults };
  } finally {
    inFlightAnalyses.delete(leadId);
  }
}

/**
 * Checks whether automatic re-analysis should be triggered for a lead after a
 * new message has been saved, and fires it as a non-blocking background task
 * if so.
 *
 * Triggers when:
 *  - The lead has never been analyzed (lastAnalyzedAt is null), OR
 *  - lastAnalyzedAt is older than ANALYSIS_STALENESS_HOURS, OR
 *  - The number of messages since lastAnalyzedAt >= ANALYSIS_MESSAGE_THRESHOLD
 */
export function maybeReanalyze(params: {
  tenantId: string;
  leadId: string;
  log: Logger;
}): void {
  const { tenantId, leadId, log } = params;

  // Fire-and-forget — never awaited, never slows down the message-save response
  Promise.resolve()
    .then(async () => {
      // Load the existing CI record (if any) to check lastAnalyzedAt
      const [ci] = await db
        .select({
          lastAnalyzedAt: customerIntelligenceTable.lastAnalyzedAt,
        })
        .from(customerIntelligenceTable)
        .where(
          and(
            eq(customerIntelligenceTable.leadId, leadId),
            eq(customerIntelligenceTable.tenantId, tenantId)
          )
        );

      const lastAnalyzedAt = ci?.lastAnalyzedAt ?? null;
      const stalenessMs    = ANALYSIS_STALENESS_HOURS * 60 * 60 * 1000;
      const isStale        =
        lastAnalyzedAt === null ||
        Date.now() - new Date(lastAnalyzedAt).getTime() > stalenessMs;

      if (isStale) {
        log.info(
          { leadId, tenantId, lastAnalyzedAt, trigger: "staleness" },
          "auto-analyze: triggering re-analysis (stale)"
        );
        await analyzeLeadIntelligence({ tenantId, leadId, log, triggeredBy: "auto" });
        return;
      }

      // Count messages created after lastAnalyzedAt for this lead
      const [{ newMessageCount }] = await db
        .select({ newMessageCount: count() })
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.leadId, leadId),
            eq(messagesTable.tenantId, tenantId),
            gt(messagesTable.createdAt, lastAnalyzedAt)
          )
        );

      if (newMessageCount >= ANALYSIS_MESSAGE_THRESHOLD) {
        log.info(
          { leadId, tenantId, newMessageCount, threshold: ANALYSIS_MESSAGE_THRESHOLD, trigger: "message_count" },
          "auto-analyze: triggering re-analysis (message threshold reached)"
        );
        await analyzeLeadIntelligence({ tenantId, leadId, log, triggeredBy: "auto" });
      } else {
        log.debug(
          { leadId, tenantId, newMessageCount, threshold: ANALYSIS_MESSAGE_THRESHOLD },
          "auto-analyze: skipping re-analysis (threshold not reached)"
        );
      }
    })
    .catch((err) => {
      if (err instanceof AnalysisAlreadyInFlightError) {
        log.debug({ leadId, tenantId }, "auto-analyze: skipped — analysis already in flight");
        return;
      }
      log.error({ err, leadId, tenantId }, "auto-analyze: background re-analysis failed");
    });
}
