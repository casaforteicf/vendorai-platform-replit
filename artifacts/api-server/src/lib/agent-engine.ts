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

/** A single SPIN qualification question customized for a tenant's niche. */
export type SpinQuestion = {
  fieldKey: string;
  label: string;
  tipo: "situacao" | "problema" | "implicacao" | "necessidade";
  pergunta: string;
};

/** Stored in tenant_agent_configs.parametros.spinQualification for the SDR agent. */
export type SpinQualificationConfig = {
  nicheDescription: string;
  questions: SpinQuestion[];
  approvedAt: string | null;
};

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

  // Qualification memory — always shown so the agent knows what was already collected
  // and what still needs to be asked, even in long conversations where early messages
  // have scrolled out of the 10-message window.
  const dd = (lead.discoveryData ?? {}) as Record<string, unknown>;

  // Merge dedicated lead columns into the qualification view (extractor saves to both)
  const QUAL_FIELDS: Array<{ key: string; label: string; value: string | null }> = [
    { key: "numero_funcionarios", label: "Funcionários",      value: (dd.numero_funcionarios as string | undefined) ?? lead.tamanhoEquipe ?? null },
    { key: "segmento",            label: "Segmento",          value: (dd.segmento as string | undefined) ?? null },
    { key: "crm_atual",           label: "CRM atual",         value: (dd.crm_atual as string | undefined) ?? null },
    { key: "faturamento",         label: "Faturamento mensal",value: (dd.faturamento as string | undefined) ?? null },
    { key: "objetivo",            label: "Objetivo",          value: (dd.objetivo as string | undefined) ?? lead.objetivo ?? null },
    { key: "dor_principal",       label: "Dor principal",     value: (dd.dor_principal as string | undefined) ?? lead.dorPrincipal ?? null },
    { key: "orcamento",           label: "Orçamento",         value: (dd.orcamento as string | undefined) ?? lead.orcamento ?? null },
    { key: "urgencia",            label: "Urgência",          value: (dd.urgencia as string | undefined) ?? lead.urgencia ?? null },
  ];

  const collected = QUAL_FIELDS.filter((f) => f.value != null);
  const missing   = QUAL_FIELDS.filter((f) => f.value == null);

  const qualLines: string[] = ["Qualificação persistente (sobrevive a conversas longas):"];
  if (collected.length > 0) {
    qualLines.push("  Já coletado (NÃO repita estas perguntas):");
    qualLines.push(...collected.map((f) => `    ✓ ${f.label}: ${f.value}`));
  }
  if (missing.length > 0) {
    qualLines.push(`  Ainda não coletado: ${missing.map((f) => f.label).join(" | ")}`);
  }

  // Custom qualification answers stored under non-standard keys (from tenant SPIN questions)
  const standardKeys = new Set(QUAL_FIELDS.map((f) => f.key));
  const customEntries = Object.entries(dd).filter(([k, v]) => !standardKeys.has(k) && v != null && v !== "");
  if (customEntries.length > 0) {
    qualLines.push("  Respostas customizadas do nicho (NÃO repita):");
    customEntries.forEach(([k, v]) =>
      qualLines.push(`    ✓ ${k.replace(/_/g, " ")}: ${String(v)}`)
    );
  }

  lines.push(qualLines.join("\n"));

  return lines.join("\n");
}

// ── Days since last contact ───────────────────────────────────────────────────
export function daysSinceLastContact(ctx: AgentContext): number | null {
  if (!ctx.conversation?.ultimaMensagemEm) return null;
  return Math.floor((Date.now() - new Date(ctx.conversation.ultimaMensagemEm).getTime()) / (1000 * 60 * 60 * 24));
}

// ═════════════════════════════════════════════════════════════════════════════
//  SHARED CALIBRATION RULE  (appended to every conversational agent prompt)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Response-length calibration rule injected into every agent prompt.
 *
 * The LLM already receives the full message history, so it can see how the
 * lead writes. This rule tells it to mirror that rhythm instead of defaulting
 * to long, structured responses regardless of context.
 */
const RESPONSE_CALIBRATION_RULE =
  "## CALIBRAÇÃO DE TAMANHO DE RESPOSTA\n" +
  "Adapte o comprimento e o estilo da sua resposta ao ritmo de escrita do lead nesta conversa:\n" +
  "- Lead escreve mensagens CURTAS (poucas palavras, frases diretas como \"oi\", \"quanto custa\", \"top\") → responda com 1 a 3 frases curtas e diretas. Sem listas numeradas, sem parágrafos longos, sem tópicos estruturados — a menos que a pergunta exija explicação técnica detalhada.\n" +
  "- Lead escreve mensagens LONGAS ou DETALHADAS, ou faz múltiplas perguntas de uma vez → você pode responder de forma mais completa, com mais contexto ou estrutura (listas, tópicos) quando útil.\n" +
  "- NUNCA use formatação pesada (múltiplos itens numerados, blocos extensos) para responder uma pergunta simples de uma linha.\n" +
  "- Objetivo: espelhar o ritmo natural da conversa, como um vendedor humano faria — sem desengajar por resposta curta demais, sem cansar por resposta longa demais.";

/**
 * Joins prompt parts and appends the shared calibration rule as the final section.
 * Used by all conversational agent prompt builders.
 */
function joinWithCalibration(parts: string[]): string {
  return [...parts, RESPONSE_CALIBRATION_RULE].join("\n\n");
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

  // ── SPIN customizado por nicho (Bloco 23) ─────────────────────────────────
  // Ativo apenas quando o tenant configurou e aprovou perguntas de qualificação
  // personalizadas via painel. Substitui a orientação genérica B2B do prompt base.
  const spinCfg = scenario?.spinQualification as SpinQualificationConfig | undefined;
  if (spinCfg?.approvedAt && spinCfg.questions?.length > 0) {
    const dd = (lead.discoveryData ?? {}) as Record<string, unknown>;
    const answeredQs = spinCfg.questions.filter((q) => dd[q.fieldKey] != null && dd[q.fieldKey] !== "");
    const pendingQs  = spinCfg.questions.filter((q) => !dd[q.fieldKey]);

    const spinLines = [
      `## QUALIFICAÇÃO DO NICHO: ${spinCfg.nicheDescription}`,
      "Perguntas adaptadas ao seu negócio — substitui a qualificação genérica B2B.",
    ];
    if (answeredQs.length > 0) {
      spinLines.push("Já respondido pelo lead (NÃO repita — avance a conversa):");
      answeredQs.forEach((q) => spinLines.push(`  ✓ ${q.label}: ${String(dd[q.fieldKey])}`));
    }
    if (pendingQs.length > 0) {
      spinLines.push("Pergunte de forma natural, uma de cada vez, sem revelar o questionário:");
      pendingQs.forEach((q) => spinLines.push(`  • [${q.tipo.toUpperCase()}] ${q.pergunta}`));
    } else {
      spinLines.push("✅ Qualificação completa — avance para proposta ou próxima etapa.");
    }
    parts.push(spinLines.join("\n"));
  }

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
  return joinWithCalibration(parts);
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
      "- Se a resposta for claramente NÃO (ex: 'não quero', 'desisto', 'muito caro', 'não vou seguir'), não use proposal_accept — responda normalmente.\n" +
      "- ORÇAMENTO FORMAL: Se o lead perguntar sobre preços, planos ou valores, retorne EXATAMENTE: `{{action:generate_quote}}` (apenas isso, sem texto adicional). O sistema gerará e enviará um orçamento formal automaticamente. NUNCA liste preços em texto livre no chat."
    );
    if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  }

  // Catalog plans section — injected by dispatch when tenant has active products.
  // Plans arrive sorted most-expensive-first (Enterprise anchoring).
  type CatalogPlan = { id?: string; nome: string; precoBase: string | null; precoImplantacao?: string | null; precoMensalidade?: string | null };
  const catalogPlans = Array.isArray(scenario?.catalogPlans)
    ? (scenario!.catalogPlans as CatalogPlan[])
    : null;
  if (catalogPlans && catalogPlans.length > 0) {
    const fmtBRL = (v: string | null | undefined) =>
      v ? `R$ ${Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : null;
    const planLines = catalogPlans.map((p) => {
      const priceParts: string[] = [];
      const impl = fmtBRL(p.precoImplantacao);
      const mens = fmtBRL(p.precoMensalidade);
      const base = fmtBRL(p.precoBase);
      if (impl) priceParts.push(`Implantação: ${impl}`);
      if (mens) priceParts.push(`Mensalidade: ${mens}`);
      else if (base) priceParts.push(`Valor: ${base}`);
      return `• ${p.nome}: ${priceParts.join(" · ") || "consulte valores"}`;
    });
    parts.push(
      "## PLANOS DISPONÍVEIS (referência interna — NÃO liste no chat)\n" +
      "Os planos abaixo estão no catálogo ordenados do mais completo para o mais básico. Use como referência para saber o que existe — não os liste em bullets no chat.\n" +
      planLines.join("\n") + "\n\n" +
      "## REGRA DE APRESENTAÇÃO DE PREÇOS\n" +
      "Quando o lead perguntar sobre preços, planos ou valores:\n" +
      "1. NUNCA liste os planos em texto livre no chat.\n" +
      "2. Retorne EXATAMENTE: `{{action:generate_quote}}` (apenas isso, sem texto adicional). O sistema gerará um orçamento formal automaticamente com número de orçamento, itens e valor total.\n" +
      "3. ANCORAGEM NO PLANO ENTERPRISE: O orçamento será gerado pelo plano mais completo (primeiro da lista). Só proponha um plano menor se a qualificação do lead — porte da empresa, número de funcionários, orçamento mencionado — indicar CLARAMENTE que o plano maior não é adequado. Na dúvida, sempre o mais completo.\n" +
      "4. Após o orçamento ser enviado (próxima mensagem do lead), retome para apresentar os diferenciais e avançar para o fechamento.",
    );
  }

  // Contract data collection scenario — injected by dispatch when lead accepted a proposal
  // but is missing required fields for the formal contract.
  if (scenario?.collectContractData === true) {
    const nextFieldLabel = String(scenario.nextMissingFieldLabel ?? "as informações necessárias");
    const remaining = Array.isArray(scenario.missingContractFields) ? (scenario.missingContractFields as string[]).length : 0;
    parts.push(
      "## COLETA DE DADOS PARA CONTRATO\n" +
      "O lead aceitou a proposta. Você está coletando os dados necessários para gerar o contrato formal de forma conversacional. " +
      `${remaining === 1 ? "Falta apenas 1 campo." : `Faltam ${remaining} campos.`} ` +
      `Peça de forma natural e gentil APENAS este próximo dado: **${nextFieldLabel}**\n` +
      "Regras:\n" +
      "- Peça UM dado por vez — não liste tudo de uma vez.\n" +
      "- Tom positivo: o lead já decidiu comprar, não crie atrito.\n" +
      "- Não mencione explicitamente 'contrato' ou 'dados para contrato' — seja natural, como se fosse apenas confirmar informações.\n" +
      "- Não emita {{action:proposal_accept}} nem {{action:generate_quote}} neste turno.",
    );
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
  return joinWithCalibration(parts);
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
  return joinWithCalibration(parts);
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
  return joinWithCalibration(parts);
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
    : agendamento
      ? " O link da reunião será enviado pela equipe. Se o lead perguntar sobre o link, responda que vamos encaminhar o link em instantes. NUNCA diga que não tem capacidade de enviar links ou que isso é uma limitação sua — você sempre pode repassar um link."
      : "";

  const agendadoInfo = agendamento
    ? `Um agendamento já foi criado para ${agendamento.dataHoraInicio.toLocaleString("pt-BR")} ` +
      `(${agendamento.tipo}${agendamento.local ? ` — ${agendamento.local}` : ""}).${meetInfo} Confirme os detalhes ao lead.`
    : "Nenhum horário foi definido ainda. Sugira ao lead um próximo passo para confirmar data e formato da reunião.";

  // Replace [Link da Reunião](#) and variants in the custom prompt with the real meet link.
  // This prevents placeholder text from leaking to the lead verbatim.
  function resolveMeetLinkInText(text: string): string {
    const placeholder = /\[Link\s+da\s+Reuni[aã]o\]\s*\(#?\)|\[Link\s+da\s+Reuni[aã]o\]|\{?\{?link_reuni[aã]o\}?\}?/gi;
    return text.replace(placeholder, agendamento?.meetLink ?? "");
  }

  const parts: string[] = [];
  if (systemPromptOverride?.trim()) {
    parts.push(resolveMeetLinkInText(systemPromptOverride.trim()) + `\n\n${agendadoInfo}`);
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
    if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + resolveMeetLinkInText(customPrompt.trim()));
  }
  parts.push(buildLeadSection(lead));
  if (ci?.nextBestAction) {
    parts.push(`## CONTEXTO\nPróxima ação recomendada: ${ci.nextBestAction}`);
  }
  return joinWithCalibration(parts);
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
      "- Encerre sempre verificando se o cliente ficou satisfeito ou tem mais alguma dúvida\n" +
      "- DETECÇÃO DE PROBLEMA TÉCNICO: Se a mensagem do cliente descreve algo que DEVERIA funcionar no sistema mas NÃO funcionou (ex: 'o link não abre', 'o botão sumiu', 'a mensagem não chegou', 'o sistema travou', 'deu erro ao salvar', 'não consigo acessar') — isso é diferente de uma dúvida de 'como usar'. Nesses casos, ao FINAL da sua resposta (após responder normalmente ao cliente), adicione exatamente esta linha separada: {{action:relato_tecnico}}. NÃO adicione esse marcador para: perguntas de 'como faço X', pedidos de nova funcionalidade, ou reclamações sobre comportamento que é esperado/documentado."
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
  return joinWithCalibration(parts);
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
  return joinWithCalibration(parts);
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
  return joinWithCalibration(parts);
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
  return joinWithCalibration(parts);
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

  return joinWithCalibration(parts);
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
