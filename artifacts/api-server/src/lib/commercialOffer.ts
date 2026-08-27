export const VENDORAI_LAUNCH_CAMPAIGN = "vendorai_launch_5d_497_990_v1";
export const VENDORAI_TERMS_VERSION = "vendorai-commercial-2026-08-27";

export type CommercialBillingPhase = "trial" | "promo_1" | "promo_2" | "regular";

export interface CommercialOfferSchedule {
  campaignCode: string;
  trialEndsAt: Date;
  promoPhase1Price: string;
  promoPhase1EndsAt: Date;
  promoPhase2Price: string;
  promoPhase2EndsAt: Date;
  regularPriceAtTransition: null;
  billingPhase: CommercialBillingPhase;
  valorMensal: string;
  nextBillingAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function addCalendarMonths(date: Date, months: number): Date {
  const result = new Date(date);
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(originalDay, lastDay));
  return result;
}

/**
 * Campaign accepted on signup:
 * - 5 full days free
 * - R$ 497/month for the next 60 days
 * - R$ 990/month for the following 6 calendar months
 * - then the normal price in force at transition time
 */
export function buildVendorAiLaunchOffer(startedAt = new Date()): CommercialOfferSchedule {
  const trialEndsAt = new Date(startedAt.getTime() + 5 * DAY_MS);
  const promoPhase1EndsAt = new Date(trialEndsAt.getTime() + 60 * DAY_MS);
  const promoPhase2EndsAt = addCalendarMonths(promoPhase1EndsAt, 6);

  return {
    campaignCode: VENDORAI_LAUNCH_CAMPAIGN,
    trialEndsAt,
    promoPhase1Price: "497.00",
    promoPhase1EndsAt,
    promoPhase2Price: "990.00",
    promoPhase2EndsAt,
    regularPriceAtTransition: null,
    billingPhase: "trial",
    valorMensal: "0.00",
    nextBillingAt: trialEndsAt,
  };
}

export function resolveCommercialBillingPhase(
  subscription: Pick<CommercialOfferSchedule, "trialEndsAt" | "promoPhase1EndsAt" | "promoPhase2EndsAt">,
  now = new Date(),
): CommercialBillingPhase {
  if (now < subscription.trialEndsAt) return "trial";
  if (now < subscription.promoPhase1EndsAt) return "promo_1";
  if (now < subscription.promoPhase2EndsAt) return "promo_2";
  return "regular";
}
