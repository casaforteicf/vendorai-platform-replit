import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
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
  const records = await db
    .select()
    .from(customerIntelligenceTable)
    .where(eq(customerIntelligenceTable.tenantId, String(req.params.tenantId)))
    .orderBy(customerIntelligenceTable.createdAt);

  res.json(records);
});

router.get(
  "/tenants/:tenantId/leads/:leadId/intelligence",
  async (req, res) => {
    const { tenantId, leadId } = req.params;

    const [existing] = await db
      .select()
      .from(customerIntelligenceTable)
      .where(
        and(
          eq(customerIntelligenceTable.tenantId, String(tenantId)),
          eq(customerIntelligenceTable.leadId, String(leadId))
        )
      );

    if (existing) {
      res.json(existing);
      return;
    }

    const [created] = await db
      .insert(customerIntelligenceTable)
      .values({ tenantId: String(tenantId), leadId: String(leadId) })
      .returning();

    res.status(201).json(created);
  }
);

// ── AI Analysis ────────────────────────────────────────────────────────────────
router.post(
  "/tenants/:tenantId/leads/:leadId/intelligence/analyze",
  async (req, res) => {
    const { tenantId, leadId } = req.params;

    // 1. Load lead
    const [lead] = await db
      .select()
      .from(leadsTable)
      .where(and(eq(leadsTable.id, String(leadId)), eq(leadsTable.tenantId, String(tenantId))));

    if (!lead) {
      res.status(404).json({ error: "Lead not found" });
      return;
    }

    // 2. Load last conversation + last 20 messages
    const [conversation = null] = await db
      .select()
      .from(conversationsTable)
      .where(and(
        eq(conversationsTable.leadId, String(leadId)),
        eq(conversationsTable.tenantId, String(tenantId))
      ))
      .orderBy(desc(conversationsTable.ultimaMensagemEm))
      .limit(1);

    const recentMessages = conversation
      ? await db
          .select()
          .from(messagesTable)
          .where(eq(messagesTable.conversationId, conversation.id))
          .orderBy(desc(messagesTable.createdAt))
          .limit(20)
          .then((rows) => rows.reverse())
      : [];

    // 3. Load last 10 activities
    const recentActivities = await db
      .select()
      .from(activitiesTable)
      .where(and(
        eq(activitiesTable.leadId, String(leadId)),
        eq(activitiesTable.tenantId, String(tenantId))
      ))
      .orderBy(desc(activitiesTable.createdAt))
      .limit(10);

    // 4. Build analysis prompt
    const leadSection = [
      `Nome: ${lead.nome}`,
      lead.empresa       ? `Empresa: ${lead.empresa}`            : null,
      lead.tamanhoEquipe ? `Tamanho equipe: ${lead.tamanhoEquipe}` : null,
      lead.status        ? `Status CRM: ${lead.status}`          : null,
      lead.objetivo      ? `Objetivo: ${lead.objetivo}`          : null,
      lead.dorPrincipal  ? `Dor principal: ${lead.dorPrincipal}` : null,
      lead.urgencia      ? `Urgência: ${lead.urgencia}`          : null,
      lead.orcamento     ? `Orçamento: ${lead.orcamento}`        : null,
    ].filter(Boolean).join("\n");

    const diasSemContato = conversation?.ultimaMensagemEm
      ? Math.floor((Date.now() - new Date(conversation.ultimaMensagemEm).getTime()) / (1000 * 60 * 60 * 24))
      : null;

    const conversaSection = recentMessages.length > 0
      ? recentMessages.map((m) => `[${m.direcao === "entrada" ? "Lead" : "Agente"}]: ${m.conteudo}`).join("\n")
      : "Sem histórico de conversas.";

    const atividadesSection = recentActivities.length > 0
      ? recentActivities.map((a) => `- ${a.tipo} | ${a.titulo} | ${a.status}`).join("\n")
      : "Sem atividades registradas.";

    const systemPrompt = `Você é um analista de Customer Intelligence especialista em SaaS B2B.
Analise os dados do lead e retorne SOMENTE um JSON válido (sem markdown, sem texto extra) com esta estrutura exata:
{
  "churnRisk": <inteiro 0-100>,
  "churnReasons": [<lista de strings com motivos do risco, pode ser vazia>],
  "journeyStage": "<um de: descoberta|interesse|consideracao|decisao|cliente|inativo>",
  "intentAnalysis": "<frase curta explicando a intenção de compra do lead>",
  "goalAnalysis": "<frase curta explicando o objetivo real do lead>",
  "nextBestAction": "<ação concreta recomendada para o representante de vendas>",
  "nextBestActionReason": "<motivo da ação recomendada>",
  "opportunities": [<lista de strings com oportunidades de upsell/cross-sell identificadas, pode ser vazia>]
}

Regras de churnRisk:
- 0-29: baixo risco (lead ativo, engajado, progredindo)
- 30-70: risco médio (sinais mistos ou estagnação)
- 71-100: alto risco (lead inativo, objeções não resolvidas, muito tempo sem contato)`;

    const userContent = `## PERFIL DO LEAD\n${leadSection}${diasSemContato !== null ? `\nDias sem contato: ${diasSemContato}` : ""}

## HISTÓRICO DE CONVERSA (últimas 20 mensagens)
${conversaSection}

## ATIVIDADES RECENTES
${atividadesSection}`;

    // 5. Call OpenAI
    let analysisJson: {
      churnRisk: number;
      churnReasons: string[];
      journeyStage: string;
      intentAnalysis: string;
      goalAnalysis: string;
      nextBestAction: string;
      nextBestActionReason: string;
      opportunities: string[];
    };

    try {
      const completion = await getOpenAI().chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        temperature: 0.3,
        max_tokens: 600,
        response_format: { type: "json_object" },
      });

      const raw = completion.choices[0]?.message?.content ?? "{}";
      analysisJson = JSON.parse(raw) as typeof analysisJson;
    } catch (err) {
      req.log.error({ err }, "OpenAI analysis failed");
      res.status(502).json({ error: "AI analysis failed. Please try again." });
      return;
    }

    // Clamp churnRisk to 0-100
    const churnRisk = Math.max(0, Math.min(100, Math.round(Number(analysisJson.churnRisk) || 0)));

    // 6. Upsert CI record
    const now = new Date();
    const updatePayload = {
      churnRisk,
      churnReasons: Array.isArray(analysisJson.churnReasons) ? analysisJson.churnReasons : [],
      journeyStage: analysisJson.journeyStage || null,
      intentAnalysis: analysisJson.intentAnalysis || null,
      goalAnalysis: analysisJson.goalAnalysis || null,
      nextBestAction: analysisJson.nextBestAction || null,
      nextBestActionReason: analysisJson.nextBestActionReason || null,
      opportunities: Array.isArray(analysisJson.opportunities) ? analysisJson.opportunities : [],
      lastAnalyzedAt: now,
      updatedAt: now,
    };

    // Try upsert: insert with onConflictDoUpdate on leadId
    const [record] = await db
      .insert(customerIntelligenceTable)
      .values({ tenantId: String(tenantId), leadId: String(leadId), ...updatePayload })
      .onConflictDoUpdate({
        target: customerIntelligenceTable.leadId,
        set: updatePayload,
      })
      .returning();

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

  res.json(record);
});

router.patch("/customer-intelligence/:id", async (req, res) => {
  const parsed = updateCustomerIntelligenceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }

  const [record] = await db
    .update(customerIntelligenceTable)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(eq(customerIntelligenceTable.id, String(req.params.id)))
    .returning();

  if (!record) {
    res.status(404).json({ error: "Customer intelligence record not found" });
    return;
  }

  res.json(record);
});

router.delete("/customer-intelligence/:id", async (req, res) => {
  const [deleted] = await db
    .delete(customerIntelligenceTable)
    .where(eq(customerIntelligenceTable.id, String(req.params.id)))
    .returning({ id: customerIntelligenceTable.id });

  if (!deleted) {
    res.status(404).json({ error: "Customer intelligence record not found" });
    return;
  }

  res.status(204).send();
});

export default router;
