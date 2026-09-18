import { VENDORAI_LP_OFFER } from "@workspace/vendor-brain";

export const VENDORAI_LAUNCH_CAMPAIGN = VENDORAI_LP_OFFER.campaignCode;
export const VENDORAI_TERMS_VERSION = "vendorai-commercial-2026-09-17";

export type CommercialBillingPhase = "trial" | "regular";

export interface CommercialOfferSchedule {
  campaignCode: string;
  trialEndsAt: Date;
  regularPriceAtTransition: string;
  billingPhase: CommercialBillingPhase;
  valorMensal: string;
  nextBillingAt: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Oferta comercial atual apresentada pelas LPs:
 * - 5 dias completos grátis para validar a operação;
 * - Growth contínuo por R$ 1.490/mês;
 * - alternativa pré-paga de +5 dias por R$ 399.
 *
 * O bloco pré-pago é uma forma de acesso separada da assinatura mensal.
 * Não existem fases promocionais de R$ 497 ou R$ 990 nesta oferta.
 */
export function buildVendorAiLaunchOffer(startedAt = new Date()): CommercialOfferSchedule {
  const trialEndsAt = new Date(startedAt.getTime() + VENDORAI_LP_OFFER.trialDays * DAY_MS);
  return {
    campaignCode: VENDORAI_LAUNCH_CAMPAIGN,
    trialEndsAt,
    regularPriceAtTransition: VENDORAI_LP_OFFER.subscription.monthlyPriceBrl.toFixed(2),
    billingPhase: "trial",
    valorMensal: "0.00",
    nextBillingAt: trialEndsAt,
  };
}

export function resolveCommercialBillingPhase(
  subscription: Pick<CommercialOfferSchedule, "trialEndsAt">,
  now = new Date(),
): CommercialBillingPhase {
  return now < subscription.trialEndsAt ? "trial" : "regular";
}
