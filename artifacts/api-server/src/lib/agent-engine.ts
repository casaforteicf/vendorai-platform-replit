/**
 * Shared AI agent engine — types, context loading, limit checking,
 * OpenAI calls, counter updates, task insertion, and all 7 prompt builders.
 *
 * Imported by:
 *   - routes/agents.ts        (HTTP route handlers)
 *   - services/agent-dispatch.ts  (internal dispatch from webhook + scheduler)
 */
import { and, desc, eq, inArray } from "drizzle-orm";
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
  knowledgeBaseTable,
} from "@workspace/db";
import type { AgentTask, AiFeature } from "@workspace/db";
import { executeTaskAction } from "../routes/agent_tasks.js";
import { callOpenAI as gatewayCallOpenAI, callAnthropic as gatewayCallAnthropic } from "./ai-gateway.js";
import { CLOSER_OBJECTION_PLAYBOOK_PROMPT } from "./closer-objection-playbook.js";
import { buildProspectorConsultivePrompt, resolveProspectorPlaybook } from "./prospector-consultive.js";

// ── Types ─────────────────────────────────────────────────────────────────────
type Lead         = typeof leadsTable.$inferSelect;
type CI           = typeof customerIntelligenceTable.$inferSelect;
type Conversation = typeof conversationsTable.$inferSelect;
type Message      = typeof messagesTable.$inferSelect;
type AgentConfig  = typeof agentConfigsTable.$inferSelect;

export type CompanyAgentContext = {
  company: {
    id: string;
    cnpj: string;
    razaoSocial: string | null;
    nomeFantasia: string | null;
    situacaoCadastral: string | null;
    porte: string | null;
    cnaePrincipal: string | null;
    telefone: string | null;
    email: string | null;
    website: string | null;
  };
  relationshipType: string;
  contacts: Array<{
    personId: string;
    nome: string;
    cargo: string | null;
    qualificacao: string | null;
    telefones: string[];
    emails: string[];
    roles: string[];
    isPrimary: boolean;
    preferredChannel: string | null;
    priorityByPurpose: Record<string, number>;
    roleEvidence: Array<{ source: string; detail?: string; observedAt?: string }>;
    roleConfidence: string | null;
    verifiedAt: Date | null;
    validUntil: Date | null;
    metadata: Record<string, unknown>;
  }>;
};

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

export type AgentName    = "sdr" | "closer" | "followup" | "reactivation" | "scheduler" | "service" | "onboarding" | "relacionamento" | "financeiro" | "cobranca" | "reception" | "pharmacy";
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
  type: "birthday_lead" | "birthday_family" | "deal_anniversary" | "commercial_date" | "professional_day" | "custom_special_date" | "spouse_welcome" | "inactivity_checkin";
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
  // Recepção usa o mesmo bucket de billing/módulo do SDR (mesmo critério já
  // adotado em plan-guard.ts) — é o agente de primeiro contato, só que sem
  // qualificar/empurrar venda.
  reception: "agent_sdr",
  pharmacy: "agent_service",
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
  reception:    "recepcao",
  pharmacy:     "farmacia",
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

  // ── Inject linked Knowledge Base content ─────────────────────────────────────
  // A tela Agentes→Configurar→Conhecimento já permitia escolher quais itens da
  // Base de Conhecimento cada agente usa (tenantCfg.knowledgeBaseIds), mas o
  // conteúdo nunca era efetivamente buscado e injetado no prompt — a seleção
  // ficava só salva, sem efeito nenhum na resposta gerada. Corrigido aqui.
  const knowledgeBaseIds = (tenantCfg?.knowledgeBaseIds ?? []) as string[];
  if (knowledgeBaseIds.length > 0) {
    const items = await db
      .select({
        titulo: knowledgeBaseTable.titulo,
        conteudo: knowledgeBaseTable.conteudo,
      })
      .from(knowledgeBaseTable)
      .where(and(
        eq(knowledgeBaseTable.tenantId, tenantId),
        inArray(knowledgeBaseTable.id, knowledgeBaseIds),
        eq(knowledgeBaseTable.ativo, true),
      ));

    if (items.length > 0) {
      const MAX_CHARS_PER_ITEM = 6000;
      const sections = items.map((item) => {
        const truncated = item.conteudo.length > MAX_CHARS_PER_ITEM;
        const content = truncated ? item.conteudo.slice(0, MAX_CHARS_PER_ITEM) + "\n[...conteúdo truncado...]" : item.conteudo;
        return `### ${item.titulo}\n${content}`;
      });
      parts.push(
        "## BASE DE CONHECIMENTO\n" +
        "Use as informações abaixo como referência ao responder. Não repita o conteúdo literalmente de forma longa; " +
        "extraia só o que for relevante para a pergunta do lead.\n\n" +
        sections.join("\n\n---\n\n")
      );
    }
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

  let companyContext: CompanyAgentContext | null = null;
  const [tenantCompany] = await db
    .select({
      id: crmTenantCompaniesTable.id,
      companyId: crmTenantCompaniesTable.companyId,
      relationshipType: crmTenantCompaniesTable.relationshipType,
    })
    .from(crmTenantCompaniesTable)
    .where(and(
      eq(crmTenantCompaniesTable.tenantId, tenantId),
      eq(crmTenantCompaniesTable.leadId, leadId),
    ))
    .limit(1);

  if (tenantCompany) {
    const [company] = await db
      .select({
        id: crmCompaniesMasterTable.id,
        cnpj: crmCompaniesMasterTable.cnpj,
        razaoSocial: crmCompaniesMasterTable.razaoSocial,
        nomeFantasia: crmCompaniesMasterTable.nomeFantasia,
        situacaoCadastral: crmCompaniesMasterTable.situacaoCadastral,
        porte: crmCompaniesMasterTable.porte,
        cnaePrincipal: crmCompaniesMasterTable.cnaePrincipal,
        telefone: crmCompaniesMasterTable.telefone,
        email: crmCompaniesMasterTable.email,
        website: crmCompaniesMasterTable.website,
      })
      .from(crmCompaniesMasterTable)
      .where(eq(crmCompaniesMasterTable.id, tenantCompany.companyId))
      .limit(1);

    if (company) {
      const contacts = await db
        .select({
          personId: crmPeopleMasterTable.id,
          nome: crmPeopleMasterTable.nome,
          cargo: crmCompanyPeopleTable.cargo,
          qualificacao: crmCompanyPeopleTable.qualificacao,
          telefones: crmPeopleMasterTable.telefones,
          emails: crmPeopleMasterTable.emails,
          roles: crmTenantCompanyContactsTable.roles,
          isPrimary: crmTenantCompanyContactsTable.isPrimary,
          preferredChannel: crmTenantCompanyContactsTable.preferredChannel,
          priorityByPurpose: crmTenantCompanyContactsTable.priorityByPurpose,
          roleEvidence: crmTenantCompanyContactsTable.roleEvidence,
          roleConfidence: crmTenantCompanyContactsTable.roleConfidence,
          verifiedAt: crmTenantCompanyContactsTable.verifiedAt,
          validUntil: crmTenantCompanyContactsTable.validUntil,
          metadata: crmTenantCompanyContactsTable.metadata,
        })
        .from(crmTenantCompanyContactsTable)
        .innerJoin(crmPeopleMasterTable, eq(crmPeopleMasterTable.id, crmTenantCompanyContactsTable.personId))
        .leftJoin(
          crmCompanyPeopleTable,
          and(
            eq(crmCompanyPeopleTable.companyId, tenantCompany.companyId),
            eq(crmCompanyPeopleTable.personId, crmPeopleMasterTable.id),
          ),
        )
        .where(and(
          eq(crmTenantCompanyContactsTable.tenantId, tenantId),
          eq(crmTenantCompanyContactsTable.tenantCompanyId, tenantCompany.id),
        ));

      companyContext = {
        company,
        relationshipType: tenantCompany.relationshipType,
        contacts: contacts.map((contact) => ({
          ...contact,
          telefones: contact.telefones ?? [],
          emails: contact.emails ?? [],
          roles: contact.roles ?? [],
          priorityByPurpose: contact.priorityByPurpose ?? {},
          roleEvidence: contact.roleEvidence ?? [],
          metadata: (contact.metadata ?? {}) as Record<string, unknown>,
        })),
      };
    }
  }

  return { lead, ci, conversation, recentMessages, companyContext };
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
  tenantId: string,
  agentName: AgentName,
  log?: Logger
): Promise<{ resposta: string; tokensUsed: number }> {
  if (!tenantId) throw new Error("tenantId is required for agent AI calls");
  if (!agentName) throw new Error("agentName is required for agent AI calls");

  const feature = AGENT_FEATURE_MAP[agentName];
  if (!feature) throw new Error(`No AI Gateway feature mapping configured for agent ${agentName}`);

  const { content, inputTokens, outputTokens } = await gatewayCallOpenAI(
    tenantId,
    feature,
    messages,
    { model: "gpt-4o-mini", temperature: 0.7, maxTokens: 600, log }
  );
  return { resposta: content, tokensUsed: inputTokens + outputTokens };
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

  // ── Perfil de atividade do negócio (SPIN adaptativo) ──────────────────────
  const leadAny = lead as Record<string, unknown>;
  const bizActivity    = leadAny.businessActivity    as string | undefined;
  const bizSubActivity = leadAny.businessSubActivity as string | undefined;
  const bizDescription = leadAny.businessDescription as string | undefined;
  if (bizActivity) {
    const label = {
      fabricante:         "Fabricante / Produtor",
      distribuidor:       "Distribuidor / Atacadista",
      varejista:          "Varejista / Loja",
      prestador_servicos: "Prestador de Serviços",
      outro:              "Outro / Indefinido",
    }[bizActivity] ?? bizActivity;
    lines.push(`Tipo de negócio: ${label}${bizSubActivity ? ` (${bizSubActivity.replace(/_/g, " ")})` : ""}`);
    if (bizDescription) lines.push(`Descrição do negócio: ${bizDescription}`);
  }
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
  const leadAny2 = lead as Record<string, unknown>;

  // ── BANT block (Budget / Authority / Need / Timeline) ─────────────────────
  const bantBudget    = (dd.orcamento as string | undefined) ?? lead.orcamento ?? null;
  const bantAuthority = (dd.autoridade as string | undefined) ?? (leadAny2.representanteCargo as string | undefined) ?? null;
  const bantNeed      = (dd.dor_principal as string | undefined) ?? lead.dorPrincipal ?? lead.objetivo ?? null;
  const bantTimeline  = (dd.urgencia as string | undefined) ?? lead.urgencia ?? null;

  const bantItems = [
    { label: "B — Budget (orçamento)",         value: bantBudget },
    { label: "A — Authority (quem decide)",    value: bantAuthority },
    { label: "N — Need (dor / necessidade)",   value: bantNeed },
    { label: "T — Timeline (prazo / urgência)",value: bantTimeline },
  ];
  const bantCollected = bantItems.filter((b) => b.value != null);
  const bantMissing   = bantItems.filter((b) => b.value == null);

  const bantLines: string[] = ["## QUALIFICAÇÃO BANT (nunca repita o que já está preenchido)"];
  bantCollected.forEach((b) => bantLines.push(`  ✓ ${b.label}: ${b.value}`));
  if (bantMissing.length > 0) {
    bantLines.push(`  ◻ Ainda não coletado: ${bantMissing.map((b) => b.label).join(" | ")}`);
  }
  lines.push(bantLines.join("\n"));

  // ── Demais campos de qualificação ─────────────────────────────────────────
  const QUAL_FIELDS: Array<{ key: string; label: string; value: string | null }> = [
    { key: "numero_funcionarios", label: "Funcionários",      value: (dd.numero_funcionarios as string | undefined) ?? lead.tamanhoEquipe ?? null },
    { key: "segmento",            label: "Segmento",          value: (dd.segmento as string | undefined) ?? null },
    { key: "crm_atual",           label: "CRM atual",         value: (dd.crm_atual as string | undefined) ?? null },
    { key: "faturamento",         label: "Faturamento mensal",value: (dd.faturamento as string | undefined) ?? null },
    { key: "objetivo",            label: "Objetivo",          value: (dd.objetivo as string | undefined) ?? lead.objetivo ?? null },
    { key: "dor_principal",       label: "Dor principal",     value: (dd.dor_principal as string | undefined) ?? lead.dorPrincipal ?? null },
    { key: "orcamento",           label: "Orçamento",         value: bantBudget },
    { key: "urgencia",            label: "Urgência",          value: bantTimeline },
    { key: "autoridade",          label: "Decisor (Authority)",value: bantAuthority },
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

  if (companyContext) {
    lines.push("## EMPRESA MESTRE E CONTATOS VINCULADOS");
    const company = companyContext.company;
    lines.push(`CNPJ: ${company.cnpj}`);
    if (company.razaoSocial) lines.push(`Razão social: ${company.razaoSocial}`);
    if (company.nomeFantasia) lines.push(`Nome fantasia: ${company.nomeFantasia}`);
    if (company.situacaoCadastral) lines.push(`Situação cadastral: ${company.situacaoCadastral}`);
    if (company.cnaePrincipal) lines.push(`Atividade principal: ${company.cnaePrincipal}`);
    lines.push(`Relacionamento com este tenant: ${companyContext.relationshipType}`);
    if (companyContext.contacts.length > 0) {
      lines.push("Contatos disponíveis para este tenant:");
      for (const contact of companyContext.contacts) {
        const roleConfirmed =
          contact.metadata?.["roleStatus"] === "confirmed" ||
          contact.verifiedAt != null;
        const roleText = roleConfirmed && contact.roles.length > 0
          ? contact.roles.join(", ")
          : "vínculo identificado; papel comercial não confirmado";
        const channels = [
          contact.telefones[0] ? `tel: ${contact.telefones[0]}` : null,
          contact.emails[0] ? `e-mail: ${contact.emails[0]}` : null,
        ].filter(Boolean).join(" | ");
        lines.push(
          `- ${contact.nome}${contact.cargo ? ` — ${contact.cargo}` : ""} — papéis: ${roleText}` +
          `${roleConfirmed && contact.isPrimary ? " — contato principal" : ""}${channels ? ` — ${channels}` : ""}`
        );
        if (!roleConfirmed && contact.metadata?.["discoveredBy"] === "qsa") {
          lines.push("  Observação: QSA confirma vínculo societário/administrativo, não autoridade comercial.");
        }
      }
      lines.push(
        "REGRA DE CONTATO: quando a ação tiver uma finalidade específica, use o contato com papel correspondente " +
        "(ex.: financeiro para cobrança, compras para negociação de compra, técnico para assunto técnico, decisor para decisão). " +
        "Não invente telefone, e-mail, cargo ou autoridade; se não houver contato adequado, sinalize que o contato precisa ser confirmado."
      );
    } else {
      lines.push("Nenhum contato confirmado para este tenant. Não invente interlocutores.");
    }
  }

  return lines.join("\n");
}

// ── Classificador de atividade do negócio (SPIN adaptativo) ─────────────────
// Roda de forma não-bloqueante na primeira mensagem do SDR quando empresa/segmento
// está disponível mas businessActivity ainda não foi classificado.
export async function classifyBusinessActivity(
  tenantId: string,
  lead: Lead,
  log?: Logger
): Promise<void> {
  const leadAny = lead as Record<string, unknown>;
  // Já classificado — nada a fazer
  if (leadAny.businessActivity) return;
  // Sem informação suficiente para classificar
  const empresa   = lead.empresa ?? null;
  const segmento  = (lead as any).mercadoSegmento as string | null ?? null;
  if (!empresa && !segmento) return;

  try {
    const hint = [empresa, segmento].filter(Boolean).join(" / ");
    const { content } = await gatewayCallOpenAI(tenantId, "agent_sdr", [
      {
        role: "system",
        content:
          "Você é um classificador de tipo de negócio. Responda SOMENTE com JSON válido, sem markdown.\n" +
          "Com base no nome e/ou segmento da empresa, retorne:\n" +
          '{ "activity": "<fabricante|distribuidor|varejista|prestador_servicos|outro>", ' +
          '"subActivity": "<string curta opcional, ex: materiais_construcao>", ' +
          '"description": "<1 frase descrevendo o negócio>", ' +
          '"confidence": <0.0 a 1.0> }',
      },
      { role: "user", content: `Empresa/segmento: ${hint}` },
    ], { model: "gpt-4o-mini", temperature: 0, maxTokens: 120, log });

    const parsed = JSON.parse(content);
    if (!parsed.activity) return;

    await db
      .update(leadsTable)
      .set({
        businessActivity: parsed.activity,
        businessSubActivity: parsed.subActivity ?? null,
        businessDescription: parsed.description ?? null,
        businessActivityConfidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
        updatedAt: new Date(),
      })
      .where(eq(leadsTable.id, lead.id));

    log?.info({ leadId: lead.id, activity: parsed.activity, confidence: parsed.confidence }, "business-activity: classified");
  } catch (err) {
    log?.warn({ err, leadId: lead.id }, "business-activity: classification failed (non-fatal)");
  }
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

  // Cold outbound discovered by Prospector runs in a dedicated research-first mode.
  // This intentionally bypasses the generic SPIN/product pitch until the lead has
  // confirmed stage, timeline and challenge. The same SDR transport/runtime is
  // reused, but the commercial behavior is governed by the Prospector playbook.
  if (scenario?.["prospector_mode"] === true) {
    const metadata = (lead.metadata ?? {}) as Record<string, unknown>;
    const discoveryData = (lead.discoveryData ?? {}) as Record<string, unknown>;
    const playbook = resolveProspectorPlaybook(
      scenario?.["prospector_playbook"],
      lead.mercadoSegmento,
      { ...metadata, lead_source: lead.source ?? "" },
    );
    const state = scenario?.["prospector_state"] && typeof scenario["prospector_state"] === "object"
      ? scenario["prospector_state"] as Record<string, unknown>
      : null;
    const prospectorSystemPrompt = typeof scenario?.["prospector_system_prompt"] === "string"
      ? scenario["prospector_system_prompt"] as string
      : null;

    parts.push(buildProspectorConsultivePrompt({
      playbook,
      discoveryData,
      metadata,
      customSystemPrompt: prospectorSystemPrompt,
      state,
    }));
    parts.push(
    "## RESPONSABILIDADE DE PONTA A PONTA DO SUPORTE\n" +
    "- Você é dono do acompanhamento do caso enquanto existir uma assistência ativa. Abrir uma AST NÃO encerra seu trabalho.\n" +
    "- Acompanhe o fluxo: chamado → agendamento → execução → relatório → confirmação de resolução → avaliação final → fechamento.\n" +
    "- Quando o cliente enviar nova informação sobre uma AST ativa, trate como continuação do mesmo caso; não peça para ele recomeçar nem abra chamado duplicado.\n" +
    "- Mantenha o cliente informado sobre mudanças relevantes de etapa e atrasos sem prometer prazo que não esteja registrado.\n" +
    "- Se a assistência não avançar, o monitor operacional cobra o responsável e pode enviar follow-up ao cliente. Não invente que houve avanço quando não houve.\n" +
    "- Nunca considere o caso concluído só porque o serviço foi executado. O fechamento positivo exige confirmação do cliente e a avaliação final, salvo se ele recusar explicitamente avaliar.\n" +
    "- Se o cliente disser que não resolveu ou resolveu parcialmente, preserve o histórico e continue em um retorno vinculado, sem obrigá-lo a repetir tudo.\n" +
    "- Use sempre dados reais do tenant, Base de Conhecimento, pedido/projeto/produto, histórico e AST. Não invente diagnóstico, peça, prazo, garantia, visita ou responsável."
  );
  parts.push(buildLeadSection(lead));

    if (ci) {
      const lines = ["## INTELIGÊNCIA DE CLIENTE (somente contexto interno; não trate inferências como fatos)"];
      if (ci.journeyStage)         lines.push(`Estágio: ${ci.journeyStage}`);
      if (ci.intentAnalysis)       lines.push(`Intenção: ${ci.intentAnalysis}`);
      if (ci.goalAnalysis)         lines.push(`Objetivo: ${ci.goalAnalysis}`);
      if (ci.nextBestAction)       lines.push(`Próxima ação sugerida: ${ci.nextBestAction}`);
      if (lines.length > 1) parts.push(lines.join("\n"));
    }

    return joinWithCalibration(parts);
  }
  if (systemPromptOverride?.trim()) {
    parts.push(systemPromptOverride.trim());
  } else {
    parts.push(
      "Você é um SDR especialista em vendas B2B, utilizando a metodologia SPIN Selling de forma sequencial e consultiva.\n" +
      "\n## CONTEXTO DO PRODUTO\n" +
      "Use as INSTRUÇÕES DA EMPRESA abaixo para saber exatamente o que esta empresa vende/oferece — nunca assuma um produto genérico.\n" +
      "\n## REGRAS GERAIS\n" +
      "- Responda em português brasileiro\n" +
      "- Máximo 2 parágrafos curtos por mensagem\n" +
      "- Nunca invente informações sobre produtos ou preços\n" +
      "- VALORES MONETÁRIOS: use sempre o formato R$ X.XXX,00 — nunca o número cru\n" +
      "- PREÇO: NUNCA mencione valores antes de identificar a dor do lead. Se perguntarem 'quanto custa?', redirecione: 'Antes de falar em investimento, quero entender seu cenário para recomendar a solução certa — como você está gerenciando seus leads hoje?'\n" +
      "\n## METODOLOGIA SPIN SELLING — SEQUÊNCIA OBRIGATÓRIA\n" +
      "O fluxo de qualificação segue SEMPRE esta ordem, UMA PERGUNTA por etapa:\n\n" +
      "| Etapa | Objetivo | Quando fazer |\n" +
      "|-------|----------|--------------|\n" +
      "| S — Situação | Entender como o lead gerencia leads/atendimento hoje | Sempre primeiro, se ainda não respondida |\n" +
      "| P — Problema | Identificar a principal dor no processo atual | Após lead responder S |\n" +
      "| I — Implicação | Explorar o impacto financeiro/operacional do problema | Após lead responder P |\n" +
      "| N — Necessidade | Provocar o desejo pela solução e mostrar valor | Após lead responder I |\n\n" +
      "## COMO IDENTIFICAR A PRÓXIMA PERGUNTA\n" +
      "Analise o histórico da conversa:\n" +
      "- Se NENHUMA pergunta SPIN foi feita → faça S (Situação): ex: 'Como você está gerenciando os leads que chegam pelo WhatsApp e Instagram atualmente?'\n" +
      "- Se S foi respondida → faça P (Problema): ex: 'Qual é a maior dificuldade que você enfrenta para responder todos os leads em tempo hábil?'\n" +
      "- Se P foi respondida → faça I (Implicação): ex: 'Quanto você estima que está perdendo em vendas por não conseguir acompanhar todos os contatos?'\n" +
      "- Se I foi respondida → faça N (Necessidade): ex: 'Se você tivesse um SDR virtual que respondesse 100% dos leads automaticamente, isso te ajudaria a aumentar suas vendas?'\n" +
      "- Se N foi respondida → finalize: 'Ótimo! Vamos agendar uma reunião para mostrar como podemos transformar seu atendimento. Posso sugerir um horário?'\n" +
      "IMPORTANTE: As perguntas acima são exemplos genéricos. Adapte-as ao tipo de negócio identificado no perfil do lead (veja 'Tipo de negócio' na seção PERFIL DO LEAD).\n\n" +
      "## REGRAS RÍGIDAS DO SPIN\n" +
      "- NUNCA mude a ordem S → P → I → N\n" +
      "- NUNCA pule uma etapa antes do lead responder a anterior\n" +
      "- NUNCA faça mais de uma pergunta na mesma mensagem — nem duas perguntas da mesma etapa, nem uma pergunta SPIN + uma pergunta de qualificação (orçamento, decisor, prazo etc.) juntas. Sempre UMA pergunta por mensagem, sem exceção.\n" +
      "- Se você notar que já fez 2 perguntas numa mensagem anterior e o lead só respondeu uma, NÃO repita a pergunta anterior do zero — reconheça a resposta parcial e faça a pergunta que ficou sem resposta, isolada\n" +
      "- Se o lead não respondeu a pergunta anterior, NÃO avance de etapa — reforce ou reformule a pergunta atual\n" +
      "- Se a resposta do lead for curta/informal ('já', 'agora', 'to be aí', 'assim que possível'), trate como resposta válida à pergunta de prazo/urgência — NUNCA peça pra elaborar com outras palavras\n" +
      "- QUALIFICAÇÃO COLETADA: verifique a seção 'QUALIFICAÇÃO BANT' no perfil do lead ANTES de formular sua pergunta. Todo campo já marcado com ✓ está respondido — NUNCA pergunte de novo sobre ele, mesmo que reformulado. Só pergunte sobre os campos marcados com ◻\n" +
      "\n## EXEMPLO DE FLUXO CORRETO\n" +
      "Lead: 'Oi, gostaria de saber mais.'\n" +
      "SDR: 'Olá! Para te ajudar melhor, como você está gerenciando os leads que chegam pelo WhatsApp e Instagram atualmente?' (S)\n" +
      "Lead: 'Estou respondendo manualmente, mas é muito trabalho.'\n" +
      "SDR: 'Entendo. Qual é a maior dificuldade que você enfrenta para responder todos os leads em tempo hábil?' (P)\n" +
      "Lead: 'Perco muitos contatos porque não consigo responder rápido.'\n" +
      "SDR: 'Isso é um grande desafio. Quanto você estima que está perdendo em vendas por não acompanhar todos os contatos?' (I)\n" +
      "Lead: 'Cerca de 30% dos leads.'\n" +
      "SDR: 'Nossa, 30% é significativo! Se você tivesse um SDR virtual que respondesse 100% dos leads automaticamente, isso te ajudaria a recuperar essas vendas?' (N)\n" +
      "Lead: 'Com certeza!'\n" +
      "SDR: 'Ótimo! Vamos agendar uma reunião para mostrar como podemos transformar seu atendimento. Posso sugerir um horário?'"
    );
    if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  }
  parts.push(buildLeadSection(lead));

  // ── SPIN adaptativo por tipo de negócio detectado por IA ─────────────────
  // Injeta exemplos de perguntas SPIN específicos para o tipo de negócio
  // classificado automaticamente (fabricante, distribuidor, varejista, etc.)
  // Só ativo quando businessActivity foi preenchido pelo classificador.
  {
    const leadAny = lead as Record<string, unknown>;
    const bizActivity = leadAny.businessActivity as string | undefined;
    if (bizActivity && bizActivity !== "outro") {
      const spinExamples: Record<string, { s: string; p: string; i: string; n: string }> = {
        fabricante: {
          s: "Como você está gerenciando os leads de distribuidores e revendedores que entram em contato com a fábrica?",
          p: "Qual a maior dificuldade para qualificar e responder pedidos de orçamento de novos canais?",
          i: "Quanto você estima que perde em potenciais parceiros de distribuição por demora no atendimento inicial?",
          n: "Se você pudesse automatizar o primeiro contato com novos revendedores e filtrar os mais qualificados, isso aceleraria sua expansão de canais?",
        },
        distribuidor: {
          s: "Como você está gerenciando os leads de varejistas e clientes que solicitam seu portfólio ou tabela de preços?",
          p: "Qual é o maior gargalo no processo de atender e qualificar novos clientes lojistas?",
          i: "Quanto volume de vendas você estima que está perdendo por não conseguir responder todos os contatos rapidamente?",
          n: "Se você tivesse um assistente virtual que respondesse pedidos de tabela e qualificasse varejistas automaticamente, isso ajudaria a escalar suas vendas?",
        },
        varejista: {
          s: "Como você está gerenciando os leads que chegam pelo WhatsApp, Instagram ou site — pedidos de orçamento e dúvidas de produtos?",
          p: "Qual é a maior dificuldade para converter esses contatos em clientes sem perder nenhum no caminho?",
          i: "Quanto você estima que está perdendo em vendas por leads que não recebem resposta rápida?",
          n: "Se você tivesse um SDR virtual que respondesse 100% dos contatos automaticamente e qualificasse quem tem intenção real de compra, isso aumentaria seu faturamento?",
        },
        prestador_servicos: {
          s: "Como você está gerenciando os leads que pedem orçamento ou tiram dúvidas sobre seus serviços — WhatsApp, e-mail, indicações?",
          p: "Qual é o maior desafio para qualificar quem realmente precisa dos seus serviços e transformar em agendamento?",
          i: "Quantos potenciais clientes por mês você acredita que não converte por falta de agilidade no primeiro contato?",
          n: "Se você tivesse um assistente que respondesse dúvidas e agendasse reuniões automaticamente, liberando você para focar na entrega, isso ajudaria?",
        },
      };
      const ex = spinExamples[bizActivity];
      if (ex) {
        parts.push(
          `## EXEMPLOS SPIN ADAPTADOS AO NEGÓCIO (${bizActivity.toUpperCase().replace(/_/g, " ")})\n` +
          "Use estes exemplos como base para formular suas perguntas SPIN — adapte ao contexto da conversa:\n" +
          `- S (Situação): "${ex.s}"\n` +
          `- P (Problema): "${ex.p}"\n` +
          `- I (Implicação): "${ex.i}"\n` +
          `- N (Necessidade): "${ex.n}"`
        );
      }
    }
  }

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

  // ── Personalização com dados do Prospector / Google Places ────────────────
  // Para qualquer lead de cold outreach (independente da origem), usar os dados
  // reais do negócio para personalizar a abordagem — nunca abrir com genérico.
  if (scenario?.cold_outreach) {
    const meta = (lead.metadata ?? {}) as Record<string, unknown>;
    const cidade = (meta.cidade as string | undefined) ?? null;
    const setor  = (meta.setor  as string | undefined) ?? lead.mercadoSegmento ?? null;

    const contexto: string[] = [];
    if (lead.empresa) contexto.push(`Empresa: ${lead.empresa}`);
    if (setor)        contexto.push(`Setor/nicho: ${setor}`);
    if (cidade)       contexto.push(`Cidade: ${cidade}`);

    if (contexto.length > 0) {
      parts.push(
        "## CONTEXTO DO NEGÓCIO (personalização obrigatória na abertura)\n" +
        "NUNCA abra com 'Oi, tudo bem?' genérico. Use os dados abaixo para criar uma abertura específica:\n" +
        contexto.map((c) => `- ${c}`).join("\n") + "\n" +
        "Demonstre que você pesquisou o negócio antes de contatar — mencione o segmento ou cidade de forma natural, " +
        "como alguém que conhece o mercado local. Ex: 'Vi que vocês são do ramo de [setor] em [cidade]...'",
      );
    }
  }

  // ── Diagnóstico de maturidade em IA ──────────────────────────────────────
  // Quando ainda não temos o score de maturidade do lead, o agente deve conduzir
  // perguntas diagnósticas de forma natural ao longo da conversa.
  const leadAny = lead as Record<string, unknown>;
  const maturidadeConhecida = leadAny.maturidadeIA != null;
  if (!maturidadeConhecida && scenario?.cold_outreach) {
    parts.push(
      "## DIAGNÓSTICO DE MATURIDADE EM IA (obrigatório — não sinalizar ao lead)\n" +
      "Ainda não sabemos o nível de automação deste negócio. Ao longo da conversa, conduza NATURALMENTE " +
      "(nunca como questionário formal) perguntas que revelem:\n" +
      "1. Como ATENDEM clientes hoje — WhatsApp manual? Quem responde? Quantas pessoas?\n" +
      "2. Se usam ALGUM SISTEMA — CRM, software, app, planilha ou só o WhatsApp comum\n" +
      "3. VOLUME de atendimento — quantas mensagens/clientes por dia aproximadamente\n" +
      "4. Se PERDEM VENDAS fora do horário ou por demora na resposta\n" +
      "5. Se já TESTARAM ou ouviram falar de IA / chatbot / automação\n" +
      "Faça uma pergunta por vez, de forma orgânica. " +
      "Score de maturidade (para contexto interno): 1=tudo manual, 2=tem sistema sem IA, 3=já usa IA/automação.",
    );
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
  const calcM2Section = buildCalcM2PromptSection(scenario);
  if (calcM2Section) parts.push(calcM2Section);
  return joinWithCalibration(parts);
}

// ── Seção de cálculo de orçamento por m² (teto vinílico, revestimento) ─────
// Compartilhada entre SDR e Closer. Só aparece no prompt quando o tenant
// TEM produto com tipo_calculo preenchido (produtosM2 injetado em
// agent-dispatch.ts) — não polui o prompt de quem não vende esse tipo de
// produto. Regra central: o agente NUNCA calcula sozinho nem inventa
// número de pacote/valor — só emite o marcador com as medidas já
// confirmadas; o motor real (mesmo do CPQ) roda no backend e substitui a
// resposta por uma mensagem com os números exatos antes de chegar ao lead.
function buildCalcM2PromptSection(scenario?: Record<string, unknown> | null): string {
  const produtosM2 = (scenario?.["produtosM2"] ?? []) as Array<{
    id: string; nome: string; tipoCalculo: string | null; colecao: string | null; cor: string | null;
  }>;
  if (!produtosM2.length) return "";

  const listaProdutos = produtosM2
    .map((p) => `- ${p.nome} (produtoId: ${p.id}, tipo: ${p.tipoCalculo}${p.colecao ? `, coleção: ${p.colecao}` : ""}${p.cor ? `, cor: ${p.cor}` : ""})`)
    .join("\n");

  return (
    "## CÁLCULO DE ORÇAMENTO POR M² (produtos vendidos por área)\n" +
    "Estes produtos do catálogo são vendidos por m²/m linear, calculados automaticamente pelo sistema:\n" +
    listaProdutos +
    "\n\nQuando o lead pedir orçamento de um desses produtos:\n" +
    "1. Pergunte quais ambientes/paredes vão receber o produto, e se o cliente tem planta baixa ou só sabe as medidas de cabeça.\n" +
    "2. Se o cliente mandar imagem/PDF de planta baixa, leia as medidas mas SEMPRE confirme com o cliente antes de calcular (ex: \"Pela planta, entendi que a Sala tem 4×5m, confere?\") — nunca calcule em cima de leitura não confirmada.\n" +
    "3. Se faltar alguma medida, insista educadamente e aguarde — NUNCA estime uma medida que o cliente não deu.\n" +
    "4. Pra teto vinílico (tipo area_com_acabamento_perimetro), pergunte a preferência de acabamento só se houver mais de uma opção compatível — a coleção/cor do produto principal já indica o ponto de partida.\n" +
    "5. Só depois de ter TODAS as medidas confirmadas, responda SOMENTE com o marcador abaixo (nenhum outro texto visível nessa mensagem, nem o valor — você NUNCA calcula o valor sozinho):\n" +
    '<!--CALC_M2:{"produtoId":"...","superficies":[{"nome":"Sala","largura":4,"comprimento":5}],"acessorioProdutoId":null}-->\n' +
    "Pra revestimento de parede (tipo area_simples), cada superfície é uma parede individual — use largura+altura (ou m2Direto) por parede, sem acessorioProdutoId.\n" +
    "O sistema calcula o valor real a partir do marcador e devolve a mensagem final com os números exatos pro lead — você não precisa (e não deve) formatar essa resposta."
  );
}

export function buildCloserPrompt(customPrompt: string | undefined, ctx: AgentContext, scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null): string {
  const { lead, ci } = ctx;
  const parts: string[] = [];
  if (systemPromptOverride?.trim()) {
    parts.push(systemPromptOverride.trim());
  } else {
    const nowBRT = new Intl.DateTimeFormat("pt-BR", {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
      hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo",
    }).format(new Date());
    parts.push(
      "Você é um Closer comercial universal, especialista em negociação e fechamento, adaptável ao segmento, produto/serviço e modelo de negócio de cada tenant.\n" +
      "Missão: entender a decisão de compra, remover objeções reais, criar clareza sobre valor e conduzir o negócio ao próximo passo ou fechamento quando houver fit.\n" +
      "CONTEXTO COMERCIAL — REGRA CENTRAL:\n" +
      "- Adapte sua abordagem ao segmento, produto ou serviço, ticket, ciclo de venda, tipo de cliente (B2B ou B2C), canal e instruções específicas do tenant.\n" +
      "- NÃO assuma que a oferta é SaaS, software, assinatura, plano ou implantação. Só use esses termos quando eles existirem no contexto real da empresa ou da oferta.\n" +
      "- Use a linguagem comercial natural do segmento do tenant. Ex.: obra/projeto em construção, produto/medida em esquadrias, item/pedido em varejo, serviço/proposta em serviços, plano/assinatura em SaaS quando aplicável.\n" +
      "- As informações reais do tenant, Base de Conhecimento, catálogo, lead e cenário de runtime têm prioridade sobre exemplos genéricos deste prompt.\n" +
      "Regras:\n" +
      "- Responda em português brasileiro, tom confiante mas empático\n" +
      "- CALIBRAÇÃO DE TAMANHO: Mensagens curtas (saudações, 'bom dia', 'oi', 'ok', 'certo', 'entendi') devem receber respostas curtas — máximo 1 frase. Respostas mais elaboradas apenas para perguntas complexas ou objeções. NUNCA repita vantagens já mencionadas na conversa.\n" +
      "- Máximo 3 parágrafos curtos quando a mensagem exigir explicação\n" +
      "- Reconheça a objeção, valide-a, apresente contra-argumento com evidência\n" +
      "- TRATAMENTO DE OBJEÇÕES: use LAER como padrão. FEEL-FELT-FOUND só pode ser usado quando existir um case real no contexto do tenant; nunca invente que 'muitos clientes' tiveram a mesma experiência.\\n" +
      "- Se o lead estiver pronto, proponha o próximo passo concreto\n" +
      "- Nunca invente dados, desconto, características, condições comerciais ou funcionalidades não confirmadas\n" +
      "- OFERTA: apresente no máximo 2 alternativas relevantes por vez (produto, serviço, solução ou plano, conforme o tenant) — mais do que isso pode confundir e paralisar a decisão\n" +
      "\n## EXEMPLOS DE SUPERAÇÃO DE OBJEÇÕES\n" +
      "✅ BOM — objeção de preço:\n" +
      "  Lead: 'Acho que está muito caro.'\n" +
      "  Closer: 'Entendo. O que está pesando mais pra você: o valor total ou a dúvida sobre o retorno? Se me passar como vocês fazem hoje e o custo/tempo envolvido, eu faço a conta com você usando dados reais.'\\n" +
      "✅ BOM — objeção de tempo:\n" +
      "  Lead: 'Preciso pensar mais.'\n" +
      "  Closer: 'Faz todo sentido — é uma decisão importante. O que exatamente você precisa avaliar? Posso ajudar com informações específicas agora.'\n" +
      "❌ ERRADO — ceder imediatamente:\n" +
      "  Lead: 'Acho que está muito caro.'\n" +
      "  Closer: 'Temos um plano mais barato.' ← NUNCA justifique pela redução de preço sem antes defender o valor.\n" +
      "- DETECÇÃO DE ACEITE: Se o lead disser algo como 'aceito', 'vamos em frente', 'fechado', 'pode fechar', 'tá bom', 'vamos nessa', 'quero sim', 'vamos fechar', 'confirmo', 'topa', 'está certo', 'aceito a proposta', 'tá aprovado', 'pode seguir' — ou qualquer variação clara de aceite da proposta/orçamento, você deve retornar EXATAMENTE a ação especial: `{{action:proposal_accept}}` (apenas isso, sem texto adicional).\n" +
      "- Se a resposta for ambígua (ex: 'quero saber mais', 'pensei em aceitar', 'talvez', 'vou ver', 'me explica melhor'), NÃO use proposal_accept — continue a conversa normalmente pedindo confirmação explícita.\n" +
      "- Se a resposta for claramente NÃO (ex: 'não quero', 'desisto', 'muito caro', 'não vou seguir'), não use proposal_accept — responda normalmente.\n" +
      "- POLÍTICA DE PREÇOS (inegociável): Quando o lead perguntar sobre preços, planos ou valores — independentemente de como a pergunta foi formulada — retorne EXATAMENTE: `{{action:generate_quote}}` (apenas isso, sem texto adicional). O sistema gera e envia automaticamente o orçamento formal em PDF. NUNCA recuse informar preço. NUNCA liste valores em texto no chat. Se já enviou um orçamento antes, retorne `{{action:generate_quote}}` novamente para atualizar.\n" +
      `## DATA E HORA ATUAL\nHoje é ${nowBRT} (horário de Brasília). Ao mencionar 'hoje', 'amanhã' ou qualquer data/horário, use sempre a data completa por extenso para evitar confusão.`
    );
    if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  }

  // Universal objection handling knowledge. Tenant facts still come from the
  // configured prompt / Knowledge Base / runtime scenario.
  parts.push(CLOSER_OBJECTION_PLAYBOOK_PROMPT);
  const closerWinningResponsesPrompt =
    typeof scenario?.closerWinningResponsesPrompt === "string"
      ? scenario.closerWinningResponsesPrompt.trim()
      : "";
  if (closerWinningResponsesPrompt) {
    parts.push(closerWinningResponsesPrompt);
  }

  // ── Meeting link or pending-link injection ──────────────────────────────────
  // When auto-schedule succeeded: inject the real Google Meet URL.
  // When scheduling intent was detected but Calendar was unavailable: tell the
  // agent to confirm the link is coming — never ask for availability.
  if (scenario?.meetLink) {
    const startStr = scenario.dataHoraInicio
      ? (() => {
          const d = scenario.dataHoraInicio instanceof Date
            ? scenario.dataHoraInicio
            : new Date(scenario.dataHoraInicio as string);
          return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long", day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" });
        })()
      : "a confirmar";
    parts.push(
      "## REUNIÃO AGENDADA — AÇÃO OBRIGATÓRIA\n" +
      `Uma reunião foi criada automaticamente para ${startStr}.\n` +
      `Link Google Meet: ${scenario.meetLink}\n` +
      "REGRA CRÍTICA: inclua ESTE link exato na sua resposta como URL puro (exemplo: https://meet.google.com/xxx-yyyy-zzz). NÃO use formatação markdown — NÃO coloque entre colchetes e parênteses como [link](url). Não invente outro link. Não use placeholder."
    );
  } else if (scenario?.meetingRequested) {
    parts.push(
      "## PEDIDO DE LINK DE REUNIÃO\n" +
      "O lead acabou de pedir o link da reunião. O sistema irá organizar uma reunião e enviar o link em breve.\n" +
      "Regras OBRIGATÓRIAS para esta resposta:\n" +
      "- NÃO pergunte 'qual horário fica bom?' nem 'qual é sua disponibilidade?'\n" +
      "- NÃO peça data ou horário — o sistema já vai organizar.\n" +
      "- Confirme com entusiasmo que você vai enviar o link em breve. Exemplo: 'Claro! Vou organizar a reunião e te envio o link agora mesmo.' ou 'Perfeito! Deixa comigo — te mando o link em instantes.'\n" +
      "- Seja breve (1 frase)."
    );
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
  const calcM2Section = buildCalcM2PromptSection(scenario);
  if (calcM2Section) parts.push(calcM2Section);
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
      "Missão: apresentar-se de forma calorosa e despertar interesse genuíno — sem pressão.\n" +
      "REGRAS ESTRITAS — esta é a abertura de relacionamento:\n" +
      "- Responda em português brasileiro, tom acolhedor e genuinamente prestativo\n" +
      "- MÁXIMO 1 parágrafo curto (2-3 frases) — UMA ÚNICA mensagem de texto\n" +
      "- É o PRIMEIRO contato: NÃO mencione 'nossa última interação', 'tempo que passou' ou qualquer referência a conversa anterior\n" +
      "- Apresente-se brevemente e deixe claro que está à disposição para ajudar\n" +
      "- Faça UMA ÚNICA pergunta aberta e simples para entender o que o lead precisa\n" +
      "- NÃO produza dois blocos separados de texto — tudo em uma única mensagem contínua\n" +
      "- Seja humano, direto e deixe espaço para o lead responder"
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
      "Missão: apresentar-se de forma calorosa e despertar interesse genuíno — sem pressão.\n" +
      "REGRAS ESTRITAS — esta é a abertura de relacionamento:\n" +
      "- Responda em português brasileiro, tom acolhedor e genuinamente prestativo\n" +
      "- MÁXIMO 1 parágrafo curto (2-3 frases) — UMA ÚNICA mensagem de texto\n" +
      "- É o PRIMEIRO contato: NÃO mencione 'nossa última interação', 'tempo que passou' ou qualquer referência a conversa anterior\n" +
      "- Apresente-se brevemente e deixe claro que está à disposição para ajudar\n" +
      "- Faça UMA ÚNICA pergunta aberta e simples para entender o que o lead precisa\n" +
      "- NÃO produza dois blocos separados de texto — tudo em uma única mensagem contínua\n" +
      "- Seja humano, direto e deixe espaço para o lead responder"
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
      ? " O link da reunião ainda não foi gerado. Se o lead perguntar sobre o link, diga APENAS que vai confirmar e enviar em breve. NUNCA invente um link, use placeholders, cite exemplos de formato, ou mencione qualquer texto fictício entre colchetes. Não há link disponível agora — apenas confirme que chegará em breve."
      : "";

  const agendadoInfo = agendamento
    ? `Um agendamento já foi criado para ${agendamento.dataHoraInicio.toLocaleString("pt-BR")} ` +
      `(${agendamento.tipo}${agendamento.local ? ` — ${agendamento.local}` : ""}).${meetInfo} Confirme os detalhes ao lead.`
    : "Nenhum horário foi definido ainda. Sugira ao lead um próximo passo para confirmar data e formato da reunião.";

  // Replace [Link da Reunião](#) and variants in the custom prompt with the real meet link.
  // This prevents placeholder text from leaking to the lead verbatim.
  function resolveMeetLinkInText(text: string): string {
    // Broad match: any "[Link da reuni(ã/a)o...]" regardless of what follows (colon, bold, "(exemplo)", etc.)
    const placeholder = /\[link\s+da\s+reuni[aã]o[^\]]*\]|\{?\{?link_reuni[aã]o\}?\}?/gi;
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

export function buildServicePrompt(customPrompt: string | undefined, ctx: AgentContext, scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null): string {
  const { lead, ci } = ctx;
  const parts: string[] = [];
  if (systemPromptOverride?.trim()) {
    parts.push(systemPromptOverride.trim());
  } else {
    parts.push(
      "Você é um agente universal de Suporte e Sucesso do Cliente, adaptável ao segmento, produto, serviço e operação de cada tenant.\n" +
      "Missão: resolver dúvidas e problemas, coordenar o caso operacional e acompanhar o cliente até a confirmação de resolução e avaliação final.\n" +
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

  const supportIntake = scenario?.supportIntake as {
    state?: "collecting" | "opened" | "existing" | "unassigned";
    code?: string;
    missingQuestion?: string;
    category?: string;
    priority?: string;
    problemSummary?: string;
    products?: string[];
    responsibleName?: string | null;
    instruction?: string;
  } | undefined;
  if (supportIntake?.state && supportIntake.instruction) {
    const details = [
      `Estado: ${supportIntake.state}`,
      supportIntake.code ? `Código AST: ${supportIntake.code}` : null,
      supportIntake.category ? `Categoria: ${supportIntake.category}` : null,
      supportIntake.priority ? `Prioridade: ${supportIntake.priority}` : null,
      supportIntake.problemSummary ? `Problema identificado: ${supportIntake.problemSummary}` : null,
      supportIntake.products?.length ? `Itens/produtos citados: ${supportIntake.products.join(", ")}` : null,
      supportIntake.responsibleName ? `Responsável: ${supportIntake.responsibleName}` : null,
    ].filter(Boolean).join("\n");
    parts.push(
      "## FLUXO OPERACIONAL DE ASSISTÊNCIA — INSTRUÇÃO OBRIGATÓRIA\n" +
      `${details}\n` +
      `${supportIntake.instruction}\n` +
      "Não invente código, responsável, prazo, diagnóstico ou solução técnica. Se o estado for collecting, faça somente a pergunta indicada. Se for opened, confirme o registro com o código real. Se for existing, não crie nem prometa novo chamado."
    );
  }

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

export function buildReceptionPrompt(customPrompt: string | undefined, ctx: AgentContext, _scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null): string {
  const { lead, ci } = ctx;
  const parts: string[] = [];
  if (systemPromptOverride?.trim()) {
    parts.push(systemPromptOverride.trim());
  } else {
    parts.push(
      "Você é o agente de recepção — o primeiro contato humano de verdade que a empresa tem com quem chega pelo site ou WhatsApp.\n" +
      "Missão: dar boas-vindas de forma calorosa, entender rapidamente o que a pessoa precisa e encaminhar para o próximo passo certo (nunca empurrar venda de cara).\n" +
      "Regras:\n" +
      "- Responda em português brasileiro, tom acolhedor e natural, como uma recepção bem treinada — nunca robótico\n" +
      "- Máximo 2 parágrafos curtos na primeira resposta\n" +
      "- Faça no máximo 1 pergunta por vez pra entender a necessidade\n" +
      "- Não tente fechar venda nem qualificar a fundo — isso é trabalho de outro agente depois; seu papel é acolher e direcionar\n" +
      "- Se a pessoa já disser claramente o que quer (ex: preço, agendar demo, suporte técnico), reconheça isso e diga que vai encaminhar"
    );
    if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA EMPRESA\n" + customPrompt.trim());
  }
  // Sempre anexado, inclusive quando a empresa usa um prompt personalizado.
  parts.push(
    "## ENCAMINHAMENTO PARA FARMÁCIA\n" +
    "Quando a necessidade for de farmácia — medicamento, disponibilidade, receita, sintomas, entrega ou orientação farmacêutica — responda brevemente que encaminhará para o atendimento da farmácia e acrescente ao final exatamente: {{handoff:farmacia}}\n" +
    "O marcador {{handoff:farmacia}} é interno e nunca deve ser explicado ao lead."
  );
  parts.push(buildLeadSection(lead));
  if (ci?.goalAnalysis) parts.push(`## CONTEXTO\nObjetivo aparente do contato: ${ci.goalAnalysis}`);
  return joinWithCalibration(parts);
}

export function buildPharmacyPrompt(customPrompt: string | undefined, ctx: AgentContext, scenario?: Record<string, unknown> | null, systemPromptOverride?: string | null): string {
  const { lead } = ctx;
  const catalog = (scenario?.catalogProducts ?? []) as Array<{
    nome: string;
    nomeGenerico?: string | null;
    precoBase?: string | null;
    precoVenda?: string | null;
    exigeReceita?: boolean;
    estoque?: number;
    posologia?: {
      concentracao?: string;
      formaFarmaceutica?: string;
      viaAdministracao?: string;
      faixaEtaria?: string;
      pesoMinimoKg?: number;
      pesoMaximoKg?: number;
      dosePorAdministracao?: string;
      intervaloMinimo?: string;
      duracaoMaxima?: string;
      doseMaximaDiaria?: string;
      modoDeUsar?: string;
      contraindicacoes?: string;
      interacoes?: string;
      alertas?: string;
    } | null;
    posologiaFonteUrl?: string | null;
    posologiaAprovada?: boolean;
    posologiaRevisadaPor?: string | null;
    posologiaRevisadaEm?: Date | null;
  }>;
  const parts: string[] = [];

  parts.push(systemPromptOverride?.trim() ||
    "Você é o agente de atendimento da farmácia. Continue a conversa recebida da Recepção sem repetir perguntas já respondidas.\n" +
    "Missão: entender a necessidade, fazer uma triagem breve e sugerir, quando seguro, opções de medicamentos isentos de prescrição pelo nome genérico que estejam realmente disponíveis no catálogo da farmácia. Ajude também com preço, receita, pedido e entrega.\n" +
    "Regras:\n" +
    "- Converse em português brasileiro, com linguagem simples, acolhedora e objetiva\n" +
    "- Faça uma pergunta por vez e preserve o contexto da conversa\n" +
    "- Antes de sugerir medicamento, confirme idade; para criança, também o peso; e pergunte sobre gravidez/amamentação, alergias, doenças relevantes e medicamentos em uso quando aplicável\n" +
    "- Apresente no máximo 2 opções pelo NOME GENÉRICO, explique que são opções para alívio do sintoma e peça confirmação do cliente; não diagnostique e não diga que o medicamento é certamente seguro para aquela pessoa\n" +
    "- Só associe uma opção a produto, preço e estoque quando ela estiver no CATÁLOGO DA FARMÁCIA e o princípio ativo corresponder; se não estiver, diga que consultará a equipe\n" +
    "- Só informe concentração, dose, intervalo, duração e limite diário quando TODOS estiverem cadastrados para a apresentação exata, houver fonte oficial e a posologia estiver aprovada pelo farmacêutico; reproduza literalmente os dados cadastrados\n" +
    "- Nunca calcule dose, converta apresentação, extrapole faixa de idade/peso nem combine posologias; se os dados do lead não se encaixarem exatamente na ficha aprovada, encaminhe ao farmacêutico\n" +
    "- Nunca invente estoque, preço, prazo, dose, concentração, posologia, contraindicação ou informação sobre medicamento\n" +
    "- Não prescreva, não altere receita e não sugira antibiótico, corticoide sistêmico ou medicamento controlado\n" +
    "- Bloqueie sugestão automática e encaminhe ao farmacêutico para gestantes, lactantes, crianças pequenas, doença renal/hepática/cardíaca, hipertensão descontrolada, anticoagulante, alergia medicamentosa, possível interação, sintomas intensos/recorrentes/persistentes ou item que exija receita\n" +
    "- Quando houver decisão clínica, dúvida ou risco, encaminhe claramente para o farmacêutico ou serviço de saúde\n" +
    "- Em sinais de urgência, oriente atendimento emergencial imediato\n" +
    "- Não solicite CPF, documento ou endereço antes que sejam realmente necessários ao pedido ou entrega\n" +
    "- Se não houver informação suficiente, diga que confirmará com a equipe da farmácia");

  if (customPrompt?.trim()) parts.push("## INSTRUÇÕES DA FARMÁCIA\n" + customPrompt.trim());
  parts.push(
    "## REFERÊNCIA DE ORIENTAÇÃO INICIAL (NÃO É PRESCRIÇÃO)\n" +
    "- Dor de cabeça comum: hidratação e repouso; opções genéricas possíveis: paracetamol ou dipirona. Encaminhar se súbita, muito forte, após trauma ou com sintomas neurológicos.\n" +
    "- Febre: líquidos e roupas leves; opções genéricas possíveis: paracetamol ou dipirona. Encaminhar se alta, persistente, com confusão ou rigidez de nuca.\n" +
    "- Resfriado/nariz entupido: hidratação e lavagem nasal; cloreto de sódio 0,9%; para dor/febre, paracetamol somente após triagem.\n" +
    "- Dor muscular leve: calor local e repouso relativo; paracetamol ou dipirona; diclofenaco dietilamônio tópico exige triagem cuidadosa.\n" +
    "- Alergia leve/coriza: lavagem nasal; loratadina ou cetirizina exigem triagem. Falta de ar, chiado ou inchaço são encaminhamento urgente.\n" +
    "- Azia ocasional: evitar gatilhos e não se deitar; antiácido ou alginato após triagem. Dor no peito exige avaliação urgente.\n" +
    "- Diarreia ou vômito leve: priorizar sais para reidratação oral; sangue, febre alta, dor intensa ou desidratação exigem atendimento.\n" +
    "- Cortes/escoriações superficiais: água, sabonete e curativo; clorexidina aquosa quando necessária.\n" +
    "- Queimadura leve: água corrente fresca por cerca de 20 minutos; encaminhar áreas extensas, face, mãos, genitais ou bolhas grandes.\n" +
    "Um asterisco ou a expressão 'após triagem' na política da farmácia significa: não sugerir automaticamente sem validação das contraindicações."
  );
  parts.push(buildLeadSection(lead));
  if (catalog.length > 0) {
    parts.push("## PRODUTOS DISPONÍVEIS NO CATÁLOGO\n" + catalog.map((p) => {
      const posologia = p.posologiaAprovada && p.posologiaFonteUrl && p.posologia
        ? ` | POSOLOGIA APROVADA: ${JSON.stringify(p.posologia)} | fonte: ${p.posologiaFonteUrl} | revisada por: ${p.posologiaRevisadaPor ?? "farmacêutico responsável"}${p.posologiaRevisadaEm ? ` em ${new Date(p.posologiaRevisadaEm).toLocaleDateString("pt-BR")}` : ""}`
        : " | posologia não liberada: encaminhar ao farmacêutico";
      return `- Produto: ${p.nome}` +
      `${p.nomeGenerico ? ` | nome genérico/princípio ativo: ${p.nomeGenerico}` : " | nome genérico não cadastrado"}` +
      `${(p.precoBase ?? p.precoVenda) ? ` | preço: R$ ${p.precoBase ?? p.precoVenda}` : ""}` +
      ` | exige receita: ${p.exigeReceita ? "sim" : "não"}` +
      `${typeof p.estoque === "number" ? ` | estoque: ${p.estoque}` : ""}` + posologia;
    }
    ).join("\n"));
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
  const isProfessionalDay = s?.type === "professional_day";
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
  } else if (isProfessionalDay) {
    parts.push(
      "Você é um especialista em relacionamento e fidelização de clientes.\n" +
      "Missão: parabenizar genuinamente o cliente pelo dia da profissão dele.\n" +
      "Regras:\n" +
      "- Responda em português brasileiro, tom caloroso, respeitoso e personalizado\n" +
      "- Máximo 2 parágrafos curtos\n" +
      "- Mencione a profissão e reconheça sua importância\n" +
      "- NÃO inclua oferta, promoção ou sugestão de produto\n" +
      "- Não invente detalhes sobre a carreira do cliente"
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
  if (lead.profissao) lines.push(`Profissão: ${lead.profissao}`);
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
    else if (s.type === "custom_special_date") scLines.push(`Hoje é uma data especial do relacionamento: ${s.dateName ?? "data especial"}.`);
    else if (s.type === "deal_anniversary") scLines.push("Hoje é o aniversário de fechamento do deal com o lead!");
    else if (s.type === "commercial_date") scLines.push(`Data comercial: ${s.dateName ?? "data especial"}.`);
    else if (s.type === "professional_day") scLines.push(`Hoje é ${s.dateName ?? "o dia da profissão do lead"}. Envie somente uma mensagem de parabéns e reconhecimento.`);
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
  reception:   buildReceptionPrompt,
  pharmacy:    buildPharmacyPrompt,
};