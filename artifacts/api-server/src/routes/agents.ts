/**
 * AI Agent routes.
 *
 * POST /tenants/:tenantId/agents/sdr/process      — qualificação consultiva
 * POST /tenants/:tenantId/agents/closer/process   — fechamento / objeções
 * POST /tenants/:tenantId/agents/followup/process — reativação de leads inativos
 */
import { Router, type Request, type Response, type IRouter } from "express";
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

// ── Local types ───────────────────────────────────────────────────────────────
type Lead         = typeof leadsTable.$inferSelect;
type CI           = typeof customerIntelligenceTable.$inferSelect;
type Conversation = typeof conversationsTable.$inferSelect;
type Message      = typeof messagesTable.$inferSelect;
type AgentConfig  = typeof agentConfigsTable.$inferSelect;

type AgentContext = {
  lead:           Lead;
  ci:             CI | null;
  conversation:   Conversation | null;
  recentMessages: Message[];
};

type LimitOk = {
  ok:               true;
  currentDaily:     number;
  currentMonthly:   number;
  needsDailyReset:  boolean;
  needsMonthlyReset: boolean;
};
type LimitExceeded = { ok: false; httpStatus: 429; body: object };
type LimitResult   = LimitOk | LimitExceeded;

type AgentName    = "sdr" | "closer" | "followup";
type PromptBuilder = (customPrompt: string | undefined, ctx: AgentContext) => string;

const router: IRouter = Router();

// ── Input schema (same for all agents) ───────────────────────────────────────
const processBodySchema = z.object({
  leadId:   z.string().min(1, "leadId is required"),
  mensagem: z.string().min(1, "mensagem is required"),
});

// ── OpenAI client (lazy) ──────────────────────────────────────────────────────
function getOpenAI(): OpenAI {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is not set");
  return new OpenAI({ apiKey });
}

// ═════════════════════════════════════════════════════════════════════════════
//  SHARED HELPERS
// ═════════════════════════════════════════════════════════════════════════════

async function loadContext(
  tenantId: string,
  leadId:   string
): Promise<AgentContext | null> {
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

  if (!lead) return null;

  const [ci = null] = await db
    .select()
    .from(customerIntelligenceTable)
    .where(
      and(
        eq(customerIntelligenceTable.leadId, leadId),
        eq(customerIntelligenceTable.tenantId, tenantId)
      )
    );

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
        .then((rows) => rows.reverse())
    : [];

  return { lead, ci, conversation, recentMessages };
}

function computeLimits(config: AgentConfig): LimitResult {
  const now = Date.now();

  const msSinceDaily = config.messagesSentTodayResetAt
    ? now - new Date(config.messagesSentTodayResetAt).getTime()
    : Infinity;
  const needsDailyReset   = msSinceDaily >= 24 * 60 * 60 * 1000;

  const msSinceMonthly = config.tokensResetAt
    ? now - new Date(config.tokensResetAt).getTime()
    : Infinity;
  const needsMonthlyReset = msSinceMonthly >= 30 * 24 * 60 * 60 * 1000;

  const currentDaily   = needsDailyReset   ? 0 : config.messagesSentToday;
  const currentMonthly = needsMonthlyReset ? 0 : config.tokensUsedCurrentMonth;

  if (currentDaily >= config.dailyMessageLimit) {
    return {
      ok: false,
      httpStatus: 429,
      body: { error: "Daily message limit reached", limit: config.dailyMessageLimit, sentToday: currentDaily },
    };
  }
  if (currentMonthly >= config.monthlyTokenLimit) {
    return {
      ok: false,
      httpStatus: 429,
      body: { error: "Monthly token limit reached", limit: config.monthlyTokenLimit, used: currentMonthly },
    };
  }

  return { ok: true, currentDaily, currentMonthly, needsDailyReset, needsMonthlyReset };
}

async function callOpenAI(
  messages: OpenAI.Chat.ChatCompletionMessageParam[]
): Promise<{ resposta: string; tokensUsed: number }> {
  const completion = await getOpenAI().chat.completions.create({
    model:       "gpt-4o-mini",
    messages,
    temperature: 0.7,
    max_tokens:  600,
  });
  return {
    resposta:   completion.choices[0]?.message?.content?.trim() ?? "",
    tokensUsed: completion.usage?.total_tokens ?? 0,
  };
}

async function updateCounters(
  config:      AgentConfig,
  limits:      LimitOk,
  tokensUsed:  number,
  now:         Date
): Promise<void> {
  await db
    .update(agentConfigsTable)
    .set({
      messagesSentToday:        limits.needsDailyReset   ? 1          : limits.currentDaily   + 1,
      messagesSentTodayResetAt: limits.needsDailyReset   ? now        : (config.messagesSentTodayResetAt ?? now),
      tokensUsedCurrentMonth:   limits.needsMonthlyReset ? tokensUsed : limits.currentMonthly + tokensUsed,
      tokensResetAt:            limits.needsMonthlyReset ? now        : (config.tokensResetAt ?? now),
      updatedAt: now,
    })
    .where(eq(agentConfigsTable.id, config.id));
}

async function insertAndRun(params: {
  tenantId:    string;
  leadId:      string;
  agentName:   AgentName;
  resposta:    string;
  isAutonomous: boolean;
  now:         Date;
  log:         Request["log"];
}): Promise<AgentTask> {
  const { tenantId, leadId, agentName, resposta, isAutonomous, now, log } = params;
  const taskStatus = isAutonomous ? "executando" : "pendente_aprovacao";

  const [task] = await db
    .insert(agentTasksTable)
    .values({
      tenantId,
      leadId,
      agentName,
      actionType: "enviar_whatsapp",
      payload: {
        leadId,
        conteudo:  resposta,
        agentName,
        canal:     "whatsapp",
      },
      status: taskStatus,
      ...(isAutonomous && { executedAt: now }),
    })
    .returning();

  if (isAutonomous) {
    return executeTaskAction(task, log);
  }
  return task;
}

// ═════════════════════════════════════════════════════════════════════════════
//  PROMPT BUILDERS  (agent-specific context + tone)
// ═════════════════════════════════════════════════════════════════════════════

// ── SDR — qualificação consultiva ─────────────────────────────────────────────
function buildSdrPrompt(customPrompt: string | undefined, ctx: AgentContext): string {
  const { lead, ci } = ctx;
  const parts: string[] = [];

  parts.push(
    "Você é um SDR (Sales Development Representative) experiente e consultivo.\n" +
    "Missão: qualificar o lead, entender suas necessidades reais e avançar a conversa comercial de forma natural.\n" +
    "Regras:\n" +
    "- Responda em português brasileiro\n" +
    "- Máximo 3 parágrafos curtos\n" +
    "- Nunca invente informações sobre produtos ou preços\n" +
    "- Se houver interesse claro, sugira agendar uma conversa com o time"
  );

  if (customPrompt?.trim()) {
    parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  }

  parts.push(buildLeadSection(lead));
  if (ci) parts.push(buildCiSection(ci));

  return parts.join("\n\n");
}

// ── Closer — fechamento e objeções ────────────────────────────────────────────
function buildCloserPrompt(customPrompt: string | undefined, ctx: AgentContext): string {
  const { lead, ci } = ctx;
  const parts: string[] = [];

  parts.push(
    "Você é um Closer de vendas especialista em B2B SaaS.\n" +
    "Missão: remover objeções, criar clareza sobre valor e avançar para o fechamento do negócio.\n" +
    "Regras:\n" +
    "- Responda em português brasileiro, tom confiante mas empático\n" +
    "- Máximo 3 parágrafos curtos\n" +
    "- Não force o fechamento — escute a objeção, reconheça-a e apresente o contra-argumento com evidência\n" +
    "- Se o lead estiver pronto, proponha o próximo passo concreto (assinar, agendar call de contrato, etc.)\n" +
    "- Nunca invente dados, desconto ou funcionalidades não confirmadas"
  );

  if (customPrompt?.trim()) {
    parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  }

  parts.push(buildLeadSection(lead));

  if (ci) {
    const ciLines = ["## INTELIGÊNCIA DE CLIENTE (use para personalizar a abordagem)"];
    if (ci.journeyStage)     ciLines.push(`Estágio da jornada: ${ci.journeyStage}`);
    if (ci.intentAnalysis)   ciLines.push(`Intenção detectada: ${ci.intentAnalysis}`);
    if (ci.goalAnalysis)     ciLines.push(`Análise de objetivo: ${ci.goalAnalysis}`);

    if (Array.isArray(ci.opportunities) && ci.opportunities.length > 0) {
      ciLines.push(`Oportunidades identificadas:\n${ci.opportunities.map((o) => `  - ${String(o)}`).join("\n")}`);
    }

    if (ci.churnRisk !== null && ci.churnRisk !== undefined) {
      ciLines.push(`Risco de churn: ${ci.churnRisk}% ${ci.churnRisk >= 60 ? "⚠️ ALTO — aborde as razões abaixo" : ""}`);
    }
    if (Array.isArray(ci.churnReasons) && ci.churnReasons.length > 0) {
      ciLines.push(`Razões de risco:\n${ci.churnReasons.map((r) => `  - ${String(r)}`).join("\n")}`);
    }

    if (ci.nextBestAction)       ciLines.push(`Próxima melhor ação: ${ci.nextBestAction}`);
    if (ci.nextBestActionReason) ciLines.push(`Motivo: ${ci.nextBestActionReason}`);

    if (ciLines.length > 1) parts.push(ciLines.join("\n"));
  }

  return parts.join("\n\n");
}

// ── Followup — reativação de leads inativos ───────────────────────────────────
function buildFollowupPrompt(customPrompt: string | undefined, ctx: AgentContext): string {
  const { lead, ci, conversation } = ctx;
  const parts: string[] = [];

  // Compute days of inactivity
  let inactivityInfo = "";
  if (conversation?.ultimaMensagemEm) {
    const days = Math.floor(
      (Date.now() - new Date(conversation.ultimaMensagemEm).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (days > 0) inactivityInfo = `O lead está sem atividade há ${days} dia${days > 1 ? "s" : ""}.`;
  }

  parts.push(
    "Você é um especialista em follow-up de vendas B2B.\n" +
    "Missão: retomar o contato com um lead que ficou sem resposta, de forma calorosa e não invasiva.\n" +
    "Regras:\n" +
    "- Responda em português brasileiro, tom leve e genuinamente prestativo\n" +
    "- Máximo 2 parágrafos curtos\n" +
    "- Não mencione diretamente que o lead sumiu — simplesmente retome a conversa\n" +
    "- Traga algo de valor: uma dúvida que surgiu, uma novidade relevante, ou um convite gentil para continuar\n" +
    "- Se não houver contexto de conversa anterior, inicie do zero com a abordagem mais adequada ao perfil"
    + (inactivityInfo ? `\n- Contexto: ${inactivityInfo}` : "")
  );

  if (customPrompt?.trim()) {
    parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  }

  parts.push(buildLeadSection(lead));

  if (ci) {
    const ciLines = ["## INTELIGÊNCIA DE CLIENTE"];
    if (ci.journeyStage)         ciLines.push(`Estágio da jornada: ${ci.journeyStage}`);
    if (ci.goalAnalysis)         ciLines.push(`Objetivo do lead: ${ci.goalAnalysis}`);
    if (ci.nextBestAction)       ciLines.push(`Ação recomendada: ${ci.nextBestAction}`);
    if (ci.nextBestActionReason) ciLines.push(`Motivo: ${ci.nextBestActionReason}`);
    if (ci.churnRisk !== null && ci.churnRisk !== undefined) {
      ciLines.push(`Risco de churn: ${ci.churnRisk}%`);
    }
    if (ciLines.length > 1) parts.push(ciLines.join("\n"));
  }

  return parts.join("\n\n");
}

// ── Shared lead section ───────────────────────────────────────────────────────
function buildLeadSection(lead: Lead): string {
  const lines = ["## PERFIL DO LEAD"];
  lines.push(`Nome: ${lead.nome}`);
  if (lead.empresa)          lines.push(`Empresa: ${lead.empresa}`);
  if (lead.tamanhoEquipe)    lines.push(`Tamanho da equipe: ${lead.tamanhoEquipe}`);
  lines.push(`Status no CRM: ${lead.status}`);
  if (lead.objetivo)         lines.push(`Objetivo declarado: ${lead.objetivo}`);
  if (lead.dorPrincipal)     lines.push(`Dor principal: ${lead.dorPrincipal}`);
  if (lead.urgencia)         lines.push(`Urgência: ${lead.urgencia}`);
  if (lead.orcamento)        lines.push(`Orçamento: ${lead.orcamento}`);
  if (lead.planoRecomendado) lines.push(`Plano recomendado: ${lead.planoRecomendado}`);
  if (lead.proximaAcao)      lines.push(`Próxima ação sugerida: ${lead.proximaAcao}`);
  return lines.join("\n");
}

function buildCiSection(ci: CI): string {
  const lines = ["## INTELIGÊNCIA DE CLIENTE"];
  if (ci.journeyStage)         lines.push(`Estágio da jornada: ${ci.journeyStage}`);
  if (ci.intentAnalysis)       lines.push(`Intenção detectada: ${ci.intentAnalysis}`);
  if (ci.goalAnalysis)         lines.push(`Análise de objetivo: ${ci.goalAnalysis}`);
  if (ci.nextBestAction)       lines.push(`Próxima melhor ação: ${ci.nextBestAction}`);
  if (ci.nextBestActionReason) lines.push(`Motivo: ${ci.nextBestActionReason}`);
  if (ci.churnRisk !== null && ci.churnRisk !== undefined) {
    lines.push(`Risco de churn: ${ci.churnRisk}%`);
  }
  return lines.length > 1 ? lines.join("\n") : "";
}

// ═════════════════════════════════════════════════════════════════════════════
//  CORE HANDLER  (shared by all three agents)
// ═════════════════════════════════════════════════════════════════════════════

async function handleAgentProcess(
  req:          Request,
  res:          Response,
  agentName:    AgentName,
  buildPrompt:  PromptBuilder
): Promise<void> {
  const { tenantId } = req.params as { tenantId: string };

  // 1. Validate body
  const parsed = processBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const { leadId, mensagem } = parsed.data;

  // 2. Load agent config
  const [config] = await db
    .select()
    .from(agentConfigsTable)
    .where(eq(agentConfigsTable.tenantId, tenantId));

  if (!config) {
    res.status(404).json({ error: "Agent config not found for this tenant" });
    return;
  }

  // 3. Validate this specific agent is enabled
  const agentCfg = config.agents?.[agentName];
  if (!agentCfg?.enabled) {
    res.status(422).json({ error: `Agent "${agentName}" is not enabled for this tenant` });
    return;
  }

  // 4. Check usage limits
  const limits = computeLimits(config);
  if (!limits.ok) {
    res.status(limits.httpStatus).json(limits.body);
    return;
  }

  // 5. Load lead + context (CI, conversation, messages)
  const ctx = await loadContext(tenantId, leadId);
  if (!ctx) {
    res.status(404).json({ error: `Lead "${leadId}" not found in this tenant` });
    return;
  }

  // 6. Build OpenAI messages
  const systemPrompt = buildPrompt(agentCfg.prompt, ctx);

  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
  ];

  for (const msg of ctx.recentMessages) {
    openaiMessages.push({
      role:    msg.direcao === "entrada" ? "user" : "assistant",
      content: msg.conteudo,
    });
  }

  openaiMessages.push({ role: "user", content: mensagem });

  // 7. Call OpenAI
  let resposta: string;
  let tokensUsed: number;

  try {
    ({ resposta, tokensUsed } = await callOpenAI(openaiMessages));
    req.log.info({ leadId, agentName, tokensUsed }, `${agentName}: openai call succeeded`);
  } catch (err) {
    req.log.error({ err, leadId, agentName }, `${agentName}: openai call failed`);
    res.status(502).json({ error: "AI service unavailable. Please try again later." });
    return;
  }

  // 8. Update usage counters
  const now = new Date();
  await updateCounters(config, limits, tokensUsed, now);

  // 9. Create task (and auto-execute if autonomous)
  const isAutonomous = !!config.autonomyEnabledAt;
  const finalTask    = await insertAndRun({ tenantId, leadId, agentName, resposta, isAutonomous, now, log: req.log });

  req.log.info(
    { taskId: finalTask.id, status: finalTask.status, leadId, agentName, tokensUsed, isAutonomous },
    `${agentName}: process complete`
  );

  res.status(201).json({ task: finalTask, resposta, tokensUsed, isAutonomous });
}

// ═════════════════════════════════════════════════════════════════════════════
//  ROUTES
// ═════════════════════════════════════════════════════════════════════════════

router.post("/tenants/:tenantId/agents/sdr/process", (req, res) =>
  handleAgentProcess(req, res, "sdr", buildSdrPrompt)
);

router.post("/tenants/:tenantId/agents/closer/process", (req, res) =>
  handleAgentProcess(req, res, "closer", buildCloserPrompt)
);

router.post("/tenants/:tenantId/agents/followup/process", (req, res) =>
  handleAgentProcess(req, res, "followup", buildFollowupPrompt)
);

export default router;
