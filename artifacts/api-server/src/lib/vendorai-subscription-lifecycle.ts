import { and, eq } from "drizzle-orm";
import {
  db,
  dealsTable,
  leadsTable,
  plansTable,
  subscriptionsTable,
  tenantsTable,
} from "@workspace/db";
import {
  buildVendorAiLaunchOffer,
  VENDORAI_LAUNCH_CAMPAIGN,
  VENDORAI_TERMS_VERSION,
} from "./commercialOffer.js";
import { resolveClientTenantForDeal } from "./trial-tenant-resolution.js";

// Backwards-compatible exports for existing callers while the pure rules live
// in their own DB-independent module (also used by unit tests).
export {
  addCalendarMonth,
  resolveVendorAiSubscriptionPrice,
} from "./vendorai-subscription-rules.js";

// Growth is the single commercial SaaS plan. Legacy plan rows may remain in
// the database for audit/history, but no new subscription may be created on
// Start/Starter/Light/PME+/Enterprise.
export const SUBSCRIPTION_PLAN_SLUGS = ["growth"] as const;

export type SubscriptionPlanSlug = typeof SUBSCRIPTION_PLAN_SLUGS[number];

export function isSubscriptionPlanSlug(value: string): value is SubscriptionPlanSlug {
  return (SUBSCRIPTION_PLAN_SLUGS as readonly string[]).includes(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

/**
 * A proposta promocional é uma condição de aquisição da LP/campanha, não um
 * preço genérico da plataforma. O trial direto continua existindo, porém sem
 * receber automaticamente a campanha promocional se não houver origem LP.
 */
function hasLpCommercialOffer(discoveryData: unknown): boolean {
  const discovery = asRecord(discoveryData);
  const attribution = asRecord(discovery["attribution"]);
  const landingPageSlug = attribution["landingPageSlug"];
  const offerCode = attribution["offerCode"];
  return (
    (typeof landingPageSlug === "string" && landingPageSlug.trim().length > 0)
    || offerCode === VENDORAI_LAUNCH_CAMPAIGN
  );
}

/**
 * Creates the commercial Growth subscription snapshot only after the seller
 * chooses Growth on the deal and an LP offer is present. Trial signup itself
 * has no paid commitment. Repeated calls never reset an existing billing
 * schedule; they only backfill missing campaign metadata while the
 * subscription is still a trial.
 */
export async function ensureVendorAiLaunchSubscription(params: {
  tenantId: string;
  dealId: string;
  planSlug: string;
  trialStartedAt: Date;
}): Promise<typeof subscriptionsTable.$inferSelect | null> {
  if (!isSubscriptionPlanSlug(params.planSlug)) {
    throw new Error(`Plano ${params.planSlug} não é compatível com subscriptions`);
  }

  const [plan] = await db
    .select({ id: plansTable.id, monthlyPriceCents: plansTable.monthlyPriceCents })
    .from(plansTable)
    .where(and(eq(plansTable.slug, params.planSlug), eq(plansTable.isActive, true)))
    .limit(1);

  if (!plan) throw new Error(`Plano ativo ${params.planSlug} não encontrado`);

  const offer = buildVendorAiLaunchOffer(params.trialStartedAt);
  const [existing] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, params.tenantId))
    .limit(1);

  if (existing) {
    if (existing.status === "trial") {
      const [updated] = await db
        .update(subscriptionsTable)
        .set({
          plano: params.planSlug,
          sourceDealId: existing.sourceDealId ?? params.dealId,
          campaignCode: existing.campaignCode ?? VENDORAI_LAUNCH_CAMPAIGN,
          trialEndsAt: existing.trialEndsAt ?? offer.trialEndsAt,
          promoPhase1Price: existing.promoPhase1Price ?? offer.promoPhase1Price,
          promoPhase1EndsAt: existing.promoPhase1EndsAt ?? offer.promoPhase1EndsAt,
          promoPhase2Price: existing.promoPhase2Price ?? offer.promoPhase2Price,
          promoPhase2EndsAt: existing.promoPhase2EndsAt ?? offer.promoPhase2EndsAt,
          acceptedOfferAt: existing.acceptedOfferAt ?? params.trialStartedAt,
          acceptedTermsAt: existing.acceptedTermsAt ?? params.trialStartedAt,
          acceptedTermsVersion: existing.acceptedTermsVersion ?? VENDORAI_TERMS_VERSION,
          billingProvider: existing.billingProvider ?? "asaas",
          proximaCobranca: existing.proximaCobranca ?? offer.trialEndsAt,
          updatedAt: new Date(),
        })
        .where(eq(subscriptionsTable.id, existing.id))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }

  const [inserted] = await db
    .insert(subscriptionsTable)
    .values({
      tenantId: params.tenantId,
      plano: params.planSlug,
      valorMensal: "0.00",
      status: "trial",
      campaignCode: VENDORAI_LAUNCH_CAMPAIGN,
      sourceDealId: params.dealId,
      billingPhase: "trial",
      trialEndsAt: offer.trialEndsAt,
      promoPhase1Price: offer.promoPhase1Price,
      promoPhase1EndsAt: offer.promoPhase1EndsAt,
      promoPhase2Price: offer.promoPhase2Price,
      promoPhase2EndsAt: offer.promoPhase2EndsAt,
      regularPriceAtTransition: null,
      acceptedOfferAt: params.trialStartedAt,
      acceptedTermsAt: params.trialStartedAt,
      acceptedTermsVersion: VENDORAI_TERMS_VERSION,
      billingProvider: "asaas",
      dataInicio: params.trialStartedAt,
      // Keep the logical due date anchored to the exact end of the 5-day
      // trial. If reconciliation happens later, the billing worker may use
      // today as the provider due date without losing the original cycle key.
      proximaCobranca: offer.trialEndsAt,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted) return inserted;
  const [raced] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.tenantId, params.tenantId))
    .limit(1);
  return raced ?? null;
}

/**
 * Consolidated entry point used by lifecycle jobs. It only creates a VendorAI
 * Growth subscription for a real trial_signup deal with a valid trialTenantId,
 * Growth selected and an LP/campaign commercial origin. Generic trials without
 * an LP offer stay without a promotional price snapshot until Sales assigns a
 * proposal explicitly.
 */
export async function ensureVendorAiLaunchSubscriptionForDeal(
  dealId: string,
): Promise<typeof subscriptionsTable.$inferSelect | null> {
  const [row] = await db
    .select({
      dealTenantId: dealsTable.tenantId,
      planSlug: dealsTable.planoContratado,
      leadSource: leadsTable.source,
      discoveryData: leadsTable.discoveryData,
    })
    .from(dealsTable)
    .leftJoin(leadsTable, eq(leadsTable.id, dealsTable.leadId))
    .where(eq(dealsTable.id, dealId))
    .limit(1);

  if (!row || row.leadSource !== "trial_signup" || !row.planSlug) return null;
  if (!isSubscriptionPlanSlug(row.planSlug)) return null;
  if (!hasLpCommercialOffer(row.discoveryData)) return null;

  const resolution = resolveClientTenantForDeal({
    dealTenantId: row.dealTenantId,
    leadSource: row.leadSource,
    discoveryData: row.discoveryData,
  });
  if (!resolution.valid || !resolution.fromTrial || !resolution.tenantId) {
    throw new Error(`Trial deal ${dealId} sem trialTenantId válido`);
  }

  const [trialTenant] = await db
    .select({ id: tenantsTable.id, createdAt: tenantsTable.createdAt })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, resolution.tenantId))
    .limit(1);
  if (!trialTenant) throw new Error(`Tenant de trial ${resolution.tenantId} não encontrado`);

  return ensureVendorAiLaunchSubscription({
    tenantId: trialTenant.id,
    dealId,
    planSlug: row.planSlug,
    trialStartedAt: trialTenant.createdAt,
  });
}
