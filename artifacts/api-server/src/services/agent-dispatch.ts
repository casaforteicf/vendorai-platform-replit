/**
 * Agent dispatch service — selects and runs the appropriate AI agent
 * for an incoming message without going through HTTP.
 *
 * Used by:
 *   - routes/webhooks.ts  (fire-and-forget after WhatsApp message insert)
 *   - jobs/scheduler.ts   (campaign message dispatch)
 */
import { and, desc, eq } from "drizzle-orm";
import type { Logger } from "pino";
import {
  db,
  agentConfigsTable,
  customerIntelligenceTable,
  dealsTable,
  leadsTable,
} from "@workspace/db";
import {
  loadContext,
  computeLimits,
  callOpenAI,
  updateCounters,
  insertAndRun,
  msgToOpenAI,
  PROMPT_BUILDERS,
  daysSinceLastContact,
  type AgentName,
} from "../lib/agent-engine.js";

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
export async function processAgentInternal(params: {
  tenantId: string;
  leadId:   string;
  mensagem: string;
  log:      Logger;
}): Promise<void> {
  const { tenantId, leadId, mensagem, log } = params;

  try {
    // 1. Load agent config
    const [config] = await db
      .select()
      .from(agentConfigsTable)
      .where(eq(agentConfigsTable.tenantId, tenantId));

    if (!config) {
      log.warn({ tenantId, leadId }, "dispatch: no agent config — skipping");
      return;
    }

    // 2. Load context (lead + CI + conversation + recent messages)
    const ctx = await loadContext(tenantId, leadId);
    if (!ctx) {
      log.warn({ tenantId, leadId }, "dispatch: lead not found — skipping");
      return;
    }

    // 3. Load open deals for agent routing
    const deals = await db
      .select()
      .from(dealsTable)
      .where(and(eq(dealsTable.tenantId, tenantId), eq(dealsTable.leadId, leadId)))
      .orderBy(desc(dealsTable.updatedAt));

    // 4. Determine which agent should respond
    const diasSinceContact = daysSinceLastContact(ctx);
    const agentName = determineAgent(ctx.lead, ctx.ci, deals, diasSinceContact);

    // 5. Check if that agent is enabled
    const agentCfg = config.agents?.[agentName];
    if (!agentCfg?.enabled) {
      // Fall back to SDR if the chosen agent is disabled
      const sdrCfg = config.agents?.["sdr"];
      if (!sdrCfg?.enabled) {
        log.warn({ tenantId, leadId, agentName }, "dispatch: chosen agent and SDR both disabled — skipping");
        return;
      }
    }

    const resolvedAgentName: AgentName = (agentCfg?.enabled ? agentName : "sdr");
    const resolvedAgentCfg = config.agents?.[resolvedAgentName];

    // 6. Check daily/monthly limits
    const limits = computeLimits(config);
    if (!limits.ok) {
      log.warn({ tenantId, leadId, ...limits.body }, "dispatch: limit reached — skipping");
      return;
    }

    // 7. Build prompt and call OpenAI
    const buildPrompt = PROMPT_BUILDERS[resolvedAgentName];
    const openaiMessages = [
      { role: "system" as const, content: buildPrompt(resolvedAgentCfg?.prompt, ctx) },
      ...ctx.recentMessages.map(msgToOpenAI),
      { role: "user" as const, content: mensagem },
    ];

    let resposta: string;
    let tokensUsed: number;
    try {
      ({ resposta, tokensUsed } = await callOpenAI(openaiMessages));
      log.info({ leadId, tenantId, agentName: resolvedAgentName, tokensUsed }, "dispatch: openai call succeeded");
    } catch (err) {
      log.error({ err, leadId, tenantId, agentName: resolvedAgentName }, "dispatch: openai call failed");
      return;
    }

    // 8. Update counters and insert task
    const now = new Date();
    await updateCounters(config, limits, tokensUsed, now);

    const isAutonomous = !!config.autonomyEnabledAt;
    const task = await insertAndRun({
      tenantId,
      leadId,
      agentName: resolvedAgentName,
      actionType: "enviar_whatsapp",
      resposta,
      isAutonomous,
      now,
      log,
    });

    log.info(
      { taskId: task.id, status: task.status, leadId, tenantId, agentName: resolvedAgentName, tokensUsed, isAutonomous },
      "dispatch: agent task created"
    );
  } catch (err) {
    log.error({ err, tenantId, leadId }, "dispatch: unexpected error — skipping");
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
}): void {
  processAgentInternal(params).catch((err) => {
    params.log.error({ err, ...params }, "dispatch: unhandled error in background task");
  });
}
