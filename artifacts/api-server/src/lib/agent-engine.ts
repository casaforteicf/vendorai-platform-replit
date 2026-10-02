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