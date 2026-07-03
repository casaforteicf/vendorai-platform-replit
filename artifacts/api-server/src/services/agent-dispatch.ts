/**
 * Agent dispatch service — selects and runs the appropriate AI agent
 * for an incoming message without going through HTTP.
 *
 * Used by:
 *   - routes/webhooks.ts  (fire-and-forget after WhatsApp message insert)
 *   - jobs/scheduler.ts   (campaign message dispatch)
 */
import { and, desc, eq, isNull, or } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  agentConfigsTable,
  conversationsTable,
  customerIntelligenceTable,
  dealsTable,
  leadsTable,
  propostasTable,
  leadSpouseConsentTable,
  tenantCalendarSettingsTable,
} from "@workspace/db";
import { callOpenAI as gatewayFamilyCallOpenAI } from "../lib/ai-gateway.js";
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
} from "../lib/agent-engine.js";
import { proposalAccepted } from "../lib/proposal-accepted.js";
import { checkAgentPlan } from "../middlewares/plan-guard.js";

type Lead = typeof leadsTable.$inferSelect;
type CI   = typeof customerIntelligenceTable.$inferSelect;
type Deal = typeof dealsTable.$inferSelect;

// ── Agent routing ─────────────────────────────────────────────────────────────

/**
 * Determines which agent should handle an incoming message based on:
 *  1. churnRisk >= 60  → reactivation (highest priority)
 *  2. lead.status      → maps directly to the matching agent
 *  3. open deal etapa  → closer when deal is advancing
 *  4. days since contact ≥ 3 → followup
 *  5. default          → sdr
 */
export function determineAgent(
  lead:  Lead,
  ci:    CI | null,
  deals: Deal[],
  daysSinceContact: number | null,
): AgentName {
  // 1. High churn risk → reactivation agent (overrides everything)
  if (ci?.churnRisk !== null && ci?.churnRisk !== undefined && ci.churnRisk >= 60) {
    return "reactivation";
  }

  // 2. Lead status → direct mapping
  if (lead.status === "novo") return "sdr";
  if (lead.status === "cliente") return "service";

  // 3. Has active deals? Route based on their stage
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
      agentName = determineAgent(ctx.lead, ctx.ci, deals, diasSinceContact);
    }

    // 4b. Persist current_agent on the conversation (non-blocking best-effort)
    if (ctx.conversation?.id) {
      db.update(conversationsTable)
        .set({ currentAgent: agentName, updatedAt: new Date() })
        .where(eq(conversationsTable.id, ctx.conversation.id))
        .catch((err) => log.warn({ err, conversationId: ctx.conversation!.id }, "dispatch: failed to update currentAgent"));
    }

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

    // 6. Check daily/monthly limits
    const limits = computeLimits(config);
    if (!limits.ok) {
      log.warn({ tenantId, leadId, ...limits.body }, "dispatch: limit reached — skipping");
      return { status: "skipped", reason: "limit_reached" };
    }

    // 7. Build prompt and call OpenAI
    const buildPrompt = PROMPT_BUILDERS[resolvedAgentName];
    const scenario = params.scenario ?? null;

    // Resolve DB-driven system prompt override
    let dispatchSystemPrompt: string | null = null;
    const dispatchAgentKey = AGENT_NAME_TO_KEY[resolvedAgentName];
    if (dispatchAgentKey) {
      try {
        const resolved = await getAgentConfig(tenantId, dispatchAgentKey);
        dispatchSystemPrompt = resolved?.systemPrompt ?? null;
      } catch (err) {
        log.warn({ err, agentName: resolvedAgentName, tenantId }, "dispatch: getAgentConfig failed, using hardcoded fallback");
      }
    }

    const openaiMessages = [
      { role: "system" as const, content: buildPrompt(resolvedAgentCfg?.prompt, ctx, scenario, dispatchSystemPrompt) },
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
