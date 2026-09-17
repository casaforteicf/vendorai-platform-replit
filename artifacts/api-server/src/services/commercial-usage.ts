import { and, eq, gt, isNull, lte, or } from "drizzle-orm";
import {
  db,
  plansTable,
  produtosInternosTable,
  tenantProductEntitlementsTable,
  tenantsTable,
  usageLedgerTable,
  usageMetricDefinitionsTable,
} from "@workspace/db";
import type { AiFeature } from "@workspace/db";

export type CommercialMetricKey =
  | "ai_assist"
  | "content_generation"
  | "image_generation"
  | "video_generation"
  | "render_generation"
  | "prospect_enrichment"
  | "agent_interaction"
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
  | "web_search";

/**
 * Low-level AI features that map one-to-one (or close enough) to a commercial
 * unit. Composite jobs such as a full site, render or video must register their
 * final delivered unit in their own completion path instead of charging once
 * per provider call.
 */
const AI_FEATURE_METRIC: Partial<Record<AiFeature, CommercialMetricKey>> = {
  agent_sdr: "agent_interaction",
  agent_closer: "agent_interaction",
  agent_followup: "agent_interaction",
  agent_reactivation: "agent_interaction",
  agent_scheduler: "agent_interaction",
  agent_service: "agent_interaction",
  agent_onboarding: "agent_interaction",
  agent_relacionamento: "agent_interaction",
  agent_financeiro: "agent_interaction",
  agent_cobranca: "agent_interaction",
  proposal_generator: "proposal_generation",
  briefing_generator: "ai_assist",
  content_generator: "content_generation",
  image_generator: "image_generation",
  intelligence_analysis: "intelligence_analysis",
  document_extraction: "document_processing",
  web_search: "web_search",
  media_interpretation: "media_interpretation",
  auto_quote: "proposal_generation",
  spin_briefing: "ai_assist",
  churn_retention: "intelligence_analysis",
};

const AI_FEATURE_PRODUCT: Partial<Record<AiFeature, string>> = {
  agent_sdr: "vendor_ai_team",
  agent_closer: "vendor_ai_team",
  agent_followup: "vendor_ai_team",
  agent_reactivation: "vendor_ai_team",
  agent_scheduler: "vendor_ai_team",
  agent_service: "vendor_ai_team",
  agent_onboarding: "vendor_ai_team",
  agent_relacionamento: "vendor_ai_team",
  agent_financeiro: "vendor_ai_team",
  agent_cobranca: "vendor_ai_team",
  proposal_generator: "vendor_propostas_catalogo",
  auto_quote: "vendor_propostas_catalogo",
  content_generator: "vendor_content_studio",
  image_generator: "vendor_creative_studio",
  intelligence_analysis: "vendor_jarvis",
  churn_retention: "vendor_revenue_scout",
  briefing_generator: "vendor_crm_pro",
  spin_briefing: "vendor_crm_pro",
  document_extraction: "vendor_gestao",
  web_search: "vendor_jarvis",
  media_interpretation: "vendor_creative_studio",
};

export function metricForAiFeature(feature: AiFeature): CommercialMetricKey | null {
  return AI_FEATURE_METRIC[feature] ?? null;
}

export function productKeyForAiFeature(feature: AiFeature): string | null {
  return AI_FEATURE_PRODUCT[feature] ?? null;
}

async function resolveCommercialProductId(params: {
  tenantId: string;
  commercialKeyHint?: string | null;
}): Promise<string | null> {
  const now = new Date();

  // Explicit active product entitlement wins. This is what makes independently
  // purchased modules traceable once checkout starts creating entitlements.
  if (params.commercialKeyHint) {
    const [entitled] = await db
      .select({ productId: tenantProductEntitlementsTable.productId })
      .from(tenantProductEntitlementsTable)
      .innerJoin(produtosInternosTable, eq(produtosInternosTable.id, tenantProductEntitlementsTable.productId))
      .where(
        and(
          eq(tenantProductEntitlementsTable.tenantId, params.tenantId),
          eq(tenantProductEntitlementsTable.status, "active"),
          eq(produtosInternosTable.commercialKey, params.commercialKeyHint),
          lte(tenantProductEntitlementsTable.startsAt, now),
          or(isNull(tenantProductEntitlementsTable.endsAt), gt(tenantProductEntitlementsTable.endsAt, now)),
        ),
      )
      .limit(1);
    if (entitled?.productId) return entitled.productId;
  }

  // Growth is a bundle entitlement: when tenant plan is Growth, economic usage
  // belongs to Growth even if the underlying function also exists standalone.
  const [tenantPlan] = await db
    .select({ planSlug: plansTable.slug })
    .from(tenantsTable)
    .leftJoin(plansTable, eq(plansTable.id, tenantsTable.planId))
    .where(eq(tenantsTable.id, params.tenantId))
    .limit(1);

  const effectiveKey = tenantPlan?.planSlug === "growth"
    ? "vendorai_growth"
    : tenantPlan?.planSlug === "start"
      ? "vendor_crm_free"
      : params.commercialKeyHint ?? null;

  if (!effectiveKey) return null;
  const [product] = await db
    .select({ id: produtosInternosTable.id })
    .from(produtosInternosTable)
    .where(eq(produtosInternosTable.commercialKey, effectiveKey))
    .limit(1);
  return product?.id ?? null;
}

export async function recordCommercialUsage(params: {
  tenantId: string;
  userId?: string | null;
  metricKey: CommercialMetricKey;
  quantity?: number;
  commercialKeyHint?: string | null;
  success: boolean;
  provider?: string | null;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  estimatedProviderCostUsd?: number;
  usedByok?: boolean;
  requestId?: string | null;
  sourceType?: string | null;
  sourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const quantity = Number.isFinite(params.quantity) && (params.quantity ?? 0) > 0 ? Number(params.quantity) : 1;
  const [metric] = await db
    .select({
      weight: usageMetricDefinitionsTable.vendorCreditWeight,
      chargeOnlyOnSuccess: usageMetricDefinitionsTable.chargeOnlyOnSuccess,
    })
    .from(usageMetricDefinitionsTable)
    .where(and(eq(usageMetricDefinitionsTable.metricKey, params.metricKey), eq(usageMetricDefinitionsTable.active, true)))
    .limit(1);

  // If migration/config has not registered this metric, do not create an
  // unpriced ledger row. Caller is expected to treat this recorder as best effort.
  if (!metric) return;

  const customerResultDelivered = params.success || !metric.chargeOnlyOnSuccess;
  const vendorCredits = customerResultDelivered ? Number(metric.weight) * quantity : 0;
  const providerCostUsd = Math.max(0, Number(params.estimatedProviderCostUsd ?? 0));
  const platformCostUsd = params.usedByok ? 0 : providerCostUsd;
  const productId = await resolveCommercialProductId({
    tenantId: params.tenantId,
    commercialKeyHint: params.commercialKeyHint,
  });

  await db.insert(usageLedgerTable).values({
    tenantId: params.tenantId,
    userId: params.userId ?? null,
    productId,
    metricKey: params.metricKey,
    quantity: String(quantity),
    vendorCredits: String(vendorCredits),
    // Phase 1 is measure-only. We mark what would consume quota, but no request
    // is blocked by this ledger yet.
    quotaConsumed: customerResultDelivered,
    customerBillable: false,
    status: params.success ? "success" : "failed",
    provider: params.provider ?? null,
    model: params.model ?? null,
    inputTokens: Math.max(0, params.inputTokens ?? 0),
    outputTokens: Math.max(0, params.outputTokens ?? 0),
    externalApiCostUsd: String(providerCostUsd),
    totalCostUsd: String(platformCostUsd),
    usedByok: params.usedByok ?? false,
    requestId: params.requestId ?? null,
    sourceType: params.sourceType ?? null,
    sourceId: params.sourceId ?? null,
    metadata: {
      enforcement: "measure_only",
      estimatedProviderCostUsd: providerCostUsd,
      ...(params.metadata ?? {}),
    },
  });
}

/** Mirror a provider-level AI log into the economic ledger when the feature is
 * directly measurable. Composite generation jobs register their final result
 * from their job completion path instead. */
export async function mirrorAiUsageToCommercialLedger(params: {
  tenantId: string;
  feature: AiFeature;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costEstimateUsd: number;
  usedByok: boolean;
  success: boolean;
  requestId?: string | null;
}): Promise<void> {
  const metricKey = metricForAiFeature(params.feature);
  if (!metricKey) return;

  await recordCommercialUsage({
    tenantId: params.tenantId,
    metricKey,
    commercialKeyHint: productKeyForAiFeature(params.feature),
    success: params.success,
    provider: params.provider,
    model: params.model,
    inputTokens: params.inputTokens,
    outputTokens: params.outputTokens,
    estimatedProviderCostUsd: params.costEstimateUsd,
    usedByok: params.usedByok,
    requestId: params.requestId,
    sourceType: "ai_gateway",
    sourceId: params.requestId,
    metadata: { aiFeature: params.feature },
  });
}
