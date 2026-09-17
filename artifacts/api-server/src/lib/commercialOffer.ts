import { VENDORAI_LP_OFFER } from "@workspace/vendor-brain";

export const VENDORAI_LAUNCH_CAMPAIGN = VENDORAI_LP_OFFER.campaignCode;
export const VENDORAI_TERMS_VERSION = "vendorai-commercial-2026-09-11";

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
 * Oferta comercial apresentada pelas LPs da campanha:
 * - 5 dias completos grátis
 * - R$ 497 pelos primeiros 30 dias pagos
 * - R$ 990/mês pelos 5 meses seguintes
 * - depois, R$ 1.490/mês
 *
 * A condição comercial nasce na LP/campanha. O site institucional e as telas
 * genéricas da plataforma não são fonte de preço.
 */
export function buildVendorAiLaunchOffer(startedAt = new Date()): CommercialOfferSchedule {
  const trialEndsAt = new Date(startedAt.getTime() + VENDORAI_LP_OFFER.trialDays * DAY_MS);
  const promoPhase1EndsAt = new Date(trialEndsAt.getTime() + VENDORAI_LP_OFFER.subscription.firstPaidDays * DAY_MS);
  const promoPhase2EndsAt = addCalendarMonths(promoPhase1EndsAt, VENDORAI_LP_OFFER.subscription.followingMonths);

  return {
    campaignCode: VENDORAI_LAUNCH_CAMPAIGN,
    trialEndsAt,
    promoPhase1Price: VENDORAI_LP_OFFER.subscription.firstPaidPriceBrl.toFixed(2),
    promoPhase1EndsAt,
    promoPhase2Price: VENDORAI_LP_OFFER.subscription.followingMonthlyPriceBrl.toFixed(2),
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
