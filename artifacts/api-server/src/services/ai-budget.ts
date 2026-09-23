import { and, eq, gte, sql } from "drizzle-orm";
import { aiUsageLogsTable, db, plansTable, tenantsTable } from "@workspace/db";
import {
  VENDOR_TOKENS_PER_BRL,
  VENDOR_TOKEN_PACK_PRICE_BRL,
  VENDOR_TOKEN_PACK_TOKENS,
} from "./vendor-tokens.js";

// Legacy export kept for API compatibility. Customer-facing balances use Vendor Tokens.
export const AI_CREDITS_PER_USD = VENDOR_TOKENS_PER_BRL * 5;
export const AI_CREDIT_PACK_PRICE_BRL = VENDOR_TOKEN_PACK_PRICE_BRL;
export const AI_CREDIT_PACK_CREDITS = VENDOR_TOKEN_PACK_TOKENS;
// Internal estimate only; tenant UI must not expose provider currency.
export const AI_CREDIT_PACK_USD = AI_CREDIT_PACK_PRICE_BRL / 5;
export const AI_BUDGET_ALERT_THRESHOLDS = [50, 75, 90, 100] as const;

export type AiBudgetSnapshot = {
  tenantId: string;
  planName: string | null;
  baseBudgetUsd: number;
  extraBalanceUsd: number;
  spentThisMonthUsd: number;
  remainingUsd: number;
  totalCycleBudgetUsd: number;
  percentUsed: number;
  alertPercent: 0 | 50 | 75 | 90 | 100;
  blocked: boolean;
  creditsPerUsd: number;
  baseCredits: number;
  extraCreditsRemaining: number;
  usedCredits: number;
  remainingCredits: number;
  totalCycleCredits: number;
  pack: {
    priceBrl: number;
    credits: number;
    budgetUsd: number;
  };
};

function monthStart(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

function alertFor(percent: number): 0 | 50 | 75 | 90 | 100 {
  if (percent >= 100) return 100;
  if (percent >= 90) return 90;
  if (percent >= 75) return 75;
  if (percent >= 50) return 50;
  return 0;
}

export async function getTenantAiBudget(tenantId: string, now = new Date()): Promise<AiBudgetSnapshot | null> {
  const [tenant] = await db
    .select({
      id: tenantsTable.id,
      planId: tenantsTable.planId,
      aiCreditsUsd: tenantsTable.aiCreditsUsd,
    })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId))
    .limit(1);

  if (!tenant) return null;

  let planName: string | null = null;
  let baseBudgetUsd = 0;
  if (tenant.planId) {
    const [plan] = await db
      .select({ name: plansTable.name, aiQuotaUsd: plansTable.aiQuotaUsd })
      .from(plansTable)
      .where(eq(plansTable.id, tenant.planId))
      .limit(1);
    planName = plan?.name ?? null;
    baseBudgetUsd = Math.max(0, Number(plan?.aiQuotaUsd ?? 0));
  }

  // Para cobrança/limite contam apenas chamadas concluídas usando a chave compartilhada.
  // Falhas de provider e BYOK continuam auditadas em ai_usage_logs, mas não consomem a franquia do tenant.
  const [usage] = await db
    .select({ total: sql<number>`coalesce(sum(${aiUsageLogsTable.costEstimateUsd}), 0)` })
    .from(aiUsageLogsTable)
    .where(and(
      eq(aiUsageLogsTable.tenantId, tenantId),
      eq(aiUsageLogsTable.success, true),
      eq(aiUsageLogsTable.usedByok, false),
      gte(aiUsageLogsTable.createdAt, monthStart(now)),
    ));

  const spentThisMonthUsd = Math.max(0, Number(usage?.total ?? 0));
  const extraBalanceUsd = Math.max(0, Number(tenant.aiCreditsUsd ?? 0));

  // Quando créditos extras são consumidos, ai_credits_usd representa o saldo restante.
  // O que já foi consumido neste ciclo é reconstruído pelo gasto que ultrapassou a franquia base,
  // mantendo o denominador do percentual estável durante o ciclo.
  const extraConsumedThisMonthUsd = Math.max(0, spentThisMonthUsd - baseBudgetUsd);
  const totalCycleBudgetUsd = baseBudgetUsd + extraBalanceUsd + extraConsumedThisMonthUsd;
  const remainingUsd = Math.max(0, baseBudgetUsd - spentThisMonthUsd) + extraBalanceUsd;
  const percentUsed = totalCycleBudgetUsd > 0
    ? Math.max(0, Math.min(100, (spentThisMonthUsd / totalCycleBudgetUsd) * 100))
    : 0;

  const usdRate = Math.max(0.000001, Number(process.env["USD_BRL_RATE"] ?? 5));
  const creditsPerUsd = Math.round(VENDOR_TOKENS_PER_BRL * usdRate);
  const toCredits = (usd: number) => Math.max(0, Math.round(usd * creditsPerUsd));

  return {
    tenantId,
    planName,
    baseBudgetUsd,
    extraBalanceUsd,
    spentThisMonthUsd,
    remainingUsd,
    totalCycleBudgetUsd,
    percentUsed,
    alertPercent: alertFor(percentUsed),
    blocked: remainingUsd <= 0,
    creditsPerUsd,
    baseCredits: toCredits(baseBudgetUsd),
    extraCreditsRemaining: toCredits(extraBalanceUsd),
    usedCredits: toCredits(spentThisMonthUsd),
    remainingCredits: toCredits(remainingUsd),
    totalCycleCredits: toCredits(totalCycleBudgetUsd),
    pack: {
      priceBrl: AI_CREDIT_PACK_PRICE_BRL,
      credits: AI_CREDIT_PACK_CREDITS,
      budgetUsd: AI_CREDIT_PACK_USD,
    },
  };
}
