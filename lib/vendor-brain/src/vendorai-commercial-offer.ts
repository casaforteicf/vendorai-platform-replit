export const VENDORAI_LP_OFFER = {
  campaignCode: "vendorai_growth_5d_497_990_1490_v2",
  trialDays: 5,
  subscription: {
    firstPaidDays: 30,
    firstPaidPriceBrl: 497,
    followingMonths: 5,
    followingMonthlyPriceBrl: 990,
    regularMonthlyPriceBrl: 1490,
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
