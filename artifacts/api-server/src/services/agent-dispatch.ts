/**
 * Agent dispatch service — selects and runs the appropriate AI agent
 * for an incoming message without going through HTTP.
 *
 * Used by:
 *   - routes/webhooks.ts  (fire-and-forget after WhatsApp message insert)
 *   - jobs/scheduler.ts   (campaign message dispatch)
 */
import { and, desc, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import type { Logger } from "pino";
import { evaluatePipelineAI } from "./pipeline-ai-orchestrator.js";
import {
  db,
  agentConfigsTable,
  activitiesTable,
  agendamentosTable,
  agendasTable,
  businessProfilesTable,
  conversationsTable,
  customerIntelligenceTable,
  dealsTable,
  leadsTable,
  messagesTable,
  notificationsTable,
  farmaciaBulasTable,
  farmaciaProdutoTable,
  produtosCatalogoTable,
  propostasTable,
  tenantsTable,
  usersTable,
  leadSpouseConsentTable,
  tenantCalendarSettingsTable,
  scoutOportunidadesTable,
  leadBriefingsTable,
  leadOportunidadesPrevistasTable,
  relatosTecnicosTable,
  tenantAgentConfigsTable,
  campaignsTable,
  campaignSentLogsTable,
} from "@workspace/db";
import { callOpenAI as gatewayFamilyCallOpenAI } from "../lib/ai-gateway.js";
import { detectEscalationTrigger, generateHandoffSummary } from "./escalation.js";
import { detectBotPattern, BOT_SIGNAL_THRESHOLD } from "./bot-detection.js";
import { classifyFinancialIntent } from "./financial-intent.js";
import { handleDeliveryFeedbackReply } from "./post-venda.js";
import { prepareSupportAiIntake } from "./support-ai-intake.js";
import { resolverContextoNegocio } from "./resolvedorContextoNegocio.js";
import { handleSequenceOfferReply } from "./sequence-offer.js";
import { generateAgentHandoffSummary } from "./handoff.js";
import { sendDirectWhatsAppMessage, sendDirectWhatsAppDocument, sendOutgoingMessage } from "./omnichannel.js";
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
import { buildSmartDeliveryUrl } from "./smart-delivery.js";
import { createQuoteFromCatalogPlan } from "./auto-quote.js";
import { resolverECalcularOrcamento, ErroResolucaoOrcamento } from "../lib/calculoOrcamentoM2Resolver.js";
import { ErroCalculoOrcamento } from "../lib/calculoOrcamentoM2.js";
import { checkAgentPlan } from "../middlewares/plan-guard.js";
import { createGoogleEvent } from "../lib/google-calendar.js";
import { detectMeetingIntent } from "../lib/detect-meeting-intent.js";
import { formatCloserWinningResponsesPrompt, loadCloserWinningResponses } from "../lib/closer-winning-response-memory.js";
import {
  detectProspectorStateFromReply,
  evaluateProspectorQualification,
  isColdProspectSource,
  prospectorQuestionsForExtraction as buildProspectorQuestionsForExtraction,
  resolveProspectorPlaybook,
  type ProspectorPlaybook,
} from "../lib/prospector-consultive.js";


type SmartDeliveryResolution = {
  campaignId: string;
  timing: "first_contact" | "after_interest" | "after_qualification";
  toolRef: string;
  toolName?: string;
  url: string;
  channel: "whatsapp" | "instagram" | "email";
};

async function resolvePendingSmartDelivery(params: {
  tenantId: string;
  leadId: string;
  desiredTiming: "after_interest" | "after_qualification";
  log: Logger;
}): Promise<SmartDeliveryResolution | null> {
  const { tenantId, leadId, desiredTiming, log } = params;

  const recentLogs = await db
    .select({
      campaignId: campaignSentLogsTable.campaignId,
      sentAt: campaignSentLogsTable.sentAt,
    })
    .from(campaignSentLogsTable)
    .where(eq(campaignSentLogsTable.leadId, leadId))
    .orderBy(desc(campaignSentLogsTable.sentAt))
    .limit(20);

  for (const row of recentLogs) {
    const [campaign] = await db
      .select({
        id: campaignsTable.id,
        tenantId: campaignsTable.tenantId,
        tipo: campaignsTable.tipo,
        contexto: campaignsTable.contexto,
      })
      .from(campaignsTable)
      .where(and(eq(campaignsTable.id, row.campaignId), eq(campaignsTable.tenantId, tenantId)))
      .limit(1);

    if (!campaign) continue;

    const context = (campaign.contexto ?? {}) as Record<string, any>;
    const delivery = (context.smartDelivery ?? {}) as Record<string, any>;
    if (delivery.enabled !== true) continue;
    if ((delivery.deliveryTiming ?? "after_interest") !== desiredTiming) continue;
    if (typeof delivery.toolRef !== "string" || !delivery.toolRef.trim()) continue;

    const dedupeKey = `smart_delivery_sent:${campaign.id}:${desiredTiming}`;
    const [alreadySent] = await db
      .select({ id: activitiesTable.id })
      .from(activitiesTable)
      .where(and(
        eq(activitiesTable.tenantId, tenantId),
        eq(activitiesTable.leadId, leadId),
        eq(activitiesTable.resultadoExecucao, dedupeKey),
      ))
      .limit(1);
    if (alreadySent) continue;

    try {
      const url = buildSmartDeliveryUrl({
        purpose: "smart_delivery",
        tenantId,
        campaignId: campaign.id,
        leadId,
        toolRef: delivery.toolRef,
        toolName: typeof delivery.toolName === "string" ? delivery.toolName : undefined,
      });

      return {
        campaignId: campaign.id,
        timing: desiredTiming,
        toolRef: delivery.toolRef,
        toolName: typeof delivery.toolName === "string" ? delivery.toolName : undefined,
        url,
        channel: campaign.tipo,
      };
    } catch (err) {
      log.warn({ err, tenantId, leadId, campaignId: campaign.id }, "dispatch: failed to resolve smart delivery");
    }
  }

  return null;
}

async function hasRecentProspectorCampaignAuthorization(params: {
  tenantId: string;
  leadId: string;
}): Promise<boolean> {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentLogs = await db
    .select({
      campaignId: campaignSentLogsTable.campaignId,
      sentAt: campaignSentLogsTable.sentAt,
    })
    .from(campaignSentLogsTable)
    .where(and(
      eq(campaignSentLogsTable.leadId, params.leadId),
      gte(campaignSentLogsTable.sentAt, cutoff),
    ))
    .orderBy(desc(campaignSentLogsTable.sentAt))
    .limit(20);

  for (const row of recentLogs) {
    const [campaign] = await db
      .select({ contexto: campaignsTable.contexto })
      .from(campaignsTable)
      .where(and(
        eq(campaignsTable.id, row.campaignId),
        eq(campaignsTable.tenantId, params.tenantId),
      ))
      .limit(1);

    const context = (campaign?.contexto ?? {}) as Record<string, any>;
    if (context?.prospectorAutomation?.enabled === true) return true;
  }
  return false;
}

async function markSmartDeliverySent(params: {
  tenantId: string;
  leadId: string;
  campaignId: string;
  timing: "after_interest" | "after_qualification";
  toolName?: string;
  url: string;
}): Promise<void> {
  const dedupeKey = `smart_delivery_sent:${params.campaignId}:${params.timing}`;
  await db.insert(activitiesTable).values({
    tenantId: params.tenantId,
    leadId: params.leadId,
    tipo: "tarefa",
    titulo: "Entrega Inteligente enviada",
    descricao: `Campanha ${params.campaignId} | Momento: ${params.timing} | ${params.toolName ?? params.url}`,
    status: "concluida",
    concluidaEm: new Date(),
    resultadoExecucao: dedupeKey,
  }).catch(() => {});
}


/**
 * Finds the tenant's agenda with a refresh token, creates a provisional
 * agendamento (next business day at 10 AM BRT) and calls Google Calendar
 * to generate a real Meet link. Saves the result to the DB.
 * Returns the meetLink string, or null if no connected agenda exists.
 */
async function autoScheduleAndGetMeetLink(params: {
  tenantId: string;
  leadId:   string;
  leadNome: string;
  log:      Logger;
}): Promise<string | null> {
  const { tenantId, leadId, leadNome, log } = params;

  // 1. Find the first agenda with a real OAuth token for this tenant.
  //    Using raw SQL because googleRefreshToken is stored but may not be in
  //    the Drizzle type's $inferSelect (nullable text column added later).
  const agendaResult = await db.execute(
    sql`SELECT id, nome FROM agendas WHERE tenant_id = ${tenantId} AND google_refresh_token IS NOT NULL ORDER BY is_default DESC LIMIT 1`
  );
  const agendaWithToken = agendaResult.rows[0] as { id: string; nome: string } | undefined;

  if (!agendaWithToken?.id) {
    log.info({ tenantId }, "autoSchedule: no agenda with refresh_token found, skipping");
    return null;
  }

  // 2. Compute next business day at 10:00 BRT (UTC-3)
  const now = new Date();
  const brtOffset = -3 * 60; // minutes
  const brtNow = new Date(now.getTime() + (brtOffset - now.getTimezoneOffset()) * 60_000);

  // Advance to the next day
  const candidate = new Date(brtNow);
  candidate.setDate(candidate.getDate() + 1);
  candidate.setHours(10, 0, 0, 0);
  // Skip weekends
  while (candidate.getDay() === 0 || candidate.getDay() === 6) {
    candidate.setDate(candidate.getDate() + 1);
  }
  // Convert back to UTC for storage
  const dataHoraInicio = new Date(candidate.getTime() - (brtOffset - now.getTimezoneOffset()) * 60_000);
  const dataHoraFim    = new Date(dataHoraInicio.getTime() + 60 * 60_000); // +1h

  // 3. Create agendamento record
  const agendamentoId = crypto.randomUUID();
  const titulo = `Reunião com ${leadNome || "Lead"}`;
  await db.execute(
    `INSERT INTO agendamentos (id, tenant_id, lead_id, tipo, titulo, data_hora_inicio, data_hora_fim, status, agenda_id, gerar_meet, criado_por, created_at, updated_at)
     VALUES ('${agendamentoId}','${tenantId}','${leadId}','reuniao','${titulo.replace(/'/g,"''")}','${dataHoraInicio.toISOString()}','${dataHoraFim.toISOString()}','agendado','${agendaWithToken.id}',true,'closer_auto',NOW(),NOW())`
  );

  log.info({ agendamentoId, agendaId: agendaWithToken.id, dataHoraInicio }, "autoSchedule: agendamento created, calling Google Calendar");

  // 4. Call Google Calendar → get Meet link
  try {
    const { googleEventId, meetLink } = await createGoogleEvent(
      agendaWithToken.id,
      { id: agendamentoId, tenantId, titulo, dataHoraInicio, dataHoraFim, gerarMeet: true },
      leadNome || undefined,
      undefined,
      true
    );

    if (meetLink || googleEventId) {
      await db.execute(
        `UPDATE agendamentos SET meet_link=${meetLink ? `'${meetLink}'` : "NULL"}, google_event_id=${googleEventId ? `'${googleEventId}'` : "NULL"}, updated_at=NOW() WHERE id='${agendamentoId}'`
      );
      log.info({ agendamentoId, meetLink, googleEventId }, "autoSchedule: Meet link saved");
    }

    return meetLink;
  } catch (err) {
    log.warn({ err, agendamentoId }, "autoSchedule: Google Calendar call failed (non-fatal)");
    return null;
  }
}

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
  // Broad match: any "[Link da reuni(ã/a)o...]" regardless of suffix (": **(exemplo)**", "(#)", etc.)
  const meetPlaceholder = /\[link\s+da\s+reuni[aã]o[^\]]*\]|\{?\{?link_reuni[aã]o\}?\}?/gi;
  text = text.replace(meetPlaceholder, meetLink ?? "vou te enviar o link em instantes");

  // 2. Any remaining [Text](#) — markdown-style placeholder link with literal "#" href.
  //    A real URL in agent output never uses bare "#"; these are always template artifacts.
  text = text.replace(/\[[^\]]{1,80}\]\(#\)/g, "");

  // 2b. Duplicate markdown links where text === URL: [https://x.com](https://x.com) → https://x.com
  //     WhatsApp does not render markdown links — stripping the wrapper leaves a clean clickable URL.
  text = text.replace(/\[([^\]]+)\]\(\1\)/g, "$1");

  // 3. Named placeholder variants that the LLM might echo from the custom prompt template.
  //    Replace with the real name when available so "Meu nome é [Seu Nome]" → "Meu nome é João".
  const nomeFallback = vendedorNome?.trim() || "";
  text = text.replace(/\[Seu\s+Nome\]|\[Nome\]|\{?\{?vendedor_nome\}?\}?/gi, nomeFallback);
  text = text.replace(/\[Empresa\]|\{?\{?empresa_nome\}?\}?/gi, "");

  // 4. Domain / brand correction: replace any wrong-domain URLs or bare company-name
  //    mentions the LLM may hallucinate. The correct names are:
  //      • appvendorai.com  (URL / full domain)
  //      • appvendor.ai    (bare company name)
  //    Wrong variants: vendor.ai, vendorai.com, www.vendor.ai, www.vendorai.com
  text = text.replace(/https?:\/\/(?:www\.)?vendor\.ai(?=[\s/,)"']|$)/gi, "https://appvendorai.com");
  text = text.replace(/https?:\/\/(?:www\.)?vendorai\.com(?!\.br)(?=[\s/,)"']|$)/gi, "https://appvendorai.com");
  // Plain mentions without protocol
  text = text.replace(/\bwww\.vendor\.ai\b/gi, "appvendorai.com");
  text = text.replace(/\bwww\.vendorai\.com\b(?!\.br)/gi, "appvendorai.com");
  // Bare company-name "Vendor.ai" / "vendor.ai" (no protocol, no www).
  // \bvendor\.ai\b does NOT match "appvendor.ai" because 'v' in "appvendor" has no
  // preceding word boundary — so no double-replacement risk.
  text = text.replace(/\bvendor\.ai\b/gi, "appvendor.ai");

  // 5. Defense-in-depth: intercept free-form LLM denials of ability to send/provide a
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
 *  2. lead.status === "novo" → reception (front-desk: welcomes and routes, doesn't qualify/pitch)
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
    const isNewOrColdProspect = lead.status === "novo" || isColdProspectSource(lead.source);

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

  // 2. Prospecção ativa → mantém o Prospecctor até concluir o SQL/handoff.
  // A origem define que este é um lead outbound; ela não define o segmento.
  const prospectorDiscovery = (lead.discoveryData ?? {}) as Record<string, unknown>;
  const prospectorCompleted = prospectorDiscovery["prospector_sql_qualified"] === true;
  if (isColdProspectSource(lead.source) && !prospectorCompleted) return "sdr";

  // 3. Lead status → direct mapping
  if (lead.status === "novo") return "reception";
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

    // 2a. "Nunca ativar agente" — decisão permanente marcada manualmente
    // (contato pessoal, não é lead de negócio de verdade). Checado ANTES
    // de qualquer outra coisa — nem escalação, nem auto-quote, nada roda
    // pra esse lead.
    if (ctx.lead.agenteDesativado) {
      log.info({ tenantId, leadId }, "dispatch: agent permanently disabled for this lead — skipping");
      return { status: "skipped", reason: "agent_disabled_permanently" };
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

    // 2b3. Reactivation dedup guard — proactive reactivation dispatches (churn-check +
    // reactivation-queue) can both fire for the same lead within minutes of each other.
    // Before sending, ensure no outbound WhatsApp was sent in the last 4h for this lead.
    const isProactiveReactivation =
      forcedAgent === "reactivation" ||
      mensagem.startsWith("PROATIVO:");
    if (isProactiveReactivation) {
      const reactivationCutoff = new Date(Date.now() - 4 * 60 * 60 * 1000);
      const [recentOutbound] = await db
        .select({ id: messagesTable.id })
        .from(messagesTable)
        .where(
          and(
            eq(messagesTable.tenantId, tenantId),
            eq(messagesTable.leadId, leadId),
            eq(messagesTable.direcao, "saida"),
            gt(messagesTable.createdAt, reactivationCutoff),
          )
        )
        .limit(1);
      if (recentOutbound) {
        log.info({ tenantId, leadId }, "dispatch: reactivation dedup — outbound found in last 4h, skipping");
        return { status: "skipped", reason: "reactivation_dedup" };
      }
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
            }).catch((err: unknown) => log.warn({ err }, "dispatch: failed to insert bot notification"));

            // Log activity
            await db.insert(activitiesTable).values({
              tenantId,
              leadId,
              // BUG CORRIGIDO: 'prospector_bot_detectado' não existe no enum
              // activity_tipo (só ligacao|whatsapp|email|visita|tarefa|
              // reuniao|escalacao_humano|handoff_agente|feedback_entrega) —
              // esse insert sempre falhava (violação de enum), sempre
              // engolido silenciosamente pelo .catch() abaixo. O 'as any'
              // que existia aqui escondia o erro de tipo em vez de expor o
              // problema real.
              tipo: "tarefa",
              titulo: "Prospecção pausada — bot de atendimento detectado",
              descricao: transcript.slice(0, 500),
              status: "concluida",
              concluidaEm: new Date(),
              resultadoExecucao: `sinais_bot:${newCount}`,
            }).catch((err: unknown) => log.warn({ err }, "dispatch: failed to insert bot activity"));

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
    } else if (ctx.conversation?.currentAgent === "pharmacy") {
      agentName = "pharmacy";
    } else {
      const diasSinceContact = daysSinceLastContact(ctx);
      agentName = await determineAgent(ctx.lead, ctx.ci, deals, diasSinceContact, mensagem, tenantId, log, ctx.recentMessages);
    }

    // 4b. (currentAgent update deferred to step 4c below, after resolvedAgentName is known)

    // 5. Check if that agent is enabled
    // UNIFICAÇÃO DE 2 SISTEMAS (achado real): existiam duas fontes de
    // verdade desencontradas pra "esse agente está ativo?" —
    // config.agents[key].enabled (JSON legado nesta mesma tabela,
    // editado pela tela Configurações → Agentes) e
    // tenantAgentConfigsTable.ativo (tabela normalizada mais nova,
    // editada pela tela "Agentes" dedicada — a que o Marcos usa e vê
    // "Ativo" em quase tudo, mas que o despacho NUNCA checava pra
    // decidir se responde). Resultado: ligar "Recepção"/"Closer"/etc
    // nessa tela não tinha nenhum efeito real — sempre caía no
    // fallback de SDR, silenciosamente.
    //
    // Regra da unificação: se o JSON legado tem uma entrada explícita
    // pra esse agente, ela continua mandando (nenhum tenant que já
    // funciona pelo JSON é afetado). Só quando o JSON NÃO tem entrada
    // nenhuma pra esse agente é que a tabela nova decide — cobre
    // exatamente o caso do windoor (JSON só tem 'sdr', tabela nova tem
    // os 9 agentes marcados ativo).
    const agentCfg = agentName === "pharmacy"
      ? config.agents?.service
      : config.agents?.[agentName];
    const agentEnabled = agentCfg
      ? !!agentCfg.enabled
      : await isAgentEnabledInNewerTable(tenantId, agentName);
    if (!agentEnabled) {
      // Fall back to SDR if the chosen agent is disabled
      const sdrCfg = config.agents?.["sdr"];
      const sdrEnabled = sdrCfg
        ? !!sdrCfg.enabled
        : await isAgentEnabledInNewerTable(tenantId, "sdr");
      if (!sdrEnabled) {
        log.warn({ tenantId, leadId, agentName }, "dispatch: chosen agent and SDR both disabled — skipping");
        return { status: "skipped", reason: "agent_disabled" };
      }
    }

    const resolvedAgentName: AgentName = (agentEnabled ? agentName : "sdr");

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

    // Cliente já convertido é atendido pelo agente `service`. Antes de gerar a
    // resposta, classificamos se a conversa realmente exige assistência
    // operacional. Se sim, o fluxo coleta o mínimo necessário e, quando houver
    // contexto suficiente, abre o AST de forma determinística, com responsável
    // real e sem depender de um marcador inventado pelo LLM.
    if (resolvedAgentName === "service") {
      try {
        const supportIntake = await prepareSupportAiIntake({
          tenantId,
          lead: ctx.lead,
          recentMessages: ctx.recentMessages,
          currentMessage: mensagem,
          log,
        });
        if (supportIntake.state !== "none") {
          enrichedScenario = { ...(enrichedScenario ?? {}), supportIntake };
          log.info({ tenantId, leadId, supportIntakeState: supportIntake.state, code: supportIntake.code }, "dispatch: support AI intake prepared");
        }
      } catch (err) {
        // A classificação/abertura não pode derrubar o atendimento principal.
        // O agente continua respondendo normalmente e o erro fica observável.
        log.error({ err, tenantId, leadId }, "dispatch: support AI intake failed (non-fatal)");
      }
    }

    if (resolvedAgentName === "pharmacy") {
      const catalogProductsRaw = await db
        .select({
          nome: farmaciaProdutoTable.nome,
          nomeGenerico: farmaciaProdutoTable.principioAtivo,
          precoBase: farmaciaProdutoTable.precoPromocional,
          precoVenda: farmaciaProdutoTable.precoVenda,
          exigeReceita: farmaciaProdutoTable.exigeReceita,
          estoque: farmaciaProdutoTable.estoque,
          posologia: farmaciaProdutoTable.posologia,
          posologiaFonteUrl: farmaciaProdutoTable.posologiaFonteUrl,
          posologiaAprovada: farmaciaProdutoTable.posologiaAprovada,
          posologiaRevisadaPor: farmaciaProdutoTable.posologiaRevisadaPor,
          posologiaRevisadaEm: farmaciaProdutoTable.posologiaRevisadaEm,
        })
        .from(farmaciaProdutoTable)
        .where(and(
          eq(farmaciaProdutoTable.tenantId, tenantId),
          eq(farmaciaProdutoTable.ativo, true),
          gt(farmaciaProdutoTable.estoque, 0),
        ))
        .orderBy(farmaciaProdutoTable.nome)
        .limit(100);
      const approvedLeaflets = await db
        .select({
          principioAtivo: farmaciaBulasTable.principioAtivo,
          posologia: farmaciaBulasTable.posologia,
          fonteUrl: farmaciaBulasTable.fonteUrl,
          responsavelNome: farmaciaBulasTable.responsavelNome,
          responsavelRegistro: farmaciaBulasTable.responsavelRegistro,
          revisadaEm: farmaciaBulasTable.revisadaEm,
        })
        .from(farmaciaBulasTable)
        .where(and(
          eq(farmaciaBulasTable.tenantId, tenantId),
          eq(farmaciaBulasTable.status, "aprovada"),
        ));
      const leafletByIngredient = new Map(
        approvedLeaflets.map((leaflet) => [leaflet.principioAtivo.trim().toLocaleLowerCase("pt-BR"), leaflet]),
      );
      const catalogProducts = catalogProductsRaw.map((product) => {
        const leaflet = product.nomeGenerico
          ? leafletByIngredient.get(product.nomeGenerico.trim().toLocaleLowerCase("pt-BR"))
          : undefined;
        if (!leaflet) return product;
        return {
          ...product,
          posologia: leaflet.posologia,
          posologiaFonteUrl: leaflet.fonteUrl,
          posologiaAprovada: true,
          posologiaRevisadaPor: `${leaflet.responsavelNome} (${leaflet.responsavelRegistro})`,
          posologiaRevisadaEm: leaflet.revisadaEm,
        };
      });
      enrichedScenario = { ...(enrichedScenario ?? {}), catalogProducts };
    }
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

    // Reuse Smart Delivery output as conversational context so Prospector/Closer
    // do not ask again what the lead already provided in the public experience.
    if (resolvedAgentName === "sdr" || resolvedAgentName === "closer") {
      const deliveryDiscovery = (ctx.lead.discoveryData ?? {}) as Record<string, unknown>;
      const arqdorResult = deliveryDiscovery["public_arqdor_preproject"];
      const publicAgentSession = deliveryDiscovery["public_delivery_agent_session"];
      if (arqdorResult || publicAgentSession) {
        enrichedScenario = {
          ...(enrichedScenario ?? {}),
          smartDeliveryContext: {
            ...(arqdorResult ? { arqdorPreProject: arqdorResult } : {}),
            ...(publicAgentSession ? { publicAgentSession } : {}),
            instruction:
              "Use estes dados como contexto já confirmado pelo próprio lead. Não repita perguntas já respondidas; avance a conversa a partir do resultado da Entrega Inteligente.",
          },
        };
        log.info(
          { tenantId, leadId, hasArqdor: !!arqdorResult, hasPublicAgentSession: !!publicAgentSession },
          "dispatch: smart delivery context injected into SDR/Closer",
        );
      }
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
            id:             agendamentosTable.id,
            tipo:           agendamentosTable.tipo,
            titulo:         agendamentosTable.titulo,
            dataHoraInicio: agendamentosTable.dataHoraInicio,
            dataHoraFim:    agendamentosTable.dataHoraFim,
            local:          agendamentosTable.local,
            meetLink:       agendamentosTable.meetLink,
            agendaId:       agendamentosTable.agendaId,
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
          if (latestCloserAgendamento.meetLink) {
            enrichedScenario = { ...(enrichedScenario ?? {}), ...latestCloserAgendamento };
            log.debug({ tenantId, leadId, meetLink: latestCloserAgendamento.meetLink }, "dispatch: closer agendamento with meetLink injected");
          } else {
            // Agendamento exists but meetLink is null (e.g. Google OAuth was revoked/reconnected after creation).
            // Attempt to generate the Meet link retroactively using the now-connected agenda.
            try {
              const agendaResult = await db.execute(
                sql`SELECT id FROM agendas WHERE tenant_id = ${tenantId} AND google_refresh_token IS NOT NULL ORDER BY is_default DESC LIMIT 1`
              );
              const agendaWithToken = agendaResult.rows[0] as { id: string } | undefined;

              if (agendaWithToken?.id) {
                log.info({ tenantId, leadId, agendamentoId: latestCloserAgendamento.id }, "dispatch: closer retroactive Meet link — calling createGoogleEvent");
                const { googleEventId, meetLink: newMeetLink } = await createGoogleEvent(
                  agendaWithToken.id,
                  {
                    id:             latestCloserAgendamento.id,
                    tenantId,
                    titulo:         latestCloserAgendamento.titulo,
                    dataHoraInicio: latestCloserAgendamento.dataHoraInicio,
                    dataHoraFim:    latestCloserAgendamento.dataHoraFim,
                    gerarMeet:      true,
                  },
                  ctx.lead.nome ?? undefined,
                  undefined,
                  true,
                );

                if (newMeetLink || googleEventId) {
                  await db.execute(
                    sql`UPDATE agendamentos SET meet_link=${newMeetLink ?? null}, google_event_id=${googleEventId ?? null}, updated_at=NOW() WHERE id=${latestCloserAgendamento.id}`
                  );
                  enrichedScenario = { ...(enrichedScenario ?? {}), ...latestCloserAgendamento, meetLink: newMeetLink };
                  log.info({ tenantId, leadId, meetLink: newMeetLink }, "dispatch: closer retroactive Meet link generated and saved");
                } else {
                  enrichedScenario = { ...(enrichedScenario ?? {}), meetingRequested: true };
                  log.warn({ tenantId, leadId }, "dispatch: closer retroactive createGoogleEvent returned no link — meetingRequested fallback");
                }
              } else {
                // No connected agenda at all — use original fallback
                enrichedScenario = { ...(enrichedScenario ?? {}), meetingRequested: true };
                log.info({ tenantId, leadId }, "dispatch: closer agendamento has no meetLink and no connected agenda — meetingRequested fallback");
              }
            } catch (gcalErr) {
              enrichedScenario = { ...(enrichedScenario ?? {}), meetingRequested: true };
              log.warn({ err: gcalErr, tenantId, leadId }, "dispatch: closer retroactive Google Calendar failed — meetingRequested fallback");
            }
          }
        } else if (detectMeetingIntent(mensagem)) {
          // Lead is asking for a meeting link but no agendamento exists yet.
          // Auto-schedule: create agendamento + call Google Calendar to get a real Meet link.
          log.info({ tenantId, leadId }, "dispatch: scheduling intent detected, triggering auto-schedule");
          try {
            const autoMeetLink = await autoScheduleAndGetMeetLink({
              tenantId,
              leadId,
              leadNome: ctx.lead.nome ?? "",
              log,
            });
            if (autoMeetLink) {
              enrichedScenario = {
                ...(enrichedScenario ?? {}),
                meetLink: autoMeetLink,
                autoScheduled: true,
              };
              log.info({ tenantId, leadId, autoMeetLink }, "dispatch: auto-schedule succeeded, meetLink injected for Closer");
            } else {
              log.info({ tenantId, leadId }, "dispatch: auto-schedule returned null (no connected agenda), Closer proceeds without meetLink");
            }
          } catch (err) {
            log.warn({ err, tenantId, leadId }, "dispatch: auto-schedule failed (non-fatal)");
          }
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
    let prospectorMode = false;
    let prospectorPlaybookForExtraction: ProspectorPlaybook | null = null;
    let prospectorQuestionsForExtraction: SpinQuestion[] | null = null;
    let smartDeliveryAfterInterest: SmartDeliveryResolution | null = null;
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

    // ── Prospecctor consultivo: cold outbound is research-first, not generic SDR ──
    if (resolvedAgentName === "sdr" && (scenario?.["cold_outreach"] === true || isColdProspectSource(ctx.lead.source))) {
      let resolvedProspector: Awaited<ReturnType<typeof getAgentConfig>> = null;
      try {
        resolvedProspector = await getAgentConfig(tenantId, "prospector");
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "AGENT_NOT_CONFIGURED") {
          log.info(
            { tenantId, leadId },
            "dispatch: Prospecctor explicitly disabled — cold prospect response suppressed",
          );
          return { status: "skipped", reason: "prospector_disabled" };
        }
        // Falha transitória de configuração nunca deve rebaixar a conversa para
        // um SDR vendedor genérico. Seguimos com o playbook seguro padrão.
        log.warn(
          { err, tenantId, leadId },
          "dispatch: Prospecctor config unavailable — using safe consultive fallback",
        );
      }

      try {
        const prospectorParams = (resolvedProspector?.parametros ?? {}) as Record<string, unknown>;
        const playbook = resolveProspectorPlaybook(
          prospectorParams["prospectorPlaybook"],
          ctx.lead.mercadoSegmento,
          {
            ...((ctx.lead.metadata ?? {}) as Record<string, unknown>),
            lead_source: ctx.lead.source ?? "",
          },
        );
        const previousAgentMessage = [...ctx.recentMessages]
          .reverse()
          .find((item) => item.enviadoPor === "agente_ia")?.conteudo ?? null;
        const existingDiscoveryData = (ctx.lead.discoveryData ?? {}) as Record<string, unknown>;
        const state = detectProspectorStateFromReply({
          incomingMessage: mensagem,
          previousAgentMessage,
          existingDiscoveryData,
        });

        const stateChanged =
          (state.contextConfirmed && existingDiscoveryData["prospector_context_confirmed"] !== true) ||
          (state.nextStepAccepted && existingDiscoveryData["prospector_next_step_accepted"] !== true);

        if (state.contextConfirmed) {
          smartDeliveryAfterInterest = await resolvePendingSmartDelivery({
            tenantId,
            leadId,
            desiredTiming: "after_interest",
            log,
          });
        }

        if (stateChanged) {
          const nextDiscoveryData = {
            ...existingDiscoveryData,
            ...(state.contextConfirmed ? { prospector_context_confirmed: true } : {}),
            ...(state.nextStepAccepted ? { prospector_next_step_accepted: true } : {}),
          };
          await db.update(leadsTable)
            .set({ discoveryData: nextDiscoveryData, updatedAt: new Date() })
            .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));
          ctx.lead.discoveryData = nextDiscoveryData;
        }

        prospectorMode = true;
        prospectorPlaybookForExtraction = playbook;
        prospectorQuestionsForExtraction = buildProspectorQuestionsForExtraction(playbook) as SpinQuestion[];
        enrichedScenario = {
          ...(enrichedScenario ?? {}),
          prospector_mode: true,
          prospector_playbook: playbook,
          prospector_system_prompt: resolvedProspector?.systemPrompt ?? null,
          prospector_state: state,
        };
        log.debug(
          { tenantId, leadId, diagnosisFields: prospectorQuestionsForExtraction.map((q) => q.fieldKey) },
          "dispatch: Prospecctor consultive mode injected",
        );
      } catch (err) {
        // Segurança comercial: em lead frio não responder com o SDR padrão quando
        // não foi possível montar o modo consultivo.
        log.warn(
          { err, tenantId, leadId },
          "dispatch: Prospecctor initialization failed — cold prospect response suppressed",
        );
        return { status: "skipped", reason: "prospector_init_error" };
      }
    }

    // ── Produtos com cálculo por m² (teto vinílico, revestimento) ────────────
    // Injeta no cenário só os produtos que têm tipo_calculo preenchido, com
    // o ID real (o marcador <!--CALC_M2:...--> precisa do produtoId exato
    // pra rodar o motor de cálculo de verdade — nunca um nome adivinhado).
    if (resolvedAgentName === "sdr" || resolvedAgentName === "closer") {
      try {
        const produtosM2 = await db
          .select({
            id: produtosCatalogoTable.id,
            nome: produtosCatalogoTable.nome,
            tipoCalculo: produtosCatalogoTable.tipoCalculo,
            colecao: produtosCatalogoTable.colecao,
            cor: produtosCatalogoTable.cor,
          })
          .from(produtosCatalogoTable)
          .where(
            and(
              eq(produtosCatalogoTable.tenantId, tenantId),
              eq(produtosCatalogoTable.ativo, true),
              or(
                eq(produtosCatalogoTable.tipoCalculo, "area_simples"),
                eq(produtosCatalogoTable.tipoCalculo, "area_com_acabamento_perimetro"),
              ),
            ),
          )
          .limit(50);
        if (produtosM2.length > 0) {
          enrichedScenario = { ...(enrichedScenario ?? {}), produtosM2 };
        }
      } catch (err) {
        log.warn({ err, tenantId }, "dispatch: falha ao carregar produtos com cálculo por m² (não fatal)");
      }
    }

    // ── Maturity survey response detection (frio_teste pesquisa) ─────────────
    // When the lead replies after the survey message, detect and persist the
    // maturity level so it's available in the scenario AND in the lead record.
    if (resolvedAgentName === "sdr" && !prospectorMode) {
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

    // ── Closer: tenant-safe winning response memory ───────────────────────────
    if (resolvedAgentName === "closer") {
      try {
        const learnedResponses = await loadCloserWinningResponses({
          tenantId,
          segmento: ctx.lead.mercadoSegmento,
          incomingMessage: mensagem,
        });
        const learnedPrompt = formatCloserWinningResponsesPrompt(learnedResponses);
        if (learnedPrompt) {
          enrichedScenario = {
            ...(enrichedScenario ?? {}),
            closerWinningResponsesPrompt: learnedPrompt,
          };
          log.debug(
            { tenantId, leadId, learnedResponses: learnedResponses.length },
            "dispatch: closer winning-response memory injected",
          );
        }
      } catch (err) {
        log.warn(
          { err, tenantId, leadId },
          "dispatch: closer winning-response memory unavailable (non-fatal)",
        );
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

    // Resolve tenant intelligence dynamically for the current lead/message.
    // Failure is non-fatal: legacy prompt/context remains available as fallback.
    let contextoNegocioDinamico = "";
    try {
      const contextoNegocioResolvido = await resolverContextoNegocio({
        tenantId,
        query: [
          mensagem,
          ctx.lead.objetivo,
          ctx.lead.dorPrincipal,
          ctx.ci?.intentAnalysis,
          ctx.ci?.goalAnalysis,
          ctx.ci?.nextBestAction,
        ].filter(Boolean).join(" | "),
      });
      contextoNegocioDinamico = contextoNegocioResolvido.blocoPrompt;
      log.debug(
        {
          tenantId,
          leadId,
          agentName: resolvedAgentName,
          quantidadeFontes: contextoNegocioResolvido.fontes.length,
          idsFontes: contextoNegocioResolvido.fontes.slice(0, 12).map((fonte) => fonte.id),
        },
        "dispatch: contexto dinâmico de inteligência do negócio resolvido",
      );
    } catch (err) {
      log.warn({ err, tenantId, leadId }, "dispatch: resolvedor de inteligência do negócio indisponível (não fatal)");
    }

    // Inject handoff + Business Intelligence context at the start of the system prompt.
    const baseSystemContent = buildPrompt(resolvedAgentCfg?.prompt, ctx, enrichedScenario, dispatchSystemPrompt);
    const comInteligenciaNegocio = contextoNegocioDinamico
      ? `${baseSystemContent}\n\n---\n\n${contextoNegocioDinamico}`
      : baseSystemContent;
    const systemContent = handoffContextForPrompt
      ? `## Contexto recebido do agente anterior:\n${handoffContextForPrompt}\n\n---\n\n${comInteligenciaNegocio}`
      : comInteligenciaNegocio;

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

    if (prospectorMode && smartDeliveryAfterInterest) {
      const label = smartDeliveryAfterInterest.toolName?.trim() || "acesso personalizado";
      finalResposta = `${finalResposta}\n\n${label}: ${smartDeliveryAfterInterest.url}`;
    }

    // A Recepção sinaliza internamente o encaminhamento. O marcador nunca é
    // enviado ao lead; a próxima mensagem continua com o agente farmacêutico.
    if (resolvedAgentName === "reception" && finalResposta.includes("{{handoff:farmacia}}")) {
      finalResposta = finalResposta.replace(/\{\{handoff:farmacia\}\}/g, "").trim();
      if (ctx.conversation) {
        await db.update(conversationsTable)
          .set({ currentAgent: "pharmacy", updatedAt: new Date() })
          .where(eq(conversationsTable.id, ctx.conversation.id));
      }
      log.info({ tenantId, leadId }, "dispatch: reception handed conversation to pharmacy agent");
    }

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

    // 8a2. <!--CALC_M2:{...}--> — SDR/Closer pediu cálculo real de orçamento
    // por m² (teto vinílico, revestimento). O agente NUNCA calcula o valor
    // sozinho — só emite o marcador com as medidas já confirmadas com o
    // cliente; aqui rodamos o motor real (mesmo usado no CPQ) e substituímos
    // a resposta por uma mensagem determinística com os números exatos,
    // nunca gerada por IA em cima do resultado (evita qualquer chance de
    // arredondamento/invenção de valor pelo modelo).
    if ((resolvedAgentName === "sdr" || resolvedAgentName === "closer")) {
      const calcM2Match = /<!--CALC_M2:([\s\S]*?)-->/.exec(resposta);
      if (calcM2Match && calcM2Match[1]) {
        try {
          const payload = JSON.parse(calcM2Match[1].trim()) as {
            produtoId: string;
            superficies: Array<{ nome?: string; largura?: number; comprimento?: number; altura?: number; m2Direto?: number; perimetroManual?: number }>;
            acessorioProdutoId?: string | null;
          };

          const { resultado, produtoNome, itensComposicao } = await resolverECalcularOrcamento(tenantId, {
            produtoId: payload.produtoId,
            superficies: payload.superficies,
            acessorioProdutoId: payload.acessorioProdutoId ?? undefined,
          });

          const p = resultado.produtoPrincipal;
          const linhas = [
            `Com base nas medidas informadas (${p.quantidadeNecessaria} m²), você vai precisar de ${p.numeroPacotes} pacote${p.numeroPacotes === 1 ? "" : "s"} de ${produtoNome} — R$ ${p.valorTotal.toFixed(2)}.`,
          ];
          let valorTotalGeral = p.valorTotal;
          if (resultado.composicao && resultado.composicao.length > 0) {
            resultado.composicao.forEach((item, i) => {
              const nomeItem = itensComposicao[i]?.nome ?? "item adicional";
              const baseLabel = itensComposicao[i]?.baseCalculo === "perimetro" ? "de acabamento de perímetro" : "adicional";
              linhas.push(`Para o item ${baseLabel}, ${item.numeroPacotes} pacote${item.numeroPacotes === 1 ? "" : "s"} de ${nomeItem} — R$ ${item.valorTotal.toFixed(2)}.`);
              valorTotalGeral += item.valorTotal;
            });
            linhas.push(`Valor total: R$ ${valorTotalGeral.toFixed(2)}.`);
          }
          finalResposta = linhas.join(" ");
          log.info({ leadId, tenantId, agentName: resolvedAgentName, produtoId: payload.produtoId, valorTotalGeral }, "dispatch: cálculo de orçamento m² real executado");
        } catch (err) {
          if (err instanceof ErroResolucaoOrcamento || err instanceof ErroCalculoOrcamento) {
            finalResposta = `Preciso confirmar mais uma informação antes de calcular certinho: ${err.message}`;
            log.warn({ err, leadId, tenantId }, "dispatch: cálculo m² não pôde ser resolvido — pedindo mais dado ao invés de inventar valor");
          } else {
            finalResposta = "Deixa eu confirmar as medidas com você de novo antes de calcular, pode repetir?";
            log.error({ err, leadId, tenantId }, "dispatch: erro inesperado no cálculo de orçamento m²");
          }
        }
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
            "relato_tecnico" as AgentName,
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

    const campaignProspectorAuthorized =
      prospectorMode && await hasRecentProspectorCampaignAuthorization({ tenantId, leadId });
    const isAutonomous = !!config.autonomyEnabledAt || campaignProspectorAuthorized;
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

    if (smartDeliveryAfterInterest && task.status === "concluido") {
      await markSmartDeliverySent({
        tenantId,
        leadId,
        campaignId: smartDeliveryAfterInterest.campaignId,
        timing: "after_interest",
        toolName: smartDeliveryAfterInterest.toolName,
        url: smartDeliveryAfterInterest.url,
      });
    }

    // 10. Post-response: extract family data from conversation (async, non-blocking)
    if (resolvedAgentName !== "relacionamento") {
      extractFamilyData(tenantId, leadId, ctx, log).catch((err) => {
        log.error({ err, leadId, tenantId }, "dispatch: family extraction failed");
      });
    }

    // 11. Extract and persist qualification answers after Reception, SDR, Closer,
    // and Reactivation turns. ACHADO REAL (teste do Marcos): isso rodava em
    // segundo plano sem esperar (fire-and-forget) — se o lead respondesse
    // rápido, a PRÓXIMA mensagem chegava e chamava loadContext() antes dessa
    // extração terminar de gravar no banco, então o agente "esquecia" que
    // orçamento/decisor já tinham sido respondidos e perguntava de novo.
    // Agora espera terminar (await) antes de retornar — troca ~1-2s de
    // latência a mais por não repetir pergunta já respondida, que é pior
    // pra conversão do que a resposta demorar um pouco mais.
    if (["reception", "sdr", "closer", "reactivation"].includes(resolvedAgentName)) {
      try {
        await extractAndSaveQualification(
          tenantId,
          leadId,
          ctx,
          mensagem,
          finalResposta,
          log,
          resolvedAgentName === "sdr" ? (prospectorQuestionsForExtraction ?? spinQualificationForExtraction) : null,
        );
      } catch (err) {
        log.warn({ err, leadId, tenantId }, "dispatch: qualification extraction failed");
      }

      // After the synchronous extractor has persisted the latest answer, compute
      // the Prospecctor SQL gate from CRM state. Qualification only happens after
      // explicit context confirmation AND acceptance of the configured next step.
      if (prospectorMode && prospectorPlaybookForExtraction) {
        try {
          const [freshLead] = await db
            .select({
              discoveryData: leadsTable.discoveryData,
              metadata: leadsTable.metadata,
              endereco: leadsTable.endereco,
              status: leadsTable.status,
            })
            .from(leadsTable)
            .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)))
            .limit(1);

          if (freshLead) {
            const dd = (freshLead.discoveryData ?? {}) as Record<string, unknown>;
            const meta = (freshLead.metadata ?? {}) as Record<string, unknown>;
            const hasTerrainSignal = Boolean(
              freshLead.endereco ||
              meta["endereco_obra"] ||
              meta["obra"] ||
              meta["terrain"] ||
              meta["terreno"] ||
              meta["constructionSignal"],
            );
            const result = evaluateProspectorQualification({
              playbook: prospectorPlaybookForExtraction,
              discoveryData: dd,
              hasTerrainSignal,
            });
            const nextDiscoveryData = {
              ...dd,
              prospector_sql_checks: result.checks,
              prospector_diagnostics_complete: result.diagnosticsComplete,
              prospector_sql_qualified: result.qualified,
              prospector_last_evaluated_at: new Date().toISOString(),
            };

            await db.update(leadsTable)
              .set({
                discoveryData: nextDiscoveryData,
                ...(result.qualified ? {
                  status: "qualificado",
                  proximaAcao: prospectorPlaybookForExtraction.nextStep.offer,
                } : {
                  proximaAcao: result.diagnosticsComplete
                    ? "Confirmar entendimento do contexto e validar próximo passo"
                    : "Continuar diagnóstico consultivo do Prospecctor",
                }),
                updatedAt: new Date(),
              })
              .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, tenantId)));

            log.info(
              { tenantId, leadId, qualified: result.qualified, checks: result.checks },
              "dispatch: Prospecctor SQL gate evaluated",
            );

            if (result.qualified) {
              const qualifiedDelivery = await resolvePendingSmartDelivery({
                tenantId,
                leadId,
                desiredTiming: "after_qualification",
                log,
              });
              if (qualifiedDelivery) {
                const label = qualifiedDelivery.toolName?.trim() || "acesso personalizado";
                const deliveryText = `Perfeito. Agora que já tenho o contexto necessário, liberei seu ${label}: ${qualifiedDelivery.url}`;
                try {
                  await sendOutgoingMessage({
                    tenantId,
                    leadId,
                    conteudo: deliveryText,
                    canal: qualifiedDelivery.channel,
                    agentName: "sdr",
                  }, log);
                  await markSmartDeliverySent({
                    tenantId,
                    leadId,
                    campaignId: qualifiedDelivery.campaignId,
                    timing: "after_qualification",
                    toolName: qualifiedDelivery.toolName,
                    url: qualifiedDelivery.url,
                  });
                  log.info(
                    { tenantId, leadId, campaignId: qualifiedDelivery.campaignId },
                    "dispatch: smart delivery sent after qualification",
                  );
                } catch (err) {
                  log.warn(
                    { err, tenantId, leadId, campaignId: qualifiedDelivery.campaignId },
                    "dispatch: failed to send smart delivery after qualification",
                  );
                }
              }
            }
          }
        } catch (err) {
          log.warn({ err, tenantId, leadId }, "dispatch: Prospecctor SQL gate evaluation failed");
        }
      }

      // SPIN briefing (texto livre pro histórico/CRM) não afeta o que o
      // agente "sabe" na próxima mensagem — continua em segundo plano.
      extractAndSaveSpinBriefing(
        tenantId,
        leadId,
        ctx,
        mensagem,
        finalResposta,
        log,
        resolvedAgentName === "sdr" ? (prospectorQuestionsForExtraction ?? spinQualificationForExtraction) : null,
      ).catch((err) => {
        log.warn({ err, leadId, tenantId }, "dispatch: SPIN briefing extraction failed");
      });
    }

    const activeDealForPipeline = deals.find((d) => !["ganho", "perdido", "cancelado", "concluido"].includes(d.etapa));
    if (activeDealForPipeline) {
      void evaluatePipelineAI({
        tenantId,
        dealId: activeDealForPipeline.id,
        trigger: "agent_message",
        log,
      }).catch((err) => {
        log.warn({ err, tenantId, leadId, dealId: activeDealForPipeline.id }, "dispatch: pipeline AI evaluation failed");
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
      `Você é um extrator de dados de qualificação de vendas BANT (Budget, Authority, Need, Timeline). Analise a conversa abaixo e extraia APENAS as informações que o lead afirmou explicitamente. Não infira, não suponha.\n\n` +
      `Responda APENAS em JSON válido, sem markdown, sem explicações. Use este formato:\n` +
      `{"numero_funcionarios":"...","segmento":"...","crm_atual":"...","faturamento":"...","objetivo":"...","dor_principal":"...","orcamento":"...","urgencia":"...","autoridade":"..."}\n\n` +
      `Descrição dos campos BANT:\n` +
      `- orcamento (Budget): valor disponível para investir ou faixa de orçamento mencionada\n` +
      `- autoridade (Authority): nome ou cargo de quem toma a decisão de compra (ex: "o próprio lead", "precisa aprovar com o sócio", "CEO João", "diretora financeira")\n` +
      `- dor_principal / objetivo (Need): problema ou necessidade que o lead quer resolver\n` +
      `- urgencia (Timeline): prazo, urgência ou quando pretende contratar\n` +
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
    // Segmento: extraído pela IA mas antes só ficava perdido em discoveryData —
    // agora também vai pra mercadoSegmento, que é o campo que o gerador de
    // perguntas SPIN da tela de Briefing realmente lê
    if (extracted.segmento && !lead.mercadoSegmento)   update.mercadoSegmento = String(extracted.segmento);
    if (extracted.numero_funcionarios && !lead.tamanhoEquipe) {
      update.tamanhoEquipe = String(extracted.numero_funcionarios);
    }
    // Authority (BANT A): quem decide a compra → mapeia para representanteCargo
    if (extracted.autoridade && !(lead as Record<string, unknown>).representanteCargo) {
      update.representanteCargo = String(extracted.autoridade);
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

  // Oportunidades futuras que o VENDEDOR previu à mão (não vieram da
  // conversa) — contexto de apoio pra interpretar melhor o que o lead
  // fala, nunca uma fonte pra "extrair" como se o lead tivesse dito.
  let vendedorHints = "";
  try {
    const previstas = await db.select({ descricao: leadOportunidadesPrevistasTable.descricao })
      .from(leadOportunidadesPrevistasTable)
      .where(and(eq(leadOportunidadesPrevistasTable.leadId, leadId), eq(leadOportunidadesPrevistasTable.status, "aberta")))
      .limit(5);
    if (previstas.length > 0) {
      vendedorHints =
        `\nContexto do vendedor (previsão dele, NÃO é algo que o lead disse — use só pra interpretar melhor a conversa, nunca extraia isso como se fosse fala do lead):\n` +
        previstas.map((p) => `- ${p.descricao}`).join("\n") + "\n";
    }
  } catch (err) {
    log.warn({ err, leadId, tenantId }, "dispatch: falha ao buscar oportunidades previstas pelo vendedor (segue sem esse contexto)");
  }

  const prompt =
    `Você é um extrator de qualificação SPIN Selling. Analise a conversa e extraia o que o lead afirmou explicitamente. Não infira.\n` +
    `Responda APENAS em JSON válido, sem markdown:\n` +
    `{"situacao":"contexto atual do negócio mencionado ou null","problema":"dificuldades/dores mencionadas ou null","implicacao":"impacto/consequência do problema ou null","necessidade":"o que o lead precisa resolver ou null","valorImpacto":"valor ou número mencionado ou null"}\n` +
    `Regras:\n- Se não foi mencionado explicitamente, use null\n- Valores devem ser curtos (máx 200 caracteres)` +
    customHints +
    vendedorHints +
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
// Checa se um agente está ativo na tabela nova (tenant_agent_configs) —
// usado como fallback só quando o JSON legado (agentConfigsTable.agents)
// não tem entrada nenhuma pra esse agente. Ver comentário na chamada
// (passo 5 de processAgentInternal) pro contexto completo da unificação.
async function isAgentEnabledInNewerTable(tenantId: string, agentName: AgentName): Promise<boolean> {
  // "pharmacy" usa a mesma chave que o JSON legado usava (config.agents.service)
  // — preserva o comportamento original em vez de trocar pra 'farmacia'.
  const key = agentName === "pharmacy" ? "suporte" : AGENT_NAME_TO_KEY[agentName];
  if (!key) return false;
  const [row] = await db
    .select({ ativo: tenantAgentConfigsTable.ativo })
    .from(tenantAgentConfigsTable)
    .where(and(eq(tenantAgentConfigsTable.tenantId, tenantId), eq(tenantAgentConfigsTable.agentKey, key)))
    .limit(1);
  return !!row?.ativo;
}

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
