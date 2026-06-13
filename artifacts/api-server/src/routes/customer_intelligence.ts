import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import OpenAI from "openai";
import {
  db,
  customerIntelligenceTable,
  insertCustomerIntelligenceSchema,
  updateCustomerIntelligenceSchema,
  leadsTable,
  conversationsTable,
  messagesTable,
  activitiesTable,
} from "@workspace/db";
import { evaluateForLead } from "./rules.js";

const router: IRouter = Router();

function isPgCode(err: unknown, code: string): boolean {
  if (typeof err !== "object" || err === null) return false;
  if ("code" in err && (err as { code: string }).code === code) return true;
  if ("cause" in err) return isPgCode((err as { cause: unknown }).cause, code);
  return false;
}

function isUniqueViolation(err: unknown): boolean {
  return isPgCode(err, "23505");
}

function getOpenAI(): OpenAI {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is not set");
  return new OpenAI({ apiKey });
}

router.post("/customer-intelligence", async (req, res) => {
  const parsed = insertCustomerIntelligenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  // Enforce tenant scope: body tenantId must match the requester's tenant
  if (
    req.user?.platformRole !== "super_admin" &&
    req.user?.tenantId !== parsed.data.tenantId
  ) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  try {
    const [record] = await db
      .insert(customerIntelligenceTable)
      .values(parsed.data)
      .returning();
    res.status(201).json(record);
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "A customer intelligence record already exists for this lead" });
      return;
    }
    throw err;
  }
});

router.get("/tenants/:tenantId/customer-intelligence", async (req, res) => {
  const tenantId = String(req.params.tenantId);

  if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const records = await db
    .select()
    .from(customerIntelligenceTable)
    .where(eq(customerIntelligenceTable.tenantId, tenantId))
    .orderBy(customerIntelligenceTable.createdAt);

  res.json(records);
});

router.get(
  "/tenants/:tenantId/leads/:leadId/intelligence",
  async (req, res) => {
    const tenantId = String(req.params.tenantId);
    const leadId   = String(req.params.leadId);

    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    // Concurrency-safe upsert: insert-or-do-nothing on leadId unique constraint, then select
    await db
      .insert(customerIntelligenceTable)
      .values({ tenantId, leadId })
      .onConflictDoNothing({ target: customerIntelligenceTable.leadId });

    const [record] = await db
      .select()
      .from(customerIntelligenceTable)
      .where(
        and(
          eq(customerIntelligenceTable.tenantId, tenantId),
          eq(customerIntelligenceTable.leadId, leadId)
        )
      );

    if (!record) {
      res.status(404).json({ error: "Customer intelligence record not found" });
      return;
    }

    res.json(record);
  }
);

router.get("/customer-intelligence/:id", async (req, res) => {
  const [record] = await db
    .select()
    .from(customerIntelligenceTable)
    .where(eq(customerIntelligenceTable.id, String(req.params.id)));

  if (!record) {
    res.status(404).json({ error: "Customer intelligence record not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && record.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  res.json(record);
});

router.patch("/customer-intelligence/:id", async (req, res) => {
  const parsed = updateCustomerIntelligenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db
    .select({ id: customerIntelligenceTable.id, tenantId: customerIntelligenceTable.tenantId })
    .from(customerIntelligenceTable)
    .where(eq(customerIntelligenceTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Customer intelligence record not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  const [record] = await db
    .update(customerIntelligenceTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(customerIntelligenceTable.id, existing.id))
    .returning();

  res.json(record);
});

router.delete("/customer-intelligence/:id", async (req, res) => {
  const [existing] = await db
    .select({ id: customerIntelligenceTable.id, tenantId: customerIntelligenceTable.tenantId })
    .from(customerIntelligenceTable)
    .where(eq(customerIntelligenceTable.id, String(req.params.id)));

  if (!existing) {
    res.status(404).json({ error: "Customer intelligence record not found" });
    return;
  }

  if (req.user?.platformRole !== "super_admin" && existing.tenantId !== req.user?.tenantId) {
    res.status(403).json({ error: "Access denied to this tenant" });
    return;
  }

  await db
    .delete(customerIntelligenceTable)
    .where(eq(customerIntelligenceTable.id, existing.id));

  res.status(204).send();
});

// ── AI Analysis schema ─────────────────────────────────────────────────────────
const aiAnalysisSchema = z.object({
  churnRisk:           z.number().int().min(0).max(100),
  churnReasons:        z.array(z.string()).default([]),
  journeyStage:        z.string(),
  intentAnalysis:      z.string(),
  opportunities:       z.array(z.string()).default([]),
  nextBestAction:      z.string(),
  nextBestActionReason:z.string(),
});

/**
 * POST /tenants/:tenantId/leads/:leadId/intelligence/analyze
 *
 * Calls GPT-4o-mini to analyze the lead's data, conversation history, and
 * recent activities, then writes back all Customer Intelligence fields.
 * Fires the churn_risk_alto rules engine trigger if churnRisk >= 60.
 */
router.post(
  "/tenants/:tenantId/leads/:leadId/intelligence/analyze",
  async (req, res): Promise<void> => {
    const tenantId = String(req.params.tenantId);
    const leadId   = String(req.params.leadId);

    // 0. Tenant scope guard — requester must belong to this tenant (super_admin bypasses)
    if (req.user?.platformRole !== "super_admin" && req.user?.tenantId !== tenantId) {
      res.status(403).json({ error: "Access denied to this tenant" });
      return;
    }

    // 1. Load lead — must exist and belong to this tenant
    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
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
      req.log.info({ leadId, tenantId, tokensUsed }, "intelligence/analyze: openai call succeeded");
    } catch (err) {
      req.log.error({ err, leadId, tenantId }, "intelligence/analyze: openai call failed");
      res.status(502).json({ error: "AI service unavailable. Please try again later." });
      return;
    }

    // 6. Parse and validate AI response
    let parsed: z.infer<typeof aiAnalysisSchema>;
    try {
      parsed = aiAnalysisSchema.parse(JSON.parse(rawJson));
    } catch (err) {
      req.log.error({ err, rawJson, leadId }, "intelligence/analyze: failed to parse AI response");
      res.status(502).json({ error: "AI returned an unexpected response format." });
      return;
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

    req.log.info(
      { leadId, tenantId, churnRisk: parsed.churnRisk, journeyStage: parsed.journeyStage },
      "intelligence/analyze: record upserted"
    );

    // 8. Fire rules engine if churnRisk >= 60
    let rulesTriggered = 0;
    let rulesResults: unknown[] = [];

    if (parsed.churnRisk >= 60) {
      try {
        const rulesResult = await evaluateForLead({
          tenantId,
          trigger: "churn_risk_alto",
          leadId,
          log: req.log,
        });
        rulesTriggered = rulesResult.triggered;
        rulesResults   = rulesResult.results;
        req.log.info(
          { leadId, tenantId, churnRisk: parsed.churnRisk, rulesTriggered },
          "intelligence/analyze: rules engine fired"
        );
      } catch (err) {
        req.log.error({ err, leadId, tenantId }, "intelligence/analyze: rules engine evaluation failed (non-fatal)");
      }
    }

    res.json({ intelligence, tokensUsed, rulesTriggered, rulesResults });
  }
);

export default router;
