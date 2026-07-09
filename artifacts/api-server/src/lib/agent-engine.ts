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

export type AgentName    = "sdr" | "closer" | "followup" | "reactivation" | "scheduler" | "service" | "onboarding" | "relacionamento" | "financeiro" | "cobranca";
export type PromptBuilder = (customPrompt: string | undefined, ctx: AgentContext, scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null) => string;

export type RelacionamentoScenario = {
  type: "birthday_lead" | "birthday_family" | "deal_anniversary" | "commercial_date" | "spouse_welcome" | "inactivity_checkin";
  dateName?: string;
  recipientName?: string;
  recipientRelation?: string;
  referrerName?: string;
  spouseName?: string;
  daysInactive?: number;
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
  financeiro: "agent_financeiro",
  cobranca: "agent_cobranca",
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
  financeiro:   "financeiro",
  cobranca:     "cobranca",
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

  // ── Inject available attachments section ────────────────────────────────────
  const resolvedParametros = (tenantCfg?.parametros ?? defaults?.parametrosBase ?? {}) as Record<string, unknown>;
  const availableAttachments = Array.isArray(resolvedParametros["attachments"])
    ? (resolvedParametros["attachments"] as Array<{ name: string }>).filter((a) => a?.name)
    : [];

  if (availableAttachments.length > 0) {
    const fileList = availableAttachments.map((a) => `- ${a.name}`).join("\n");
    parts.push(
      `ARQUIVOS DISPONÍVEIS PARA ENVIO:\n` +
      `Quando achar adequado ao contexto do lead, você pode enviar um arquivo. ` +
      `Para isso, inclua exatamente o seguinte marcador no início ou fim da sua mensagem (fora do texto principal):\n` +
      `[[ENVIAR_ARQUIVO:nome_exato_do_arquivo]]\n\n` +
      `Arquivos disponíveis:\n${fileList}\n\n` +
      `Use o nome exato como listado acima. Envie apenas um arquivo por mensagem e somente quando agregar valor ao lead.`
    );
  }

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
  if (lead.iaAtiva === false) return null;

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

  // ── Parse [[ENVIAR_ARQUIVO:...]] marker from AI response ────────────────────
  const ATTACHMENT_RE = /\[\[ENVIAR_ARQUIVO:([^\]]+)\]\]/g;
  let conteudo = resposta;
  const attachmentNames: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = ATTACHMENT_RE.exec(resposta)) !== null) {
    attachmentNames.push(match[1]!.trim());
  }
  if (attachmentNames.length > 0) {
    conteudo = resposta.replace(/\[\[ENVIAR_ARQUIVO:[^\]]+\]\]/g, "").trim();
    log.info({ agentName, attachmentNames }, "agent_engine: attachment markers found in response");
  }

  const agentKey = AGENT_NAME_TO_KEY[agentName] ?? null;

  const [task] = await db
    .insert(agentTasksTable)
    .values({
      tenantId,
      leadId,
      agentName,
      actionType,
      payload: {
        leadId,
        conteudo,
        agentName,
        agentKey,
        ...(attachmentNames.length > 0 ? { attachmentNames } : {}),
        canal: "whatsapp",
        ...extraPayload,
      },
      status:  isAutonomous ? "executando" : "pendente_aprovacao",
      ...(isAutonomous && { executedAt: now }),
    })
    .returning();

  return isAutonomous ? executeTaskAction(task, log) : task;
}

// ── Handoff proativo: fechamento → onboarding ──────────────────────────────────
// Chamado após proposalAccepted() fechar um deal com sucesso. Em vez de esperar
// o lead escrever de novo (fluxo reativo), dispara imediatamente a mensagem de
// boas-vindas do agente de onboarding pelo mesmo mecanismo de agent_task usado
// nos demais agentes (respeita enabled/limits/autonomyEnabledAt do tenant).
export async function triggerOnboardingHandoff(params: {
  tenantId:     string;
  leadId:       string;
  dealId:       string;
  extraPayload?: Record<string, unknown>;
  log:          Logger;
}): Promise<AgentTask | null> {
  const { tenantId, leadId, dealId, extraPayload, log } = params;

  const [config] = await db.select().from(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenantId));
  if (!config) {
    log.info({ tenantId, dealId }, "triggerOnboardingHandoff: no agent config, skipping");
    return null;
  }

  const agentCfg = config.agents?.onboarding;
  if (!agentCfg?.enabled) {
    log.info({ tenantId, dealId }, "triggerOnboardingHandoff: onboarding agent not enabled, skipping");
    return null;
  }

  const limits = computeLimits(config);
  if (!limits.ok) {
    log.warn({ tenantId, dealId }, "triggerOnboardingHandoff: agent limits reached, skipping proactive welcome");
    return null;
  }

  const [lead] = await db.select({ nome: leadsTable.nome }).from(leadsTable).where(eq(leadsTable.id, leadId));
  if (!lead) {
    log.warn({ tenantId, dealId, leadId }, "triggerOnboardingHandoff: lead not found, skipping");
    return null;
  }

  const primeiroNome = (lead.nome ?? "").trim().split(/\s+/)[0] || undefined;
  const resposta = `Oi${primeiroNome ? `, ${primeiroNome}` : ""}! 🎉 Que ótimo ter você com a gente! Sua contratação foi confirmada e já estamos preparando os próximos passos para o seu onboarding. Em breve trazemos todos os detalhes por aqui — qualquer dúvida, é só responder essa mensagem!`;

  const now = new Date();
  await updateCounters(config, limits, 0, now);

  const isAutonomous = !!config.autonomyEnabledAt;
  const task = await insertAndRun({
    tenantId,
    leadId,
    agentName: "onboarding",
    actionType: "enviar_whatsapp",
    resposta,
    extraPayload: { origin: "proposal_accepted", dealId, ...extraPayload },
    isAutonomous,
    now,
    log,
  });

  log.info(
    { taskId: task.id, status: task.status, leadId, dealId, isAutonomous },
    "triggerOnboardingHandoff: proactive onboarding handoff created"
  );
  return task;
}

// ── Reação proativa: conferência de estoque reprovada → Closer oferece alternativa ──
// Chamado quando um agent_task "conferencia_estoque" é rejeitado e o deal não
// tem vendedor (assignedTo) atribuído. Reaciona o agente Closer na conversa
// com o lead pelo mesmo mecanismo de agent_task usado nos demais agentes
// (respeita enabled/limits/autonomyEnabledAt do tenant).
export async function triggerCloserStockRejectionOffer(params: {
  tenantId: string;
  leadId:   string;
  dealId:   string;
  motivo?:  string;
  log:      Logger;
}): Promise<AgentTask | null> {
  const { tenantId, leadId, dealId, motivo, log } = params;

  const [config] = await db.select().from(agentConfigsTable).where(eq(agentConfigsTable.tenantId, tenantId));
  if (!config) {
    log.info({ tenantId, dealId }, "triggerCloserStockRejectionOffer: no agent config, skipping");
    return null;
  }

  const agentCfg = config.agents?.closer;
  if (!agentCfg?.enabled) {
    log.info({ tenantId, dealId }, "triggerCloserStockRejectionOffer: closer agent not enabled, skipping");
    return null;
  }

  const limits = computeLimits(config);
  if (!limits.ok) {
    log.warn({ tenantId, dealId }, "triggerCloserStockRejectionOffer: agent limits reached, skipping proactive offer");
    return null;
  }

  const [lead] = await db.select({ nome: leadsTable.nome }).from(leadsTable).where(eq(leadsTable.id, leadId));
  if (!lead) {
    log.warn({ tenantId, dealId, leadId }, "triggerCloserStockRejectionOffer: lead not found, skipping");
    return null;
  }

  const primeiroNome = (lead.nome ?? "").trim().split(/\s+/)[0] || undefined;
  const resposta = `Oi${primeiroNome ? `, ${primeiroNome}` : ""}! Sobre a proposta que fechamos: infelizmente identificamos que um dos itens não tem disponibilidade em estoque no momento${motivo ? ` (${motivo})` : ""}. Posso te oferecer um produto substituto, um prazo de entrega maior ou ajustar a quantidade — qual dessas opções funciona melhor pra você?`;

  const now = new Date();
  await updateCounters(config, limits, 0, now);

  const isAutonomous = !!config.autonomyEnabledAt;
  const task = await insertAndRun({
    tenantId,
    leadId,
    agentName: "closer",
    actionType: "enviar_whatsapp",
    resposta,
    extraPayload: { origin: "conferencia_estoque_reprovada", dealId },
    isAutonomous,
    now,
    log,
  });

  log.info(
    { taskId: task.id, status: task.status, leadId, dealId, isAutonomous },
    "triggerCloserStockRejectionOffer: proactive closer reactivation created"
  );
  return task;
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

  // Qualification data collected from conversation (persistent across message window)
  const dd = lead.discoveryData as Record<string, unknown> | null | undefined;
  if (dd && Object.keys(dd).length > 0) {
    const LABELS: Record<string, string> = {
      numero_funcionarios: "Nº de funcionários",
      segmento:            "Segmento/setor",
      crm_atual:           "CRM atual",
      faturamento:         "Faturamento",
      objetivo:            "Objetivo",
      dor_principal:       "Dor principal",
      orcamento:           "Orçamento disponível",
      urgencia:            "Urgência",
      canal_preferido:     "Canal preferido",
    };
    const items = Object.entries(dd)
      .map(([k, v]) => `  ${LABELS[k] ?? k}: ${String(v)}`)
      .join("\n");
    lines.push(`Qualificação coletada (NÃO repita estas perguntas):\n${items}`);
  }

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

export function buildSdrPrompt(customPrompt: string | undefined, ctx: AgentContext, scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null): string {
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
      "- Se houver interesse claro, sugira agendar uma conversa com o time\n" +
      "- QUALIFICAÇÃO: verifique sempre a seção 'Qualificação coletada' no perfil do lead. " +
      "NUNCA repita uma pergunta cujo campo já esteja preenchido ali. " +
      "Pergunte apenas o que ainda não foi respondido — avance a conversa para o próximo passo assim que tiver as informações essenciais.\n" +
      "- VALORES MONETÁRIOS: ao mencionar faturamento, orçamento ou qualquer valor financeiro na conversa, " +
      "use SEMPRE o formato brasileiro: R$ X.XXX,00 (ex: R$ 100.000,00). Nunca mencione o número cru."
    );
    if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  }
  parts.push(buildLeadSection(lead));

  // ── Motor Preditivo (Cmd 22): inject predictive intel as first-message hook ─
  if (scenario?.cold_outreach && scenario?.origem === "prospector_predictive") {
    const sinais: string[] = [];
    if (scenario.propensity_score) sinais.push(`Score de propensão: ${scenario.propensity_score}/100`);
    if (scenario.sinal_growth_principal) sinais.push(`Sinal de crescimento detectado: ${scenario.sinal_growth_principal}`);
    if (scenario.perda_estimada) {
      const perdaFmt = Number(scenario.perda_estimada).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      sinais.push(`Perda estimada sem CRM: ${perdaFmt}/mês`);
    }
    if (scenario.dor_digital === "sem_crm") sinais.push("Operação totalmente manual — sem CRM detectado");
    else if (scenario.dor_digital === "sem_site") sinais.push("Baixa presença digital — sem site profissional");
    if (scenario.segmento) sinais.push(`Segmento: ${scenario.segmento}`);

    if (sinais.length > 0) {
      parts.push(
        "## INTELIGÊNCIA PREDITIVA (Motor Preditivo)\n" +
        "Use estes dados como gancho natural e específico na primeira mensagem — jamais genérico:\n" +
        sinais.map((s) => `- ${s}`).join("\n") + "\n" +
        "IMPORTANTE: A primeira mensagem DEVE mencionar o sinal detectado de forma natural, como se você acompanhasse a empresa.",
      );
    }
  }

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
    // Prefer DB-sourced flag from scenario (set by dispatch via 72h proposal query);
    // fall back to scanning recent messages for an auto-quote output as a last resort.
    const hasActiveProposal =
      (_scenario as Record<string, unknown> | null | undefined)?.hasActiveProposal === true ||
      ctx.recentMessages.some((m) => m.agentName === "auto-quote" && m.direcao === "saida");

    if (hasActiveProposal) {
      // The lead is asking about a real proposal that was just generated.
      // Use a consultative prompt instead of the cold cold-reactivation one.
      parts.push(
        "Você é um consultor de vendas que acompanha a proposta enviada ao lead.\n" +
        "Missão: ajudar o lead a entender e avaliar a proposta/orçamento que acabou de ser gerado, tirando dúvidas e removendo objeções.\n" +
        "Regras:\n" +
        "- Responda em português brasileiro, tom consultivo e empático\n" +
        "- Máximo 3 parágrafos curtos\n" +
        "- VOCÊ PODE e DEVE comentar sobre a proposta/orçamento presente no histórico — essa é exatamente a sua missão agora\n" +
        "- Explique valores, itens, condições e próximos passos de forma clara\n" +
        "- Se o lead tiver dúvidas sobre os valores, explique cada item\n" +
        "- Se o lead quiser negociar, sinalize que pode verificar possibilidades\n" +
        "- Não invente valores ou condições que não estejam na proposta" +
        (churnAlert ? `\n- Contexto interno (NÃO mencionar diretamente): ${churnAlert}` : "")
      );
    } else {
      parts.push(
        "Você é um agente de reativação de relacionamento comercial.\n" +
        "Missão: reabrir contato com um lead inativo de forma calorosa e natural — como se fosse um amigo ou colega de negócios que não se fala há algum tempo.\n" +
        "Regras ESTRITAS para esta mensagem de abertura:\n" +
        "- Responda em português brasileiro, tom leve, caloroso e genuíno\n" +
        "- MÁXIMO 2 frases — seja breve e direto\n" +
        "- Cumprimente pelo nome de forma descontraída\n" +
        "- Faça UMA pergunta aberta e simples sobre como o lead está (ex: 'como você está?', 'como andam as coisas?', 'sumiu um pouco, tudo bem?')\n" +
        "- NÃO mencione produto, solução, serviço, demonstração, reunião, proposta ou qualquer oferta\n" +
        "- NÃO diga que 'percebeu que faz tempo' ou que está 'entrando em contato pois notou inatividade' — isso soa automático\n" +
        "- NÃO tente puxar o lead para uma conversa comercial nesta mensagem\n" +
        "- Aguarde o lead responder e sinalizar uma necessidade antes de conduzir para vendas\n" +
        "- Exemplos de tom correto: 'Oi [nome]! Tudo bem? Sumiu um pouco :)' ou 'Oi [nome], tudo certo? Passando aqui pra saber como você anda!'" +
        (dias !== null && dias > 7 ? `\n- Contexto interno (NÃO mencionar): o lead está inativo há ${dias} dias` : "") +
        (churnAlert ? `\n- Contexto interno (NÃO mencionar): ${churnAlert}` : "")
      );
    }
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

export function buildFinanceiroPrompt(customPrompt: string | undefined, ctx: AgentContext, _scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null): string {
  const { lead, ci } = ctx;
  const parts: string[] = [];
  if (systemPromptOverride?.trim()) {
    parts.push(systemPromptOverride.trim());
  } else {
    parts.push(
      "Você é um especialista financeiro de atendimento B2B.\n" +
      "Missão: esclarecer dúvidas sobre valores, formas de pagamento, faturas, notas fiscais e condições comerciais já contratadas.\n" +
      "Regras:\n" +
      "- Responda em português brasileiro, tom claro, objetivo e transparente\n" +
      "- Máximo 3 parágrafos curtos\n" +
      "- NUNCA invente valores, prazos ou condições que não estejam no contexto fornecido\n" +
      "- Se a dúvida exigir acesso a um sistema financeiro externo, seja honesto e indique que vai verificar ou escalar\n" +
      "- Não confunda dúvida financeira com cobrança de fatura vencida — se identificar atraso de pagamento, apenas oriente e sinalize, sem tom de cobrança agressiva"
    );
    if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  }
  parts.push(buildLeadSection(lead));
  if (ci) {
    const lines = ["## CONTEXTO DO CLIENTE"];
    if (ci.journeyStage) lines.push(`Estágio: ${ci.journeyStage}`);
    if (ci.goalAnalysis) lines.push(`Objetivo do cliente: ${ci.goalAnalysis}`);
    if (lines.length > 1) parts.push(lines.join("\n"));
  }
  return parts.join("\n\n");
}

export function buildCobrancaPrompt(customPrompt: string | undefined, ctx: AgentContext, _scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null): string {
  const { lead, ci } = ctx;
  const parts: string[] = [];
  if (systemPromptOverride?.trim()) {
    parts.push(systemPromptOverride.trim());
  } else {
    parts.push(
      "Você é um especialista em cobrança amigável B2B.\n" +
      "Missão: lembrar o cliente de uma fatura vencida ou em atraso e facilitar a regularização, mantendo o relacionamento.\n" +
      "Regras:\n" +
      "- Responda em português brasileiro, tom respeitoso, empático e sem constrangimento\n" +
      "- Máximo 2 parágrafos curtos\n" +
      "- Informe que há uma pendência financeira e ofereça ajuda para resolver (segunda via, novo link de pagamento, negociação)\n" +
      "- NUNCA use tom ameaçador ou constrangedor\n" +
      "- NUNCA invente valores ou datas — use apenas o que estiver no contexto\n" +
      "- Se o cliente já indicar que pagou, oriente que a equipe vai confirmar e não insista"
    );
    if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  }
  parts.push(buildLeadSection(lead));
  if (ci) {
    const lines = ["## CONTEXTO DO CLIENTE"];
    if (ci.journeyStage) lines.push(`Estágio: ${ci.journeyStage}`);
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
  const isInactivity = s?.type === "inactivity_checkin";

  if (systemPromptOverride?.trim()) {
    parts.push(systemPromptOverride.trim());
  } else if (isInactivity) {
    parts.push(
      "Você é um especialista em relacionamento e retenção de clientes (pós-venda).\n" +
      "Missão: reativar contato proativo com um cliente que está inativo há algum tempo, mostrando cuidado genuíno.\n" +
      "Regras:\n" +
      "- Responda em português brasileiro, tom acolhedor, leve e sem pressão comercial\n" +
      "- Máximo 2 parágrafos curtos\n" +
      "- Pergunte como o cliente está e se precisa de algo, sem tom de cobrança ou venda forçada\n" +
      "- Se houver produtos relevantes no catálogo, sugira de forma leve, sem pressão\n" +
      "- NUNCA invente preços ou produtos que não estejam no catálogo fornecido"
    );
    if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
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
    else if (s.type === "inactivity_checkin") scLines.push(`Este cliente está sem interação há ${s.daysInactive ?? "vários"} dias. Envie um check-in proativo e cuidadoso.`);
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
  financeiro:  buildFinanceiroPrompt,
  cobranca:    buildCobrancaPrompt,
};
