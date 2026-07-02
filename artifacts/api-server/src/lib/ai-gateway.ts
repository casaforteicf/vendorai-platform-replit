/**
 * AI Gateway — Centralized AI call layer with BYOK, cost governance, and logging.
 *
 * Every AI call in the system must go through this module. No direct SDK calls.
 */
import { eq, sql, gte, and } from "drizzle-orm";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import type { Logger } from "pino";
import {
  db,
  tenantsTable,
  plansTable,
  aiUsageLogsTable,
} from "@workspace/db";
import type { AiFeature } from "@workspace/db";
import { sendAiFailureAlert } from "./email.js";

// ── Cost models (USD per 1M tokens) ───────────────────────────────────────────
const COST_PER_1M: Record<string, { input: number; output: number }> = {
  "gpt-4o-mini":        { input: 0.15,  output: 0.60 },
  "gpt-4o":             { input: 2.50,  output: 10.00 },
  "gpt-4.1":            { input: 2.00,  output: 8.00 },
  "gpt-4.1-mini":       { input: 0.40,  output: 1.60 },
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

// ── Quota / Credit / Daily ceiling check ──────────────────────────────────────

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
  details: {
    quotaUsd: number | null;
    creditsUsd: number;
    spentThisMonthUsd: number;
    dailySpendUsd: number;
  };
}

export type QuotaResult = QuotaCheck | QuotaBlocked;

const DAILY_SPEND_CEILING_USD = Number(process.env["AI_DAILY_SPEND_CEILING_USD"] ?? 100);

export async function checkQuota(
  tenantId: string,
  estimatedCost: number,
  log?: Logger,
): Promise<QuotaResult> {
  // 1. Load tenant + plan
  const [tenant] = await db
    .select({
      planId: tenantsTable.planId,
      aiCreditsUsd: tenantsTable.aiCreditsUsd,
      aiDailySpendUsd: tenantsTable.aiDailySpendUsd,
      aiDailySpendResetAt: tenantsTable.aiDailySpendResetAt,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId as string))
    .limit(1);

  if (!tenant) {
    return { ok: false, reason: "Tenant not found", httpStatus: 429, details: { quotaUsd: null, creditsUsd: 0, spentThisMonthUsd: 0, dailySpendUsd: 0 } };
  }

  // 2. Daily ceiling reset
  const now = new Date();
  let dailySpend = Number(tenant.aiDailySpendUsd ?? 0);
  const resetAt = tenant.aiDailySpendResetAt ? new Date(tenant.aiDailySpendResetAt) : null;
  const msSinceReset = resetAt ? now.getTime() - resetAt.getTime() : Infinity;
  const needsDailyReset = msSinceReset >= 24 * 60 * 60 * 1000;
  if (needsDailyReset) {
    dailySpend = 0;
  }

  // 3. Check daily ceiling
  if (dailySpend + estimatedCost > DAILY_SPEND_CEILING_USD) {
    return {
      ok: false,
      reason: `Daily AI spend ceiling reached ($${DAILY_SPEND_CEILING_USD.toFixed(2)}). Contact support to increase.`,
      httpStatus: 429,
      details: {
        quotaUsd: null,
        creditsUsd: Number(tenant.aiCreditsUsd ?? 0),
        spentThisMonthUsd: 0,
        dailySpendUsd: dailySpend,
      },
    };
  }

  // 4. If BYOK, skip quota/credit check — cost is on tenant
  // (We don't know this yet — checkQuota is called before resolveAIKey to avoid
  //  decrypting keys if we're just going to block anyway. But we need to know
  //  if BYOK is configured... Actually, let's keep the check simple: checkQuota
  //  is called with the estimated cost. If BYOK, the cost won't count against
  //  quota/credits. But we can't know BYOK without decrypting. So we need to
  //  check BYOK first, then skip quota if BYOK.)
  //
  //  Refactored: the caller will check BYOK first, then decide whether to call
  //  checkQuota. Or we can check BYOK inside here. Let's do it inside for convenience.
  const byokOpenAI = await db
    .select({ status: tenantsTable.openaiKeyStatus })
    .from(tenantsTable)
    .where(and(eq(tenantsTable.id, tenantId as string), eq(tenantsTable.openaiKeyStatus, "ativo")))
    .limit(1);
  const byokAnthropic = await db
    .select({ status: tenantsTable.anthropicKeyStatus })
    .from(tenantsTable)
    .where(and(eq(tenantsTable.id, tenantId as string), eq(tenantsTable.anthropicKeyStatus, "ativo")))
    .limit(1);
  const hasByok = byokOpenAI.length > 0 || byokAnthropic.length > 0;

  if (hasByok) {
    return {
      ok: true,
      usedByok: true,
      quotaUsd: null,
      creditsUsd: Number(tenant.aiCreditsUsd ?? 0),
      spentThisMonthUsd: 0,
      remainingUsd: Infinity,
    };
  }

  // 5. Get plan quota
  let quotaUsd: number | null = null;
  if (tenant.planId) {
    const [plan] = await db
      .select({ aiQuotaUsd: plansTable.aiQuotaUsd })
      .from(plansTable)
      .where(eq(plansTable.id, tenant.planId))
      .limit(1);
    if (plan?.aiQuotaUsd) {
      quotaUsd = Number(plan.aiQuotaUsd);
    }
  }

  const creditsUsd = Number(tenant.aiCreditsUsd ?? 0);

  // 5b. Platform-subsidized mode: tenant has no plan and no credits but the
  //     platform OPENAI_API_KEY is available. Allow the call through so the
  //     system works out of the box for tenants that haven't been assigned a
  //     plan yet. The daily ceiling check (step 3) still protects the platform.
  if (quotaUsd === null && creditsUsd === 0) {
    const hasPlatformKey = Boolean(process.env["OPENAI_API_KEY"] || process.env["ANTHROPIC_API_KEY"]);
    if (hasPlatformKey) {
      log?.debug({ tenantId }, "ai-gateway: platform-subsidized mode (no plan/credits)");
      const startOfMonthPs = new Date(now.getFullYear(), now.getMonth(), 1);
      const [monthlyRowPs] = await db
        .select({ total: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)` })
        .from(aiUsageLogsTable)
        .where(
          and(
            eq(aiUsageLogsTable.tenantId, tenantId as string),
            gte(aiUsageLogsTable.createdAt, startOfMonthPs),
          ),
        );
      return {
        ok: true,
        usedByok: false,
        quotaUsd: null,
        creditsUsd: 0,
        spentThisMonthUsd: Number(monthlyRowPs?.total ?? 0),
        remainingUsd: Infinity,
      };
    }
  }

  // 6. Compute monthly spend from ai_usage_logs (this month)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [monthlyRow] = await db
    .select({ total: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)` })
    .from(aiUsageLogsTable)
    .where(
      and(
        eq(aiUsageLogsTable.tenantId, tenantId as string),
        gte(aiUsageLogsTable.createdAt, startOfMonth),
      ),
    );
  const spentThisMonthUsd = Number(monthlyRow?.total ?? 0);
  const remainingUsd = (quotaUsd ?? 0) + creditsUsd - spentThisMonthUsd;

  // 7. 80% alert
  if (quotaUsd && spentThisMonthUsd >= quotaUsd * 0.8 && spentThisMonthUsd < quotaUsd) {
    log?.info({ tenantId, quotaUsd, spentThisMonthUsd }, "ai-gateway: tenant approaching quota limit (80%)");
  }

  // 8. Block if exceeded
  if (remainingUsd < estimatedCost) {
    const reason = creditsUsd > 0
      ? `AI quota exhausted ($${quotaUsd?.toFixed(2) ?? "0"} plan + $${creditsUsd.toFixed(2)} credits). Purchase more credits.`
      : `AI quota exhausted ($${quotaUsd?.toFixed(2) ?? "0"} plan). Purchase credits or configure BYOK.`;
    return {
      ok: false,
      reason,
      httpStatus: 402,
      details: { quotaUsd, creditsUsd, spentThisMonthUsd, dailySpendUsd: dailySpend },
    };
  }

  return {
    ok: true,
    usedByok: false,
    quotaUsd,
    creditsUsd,
    spentThisMonthUsd,
    remainingUsd,
  };
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
  await db.insert(aiUsageLogsTable).values({
    tenantId: params.tenantId,
    provider: params.provider,
    model: params.model,
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

// ── Daily spend updater ───────────────────────────────────────────────────────

export async function incrementDailySpend(
  tenantId: string,
  amountUsd: number,
): Promise<void> {
  const now = new Date();
  const [tenant] = await db
    .select({ aiDailySpendUsd: tenantsTable.aiDailySpendUsd, aiDailySpendResetAt: tenantsTable.aiDailySpendResetAt })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId as string))
    .limit(1);

  const resetAt = tenant?.aiDailySpendResetAt ? new Date(tenant.aiDailySpendResetAt) : null;
  const msSinceReset = resetAt ? now.getTime() - resetAt.getTime() : Infinity;
  const needsReset = msSinceReset >= 24 * 60 * 60 * 1000;

  await db
    .update(tenantsTable)
    .set({
      aiDailySpendUsd: String(needsReset ? amountUsd : Number(tenant?.aiDailySpendUsd ?? 0) + amountUsd),
      aiDailySpendResetAt: needsReset ? now : (tenant?.aiDailySpendResetAt ?? now),
      updatedAt: now,
    })
    .where(eq(tenantsTable.id, tenantId as string));
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
  } = {},
): Promise<{ content: string; inputTokens: number; outputTokens: number; costUsd: number; usedByok: boolean }> {
  const model = options.model ?? "gpt-4o-mini";
  const log = options.log;

  // 1. Estimate cost (rough pre-check based on message length)
  const estimatedInputTokens = messages.reduce((acc, m) => acc + (typeof m.content === "string" ? m.content.length : 0), 0) / 4;
  const estimatedCost = estimateCost(model, Math.ceil(estimatedInputTokens), options.maxTokens ?? 600);

  // 2. Check quota
  const quota = await checkQuota(tenantId, estimatedCost, log);
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
    completion = await openai.chat.completions.create({
      model,
      messages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 600,
      ...(options.responseFormat ? { response_format: options.responseFormat } : {}),
    } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
    success = true;
  } catch (err: any) {
    errorMessage = err.message ?? "OpenAI call failed";
    log?.error({ tenantId, feature, model, error: errorMessage }, "ai-gateway: OpenAI call failed");
    // Log the failed attempt
    const inputTokensEst = Math.ceil(estimatedInputTokens);
    const costUsdEst = estimateCost(model, inputTokensEst, 0);
    await logUsage({ tenantId, provider: "openai", model, feature, inputTokens: inputTokensEst, outputTokens: 0, costEstimateUsd: costUsdEst, usedByok: key.usedByok, success: false, errorMessage });
    if (quota.ok && !quota.usedByok) await incrementDailySpend(tenantId, costUsdEst);

    // Fire-and-forget alert (non-blocking, throttled to 1/15min per error type)
    void sendAiFailureAlert({
      provider: "openai",
      errorType: err?.status === 429 ? "429_quota" : "502_error",
      feature: String(feature),
      tenantId: String(tenantId),
      model,
      message: errorMessage,
    });

    // 429 quota exceeded → attempt Anthropic fallback if key available
    if (err?.status === 429 && process.env["ANTHROPIC_API_KEY"]) {
      log?.info({ tenantId, feature }, "ai-gateway: OpenAI 429 → falling back to Anthropic");
      const systemMsgRaw = messages.find((m) => m.role === "system");
      const chatMsgs = messages
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
        });
      } catch (anthropicErr: any) {
        log?.error({ tenantId, feature, error: anthropicErr?.message }, "ai-gateway: Anthropic fallback also failed");
      }
    }

    const friendlyMessage = err?.status === 429
      ? "Limite de uso da IA atingido. Tente novamente em alguns minutos ou configure uma chave própria nas Configurações."
      : (errorMessage ?? "OpenAI call failed");
    throw new AiGatewayError(friendlyMessage, err?.status === 429 ? 429 : 502, { provider: "openai", model });
  }

  // 5. Extract tokens
  const inputTokens = completion.usage?.prompt_tokens ?? Math.ceil(estimatedInputTokens);
  const outputTokens = completion.usage?.completion_tokens ?? 0;
  const costUsd = estimateCost(model, inputTokens, outputTokens);

  // 6. Log usage
  await logUsage({ tenantId, provider: "openai", model, feature, inputTokens, outputTokens, costEstimateUsd: costUsd, usedByok: key.usedByok, success: true });

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
  } = {},
): Promise<{ content: string; inputTokens: number; outputTokens: number; costUsd: number; usedByok: boolean }> {
  const model = options.model ?? "claude-sonnet-4-6";
  const log = options.log;

  // 1. Estimate cost
  const estimatedInputTokens = messages.reduce((acc, m) => acc + m.content.length, 0) / 4;
  const estimatedCost = estimateCost(model, Math.ceil(estimatedInputTokens), options.maxTokens ?? 32000);

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
      ...(options.system ? { system: options.system } : {}),
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
      const costUsdPartial = estimateCost(model, Math.ceil(inputTokens), 0);
      await logUsage({ tenantId, provider: "anthropic", model, feature, inputTokens: Math.ceil(inputTokens), outputTokens: 0, costEstimateUsd: costUsdPartial, usedByok: key.usedByok, success: false, errorMessage });
      void sendAiFailureAlert({
        provider: "anthropic",
        errorType: "400_billing",
        feature: String(feature),
        tenantId: String(tenantId),
        model,
        message: errorMessage,
      });
      throw new AiGatewayError(
        "Saldo da IA esgotado. Configure uma chave própria da Anthropic ou da OpenAI nas Configurações → Integrações.",
        402,
        { provider: "anthropic", model },
      );
    }

    // Alert for non-billing Anthropic failures
    void sendAiFailureAlert({
      provider: "anthropic",
      errorType: "502_error",
      feature: String(feature),
      tenantId: String(tenantId),
      model,
      message: errorMessage,
    });
  }

  // 5. Compute cost
  const costUsd = estimateCost(model, inputTokens, outputTokens);

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
  } = {},
): Promise<{ urls: string[]; costUsd: number; usedByok: boolean }> {
  const model = options.model ?? "gpt-image-1";
  const log = options.log;
  const n = Math.min(Math.max(options.n ?? 1, 1), 10);

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
    const response = await openai.images.generate({
      model,
      prompt,
      n,
      size: options.size ?? "1024x1024",
      response_format: "url",
    });
    urls = (response.data ?? []).map((d) => d.url ?? "").filter(Boolean);
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
  });

  if (!key.usedByok) {
    await incrementDailySpend(tenantId, costUsd);
  }

  if (!success) {
    throw new AiGatewayError(errorMessage ?? "Image generation failed", 502, { provider: "openai", model });
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
  const estimatedCost = estimateCost(model, estimatedInputTokens, 0);

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

  const costUsd = estimateCost(model, inputTokens, 0);
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

// ── Replicate — Flux+ControlNet ───────────────────────────────────────────────

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
        prediction = await pollRes.json();
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
