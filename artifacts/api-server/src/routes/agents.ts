/**
 * AI Agent routes.
 * Currently implements the SDR agent process endpoint.
 * POST /tenants/:tenantId/agents/sdr/process
 */
import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import OpenAI from "openai";
import {
  db,
  leadsTable,
  conversationsTable,
  messagesTable,
  customerIntelligenceTable,
  agentConfigsTable,
  agentTasksTable,
} from "@workspace/db";
import type { AgentTask } from "@workspace/db";
import { executeTaskAction } from "./agent_tasks.js";

const router: IRouter = Router();

// ── Input schema ──────────────────────────────────────────────────────────────
const sdrProcessSchema = z.object({
  leadId:   z.string().min(1, "leadId is required"),
  mensagem: z.string().min(1, "mensagem is required"),
});

// ── Lazy OpenAI client ────────────────────────────────────────────────────────
function getOpenAI(): OpenAI {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY environment variable is not set");
  }
  return new OpenAI({ apiKey });
}

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildSystemPrompt(
  customPrompt: string | undefined,
  lead: typeof leadsTable.$inferSelect,
  ci: typeof customerIntelligenceTable.$inferSelect | null
): string {
  const sections: string[] = [];

  // Base persona
  sections.push(
    "Você é um SDR (Sales Development Representative) experiente e consultivo.\n" +
    "Sua missão: qualificar leads, compreender suas necessidades reais e avançar a conversa comercial de forma natural e humana.\n" +
    "Regras obrigatórias:\n" +
    "- Responda sempre em português brasileiro\n" +
    "- Seja conciso (máximo 3 parágrafos curtos)\n" +
    "- Nunca invente informações sobre produtos, preços ou recursos\n" +
    "- Se o lead demonstrar interesse claro, sugira agendar uma conversa com o time"
  );

  // Tenant custom prompt
  if (customPrompt?.trim()) {
    sections.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  }

  // Lead profile
  const leadLines = ["## PERFIL DO LEAD"];
  leadLines.push(`Nome: ${lead.nome}`);
  if (lead.empresa)       leadLines.push(`Empresa: ${lead.empresa}`);
  if (lead.tamanhoEquipe) leadLines.push(`Tamanho da equipe: ${lead.tamanhoEquipe}`);
  if (lead.email)         leadLines.push(`Email: ${lead.email}`);
  if (lead.telefone)      leadLines.push(`Telefone: ${lead.telefone}`);
  leadLines.push(`Status no CRM: ${lead.status}`);
  if (lead.objetivo)         leadLines.push(`Objetivo declarado: ${lead.objetivo}`);
  if (lead.dorPrincipal)     leadLines.push(`Dor principal: ${lead.dorPrincipal}`);
  if (lead.urgencia)         leadLines.push(`Urgência: ${lead.urgencia}`);
  if (lead.orcamento)        leadLines.push(`Orçamento: ${lead.orcamento}`);
  if (lead.planoRecomendado) leadLines.push(`Plano recomendado: ${lead.planoRecomendado}`);
  if (lead.proximaAcao)      leadLines.push(`Próxima ação sugerida: ${lead.proximaAcao}`);
  sections.push(leadLines.join("\n"));

  // Customer intelligence
  if (ci) {
    const ciLines = ["## INTELIGÊNCIA DE CLIENTE"];
    if (ci.journeyStage)          ciLines.push(`Estágio da jornada: ${ci.journeyStage}`);
    if (ci.intentAnalysis)        ciLines.push(`Intenção detectada: ${ci.intentAnalysis}`);
    if (ci.goalAnalysis)          ciLines.push(`Análise de objetivo: ${ci.goalAnalysis}`);
    if (ci.nextBestAction)        ciLines.push(`Próxima melhor ação: ${ci.nextBestAction}`);
    if (ci.nextBestActionReason)  ciLines.push(`Motivo: ${ci.nextBestActionReason}`);
    if (ci.churnRisk !== null && ci.churnRisk !== undefined) {
      ciLines.push(`Risco de churn: ${ci.churnRisk}%`);
    }
    if (ciLines.length > 1) sections.push(ciLines.join("\n"));
  }

  return sections.join("\n\n");
}

// ── POST /tenants/:tenantId/agents/sdr/process ────────────────────────────────
router.post("/tenants/:tenantId/agents/sdr/process", async (req, res) => {
  const { tenantId } = req.params;

  // 1. Validate body
  const parsed = sdrProcessSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const { leadId, mensagem } = parsed.data;

  // 2. Load lead (must belong to this tenant)
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

  if (!lead) {
    res.status(404).json({ error: `Lead "${leadId}" not found in this tenant` });
    return;
  }

  // 3. Load agent config
  const [config] = await db
    .select()
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  if (!config) {
    res.status(404).json({ error: "Agent config not found for this tenant" });
    return;
  }

  // 4. Validate SDR agent is enabled
  const sdrConfig = config.agents?.sdr;
  if (!sdrConfig?.enabled) {
    res.status(422).json({ error: "SDR agent is not enabled for this tenant" });
    return;
  }

  // 5. Check + compute daily / monthly counters (with auto-reset)
  const now = new Date();

  const msSinceDaily = config.messagesSentTodayResetAt
    ? now.getTime() - new Date(config.messagesSentTodayResetAt).getTime()
    : Infinity;
  const needsDailyReset = msSinceDaily >= 24 * 60 * 60 * 1000;

  const msSinceMonthly = config.tokensResetAt
    ? now.getTime() - new Date(config.tokensResetAt).getTime()
    : Infinity;
  const needsMonthlyReset = msSinceMonthly >= 30 * 24 * 60 * 60 * 1000;

  const currentDaily   = needsDailyReset   ? 0 : config.messagesSentToday;
  const currentMonthly = needsMonthlyReset ? 0 : config.tokensUsedCurrentMonth;

  if (currentDaily >= config.dailyMessageLimit) {
    res.status(429).json({
      error:      "Daily message limit reached",
      limit:      config.dailyMessageLimit,
      sentToday:  currentDaily,
    });
    return;
  }

  if (currentMonthly >= config.monthlyTokenLimit) {
    res.status(429).json({
      error:  "Monthly token limit reached",
      limit:  config.monthlyTokenLimit,
      used:   currentMonthly,
    });
    return;
  }

  // 6. Load customer intelligence (optional — null is fine)
  const [ci = null] = await db
    .select()
    .from(customerIntelligenceTable)
    .where(
      and(
        eq(customerIntelligenceTable.leadId, leadId),
        eq(customerIntelligenceTable.tenantId, tenantId)
      )
    );

  // 7. Load most recent open conversation + last 10 messages (chronological)
  const [conversation = null] = await db
    .select()
    .from(conversationsTable)
    .where(
      and(
        eq(conversationsTable.leadId, leadId),
        eq(conversationsTable.tenantId, tenantId)
      )
    )
    .orderBy(desc(conversationsTable.ultimaMensagemEm))
    .limit(1);

  const recentMessages = conversation
    ? await db
        .select()
        .from(messagesTable)
        .where(eq(messagesTable.conversationId, conversation.id))
        .orderBy(desc(messagesTable.createdAt))
        .limit(10)
        .then((rows) => rows.reverse()) // oldest → newest for prompt
    : [];

  // 8. Build OpenAI messages array
  const systemPrompt = buildSystemPrompt(sdrConfig.prompt, lead, ci);

  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of recentMessages) {
    openaiMessages.push({
      role:    msg.direcao === "entrada" ? "user" : "assistant",
      content: msg.conteudo,
    });
  }

  openaiMessages.push({ role: "user", content: mensagem });

  // 9. Call OpenAI (gpt-4o-mini)
  let resposta: string;
  let tokensUsed = 0;

  try {
    const completion = await getOpenAI().chat.completions.create({
      model:       "gpt-4o-mini",
      messages:    openaiMessages,
      temperature: 0.7,
      max_tokens:  600,
    });

    resposta  = completion.choices[0]?.message?.content?.trim() ?? "";
    tokensUsed = completion.usage?.total_tokens ?? 0;

    req.log.info({ leadId, tokensUsed, model: "gpt-4o-mini" }, "sdr: openai call succeeded");
  } catch (err) {
    req.log.error({ err, leadId }, "sdr: openai call failed");
    res.status(502).json({ error: "AI service unavailable. Please try again later." });
    return;
  }

  // 10. Update usage counters (atomic-ish: read before call, write after)
  await db
    .update(agentConfigsTable)
    .set({
      messagesSentToday:        needsDailyReset   ? 1         : currentDaily + 1,
      messagesSentTodayResetAt: needsDailyReset   ? now       : (config.messagesSentTodayResetAt ?? now),
      tokensUsedCurrentMonth:   needsMonthlyReset ? tokensUsed : currentMonthly + tokensUsed,
      tokensResetAt:            needsMonthlyReset ? now        : (config.tokensResetAt ?? now),
      updatedAt: now,
    })
    .where(eq(agentConfigsTable.id, config.id));

  // 11. Determine task status based on autonomy mode
  const isAutonomous = !!config.autonomyEnabledAt;
  const taskStatus   = isAutonomous ? "executando" : "pendente_aprovacao";

  // 12. Create agent_task
  const [task] = await db
    .insert(agentTasksTable)
    .values({
      tenantId,
      leadId,
      agentName:  "sdr",
      actionType: "enviar_whatsapp",
      payload: {
        leadId,
        conteudo:  resposta,
        agentName: "sdr",
        canal:     "whatsapp",
      },
      status:     taskStatus,
      ...(isAutonomous && { executedAt: now }),
    })
    .returning();

  // 13. If autonomous → execute immediately (sends message, marks concluido/erro)
  let finalTask: AgentTask = task;
  if (isAutonomous) {
    finalTask = await executeTaskAction(task, req.log);
  }

  req.log.info(
    { taskId: finalTask.id, status: finalTask.status, leadId, tokensUsed, isAutonomous },
    "sdr: process complete"
  );

  res.status(201).json({
    task:        finalTask,
    resposta,
    tokensUsed,
    isAutonomous,
  });
});

export default router;
