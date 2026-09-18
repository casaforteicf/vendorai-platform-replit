export const VENDORAI_LP_OFFER = {
  campaignCode: "vendorai_growth_5d_399_1490_v3",
  trialDays: 5,
  subscription: {
    monthlyPriceBrl: 1490,
  },
  prepaid: {
    blockDays: 5,
    blockPriceBrl: 399,
  },
} as const;

export type VendorAiLpOfferCode = typeof VENDORAI_LP_OFFER.campaignCode;

export function isVendorAiLpOfferCode(value: string | null | undefined): value is VendorAiLpOfferCode {
  return value === VENDORAI_LP_OFFER.campaignCode;
}
