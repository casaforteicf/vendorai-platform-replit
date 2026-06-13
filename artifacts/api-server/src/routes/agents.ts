/**
 * AI Agent routes — 7 agents completos.
 *
 * POST /tenants/:tenantId/agents/sdr/process          — qualificação consultiva
 * POST /tenants/:tenantId/agents/closer/process        — fechamento / objeções
 * POST /tenants/:tenantId/agents/followup/process      — reativação suave de leads parados
 * POST /tenants/:tenantId/agents/reactivation/process  — reativação de alto churnRisk / inatividade severa
 * POST /tenants/:tenantId/agents/scheduler/process     — agendamento de reuniões (cria agendamento se dados forem enviados)
 * POST /tenants/:tenantId/agents/service/process       — suporte pós-venda
 * POST /tenants/:tenantId/agents/onboarding/process    — boas-vindas a novo cliente
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
  agendamentosTable,
} from "@workspace/db";
import type { AgentTask, Agendamento } from "@workspace/db";
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
  ok:                true;
  currentDaily:      number;
  currentMonthly:    number;
  needsDailyReset:   boolean;
  needsMonthlyReset: boolean;
};
type LimitExceeded = { ok: false; httpStatus: 429; body: object };
type LimitResult   = LimitOk | LimitExceeded;

type AgentName    = "sdr" | "closer" | "followup" | "reactivation" | "scheduler" | "service" | "onboarding";
type PromptBuilder = (customPrompt: string | undefined, ctx: AgentContext) => string;

const router: IRouter = Router();

// ── Shared body schema ────────────────────────────────────────────────────────
const processBodySchema = z.object({
  leadId:   z.string().min(1, "leadId is required"),
  mensagem: z.string().min(1, "mensagem is required"),
});

// ── Scheduler body extends with optional agendamento ─────────────────────────
const schedulerBodySchema = processBodySchema.extend({
  agendamento: z.object({
    tipo:           z.enum(["reuniao", "visita", "consulta", "instalacao"]).default("reuniao"),
    titulo:         z.string().optional(),
    dataHoraInicio: z.coerce.date(),
    dataHoraFim:    z.coerce.date(),
    local:          z.string().optional(),
    observacoes:    z.string().optional(),
  }).optional(),
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

async function loadContext(tenantId: string, leadId: string): Promise<AgentContext | null> {
  const [lead] = await db
    .select()
    .from(leadsTable)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

  if (!lead) return null;

  const [ci = null] = await db
    .select()
    .from(customerIntelligenceTable)
    .where(and(eq(customerIntelligenceTable.leadId, leadId), eq(customerIntelligenceTable.tenantId, tenantId)));

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
        .limit(10)
        .then((rows) => rows.reverse())
    : [];

  return { lead, ci, conversation, recentMessages };
}

function computeLimits(config: AgentConfig): LimitResult {
  const now = Date.now();

  const msSinceDaily   = config.messagesSentTodayResetAt ? now - new Date(config.messagesSentTodayResetAt).getTime() : Infinity;
  const msSinceMonthly = config.tokensResetAt            ? now - new Date(config.tokensResetAt).getTime()            : Infinity;

  const needsDailyReset   = msSinceDaily   >= 24 * 60 * 60 * 1000;
  const needsMonthlyReset = msSinceMonthly >= 30 * 24 * 60 * 60 * 1000;

  const currentDaily   = needsDailyReset   ? 0 : config.messagesSentToday;
  const currentMonthly = needsMonthlyReset ? 0 : config.tokensUsedCurrentMonth;

  if (currentDaily >= config.dailyMessageLimit) {
    return { ok: false, httpStatus: 429, body: { error: "Daily message limit reached", limit: config.dailyMessageLimit, sentToday: currentDaily } };
  }
  if (currentMonthly >= config.monthlyTokenLimit) {
    return { ok: false, httpStatus: 429, body: { error: "Monthly token limit reached", limit: config.monthlyTokenLimit, used: currentMonthly } };
  }

  return { ok: true, currentDaily, currentMonthly, needsDailyReset, needsMonthlyReset };
}

async function callOpenAI(messages: OpenAI.Chat.ChatCompletionMessageParam[]): Promise<{ resposta: string; tokensUsed: number }> {
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

async function updateCounters(config: AgentConfig, limits: LimitOk, tokensUsed: number, now: Date): Promise<void> {
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
  tenantId:     string;
  leadId:       string;
  agentName:    AgentName;
  actionType:   string;
  resposta:     string;
  extraPayload?: Record<string, unknown>;
  isAutonomous: boolean;
  now:          Date;
  log:          Request["log"];
}): Promise<AgentTask> {
  const { tenantId, leadId, agentName, actionType, resposta, extraPayload, isAutonomous, now, log } = params;

  const [task] = await db
    .insert(agentTasksTable)
    .values({
      tenantId,
      leadId,
      agentName,
      actionType,
      payload: { leadId, conteudo: resposta, agentName, canal: "whatsapp", ...extraPayload },
      status:  isAutonomous ? "executando" : "pendente_aprovacao",
      ...(isAutonomous && { executedAt: now }),
    })
    .returning();

  return isAutonomous ? executeTaskAction(task, log) : task;
}

/** Converte uma Message do DB para o formato esperado pela OpenAI. */
function msgToOpenAI(m: Message): OpenAI.Chat.ChatCompletionMessageParam {
  const role: "user" | "assistant" = m.direcao === "entrada" ? "user" : "assistant";
  return { role, content: m.conteudo };
}

// ── Helpers shared by prompt builders ────────────────────────────────────────
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

/** Número de dias desde a última mensagem na conversa */
function daysSinceLastContact(ctx: AgentContext): number | null {
  if (!ctx.conversation?.ultimaMensagemEm) return null;
  return Math.floor((Date.now() - new Date(ctx.conversation.ultimaMensagemEm).getTime()) / (1000 * 60 * 60 * 24));
}

// ═════════════════════════════════════════════════════════════════════════════
//  PROMPT BUILDERS
// ═════════════════════════════════════════════════════════════════════════════

// ── SDR ───────────────────────────────────────────────────────────────────────
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
  if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  parts.push(buildLeadSection(lead));
  if (ci) {
    const lines = ["## INTELIGÊNCIA DE CLIENTE"];
    if (ci.journeyStage)         lines.push(`Estágio: ${ci.journeyStage}`);
    if (ci.intentAnalysis)       lines.push(`Intenção: ${ci.intentAnalysis}`);
    if (ci.goalAnalysis)         lines.push(`Objetivo: ${ci.goalAnalysis}`);
    if (ci.nextBestAction)       lines.push(`Próxima ação: ${ci.nextBestAction}`);
    if (ci.nextBestActionReason) lines.push(`Motivo: ${ci.nextBestActionReason}`);
    if (lines.length > 1) parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

// ── Closer ────────────────────────────────────────────────────────────────────
function buildCloserPrompt(customPrompt: string | undefined, ctx: AgentContext): string {
  const { lead, ci } = ctx;
  const parts: string[] = [];
  parts.push(
    "Você é um Closer de vendas B2B especialista em SaaS.\n" +
    "Missão: remover objeções, criar clareza sobre valor e avançar para o fechamento do negócio.\n" +
    "Regras:\n" +
    "- Responda em português brasileiro, tom confiante mas empático\n" +
    "- Máximo 3 parágrafos curtos\n" +
    "- Reconheça a objeção, valide-a, apresente contra-argumento com evidência\n" +
    "- Se o lead estiver pronto, proponha o próximo passo concreto\n" +
    "- Nunca invente dados, desconto ou funcionalidades não confirmadas"
  );
  if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  parts.push(buildLeadSection(lead));
  if (ci) {
    const lines = ["## INTELIGÊNCIA DE CLIENTE (use para personalizar a abordagem)"];
    if (ci.journeyStage)   lines.push(`Estágio: ${ci.journeyStage}`);
    if (ci.intentAnalysis) lines.push(`Intenção: ${ci.intentAnalysis}`);
    if (ci.goalAnalysis)   lines.push(`Objetivo: ${ci.goalAnalysis}`);
    if (Array.isArray(ci.opportunities) && ci.opportunities.length > 0) {
      lines.push(`Oportunidades identificadas:\n${ci.opportunities.map((o) => `  - ${String(o)}`).join("\n")}`);
    }
    if (ci.churnRisk !== null && ci.churnRisk !== undefined) {
      lines.push(`Risco de churn: ${ci.churnRisk}%${ci.churnRisk >= 60 ? " ⚠️ ALTO — aborde as razões" : ""}`);
    }
    if (Array.isArray(ci.churnReasons) && ci.churnReasons.length > 0) {
      lines.push(`Razões de risco:\n${ci.churnReasons.map((r) => `  - ${String(r)}`).join("\n")}`);
    }
    if (ci.nextBestAction)       lines.push(`Próxima melhor ação: ${ci.nextBestAction}`);
    if (ci.nextBestActionReason) lines.push(`Motivo: ${ci.nextBestActionReason}`);
    if (lines.length > 1) parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

// ── Followup ──────────────────────────────────────────────────────────────────
function buildFollowupPrompt(customPrompt: string | undefined, ctx: AgentContext): string {
  const { lead, ci } = ctx;
  const dias = daysSinceLastContact(ctx);
  const parts: string[] = [];
  parts.push(
    "Você é um especialista em follow-up de vendas B2B.\n" +
    "Missão: retomar o contato com um lead que ficou sem resposta, de forma calorosa e não invasiva.\n" +
    "Regras:\n" +
    "- Responda em português brasileiro, tom leve e genuinamente prestativo\n" +
    "- Máximo 2 parágrafos curtos\n" +
    "- Não mencione diretamente que o lead sumiu — simplesmente retome a conversa\n" +
    "- Traga algo de valor: uma dúvida, uma novidade relevante, ou um convite gentil para continuar" +
    (dias !== null && dias > 0 ? `\n- Contexto: o lead está sem atividade há ${dias} dia${dias > 1 ? "s" : ""}` : "")
  );
  if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  parts.push(buildLeadSection(lead));
  if (ci) {
    const lines = ["## INTELIGÊNCIA DE CLIENTE"];
    if (ci.journeyStage)         lines.push(`Estágio: ${ci.journeyStage}`);
    if (ci.goalAnalysis)         lines.push(`Objetivo: ${ci.goalAnalysis}`);
    if (ci.nextBestAction)       lines.push(`Ação recomendada: ${ci.nextBestAction}`);
    if (ci.nextBestActionReason) lines.push(`Motivo: ${ci.nextBestActionReason}`);
    if (lines.length > 1) parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

// ── Reactivation ──────────────────────────────────────────────────────────────
function buildReactivationPrompt(customPrompt: string | undefined, ctx: AgentContext): string {
  const { lead, ci } = ctx;
  const dias = daysSinceLastContact(ctx);
  const parts: string[] = [];

  const churnAlert = ci?.churnRisk !== null && ci?.churnRisk !== undefined && ci.churnRisk >= 60
    ? `Atenção: este lead tem ${ci.churnRisk}% de risco de churn. As razões detectadas devem guiar sua abordagem — mas NÃO as mencione diretamente; use-as para construir uma proposta de valor genuína.`
    : "";

  parts.push(
    "Você é um especialista em reativação de clientes e leads B2B.\n" +
    "Missão: reconectar com um lead de alto risco ou com longa inatividade, com empatia, curiosidade genuína e uma proposta de valor renovada.\n" +
    "Regras:\n" +
    "- Responda em português brasileiro, tom humano, sem pressão\n" +
    "- Máximo 3 parágrafos curtos\n" +
    "- Não demonstre desespero nem urgência excessiva\n" +
    "- Reconheça implicitamente que o tempo passou e ofereça algo novo ou relevante\n" +
    "- Se houver oportunidade clara, sugira um próximo passo concreto e de baixo atrito" +
    (dias !== null && dias > 7 ? `\n- O lead está inativo há ${dias} dias` : "") +
    (churnAlert ? `\n- ${churnAlert}` : "")
  );
  if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  parts.push(buildLeadSection(lead));
  if (ci) {
    const lines = ["## INTELIGÊNCIA DE CLIENTE"];
    if (ci.journeyStage) lines.push(`Estágio: ${ci.journeyStage}`);
    if (ci.goalAnalysis) lines.push(`Objetivo original: ${ci.goalAnalysis}`);
    if (Array.isArray(ci.opportunities) && ci.opportunities.length > 0) {
      lines.push(`Oportunidades detectadas:\n${ci.opportunities.map((o) => `  - ${String(o)}`).join("\n")}`);
    }
    if (ci.churnRisk !== null && ci.churnRisk !== undefined) {
      lines.push(`Risco de churn: ${ci.churnRisk}%`);
    }
    if (Array.isArray(ci.churnReasons) && ci.churnReasons.length > 0) {
      lines.push(`Razões de risco (use para guiar sua proposta de valor):\n${ci.churnReasons.map((r) => `  - ${String(r)}`).join("\n")}`);
    }
    if (ci.nextBestAction)       lines.push(`Próxima melhor ação: ${ci.nextBestAction}`);
    if (ci.nextBestActionReason) lines.push(`Motivo: ${ci.nextBestActionReason}`);
    if (lines.length > 1) parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

// ── Scheduler ─────────────────────────────────────────────────────────────────
function buildSchedulerPrompt(
  customPrompt: string | undefined,
  ctx: AgentContext,
  agendamento?: { tipo: string; dataHoraInicio: Date; dataHoraFim: Date; local?: string }
): string {
  const { lead, ci } = ctx;
  const parts: string[] = [];

  const agendadoInfo = agendamento
    ? `Um agendamento já foi criado para ${agendamento.dataHoraInicio.toLocaleString("pt-BR")} ` +
      `(${agendamento.tipo}${agendamento.local ? ` — ${agendamento.local}` : ""}). Confirme os detalhes ao lead.`
    : "Nenhum horário foi definido ainda. Sugira ao lead um próximo passo para confirmar data e formato da reunião.";

  parts.push(
    "Você é um especialista em agendamento comercial B2B.\n" +
    "Missão: agendar ou confirmar uma reunião/visita com o lead de forma eficiente e profissional.\n" +
    "Regras:\n" +
    "- Responda em português brasileiro, tom profissional e objetivo\n" +
    "- Máximo 2 parágrafos curtos\n" +
    "- Seja claro sobre datas, horários e formato da reunião\n" +
    "- Se a reunião já estiver agendada, confirme os detalhes e mostre entusiasmo\n" +
    "- Se não houver horário definido, ofereça 2–3 opções concretas ou peça a disponibilidade do lead\n" +
    `- ${agendadoInfo}`
  );
  if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  parts.push(buildLeadSection(lead));
  if (ci?.nextBestAction) {
    parts.push(`## CONTEXTO\nPróxima ação recomendada: ${ci.nextBestAction}`);
  }
  return parts.join("\n\n");
}

// ── Service ───────────────────────────────────────────────────────────────────
function buildServicePrompt(customPrompt: string | undefined, ctx: AgentContext): string {
  const { lead, ci } = ctx;
  const parts: string[] = [];
  parts.push(
    "Você é um especialista em suporte e atendimento pós-venda B2B.\n" +
    "Missão: resolver dúvidas, problemas ou solicitações do cliente de forma rápida, clara e empática.\n" +
    "Regras:\n" +
    "- Responda em português brasileiro, tom prestativo e paciente\n" +
    "- Máximo 3 parágrafos curtos\n" +
    "- Confirme que entendeu o problema antes de propor a solução\n" +
    "- Se não souber a resposta, seja honesto e indique o próximo passo (escalação, consulta interna)\n" +
    "- Encerre sempre verificando se o cliente ficou satisfeito ou tem mais alguma dúvida"
  );
  if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  parts.push(buildLeadSection(lead));
  if (ci) {
    const lines = ["## CONTEXTO DO CLIENTE"];
    if (ci.journeyStage) lines.push(`Estágio: ${ci.journeyStage}`);
    if (ci.goalAnalysis) lines.push(`Objetivo do cliente: ${ci.goalAnalysis}`);
    if (ci.churnRisk !== null && ci.churnRisk !== undefined && ci.churnRisk >= 40) {
      lines.push(`⚠️ Risco de churn: ${ci.churnRisk}% — atendimento especialmente cuidadoso`);
    }
    if (ci.nextBestAction)       lines.push(`Ação recomendada: ${ci.nextBestAction}`);
    if (ci.nextBestActionReason) lines.push(`Motivo: ${ci.nextBestActionReason}`);
    if (lines.length > 1) parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

// ── Onboarding ────────────────────────────────────────────────────────────────
function buildOnboardingPrompt(customPrompt: string | undefined, ctx: AgentContext): string {
  const { lead, ci } = ctx;
  const parts: string[] = [];
  parts.push(
    "Você é um especialista em onboarding de novos clientes B2B SaaS.\n" +
    "Missão: dar as boas-vindas ao novo cliente, explicar os próximos passos e garantir que ele se sinta acolhido e confiante para começar.\n" +
    "Regras:\n" +
    "- Responda em português brasileiro, tom entusiasmado e acolhedor\n" +
    "- Máximo 3 parágrafos curtos\n" +
    "- Explique os próximos 1–3 passos de forma clara e sem jargões técnicos\n" +
    "- Mostre que você está disponível para ajudar durante toda a jornada\n" +
    "- Se souber o objetivo principal do cliente, conecte os próximos passos a esse objetivo"
  );
  if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  parts.push(buildLeadSection(lead));
  if (ci) {
    const lines = ["## CONTEXTO DO NOVO CLIENTE"];
    if (ci.goalAnalysis)         lines.push(`Objetivo principal: ${ci.goalAnalysis}`);
    if (ci.nextBestAction)       lines.push(`Primeiro passo recomendado: ${ci.nextBestAction}`);
    if (ci.nextBestActionReason) lines.push(`Motivo: ${ci.nextBestActionReason}`);
    if (lines.length > 1) parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

// ═════════════════════════════════════════════════════════════════════════════
//  CORE HANDLER (genérico para 6 dos 7 agentes)
// ═════════════════════════════════════════════════════════════════════════════

async function handleAgentProcess(
  req:         Request,
  res:         Response,
  agentName:   AgentName,
  buildPrompt: PromptBuilder
): Promise<void> {
  const { tenantId } = req.params as { tenantId: string };

  const parsed = processBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const { leadId, mensagem } = parsed.data;

  const [config] = await db.select().from(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenantId));
  if (!config) { res.status(404).json({ error: "Agent config not found for this tenant" }); return; }

  const agentCfg = config.agents?.[agentName];
  if (!agentCfg?.enabled) { res.status(422).json({ error: `Agent "${agentName}" is not enabled for this tenant` }); return; }

  const limits = computeLimits(config);
  if (!limits.ok) { res.status(limits.httpStatus).json(limits.body); return; }

  const ctx = await loadContext(tenantId, leadId);
  if (!ctx) { res.status(404).json({ error: `Lead "${leadId}" not found in this tenant` }); return; }

  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: buildPrompt(agentCfg.prompt, ctx) },
    ...ctx.recentMessages.map(msgToOpenAI),
    { role: "user" as const, content: mensagem },
  ];

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

  const now = new Date();
  await updateCounters(config, limits, tokensUsed, now);

  const isAutonomous = !!config.autonomyEnabledAt;
  const finalTask    = await insertAndRun({ tenantId, leadId, agentName, actionType: "enviar_whatsapp", resposta, isAutonomous, now, log: req.log });

  req.log.info({ taskId: finalTask.id, status: finalTask.status, leadId, agentName, tokensUsed, isAutonomous }, `${agentName}: process complete`);
  res.status(201).json({ task: finalTask, resposta, tokensUsed, isAutonomous });
}

// ═════════════════════════════════════════════════════════════════════════════
//  SCHEDULER — handler especializado (cria agendamento se dados forem enviados)
// ═════════════════════════════════════════════════════════════════════════════

async function handleSchedulerProcess(req: Request, res: Response): Promise<void> {
  const { tenantId } = req.params as { tenantId: string };

  const parsed = schedulerBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(422).json({ error: parsed.error.message });
    return;
  }
  const { leadId, mensagem, agendamento: agendamentoInput } = parsed.data;

  const [config] = await db.select().from(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenantId));
  if (!config) { res.status(404).json({ error: "Agent config not found for this tenant" }); return; }

  const agentCfg = config.agents?.scheduler;
  if (!agentCfg?.enabled) { res.status(422).json({ error: "Agent \"scheduler\" is not enabled for this tenant" }); return; }

  const limits = computeLimits(config);
  if (!limits.ok) { res.status(limits.httpStatus).json(limits.body); return; }

  const ctx = await loadContext(tenantId, leadId);
  if (!ctx) { res.status(404).json({ error: `Lead "${leadId}" not found in this tenant` }); return; }

  // Cria o agendamento na DB antes de chamar a IA (para incluir detalhes no prompt)
  let agendamentoCriado: Agendamento | null = null;
  if (agendamentoInput) {
    const titulo = agendamentoInput.titulo ?? `Reunião com ${ctx.lead.nome}`;
    const [ag] = await db
      .insert(agendamentosTable)
      .values({
        tenantId,
        leadId,
        tipo:           agendamentoInput.tipo,
        titulo,
        dataHoraInicio: agendamentoInput.dataHoraInicio,
        dataHoraFim:    agendamentoInput.dataHoraFim,
        local:          agendamentoInput.local,
        observacoes:    agendamentoInput.observacoes,
        status:         "agendado",
      })
      .returning();
    agendamentoCriado = ag;
    req.log.info({ agendamentoId: ag.id, leadId }, "scheduler: agendamento created");
  }

  const systemPrompt = buildSchedulerPrompt(
    agentCfg.prompt,
    ctx,
    agendamentoInput
      ? { tipo: agendamentoInput.tipo, dataHoraInicio: agendamentoInput.dataHoraInicio, dataHoraFim: agendamentoInput.dataHoraFim, local: agendamentoInput.local }
      : undefined
  );

  const openaiMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...ctx.recentMessages.map(msgToOpenAI),
    { role: "user" as const, content: mensagem },
  ];

  let resposta: string;
  let tokensUsed: number;
  try {
    ({ resposta, tokensUsed } = await callOpenAI(openaiMessages));
    req.log.info({ leadId, tokensUsed }, "scheduler: openai call succeeded");
  } catch (err) {
    req.log.error({ err, leadId }, "scheduler: openai call failed");
    res.status(502).json({ error: "AI service unavailable. Please try again later." });
    return;
  }

  const now = new Date();
  await updateCounters(config, limits, tokensUsed, now);

  const isAutonomous = !!config.autonomyEnabledAt;
  const finalTask    = await insertAndRun({
    tenantId, leadId, agentName: "scheduler", actionType: "enviar_whatsapp", resposta, isAutonomous, now, log: req.log,
    ...(agendamentoCriado && { extraPayload: { agendamentoId: agendamentoCriado.id } }),
  });

  req.log.info({ taskId: finalTask.id, status: finalTask.status, leadId, tokensUsed, isAutonomous }, "scheduler: process complete");
  res.status(201).json({ task: finalTask, resposta, tokensUsed, isAutonomous, agendamento: agendamentoCriado ?? undefined });
}

// ═════════════════════════════════════════════════════════════════════════════
//  ROUTES
// ═════════════════════════════════════════════════════════════════════════════

router.post("/tenants/:tenantId/agents/sdr/process",         (req, res) => handleAgentProcess(req, res, "sdr",         buildSdrPrompt));
router.post("/tenants/:tenantId/agents/closer/process",      (req, res) => handleAgentProcess(req, res, "closer",      buildCloserPrompt));
router.post("/tenants/:tenantId/agents/followup/process",    (req, res) => handleAgentProcess(req, res, "followup",    buildFollowupPrompt));
router.post("/tenants/:tenantId/agents/reactivation/process",(req, res) => handleAgentProcess(req, res, "reactivation",buildReactivationPrompt));
router.post("/tenants/:tenantId/agents/service/process",     (req, res) => handleAgentProcess(req, res, "service",     buildServicePrompt));
router.post("/tenants/:tenantId/agents/onboarding/process",  (req, res) => handleAgentProcess(req, res, "onboarding",  buildOnboardingPrompt));
router.post("/tenants/:tenantId/agents/scheduler/process",   handleSchedulerProcess);

export default router;
