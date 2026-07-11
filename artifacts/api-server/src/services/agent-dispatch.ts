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
  agendamentosTable,
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
  leadBriefingsTable,
  relatosTecnicosTable,
} from "@workspace/db";
import { callOpenAI as gatewayFamilyCallOpenAI } from "../lib/ai-gateway.js";
import { detectEscalationTrigger, generateHandoffSummary } from "./escalation.js";
import { detectBotPattern, BOT_SIGNAL_THRESHOLD } from "./bot-detection.js";
import { classifyFinancialIntent } from "./financial-intent.js";
import { handleDeliveryFeedbackReply } from "./post-venda.js";
import { handleSequenceOfferReply } from "./sequence-offer.js";
import { generateAgentHandoffSummary } from "./handoff.js";
import { sendDirectWhatsAppMessage, sendDirectWhatsAppDocument } from "./omnichannel.js";
import { generateQuoteComercialPdf } from "../lib/pdf-quote-comercial.js";
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
import { createQuoteFromCatalogPlan } from "./auto-quote.js";
import { checkAgentPlan } from "../middlewares/plan-guard.js";

type Lead    = typeof leadsTable.$inferSelect;
type CI      = typeof customerIntelligenceTable.$inferSelect;

// ── Maturity survey helpers ───────────────────────────────────────────────────

const SURVEY_KEYWORDS = ["1️⃣", "2️⃣", "3️⃣", "manualmente", "sem sistema", "sem IA", "automação de alguma forma"];

function isSurveyMessage(conteudo: string): boolean {
  return SURVEY_KEYWORDS.some((kw) => conteudo.includes(kw));
}

/**
 * Attempts to infer maturity level (1-3) from a free-text reply.
 * Returns null if no signal is confident enough.
 */
function inferMaturityFromText(text: string): number | null {
  const lower = text.toLowerCase();
  // Level 3: already uses AI / automation
  if (/\b(ia\b|inteligência artificial|chatbot|automação|automat|bot\b|robô|gpt|openai|copilot|ai\b)\b/.test(lower)) return 3;
  // Level 2: has a system but no AI keyword
  if (/\b(sistema|crm|erp|software|ferramenta|plataforma|app\b|aplicativo|programa|rdstation|pipedrive|bitrix|hubspot|zendesk)\b/.test(lower)) return 2;
  // Level 1: explicitly manual
  if (/\b(manual|na mão|no braço|manualmente|sem sistema|não uso|nenhum sistema|tudo na mão|só eu|respondo eu|faço eu)\b/.test(lower)) return 1;
  return null;
}
type Deal    = typeof dealsTable.$inferSelect;
type Message = typeof messagesTable.$inferSelect;

// ── Per-lead processing mutex ─────────────────────────────────────────────────
// Prevents two concurrent processAgentInternal calls for the same lead from
// both sending a WhatsApp message (race condition when webhook + UI fire together).
const processingLeads = new Set<string>();

// ── System prompt variable interpolation ──────────────────────────────────────

/**
 * Replaces common placeholder tokens in a system prompt stored in the DB.
 * Supported tokens (case-insensitive):
 *   - [Seu Nome] | [Nome] | {vendedor_nome} | {{vendedor_nome}} → vendor name
 *   - [Empresa]  | {empresa_nome} | {{empresa_nome}}            → company name
 *   - [Link da Reunião](#) | [Link da Reuniao] | {link_reuniao} → actual meet link
 * Any remaining unrecognised [Placeholder] pattern is stripped to prevent literal
 * bracket text leaking to the lead.
 */
function interpolateSystemPrompt(
  text: string,
  vars: { vendedor_nome: string; empresa_nome: string; link_reuniao?: string },
): string {
  let out = text;
  out = out.replace(/\[Seu\s+Nome\]|\[Nome\]|\{?\{vendedor_nome\}\}?/gi, vars.vendedor_nome);
  out = out.replace(/\[Empresa\]|\{?\{empresa_nome\}\}?/gi, vars.empresa_nome);
  // Replace meeting link placeholders — must run BEFORE the catch-all removal below
  const meetPlaceholder = /\[Link\s+da\s+Reuni[aã]o\]\s*\(#?\)|\[Link\s+da\s+Reuni[aã]o\]|\{?\{?link_reuni[aã]o\}?\}?/gi;
  out = out.replace(meetPlaceholder, vars.link_reuniao ?? "");
  // Remove any leftover [Unknown Placeholder] patterns (1–60 chars between brackets)
  out = out.replace(/\[[^\]]{1,60}\]/g, "");
  return out;
}

/**
 * Final safety pass on every LLM response before it reaches the lead.
 * Catches placeholder patterns that survived input-prompt sanitization or were
 * reproduced by the model from training memory.
 *
 * - Meeting-link placeholders → real link if available, or a safe human fallback
 * - [Something](#) patterns   → removed (markdown placeholder links with bare "#" href)
 * - Known named placeholders  → replaced with real values (belt-and-suspenders after prompt interpolation)
 */
function sanitizeAgentResponse(text: string, meetLink?: string | null, vendedorNome?: string): string {
  // 1. Meeting-link placeholders → real link or safe fallback (never raw placeholder text)
  const meetPlaceholder = /\[Link\s+da\s+Reuni[aã]o\]\s*\(#?\)|\[Link\s+da\s+Reuni[aã]o\]|\{?\{?link_reuni[aã]o\}?\}?/gi;
  text = text.replace(meetPlaceholder, meetLink ?? "vou te enviar o link em instantes");

  // 2. Any remaining [Text](#) — markdown-style placeholder link with literal "#" href.
  //    A real URL in agent output never uses bare "#"; these are always template artifacts.
  text = text.replace(/\[[^\]]{1,80}\]\(#\)/g, "");

  // 3. Named placeholder variants that the LLM might echo from the custom prompt template.
  //    Replace with the real name when available so "Meu nome é [Seu Nome]" → "Meu nome é João".
  const nomeFallback = vendedorNome?.trim() || "";
  text = text.replace(/\[Seu\s+Nome\]|\[Nome\]|\{?\{?vendedor_nome\}?\}?/gi, nomeFallback);
  text = text.replace(/\[Empresa\]|\{?\{?empresa_nome\}?\}?/gi, "");

  // 4. Defense-in-depth: intercept free-form LLM denials of ability to send/provide a
  //    meeting link. These are hallucinations that bypass placeholder detection — the
  //    scheduler agent can always relay a link, so these responses are always wrong.
  //    Catches: "não tenho capacidade de enviar links", "infelizmente não posso enviar
  //    o link", "não consigo fornecer links", etc.
  const linkDenialPatterns = [
    /não\s+(?:tenho(?:\s+a\s*)?(?:capacidade(?:\s+de)?)?|posso|consigo)\s+(?:enviar|compartilhar|fornecer|disponibilizar)\s+(?:o\s+)?links?/i,
    /infelizmente[,\s]+não\s+(?:tenho|posso|consigo)[\w\s,áéíóúâãõ]{0,40}links?/i,
    /não\s+(?:é\s+possível|estou\s+apto\s+a)\s+(?:enviar|compartilhar|fornecer)\s+(?:o\s+)?links?/i,
    /não\s+(?:tenho|possuo)\s+acesso\s+(?:ao|a\s+um)\s+links?/i,
  ];
  if (linkDenialPatterns.some((re) => re.test(text))) {
    text = meetLink
      ? `Claro! Aqui está o link da reunião: ${meetLink}`
      : "Vou te encaminhar o link em instantes!";
  }

  return text.trim();
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

    // (d) Lead is brand-new or originates from the cold prospector pipeline.
    //     These leads have zero contact history, so churnRisk is artificially
    //     inflated to 100 — it does not represent genuine inactivity of a prior
    //     customer. Routing them to reactivation is incorrect and causes a
    //     duplicate message (prospector sends frio_teste → lead replies →
    //     reactivation fires a second message). Always fall through to SDR.
    const isNewOrColdProspect = lead.status === "novo" || lead.source === "prospector";

    if (hasAdvancedDeal || hasRecentAgentActivity || leadWasRecentlyActive || isNewOrColdProspect) {
      log.info(
        {
          tenantId,
          leadId: lead.id,
          churnRisk: ci.churnRisk,
          hasAdvancedDeal,
          hasRecentAgentActivity,
          leadWasRecentlyActive,
          isNewOrColdProspect,
          source: lead.source,
          status: lead.status,
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

  // ── Per-lead mutex: skip if already processing for this lead ────────────────
  // Prevents duplicate responses when the webhook fires concurrently with a
  // UI-triggered scheduler call for the same lead.
  const lockKey = `${tenantId}:${leadId}`;
  if (processingLeads.has(lockKey)) {
    log.warn({ tenantId, leadId }, "dispatch: already processing for this lead — skipping duplicate call");
    return { status: "skipped", reason: "duplicate_processing" };
  }
  processingLeads.add(lockKey);

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

    // For scheduler: inject the most recent active agendamento so the agent knows the real
    // meet link and can reference it instead of echoing a placeholder.
    if (resolvedAgentName === "scheduler") {
      try {
        const [latestAgendamento] = await db
          .select({
            tipo:           agendamentosTable.tipo,
            dataHoraInicio: agendamentosTable.dataHoraInicio,
            dataHoraFim:    agendamentosTable.dataHoraFim,
            local:          agendamentosTable.local,
            meetLink:       agendamentosTable.meetLink,
          })
          .from(agendamentosTable)
          .where(
            and(
              eq(agendamentosTable.tenantId, tenantId),
              eq(agendamentosTable.leadId, leadId),
              eq(agendamentosTable.status, "agendado"),
            ),
          )
          .orderBy(desc(agendamentosTable.dataHoraInicio))
          .limit(1);
        if (latestAgendamento) {
          enrichedScenario = { ...(enrichedScenario ?? {}), ...latestAgendamento };
          log.debug({ tenantId, leadId, meetLink: latestAgendamento.meetLink }, "dispatch: scheduler agendamento injected into scenario");
        }
      } catch (err) {
        log.warn({ err, tenantId, leadId }, "dispatch: scheduler agendamento lookup failed (non-fatal)");
      }
    }

    // For closer: inject agendamento (meet link) + active catalog plans (enterprise-first)
    // and handle contract data collection mode when lead already accepted a proposal.
    if (resolvedAgentName === "closer") {
      try {
        const [latestCloserAgendamento] = await db
          .select({
            tipo:           agendamentosTable.tipo,
            dataHoraInicio: agendamentosTable.dataHoraInicio,
            dataHoraFim:    agendamentosTable.dataHoraFim,
            local:          agendamentosTable.local,
            meetLink:       agendamentosTable.meetLink,
          })
          .from(agendamentosTable)
          .where(
            and(
              eq(agendamentosTable.tenantId, tenantId),
              eq(agendamentosTable.leadId, leadId),
              eq(agendamentosTable.status, "agendado"),
            ),
          )
          .orderBy(desc(agendamentosTable.dataHoraInicio))
          .limit(1);
        if (latestCloserAgendamento) {
          enrichedScenario = { ...(enrichedScenario ?? {}), ...latestCloserAgendamento };
          log.debug({ tenantId, leadId, meetLink: latestCloserAgendamento.meetLink }, "dispatch: closer agendamento injected into scenario");
        }
      } catch (err) {
        log.warn({ err, tenantId, leadId }, "dispatch: closer agendamento lookup failed (non-fatal)");
      }

      const catalogPlans = await db
        .select({
          id:                produtosCatalogoTable.id,
          nome:              produtosCatalogoTable.nome,
          precoBase:         produtosCatalogoTable.precoBase,
          precoImplantacao:  produtosCatalogoTable.precoImplantacao,
          precoMensalidade:  produtosCatalogoTable.precoMensalidade,
        })
        .from(produtosCatalogoTable)
        .where(and(eq(produtosCatalogoTable.tenantId, tenantId), eq(produtosCatalogoTable.ativo, true)))
        .orderBy(desc(produtosCatalogoTable.precoBase))
        .limit(20);
      if (catalogPlans.length > 0) {
        enrichedScenario = { ...(enrichedScenario ?? {}), catalogPlans };
        log.info({ tenantId, count: catalogPlans.length }, "dispatch: closer catalog plans injected (enterprise-first)");
      }

      // If the lead previously accepted a proposal but we deferred to collect
      // contract data, inject the collect_contract_data scenario so the Closer
      // asks for the next missing field conversationally.
      const leadDd = (ctx.lead.discoveryData ?? {}) as Record<string, unknown>;
      if (leadDd.pendingProposalAccept === true) {
        const missingFields = getMissingContractFields(ctx.lead);
        if (missingFields.length > 0) {
          enrichedScenario = {
            ...(enrichedScenario ?? {}),
            collectContractData: true,
            missingContractFields: missingFields,
            nextMissingFieldLabel: CONTRACT_FIELD_PROMPTS[missingFields[0]!] ?? missingFields[0],
          };
          log.info({ tenantId, leadId, missingFields }, "dispatch: closer contract data collection mode");
        }
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

    // ── Maturity survey response detection (frio_teste pesquisa) ─────────────
    // When the lead replies after the survey message, detect and persist the
    // maturity level so it's available in the scenario AND in the lead record.
    if (resolvedAgentName === "sdr") {
      try {
        const trimmedMsg = mensagem.trim();
        const lastAgentMsg = [...ctx.recentMessages].reverse().find((m) => m.enviadoPor === "agente_ia");
        const lastWasSurvey = !!(lastAgentMsg?.conteudo && isSurveyMessage(lastAgentMsg.conteudo));

        if (lastWasSurvey) {
          // Numeric direct reply (1, 2 or 3)
          const numericAnswer = /^[123]$/.test(trimmedMsg) ? parseInt(trimmedMsg, 10) : null;
          // Text-based inference (free text after survey)
          const inferredAnswer = numericAnswer ?? inferMaturityFromText(trimmedMsg);

          if (inferredAnswer) {
            enrichedScenario = { ...(enrichedScenario ?? {}), maturityLevel: inferredAnswer };
            log.info({ tenantId, leadId: ctx.lead.id, maturityLevel: inferredAnswer, numeric: !!numericAnswer },
              "dispatch: maturity survey answer detected — injecting into SDR scenario");

            // Persist to leads table (non-blocking — failures must not break the reply)
            db.update(leadsTable)
              .set({
                maturidadeIA: inferredAnswer,
                dataRespostaPesquisa: new Date(),
                updatedAt: new Date(),
              })
              .where(eq(leadsTable.id, ctx.lead.id))
              .catch((err) => log.warn({ err, leadId: ctx.lead.id }, "dispatch: failed to persist maturidadeIA"));
          }
        }
      } catch (err) {
        log.warn({ err }, "dispatch: maturity detection failed, continuing");
      }
    }

    // Apply variable interpolation to the system prompt before sending to OpenAI.
    // Prevents placeholder text like "[Seu Nome]" or "[Link da Reunião](#)" from leaking verbatim.
    const schedulerMeetLink =
      (resolvedAgentName === "scheduler" || resolvedAgentName === "closer") && enrichedScenario
        ? (enrichedScenario.meetLink as string | null | undefined) ?? undefined
        : undefined;
    if (dispatchSystemPrompt) {
      dispatchSystemPrompt = interpolateSystemPrompt(dispatchSystemPrompt, {
        vendedor_nome: vendedorNome,
        empresa_nome:  empresaNome,
        link_reuniao:  schedulerMeetLink,
      });
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

    // 8. Detect special Closer actions in the response.
    let finalResposta = resposta;

    // 8a. {{action:generate_quote}} — Closer asked for a formal quote to be generated.
    // Use the most expensive active catalog plan (enterprise-first ordering).
    if (resolvedAgentName === "closer" && resposta.includes("{{action:generate_quote}}")) {
      const catalogPlansForQuote = (enrichedScenario?.catalogPlans ?? []) as Array<{ id: string; nome: string }>;
      const topPlan = catalogPlansForQuote[0] ?? null;
      if (topPlan?.id) {
        try {
          const quoteResult = await createQuoteFromCatalogPlan({
            tenantId,
            leadId,
            productId: topPlan.id,
            log,
          });
          if (quoteResult) {
            finalResposta =
              `Preparei o orçamento formal **${quoteResult.numero}** para o plano **${quoteResult.nomePlano}** e estou enviando agora como documento anexo. ` +
              `Quer que eu explique o que está incluso ou tira alguma dúvida?`;
            log.info({ leadId, tenantId, numero: quoteResult.numero, plano: quoteResult.nomePlano }, "dispatch: formal quote generated via Closer action");

            // Generate and send PDF attachment (fire-and-forget — text response goes first)
            const leadNomeForPdf = ctx.lead.nome ?? ctx.lead.telefone ?? "Cliente";
            const leadTelefone   = ctx.lead.telefone;
            if (leadTelefone) {
              generateQuoteComercialPdf({
                leadNome:         leadNomeForPdf,
                numero:           quoteResult.numero,
                nomePlano:        quoteResult.nomePlano,
                precoImplantacao: quoteResult.precoImplantacao,
                precoMensalidade: quoteResult.precoMensalidade,
                recorrencia:      quoteResult.recorrencia,
                empresaNome,
              })
                .then((pdfBuffer) => {
                  const fileName = `Orçamento-VendorAI-${quoteResult.numero}.pdf`;
                  return sendDirectWhatsAppDocument(tenantId, leadTelefone, pdfBuffer, fileName, `Orçamento ${quoteResult.numero} — ${quoteResult.nomePlano}`, log);
                })
                .catch((err) => log.error({ err, leadId, tenantId, numero: quoteResult.numero }, "dispatch: quote PDF send failed (non-fatal)"));
            }
          } else {
            finalResposta = "Vou preparar o orçamento e enviar em seguida. Você pode me dar um momento?";
            log.warn({ leadId, tenantId }, "dispatch: generate_quote action but no plan found or creation failed");
          }
        } catch (err) {
          finalResposta = "Vou preparar o orçamento e enviar em seguida. Você pode me dar um momento?";
          log.error({ err, leadId, tenantId }, "dispatch: generate_quote action threw");
        }
      } else {
        finalResposta = "Deixa eu puxar os valores atualizados para você. Um instante!";
        log.warn({ leadId, tenantId }, "dispatch: generate_quote action but catalogPlans empty");
      }
    }

    // 8b. {{action:proposal_accept}} — Closer detected the lead is accepting.
    // Before proceeding: ensure all required contract fields are present.
    // If any are missing, defer acceptance and start collecting them conversationally.
    if (resolvedAgentName === "closer" && resposta.includes("{{action:proposal_accept}}")) {
      const missingFields = getMissingContractFields(ctx.lead);

      if (missingFields.length > 0) {
        // Defer acceptance — save pending flag in discoveryData and ask for first field.
        const existingDd = (ctx.lead.discoveryData ?? {}) as Record<string, unknown>;
        await db
          .update(leadsTable)
          .set({ discoveryData: { ...existingDd, pendingProposalAccept: true }, updatedAt: new Date() })
          .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));
        const firstFieldPrompt = CONTRACT_FIELD_PROMPTS[missingFields[0]!] ?? "Pode me confirmar algumas informações?";
        finalResposta = `Que ótimo! Para eu poder formalizar o contrato agora mesmo, preciso de uma informação rápida. ${firstFieldPrompt}`;
        log.info({ leadId, tenantId, missingFields }, "dispatch: proposal_accept deferred — collecting contract data");
      } else {
        // All contract data present — proceed with acceptance.
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
              : "Proposta aceita! Estou gerando o contrato agora — você receberá o link por e-mail em breve. 🎉";
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
    }

    // 8c. Contract data collection — if the lead is in pending-accept mode, synchronously
    // extract any contract fields from this message, then check if we can now proceed.
    // This runs ONLY when the response was NOT already a proposal_accept or generate_quote action
    // (those cases are handled above), i.e., when the Closer was asking for contract data fields.
    if (
      resolvedAgentName === "closer" &&
      !resposta.includes("{{action:proposal_accept}}") &&
      !resposta.includes("{{action:generate_quote}}")
    ) {
      const currentDd = (ctx.lead.discoveryData ?? {}) as Record<string, unknown>;
      if (currentDd.pendingProposalAccept === true) {
        // Synchronously extract contract fields from the incoming message and save them.
        await extractAndSaveContractFields(tenantId, leadId, ctx.lead, mensagem, log);

        // Re-load the lead to check if all required fields are now present.
        const [refreshedLead] = await db
          .select({
            email:                     leadsTable.email,
            documento:                 leadsTable.documento,
            endereco:                  leadsTable.endereco,
            representanteCargo:        leadsTable.representanteCargo,
            representanteNacionalidade: leadsTable.representanteNacionalidade,
            representanteEstadoCivil:  leadsTable.representanteEstadoCivil,
            representanteProfissao:    leadsTable.representanteProfissao,
            representanteRg:           leadsTable.representanteRg,
            discoveryData:             leadsTable.discoveryData,
          })
          .from(leadsTable)
          .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
          .limit(1);

        const stillMissing = getMissingContractFields(refreshedLead ?? null);

        if (stillMissing.length === 0) {
          // All fields collected — find open proposal and complete acceptance.
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
            const acceptResult = await proposalAccepted(openProposals[0]!.id, "whatsapp", {
              nome: ctx.lead.nome ?? undefined,
            });
            // Clear the pendingProposalAccept flag.
            const updDd = ((refreshedLead?.discoveryData ?? {}) as Record<string, unknown>);
            delete updDd.pendingProposalAccept;
            await db
              .update(leadsTable)
              .set({ discoveryData: updDd, updatedAt: new Date() })
              .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

            if (acceptResult.ok) {
              finalResposta =
                "Perfeito, todas as informações foram confirmadas! Estou gerando o contrato agora — você receberá o link por e-mail em breve. 🎉";
              log.info({ leadId, tenantId, propostaId: openProposals[0]!.id }, "dispatch: contract data complete — proposal accepted");
            }
          }
        }
        // If stillMissing.length > 0: LLM already generated the "ask for next field" response.
      }
    }

    // 8d. {{action:relato_tecnico}} — Service agent flagged a potential technical bug.
    // Strip the marker from the user-facing response and create a relatos_tecnicos record
    // non-blockingly (does NOT delay the response to the lead).
    if (resolvedAgentName === "service" && finalResposta.includes("{{action:relato_tecnico}}")) {
      finalResposta = finalResposta.replace(/\{\{action:relato_tecnico\}\}/g, "").trim();

      const capturedMessages = ctx.recentMessages.slice(-4);
      const capturedMensagem = mensagem;
      const capturedConversationId = ctx.conversation?.id ?? null;

      void (async () => {
        try {
          const transcript = [
            ...capturedMessages.map((m) =>
              `${m.enviadoPor === "agente_ia" ? "Agente" : "Cliente"}: ${m.conteudo ?? ""}`
            ),
            `Cliente: ${capturedMensagem}`,
          ].join("\n");

          const descResult = await callOpenAI(
            [
              {
                role: "system" as const,
                content:
                  "Você é um analista técnico de software. Dado o trecho de conversa de suporte abaixo, " +
                  "gere um resumo técnico e objetivo do problema relatado pelo cliente (2-4 frases). " +
                  "Inclua: qual funcionalidade está com problema, o comportamento esperado vs. o observado, e contexto relevante. " +
                  "Foque no problema técnico, não na emoção do cliente. " +
                  "Se não conseguir identificar um problema técnico concreto, responda apenas: NÃO_IDENTIFICADO",
              },
              { role: "user" as const, content: transcript },
            ],
            tenantId,
            "relato_tecnico",
            log,
          );

          const descricao = descResult.resposta?.trim() ?? "";
          if (descricao && descricao !== "NÃO_IDENTIFICADO") {
            await db.insert(relatosTecnicosTable).values({
              tenantId,
              leadId: leadId ?? null,
              conversationId: capturedConversationId,
              descricaoProblema: descricao,
              transcriptRelevante: transcript,
              status: "pendente_revisao",
            });
            log.info({ leadId, tenantId }, "dispatch: relato_tecnico created (pendente_revisao)");
          }
        } catch (err) {
          log.error({ err, leadId, tenantId }, "dispatch: relato_tecnico creation failed (non-critical)");
        }
      })();
    }

    // 8b. Final response sanitization — strip any unresolved placeholder patterns before
    //     the message reaches the lead. Defense-in-depth: catches the case where the LLM
    //     reproduces a placeholder verbatim (e.g. "[Link da Reunião](#)") despite the
    //     prompt having been sanitized on the way in.
    finalResposta = sanitizeAgentResponse(finalResposta, schedulerMeetLink, vendedorNome);

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

      extractAndSaveSpinBriefing(
        tenantId,
        leadId,
        ctx,
        mensagem,
        finalResposta,
        log,
        resolvedAgentName === "sdr" ? spinQualificationForExtraction : null,
      ).catch((err) => {
        log.warn({ err, leadId, tenantId }, "dispatch: SPIN briefing extraction failed");
      });
    }

    return { status: "sent", taskId: task.id, agentName: resolvedAgentName, tokensUsed };
  } catch (err) {
    log.error({ err, tenantId, leadId }, "dispatch: unexpected error — skipping");
    return { status: "failed", reason: "unexpected_error" };
  } finally {
    processingLeads.delete(lockKey);
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

// ── SPIN Briefing extractor ───────────────────────────────────────────────

/**
 * After each SDR/closer/reactivation turn, extract SPIN qualification answers
 * from the conversation and persist them to `lead_briefings`. Runs non-blocking.
 * Only fills empty fields — never overwrites already-recorded answers.
 */
async function extractAndSaveSpinBriefing(
  tenantId: string,
  leadId: string,
  ctx: AgentContext,
  incomingMessage: string,
  agentReply: string,
  log: Logger,
  spinQuestions: SpinQuestion[] | null = null,
): Promise<void> {
  const recentSlice = ctx.recentMessages.slice(-8);
  const transcript = [
    ...recentSlice.map((m) => `${m.enviadoPor === "lead" ? "Lead" : "Agente"}: ${m.conteudo}`),
    `Lead: ${incomingMessage}`,
    `Agente: ${agentReply}`,
  ].join("\n");

  let customHints = "";
  if (spinQuestions && spinQuestions.length > 0) {
    const byTipo = (tipo: string) =>
      spinQuestions.filter((q) => q.tipo === tipo).map((q) => q.label).join(" / ");
    customHints =
      `\nPerguntas SPIN customizadas do tenant para referência:\n` +
      `S - Situação: ${byTipo("situacao") || "—"}\n` +
      `P - Problema: ${byTipo("problema") || "—"}\n` +
      `I - Implicação: ${byTipo("implicacao") || "—"}\n` +
      `N - Necessidade: ${byTipo("necessidade") || "—"}\n`;
  }

  const prompt =
    `Você é um extrator de qualificação SPIN Selling. Analise a conversa e extraia o que o lead afirmou explicitamente. Não infira.\n` +
    `Responda APENAS em JSON válido, sem markdown:\n` +
    `{"situacao":"contexto atual do negócio mencionado ou null","problema":"dificuldades/dores mencionadas ou null","implicacao":"impacto/consequência do problema ou null","necessidade":"o que o lead precisa resolver ou null","valorImpacto":"valor ou número mencionado ou null"}\n` +
    `Regras:\n- Se não foi mencionado explicitamente, use null\n- Valores devem ser curtos (máx 200 caracteres)` +
    customHints +
    `\n\nConversa:\n${transcript}`;

  let extracted: { situacao?: string | null; problema?: string | null; implicacao?: string | null; necessidade?: string | null; valorImpacto?: string | null };
  try {
    const aiResult = await gatewayFamilyCallOpenAI(
      tenantId,
      "intelligence_analysis",
      [{ role: "user", content: prompt }],
      { model: "gpt-4.1-mini", maxTokens: 400, temperature: 0.0, log },
    );
    const raw = (aiResult.content ?? "{}").trim().replace(/^```json\s*/, "").replace(/\s*```$/, "");
    extracted = JSON.parse(raw) as typeof extracted;
  } catch (err) {
    log.warn({ err, leadId, tenantId }, "dispatch: SPIN briefing AI extraction failed");
    return;
  }

  const hasAny = extracted.situacao || extracted.problema || extracted.implicacao || extracted.necessidade || extracted.valorImpacto;
  if (!hasAny) return;

  const [existing] = await db
    .select()
    .from(leadBriefingsTable)
    .where(and(eq(leadBriefingsTable.leadId, leadId), eq(leadBriefingsTable.tenantId, tenantId)))
    .limit(1);

  const hasFilled = (arr: Array<{ answer: string }> | null | undefined) =>
    arr && arr.some((a) => a.answer && a.answer.trim().length > 0);

  const upd: Record<string, unknown> = { updatedAt: new Date() };
  if (extracted.situacao && !hasFilled(existing?.situationAnswers)) {
    upd.situationAnswers = [{ question: "Situação atual do cliente (extraído da conversa)", answer: extracted.situacao }];
  }
  if (extracted.problema && !hasFilled(existing?.problemAnswers)) {
    upd.problemAnswers = [{ question: "Problema/dor identificada (extraído da conversa)", answer: extracted.problema }];
  }
  if (extracted.implicacao && !hasFilled(existing?.implicationAnswers)) {
    upd.implicationAnswers = [{ question: "Impacto do problema (extraído da conversa)", answer: extracted.implicacao }];
  }
  if (extracted.necessidade && !hasFilled(existing?.needAnswers)) {
    upd.needAnswers = [{ question: "O que o cliente precisa resolver (extraído da conversa)", answer: extracted.necessidade }];
  }
  if (extracted.valorImpacto && !existing?.implicationEstimatedValue) {
    upd.implicationEstimatedValue = extracted.valorImpacto;
  }

  if (Object.keys(upd).length <= 1) return;

  if (existing) {
    await db.update(leadBriefingsTable).set(upd).where(eq(leadBriefingsTable.id, existing.id));
  } else {
    await db.insert(leadBriefingsTable).values({ tenantId, leadId, ...upd });
  }
  log.info({ leadId, tenantId, fields: Object.keys(upd).filter((k) => k !== "updatedAt") }, "dispatch: SPIN briefing extracted and persisted");
}

// ── Contract data collection helpers ─────────────────────────────────────────

/**
 * Fields required on the lead before a formal contract can be generated.
 * Collected conversationally by the Closer when the lead accepts a proposal
 * and any of these are missing.
 */
const CONTRACT_REQUIRED_FIELDS = [
  "email",
  "documento",
  "endereco",
  "representanteCargo",
  "representanteNacionalidade",
  "representanteEstadoCivil",
  "representanteProfissao",
  "representanteRg",
] as const;

/** Human-readable question to ask the lead for each missing field. */
const CONTRACT_FIELD_PROMPTS: Record<string, string> = {
  email:                      "Qual é o seu e-mail para receber o contrato?",
  documento:                  "Qual é o CNPJ da empresa (ou CPF se for pessoa física)?",
  endereco:                   "Qual é o endereço completo da empresa (rua, número, cidade, estado, CEP)?",
  representanteCargo:         "Qual é o seu cargo na empresa?",
  representanteNacionalidade: "Qual é a sua nacionalidade?",
  representanteEstadoCivil:   "Qual é o seu estado civil (solteiro, casado, etc.)?",
  representanteProfissao:     "Qual é a sua profissão?",
  representanteRg:            "Qual é o número do seu RG?",
};

type ContractCheckLead = Partial<Pick<
  Lead,
  "email" | "documento" | "endereco" |
  "representanteCargo" | "representanteNacionalidade" |
  "representanteEstadoCivil" | "representanteProfissao" | "representanteRg"
>>;

/** Returns the list of CONTRACT_REQUIRED_FIELDS that are empty/null on the lead. */
function getMissingContractFields(lead: ContractCheckLead | null): string[] {
  if (!lead) return [...CONTRACT_REQUIRED_FIELDS];
  return (CONTRACT_REQUIRED_FIELDS as readonly string[]).filter(
    (f) => !(lead as Record<string, unknown>)[f],
  );
}

/**
 * Synchronously extracts contract data fields from a single incoming message
 * and persists any newly found values to the lead row.
 * Only fills empty fields — never overwrites already-recorded values.
 */
async function extractAndSaveContractFields(
  tenantId: string,
  leadId: string,
  lead: Lead,
  incomingMessage: string,
  log: Logger,
): Promise<void> {
  const extractionPrompt =
    `Você é um extrator de dados para contratos. Analise a mensagem abaixo e extraia APENAS as informações explicitamente afirmadas pelo cliente. Não infira, não suponha.\n\n` +
    `Campos a extrair:\n` +
    `- "email": endereço de e-mail\n` +
    `- "documento": CPF (formato 000.000.000-00) ou CNPJ (formato 00.000.000/0000-00)\n` +
    `- "endereco": endereço completo (rua, número, complemento, cidade, estado, CEP)\n` +
    `- "representanteCargo": cargo ou função na empresa\n` +
    `- "representanteNacionalidade": nacionalidade (ex: brasileira, portuguesa)\n` +
    `- "representanteEstadoCivil": estado civil (ex: solteiro, casado, divorciado, viúvo)\n` +
    `- "representanteProfissao": profissão\n` +
    `- "representanteRg": número do RG\n\n` +
    `Responda APENAS em JSON válido, sem markdown. Inclua APENAS os campos que o cliente mencionou explicitamente. Se nenhum campo, retorne {}\n\n` +
    `Mensagem: ${incomingMessage}`;

  let extracted: Record<string, unknown>;
  try {
    const aiResult = await gatewayFamilyCallOpenAI(
      tenantId,
      "intelligence_analysis",
      [{ role: "user", content: extractionPrompt }],
      { model: "gpt-4.1-mini", maxTokens: 200, temperature: 0.0, log },
    );
    const raw = (aiResult.content ?? "{}").trim();
    extracted = JSON.parse(raw.replace(/^```json\s*/, "").replace(/\s*```$/, "")) as Record<string, unknown>;
  } catch (err) {
    log.warn({ err, leadId, tenantId }, "dispatch: contract fields extraction AI call failed (non-fatal)");
    return;
  }

  if (Object.keys(extracted).length === 0) return;

  const fieldMap: Record<string, keyof Lead> = {
    email:                      "email",
    documento:                  "documento",
    endereco:                   "endereco",
    representanteCargo:         "representanteCargo",
    representanteNacionalidade: "representanteNacionalidade",
    representanteEstadoCivil:   "representanteEstadoCivil",
    representanteProfissao:     "representanteProfissao",
    representanteRg:            "representanteRg",
  };

  const update: Record<string, unknown> = { updatedAt: new Date() };
  for (const [key, leadField] of Object.entries(fieldMap)) {
    const val = extracted[key];
    if (val && !(lead as Record<string, unknown>)[leadField as string]) {
      update[leadField as string] = String(val);
    }
  }

  if (Object.keys(update).length === 1) return;

  await db
    .update(leadsTable)
    .set(update)
    .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

  log.info(
    { leadId, tenantId, saved: Object.keys(update).filter((k) => k !== "updatedAt") },
    "dispatch: contract fields extracted and saved",
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
