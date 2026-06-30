/**
 * Shared AI agent engine — types, context loading, limit checking,
 * OpenAI calls, counter updates, task insertion, and all 7 prompt builders.
 *
 * Imported by:
 *   - routes/agents.ts        (HTTP route handlers)
 *   - services/agent-dispatch.ts  (internal dispatch from webhook + scheduler)
 */
import { and, desc, eq } from "drizzle-orm";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { Logger } from "pino";
import {
  db,
  leadsTable,
  conversationsTable,
  messagesTable,
  customerIntelligenceTable,
  agentConfigsTable,
  agentTasksTable,
  tenantsTable,
  produtosCatalogoTable,
  tenantAgentConfigsTable,
  agentDefaultsTable,
} from "@workspace/db";
import type { AgentTask, AiFeature } from "@workspace/db";
import { executeTaskAction } from "../routes/agent_tasks.js";
import { callOpenAI as gatewayCallOpenAI, callAnthropic as gatewayCallAnthropic } from "./ai-gateway.js";

// ── Types ─────────────────────────────────────────────────────────────────────
type Lead         = typeof leadsTable.$inferSelect;
type CI           = typeof customerIntelligenceTable.$inferSelect;
type Conversation = typeof conversationsTable.$inferSelect;
type Message      = typeof messagesTable.$inferSelect;
type AgentConfig  = typeof agentConfigsTable.$inferSelect;

export type AgentContext = {
  lead:           Lead;
  ci:             CI | null;
  conversation:   Conversation | null;
  recentMessages: Message[];
};

export type LimitOk = {
  ok:                true;
  currentDaily:      number;
  currentMonthly:    number;
  needsDailyReset:   boolean;
  needsMonthlyReset: boolean;
};
type LimitExceeded = { ok: false; httpStatus: 429; body: object };
export type LimitResult = LimitOk | LimitExceeded;

export type AgentName    = "sdr" | "closer" | "followup" | "reactivation" | "scheduler" | "service" | "onboarding" | "relacionamento";
export type PromptBuilder = (customPrompt: string | undefined, ctx: AgentContext, scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null) => string;

export type RelacionamentoScenario = {
  type: "birthday_lead" | "birthday_family" | "deal_anniversary" | "commercial_date" | "spouse_welcome";
  dateName?: string;
  recipientName?: string;
  recipientRelation?: string;
  referrerName?: string;
  spouseName?: string;
  catalog?: Array<{ nome: string; categoria?: string | null; precoBase: string | null }>;
} | null;

const AGENT_FEATURE_MAP: Record<AgentName, AiFeature> = {
  sdr: "agent_sdr",
  closer: "agent_closer",
  followup: "agent_followup",
  reactivation: "agent_reactivation",
  scheduler: "agent_scheduler",
  service: "agent_service",
  onboarding: "agent_onboarding",
  relacionamento: "agent_relacionamento",
};

// ── Agent config resolution (new DB-driven system) ───────────────────────────

export type ResolvedAgentConfig = {
  systemPrompt: string;
  parametros: Record<string, unknown>;
  tom: string;
  restricoes: string | null;
  knowledgeBaseIds: string[];
};

/** Maps legacy AgentName → new agentKey in tenant_agent_configs / agent_defaults */
export const AGENT_NAME_TO_KEY: Partial<Record<AgentName, string>> = {
  sdr:          "sdr",
  closer:       "closer",
  followup:     "sdr",
  reactivation: "sdr",
  scheduler:    "agendamento",
  service:      "suporte",
  onboarding:   "suporte",
  relacionamento: "pos_venda",
};

const TOM_INSTRUCTIONS: Record<string, string> = {
  profissional: "Mantenha tom formal e objetivo.",
  amigavel:     "Use linguagem descontraída e próxima.",
  tecnico:      "Seja preciso e técnico nas respostas.",
  vendedor:     "Foque em gerar interesse e avançar na venda.",
  neutro:       "",
};

/**
 * Resolves the agent system prompt for a tenant:
 * 1. Looks up tenant_agent_configs (tenant-specific override)
 * 2. Falls back to agent_defaults (platform defaults)
 * 3. Applies tom instruction + restricoes
 * Throws {code: "AGENT_NOT_CONFIGURED"} if the agent is explicitly disabled for this tenant.
 * Returns null if no config exists at all (caller may use hardcoded fallback).
 */
export async function getAgentConfig(tenantId: string, agentKey: string): Promise<ResolvedAgentConfig | null> {
  const [tenantCfg] = await db
    .select()
    .from(tenantAgentConfigsTable)
    .where(and(
      eq(tenantAgentConfigsTable.tenantId, tenantId),
      eq(tenantAgentConfigsTable.agentKey, agentKey),
    ))
    .limit(1);

  if (tenantCfg && !tenantCfg.ativo) {
    const err = new Error("Agente desativado para este tenant") as Error & { code: string };
    err.code = "AGENT_NOT_CONFIGURED";
    throw err;
  }

  const [defaults] = await db
    .select()
    .from(agentDefaultsTable)
    .where(eq(agentDefaultsTable.agentKey, agentKey))
    .limit(1);

  const basePrompt = tenantCfg?.systemPromptCustom || defaults?.systemPromptBase;
  if (!basePrompt) return null;

  const tom = tenantCfg?.tom ?? "profissional";
  const restricoes = tenantCfg?.restricoes ?? null;

  const parts: string[] = [basePrompt];
  const tomInstruction = TOM_INSTRUCTIONS[tom];
  if (tomInstruction) parts.push(tomInstruction);
  if (restricoes?.trim()) parts.push(`RESTRIÇÕES: ${restricoes.trim()}`);

  return {
    systemPrompt:    parts.join("\n\n"),
    parametros:      ((tenantCfg?.parametros ?? defaults?.parametrosBase ?? {}) as Record<string, unknown>),
    tom,
    restricoes,
    knowledgeBaseIds: ((tenantCfg?.knowledgeBaseIds ?? []) as string[]),
  };
}

// ── OpenAI client (lazy) — kept for backward compat, migrate to gateway ──────
export function getOpenAI(): OpenAI {
  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is not set");
  return new OpenAI({ apiKey });
}

export async function getOpenAIForTenant(tenantId: string): Promise<OpenAI> {
  const [tenant] = await db
    .select({ openaiApiKeyEncrypted: tenantsTable.openaiApiKeyEncrypted, openaiKeyStatus: tenantsTable.openaiKeyStatus })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (tenant?.openaiApiKeyEncrypted && tenant.openaiKeyStatus === "ativo") {
    try {
      const { decrypt } = await import("./crypto.js");
      const apiKey = decrypt(tenant.openaiApiKeyEncrypted);
      return new OpenAI({ apiKey });
    } catch {
      // Fallback to global key
    }
  }

  const apiKey = process.env["OPENAI_API_KEY"];
  if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is not set");
  return new OpenAI({ apiKey });
}

// ── Anthropic client (lazy) — kept for backward compat ──────────────
export function getAnthropic(): Anthropic {
  const apiKey = process.env["ANTHROPIC_API_KEY"];
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
  return new Anthropic({ apiKey });
}

// ── Context loader ────────────────────────────────────────────────────────────
export async function loadContext(tenantId: string, leadId: string): Promise<AgentContext | null> {
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

// ── Limit checker ─────────────────────────────────────────────────────────────
export function computeLimits(config: AgentConfig): LimitResult {
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

// ── OpenAI call ───────────────────────────────────────────────────────────────
export async function callOpenAI(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  tenantId?: string,
  agentName?: AgentName,
  log?: Logger
): Promise<{ resposta: string; tokensUsed: number }> {
  if (tenantId && agentName) {
    const feature = AGENT_FEATURE_MAP[agentName];
    const { content, inputTokens, outputTokens } = await gatewayCallOpenAI(
      tenantId,
      feature,
      messages,
      { model: "gpt-4o-mini", temperature: 0.7, maxTokens: 600, log }
    );
    return { resposta: content, tokensUsed: inputTokens + outputTokens };
  }

  // Fallback: direct call (for non-tenant contexts or until full migration)
  const openai = tenantId ? await getOpenAIForTenant(tenantId) : getOpenAI();
  const completion = await openai.chat.completions.create({
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

// ── Counter updater ───────────────────────────────────────────────────────────
export async function updateCounters(config: AgentConfig, limits: LimitOk, tokensUsed: number, now: Date): Promise<void> {
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

// ── Task inserter + executor ───────────────────────────────────────────────────
export async function insertAndRun(params: {
  tenantId:      string;
  leadId:        string;
  agentName:     AgentName;
  actionType:    string;
  resposta:      string;
  extraPayload?: Record<string, unknown>;
  isAutonomous:  boolean;
  now:           Date;
  log:           Logger;
}): Promise<AgentTask> {
  const { tenantId, leadId, agentName, actionType, resposta, extraPayload, isAutonomous, now, log } = params;

  const [task] = await db
    .insert(agentTasksTable)
    .values({
      tenantId,
      leadId,
      agentName,
      actionType,
      payload: { leadId, conteudo: resposta, agentName, agentKey: AGENT_NAME_TO_KEY[agentName] ?? null, canal: "whatsapp", ...extraPayload },
      status:  isAutonomous ? "executando" : "pendente_aprovacao",
      ...(isAutonomous && { executedAt: now }),
    })
    .returning();

  return isAutonomous ? executeTaskAction(task, log) : task;
}

// ── Message → OpenAI format ───────────────────────────────────────────────────
export function msgToOpenAI(m: Message): OpenAI.Chat.ChatCompletionMessageParam {
  const role: "user" | "assistant" = m.direcao === "entrada" ? "user" : "assistant";
  return { role, content: m.conteudo };
}

// ── Lead section builder ───────────────────────────────────────────────────────
export function buildLeadSection(lead: Lead): string {
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

// ── Days since last contact ───────────────────────────────────────────────────
export function daysSinceLastContact(ctx: AgentContext): number | null {
  if (!ctx.conversation?.ultimaMensagemEm) return null;
  return Math.floor((Date.now() - new Date(ctx.conversation.ultimaMensagemEm).getTime()) / (1000 * 60 * 60 * 24));
}

// ═════════════════════════════════════════════════════════════════════════════
//  PROMPT BUILDERS
// ═════════════════════════════════════════════════════════════════════════════

export function buildSdrPrompt(customPrompt: string | undefined, ctx: AgentContext, _scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null): string {
  const { lead, ci } = ctx;
  const parts: string[] = [];
  if (systemPromptOverride?.trim()) {
    parts.push(systemPromptOverride.trim());
  } else {
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
  }
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

export function buildCloserPrompt(customPrompt: string | undefined, ctx: AgentContext, scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null): string {
  const { lead, ci } = ctx;
  const parts: string[] = [];
  if (systemPromptOverride?.trim()) {
    parts.push(systemPromptOverride.trim());
  } else {
    parts.push(
      "Você é um Closer de vendas B2B especialista em SaaS.\n" +
      "Missão: remover objeções, criar clareza sobre valor e avançar para o fechamento do negócio.\n" +
      "Regras:\n" +
      "- Responda em português brasileiro, tom confiante mas empático\n" +
      "- Máximo 3 parágrafos curtos\n" +
      "- Reconheça a objeção, valide-a, apresente contra-argumento com evidência\n" +
      "- Se o lead estiver pronto, proponha o próximo passo concreto\n" +
      "- Nunca invente dados, desconto ou funcionalidades não confirmadas\n" +
      "- DETECÇÃO DE ACEITE: Se o lead disser algo como 'aceito', 'vamos em frente', 'fechado', 'pode fechar', 'tá bom', 'vamos nessa', 'quero sim', 'vamos fechar', 'confirmo', 'topa', 'está certo', 'aceito a proposta', 'tá aprovado', 'pode seguir' — ou qualquer variação clara de aceite da proposta/orçamento, você deve retornar EXATAMENTE a ação especial: `{{action:proposal_accept}}` (apenas isso, sem texto adicional).\n" +
      "- Se a resposta for ambígua (ex: 'quero saber mais', 'pensei em aceitar', 'talvez', 'vou ver', 'me explica melhor'), NÃO use proposal_accept — continue a conversa normalmente pedindo confirmação explícita.\n" +
      "- Se a resposta for claramente NÃO (ex: 'não quero', 'desisto', 'muito caro', 'não vou seguir'), não use proposal_accept — responda normalmente."
    );
    if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  }

  // Product presentation scenario
  if (scenario?.type === "product_presentation") {
    const s = scenario as { type: "product_presentation"; productName: string; features?: string[]; price?: string; brand?: string };
    parts.push(`## APRESENTAÇÃO DE PRODUTO\nVocê está apresentando o produto: ${s.productName}.\n` +
      `${s.brand ? `Marca: ${s.brand}\n` : ""}` +
      `${s.price ? `Preço: ${s.price}\n` : ""}` +
      `${s.features?.length ? `Características principais:\n${s.features.map((f) => `  - ${f}`).join("\n")}` : ""}\n` +
      `Foque nas vantagens relevantes para o perfil do lead e encaminhe para a conversa no WhatsApp.`);
  }

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

export function buildFollowupPrompt(customPrompt: string | undefined, ctx: AgentContext, _scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null): string {
  const { lead, ci } = ctx;
  const dias = daysSinceLastContact(ctx);
  const isPrimeiroContato = !ctx.conversation && ctx.recentMessages.length === 0;
  const parts: string[] = [];

  if (systemPromptOverride?.trim()) {
    parts.push(systemPromptOverride.trim());
  } else if (isPrimeiroContato) {
    parts.push(
      "Você é um especialista em primeiro contato comercial B2B.\n" +
      "Missão: apresentar-se de forma calorosa, colocar-se à disposição e despertar interesse genuíno — sem pressão.\n" +
      "Regras:\n" +
      "- Responda em português brasileiro, tom acolhedor e genuinamente prestativo\n" +
      "- Máximo 2 parágrafos curtos\n" +
      "- É o PRIMEIRO contato: NÃO mencione 'nossa última interação', 'tempo que passou' ou qualquer referência a conversa anterior\n" +
      "- Diga que está feliz em poder atender e que está à disposição\n" +
      "- Mencione, de forma natural, que sabe da busca do lead e que pode apoiar nessa jornada\n" +
      "- Encerre perguntando se há algo específico que faça mais sentido abordar agora\n" +
      "- Seja breve, humano e deixe espaço para o lead responder"
    );
    if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  } else {
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
  }
  parts.push(buildLeadSection(lead));
  if (ci) {
    const lines = ["## INTELIGÊNCIA DE CLIENTE"];
    if (ci.journeyStage)         lines.push(`Estágio: ${ci.journeyStage}`);
    if (ci.intentAnalysis)       lines.push(`Intenção de busca: ${ci.intentAnalysis}`);
    if (ci.goalAnalysis)         lines.push(`Objetivo: ${ci.goalAnalysis}`);
    if (ci.nextBestAction)       lines.push(`Ação recomendada: ${ci.nextBestAction}`);
    if (ci.nextBestActionReason) lines.push(`Motivo: ${ci.nextBestActionReason}`);
    if (lines.length > 1) parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

export function buildReactivationPrompt(customPrompt: string | undefined, ctx: AgentContext, _scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null): string {
  const { lead, ci } = ctx;
  const dias = daysSinceLastContact(ctx);
  const isPrimeiroContato = !ctx.conversation && ctx.recentMessages.length === 0;

  const churnAlert = !isPrimeiroContato && ci?.churnRisk !== null && ci?.churnRisk !== undefined && ci.churnRisk >= 60
    ? `Atenção: este lead tem ${ci.churnRisk}% de risco de churn. As razões detectadas devem guiar sua abordagem — mas NÃO as mencione diretamente; use-as para construir uma proposta de valor genuína.`
    : "";

  const parts: string[] = [];

  if (systemPromptOverride?.trim()) {
    parts.push(systemPromptOverride.trim());
  } else if (isPrimeiroContato) {
    parts.push(
      "Você é um especialista em primeiro contato comercial B2B.\n" +
      "Missão: apresentar-se de forma calorosa, colocar-se à disposição e despertar interesse genuíno — sem pressão.\n" +
      "Regras:\n" +
      "- Responda em português brasileiro, tom acolhedor e genuinamente prestativo\n" +
      "- Máximo 2 parágrafos curtos\n" +
      "- É o PRIMEIRO contato: NÃO mencione 'nossa última interação', 'tempo que passou' ou qualquer referência a conversa anterior\n" +
      "- Diga que está feliz em poder atender e que está à disposição\n" +
      "- Mencione, de forma natural, que sabe da busca do lead e que pode apoiar nessa jornada\n" +
      "- Encerre perguntando se há algo específico que faça mais sentido abordar agora\n" +
      "- Seja breve, humano e deixe espaço para o lead responder"
    );
    if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  } else {
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
  }
  parts.push(buildLeadSection(lead));
  if (ci) {
    const lines = ["## INTELIGÊNCIA DE CLIENTE"];
    if (ci.journeyStage)         lines.push(`Estágio: ${ci.journeyStage}`);
    if (ci.intentAnalysis)       lines.push(`Intenção de busca: ${ci.intentAnalysis}`);
    if (ci.goalAnalysis)         lines.push(isPrimeiroContato ? `O que está buscando: ${ci.goalAnalysis}` : `Objetivo original: ${ci.goalAnalysis}`);
    if (!isPrimeiroContato && Array.isArray(ci.opportunities) && ci.opportunities.length > 0) {
      lines.push(`Oportunidades detectadas:\n${ci.opportunities.map((o) => `  - ${String(o)}`).join("\n")}`);
    }
    if (!isPrimeiroContato && ci.churnRisk !== null && ci.churnRisk !== undefined) {
      lines.push(`Risco de churn: ${ci.churnRisk}%`);
    }
    if (!isPrimeiroContato && Array.isArray(ci.churnReasons) && ci.churnReasons.length > 0) {
      lines.push(`Razões de risco (use para guiar sua proposta de valor):\n${ci.churnReasons.map((r) => `  - ${String(r)}`).join("\n")}`);
    }
    if (ci.nextBestAction)       lines.push(`Próxima melhor ação: ${ci.nextBestAction}`);
    if (ci.nextBestActionReason) lines.push(`Motivo: ${ci.nextBestActionReason}`);
    if (lines.length > 1) parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

export function buildSchedulerPrompt(
  customPrompt: string | undefined,
  ctx: AgentContext,
  agendamento?: { tipo: string; dataHoraInicio: Date; dataHoraFim: Date; local?: string; meetLink?: string | null },
  systemPromptOverride?: string | null
): string {
  const { lead, ci } = ctx;

  const meetInfo = agendamento?.meetLink
    ? ` Um link Google Meet foi gerado para esta reunião: ${agendamento.meetLink} — INCLUA ESTE LINK NA MENSAGEM ao lead.`
    : "";

  const agendadoInfo = agendamento
    ? `Um agendamento já foi criado para ${agendamento.dataHoraInicio.toLocaleString("pt-BR")} ` +
      `(${agendamento.tipo}${agendamento.local ? ` — ${agendamento.local}` : ""}).${meetInfo} Confirme os detalhes ao lead.`
    : "Nenhum horário foi definido ainda. Sugira ao lead um próximo passo para confirmar data e formato da reunião.";

  const parts: string[] = [];
  if (systemPromptOverride?.trim()) {
    parts.push(systemPromptOverride.trim() + `\n\n${agendadoInfo}`);
  } else {
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
  }
  parts.push(buildLeadSection(lead));
  if (ci?.nextBestAction) {
    parts.push(`## CONTEXTO\nPróxima ação recomendada: ${ci.nextBestAction}`);
  }
  return parts.join("\n\n");
}

export function buildServicePrompt(customPrompt: string | undefined, ctx: AgentContext, _scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null): string {
  const { lead, ci } = ctx;
  const parts: string[] = [];
  if (systemPromptOverride?.trim()) {
    parts.push(systemPromptOverride.trim());
  } else {
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
  }
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

export function buildOnboardingPrompt(customPrompt: string | undefined, ctx: AgentContext, _scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null): string {
  const { lead, ci } = ctx;
  const parts: string[] = [];
  if (systemPromptOverride?.trim()) {
    parts.push(systemPromptOverride.trim());
  } else {
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
  }
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

export function buildRelacionamentoPrompt(
  customPrompt: string | undefined,
  ctx: AgentContext,
  scenario?: Record<string, unknown> | null,
  systemPromptOverride?: string | null
): string {
  const s = scenario as RelacionamentoScenario | undefined;
  const { lead, ci } = ctx;
  const parts: string[] = [];

  const isPersonal = s?.type === "birthday_lead" || s?.type === "birthday_family" || s?.type === "deal_anniversary" || s?.type === "spouse_welcome";
  const isCommercial = s?.type === "commercial_date";

  if (systemPromptOverride?.trim()) {
    parts.push(systemPromptOverride.trim());
  } else if (isPersonal) {
    parts.push(
      "Você é um especialista em relacionamento e fidelização de clientes.\n" +
      "Missão: enviar uma mensagem calorosa e personalizada por uma data especial do lead ou de sua família.\n" +
      "Regras:\n" +
      "- Responda em português brasileiro, tom afetivo, caloroso e genuinamente prestativo\n" +
      "- Máximo 2 parágrafos curtos\n" +
      "- NÃO seja comercial demais — a prioridade é demonstrar que você se lembra e se importa\n" +
      "- Se houver produtos relevantes no catálogo, sugira de forma leve, sem pressão\n" +
      "- NUNCA invente preços ou produtos que não estejam no catálogo fornecido"
    );
    if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  } else if (isCommercial) {
    parts.push(
      "Você é um especialista em campanhas de datas comerciais.\n" +
      "Missão: enviar uma mensagem relevante sobre uma data comercial (Páscoa, Dia das Mães, Black Friday, etc.) conectando-a ao catálogo do tenant.\n" +
      "Regras:\n" +
      "- Responda em português brasileiro, tom comercial mas empático\n" +
      "- Máximo 2 parágrafos curtos\n" +
      "- Conecte a data comercial a produtos relevantes do catálogo\n" +
      "- Seja claro sobre a promoção ou sugestão, mas sem pressão excessiva\n" +
      "- NUNCA invente preços, descontos ou produtos que não estejam no catálogo"
    );
    if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  } else {
    parts.push(
      "Você é um especialista em relacionamento e fidelização de clientes.\n" +
      "Missão: manter o relacionamento com o lead através de contatos relevantes e personalizados.\n" +
      "Regras:\n" +
      "- Responda em português brasileiro, tom caloroso e genuinamente prestativo\n" +
      "- Máximo 2 parágrafos curtos\n" +
      "- NUNCA invente preços ou produtos que não estejam no catálogo fornecido"
    );
    if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  }

  // Lead profile
  const lines = ["## PERFIL DO LEAD"];
  lines.push(`Nome: ${lead.nome}`);
  if (lead.empresa) lines.push(`Empresa: ${lead.empresa}`);
  if (lead.dataNascimento) lines.push(`Data de nascimento: ${lead.dataNascimento}`);
  if (lead.estadoCivil) lines.push(`Estado civil: ${lead.estadoCivil}`);
  if (lead.conjugeNome) lines.push(`Cônjuge: ${lead.conjugeNome}`);
  if (lead.conjugeDataNascimento) lines.push(`Aniversário do cônjuge: ${lead.conjugeDataNascimento}`);
  if (lead.filhos && lead.filhos.length > 0) {
    lines.push(`Filhos:`);
    for (const f of lead.filhos) {
      lines.push(`  - ${f.nome}${f.dataNascimento ? ` (nasc. ${f.dataNascimento})` : ""}${f.genero ? ` [${f.genero}]` : ""}`);
    }
  }
  parts.push(lines.join("\n"));

  if (ci) {
    const ciLines = ["## INTELIGÊNCIA DE CLIENTE"];
    if (ci.journeyStage) ciLines.push(`Estágio: ${ci.journeyStage}`);
    if (ci.intentAnalysis) ciLines.push(`Intenção: ${ci.intentAnalysis}`);
    if (ci.goalAnalysis) ciLines.push(`Objetivo: ${ci.goalAnalysis}`);
    if (ci.nextBestAction) ciLines.push(`Próxima ação: ${ci.nextBestAction}`);
    if (ciLines.length > 1) parts.push(ciLines.join("\n"));
  }

  // Scenario context
  if (s) {
    const scLines = ["## CENÁRIO ATUAL"];
    if (s.type === "birthday_lead") scLines.push("Hoje é o aniversário do lead!");
    else if (s.type === "birthday_family") scLines.push(`Hoje é o aniversário de ${s.recipientName ?? "familiar"} (${s.recipientRelation ?? "familiar"}) do lead.`);
    else if (s.type === "deal_anniversary") scLines.push("Hoje é o aniversário de fechamento do deal com o lead!");
    else if (s.type === "commercial_date") scLines.push(`Data comercial: ${s.dateName ?? "data especial"}.`);
    else if (s.type === "spouse_welcome") scLines.push(`Este lead é o cônjuge de ${s.referrerName ?? "um cliente"}. Envie uma mensagem de boas-vindas transparente, mencionando que ${s.referrerName ?? "seu cônjuge"} compartilhou o contato.`);
    parts.push(scLines.join("\n"));
  }

  // Catalog
  if (s?.catalog && s.catalog.length > 0) {
    const catLines = ["## CATÁLOGO DO TENANT (use para sugerir produtos relevantes)"];
    for (const p of s.catalog) {
      catLines.push(`- ${p.nome}${p.categoria ? ` (${p.categoria})` : ""}${p.precoBase ? ` — R$ ${p.precoBase}` : ""}`);
    }
    parts.push(catLines.join("\n"));
  }

  return parts.join("\n\n");
}

// ── Prompt builder map ────────────────────────────────────────────────────────
export const PROMPT_BUILDERS: Record<AgentName, PromptBuilder> = {
  sdr:         buildSdrPrompt,
  closer:      buildCloserPrompt,
  followup:    buildFollowupPrompt,
  reactivation: buildReactivationPrompt,
  scheduler:   buildSchedulerPrompt,
  service:     buildServicePrompt,
  onboarding:  buildOnboardingPrompt,
  relacionamento: buildRelacionamentoPrompt,
};
