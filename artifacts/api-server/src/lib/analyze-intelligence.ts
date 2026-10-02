import { and, count, desc, eq, gt, gte, sql } from "drizzle-orm";
import { z } from "zod";
import type { Logger } from "pino";
import { callOpenAI as gatewayCallOpenAI } from "./ai-gateway.js";
import {
  db,
  customerIntelligenceTable,
  customerIntelligenceSnapshotsTable,
  intelligenceAnalysisLogTable,
  agentConfigsTable,
  leadsTable,
  conversationsTable,
  messagesTable,
  activitiesTable,
  tenantsTable,
  dealsTable,
  propostasTable,
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

/**
 * Maximum number of AI analyses allowed per tenant per rolling hour window.
 * A tenant with many leads could rack up large token bills by triggering
 * per-lead analyses in rapid succession; this cap provides an aggregate guard.
 * Override via MAX_ANALYSES_PER_TENANT_PER_HOUR env var.
 */
export const MAX_ANALYSES_PER_TENANT_PER_HOUR =
  Number(process.env["MAX_ANALYSES_PER_TENANT_PER_HOUR"] ?? 50);

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
  // Compatibilidade temporária: representa o risco principal em escala 0-100.
  // A interface V2 usa healthScore/riskType/riskLevel como fonte canônica.
  churnRisk:            z.number().int().min(0).max(100),
  churnReasons:         z.array(z.string()).default([]),
  healthScore:          z.number().int().min(0).max(100),
  healthStatus:         z.enum(["saudavel", "atencao", "alto_risco", "critico"]),
  riskType:             z.enum(["perda_comercial", "churn", "operacional", "insatisfacao", "desengajamento", "financeiro", "nenhum"]),
  riskLevel:            z.enum(["baixo", "atencao", "alto", "critico"]),
  riskTrend:            z.enum(["melhorando", "estavel", "piorando"]),
  analysisConfidence:   z.number().int().min(0).max(100),
  healthDimensions:     z.record(z.string(), z.number().int().min(0).max(100)).default({}),
  positiveSignals:      z.array(z.object({ sinal: z.string(), evidencia: z.string().optional(), impacto: z.number().int().min(-100).max(100).optional() })).default([]),
  negativeSignals:      z.array(z.object({ sinal: z.string(), evidencia: z.string().optional(), impacto: z.number().int().min(-100).max(100).optional() })).default([]),
  riskFactors:          z.array(z.object({ fator: z.string(), motivo: z.string(), impacto: z.number().int().min(0).max(100).optional() })).default([]),
  riskEvents:           z.array(z.object({ evento: z.string(), delta: z.number().int().min(-100).max(100), motivo: z.string() })).default([]),
  journeyStage:         z.string(),
  intentAnalysis:       z.string(),
  opportunities:        z.array(z.string()).default([]),
  nextBestAction:       z.string(),
  nextBestActionReason: z.string(),
  scoreExplicacao:      z.string().optional(),
  churnRiskExplicacao:  z.string().optional(),
});

export type AiAnalysisResult = z.infer<typeof aiAnalysisSchema>;


export interface AnalyzeResult {
  intelligence: typeof customerIntelligenceTable.$inferSelect;
  tokensUsed: number;
  rulesTriggered: number;
  rulesResults: unknown[];
  /**
   * Only present when the existing record had `churnReasonsEditedBy === "rep"`.
   * Contains the AI's freshly-computed churn reasons, which were NOT written to
   * the DB so the rep's manual edits are preserved. The caller (UI) should offer
   * the rep a chance to accept or discard these suggestions.
   */
  aiSuggestedChurnReasons?: string[];
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

  // ── Fast in-process check ──────────────────────────────────────────────────
  // Avoids a round-trip to the DB when the same process is already running the
  // analysis. The DB flag below is the authoritative cross-process guard.
  if (inFlightAnalyses.has(leadId)) {
    throw new AnalysisAlreadyInFlightError(leadId);
  }

  // ── Lead validation (before any CI table side effects) ────────────────────
  // Must happen before lock acquisition: inserting into customer_intelligence
  // with an invalid leadId would either trigger an FK violation (raw DB error)
  // or — if leadId belongs to another tenant — silently create a cross-tenant
  // placeholder row and poison the unique leadId slot.
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

  if (!lead) {
    throw new Error(`Lead ${leadId} not found in tenant ${tenantId}`);
  }

  const [tenantContext] = await db
    .select({
      name: tenantsTable.name,
      vertical: tenantsTable.vertical,
      segmento: tenantsTable.segmento,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  // D-003: contato classificado como não-lead (colaborador, fornecedor,
  // parceiro, familiar, amigo, outro) não passa por análise de churn --
  // não é prospect de venda, não faz sentido gastar IA nem alertar sobre
  // "risco de perder" alguém que não é cliente.
  if (lead.naoLeadTipo) {
    log.info({ tenantId, leadId, naoLeadTipo: lead.naoLeadTipo }, "analyzeLeadIntelligence: pulado -- lead classificado como não-lead");
    throw new Error(`Lead classificado como não-lead (${lead.naoLeadTipo}) -- análise de churn não se aplica`);
  }

  // Mark in-flight, then acquire the DB lock. Both are released in the finally
  // block below, which runs on every exit path (return, throw, or error).
  inFlightAnalyses.add(leadId);
  let dbLockAcquired = false;

  try {
  // ── DB-level cross-process lock ────────────────────────────────────────────
  // Atomically either:
  //   (a) INSERT a placeholder row with isAnalyzing = true (first analysis), or
  //   (b) UPDATE the existing row from isAnalyzing = false → true (CAS).
  // If another process holds the lock (isAnalyzing is already true) the WHERE
  // clause on the conflict action fails and Postgres returns 0 rows.
  const lockResult = await db
    .insert(customerIntelligenceTable)
    .values({ tenantId, leadId, isAnalyzing: true })
    .onConflictDoUpdate({
      target: customerIntelligenceTable.leadId,
      set: { isAnalyzing: true, updatedAt: new Date() },
      where: eq(customerIntelligenceTable.isAnalyzing, false),
    })
    .returning({
      id: customerIntelligenceTable.id,
      churnReasonsEditedBy: customerIntelligenceTable.churnReasonsEditedBy,
    });

  if (lockResult.length === 0) {
    // Another process already holds the analysis lock for this lead.
    throw new AnalysisAlreadyInFlightError(leadId);
  }
  dbLockAcquired = true;

  // The row is now guaranteed to exist (either just inserted or already present).
  const existingRecord = lockResult[0]!;

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

  // 3b. Load active deals for the lead
  const activeDeals = await db
    .select({
      titulo:                dealsTable.titulo,
      valor:                 dealsTable.valor,
      etapa:                 dealsTable.etapa,
      etapaSaas:             dealsTable.etapaSaas,
      probabilidade:         dealsTable.probabilidade,
      dataFechamentoPrevista: dealsTable.dataFechamentoPrevista,
      updatedAt:             dealsTable.updatedAt,
    })
    .from(dealsTable)
    .where(and(eq(dealsTable.leadId, leadId), eq(dealsTable.tenantId, tenantId)))
    .orderBy(desc(dealsTable.updatedAt))
    .limit(5);

  // 3c. Load recent proposals for the lead so the AI can distinguish
  // "not created" from draft, sent, pending, accepted, rejected and expired.
  const recentPropostas = await db
    .select({
      titulo:        propostasTable.titulo,
      numero:        propostasTable.numero,
      status:        propostasTable.status,
      valorTotal:    propostasTable.valorTotal,
      valorMensal:   propostasTable.valorMensal,
      recorrente:    propostasTable.recorrente,
      createdAt:     propostasTable.createdAt,
      updatedAt:     propostasTable.updatedAt,
    })
    .from(propostasTable)
    .where(and(eq(propostasTable.leadId, leadId), eq(propostasTable.tenantId, tenantId)))
    .orderBy(desc(propostasTable.updatedAt))
    .limit(8);

  const acceptedPropostas = recentPropostas.filter((p) => p.status === "aceita");
  const presentedPropostas = recentPropostas.filter((p) =>
    ["enviada", "pendente", "aceita", "rejeitada", "expirada"].includes(String(p.status))
  );

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

  const ETAPA_LABELS: Record<string, string> = {
    novo:        "Novo",
    qualificado: "Qualificado",
    proposta:    "Proposta enviada",
    negociacao:  "Em negociação",
    ganho:       "Ganho",
    perdido:     "Perdido",
  };

  const dealsSection = activeDeals.length > 0
    ? activeDeals.map((d) => {
        const etapaLabel = ETAPA_LABELS[d.etapa] ?? d.etapa;
        const saasLabel  = d.etapaSaas ? ` / SaaS: ${d.etapaSaas}` : "";
        const valorLabel = d.valor ? ` — R$ ${Number(d.valor).toLocaleString("pt-BR")}` : "";
        const probLabel  = d.probabilidade != null ? ` (${d.probabilidade}% de chance)` : "";
        const fechamento = d.dataFechamentoPrevista
          ? ` — Previsão: ${new Date(d.dataFechamentoPrevista).toLocaleDateString("pt-BR")}`
          : "";
        const atualizado = `(atualizado ${new Date(d.updatedAt).toLocaleDateString("pt-BR")})`;
        return `- "${d.titulo}": estágio ${etapaLabel}${saasLabel}${valorLabel}${probLabel}${fechamento} ${atualizado}`;
      }).join("\n")
    : "Nenhum negócio registrado.";

  const PROPOSTA_STATUS_LABELS: Record<string, string> = {
    rascunho: "rascunho — ainda não apresentada",
    enviada: "enviada ao cliente",
    pendente: "pendente / em análise pelo cliente",
    aceita: "aceita",
    rejeitada: "rejeitada",
    expirada: "expirada",
  };

  const propostasSection = recentPropostas.length > 0
    ? recentPropostas.map((p) => {
        const total = p.valorTotal ? `R$ ${Number(p.valorTotal).toLocaleString("pt-BR")}` : "";
        const mensal = p.recorrente && p.valorMensal ? ` (recorrente: R$ ${Number(p.valorMensal).toLocaleString("pt-BR")}/mês)` : "";
        const statusLabel = PROPOSTA_STATUS_LABELS[String(p.status)] ?? String(p.status);
        return `- ${p.numero ? `${p.numero} ` : ""}"${p.titulo}": ${total}${mensal} (${statusLabel}; atualizada em ${new Date(p.updatedAt ?? p.createdAt).toLocaleDateString("pt-BR")})`;
      }).join("\n")
    : "Nenhuma proposta ou orçamento criada para este lead.";

  const diasSemContato = conversation?.ultimaMensagemEm
    ? Math.floor((Date.now() - new Date(conversation.ultimaMensagemEm).getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const systemPrompt = `Você é o motor de Saúde do Relacionamento do Vendor.ai.
Analise o relacionamento conforme a jornada REAL do tenant. Não assuma SaaS, assinatura ou recorrência se esses elementos não existirem.

CONTEXTO DO TENANT
- Empresa: ${tenantContext?.name ?? "não informado"}
- Vertical: ${tenantContext?.vertical ?? "não informada"}
- Segmento: ${tenantContext?.segmento ?? "não informado"}

Antes de calcular risco, identifique a fase:
- pré-venda/negociação: use riskType="perda_comercial";
- cliente recorrente/assinatura: riskType="churn";
- execução/obra/entrega: riskType="operacional" ou "insatisfacao";
- pós-venda sem recorrência: riskType="desengajamento";
- cobrança/inadimplência: riskType="financeiro";
- sem risco relevante: riskType="nenhum".

Retorne SOMENTE JSON:
{
  "churnRisk": <0-100, inteiro; campo legado que representa o risco principal atual>,
  "churnReasons": ["fatores negativos observados"],
  "healthScore": <0-100, onde 100 = relacionamento muito saudável>,
  "healthStatus": "saudavel|atencao|alto_risco|critico",
  "riskType": "perda_comercial|churn|operacional|insatisfacao|desengajamento|financeiro|nenhum",
  "riskLevel": "baixo|atencao|alto|critico",
  "riskTrend": "melhorando|estavel|piorando",
  "analysisConfidence": <0-100; mede qualidade/quantidade das evidências, não o risco>,
  "healthDimensions": { "engajamento": 0-100, "relacionamento": 0-100, "comercial": 0-100, "operacional": 0-100, "suporte": 0-100, "financeiro": 0-100 },
  "positiveSignals": [{ "sinal": "...", "evidencia": "...", "impacto": -20 }],
  "negativeSignals": [{ "sinal": "...", "evidencia": "...", "impacto": 20 }],
  "riskFactors": [{ "fator": "...", "motivo": "...", "impacto": 0-100 }],
  "riskEvents": [{ "evento": "...", "delta": -100..100, "motivo": "..." }],
  "journeyStage": "<fase atual curta>",
  "intentAnalysis": "<intenção real e motivação>",
  "opportunities": ["oportunidade real observada"],
  "nextBestAction": "<ação concreta agora>",
  "nextBestActionReason": "<por que esta ação reduz o maior risco ou aproveita a melhor oportunidade>",
  "scoreExplicacao": "<explicação curta da saúde>",
  "churnRiskExplicacao": "<explicação curta do risco principal>"
}

Regras:
- Fatos observados e inferências devem ser tratados separadamente; não invente fatos.
- Se os dados forem escassos, reduza analysisConfidence.
- healthScore e churnRisk não são sinônimos: em geral risco alto reduz saúde, mas sinais positivos podem coexistir com fatores de risco.
- Use sinais positivos E negativos; não penalize automaticamente ausência de dados.
- Não trate silêncio como risco sem considerar o ritmo normal da etapa e sinais recentes de avanço.
- churnRisk é mantido apenas para compatibilidade; interprete-o como intensidade do riskType atual.
- considere o pipeline de negócios E o estado real das propostas como sinais prioritários de engajamento
- DISTINGA obrigatoriamente proposta inexistente, rascunho, enviada/pendente, aceita, rejeitada e expirada
- AUSÊNCIA DE PROPOSTA não é, por si só, razão de churn: nunca use "nenhuma proposta aceita" ou equivalente quando nenhuma proposta foi criada/apresentada
- RASCUNHO também não equivale a rejeição: significa apenas que a oferta ainda está sendo preparada
- Só considere "proposta não aceita" como sinal negativo se houver ao menos uma proposta realmente apresentada ao cliente e nenhuma aceita
- Proposta ENVIADA ou PENDENTE indica processo comercial ativo; combine com tempo sem resposta e estágio do negócio antes de elevar risco
- Proposta REJEITADA ou EXPIRADA é sinal negativo real e pode aumentar risco conforme o contexto
- PROPOSTAS ACEITAS são sinal MUITO FORTE de engajamento comercial confirmado: orçamentos aceitos (especialmente com valor recorrente) REDUZEM drasticamente o churnRisk
- Um lead com 1+ propostas aceitas não pode ter churnRisk > 50 salvo se houver sinais extremos de risco (ex: reclamações, chargebacks, inatividade total pós-contratação)
- Um negócio recentemente avançado no pipeline é sinal forte de intenção positiva e REDUZ o churnRisk, mesmo com baixa atividade de mensagens
- Negócios em estágio "Ganho" = cliente ativo → churnRisk deve refletir risco de cancelamento pós-venda, não de conversão
- Negócios em "Proposta" ou "Negociação" = lead em fase ativa → churnRisk deve ser moderado mesmo com inatividade no chat
- churnReasons deve listar APENAS fatores reais negativos observados; não transforme uma etapa ainda não executada em problema
- nextBestAction deve respeitar o estado comercial: sem proposta criada → preparar/confirmar requisitos; rascunho → finalizar; enviada/pendente → follow-up; rejeitada/expirada → entender objeção e revisar; aceita → executar próximo passo pós-aceite
- journeyStage deve ser um valor curto descritivo
- opportunities são upsell, expansão, avanço comercial ou resolução de problemas identificados
- nextBestAction deve ser específica e executável pela equipe de vendas/CS
- O canal de comunicação preferido é SEMPRE WhatsApp — nunca sugira e-mail como canal de follow-up; use "Enviar mensagem de WhatsApp" ou "Ligar via WhatsApp"
- Se o lead precisa ser reativado ou está em risco, a ação deve ser um contato proativo por WhatsApp${diasSemContato !== null ? `\n- O lead está sem contato via mensagens há ${diasSemContato} dia${diasSemContato !== 1 ? "s" : ""} — mas verifique o pipeline e o estado das propostas antes de considerar como inatividade real` : ""}`;

  const userContent = `## PERFIL DO LEAD\n${leadSection}\n\n## NEGÓCIOS NO PIPELINE (${activeDeals.length} negócio${activeDeals.length !== 1 ? "s" : ""})\n${dealsSection}\n\n## PROPOSTAS/ORÇAMENTOS (${recentPropostas.length} total; ${presentedPropostas.length} apresentada${presentedPropostas.length !== 1 ? "s" : ""}; ${acceptedPropostas.length} aceita${acceptedPropostas.length !== 1 ? "s" : ""})\n${propostasSection}\n\n## HISTÓRICO DE MENSAGENS (últimas ${recentMessages.length})\n${messagesSection}\n\n## ATIVIDADES RECENTES\n${activitiesSection}`;

  // 5. Call GPT-4o-mini via gateway (BYOK + quota + logging)
  let rawJson: string;
  let tokensUsed: number;
  try {
    const result = await gatewayCallOpenAI(
      tenantId,
      "intelligence_analysis",
      [
        { role: "system", content: systemPrompt },
        { role: "user",   content: userContent },
      ],
      {
        model: "gpt-4o-mini",
        responseFormat: { type: "json_object" },
        temperature: 0.3,
        maxTokens: 800,
        log,
      },
    );
    rawJson    = result.content || "{}";
    tokensUsed = result.inputTokens + result.outputTokens;
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

  // 7. Update customer intelligence record with AI results.
  // The row is guaranteed to exist because lock acquisition above either
  // inserted it (first analysis) or confirmed a pre-existing row.
  const now = new Date();

  // When a rep has manually edited churn reasons, preserve them rather than
  // silently overwriting with AI output. The AI's suggestions are returned to
  // the caller so the UI can offer a diff/prompt.
  const repHasEditedReasons = existingRecord.churnReasonsEditedBy === "rep";
  let aiSuggestedChurnReasons: string[] | undefined;

  const churnReasonsFields = repHasEditedReasons
    ? {} // keep rep's edits — do not touch churnReasons, churnReasonsEditedBy, churnReasonsEditedAt
    : {
        churnReasons:         parsed.churnReasons,
        churnReasonsEditedBy: "ai" as const,
        churnReasonsEditedAt: now,
      };

  if (repHasEditedReasons) {
    aiSuggestedChurnReasons = parsed.churnReasons;
    log.info(
      { leadId, tenantId },
      "intelligence/analyze: rep-edited churn reasons preserved; AI suggestions returned separately"
    );
  }

  let intelligence: typeof customerIntelligenceTable.$inferSelect;

  const updateFields = {
    churnRisk:             parsed.churnRisk,
    ...churnReasonsFields,
    healthScore:           parsed.healthScore,
    healthStatus:          parsed.healthStatus,
    riskType:              parsed.riskType,
    riskLevel:             parsed.riskLevel,
    riskTrend:             parsed.riskTrend,
    analysisConfidence:    parsed.analysisConfidence,
    healthDimensions:      parsed.healthDimensions,
    positiveSignals:       parsed.positiveSignals,
    negativeSignals:       parsed.negativeSignals,
    riskFactors:           parsed.riskFactors,
    riskEvents:            parsed.riskEvents,
    analysisVersion:       2,
    journeyStage:          parsed.journeyStage,
    intentAnalysis:        parsed.intentAnalysis,
    opportunities:         parsed.opportunities,
    nextBestAction:        parsed.nextBestAction,
    nextBestActionReason:  parsed.nextBestActionReason,
    scoreExplicacao:       parsed.scoreExplicacao ?? null,
    churnRiskExplicacao:   parsed.churnRiskExplicacao ?? null,
    lastAnalyzedAt:        now,
    updatedAt:             now,
  };

  [intelligence] = await db
    .update(customerIntelligenceTable)
    .set(updateFields)
    .where(eq(customerIntelligenceTable.id, existingRecord.id))
    .returning();

  log.info(
    {
      leadId,
      tenantId,
      churnRisk: parsed.churnRisk,
      healthScore: parsed.healthScore,
      riskType: parsed.riskType,
      riskLevel: parsed.riskLevel,
      journeyStage: parsed.journeyStage,
    },
    "intelligence/analyze: record upserted"
  );

  // Snapshot imutável: preserva como a inteligência evoluiu ao longo da jornada.
  try {
    await db.insert(customerIntelligenceSnapshotsTable).values({
      tenantId,
      leadId,
      intelligenceId: intelligence.id,
      healthScore: parsed.healthScore,
      riskType: parsed.riskType,
      riskLevel: parsed.riskLevel,
      riskTrend: parsed.riskTrend,
      analysisConfidence: parsed.analysisConfidence,
      payload: parsed,
    });
  } catch (err) {
    log.warn({ err, leadId, tenantId }, "intelligence/analyze: snapshot failed (non-fatal)");
  }

  // 8. Record this analysis call for cost attribution and bump monthly token counter (non-fatal if either fails)
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

  // Bump tokensUsedCurrentMonth on the tenant's agent_configs row (non-fatal)
  if (tokensUsed > 0) {
    try {
      await db
        .update(agentConfigsTable)
        .set({
          tokensUsedCurrentMonth: sql`${agentConfigsTable.tokensUsedCurrentMonth} + ${tokensUsed}`,
          updatedAt: new Date(),
        })
        .where(eq(agentConfigsTable.tenantId, tenantId));
      log.info(
        { leadId, tenantId, tokensUsed },
        "intelligence/analyze: tokensUsedCurrentMonth bumped"
      );
    } catch (err) {
      log.error({ err, leadId, tenantId }, "intelligence/analyze: failed to bump tokensUsedCurrentMonth (non-fatal)");
    }
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

  return { intelligence, tokensUsed, rulesTriggered, rulesResults, aiSuggestedChurnReasons };
  } finally {
    // Always release the in-process lock.
    inFlightAnalyses.delete(leadId);

    // Always release the DB-level lock so other processes (and this one on retry)
    // can acquire it. Only attempt if we successfully acquired it; avoids a
    // spurious UPDATE when lock acquisition itself threw.
    if (dbLockAcquired) {
      try {
        await db
          .update(customerIntelligenceTable)
          .set({ isAnalyzing: false })
          .where(
            and(
              eq(customerIntelligenceTable.leadId, leadId),
              eq(customerIntelligenceTable.tenantId, tenantId)
            )
          );
      } catch (releaseErr) {
        log.error(
          { releaseErr, leadId, tenantId },
          "intelligence/analyze: failed to release DB isAnalyzing lock (non-fatal)"
        );
      }
    }
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
      // Load tenant settings for per-tenant overrides
      const [tenant] = await db
        .select({
          analysisStalenessHours:   tenantsTable.analysisStalenessHours,
          analysisMessageThreshold: tenantsTable.analysisMessageThreshold,
        })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId));

      const effectiveStalenessHours =
        tenant?.analysisStalenessHours ?? ANALYSIS_STALENESS_HOURS;
      const effectiveMessageThreshold =
        tenant?.analysisMessageThreshold ?? ANALYSIS_MESSAGE_THRESHOLD;

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
      const stalenessMs    = effectiveStalenessHours * 60 * 60 * 1000;
      const isStale        =
        lastAnalyzedAt === null ||
        Date.now() - new Date(lastAnalyzedAt).getTime() > stalenessMs;

      if (isStale) {
        log.info(
          { leadId, tenantId, lastAnalyzedAt, stalenessHours: effectiveStalenessHours, trigger: "staleness" },
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

      if (newMessageCount >= effectiveMessageThreshold) {
        log.info(
          { leadId, tenantId, newMessageCount, threshold: effectiveMessageThreshold, trigger: "message_count" },
          "auto-analyze: triggering re-analysis (message threshold reached)"
        );
        await analyzeLeadIntelligence({ tenantId, leadId, log, triggeredBy: "auto" });
      } else {
        log.debug(
          { leadId, tenantId, newMessageCount, threshold: effectiveMessageThreshold },
          "auto-analyze: skipping re-analysis (threshold not reached)"
        );
      }
    })
    .catch((err) => {
      if (err instanceof AnalysisAlreadyInFlightError) {
        log.debug({ leadId, tenantId }, "auto-analyze: skipped — analysis already in flight");
        return;
      }
      if (err instanceof Error && err.message.includes("classificado como não-lead")) {
        log.debug({ leadId, tenantId }, "auto-analyze: skipped — lead classificado como não-lead");
        return;
      }
      log.error({ err, leadId, tenantId }, "auto-analyze: background re-analysis failed");
    });
}
