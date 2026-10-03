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
