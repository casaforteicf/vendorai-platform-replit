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
  resolveCommercialBillingPhase,
  VENDORAI_LAUNCH_CAMPAIGN,
  type CommercialBillingPhase,
} from "./commercialOffer.js";
import { resolveClientTenantForDeal } from "./trial-tenant-resolution.js";

export const SUBSCRIPTION_PLAN_SLUGS = [
  "start",
  "starter",
  "growth",
  "pme_plus",
  "enterprise",
] as const;

export type SubscriptionPlanSlug = typeof SUBSCRIPTION_PLAN_SLUGS[number];

export function isSubscriptionPlanSlug(value: string): value is SubscriptionPlanSlug {
  return (SUBSCRIPTION_PLAN_SLUGS as readonly string[]).includes(value);
}

export function addCalendarMonth(date: Date): Date {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

export function resolveVendorAiSubscriptionPrice(input: {
  phase: CommercialBillingPhase;
  promoPhase1Price: string | number | null;
  promoPhase2Price: string | number | null;
  regularPriceAtTransition: string | number | null;
  catalogMonthlyPriceCents?: number | null;
}): { price: string; regularSnapshot: string | null } {
  if (input.phase === "trial") return { price: "0.00", regularSnapshot: null };
  if (input.phase === "promo_1") {
    const price = Number(input.promoPhase1Price ?? 0);
    if (!(price > 0)) throw new Error("VendorAI subscription promo_1 price is invalid");
    return { price: price.toFixed(2), regularSnapshot: null };
  }
  if (input.phase === "promo_2") {
    const price = Number(input.promoPhase2Price ?? 0);
    if (!(price > 0)) throw new Error("VendorAI subscription promo_2 price is invalid");
    return { price: price.toFixed(2), regularSnapshot: null };
  }

  const persisted = Number(input.regularPriceAtTransition ?? 0);
  if (persisted > 0) return { price: persisted.toFixed(2), regularSnapshot: persisted.toFixed(2) };

  const cents = Number(input.catalogMonthlyPriceCents ?? 0);
  if (!(cents > 0)) throw new Error("VendorAI subscription regular catalog price is unavailable");
  const snapshot = (cents / 100).toFixed(2);
  return { price: snapshot, regularSnapshot: snapshot };
}

/**
 * Creates the commercial subscription snapshot only after the seller chooses a
 * real plan on the deal. Trial signup itself has no plan selection, therefore
 * it must not guess a plan. Repeated calls never reset an existing billing
 * schedule; they only backfill the source deal/plan while the subscription is
 * still a trial.
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

  // Plano gratuito não pertence à campanha paga 497→990→regular.
  if (Number(plan.monthlyPriceCents ?? 0) <= 0) return null;

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
          updatedAt: new Date(),
        })
        .where(eq(subscriptionsTable.id, existing.id))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }

  const offer = buildVendorAiLaunchOffer(params.trialStartedAt);
  const now = new Date();
  const phase = resolveCommercialBillingPhase(offer, now);
  const resolved = resolveVendorAiSubscriptionPrice({
    phase,
    promoPhase1Price: offer.promoPhase1Price,
    promoPhase2Price: offer.promoPhase2Price,
    regularPriceAtTransition: null,
    catalogMonthlyPriceCents: plan.monthlyPriceCents,
  });

  const [inserted] = await db
    .insert(subscriptionsTable)
    .values({
      tenantId: params.tenantId,
      plano: params.planSlug,
      valorMensal: resolved.price,
      status: "trial",
      campaignCode: VENDORAI_LAUNCH_CAMPAIGN,
      sourceDealId: params.dealId,
      billingPhase: phase,
      trialEndsAt: offer.trialEndsAt,
      promoPhase1Price: offer.promoPhase1Price,
      promoPhase1EndsAt: offer.promoPhase1EndsAt,
      promoPhase2Price: offer.promoPhase2Price,
      promoPhase2EndsAt: offer.promoPhase2EndsAt,
      regularPriceAtTransition: resolved.regularSnapshot,
      acceptedOfferAt: now,
      billingProvider: "asaas",
      dataInicio: params.trialStartedAt,
      proximaCobranca: offer.trialEndsAt > now ? offer.trialEndsAt : now,
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
 * launch subscription for a real trial_signup deal with a valid trialTenantId
 * and a seller-selected plan. Normal customer deals are ignored.
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
