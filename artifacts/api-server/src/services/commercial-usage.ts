import { and, eq, gte, sql } from "drizzle-orm";
import {
  db,
  productUsageQuotasTable,
  tenantEntitlementsTable,
  usageLedgerTable,
  usageMetricsTable,
  vendorCreditTransactionsTable,
} from "@workspace/db";

export type RecordUsageInput = {
  tenantId: string;
  userId?: string | null;
  commercialKey?: string | null;
  metricKey: string;
  quantity?: number;
  success?: boolean;
  billable?: boolean;
  billingStatus?: "measured" | "included" | "overage" | "non_billable" | "reversed";
  provider?: string | null;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  externalApiCostUsd?: number;
  totalCostUsd?: number;
  exchangeRateBrl?: number | null;
  source: string;
  sourceEventId?: string | null;
  requestId?: string | null;
  metadata?: Record<string, unknown>;
};

export type UsageQuotaSnapshot = {
  metricKey: string;
  name: string;
  unitSingular: string;
  unitPlural: string;
  monthlyQuantity: number | null;
  usedQuantity: number;
  remainingQuantity: number | null;
  percentUsed: number | null;
  overageAllowed: boolean;
  vendorCreditsUsed: number;
};

function monthStart(now: Date) {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/**
 * Universal business-usage recorder.
 * Important: provider failures may still store real cost, but they never debit
 * Vendor Credits or customer quota when success=false.
 */
export async function recordCommercialUsage(input: RecordUsageInput) {
  const quantity = Math.max(0, Number(input.quantity ?? 1));
  const success = input.success ?? true;

  const [metric] = await db
    .select()
    .from(usageMetricsTable)
    .where(eq(usageMetricsTable.key, input.metricKey))
    .limit(1);

  if (!metric) throw new Error(`Unknown usage metric: ${input.metricKey}`);

  const chargeable = success || !metric.onlyChargeOnSuccess;
  const requestedBillable = input.billable ?? true;
  const billable = chargeable && requestedBillable;
  const vendorCredits = billable
    ? Math.max(0, Math.ceil(quantity * Number(metric.vendorCreditsPerUnit)))
    : 0;

  const totalCostUsd = Math.max(0, Number(input.totalCostUsd ?? 0));
  const exchangeRateBrl = input.exchangeRateBrl == null ? null : Math.max(0, Number(input.exchangeRateBrl));
  const totalCostBrl = exchangeRateBrl == null ? null : totalCostUsd * exchangeRateBrl;

  const [row] = await db
    .insert(usageLedgerTable)
    .values({
      tenantId: input.tenantId,
      userId: input.userId ?? null,
      commercialKey: input.commercialKey ?? null,
      metricKey: input.metricKey,
      quantity: String(quantity),
      vendorCredits,
      billingStatus: input.billingStatus ?? (billable ? "measured" : "non_billable"),
      billable,
      success,
      provider: input.provider ?? null,
      model: input.model ?? null,
      inputTokens: Math.max(0, input.inputTokens ?? 0),
      outputTokens: Math.max(0, input.outputTokens ?? 0),
      externalApiCostUsd: String(Math.max(0, input.externalApiCostUsd ?? 0)),
      totalCostUsd: String(totalCostUsd),
      exchangeRateBrl: exchangeRateBrl == null ? null : String(exchangeRateBrl),
      totalCostBrl: totalCostBrl == null ? null : String(totalCostBrl),
      source: input.source,
      sourceEventId: input.sourceEventId ?? null,
      requestId: input.requestId ?? null,
      metadata: input.metadata ?? {},
    })
    .onConflictDoNothing()
    .returning();

  return row ?? null;
}

/**
 * Dual-write cost from the legacy AI gateway without treating each LLM call as
 * a customer-visible creation. Business units (image/video/site/prospect/etc.)
 * are emitted separately when the useful final result is delivered.
 */
export async function recordAiGatewayCost(input: {
  tenantId: string;
  feature: string;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  success: boolean;
  requestId?: string | null;
  usedByok?: boolean;
}) {
  return recordCommercialUsage({
    tenantId: input.tenantId,
    commercialKey: null,
    metricKey: "ai_assist",
    quantity: 1,
    success: input.success,
    billable: false,
    billingStatus: "non_billable",
    provider: input.provider,
    model: input.model,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    totalCostUsd: input.costUsd,
    source: "ai_gateway",
    requestId: input.requestId ?? null,
    metadata: { feature: input.feature, usedByok: Boolean(input.usedByok), costOnly: true },
  });
}

export async function getTenantUsageSnapshot(
  tenantId: string,
  commercialKey: string,
  now = new Date(),
): Promise<UsageQuotaSnapshot[]> {
  const quotas = await db
    .select({
      metricKey: productUsageQuotasTable.metricKey,
      monthlyQuantity: productUsageQuotasTable.monthlyQuantity,
      overageAllowed: productUsageQuotasTable.overageAllowed,
      name: usageMetricsTable.name,
      unitSingular: usageMetricsTable.unitSingular,
      unitPlural: usageMetricsTable.unitPlural,
    })
    .from(productUsageQuotasTable)
    .innerJoin(usageMetricsTable, eq(productUsageQuotasTable.metricKey, usageMetricsTable.key))
    .where(and(
      eq(productUsageQuotasTable.commercialKey, commercialKey),
      eq(productUsageQuotasTable.active, true),
      eq(usageMetricsTable.active, true),
    ));

  const start = monthStart(now);
  return Promise.all(quotas.map(async (quota) => {
    const [usage] = await db
      .select({
        usedQuantity: sql<number>`coalesce(sum(${usageLedgerTable.quantity}), 0)`,
        vendorCreditsUsed: sql<number>`coalesce(sum(${usageLedgerTable.vendorCredits}), 0)`,
      })
      .from(usageLedgerTable)
      .where(and(
        eq(usageLedgerTable.tenantId, tenantId),
        eq(usageLedgerTable.metricKey, quota.metricKey),
        eq(usageLedgerTable.success, true),
        gte(usageLedgerTable.createdAt, start),
      ));

    const usedQuantity = Number(usage?.usedQuantity ?? 0);
    const monthlyQuantity = quota.monthlyQuantity == null ? null : Number(quota.monthlyQuantity);
    const remainingQuantity = monthlyQuantity == null ? null : Math.max(0, monthlyQuantity - usedQuantity);
    const percentUsed = monthlyQuantity == null || monthlyQuantity <= 0
      ? null
      : Math.min(100, (usedQuantity / monthlyQuantity) * 100);

    return {
      metricKey: quota.metricKey,
      name: quota.name,
      unitSingular: quota.unitSingular,
      unitPlural: quota.unitPlural,
      monthlyQuantity,
      usedQuantity,
      remainingQuantity,
      percentUsed,
      overageAllowed: quota.overageAllowed,
      vendorCreditsUsed: Number(usage?.vendorCreditsUsed ?? 0),
    };
  }));
}

export async function getVendorCreditBalance(tenantId: string) {
  const [row] = await db
    .select({ balance: sql<number>`coalesce(sum(${vendorCreditTransactionsTable.creditsDelta}), 0)` })
    .from(vendorCreditTransactionsTable)
    .where(eq(vendorCreditTransactionsTable.tenantId, tenantId));
  return Number(row?.balance ?? 0);
}

export async function getActiveEntitlements(tenantId: string, now = new Date()) {
  return db
    .select()
    .from(tenantEntitlementsTable)
    .where(and(
      eq(tenantEntitlementsTable.tenantId, tenantId),
      eq(tenantEntitlementsTable.active, true),
      sql`${tenantEntitlementsTable.startsAt} <= ${now}`,
      sql`(${tenantEntitlementsTable.endsAt} is null or ${tenantEntitlementsTable.endsAt} > ${now})`,
    ));
}
