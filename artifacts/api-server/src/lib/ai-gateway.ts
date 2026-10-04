/**
 * AI Gateway — Centralized AI call layer with BYOK, cost governance, and logging.
 *
 * Every AI call in the system must go through this module. No direct SDK calls.
 */
import { loadApprovedBusinessContext } from "../services/business-plan.js";
import { roleForFeature } from "../services/business-plan-model.js";
import { eq, sql, gte, and } from "drizzle-orm";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleAuth } from "google-auth-library";
import type { Logger } from "pino";
import {
  db,
  tenantsTable,
  plansTable,
  aiUsageLogsTable,
} from "@workspace/db";
import type { AiFeature } from "@workspace/db";
import { sendAiFailureAlert } from "./email.js";
import { isModernReasoningModel, reasoningEffortForFeature, resolveTextModel } from "./ai-model-router.js";
import {
  authorizeVendorCredits,
  debitVendorCredits,
  refundVendorCredits,
  recordCommercialUsage,
  getVendorCreditEnforcementMode,
} from "../services/commercial-usage.js";

// ── Cost models (USD per 1M tokens) ───────────────────────────────────────────
const COST_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini":        { input: 0.15,  output: 0.60 },
  "gpt-4o":             { input: 2.50,  output: 10.00 },
  "gpt-4.1":            { input: 2.00,  output: 8.00 },
  "gpt-4.1-mini":       { input: 0.40,  output: 1.60 },
  "gpt-6-astra":         { input: 10.00, output: 50.00 },
  "gpt-5.6-sol":         { input: 4.00,  output: 20.00 },
  "gpt-5.6-terra":       { input: 2.00,  output: 12.00 },
  "gpt-5.6-luna":        { input: 0.20,  output: 1.20 },
  "claude-sonnet-4-6":  { input: 3.00,  output: 15.00 },
  "claude-3-5-sonnet":  { input: 3.00,  output: 15.00 },
  "whisper-1":          { input: 0,     output: 0 },  // priced per minute, not token
  "gpt-image-1":        { input: 0,     output: 0 },  // priced per image
  "dall-e-3":           { input: 0,     output: 0 },  // priced per image
  "text-embedding-3-small": { input: 0.02, output: 0 },
  "text-embedding-3-large": { input: 0.13, output: 0 },
};

const DEFAULT_COST = { input: 2.00, output: 8.00 };

/** Estimate USD cost from token counts. */
export function estimateCost(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = COST_PER_1M[model] ?? DEFAULT_COST;
  const cost = (inputTokens / 1_000_000) * rates.input +
               (outputTokens / 1_000_000) * rates.output;
  return Math.round(cost * 1_000_000) / 1_000_000; // round to 6 decimals
}

// ── BYOK key resolution ───────────────────────────────────────────────────────

export async function resolveAIKey(
  tenantId: string,
  provider: "openai" | "anthropic",
): Promise<{ apiKey: string; usedByok: true } | { apiKey: string; usedByok: false }> {
  const [tenant] = await db
    .select({
      openaiApiKeyEncrypted: tenantsTable.openaiApiKeyEncrypted,
      openaiKeyStatus: tenantsTable.openaiKeyStatus,
      anthropicApiKeyEncrypted: tenantsTable.anthropicApiKeyEncrypted,
      anthropicKeyStatus: tenantsTable.anthropicKeyStatus,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId as string))
    .limit(1);

  if (provider === "openai") {
    if (tenant?.openaiApiKeyEncrypted && tenant.openaiKeyStatus === "ativo") {
      try {
        const { decrypt } = await import("./crypto.js");
        const apiKey = decrypt(tenant.openaiApiKeyEncrypted);
        return { apiKey, usedByok: true };
      } catch {
        // fallback to global
      }
    }
    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) throw new Error("OPENAI_API_KEY environment variable is not set");
    return { apiKey, usedByok: false };
  }

  if (provider === "anthropic") {
    if (tenant?.anthropicApiKeyEncrypted && tenant.anthropicKeyStatus === "ativo") {
      try {
        const { decrypt } = await import("./crypto.js");
        const apiKey = decrypt(tenant.anthropicApiKeyEncrypted);
        return { apiKey, usedByok: true };
      } catch {
        // fallback to global
      }
    }
    const apiKey = process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY environment variable is not set");
    return { apiKey, usedByok: false };
  }

  throw new Error(`Unsupported provider: ${provider}`);
}

// ── Quota / Credit / Monthly ceiling check ───────────────────────────────────

export interface QuotaCheck {
  ok: true;
  usedByok: boolean;
  quotaUsd: number | null;
  creditsUsd: number;
  spentThisMonthUsd: number;
  remainingUsd: number;
}

export interface QuotaBlocked {
  ok: false;
  reason: string;
  httpStatus: 402 | 429;
  details: { quotaUsd: number | null; creditsUsd: number; spentThisMonthUsd: number; dailySpendUsd: number; };
}

export type QuotaResult = QuotaCheck | QuotaBlocked;

const MONTHLY_SPEND_CEILING_USD = Number(process.env["AI_MONTHLY_SPEND_CEILING_USD"] ?? 30);

export async function checkQuota(
  tenantId: string,
  estimatedCost: number,
  log?: Logger,
  options: { bypassTenantPlanQuota?: boolean } = {},
): Promise<QuotaResult> {
  const [tenant] = await db.select({
    planId: tenantsTable.planId,
    aiCreditsUsd: tenantsTable.aiCreditsUsd,
    openaiKeyStatus: tenantsTable.openaiKeyStatus,
    anthropicKeyStatus: tenantsTable.anthropicKeyStatus,
  }).from(tenantsTable).where(eq(tenantsTable.id, tenantId as string)).limit(1);

  if (!tenant) return { ok: false, reason: "Tenant not found", httpStatus: 429, details: { quotaUsd: null, creditsUsd: 0, spentThisMonthUsd: 0, dailySpendUsd: 0 } };

  const hasByok = tenant.openaiKeyStatus === "ativo" || tenant.anthropicKeyStatus === "ativo";
  if (hasByok) return { ok: true, usedByok: true, quotaUsd: null, creditsUsd: Number(tenant.aiCreditsUsd ?? 0), spentThisMonthUsd: 0, remainingUsd: Infinity };

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [monthlyRow] = await db.select({ total: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)` })
    .from(aiUsageLogsTable)
    .where(and(
      eq(aiUsageLogsTable.tenantId, tenantId as string),
      eq(aiUsageLogsTable.success, true),
      eq(aiUsageLogsTable.usedByok, false),
      gte(aiUsageLogsTable.createdAt, startOfMonth),
    ));
  const spentThisMonthUsd = Number(monthlyRow?.total ?? 0);

  if (spentThisMonthUsd + estimatedCost > MONTHLY_SPEND_CEILING_USD) {
    return {
      ok: false,
      reason: `Monthly AI spend ceiling reached ($${MONTHLY_SPEND_CEILING_USD.toFixed(2)}). Contact support to increase.`,
      httpStatus: 429,
      details: { quotaUsd: null, creditsUsd: Number(tenant.aiCreditsUsd ?? 0), spentThisMonthUsd, dailySpendUsd: 0 },
    };
  }

  let quotaUsd: number | null = null;
  if (tenant.planId) {
    const [plan] = await db.select({ aiQuotaUsd: plansTable.aiQuotaUsd }).from(plansTable).where(eq(plansTable.id, tenant.planId)).limit(1);
    if (plan?.aiQuotaUsd) quotaUsd = Number(plan.aiQuotaUsd);
  }

  const creditsUsd = Number(tenant.aiCreditsUsd ?? 0);

  // Internal platform runtimes (for example Browser Agent) are operational
  // infrastructure, not a tenant credit purchase. They still respect the
  // platform monthly spend ceiling above and usage remains tenant-attributed,
  // but they must not stop when the tenant's commercial AI allowance is empty.
  if (options.bypassTenantPlanQuota) {
    log?.debug({ tenantId }, "ai-gateway: platform runtime bypassing tenant plan quota");
    return {
      ok: true,
      usedByok: false,
      quotaUsd,
      creditsUsd,
      spentThisMonthUsd,
      remainingUsd: Infinity,
    };
  }

  // Once Vendor Credits enforcement is enabled, commercial allowance is
  // governed by the Vendor Credit wallet. USD quota remains internal telemetry
  // and the platform spend ceiling above remains the hard safety guardrail.
  if (getVendorCreditEnforcementMode() === "enforce") {
    return {
      ok: true,
      usedByok: false,
      quotaUsd,
      creditsUsd,
      spentThisMonthUsd,
      remainingUsd: Infinity,
    };
  }

  if (quotaUsd === null && creditsUsd === 0) {
    const hasPlatformKey = Boolean(process.env["OPENAI_API_KEY"] || process.env["ANTHROPIC_API_KEY"]);
    if (hasPlatformKey) {
      log?.debug({ tenantId }, "ai-gateway: platform-subsidized mode (no plan/credits)");
      return { ok: true, usedByok: false, quotaUsd: null, creditsUsd: 0, spentThisMonthUsd, remainingUsd: Infinity };
    }
  }

  const remainingUsd = (quotaUsd ?? 0) + creditsUsd - spentThisMonthUsd;
  if (quotaUsd && spentThisMonthUsd >= quotaUsd * 0.8 && spentThisMonthUsd < quotaUsd)
    log?.info({ tenantId, quotaUsd, spentThisMonthUsd }, "ai-gateway: tenant approaching quota limit (80%)");

  if (remainingUsd < estimatedCost) {
    const reason = creditsUsd > 0
      ? `AI quota exhausted ($${quotaUsd?.toFixed(2) ?? "0"} plan + $${creditsUsd.toFixed(2)} credits). Purchase more credits.`
      : `AI quota exhausted ($${quotaUsd?.toFixed(2) ?? "0"} plan). Purchase credits or configure BYOK.`;
    return { ok: false, reason, httpStatus: 402, details: { quotaUsd, creditsUsd, spentThisMonthUsd, dailySpendUsd: 0 } };
  }

  return { ok: true, usedByok: false, quotaUsd, creditsUsd, spentThisMonthUsd, remainingUsd };
}

// ── Usage logging ─────────────────────────────────────────────────────────────

export async function logUsage(params: {
  tenantId: string;
  provider: "openai" | "anthropic";
  model: string;
  feature: AiFeature;
  inputTokens: number;
  outputTokens: number;
  costEstimateUsd: number;
  usedByok: boolean;
  success: boolean;
  errorMessage?: string;
  requestId?: string;
}): Promise<void> {
  await (db as any).insert(aiUsageLogsTable).values({
    tenantId: params.tenantId,
    provider: params.provider,
    model: params.model ?? "unknown",
    feature: params.feature,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    costEstimateUsd: String(params.costEstimateUsd),
    usedByok: params.usedByok,
    success: params.success,
    errorMessage: params.errorMessage ?? null,
    requestId: params.requestId ?? null,
  });
}

// ── Legacy daily-spend updater ───────────────────────────────────────────────
// Compatibility no-op. Monthly spend is derived from confirmed usage logs.
export async function incrementDailySpend(_tenantId: string, _amountUsd: number): Promise<void> {
  // Intentionally empty.
}

async function localizeAgentOnboardingMessages(
  tenantId: string,
  feature: AiFeature,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): Promise<OpenAI.Chat.ChatCompletionMessageParam[]> {
  if (feature !== "agent_onboarding") return messages;

  const [tenant] = await db
    .select({ defaultLocale: tenantsTable.defaultLocale })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant?.defaultLocale?.startsWith("es")) return messages;

  const languageInstruction =
    `INSTRUCCIÓN DE IDIOMA PRIORITARIA: responde siempre en español claro y natural, ` +
    `adaptado al locale ${tenant.defaultLocale}. Esta instrucción de idioma sustituye cualquier instrucción anterior que pida responder en portugués.`;

  const localizedMessages = [...messages];
  const systemIndex = localizedMessages.findIndex(
    (message) => message.role === "system" && typeof message.content === "string",
  );

  if (systemIndex < 0) {
    return [{ role: "system", content: languageInstruction }, ...localizedMessages];
  }

  const systemMessage = localizedMessages[systemIndex];
  if (systemMessage?.role === "system" && typeof systemMessage.content === "string") {
    localizedMessages[systemIndex] = {
      ...systemMessage,
      content: `${systemMessage.content}\n\n${languageInstruction}`,
    };
  }

  return localizedMessages;
}

// ── Unified OpenAI call ─────────────────────────────────────────────────────

export async function callOpenAI(
  tenantId: string,
  feature: AiFeature,
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
  options: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    responseFormat?: OpenAI.Chat.Completions.ChatCompletionCreateParams["response_format"];
    log?: Logger;
    billingScope?: "tenant" | "platform_runtime";
    requestId?: string;
    commercialUsage?: {
      metricKey?: string;
      quantity?: number;
      commercialKey?: string | null;
    };
  } = {},
): Promise<{ content: string; inputTokens: number; outputTokens: number; costUsd: number; usedByok: boolean }> {
  const model = resolveTextModel({ tenantId, feature, requestedModel: options.model, legacyDefault: "gpt-4o-mini" });
  const log = options.log;
  const role = roleForFeature(String(feature));
  const businessContext = role ? await loadApprovedBusinessContext(tenantId, role) : "";
  const withBusinessContext = businessContext && !messages.some(m => m.role === "system" && typeof m.content === "string" && m.content.includes("[VENDORAI_BUSINESS_PLAN]"))
    ? [{ role: "system" as const, content: businessContext }, ...messages]
    : messages;
  const localizedMessages = await localizeAgentOnboardingMessages(tenantId, feature, withBusinessContext);
  const commercialRequestId = options.requestId ?? crypto.randomUUID();
  const commercialMetricKey = options.billingScope === "platform_runtime"
    ? null
    : (options.commercialUsage?.metricKey ?? "ai_assist");
  const commercialQuantity = Math.max(0, Number(options.commercialUsage?.quantity ?? 1));
  let reservedVendorCredits = 0;

  if (commercialMetricKey) {
    const authorization = await authorizeVendorCredits(tenantId, commercialMetricKey, commercialQuantity);
    if (!authorization.ok) {
      throw new AiGatewayError(
        "Saldo de Vendor Credits insuficiente. Adicione Credits para continuar.",
        402,
        { requiredVendorCredits: authorization.required, availableVendorCredits: authorization.available },
      );
    }
    const reservation = await debitVendorCredits({
      tenantId,
      credits: authorization.required,
      commercialKey: options.commercialUsage?.commercialKey ?? null,
      referenceId: `usage-reservation:${commercialRequestId}`,
      reason: "usage_reservation",
      metadata: { metricKey: commercialMetricKey, quantity: commercialQuantity, feature: String(feature) },
    });
    reservedVendorCredits = Number(reservation.debited ?? 0);
  }

  // 1. Estimate cost (rough pre-check based on message length)
  const estimatedInputTokens = localizedMessages.reduce((acc, m) => acc + (typeof m.content === "string" ? m.content.length : 0), 0) / 4;
  const estimatedCost = estimateCost((model ?? "unknown"), Math.ceil(estimatedInputTokens), options.maxTokens ?? 600);

  // 2. Check quota
  const quota = await checkQuota(
    tenantId,
    estimatedCost,
    log,
    { bypassTenantPlanQuota: options.billingScope === "platform_runtime" },
  );
  if (!quota.ok) {
    throw new AiGatewayError(quota.reason, quota.httpStatus, quota.details);
  }

  // 3. Resolve key
  const key = await resolveAIKey(tenantId, "openai");
  const openai = new OpenAI({ apiKey: key.apiKey });

  // 4. Call
  let completion: OpenAI.Chat.Completions.ChatCompletion;
  let success = false;
  let errorMessage: string | undefined;
  try {
    const modernReasoningModel = isModernReasoningModel(model);
    completion = await openai.chat.completions.create({
      model,
      messages: localizedMessages,
      ...(modernReasoningModel
        ? {
            reasoning_effort: reasoningEffortForFeature(feature),
            max_completion_tokens: options.maxTokens ?? 600,
          }
        : {
            temperature: options.temperature ?? 0.7,
            max_tokens: options.maxTokens ?? 600,
          }),
      ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
    success = true;
  } catch (err: any) {
    errorMessage = err.message ?? "OpenAI call failed";
    log?.error({ tenantId, feature, model, error: errorMessage }, "ai-gateway: OpenAI call failed");
    // Log the failed attempt
    const inputTokensEst = Math.ceil(estimatedInputTokens);
    const costUsdEst = estimateCost((model ?? "unknown"), inputTokensEst, 0);
    await logUsage({ tenantId, provider: "openai", model: model ?? "unknown", feature, inputTokens: inputTokensEst, outputTokens: 0, costEstimateUsd: costUsdEst, usedByok: key.usedByok, success: false, errorMessage });
    if (commercialMetricKey) {
      await recordCommercialUsage({
        tenantId,
        commercialKey: options.commercialUsage?.commercialKey ?? null,
        metricKey: commercialMetricKey,
        quantity: commercialQuantity,
        success: false,
        billable: true,
        billingStatus: "non_billable",
        provider: "openai",
        model: model ?? "unknown",
        inputTokens: inputTokensEst,
        outputTokens: 0,
        totalCostUsd: costUsdEst,
        source: "ai_gateway",
        sourceEventId: `commercial:${commercialRequestId}`,
        requestId: commercialRequestId,
        metadata: { feature: String(feature) },
      });
      if (reservedVendorCredits > 0) {
        await refundVendorCredits({
          tenantId,
          credits: reservedVendorCredits,
          commercialKey: options.commercialUsage?.commercialKey ?? null,
          referenceId: `usage-reservation:${commercialRequestId}`,
          metadata: { metricKey: commercialMetricKey, feature: String(feature), providerFailure: true },
        });
      }
    }
    if (quota.ok && !quota.usedByok) await incrementDailySpend(tenantId, costUsdEst);

    // Fire-and-forget alert (non-blocking, throttled to 1/15min per error type)
    void sendAiFailureAlert({
      provider: "openai",
      errorType: err?.status === 429 ? "429_quota" : "502_error",
      feature: String(feature),
      tenantId: String(tenantId),
      model: String(model),
      message: errorMessage ?? "Erro desconhecido",
    });

    // 429 quota exceeded → attempt Anthropic fallback if key available
    if (err?.status === 429 && process.env["ANTHROPIC_API_KEY"]) {
      log?.info({ tenantId, feature }, "ai-gateway: OpenAI 429 → falling back to Anthropic");
      const systemMsgRaw = localizedMessages.find((m) => m.role === "system");
      const chatMsgs = localizedMessages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        }));
      try {
        return await callAnthropic(tenantId, feature, chatMsgs, {
          maxTokens: options.maxTokens ?? 600,
          system: typeof systemMsgRaw?.content === "string" ? systemMsgRaw.content : undefined,
          log,
          requestId: commercialRequestId,
          commercialUsage: commercialMetricKey ? {
            metricKey: commercialMetricKey,
            quantity: commercialQuantity,
            commercialKey: options.commercialUsage?.commercialKey ?? null,
          } : undefined,
        });
      } catch (anthropicErr: any) {
        log?.error({ tenantId, feature, error: anthropicErr?.message }, "ai-gateway: Anthropic fallback also failed");
      }
    }

    const friendlyMessage = err?.status === 429
      ? "Limite de uso da IA atingido. Tente novamente em alguns minutos ou configure uma chave própria nas Configurações."
      : (errorMessage ?? "OpenAI call failed");
    throw new AiGatewayError(friendlyMessage, err?.status === 429 ? 429 : 502, { provider: "openai", model: model ?? "unknown" });
  }

  // 5. Extract tokens
  const inputTokens = completion.usage?.prompt_tokens ?? Math.ceil(estimatedInputTokens);
  const outputTokens = completion.usage?.completion_tokens ?? 0;
  const costUsd = estimateCost((model ?? "unknown"), inputTokens, outputTokens);

  // 6. Log usage
  await logUsage({ tenantId, provider: "openai", model: model ?? "unknown", feature, inputTokens, outputTokens, costEstimateUsd: costUsd, usedByok: key.usedByok, success: true });
  if (commercialMetricKey) {
    await recordCommercialUsage({
      tenantId,
      commercialKey: options.commercialUsage?.commercialKey ?? null,
      metricKey: commercialMetricKey,
      quantity: commercialQuantity,
      success: true,
      billable: true,
      billingStatus: "overage",
      provider: "openai",
      model: model ?? "unknown",
      inputTokens,
      outputTokens,
      totalCostUsd: costUsd,
      source: "ai_gateway",
      sourceEventId: `commercial:${commercialRequestId}`,
      requestId: commercialRequestId,
      metadata: { feature: String(feature), vendorCreditsReserved: reservedVendorCredits },
    });
  }

  // 7. Update daily spend (only if using shared key)
  if (!key.usedByok) {
    await incrementDailySpend(tenantId, costUsd);
  }

  return {
    content: completion.choices[0]?.message?.content?.trim() ?? "",
    inputTokens,
    outputTokens,
    costUsd,
    usedByok: key.usedByok,
  };
}

// ── Unified Anthropic call ────────────────────────────────────────────────────

export async function callAnthropic(
  tenantId: string,
  feature: AiFeature,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  options: {
    model?: string;
    maxTokens?: number;
    system?: string;
    log?: Logger;
    requestId?: string;
    commercialUsage?: {
      metricKey?: string;
      quantity?: number;
      commercialKey?: string | null;
    };
  } = {},
): Promise<{ content: string; inputTokens: number; outputTokens: number; costUsd: number; usedByok: boolean }> {
  const role = roleForFeature(String(feature));
  const businessContext = role ? await loadApprovedBusinessContext(tenantId, role) : "";
  const system = options.system?.includes("[VENDORAI_BUSINESS_PLAN]") ? options.system : [businessContext, options.system].filter(Boolean).join("\n\n");
  const model = options.model ?? "claude-sonnet-4-6";
  const log = options.log;
  const commercialRequestId = options.requestId ?? crypto.randomUUID();
  const commercialMetricKey = options.commercialUsage?.metricKey ?? "ai_assist";
  const commercialQuantity = Math.max(0, Number(options.commercialUsage?.quantity ?? 1));
  let reservedVendorCredits = 0;

  const authorization = await authorizeVendorCredits(tenantId, commercialMetricKey, commercialQuantity);
  if (!authorization.ok) {
    throw new AiGatewayError(
      "Saldo de Vendor Credits insuficiente. Adicione Credits para continuar.",
      402,
      { requiredVendorCredits: authorization.required, availableVendorCredits: authorization.available },
    );
  }
  const reservation = await debitVendorCredits({
    tenantId,
    credits: authorization.required,
    commercialKey: options.commercialUsage?.commercialKey ?? null,
    referenceId: `usage-reservation:${commercialRequestId}`,
    reason: "usage_reservation",
    metadata: { metricKey: commercialMetricKey, quantity: commercialQuantity, feature: String(feature) },
  });
  reservedVendorCredits = Number(reservation.debited ?? 0);

  // 1. Estimate cost
  const estimatedInputTokens = (system.length + messages.reduce((acc, m) => acc + m.content.length, 0)) / 4;
  const estimatedCost = estimateCost((model ?? "unknown"), Math.ceil(estimatedInputTokens), options.maxTokens ?? 32000);

  // 2. Check quota
  const quota = await checkQuota(tenantId, estimatedCost, log);
  if (!quota.ok) {
    throw new AiGatewayError(quota.reason, quota.httpStatus, quota.details);
  }

  // 3. Resolve key
  const key = await resolveAIKey(tenantId, "anthropic");
  const anthropic = new Anthropic({ apiKey: key.apiKey });

  // 4. Call
  let content = "";
  let inputTokens = Math.ceil(estimatedInputTokens);
  let outputTokens = 0;
  let success = false;
  let errorMessage: string | undefined;

  try {
    const userMessages = messages.filter((m) => m.role === "user");
    const stream = await anthropic.messages.create({
      model,
      max_tokens: options.maxTokens ?? 32000,
      stream: true,
      messages: userMessages.map((m) => ({ role: m.role, content: m.content })),
      ...(system ? { system } : {}),
    });
    const chunks: string[] = [];
    let stopReason: string | null = null;
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        chunks.push(event.delta.text);
      }
      if (event.type === "message_stop") {
        stopReason = "end_turn";
      }
      if (event.type === "message_delta" && event.delta?.stop_reason) {
        stopReason = event.delta.stop_reason;
      }
      if (event.type === "message_start" && (event.message as any)?.usage) {
        inputTokens = (event.message as any).usage.input_tokens ?? inputTokens;
      }
      if (event.type === "message_delta" && (event.delta as any)?.usage) {
        outputTokens = (event.delta as any).usage.output_tokens ?? outputTokens;
      }
    }
    content = chunks.join("");
    success = true;

    if (stopReason === "max_tokens") {
      errorMessage = `Anthropic response truncated: max_tokens reached (${content.length} chars)`;
      log?.warn({ tenantId, feature, model }, "ai-gateway: Anthropic response truncated");
    }
  } catch (err: any) {
    errorMessage = err.message ?? "Anthropic call failed";
    log?.error({ tenantId, feature, model, error: errorMessage }, "ai-gateway: Anthropic call failed");

    // Detect billing/credit errors early — log, then throw with friendly message
    const isBillingError =
      err?.status === 400 &&
      (errorMessage?.toLowerCase().includes("credit balance") ||
       errorMessage?.toLowerCase().includes("insufficient") ||
       errorMessage?.toLowerCase().includes("billing"));
    if (isBillingError) {
      const costUsdPartial = estimateCost((model ?? "unknown"), Math.ceil(inputTokens), 0);
      await logUsage({ tenantId, provider: "anthropic", model: model ?? "unknown", feature, inputTokens: Math.ceil(inputTokens), outputTokens: 0, costEstimateUsd: costUsdPartial, usedByok: key.usedByok, success: false, errorMessage });
      void sendAiFailureAlert({
        provider: "anthropic",
        errorType: "400_billing",
        feature: String(feature),
        tenantId: String(tenantId),
        model: String(model),
        message: errorMessage ?? "Erro desconhecido",
      });
      if (reservedVendorCredits > 0) {
        await refundVendorCredits({
          tenantId,
          credits: reservedVendorCredits,
          commercialKey: options.commercialUsage?.commercialKey ?? null,
          referenceId: `usage-reservation:${commercialRequestId}`,
          metadata: { metricKey: commercialMetricKey, feature: String(feature), providerFailure: true },
        });
      }
      throw new AiGatewayError(
        "Saldo da IA esgotado. Configure uma chave própria da Anthropic ou da OpenAI nas Configurações → Integrações.",
        402,
        { provider: "anthropic", model: model ?? "unknown" },
      );
    }

    // Alert for non-billing Anthropic failures
    void sendAiFailureAlert({
      provider: "anthropic",
      errorType: "502_error",
      feature: String(feature),
      tenantId: String(tenantId),
      model: String(model),
      message: errorMessage ?? "Erro desconhecido",
    });
  }

  // 5. Compute cost
  const costUsd = estimateCost((model ?? "unknown"), inputTokens, outputTokens);

  // 6. Log usage (even on failure)
  await logUsage({
    tenantId,
    provider: "anthropic",
    model,
    feature,
    inputTokens,
    outputTokens,
    costEstimateUsd: costUsd,
    usedByok: key.usedByok,
    success,
    errorMessage,
  });

  await recordCommercialUsage({
    tenantId,
    commercialKey: options.commercialUsage?.commercialKey ?? null,
    metricKey: commercialMetricKey,
    quantity: commercialQuantity,
    success,
    billable: true,
    billingStatus: success ? "overage" : "non_billable",
    provider: "anthropic",
    model,
    inputTokens,
    outputTokens,
    totalCostUsd: costUsd,
    source: "ai_gateway",
    sourceEventId: `commercial:${commercialRequestId}`,
    requestId: commercialRequestId,
    metadata: { feature: String(feature), vendorCreditsReserved: reservedVendorCredits },
  });

  if (!success && reservedVendorCredits > 0) {
    await refundVendorCredits({
      tenantId,
      credits: reservedVendorCredits,
      commercialKey: options.commercialUsage?.commercialKey ?? null,
      referenceId: `usage-reservation:${commercialRequestId}`,
      metadata: { metricKey: commercialMetricKey, feature: String(feature), providerFailure: true },
    });
  }

  // 7. Update daily spend
  if (!key.usedByok) {
    await incrementDailySpend(tenantId, costUsd);
  }

  if (!success) {
    throw new AiGatewayError(errorMessage ?? "Anthropic call failed", 502, { provider: "anthropic", model });
  }

  return { content, inputTokens, outputTokens, costUsd, usedByok: key.usedByok };
}

// ── Gateway error class ───────────────────────────────────────────────────────

export class AiGatewayError extends Error {
  readonly name = "AiGatewayError";
  readonly status: number;
  readonly details: Record<string, unknown>;

  constructor(message: string, status: number, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

// ── Helper: image generation via OpenAI ───────────────────────────────────────

export async function generateImage(
  tenantId: string,
  feature: AiFeature,
  prompt: string,
  options: {
    model?: string;
    size?: "1024x1024" | "1024x1536" | "1536x1024";
    n?: number;
    log?: Logger;
    requestId?: string;
    commercialUsage?: {
      metricKey?: "image" | "image_premium";
      quantity?: number;
      commercialKey?: string | null;
    };
  } = {},
): Promise<{ urls: string[]; costUsd: number; usedByok: boolean }> {
  const model = options.model ?? "gpt-image-1";
  const log = options.log;
  const n = Math.min(Math.max(options.n ?? 1, 1), 10);
  const commercialRequestId = options.requestId ?? crypto.randomUUID();
  const commercialMetricKey = options.commercialUsage?.metricKey ?? "image";
  const commercialQuantity = Math.max(1, Number(options.commercialUsage?.quantity ?? n));
  const authorization = await authorizeVendorCredits(tenantId, commercialMetricKey, commercialQuantity);
  if (!authorization.ok) {
    throw new AiGatewayError(
      "Saldo de Vendor Credits insuficiente. Adicione Credits para gerar a imagem.",
      402,
      { requiredVendorCredits: authorization.required, availableVendorCredits: authorization.available },
    );
  }
  const reservation = await debitVendorCredits({
    tenantId,
    credits: authorization.required,
    commercialKey: options.commercialUsage?.commercialKey ?? null,
    referenceId: `usage-reservation:${commercialRequestId}`,
    reason: "usage_reservation",
    metadata: { metricKey: commercialMetricKey, quantity: commercialQuantity, feature: String(feature) },
  });
  const reservedVendorCredits = Number(reservation.debited ?? 0);

  // Image cost is per-image, not per-token
  const costPerImage = model === "dall-e-3" ? 0.04 : 0.02; // approximate
  const estimatedCost = costPerImage * n;

  const quota = await checkQuota(tenantId, estimatedCost, log);
  if (!quota.ok) {
    throw new AiGatewayError(quota.reason, quota.httpStatus, quota.details);
  }

  const key = await resolveAIKey(tenantId, "openai");
  const openai = new OpenAI({ apiKey: key.apiKey });

  let success = false;
  let errorMessage: string | undefined;
  let urls: string[] = [];

  try {
    // gpt-image-1 não aceita response_format. Quando esse modelo é usado, a
    // API retorna a imagem em base64 (b64_json). DALL-E continua podendo
    // retornar URL. Normalizamos ambos para uma lista de fontes consumíveis
    // pelos chamadores existentes.
    const imageRequest: Record<string, unknown> = {
      model,
      prompt,
      n,
      size: options.size ?? "1024x1024",
    };
    if (model.startsWith("dall-e")) {
      imageRequest.response_format = "url";
    }

    const response = await openai.images.generate(imageRequest as any);
    urls = (response.data ?? [])
      .map((d: any) => {
        if (typeof d?.url === "string" && d.url) return d.url;
        if (typeof d?.b64_json === "string" && d.b64_json) {
          return `data:image/png;base64,${d.b64_json}`;
        }
        return "";
      })
      .filter(Boolean);

    if (urls.length === 0) {
      throw new Error("Image provider returned no image data");
    }
    success = true;
  } catch (err: any) {
    errorMessage = err.message ?? "Image generation failed";
    log?.error({ tenantId, feature, model, error: errorMessage }, "ai-gateway: image generation failed");
  }

  const costUsd = costPerImage * n;
  await logUsage({
    tenantId,
    provider: "openai",
    model,
    feature,
    inputTokens: 0,
    outputTokens: 0,
    costEstimateUsd: costUsd,
    usedByok: key.usedByok,
    success,
    errorMessage,
    requestId: commercialRequestId,
  });

  await recordCommercialUsage({
    tenantId,
    commercialKey: options.commercialUsage?.commercialKey ?? null,
    metricKey: commercialMetricKey,
    quantity: commercialQuantity,
    success,
    billable: true,
    billingStatus: success ? "overage" : "non_billable",
    provider: "openai",
    model,
    inputTokens: 0,
    outputTokens: 0,
    totalCostUsd: costUsd,
    source: "ai_gateway_image",
    sourceEventId: `commercial:${commercialRequestId}`,
    requestId: commercialRequestId,
    metadata: { feature: String(feature), vendorCreditsReserved: reservedVendorCredits },
  });

  if (!success && reservedVendorCredits > 0) {
    await refundVendorCredits({
      tenantId,
      credits: reservedVendorCredits,
      commercialKey: options.commercialUsage?.commercialKey ?? null,
      referenceId: `usage-reservation:${commercialRequestId}`,
      metadata: { metricKey: commercialMetricKey, feature: String(feature), providerFailure: true },
    });
  }

  // Não consome a cota interna quando a geração falhou.
  // Falhas continuam registradas para auditoria técnica.
  if (success && !key.usedByok) {
    await incrementDailySpend(tenantId, costUsd);
  }

  if (!success) {
    throw new AiGatewayError(errorMessage ?? "Image generation failed", 502, { provider: "openai", model: model ?? "unknown" });
  }

  return { urls, costUsd, usedByok: key.usedByok };
}

// ── Helper: text embedding (pgvector) ───────────────────────────────────────────

export async function generateEmbedding(
  tenantId: string,
  text: string,
  options: { model?: string; log?: Logger } = {},
): Promise<{ embedding: number[]; costUsd: number; usedByok: boolean }> {
  const model = options.model ?? "text-embedding-3-small";
  const log = options.log;

  const estimatedInputTokens = Math.ceil(text.length / 4);
  const estimatedCost = estimateCost((model ?? "unknown"), estimatedInputTokens, 0);

  const quota = await checkQuota(tenantId, estimatedCost, log);
  if (!quota.ok) {
    throw new AiGatewayError(quota.reason, quota.httpStatus, quota.details);
  }

  const key = await resolveAIKey(tenantId, "openai");
  const openai = new OpenAI({ apiKey: key.apiKey });

  let embedding: number[] = [];
  let inputTokens = estimatedInputTokens;
  let success = false;
  let errorMessage: string | undefined;
  try {
    const response = await openai.embeddings.create({ model, input: text });
    embedding = response.data[0]?.embedding ?? [];
    inputTokens = response.usage?.prompt_tokens ?? estimatedInputTokens;
    success = true;
  } catch (err: any) {
    errorMessage = err.message ?? "Embedding generation failed";
    log?.error({ tenantId, model, error: errorMessage }, "ai-gateway: embedding failed");
  }

  const costUsd = estimateCost((model ?? "unknown"), inputTokens, 0);
  await logUsage({
    tenantId,
    provider: "openai",
    model,
    feature: "embedding",
    inputTokens,
    outputTokens: 0,
    costEstimateUsd: costUsd,
    usedByok: key.usedByok,
    success,
    errorMessage,
  });

  if (!key.usedByok) {
    await incrementDailySpend(tenantId, costUsd);
  }

  if (!success) {
    throw new AiGatewayError(errorMessage ?? "Embedding generation failed", 502, {
      provider: "openai",
      model,
    });
  }

  return { embedding, costUsd, usedByok: key.usedByok };
}

// ── Helper: audio transcription via Whisper ─────────────────────────────────────

export async function transcribeAudio(
  tenantId: string,
  feature: AiFeature,
  audioBuffer: Buffer,
  options: {
    mimeType?: string;
    language?: string;
    log?: Logger;
  } = {},
): Promise<{ text: string; costUsd: number; usedByok: boolean }> {
  const log = options.log;
  // Whisper: ~$0.006/minute. Rough estimate: 1MB ~ 1min
  const estimatedMinutes = audioBuffer.length / (1024 * 1024);
  const estimatedCost = estimatedMinutes * 0.006;

  const quota = await checkQuota(tenantId, estimatedCost, log);
  if (!quota.ok) {
    throw new AiGatewayError(quota.reason, quota.httpStatus, quota.details);
  }

  const key = await resolveAIKey(tenantId, "openai");
  const openai = new OpenAI({ apiKey: key.apiKey });

  let success = false;
  let errorMessage: string | undefined;
  let text = "";

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: new File([audioBuffer as any], "audio.ogg", { type: options.mimeType ?? "audio/ogg" }),
      model: "whisper-1",
      language: options.language ?? "pt",
      response_format: "text",
    });
    text = (typeof transcription === "string" ? transcription : (transcription as any).text ?? "").trim();
    success = true;
  } catch (err: any) {
    errorMessage = err.message ?? "Transcription failed";
    log?.error({ tenantId, feature, error: errorMessage }, "ai-gateway: transcription failed");
  }

  const costUsd = estimatedCost;
  await logUsage({
    tenantId,
    provider: "openai",
    model: "whisper-1",
    feature,
    inputTokens: 0,
    outputTokens: 0,
    costEstimateUsd: costUsd,
    usedByok: key.usedByok,
    success,
    errorMessage,
  });

  if (!key.usedByok) {
    await incrementDailySpend(tenantId, costUsd);
  }

  if (!success) {
    throw new AiGatewayError(errorMessage ?? "Transcription failed", 502, { provider: "openai", model: "whisper-1" });
  }

  return { text, costUsd, usedByok: key.usedByok };
}

export interface TranscriptionWord {
  word: string;
  start: number;
  end: number;
}

/**
 * Mesma infra de quota/BYOK/log de transcribeAudio, mas pede
 * verbose_json com timestamp por palavra — usado pra legendar vídeo
 * automaticamente (queima de legenda sincronizada com a fala via
 * ffmpeg), onde não basta o texto puro, precisa saber quando cada
 * palavra é falada.
 */
export async function transcribeAudioWithWordTimestamps(
  tenantId: string,
  feature: AiFeature,
  audioBuffer: Buffer,
  options: {
    mimeType?: string;
    language?: string;
    log?: Logger;
  } = {},
): Promise<{ text: string; words: TranscriptionWord[]; costUsd: number; usedByok: boolean }> {
  const log = options.log;
  const estimatedMinutes = audioBuffer.length / (1024 * 1024);
  const estimatedCost = estimatedMinutes * 0.006;

  const quota = await checkQuota(tenantId, estimatedCost, log);
  if (!quota.ok) {
    throw new AiGatewayError(quota.reason, quota.httpStatus, quota.details);
  }

  const key = await resolveAIKey(tenantId, "openai");
  const openai = new OpenAI({ apiKey: key.apiKey });

  let success = false;
  let errorMessage: string | undefined;
  let text = "";
  let words: TranscriptionWord[] = [];

  try {
    const transcription = await openai.audio.transcriptions.create({
      file: new File([audioBuffer as any], "audio.wav", { type: options.mimeType ?? "audio/wav" }),
      model: "whisper-1",
      language: options.language ?? "pt",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });
    const result = transcription as unknown as { text: string; words?: TranscriptionWord[] };
    text = (result.text ?? "").trim();
    words = Array.isArray(result.words) ? result.words : [];
    success = true;
  } catch (err: any) {
    errorMessage = err.message ?? "Transcription failed";
    log?.error({ tenantId, feature, error: errorMessage }, "ai-gateway: word-timestamp transcription failed");
  }

  const costUsd = estimatedCost;
  await logUsage({
    tenantId,
    provider: "openai",
    model: "whisper-1",
    feature,
    inputTokens: 0,
    outputTokens: 0,
    costEstimateUsd: costUsd,
    usedByok: key.usedByok,
    success,
    errorMessage,
  });

  if (!key.usedByok) {
    await incrementDailySpend(tenantId, costUsd);
  }

  if (!success) {
    throw new AiGatewayError(errorMessage ?? "Transcription failed", 502, { provider: "openai", model: "whisper-1" });
  }

  return { text, words, costUsd, usedByok: key.usedByok };
}



/**
 * Render/generate an architectural image with Google Vertex AI Gemini Image.
 *
 * Authentication follows GoogleAuth default resolution:
 * - GOOGLE_SERVICE_ACCOUNT_JSON (explicit secret), or
 * - Application Default Credentials / Workload Identity Federation.
 *
 * Returns the generated image as base64.
 */
function googleVertexServiceAccountCredentials(): Record<string, unknown> | undefined {
  const raw = process.env["GOOGLE_SERVICE_ACCOUNT_JSON"]?.trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON");
  }
}

async function googleVertexAccessToken(): Promise<string> {
  const credentials = googleVertexServiceAccountCredentials();
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    ...(credentials ? { credentials } : {}),
  });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token.token) throw new Error("Google Vertex access token unavailable");
  return token.token;
}

export async function callGoogleVertexImage(params: {
  prompt: string;
  referenceImageDataUrl?: string;
  model?: string;
  projectId?: string;
  location?: string;
  logger?: Logger;
  timeoutMs?: number;
}): Promise<string> {
  const model =
    params.model?.trim() ||
    process.env["GOOGLE_VERTEX_IMAGE_MODEL"]?.trim() ||
    "gemini-3.1-flash-image";

  const apiKey = process.env["GEMINI_API_KEY"]?.trim();
  if (apiKey) {
    const input: Array<Record<string, unknown>> = [];
    if (params.referenceImageDataUrl) {
      const match = params.referenceImageDataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
      if (!match) throw new Error("Gemini reference image must be a data URL base64");
      input.push({
        type: "image",
        mime_type: match[1],
        data: match[2],
      });
    }
    input.push({ type: "text", text: params.prompt });

    params.logger?.info(
      { provider: "google-gemini-api", model, hasReference: Boolean(params.referenceImageDataUrl) },
      "Gemini image: generating with API key",
    );

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
      method: "POST",
      headers: {
        "x-goog-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input,
        response_format: {
          type: "image",
          aspect_ratio: "16:9",
          image_size: "2K",
        },
      }),
      signal: AbortSignal.timeout(params.timeoutMs ?? 180_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(`Google Gemini Image HTTP ${response.status}: ${body}`);
    }

    const data = await response.json() as {
      output_image?: { data?: string; mime_type?: string };
      steps?: Array<{
        type?: string;
        content?: Array<{ type?: string; data?: string; mime_type?: string }>;
      }>;
    };

    const direct = data.output_image?.data;
    const nested = data.steps
      ?.flatMap((step) => step.content ?? [])
      .find((item) => item.type === "image" && typeof item.data === "string")?.data;
    const base64 = direct || nested;
    if (!base64) throw new Error("Google Gemini Image returned no image");

    params.logger?.info(
      { provider: "google-gemini-api", model },
      "Gemini image: generated",
    );
    return base64;
  }

  const projectId = params.projectId?.trim() || process.env["GOOGLE_CLOUD_PROJECT"]?.trim();
  if (!projectId) throw new Error("GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT is required");

  const location =
    params.location?.trim() ||
    process.env["GOOGLE_VERTEX_IMAGE_LOCATION"]?.trim() ||
    "global";

  const parts: Array<Record<string, unknown>> = [];
  if (params.referenceImageDataUrl) {
    const match = params.referenceImageDataUrl.match(/^data:([^;]+);base64,([\s\S]+)$/);
    if (!match) throw new Error("Vertex reference image must be a data URL base64");
    parts.push({
      inlineData: {
        mimeType: match[1],
        data: match[2],
      },
    });
  }
  parts.push({ text: params.prompt });

  const host = location === "global"
    ? "aiplatform.googleapis.com"
    : `${location}-aiplatform.googleapis.com`;
  const url =
    `https://${host}/v1/projects/${encodeURIComponent(projectId)}/locations/${encodeURIComponent(location)}/publishers/google/models/${encodeURIComponent(model)}:generateContent`;

  const token = await googleVertexAccessToken();
  params.logger?.info(
    { provider: "google-vertex", model, location, hasReference: Boolean(params.referenceImageDataUrl) },
    "Vertex image: generating",
  );

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        candidateCount: 1,
        responseModalities: ["TEXT", "IMAGE"],
      },
    }),
    signal: AbortSignal.timeout(params.timeoutMs ?? 180_000),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Google Vertex Image HTTP ${response.status}: ${body}`);
  }

  const data = await response.json() as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
        }>;
      };
      finishReason?: string;
    }>;
  };

  const imagePart = data.candidates?.[0]?.content?.parts?.find(
    (part) => typeof part.inlineData?.data === "string" && part.inlineData.data.length > 0,
  );
  const base64 = imagePart?.inlineData?.data;
  if (!base64) {
    const finishReason = data.candidates?.[0]?.finishReason ?? "unknown";
    throw new Error(`Google Vertex Image returned no image (finishReason=${finishReason})`);
  }

  params.logger?.info(
    { provider: "google-vertex", model, location, mimeType: imagePart?.inlineData?.mimeType },
    "Vertex image: generated",
  );
  return base64;
}

/**
 * Render an architectural image using Flux+ControlNet via Replicate.
 * Returns the rendered image as a base64 string (PNG).
 * Throws if REPLICATE_API_TOKEN is not set or all models fail.
 */
export async function callReplicateFlux(params: {
  controlImageDataUrl: string;
  prompt: string;
  guidance?: number;
  steps?: number;
  controlStrength?: number;
  logger?: Logger;
}): Promise<string> {
  const token = process.env["REPLICATE_API_TOKEN"];
  if (!token) throw new Error("REPLICATE_API_TOKEN not set");

  const { controlImageDataUrl, prompt, guidance = 30, steps = 50, controlStrength = 0.75, logger } = params;

  const MODELS = [
    "black-forest-labs/flux-canny-pro",
    "black-forest-labs/flux-depth-pro",
  ] as const;

  let lastError: Error | undefined;

  for (const model of MODELS) {
    try {
      logger?.info({ model }, "Replicate: creating prediction");

      const createRes = await fetch(
        `https://api.replicate.com/v1/models/${model}/predictions`,
        {
          method: "POST",
          headers: {
            Authorization: `Token ${token}`,
            "Content-Type": "application/json",
            Prefer: "wait=60",
          },
          body: JSON.stringify({
            input: {
              control_image: controlImageDataUrl,
              prompt,
              guidance,
              num_inference_steps: steps,
              control_strength: controlStrength,
              output_format: "png",
              output_quality: 100,
              safety_tolerance: 2,
            },
          }),
          signal: AbortSignal.timeout(100_000),
        },
      );

      if (!createRes.ok) {
        const body = await createRes.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(`Replicate HTTP ${createRes.status}: ${body["detail"] ?? JSON.stringify(body)}`);
      }

      let prediction = await createRes.json() as {
        id: string; status: string; output?: string | string[];
        error?: string; urls?: { get: string };
      };

      // Poll if Prefer:wait didn't finish in time
      let polls = 0;
      while (prediction.status === "starting" || prediction.status === "processing") {
        if (polls >= 30) throw new Error("Replicate: polling timeout (60s)");
        await new Promise<void>((r) => setTimeout(r, 2000));
        const pollRes = await fetch(
          `https://api.replicate.com/v1/predictions/${prediction.id}`,
          { headers: { Authorization: `Token ${token}` } },
        );
        prediction = await pollRes.json() as typeof prediction;
        polls++;
      }

      if (prediction.status !== "succeeded" || !prediction.output) {
        throw new Error(`Replicate prediction ${prediction.status}: ${prediction.error ?? "no output"}`);
      }

      const outputUrl = Array.isArray(prediction.output)
        ? prediction.output[0]
        : prediction.output;
      if (!outputUrl) throw new Error("Replicate: empty output URL");

      const imgRes = await fetch(outputUrl as string);
      if (!imgRes.ok) throw new Error(`Replicate: download failed (${imgRes.status})`);
      const imgBuf = Buffer.from(await imgRes.arrayBuffer());
      logger?.info({ model, polls }, "Replicate: prediction succeeded");
      return imgBuf.toString("base64");
    } catch (err: any) {
      lastError = err;
      logger?.warn({ err: err?.message, model }, "Replicate: model failed");
    }
  }

  throw lastError ?? new Error("All Replicate models failed");
}
