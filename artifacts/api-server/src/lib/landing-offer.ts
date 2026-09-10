import type { SiteCommerceOffer } from "@workspace/db";

export type LandingOfferPriceSource = "landing_offer" | "plan_catalog";

export type LandingOfferResolution = {
  valid: boolean;
  active: boolean;
  source: LandingOfferPriceSource;
  planSlug: string;
  billingCycle: "monthly" | "annual";
  chargePriceCents: number;
  originalPriceCents: number;
  renewalPriceCents: number;
  promotionalCycles: number;
  offerCode: string | null;
  vertical: string | null;
  couponsAllowed: boolean;
  partnerRulesAllowed: boolean;
  startsAt: string | null;
  endsAt: string | null;
  reason: "offer_active" | "offer_not_configured" | "offer_disabled" | "offer_not_started" | "offer_expired";
};

function validPositiveInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) > 0;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

export function resolveLandingOffer(params: {
  offer?: SiteCommerceOffer | null;
  catalogMonthlyPriceCents: number;
  catalogAnnualMonthlyPriceCents?: number | null;
  now?: Date;
  fallbackPlanSlug: string;
}): LandingOfferResolution {
  const now = params.now ?? new Date();
  const offer = params.offer ?? null;
  const billingCycle = offer?.billingCycle === "annual" ? "annual" : "monthly";
  const catalogUnitPrice = billingCycle === "annual"
    ? Number(params.catalogAnnualMonthlyPriceCents ?? params.catalogMonthlyPriceCents)
    : Number(params.catalogMonthlyPriceCents);
  const catalogChargePrice = billingCycle === "annual" ? catalogUnitPrice * 12 : catalogUnitPrice;
  const fallback = (reason: LandingOfferResolution["reason"]): LandingOfferResolution => ({
    valid: validPositiveInteger(catalogChargePrice),
    active: false,
    source: "plan_catalog",
    planSlug: offer?.planSlug || params.fallbackPlanSlug,
    billingCycle,
    chargePriceCents: catalogChargePrice,
    originalPriceCents: catalogChargePrice,
    renewalPriceCents: catalogChargePrice,
    promotionalCycles: 0,
    offerCode: offer?.offerCode ?? null,
    vertical: offer?.vertical ?? null,
    couponsAllowed: offer?.couponsAllowed !== false,
    partnerRulesAllowed: offer?.partnerRulesAllowed !== false,
    startsAt: offer?.startsAt ?? null,
    endsAt: offer?.endsAt ?? null,
    reason,
  });

  if (!offer) return fallback("offer_not_configured");
  if (!offer.enabled) return fallback("offer_disabled");

  const startsAt = parseDate(offer.startsAt);
  const endsAt = parseDate(offer.endsAt);
  if (startsAt && now < startsAt) return fallback("offer_not_started");
  if (endsAt && now > endsAt) return fallback("offer_expired");

  const promoUnit = validPositiveInteger(offer.promotionalPriceCents)
    ? offer.promotionalPriceCents
    : catalogUnitPrice;
  const promoCharge = billingCycle === "annual" ? promoUnit * 12 : promoUnit;

  const fixedRenewalUnit = validPositiveInteger(offer.regularPriceOverrideCents)
    ? offer.regularPriceOverrideCents
    : catalogUnitPrice;
  const renewalUnit = offer.renewalMode === "fixed" ? fixedRenewalUnit : catalogUnitPrice;
  const renewalCharge = billingCycle === "annual" ? renewalUnit * 12 : renewalUnit;

  const originalUnit = validPositiveInteger(offer.originalPriceCents)
    ? offer.originalPriceCents
    : catalogUnitPrice;
  const originalCharge = billingCycle === "annual" ? originalUnit * 12 : originalUnit;

  return {
    valid: validPositiveInteger(promoCharge) && validPositiveInteger(renewalCharge),
    active: true,
    source: "landing_offer",
    planSlug: offer.planSlug,
    billingCycle,
    chargePriceCents: promoCharge,
    originalPriceCents: originalCharge,
    renewalPriceCents: renewalCharge,
    promotionalCycles: Math.max(0, Math.floor(Number(offer.promotionalCycles ?? 0))),
    offerCode: offer.offerCode ?? null,
    vertical: offer.vertical ?? null,
    couponsAllowed: offer.couponsAllowed !== false,
    partnerRulesAllowed: offer.partnerRulesAllowed !== false,
    startsAt: offer.startsAt ?? null,
    endsAt: offer.endsAt ?? null,
    reason: "offer_active",
  };
}
