import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { Logger } from "pino";
import {
  billingEventsTable,
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
  VENDORAI_TERMS_VERSION,
  type CommercialBillingPhase,
} from "./commercialOffer.js";
import {
  createCharge,
  createOrGetCustomer,
  findChargeByExternalReference,
  isAsaasConfigured,
} from "./asaas.js";
import { resolveClientTenantForDeal } from "./trial-tenant-resolution.js";

export const SUBSCRIPTION_PLAN_SLUGS = [
  "start",
  "starter",
  "growth",
  "pme_plus",
  "enterprise",
] as const;

export type SubscriptionPlanSlug = typeof SUBSCRIPTION_PLAN_SLUGS[number];

const MAX_BILLING_ROWS_PER_RUN = 100;

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

export function buildVendorAiBillingCycleKey(subscriptionId: string, dueAt: Date): string {
  return `subscription:${subscriptionId}:${dueAt.toISOString().slice(0, 10)}`;
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
 * schedule; they only backfill missing launch metadata while the subscription
 * is still a trial.
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
      acceptedOfferAt: params.trialStartedAt,
      acceptedTermsAt: params.trialStartedAt,
      acceptedTermsVersion: VENDORAI_TERMS_VERSION,
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

function resolveSubscriptionPhase(subscription: typeof subscriptionsTable.$inferSelect, now: Date): CommercialBillingPhase {
  if (!subscription.trialEndsAt || !subscription.promoPhase1EndsAt || !subscription.promoPhase2EndsAt) {
    throw new Error(`Subscription ${subscription.id} sem calendário promocional completo`);
  }
  return resolveCommercialBillingPhase({
    trialEndsAt: subscription.trialEndsAt,
    promoPhase1EndsAt: subscription.promoPhase1EndsAt,
    promoPhase2EndsAt: subscription.promoPhase2EndsAt,
  }, now);
}

function dueDateForAsaas(scheduledDueAt: Date, now: Date): string {
  const scheduled = scheduledDueAt.toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  return scheduled < today ? today : scheduled;
}

async function processVendorAiSubscriptionBilling(
  subscriptionId: string,
  now: Date,
  log: Logger,
): Promise<"charged" | "reused" | "skipped"> {
  return db.transaction(async (tx) => {
    const [subscription] = await tx
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.id, subscriptionId))
      .limit(1);

    if (!subscription || !subscription.proximaCobranca || subscription.proximaCobranca > now) return "skipped";
    if (!(["trial", "ativa", "inadimplente"] as const).includes(subscription.status)) return "skipped";
    if (subscription.campaignCode !== VENDORAI_LAUNCH_CAMPAIGN) return "skipped";

    const scheduledDueAt = subscription.proximaCobranca;
    const cycleKey = buildVendorAiBillingCycleKey(subscription.id, scheduledDueAt);

    // A transaction-scoped advisory lock serializes this exact subscription
    // cycle across overlapping workers. externalReference still protects the
    // crash window after Asaas accepted a payment but before Postgres committed.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${cycleKey}))`);

    const [fresh] = await tx
      .select()
      .from(subscriptionsTable)
      .where(eq(subscriptionsTable.id, subscription.id))
      .limit(1);
    if (!fresh || !fresh.proximaCobranca || fresh.proximaCobranca.getTime() !== scheduledDueAt.getTime()) return "skipped";

    const phase = resolveSubscriptionPhase(fresh, scheduledDueAt);
    if (phase === "trial") {
      throw new Error(`Subscription ${fresh.id} chegou para cobrança ainda em trial`);
    }

    let catalogMonthlyPriceCents: number | null = null;
    if (phase === "regular" && Number(fresh.regularPriceAtTransition ?? 0) <= 0) {
      const [plan] = await tx
        .select({ monthlyPriceCents: plansTable.monthlyPriceCents })
        .from(plansTable)
        .where(and(eq(plansTable.slug, fresh.plano), eq(plansTable.isActive, true)))
        .limit(1);
      if (!plan || Number(plan.monthlyPriceCents ?? 0) <= 0) {
        throw new Error(`Subscription ${fresh.id}: plano regular ${fresh.plano} indisponível no catálogo`);
      }
      catalogMonthlyPriceCents = plan.monthlyPriceCents;
    }

    const resolved = resolveVendorAiSubscriptionPrice({
      phase,
      promoPhase1Price: fresh.promoPhase1Price,
      promoPhase2Price: fresh.promoPhase2Price,
      regularPriceAtTransition: fresh.regularPriceAtTransition,
      catalogMonthlyPriceCents,
    });

    const [insertedEvent] = await tx
      .insert(billingEventsTable)
      .values({
        tenantId: fresh.tenantId,
        mes: cycleKey,
        tipo: fresh.status === "trial" ? "initial" : "monthly",
        valor: resolved.price,
        status: "pending",
        dueDate: scheduledDueAt,
      })
      .onConflictDoNothing()
      .returning();

    const [billingEvent] = insertedEvent
      ? [insertedEvent]
      : await tx
          .select()
          .from(billingEventsTable)
          .where(eq(billingEventsTable.mes, cycleKey))
          .limit(1);

    if (!billingEvent) throw new Error(`Subscription ${fresh.id}: billing event ${cycleKey} não pôde ser criado`);

    let customerId = fresh.asaasCustomerId ?? billingEvent.asaasCustomerId ?? null;
    if (!customerId) {
      if (!fresh.sourceDealId) throw new Error(`Subscription ${fresh.id} sem deal de origem`);
      const [customerSource] = await tx
        .select({
          tenantName: tenantsTable.name,
          leadName: leadsTable.nome,
          company: leadsTable.empresa,
          email: leadsTable.email,
          phone: leadsTable.telefone,
          document: leadsTable.documento,
          companyData: leadsTable.dadosPj,
        })
        .from(dealsTable)
        .leftJoin(leadsTable, eq(leadsTable.id, dealsTable.leadId))
        .innerJoin(tenantsTable, eq(tenantsTable.id, fresh.tenantId))
        .where(eq(dealsTable.id, fresh.sourceDealId))
        .limit(1);

      if (!customerSource) throw new Error(`Subscription ${fresh.id}: origem do cliente não encontrada`);
      const document = customerSource.companyData?.cnpj ?? customerSource.document ?? undefined;
      const customer = await createOrGetCustomer({
        name: customerSource.company ?? customerSource.leadName ?? customerSource.tenantName,
        email: customerSource.email ?? undefined,
        phone: customerSource.phone ?? undefined,
        cpfCnpj: document ?? undefined,
      });
      customerId = customer.id;
    }

    let charge = billingEvent.asaasChargeId
      ? null
      : await findChargeByExternalReference(cycleKey);
    const reusedRemoteCharge = Boolean(charge);

    if (!billingEvent.asaasChargeId && !charge) {
      charge = await createCharge({
        customer: customerId,
        billingType: "UNDEFINED",
        value: Number(resolved.price),
        dueDate: dueDateForAsaas(scheduledDueAt, now),
        description: `VendorAI ${phase} - plano ${fresh.plano}`,
        externalReference: cycleKey,
      });
    }

    const chargeId = billingEvent.asaasChargeId ?? charge?.id;
    if (!chargeId) throw new Error(`Subscription ${fresh.id}: cobrança Asaas sem id`);

    await tx
      .update(billingEventsTable)
      .set({
        valor: resolved.price,
        asaasChargeId: chargeId,
        asaasCustomerId: customerId,
        dueDate: scheduledDueAt,
      })
      .where(eq(billingEventsTable.id, billingEvent.id));

    await tx
      .update(subscriptionsTable)
      .set({
        billingPhase: phase,
        valorMensal: resolved.price,
        regularPriceAtTransition: fresh.regularPriceAtTransition ?? resolved.regularSnapshot,
        asaasCustomerId: customerId,
        proximaCobranca: addCalendarMonth(scheduledDueAt),
        updatedAt: now,
      })
      .where(eq(subscriptionsTable.id, fresh.id));

    log.info({
      subscriptionId: fresh.id,
      tenantId: fresh.tenantId,
      cycleKey,
      phase,
      price: resolved.price,
      asaasChargeId: chargeId,
      reusedRemoteCharge,
    }, "vendorai-subscription: billing cycle prepared");

    return reusedRemoteCharge || Boolean(billingEvent.asaasChargeId) ? "reused" : "charged";
  });
}

export async function runVendorAiSubscriptionBilling(log: Logger, now = new Date()): Promise<void> {
  if (!(await isAsaasConfigured())) {
    log.warn("vendorai-subscription: ASAAS_API_KEY não configurada; billing de lançamento não executado");
    return;
  }

  const dueSubscriptions = await db
    .select({ id: subscriptionsTable.id })
    .from(subscriptionsTable)
    .where(and(
      eq(subscriptionsTable.campaignCode, VENDORAI_LAUNCH_CAMPAIGN),
      inArray(subscriptionsTable.status, ["trial", "ativa", "inadimplente"]),
      lte(subscriptionsTable.proximaCobranca, now),
    ))
    .limit(MAX_BILLING_ROWS_PER_RUN);

  let charged = 0;
  let reused = 0;
  let failed = 0;

  for (const row of dueSubscriptions) {
    try {
      const result = await processVendorAiSubscriptionBilling(row.id, now, log);
      if (result === "charged") charged++;
      if (result === "reused") reused++;
    } catch (err) {
      failed++;
      log.error({ err, subscriptionId: row.id }, "vendorai-subscription: billing cycle failed");
    }
  }

  if (dueSubscriptions.length > 0) {
    log.info({ due: dueSubscriptions.length, charged, reused, failed }, "vendorai-subscription: billing run complete");
  }
}
