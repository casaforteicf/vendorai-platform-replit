import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

export type VendorMetricKey =
  | "crm_ai_assist"
  | "content_generation"
  | "image_generation"
  | "video_generation"
  | "arch_render"
  | "prospect_enrichment"
  | "ai_agent_interaction"
  | "proposal_generation"
  | "intelligence_analysis"
  | "autopilot_article"
  | "site_generation"
  | "landing_page_generation"
  | "ads_campaign_generation"
  | "audio_transcription_minute"
  | "document_processing"
  | "knowledge_page"
  | "media_interpretation"
  | "software_operation";

export type RecordVendorUsageInput = {
  tenantId: string;
  userId?: string | null;
  offerCode?: string | null;
  productCode?: string | null;
  metricKey: VendorMetricKey;
  featureKey?: string | null;
  sourceSystem?: string | null;
  sourceRecordId?: string | null;
  requestId?: string | null;
  quantity?: number;
  provider?: string | null;
  model?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  providerCostUsd?: number;
  externalApiCostUsd?: number;
  infrastructureCostUsd?: number;
  fxUsdBrl?: number | null;
  success?: boolean;
  customerBillable?: boolean;
  chargedToQuota?: boolean;
  failureReason?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Universal commercial usage writer.
 *
 * Invariants:
 * - Vendor Credits come from vendor_usage_metrics, never from provider token counts.
 * - Failed operations are audited but do not consume customer quota by default.
 * - Provider/external/infrastructure costs remain separate and are also summed.
 * - sourceSystem + sourceRecordId make writes idempotent for asynchronous jobs.
 */
export async function recordVendorUsage(input: RecordVendorUsageInput): Promise<void> {
  const quantity = Math.max(0, Number(input.quantity ?? 1));
  const success = input.success ?? true;
  const customerBillable = input.customerBillable ?? success;
  const chargedToQuota = input.chargedToQuota ?? success;
  const providerCostUsd = Math.max(0, Number(input.providerCostUsd ?? 0));
  const externalApiCostUsd = Math.max(0, Number(input.externalApiCostUsd ?? 0));
  const infrastructureCostUsd = Math.max(0, Number(input.infrastructureCostUsd ?? 0));
  const totalCostUsd = providerCostUsd + externalApiCostUsd + infrastructureCostUsd;
  const fx = input.fxUsdBrl == null ? null : Math.max(0, Number(input.fxUsdBrl));
  const totalCostBrl = fx == null ? null : totalCostUsd * fx;

  await db.execute(sql`
    INSERT INTO vendor_usage_ledger (
      tenant_id, user_id, offer_code, product_code, metric_key, feature_key,
      source_system, source_record_id, request_id, quantity, vendor_credits,
      provider, model, input_tokens, output_tokens,
      provider_cost_usd, external_api_cost_usd, infrastructure_cost_usd,
      total_cost_usd, fx_usd_brl, total_cost_brl,
      success, customer_billable, charged_to_quota, failure_reason, metadata,
      occurred_at, created_at
    )
    SELECT
      ${input.tenantId}, ${input.userId ?? null}, ${input.offerCode ?? null}, ${input.productCode ?? null},
      ${input.metricKey}, ${input.featureKey ?? null}, ${input.sourceSystem ?? null}, ${input.sourceRecordId ?? null},
      ${input.requestId ?? null}, ${quantity},
      CASE WHEN ${success} AND ${customerBillable}
        THEN ${quantity} * COALESCE(m.vendor_credits_per_unit, 0)
        ELSE 0 END,
      ${input.provider ?? null}, ${input.model ?? null}, ${input.inputTokens ?? null}, ${input.outputTokens ?? null},
      ${providerCostUsd}, ${externalApiCostUsd}, ${infrastructureCostUsd}, ${totalCostUsd},
      ${fx}, ${totalCostBrl}, ${success}, ${customerBillable}, ${chargedToQuota},
      ${input.failureReason ?? null}, ${JSON.stringify(input.metadata ?? {})}::jsonb,
      now(), now()
    FROM vendor_usage_metrics m
    WHERE m.metric_key = ${input.metricKey}
    ON CONFLICT DO NOTHING
  `);
}

export type VendorUsageSnapshot = {
  metricKey: string;
  displayName: string;
  unitName: string;
  includedQuantity: number | null;
  usedQuantity: number;
  remainingQuantity: number | null;
  percentUsed: number | null;
  usedVendorCredits: number;
  costUsd: number;
  hardLimit: boolean;
  warningThresholdPercent: number;
};

/** Returns the customer-facing monthly usage by offer, plus internal cost totals. */
export async function getVendorUsageSnapshot(params: {
  tenantId: string;
  offerCode: string;
  now?: Date;
}): Promise<VendorUsageSnapshot[]> {
  const now = params.now ?? new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const result = await db.execute(sql`
    SELECT
      q.metric_key AS "metricKey",
      m.display_name AS "displayName",
      m.unit_name AS "unitName",
      q.included_quantity::float8 AS "includedQuantity",
      COALESCE(SUM(CASE WHEN l.success AND l.charged_to_quota THEN l.quantity ELSE 0 END), 0)::float8 AS "usedQuantity",
      CASE WHEN q.included_quantity IS NULL THEN NULL
        ELSE GREATEST(q.included_quantity - COALESCE(SUM(CASE WHEN l.success AND l.charged_to_quota THEN l.quantity ELSE 0 END),0), 0)::float8 END AS "remainingQuantity",
      CASE WHEN q.included_quantity IS NULL OR q.included_quantity = 0 THEN NULL
        ELSE LEAST(100, COALESCE(SUM(CASE WHEN l.success AND l.charged_to_quota THEN l.quantity ELSE 0 END),0) / q.included_quantity * 100)::float8 END AS "percentUsed",
      COALESCE(SUM(CASE WHEN l.success AND l.customer_billable THEN l.vendor_credits ELSE 0 END), 0)::float8 AS "usedVendorCredits",
      COALESCE(SUM(l.total_cost_usd),0)::float8 AS "costUsd",
      q.hard_limit AS "hardLimit",
      q.warning_threshold_percent AS "warningThresholdPercent"
    FROM vendor_offer_quotas q
    JOIN vendor_usage_metrics m ON m.metric_key=q.metric_key
    LEFT JOIN vendor_usage_ledger l
      ON l.tenant_id=${params.tenantId}
     AND l.metric_key=q.metric_key
     AND l.occurred_at >= ${start}
     AND l.occurred_at < ${end}
    WHERE q.offer_code=${params.offerCode}
      AND q.period='month'
    GROUP BY q.metric_key,m.display_name,m.unit_name,q.included_quantity,q.hard_limit,q.warning_threshold_percent
    ORDER BY m.display_name
  `);

  return (result.rows ?? []) as unknown as VendorUsageSnapshot[];
}

/**
 * Checks a metric against the configured franchise. V1 is observational:
 * a quota only blocks when hard_limit=true. Growth quotas are seeded as soft.
 */
export async function canConsumeVendorMetric(params: {
  tenantId: string;
  offerCode: string;
  metricKey: VendorMetricKey;
  quantity?: number;
}): Promise<{ allowed: boolean; remaining: number | null; reason?: string }> {
  const quantity = Math.max(0, Number(params.quantity ?? 1));
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const result = await db.execute(sql`
    SELECT
      q.included_quantity::float8 AS included,
      q.hard_limit AS hard,
      COALESCE(SUM(CASE WHEN l.success AND l.charged_to_quota THEN l.quantity ELSE 0 END),0)::float8 AS used
    FROM vendor_offer_quotas q
    LEFT JOIN vendor_usage_ledger l
      ON l.tenant_id=${params.tenantId}
     AND l.metric_key=q.metric_key
     AND l.occurred_at >= ${start}
     AND l.occurred_at < ${end}
    WHERE q.offer_code=${params.offerCode} AND q.metric_key=${params.metricKey} AND q.period='month'
    GROUP BY q.included_quantity,q.hard_limit
    LIMIT 1
  `);

  const row = result.rows?.[0] as { included?: number | null; hard?: boolean; used?: number } | undefined;
  if (!row || row.included == null) return { allowed: true, remaining: null };

  const remaining = Math.max(0, Number(row.included) - Number(row.used ?? 0));
  if (!row.hard) return { allowed: true, remaining };
  if (remaining >= quantity) return { allowed: true, remaining };
  return { allowed: false, remaining, reason: "Franquia mensal atingida. Compre capacidade adicional ou faça upgrade." };
}

/** Internal finance view: revenue is passed in cents to avoid guessing billing. */
export async function getTenantVariableMargin(params: {
  tenantId: string;
  revenueCents: number;
  now?: Date;
}): Promise<{ revenueBrl: number; variableCostBrl: number; contributionBrl: number; contributionPercent: number }> {
  const now = params.now ?? new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const result = await db.execute(sql`
    SELECT COALESCE(SUM(total_cost_brl),0)::float8 AS cost
    FROM vendor_usage_ledger
    WHERE tenant_id=${params.tenantId} AND occurred_at >= ${start} AND occurred_at < ${end}
  `);
  const variableCostBrl = Number((result.rows?.[0] as { cost?: number } | undefined)?.cost ?? 0);
  const revenueBrl = Math.max(0, params.revenueCents) / 100;
  const contributionBrl = revenueBrl - variableCostBrl;
  const contributionPercent = revenueBrl > 0 ? (contributionBrl / revenueBrl) * 100 : 0;
  return { revenueBrl, variableCostBrl, contributionBrl, contributionPercent };
}
