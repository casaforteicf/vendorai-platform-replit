/**
 * Agent dispatch service — selects and runs the appropriate AI agent
 * for an incoming message without going through HTTP.
 *
 * Used by:
 *   - routes/webhooks.ts  (fire-and-forget after WhatsApp message insert)
 *   - jobs/scheduler.ts   (campaign message dispatch)
 */
import { and, desc, eq, gte, isNull, or } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  agentConfigsTable,
  activitiesTable,
  businessProfilesTable,
  conversationsTable,
  customerIntelligenceTable,
  dealsTable,
  leadsTable,
  messagesTable,
  notificationsTable,
  produtosCatalogoTable,
  propostasTable,
  tenantsTable,
  usersTable,
  leadSpouseConsentTable,
  tenantCalendarSettingsTable,
  scoutOportunidadesTable,
} from "@workspace/db";
import { callOpenAI as gatewayFamilyCallOpenAI } from "../lib/ai-gateway.js";
import { detectEscalationTrigger, generateHandoffSummary } from "./escalation.js";
import { detectBotPattern, BOT_SIGNAL_THRESHOLD } from "./bot-detection.js";
import { classifyFinancialIntent } from "./financial-intent.js";
import { handleDeliveryFeedbackReply } from "./post-venda.js";
import { handleSequenceOfferReply } from "./sequence-offer.js";
import { generateAgentHandoffSummary } from "./handoff.js";
import { sendDirectWhatsAppMessage } from "./omnichannel.js";
import {
  loadContext,
  computeLimits,
  callOpenAI,
  updateCounters,
  insertAndRun,
  msgToOpenAI,
  PROMPT_BUILDERS,
  daysSinceLastContact,
  getAgentConfig,
  AGENT_NAME_TO_KEY,
  type AgentName,
  getOpenAI,
  type AgentContext,
  type SpinQuestion,
} from "../lib/agent-engine.js";
import { proposalAccepted } from "../lib/proposal-accepted.js";
import { checkAgentPlan } from "../middlewares/plan-guard.js";

type Lead    = typeof leadsTable.$inferSelect;
type CI      = typeof customerIntelligenceTable.$inferSelect;
type Deal    = typeof dealsTable.$inferSelect;
type Message = typeof messagesTable.$inferSelect;

// ── System prompt variable interpolation ──────────────────────────────────────

/**
 * Replaces common placeholder tokens in a system prompt stored in the DB.
 * Supported tokens (case-insensitive):
 *   - [Seu Nome] | [Nome] | {vendedor_nome} | {{vendedor_nome}} → vendor name
 *   - [Empresa]  | {empresa_nome} | {{empresa_nome}}            → company name
 * Any remaining unrecognised [Placeholder] pattern is stripped to prevent literal
 * bracket text leaking to the lead.
 */
function interpolateSystemPrompt(text: string, vars: { vendedor_nome: string; empresa_nome: string }): string {
  let out = text;
  out = out.replace(/\[Seu\s+Nome\]|\[Nome\]|\{?\{vendedor_nome\}\}?/gi, vars.vendedor_nome);
  out = out.replace(/\[Empresa\]|\{?\{empresa_nome\}\}?/gi, vars.empresa_nome);
  // Remove any leftover [Unknown Placeholder] patterns (1–60 chars between brackets)
  out = out.replace(/\[[^\]]{1,60}\]/g, "");
  return out;
}

// ── Agent routing ─────────────────────────────────────────────────────────────

/** Charge statuses (Asaas raw or internal) that indicate an overdue/late invoice. */
const OVERDUE_CHARGE_STATUSES = new Set(["overdue", "vencida"]);

function hasOverdueCharge(deals: Deal[]): boolean {
  return deals.some((d) => d.chargeStatus && OVERDUE_CHARGE_STATUSES.has(d.chargeStatus.toLowerCase()));
}

/**
 * Determines which agent should handle an incoming message based on:
 *  1. churnRisk >= 60  → reactivation (highest priority) — BUT skipped when:
 *     (a) deal in qualificado/proposta/negociacao/ganho (active negotiation or won), OR
 *     (b) agent replied within the last 4h (mid-conversation gap ≠ churn), OR
 *     (c) lead sent a message within the past 24h (not truly inactive).
 *  2. lead.status === "novo" → sdr
 *  3. lead.status === "cliente" → refinamento: cobrança vencida > dúvida financeira (LLM) > service
 *  4. open deal etapa  → closer when deal is advancing
 *  5. days since contact ≥ 3 → followup
 *  6. default          → sdr
 */
export async function determineAgent(
  lead:  Lead,
  ci:    CI | null,
  deals: Deal[],
  daysSinceContact: number | null,
  mensagem: string,
  tenantId: string,
  log: Logger,
  recentMessages?: Message[],
): Promise<AgentName> {
  // 1. High churn risk → reactivation agent
  //    Guards: do NOT switch to cold-reactivation if there is an ongoing conversation.
  if (ci?.churnRisk !== null && ci?.churnRisk !== undefined && ci.churnRisk >= 60) {
    // (a) Active deal in an advanced or completed stage
    const hasAdvancedDeal = deals.some(
      (d) => d.etapa === "qualificado" || d.etapa === "proposta" || d.etapa === "negociacao" || d.etapa === "ganho",
    );

    // (b) Agent already replied within the last 4 hours (mid-conversation short gap ≠ churn)
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
    const hasRecentAgentActivity = (recentMessages ?? []).some(
      (m) => m.enviadoPor === "agente_ia" && new Date(m.createdAt).getTime() > fourHoursAgo,
    );

    // (c) Lead was genuinely active within the past 24h — reactivation is only valid after
    //     real inactivity (≥24h silence from the lead before this message).
    //     Look at the previous lead message (before the current trigger) to measure the gap.
    const msgs = recentMessages ?? [];
    const leadMsgs = msgs.filter((m) => m.enviadoPor === "lead");
    // leadMsgs is in chronological order; the last entry is the current trigger.
    // The previous lead message (second-to-last) reveals pre-trigger inactivity.
    const prevLeadMsg = leadMsgs.length >= 2 ? leadMsgs[leadMsgs.length - 2] : null;
    const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;
    const leadWasRecentlyActive = prevLeadMsg != null &&
      new Date(prevLeadMsg.createdAt).getTime() > twentyFourHoursAgo;

    if (hasAdvancedDeal || hasRecentAgentActivity || leadWasRecentlyActive) {
      log.info(
        {
          tenantId,
          leadId: lead.id,
          churnRisk: ci.churnRisk,
          hasAdvancedDeal,
          hasRecentAgentActivity,
          leadWasRecentlyActive,
          daysSinceContact,
        },
        "determineAgent: churnRisk >= 60 but active conversation/deal detected — skipping reactivation",
      );
      // Fall through to normal routing below
    } else {
      log.info(
        { tenantId, leadId: lead.id, churnRisk: ci.churnRisk, daysSinceContact },
        "determineAgent: churnRisk >= 60 with real inactivity — routing to reactivation",
      );
      return "reactivation";
    }
  }

  // 2. Lead status → direct mapping
  if (lead.status === "novo") return "sdr";
  if (lead.status === "cliente") {
    // 3a. Fatura vencida/em atraso vinculada a algum deal do cliente → cobrança
    if (hasOverdueCharge(deals)) {
      return "cobranca";
    }
    // 3b. Dúvida financeira (valores, pagamento, fatura) → financeiro
    try {
      const financial = await classifyFinancialIntent(mensagem, tenantId, log);
      if (financial.isFinancial) {
        return "financeiro";
      }
    } catch (err) {
      log.warn({ err, tenantId }, "determineAgent: financial intent classification failed — falling back to service");
    }
    // 3c. Fallback: atendimento geral
    return "service";
  }

  // 4. Has active deals? Route based on their stage
  const activeDeals = deals.filter((d) => d.etapa !== "ganho" && d.etapa !== "perdido");
  if (activeDeals.length > 0) {
    const mostAdvanced = activeDeals.sort((a, b) => {
      const order = ["novo", "qualificado", "proposta", "negociacao"];
      return order.indexOf(b.etapa) - order.indexOf(a.etapa);
    })[0]!;

    if (mostAdvanced.etapa === "proposta" || mostAdvanced.etapa === "negociacao") {
      return "closer";
    }
    return "closer"; // Any open deal → closer is best choice
  }

  // 4. Qualified lead with no deals and has been cold for 3+ days
  if (lead.status === "qualificado" && daysSinceContact !== null && daysSinceContact >= 3) {
    return "followup";
  }

  // 5. Default: SDR for qualification
  return "sdr";
}

// ── Internal process (no HTTP) ────────────────────────────────────────────────

/**
 * Runs the full agent pipeline for a lead+message pair internally.
 * - Loads context, checks limits, calls OpenAI, creates agent_task.
 * - Returns silently on soft errors (disabled agent, limit exceeded) so callers
 *   can fire-and-forget without crashing.
 * - Throws only on unrecoverable programmer errors.
 */
export type DispatchResult =
  | { status: "sent"; taskId: string; agentName: AgentName; tokensUsed: number }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string };

export async function processAgentInternal(params: {
  tenantId: string;
  leadId:   string;
  mensagem: string;
  log:      Logger;
  forcedAgent?: AgentName;
  scenario?: Record<string, unknown> | null;
}): Promise<DispatchResult> {
  const { tenantId, leadId, mensagem, log, forcedAgent } = params;

  try {
    // 1. Load agent config
    const [config] = await db
      .select()
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId));

    if (!config) {
      log.warn({ tenantId, leadId }, "dispatch: no agent config — skipping");
      return { status: "skipped", reason: "no_agent_config" };
    }

    // 2. Load context (lead + CI + conversation + recent messages)
    const ctx = await loadContext(tenantId, leadId);
    if (!ctx) {
      log.warn({ tenantId, leadId }, "dispatch: lead not found — skipping");
      return { status: "skipped", reason: "lead_not_found" };
    }

    // 2b. Human lock — if lead is locked to a human agent, skip AI dispatch entirely
    if (ctx.lead.activeAgentLock === "human") {
      log.info({ tenantId, leadId }, "dispatch: lead locked to human — skipping AI response");
      return { status: "skipped", reason: "human_lock" };
    }

    // 2b2. Pending delivery feedback — a pesquisa de satisfação pós-entrega está
    // aguardando resposta. Trata de forma determinística (classificação de
    // sentimento), sem passar pelo roteamento normal de agentes/escalação.
    if (ctx.lead.pendingFeedbackEntregaId) {
      await handleDeliveryFeedbackReply({
        tenantId,
        leadId,
        entregaId: ctx.lead.pendingFeedbackEntregaId,
        mensagem,
        log,
      }).catch((err) => {
        log.warn({ err, tenantId, leadId }, "dispatch: delivery feedback handling failed");
      });
      return { status: "skipped", reason: "delivery_feedback_handled" };
    }

    // 2b3. Pending sequence offer (Revenue Scout) — só intercepta se a resposta
    // ainda precisa de tratamento determinístico (pergunta de etapa). Se o
    // cliente confirmou interesse (ou resposta ambígua), a função limpa o
    // pending e deixa a mensagem seguir para o roteamento normal abaixo.
    if (ctx.lead.pendingSequenceOportunidadeId) {
      const result = await handleSequenceOfferReply({
        tenantId,
        leadId,
        oportunidadeId: ctx.lead.pendingSequenceOportunidadeId,
        mensagem,
        log,
      }).catch((err) => {
        log.warn({ err, tenantId, leadId }, "dispatch: sequence offer handling failed");
        return { handled: false };
      });

      if (result.handled) {
        return { status: "skipped", reason: "sequence_offer_handled" };
      }

      // Recarrega o contexto: handleSequenceOfferReply já limpou o pending flag.
      ctx.lead.pendingSequenceOportunidadeId = null;
    }

    // 2c. Escalation detection — check if incoming message needs human escalation
    if (!params.forcedAgent) {
      const escalation = await detectEscalationTrigger(mensagem, ctx, tenantId, log);
      if (escalation.triggered) {
        log.info({ tenantId, leadId, reason: escalation.reason }, "dispatch: escalation triggered — locking to human");

        // Lock the lead to human handling
        await db
          .update(leadsTable)
          .set({ activeAgentLock: "human", updatedAt: new Date() })
          .where(eq(leadsTable.id, leadId));

        // Update conversation current_agent to "humano"
        if (ctx.conversation?.id) {
          await db
            .update(conversationsTable)
            .set({ currentAgent: "humano", updatedAt: new Date() })
            .where(eq(conversationsTable.id, ctx.conversation.id));
        }

        // Generate handoff summary for the human agent
        const summary = await generateHandoffSummary(ctx, mensagem, tenantId, log);

        // Log escalation activity
        await db.insert(activitiesTable).values({
          tenantId,
          leadId,
          tipo: "escalacao_humano",
          titulo: "Escalação automática para humano",
          descricao: `${summary.slice(0, 300)}`,
          status: "concluida",
          concluidaEm: new Date(),
          resultadoExecucao: `motivo:${escalation.reason}`,
        });

        // In-app notification (tenant-wide, visible in notifications panel)
        await db.insert(notificationsTable).values({
          tenantId,
          title: "🚨 Lead escalado para atendimento humano",
          message: `Lead *${ctx.lead.nome}* solicitou atendimento humano. Motivo: ${escalation.reason?.replace(/_/g, " ") ?? "não especificado"}. ${summary.slice(0, 150)}`,
          type: "warning",
          category: "escalacao_humano",
        }).catch((err: unknown) => {
          log.warn({ err, tenantId, leadId }, "dispatch: failed to insert escalation in-app notification");
        });

        // Best-effort: notify responsible user via WhatsApp
        if (ctx.lead.assignedTo) {
          const [responsible] = await db
            .select({ telefone: usersTable.telefone })
            .from(usersTable)
            .where(eq(usersTable.id, ctx.lead.assignedTo))
            .limit(1);

          if (responsible?.telefone) {
            const notifMsg =
              `🚨 *Escalação automática*\n` +
              `Lead: *${ctx.lead.nome}*\n` +
              `Motivo: ${escalation.reason?.replace(/_/g, " ") ?? "não especificado"}\n\n` +
              `${summary}`;

            sendDirectWhatsAppMessage(tenantId, responsible.telefone, notifMsg, log).catch((err) => {
              log.warn({ err, tenantId, leadId }, "dispatch: failed to send escalation WhatsApp to responsible");
            });
          }
        }

        return { status: "skipped", reason: `escalated:${escalation.reason}` };
      }
    }

    // 2d. Prospector bot detection — check if this is an active scout/prospector
    // conversation (oportunidade.status = "enviado") and classify the reply for bot patterns.
    // Prevents AI↔bot loops and wasted credits in cold-outreach flows.
    if (!params.forcedAgent) {
      const [activeOp] = await db
        .select()
        .from(scoutOportunidadesTable)
        .where(
          and(
            eq(scoutOportunidadesTable.tenantId, tenantId),
            eq(scoutOportunidadesTable.clienteId, leadId),
            eq(scoutOportunidadesTable.status, "enviado"),
          ),
        )
        .orderBy(desc(scoutOportunidadesTable.createdAt))
        .limit(1);

      if (activeOp) {
        const botResult = await detectBotPattern(
          mensagem,
          ctx.recentMessages,
          tenantId,
          log,
        );

        if (botResult.isHuman) {
          // Real human confirmed — mark oportunidade as responded and let agent reply normally
          await db
            .update(scoutOportunidadesTable)
            .set({ status: "respondeu", respondeu: true })
            .where(eq(scoutOportunidadesTable.id, activeOp.id))
            .catch((err: unknown) => log.warn({ err }, "dispatch: failed to mark oportunidade as respondeu"));

          log.info({ tenantId, leadId, opId: activeOp.id }, "dispatch: prospector human confirmed — proceeding with agent");

        } else if (botResult.isBot) {
          const newCount = (activeOp.sinaisBot ?? 0) + 1;
          log.info({ tenantId, leadId, opId: activeOp.id, sinaisBot: newCount }, "dispatch: prospector bot signal detected");

          if (newCount >= BOT_SIGNAL_THRESHOLD) {
            // Threshold reached — pause prospector, notify operator
            await db
              .update(scoutOportunidadesTable)
              .set({ status: "pendente_revisao_bot", sinaisBot: newCount })
              .where(eq(scoutOportunidadesTable.id, activeOp.id));

            // Build transcript for operator notification
            const transcript = ctx.recentMessages
              .slice(-10)
              .map((m) => `${m.enviadoPor === "lead" ? "🤖 Lead" : "📤 Agente"}: ${m.conteudo}`)
              .join("\n");

            const notifMsg =
              `⚠️ *Possível bot detectado — prospecção pausada*\n` +
              `Lead: *${ctx.lead.nome ?? leadId}*\n` +
              `Sinais de bot: ${newCount}/${BOT_SIGNAL_THRESHOLD}\n\n` +
              `*Transcrição recente:*\n${transcript.slice(0, 600)}\n\n` +
              `Acesse o CRM para decidir o próximo passo: ligar, tentar outro canal ou descartar.`;

            // In-app notification
            await db.insert(notificationsTable).values({
              tenantId,
              title: "⚠️ Prospecção pausada — possível bot detectado",
              message: `Lead *${ctx.lead.nome ?? leadId}* respondeu com padrões de bot por ${newCount} vezes seguidas. Status alterado para revisão manual. ${transcript.slice(0, 200)}`,
              type: "warning",
              category: "prospector_bot",
            } as any).catch((err: unknown) => log.warn({ err }, "dispatch: failed to insert bot notification"));

            // Log activity
            await db.insert(activitiesTable).values({
              tenantId,
              leadId,
              tipo: "prospector_bot_detectado",
              titulo: "Prospecção pausada — bot de atendimento detectado",
              descricao: transcript.slice(0, 500),
              status: "concluida",
              concluidaEm: new Date(),
              resultadoExecucao: `sinais_bot:${newCount}`,
            } as any).catch((err: unknown) => log.warn({ err }, "dispatch: failed to insert bot activity"));

            // Best-effort: notify responsible via WhatsApp
            if (ctx.lead.assignedTo) {
              const [responsible] = await db
                .select({ telefone: usersTable.telefone })
                .from(usersTable)
                .where(eq(usersTable.id, ctx.lead.assignedTo))
                .limit(1);

              if (responsible?.telefone) {
                sendDirectWhatsAppMessage(tenantId, responsible.telefone, notifMsg, log).catch((err: unknown) => {
                  log.warn({ err, tenantId, leadId }, "dispatch: failed to send bot-detection WhatsApp to responsible");
                });
              }
            }

            return { status: "skipped", reason: "prospector_bot_threshold_reached" };

          } else {
            // Below threshold — increment counter and skip AI response to avoid loop
            await db
              .update(scoutOportunidadesTable)
              .set({ sinaisBot: newCount })
              .where(eq(scoutOportunidadesTable.id, activeOp.id));

            log.info({ tenantId, leadId, opId: activeOp.id, sinaisBot: newCount, threshold: BOT_SIGNAL_THRESHOLD }, "dispatch: prospector bot signal below threshold — skipping AI response");
            return { status: "skipped", reason: `prospector_bot_signal_${newCount}` };
          }
        }
        // isBot=false AND isHuman=false (ambiguous) → fall through and let agent reply normally
      }
    }

    // 3. Load open deals for agent routing
    const deals = await db
      .select()
      .from(dealsTable)
      .where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.leadId, leadId)))
      .orderBy(desc(dealsTable.updatedAt));

    // 4. Determine which agent should respond
    let agentName: AgentName;
    if (forcedAgent) {
      agentName = forcedAgent;
    } else {
      const diasSinceContact = daysSinceLastContact(ctx);
      agentName = await determineAgent(ctx.lead, ctx.ci, deals, diasSinceContact, mensagem, tenantId, log, ctx.recentMessages);
    }

    // 4b. (currentAgent update deferred to step 4c below, after resolvedAgentName is known)

    // 5. Check if that agent is enabled
    const agentCfg = config.agents?.[agentName];
    if (!agentCfg?.enabled) {
      // Fall back to SDR if the chosen agent is disabled
      const sdrCfg = config.agents?.["sdr"];
      if (!sdrCfg?.enabled) {
        log.warn({ tenantId, leadId, agentName }, "dispatch: chosen agent and SDR both disabled — skipping");
        return { status: "skipped", reason: "agent_disabled" };
      }
    }

    const resolvedAgentName: AgentName = (agentCfg?.enabled ? agentName : "sdr");

    // 5b. Check plan module authorization
    const planCheck = await checkAgentPlan(tenantId, resolvedAgentName, log, leadId);
    if (!planCheck.allowed) {
      log.warn({ tenantId, leadId, agentName: resolvedAgentName, reason: planCheck.reason }, "dispatch: blocked by plan — skipping");
      return { status: "skipped", reason: "plan_blocked" };
    }

    const resolvedAgentCfg = config.agents?.[resolvedAgentName];

    // 4c. Handoff detection — compare previous agent with resolved agent
    // Read context for prompt injection (from metadata if continuing, generated fresh if handoff)
    const previousAgent = ctx.conversation?.currentAgent;
    let handoffContextForPrompt: string | undefined =
      (ctx.conversation?.metadata?.handoff_context as string | undefined) ?? undefined;

    const isAgentHandoff =
      !!ctx.conversation?.id &&
      !!previousAgent &&
      previousAgent !== resolvedAgentName &&
      previousAgent !== "humano"; // human→AI transitions are NOT agent handoffs

    if (ctx.conversation?.id) {
      if (isAgentHandoff) {
        // Generate handoff summary (awaited — needed for prompt this turn)
        const summary = await generateAgentHandoffSummary(
          ctx, previousAgent!, resolvedAgentName, tenantId, log
        );
        handoffContextForPrompt = summary;

        const existingMeta = ctx.conversation.metadata ?? {};
        await db
          .update(conversationsTable)
          .set({
            currentAgent: resolvedAgentName,
            metadata: { ...existingMeta, handoff_context: summary },
            updatedAt: new Date(),
          })
          .where(eq(conversationsTable.id, ctx.conversation.id))
          .catch((err) => log.warn({ err, conversationId: ctx.conversation!.id }, "dispatch: failed to persist handoff context"));

        // Log handoff activity (non-blocking)
        db.insert(activitiesTable)
          .values({
            tenantId,
            leadId,
            tipo: "handoff_agente",
            titulo: `Handoff: ${previousAgent} → ${resolvedAgentName}`,
            descricao: summary.slice(0, 300),
            status: "concluida",
            concluidaEm: new Date(),
            resultadoExecucao: `de:${previousAgent}|para:${resolvedAgentName}`,
          })
          .catch((err) => log.warn({ err, tenantId, leadId }, "dispatch: failed to insert handoff activity"));

        log.info({ tenantId, leadId, from: previousAgent, to: resolvedAgentName }, "dispatch: agent handoff logged");
      } else {
        // No handoff — update currentAgent only (non-blocking)
        db.update(conversationsTable)
          .set({ currentAgent: resolvedAgentName, updatedAt: new Date() })
          .where(eq(conversationsTable.id, ctx.conversation.id))
          .catch((err) => log.warn({ err, conversationId: ctx.conversation!.id }, "dispatch: failed to update currentAgent"));
      }
    }

    // 6. Check daily/monthly limits
    const limits = computeLimits(config);
    if (!limits.ok) {
      log.warn({ tenantId, leadId, ...limits.body }, "dispatch: limit reached — skipping");
      return { status: "skipped", reason: "limit_reached" };
    }

    // 7. Build prompt and call OpenAI
    const buildPrompt = PROMPT_BUILDERS[resolvedAgentName];
    const scenario = params.scenario ?? null;

    // For reactivation: enrich scenario with DB-sourced hasActiveProposal flag.
    // Checks proposals created in the last 72h — more reliable than scanning recentMessages.
    let enrichedScenario: Record<string, unknown> | null = scenario
      ? { ...(scenario as Record<string, unknown>) }
      : null;
    if (resolvedAgentName === "reactivation") {
      const seventyTwoHoursAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);
      const [recentProposal] = await db
        .select({ id: propostasTable.id })
        .from(propostasTable)
        .where(
          and(
            eq(propostasTable.leadId, leadId),
            eq(propostasTable.tenantId, tenantId),
            or(eq(propostasTable.status, "enviada"), eq(propostasTable.status, "pendente")),
            gte(propostasTable.createdAt, seventyTwoHoursAgo),
          ),
        )
        .limit(1);
      const hasActiveProposal = recentProposal != null;
      enrichedScenario = { ...(enrichedScenario ?? {}), hasActiveProposal };
      log.info(
        { leadId, tenantId, hasActiveProposal },
        "dispatch: reactivation hasActiveProposal computed from DB (last 72h)",
      );
    }

    // For closer: inject active catalog plans so the agent can answer pricing questions.
    if (resolvedAgentName === "closer") {
      const catalogPlans = await db
        .select({
          nome:              produtosCatalogoTable.nome,
          precoBase:         produtosCatalogoTable.precoBase,
          precoImplantacao:  produtosCatalogoTable.precoImplantacao,
          precoMensalidade:  produtosCatalogoTable.precoMensalidade,
        })
        .from(produtosCatalogoTable)
        .where(and(eq(produtosCatalogoTable.tenantId, tenantId), eq(produtosCatalogoTable.ativo, true)))
        .orderBy(produtosCatalogoTable.precoBase)
        .limit(20);
      if (catalogPlans.length > 0) {
        enrichedScenario = { ...(enrichedScenario ?? {}), catalogPlans };
        log.info({ tenantId, count: catalogPlans.length }, "dispatch: closer catalog plans injected");
      }
    }

    // Fetch vendor name and company name for system prompt variable interpolation.
    // These are used to replace placeholders like [Seu Nome] or {empresa_nome} in
    // custom system prompts saved by tenant admins — applied to every agent.
    const [bpRow, tenantRow] = await Promise.all([
      db.select({ nomeFantasia: businessProfilesTable.nomeFantasia })
        .from(businessProfilesTable)
        .where(eq(businessProfilesTable.tenantId, tenantId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db.select({ name: tenantsTable.name })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, tenantId))
        .limit(1)
        .then((rows) => rows[0] ?? null),
    ]);
    const empresaNome = bpRow?.nomeFantasia ?? tenantRow?.name ?? "";
    let vendedorNome = "";
    if (ctx.lead.assignedTo) {
      const [vendedor] = await db
        .select({ name: usersTable.name })
        .from(usersTable)
        .where(eq(usersTable.id, ctx.lead.assignedTo))
        .limit(1);
      vendedorNome = vendedor?.name ?? "";
    }
    if (!vendedorNome) {
      vendedorNome = empresaNome ? `Equipe ${empresaNome}` : "Equipe Comercial";
    }

    // Resolve DB-driven system prompt override
    let dispatchSystemPrompt: string | null = null;
    let spinQualificationForExtraction: SpinQuestion[] | null = null;
    const dispatchAgentKey = AGENT_NAME_TO_KEY[resolvedAgentName];
    if (dispatchAgentKey) {
      try {
        const resolved = await getAgentConfig(tenantId, dispatchAgentKey);
        dispatchSystemPrompt = resolved?.systemPrompt ?? null;

        // Bloco 23: for SDR, inject approved custom SPIN questions into enriched scenario
        if (resolvedAgentName === "sdr" && resolved?.parametros) {
          const sq = (resolved.parametros as Record<string, unknown>).spinQualification as {
            nicheDescription?: string;
            questions?: SpinQuestion[];
            approvedAt?: string | null;
          } | undefined;
          if (sq?.approvedAt && sq.questions && sq.questions.length > 0) {
            enrichedScenario = { ...(enrichedScenario ?? {}), spinQualification: sq };
            spinQualificationForExtraction = sq.questions;
            log.debug({ tenantId, questionCount: sq.questions.length }, "dispatch: custom SPIN qualification injected into SDR scenario");
          }
        }
      } catch (err) {
        log.warn({ err, agentName: resolvedAgentName, tenantId }, "dispatch: getAgentConfig failed, using hardcoded fallback");
      }
    }

    // Apply variable interpolation to the system prompt before sending to OpenAI.
    // Prevents placeholder text like "[Seu Nome]" from leaking to the lead verbatim.
    if (dispatchSystemPrompt) {
      dispatchSystemPrompt = interpolateSystemPrompt(dispatchSystemPrompt, { vendedor_nome: vendedorNome, empresa_nome: empresaNome });
      log.debug({ tenantId, agentName: resolvedAgentName }, "dispatch: system prompt variables interpolated");
    }

    // Inject handoff context at the start of the system prompt if available
    const baseSystemContent = buildPrompt(resolvedAgentCfg?.prompt, ctx, enrichedScenario, dispatchSystemPrompt);
    const systemContent = handoffContextForPrompt
      ? `## Contexto recebido do agente anterior:\n${handoffContextForPrompt}\n\n---\n\n${baseSystemContent}`
      : baseSystemContent;

    const openaiMessages = [
      { role: "system" as const, content: systemContent },
      ...ctx.recentMessages.map(msgToOpenAI),
      { role: "user" as const, content: mensagem },
    ];

    let resposta: string;
    let tokensUsed: number;
    try {
      ({ resposta, tokensUsed } = await callOpenAI(openaiMessages, tenantId, resolvedAgentName, log));
      log.info({ leadId, tenantId, agentName: resolvedAgentName, tokensUsed }, "dispatch: openai call succeeded");
    } catch (err) {
      log.error({ err, leadId, tenantId, agentName: resolvedAgentName }, "dispatch: openai call failed");
      return { status: "failed", reason: "openai_error" };
    }

    // 8. Detect proposal-accept action from closer agent
    let finalResposta = resposta;
    if (resolvedAgentName === "closer" && resposta.includes("{{action:proposal_accept}}")) {
      const openProposals = await db
        .select({ id: propostasTable.id })
        .from(propostasTable)
        .where(
          and(
            eq(propostasTable.leadId, leadId),
            eq(propostasTable.tenantId, tenantId),
            eq(propostasTable.status, "enviada")
          )
        )
        .orderBy(desc(propostasTable.createdAt))
        .limit(1);

      if (openProposals.length > 0) {
        const result = await proposalAccepted(openProposals[0]!.id, "whatsapp", {
          nome: ctx.lead.nome ?? undefined,
        });
        if (result.ok) {
          finalResposta = result.alreadyProcessed
            ? "Sua proposta já tinha sido aceita anteriormente. Vamos seguir com o fechamento!"
            : "Proposta aceita com sucesso! Parabéns, vamos seguir com o fechamento e os próximos passos.";
          log.info({ leadId, tenantId, propostaId: openProposals[0]!.id }, "dispatch: proposal_accept via WhatsApp succeeded");
        } else {
          finalResposta = "Detectei que você quer aceitar, mas tive um problema técnico. Vou chamar a equipe para confirmar manualmente.";
          log.error({ leadId, tenantId, error: result.error }, "dispatch: proposal_accept via WhatsApp failed");
        }
      } else {
        finalResposta = "Agradeço o interesse! Vou verificar a proposta disponível para você.";
        log.info({ leadId, tenantId }, "dispatch: proposal_accept action but no open proposal found");
      }
    }

    // 9. Update counters and insert task
    const now = new Date();
    await updateCounters(config, limits, tokensUsed, now);

    const isAutonomous = !!config.autonomyEnabledAt;
    const task = await insertAndRun({
      tenantId,
      leadId,
      agentName: resolvedAgentName,
      actionType: "enviar_whatsapp",
      resposta: finalResposta,
      isAutonomous,
      now,
      log,
    });

    log.info(
      { taskId: task.id, status: task.status, leadId, tenantId, agentName: resolvedAgentName, tokensUsed, isAutonomous },
      "dispatch: agent task created"
    );

    // 10. Post-response: extract family data from conversation (async, non-blocking)
    if (resolvedAgentName !== "relacionamento") {
      extractFamilyData(tenantId, leadId, ctx, log).catch((err) => {
        log.error({ err, leadId, tenantId }, "dispatch: family extraction failed");
      });
    }

    // 11. Post-response: extract and persist qualification answers after SDR, Closer, and Reactivation turns (async, non-blocking)
    if (["sdr", "closer", "reactivation"].includes(resolvedAgentName)) {
      extractAndSaveQualification(
        tenantId,
        leadId,
        ctx,
        mensagem,
        finalResposta,
        log,
        resolvedAgentName === "sdr" ? spinQualificationForExtraction : null,
      ).catch((err) => {
        log.warn({ err, leadId, tenantId }, "dispatch: qualification extraction failed");
      });
    }

    return { status: "sent", taskId: task.id, agentName: resolvedAgentName, tokensUsed };
  } catch (err) {
    log.error({ err, tenantId, leadId }, "dispatch: unexpected error — skipping");
    return { status: "failed", reason: "unexpected_error" };
  }
}

// ── Family data extraction (async, non-blocking) ─────────────────────────────

/**
 * Uses a lightweight AI call to extract family data from recent conversation messages.
 * Updates the lead record if new data is found (without overwriting existing data).
 */
async function extractFamilyData(
  tenantId: string,
  leadId: string,
  ctx: AgentContext,
  log: Logger,
): Promise<void> {
  const { lead } = ctx;
  const recent = ctx.recentMessages.slice(-10);
  if (recent.length === 0) return;

  const conversationText = recent
    .map((m: { enviadoPor: string; conteudo: string }) => `${m.enviadoPor === "lead" ? "Lead" : "Agente"}: ${m.conteudo}`)
    .join("\n");

  const extractionPrompt =
    `Você é um extrator de dados familiares. Analise a conversa abaixo e extraia informações sobre familiares do lead (cônjuge, filhos, datas de nascimento).
` +
    `Responda APENAS em JSON válido, sem markdown, sem explicações. Use este formato:
` +
    `{"conjugeNome": "...", "conjugeDataNascimento": "YYYY-MM-DD", "filhos": [{"nome": "...", "dataNascimento": "YYYY-MM-DD", "genero": "masculino|feminino"}], "leadDataNascimento": "YYYY-MM-DD", "leadGenero": "masculino|feminino", "leadEstadoCivil": "solteiro|casado|divorciado|viuvo|uniao_estavel"}
` +
    `Se algum campo não for mencionado, omita-o (não use null). Se não houver informações familiares, retorne {}.
` +
    `Atenção: não invente dados. Use apenas o que está explícito na conversa.

Conversa:
${conversationText}`;

  let extracted: Record<string, unknown>;
  try {
    const aiResult = await gatewayFamilyCallOpenAI(
      tenantId,
      "intelligence_analysis",
      [{ role: "user", content: extractionPrompt }],
      { model: "gpt-4.1-mini", maxTokens: 500, temperature: 0.1, log },
    );
    const raw = aiResult.content.trim() || "{}";
    extracted = JSON.parse(raw.replace(/^```json\s*/, "").replace(/\s*```$/, "")) as Record<string, unknown>;
  } catch (err) {
    log.warn({ err, leadId, tenantId }, "dispatch: family extraction AI call failed");
    return;
  }

  if (Object.keys(extracted).length === 0) return;

  const update: Record<string, unknown> = {};

  // Lead personal data
  if (extracted.leadGenero && !lead.genero) {
    update.genero = String(extracted.leadGenero);
  }
  if (extracted.leadDataNascimento && !lead.dataNascimento) {
    const d = String(extracted.leadDataNascimento);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      update.dataNascimento = d;
      const parts = d.split("-");
      update.birthMonth = parseInt(parts[1], 10);
      update.birthDay = parseInt(parts[2], 10);
    }
  }
  if (extracted.leadEstadoCivil && !lead.estadoCivil) {
    update.estadoCivil = String(extracted.leadEstadoCivil);
  }

  // Spouse
  if (extracted.conjugeNome && !lead.conjugeNome) {
    update.conjugeNome = String(extracted.conjugeNome);
  }
  if (extracted.conjugeDataNascimento && !lead.conjugeDataNascimento) {
    const d = String(extracted.conjugeDataNascimento);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      update.conjugeDataNascimento = d;
    }
  }

  // Children
  if (Array.isArray(extracted.filhos) && extracted.filhos.length > 0) {
    const existingFilhos = lead.filhos ?? [];
    const existingNames = new Set(existingFilhos.map((f: { nome: string }) => f.nome.toLowerCase().trim()));
    const newFilhos = (extracted.filhos as unknown[])
      .filter((f: unknown) => {
        if (!f || typeof f !== "object") return false;
        const obj = f as Record<string, unknown>;
        const nome = String(obj.nome ?? "").toLowerCase().trim();
        return nome && !existingNames.has(nome);
      })
      .map((f: unknown) => {
        const obj = f as Record<string, unknown>;
        const child: Record<string, unknown> = {
          nome: String(obj.nome ?? ""),
          dataNascimento: String(obj.dataNascimento ?? ""),
          source: "extracted_from_conversation",
        };
        if (obj.genero) child.genero = String(obj.genero);
        const d = String(obj.dataNascimento ?? "");
        if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
          const parts = d.split("-");
          child.birthMonth = parseInt(parts[1], 10);
          child.birthDay = parseInt(parts[2], 10);
        }
        return child;
      });

    if (newFilhos.length > 0) {
      update.filhos = [...existingFilhos, ...newFilhos];
    }
  }

  if (Object.keys(update).length === 0) return;

  update.updatedAt = new Date();
  await db.update(leadsTable).set(update as Record<string, unknown>).where(eq(leadsTable.id, leadId));
  log.info({ leadId, tenantId, fields: Object.keys(update) }, "dispatch: family data extracted and updated");

  // Check spouse gift consent flow (tenant-gated)
  if (extracted.conjugeNome && !lead.conjugeNome) {
    const [tenantSettings] = await db
      .select({ enableSpouseGiftFlow: tenantCalendarSettingsTable.enableSpouseGiftFlow })
      .from(tenantCalendarSettingsTable)
      .where(eq(tenantCalendarSettingsTable.tenantId, tenantId))
      .limit(1);
    if (tenantSettings?.enableSpouseGiftFlow) {
      const [existingConsent] = await db
        .select()
        .from(leadSpouseConsentTable)
        .where(eq(leadSpouseConsentTable.leadId, leadId))
        .limit(1);
      if (!existingConsent) {
        await db.insert(leadSpouseConsentTable).values({
          tenantId,
          leadId,
          consentStatus: "pending",
          consentGiven: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        log.info({ leadId, tenantId }, "dispatch: spouse consent record created");
      }
    }
  }
}

// ── BRL currency normalizer ───────────────────────────────────────────────────

/**
 * Parses a free-form Portuguese monetary/revenue string into a numeric value.
 * Handles:
 *   "100000"        → 100000
 *   "100.000"       → 100000  (Brazilian thousands separator)
 *   "100,000"       → 100000  (English thousands separator)
 *   "100 mil"       → 100000
 *   "1 milhão"      → 1000000
 *   "1,5 milhão"    → 1500000
 *   "R$ 100.000,00" → 100000
 *   "cem mil reais" → returns null (word numbers not supported, LLM handles those)
 */
function parseBRLText(raw: string): number | null {
  if (!raw || typeof raw !== "string") return null;
  let s = raw
    .toLowerCase()
    .trim()
    .replace(/r\$\s*/g, "")
    .replace(/reais?/g, "")
    .replace(/\s+/g, " ")
    .trim();

  // Detect magnitude multipliers
  let multiplier = 1;
  if (/milh(ã|a)o|milh(õ|o)es|\bmi\b/.test(s)) {
    multiplier = 1_000_000;
    s = s.replace(/milh(ã|a)o|milh(õ|o)es|\bmi\b/g, "").trim();
  } else if (/\bmil\b/.test(s)) {
    multiplier = 1_000;
    s = s.replace(/\bmil\b/g, "").trim();
  }

  // Remove any remaining letters
  s = s.replace(/[a-z]+/g, "").trim();

  // Resolve ambiguous separators:
  // If there are multiple dots → all are thousands separators (1.000.000)
  const dotCount = (s.match(/\./g) ?? []).length;
  const commaCount = (s.match(/,/g) ?? []).length;

  if (dotCount > 1) {
    // 1.000.000 → remove all dots
    s = s.replace(/\./g, "");
  } else if (dotCount === 1 && commaCount === 1) {
    // Determine which is decimal: last one is decimal
    const lastDot   = s.lastIndexOf(".");
    const lastComma = s.lastIndexOf(",");
    if (lastComma > lastDot) {
      // Brazilian: 1.000,50 → dot=thousands, comma=decimal
      s = s.replace(".", "").replace(",", ".");
    } else {
      // English: 1,000.50 → comma=thousands
      s = s.replace(",", "");
    }
  } else if (dotCount === 1) {
    // Single dot: could be thousands (100.000) or decimal (100.50)
    const afterDot = s.split(".")[1] ?? "";
    if (afterDot.length === 3) {
      // Thousands separator: 100.000
      s = s.replace(".", "");
    }
    // else treat as decimal point
  } else if (commaCount === 1) {
    // Single comma: could be thousands (100,000 EN) or decimal (100,50 BR)
    const afterComma = s.split(",")[1] ?? "";
    if (afterComma.length === 3) {
      // Thousands: 100,000
      s = s.replace(",", "");
    } else {
      // Decimal: 100,50
      s = s.replace(",", ".");
    }
  }

  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (!isFinite(n) || n <= 0) return null;
  return n * multiplier;
}

/**
 * Normalizes a free-form monetary/revenue string to "R$ X.XXX,00" format.
 * Returns the original string if parsing fails (safe fallback).
 */
function normalizeToBRL(raw: string): string {
  if (!raw) return raw;
  const n = parseBRLText(raw);
  if (n === null) return raw;
  return n.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ── Qualification extractor ───────────────────────────────────────────────────

/**
 * After an SDR turn, extract qualification answers from the last few messages
 * and persist them to `leads.discovery_data` (and dedicated columns when
 * available). This runs non-blocking so it never delays the WhatsApp reply.
 *
 * Fields extracted: numero_funcionarios, segmento, crm_atual, faturamento,
 * objetivo, dor_principal, orcamento, urgencia.
 */
async function extractAndSaveQualification(
  tenantId: string,
  leadId: string,
  ctx: AgentContext,
  incomingMessage: string,
  agentReply: string,
  log: Logger,
  spinQuestions: SpinQuestion[] | null = null,
): Promise<void> {
  const { lead } = ctx;

  // Build a compact transcript: last 8 messages + the current exchange
  const recentSlice = ctx.recentMessages.slice(-8);
  const transcript = [
    ...recentSlice.map((m) => `${m.enviadoPor === "lead" ? "Lead" : "Agente"}: ${m.conteudo}`),
    `Lead: ${incomingMessage}`,
    `Agente: ${agentReply}`,
  ].join("\n");

  // When tenant has custom SPIN questions, use their fieldKeys and descriptions for extraction.
  // Fallback to generic B2B fields when no custom config is set.
  let extractionPrompt: string;
  if (spinQuestions && spinQuestions.length > 0) {
    const fieldList = spinQuestions.map((q) => `"${q.fieldKey}":"${q.label}"`).join(", ");
    const fieldFormat = `{${spinQuestions.map((q) => `"${q.fieldKey}":"..."`).join(",")}}`;
    extractionPrompt =
      `Você é um extrator de dados de qualificação de vendas. Analise a conversa abaixo e extraia APENAS as informações que o lead afirmou explicitamente. Não infira, não suponha.\n\n` +
      `Campos a extrair (customizados para o nicho): ${fieldList}\n\n` +
      `Responda APENAS em JSON válido, sem markdown, sem explicações. Use este formato:\n` +
      `${fieldFormat}\n\n` +
      `Regras:\n` +
      `- Inclua apenas os campos que o lead afirmou claramente nesta conversa\n` +
      `- Se um campo não foi mencionado, omita-o completamente (não use null, não use "")\n` +
      `- Se não houver nenhum dado, retorne {}\n` +
      `- Valores devem ser curtos e objetivos (máx. 100 caracteres cada)\n\n` +
      `Conversa:\n${transcript}`;
  } else {
    extractionPrompt =
      `Você é um extrator de dados de qualificação de vendas. Analise a conversa abaixo e extraia APENAS as informações que o lead afirmou explicitamente. Não infira, não suponha.\n\n` +
      `Responda APENAS em JSON válido, sem markdown, sem explicações. Use este formato:\n` +
      `{"numero_funcionarios":"...","segmento":"...","crm_atual":"...","faturamento":"...","objetivo":"...","dor_principal":"...","orcamento":"...","urgencia":"..."}\n\n` +
      `Regras:\n` +
      `- Inclua apenas os campos que o lead afirmou claramente\n` +
      `- Se um campo não foi mencionado, omita-o completamente (não use null, não use "")\n` +
      `- Se não houver nenhum dado, retorne {}\n` +
      `- Valores devem ser curtos e objetivos (máx. 100 caracteres cada)\n` +
      `- Para campos monetários (faturamento, orcamento): retorne APENAS o número puro, sem símbolo de moeda e sem separadores de milhar (ex: lead disse "100 mil" → retorne "100000"; "1,5 milhão" → "1500000"; "100.000" → "100000")\n\n` +
      `Conversa:\n${transcript}`;
  }

  let extracted: Record<string, unknown>;
  try {
    const aiResult = await gatewayFamilyCallOpenAI(
      tenantId,
      "intelligence_analysis",
      [{ role: "user", content: extractionPrompt }],
      { model: "gpt-4.1-mini", maxTokens: 300, temperature: 0.0, log },
    );
    const raw = (aiResult.content ?? "{}").trim();
    extracted = JSON.parse(raw.replace(/^```json\s*/, "").replace(/\s*```$/, "")) as Record<string, unknown>;
  } catch (err) {
    log.warn({ err, leadId, tenantId }, "dispatch: qualification extraction AI call failed");
    return;
  }

  if (Object.keys(extracted).length === 0) return;

  // Normalize monetary fields to "R$ X.XXX,00" before persisting (generic fields only)
  if (!spinQuestions) {
    if (extracted.faturamento) extracted.faturamento = normalizeToBRL(String(extracted.faturamento));
    if (extracted.orcamento)   extracted.orcamento   = normalizeToBRL(String(extracted.orcamento));
  }

  // Merge into existing discoveryData (never overwrite already-set values)
  const existingDd = (lead.discoveryData ?? {}) as Record<string, unknown>;
  const mergedDd: Record<string, unknown> = { ...existingDd };
  for (const [k, v] of Object.entries(extracted)) {
    if (v && !existingDd[k]) mergedDd[k] = v;
  }

  // Build lead update: discoveryData + dedicated columns (only for generic fields, not custom SPIN)
  const update: Record<string, unknown> = { discoveryData: mergedDd, updatedAt: new Date() };
  if (!spinQuestions) {
    if (extracted.objetivo && !lead.objetivo)          update.objetivo = String(extracted.objetivo);
    if (extracted.dor_principal && !lead.dorPrincipal) update.dorPrincipal = String(extracted.dor_principal);
    if (extracted.orcamento && !lead.orcamento)        update.orcamento = String(extracted.orcamento);
    if (extracted.urgencia && !lead.urgencia)          update.urgencia = String(extracted.urgencia);
    if (extracted.numero_funcionarios && !lead.tamanhoEquipe) {
      update.tamanhoEquipe = String(extracted.numero_funcionarios);
    }
  }

  await db.update(leadsTable).set(update).where(
    and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)),
  );
  log.info(
    { leadId, tenantId, extracted: Object.keys(extracted), mode: spinQuestions ? "custom-spin" : "generic" },
    "dispatch: qualification data extracted and saved",
  );
}

// ── Fire-and-forget wrapper ───────────────────────────────────────────────────

/**
 * Starts agent dispatch as a background task (never blocks the caller).
 * Errors are caught and logged; the Promise is never awaited by the caller.
 */
export function dispatchAgentBackground(params: {
  tenantId: string;
  leadId:   string;
  mensagem: string;
  log:      Logger;
  forcedAgent?: AgentName;
  scenario?: Record<string, unknown> | null;
}): void {
  processAgentInternal(params).catch((err) => {
    params.log.error({ err, ...params }, "dispatch: unhandled error in background task");
  });
}
