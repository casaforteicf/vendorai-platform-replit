import { and, eq, gt, gte, isNull, or, sql } from "drizzle-orm";
import {
  consumptionPackDefinitionsTable,
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
  extraPurchasedQuantity: number;
  usedQuantity: number;
  monthlyRemainingQuantity: number | null;
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

/**
 * Grants a resource-specific pack after a confirmed payment/promotion.
 * It does not create a runtime entitlement: it increases the metric allowance.
 * referenceId should be the provider/payment id so retries stay idempotent.
 */
export async function grantConsumptionPack(input: {
  tenantId: string;
  commercialKey: string;
  referenceId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
  allowInactive?: boolean;
}) {
  const [pack] = await db
    .select()
    .from(consumptionPackDefinitionsTable)
    .where(and(
      eq(consumptionPackDefinitionsTable.commercialKey, input.commercialKey),
      input.allowInactive ? sql`true` : eq(consumptionPackDefinitionsTable.active, true),
    ))
    .limit(1);

  if (!pack) throw new Error("CONSUMPTION_PACK_NOT_AVAILABLE");

  const expiresAt = pack.expiresAfterDays == null
    ? null
    : new Date(Date.now() + pack.expiresAfterDays * 86_400_000);

  const [row] = await db
    .insert(vendorCreditTransactionsTable)
    .values({
      tenantId: input.tenantId,
      creditsDelta: pack.vendorCredits,
      metricKey: pack.metricKey,
      quantityDelta: String(pack.quantity),
      reason: input.reason ?? "consumption_pack_grant",
      commercialKey: pack.commercialKey,
      referenceId: input.referenceId,
      expiresAt,
      metadata: {
        ...(input.metadata ?? {}),
        packQuantity: Number(pack.quantity),
        packMetricKey: pack.metricKey,
      },
    })
    .onConflictDoNothing()
    .returning();

  return row ?? null;
}

export async function getMetricTopupBalance(tenantId: string, metricKey: string, now = new Date()) {
  const [row] = await db
    .select({
      quantity: sql<number>`coalesce(sum(${vendorCreditTransactionsTable.quantityDelta}), 0)`,
      credits: sql<number>`coalesce(sum(${vendorCreditTransactionsTable.creditsDelta}), 0)`,
    })
    .from(vendorCreditTransactionsTable)
    .where(and(
      eq(vendorCreditTransactionsTable.tenantId, tenantId),
      eq(vendorCreditTransactionsTable.metricKey, metricKey),
      or(
        isNull(vendorCreditTransactionsTable.expiresAt),
        gt(vendorCreditTransactionsTable.expiresAt, now),
      ),
    ));

  return {
    quantity: Number(row?.quantity ?? 0),
    credits: Number(row?.credits ?? 0),
  };
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
    const [[usage], topup] = await Promise.all([
      db
        .select({
          usedQuantity: sql<number>`coalesce(sum(${usageLedgerTable.quantity}), 0)`,
          vendorCreditsUsed: sql<number>`coalesce(sum(${usageLedgerTable.vendorCredits}), 0)`,
        })
        .from(usageLedgerTable)
        .where(and(
          eq(usageLedgerTable.tenantId, tenantId),
          eq(usageLedgerTable.metricKey, quota.metricKey),
          eq(usageLedgerTable.success, true),
          eq(usageLedgerTable.billable, true),
          gte(usageLedgerTable.createdAt, start),
        )),
      getMetricTopupBalance(tenantId, quota.metricKey, now),
    ]);

    const usedQuantity = Number(usage?.usedQuantity ?? 0);
    const monthlyQuantity = quota.monthlyQuantity == null ? null : Number(quota.monthlyQuantity);
    const extraPurchasedQuantity = Math.max(0, topup.quantity);
    const monthlyRemainingQuantity = monthlyQuantity == null ? null : Math.max(0, monthlyQuantity - usedQuantity);
    const remainingQuantity = monthlyQuantity == null
      ? null
      : Math.max(0, monthlyQuantity + extraPurchasedQuantity - usedQuantity);
    const percentUsed = monthlyQuantity == null || monthlyQuantity <= 0
      ? null
      : Math.min(100, (usedQuantity / monthlyQuantity) * 100);

    return {
      metricKey: quota.metricKey,
      name: quota.name,
      unitSingular: quota.unitSingular,
      unitPlural: quota.unitPlural,
      monthlyQuantity,
      extraPurchasedQuantity,
      usedQuantity,
      monthlyRemainingQuantity,
      remainingQuantity,
      percentUsed,
      overageAllowed: quota.overageAllowed,
      vendorCreditsUsed: Number(usage?.vendorCreditsUsed ?? 0),
    };
  }));
}

export async function getMonthlyVendorCreditUsage(tenantId: string, now = new Date()) {
  const start = monthStart(now);
  const [row] = await db
    .select({
      used: sql<number>`coalesce(sum(${usageLedgerTable.vendorCredits}), 0)`,
    })
    .from(usageLedgerTable)
    .where(and(
      eq(usageLedgerTable.tenantId, tenantId),
      eq(usageLedgerTable.success, true),
      eq(usageLedgerTable.billable, true),
      gte(usageLedgerTable.createdAt, start),
    ));

  return Number(row?.used ?? 0);
}

export async function getVendorCreditBalance(tenantId: string, now = new Date()) {
  const [row] = await db
    .select({ balance: sql<number>`coalesce(sum(${vendorCreditTransactionsTable.creditsDelta}), 0)` })
    .from(vendorCreditTransactionsTable)
    .where(and(
      eq(vendorCreditTransactionsTable.tenantId, tenantId),
      isNull(vendorCreditTransactionsTable.metricKey),
      or(
        isNull(vendorCreditTransactionsTable.expiresAt),
        gt(vendorCreditTransactionsTable.expiresAt, now),
      ),
    ));
  return Number(row?.balance ?? 0);
}

export type VendorCreditAuthorization = {
  ok: boolean;
  required: number;
  available: number;
  mode: "measure_only" | "enforce";
  reason?: "INSUFFICIENT_VENDOR_CREDITS";
};

export function getVendorCreditEnforcementMode(): "measure_only" | "enforce" {
  return process.env["VENDOR_CREDITS_ENFORCEMENT"] === "enforce" ? "enforce" : "measure_only";
}

export async function authorizeVendorCredits(
  tenantId: string,
  metricKey: string,
  quantity = 1,
): Promise<VendorCreditAuthorization> {
  const [metric] = await db
    .select({ vendorCreditsPerUnit: usageMetricsTable.vendorCreditsPerUnit })
    .from(usageMetricsTable)
    .where(and(eq(usageMetricsTable.key, metricKey), eq(usageMetricsTable.active, true)))
    .limit(1);

  if (!metric) throw new Error(`Unknown usage metric: ${metricKey}`);

  const required = Math.max(0, Math.ceil(Math.max(0, quantity) * Number(metric.vendorCreditsPerUnit)));
  const available = await getVendorCreditBalance(tenantId);
  const mode = getVendorCreditEnforcementMode();

  if (mode === "enforce" && required > available) {
    return { ok: false, required, available, mode, reason: "INSUFFICIENT_VENDOR_CREDITS" };
  }
  return { ok: true, required, available, mode };
}

/**
 * Append-only debit with tenant-scoped advisory locking.
 * In measure_only mode this returns the projected debit without mutating wallet.
 */
export async function debitVendorCredits(input: {
  tenantId: string;
  credits: number;
  commercialKey?: string | null;
  referenceId: string;
  reason?: string;
  metadata?: Record<string, unknown>;
}) {
  const credits = Math.max(0, Math.ceil(input.credits));
  if (credits === 0) return { debited: 0, balance: await getVendorCreditBalance(input.tenantId), mode: getVendorCreditEnforcementMode() };

  const mode = getVendorCreditEnforcementMode();
  if (mode !== "enforce") {
    return { debited: 0, projectedDebit: credits, balance: await getVendorCreditBalance(input.tenantId), mode };
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.tenantId}))`);

    const [balanceRow] = await tx
      .select({ balance: sql<number>`coalesce(sum(${vendorCreditTransactionsTable.creditsDelta}), 0)` })
      .from(vendorCreditTransactionsTable)
      .where(and(
        eq(vendorCreditTransactionsTable.tenantId, input.tenantId),
        isNull(vendorCreditTransactionsTable.metricKey),
        or(
          isNull(vendorCreditTransactionsTable.expiresAt),
          gt(vendorCreditTransactionsTable.expiresAt, new Date()),
        ),
      ));

    const balance = Number(balanceRow?.balance ?? 0);
    if (balance < credits) {
      const error = new Error("INSUFFICIENT_VENDOR_CREDITS");
      (error as Error & { required?: number; available?: number }).required = credits;
      (error as Error & { required?: number; available?: number }).available = balance;
      throw error;
    }

    const [row] = await tx
      .insert(vendorCreditTransactionsTable)
      .values({
        tenantId: input.tenantId,
        creditsDelta: -credits,
        metricKey: null,
        quantityDelta: null,
        reason: input.reason ?? "usage_debit",
        commercialKey: input.commercialKey ?? null,
        referenceId: input.referenceId,
        metadata: input.metadata ?? {},
      })
      .onConflictDoNothing()
      .returning();

    const finalBalance = row ? balance - credits : balance;
    return { debited: row ? credits : 0, balance: finalBalance, mode };
  });
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
