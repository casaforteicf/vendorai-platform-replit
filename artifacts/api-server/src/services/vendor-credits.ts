/**
 * Canonical Vendor Credits commercial model.
 *
 * Vendor Credits are customer-facing commercial units.
 * Raw provider tokens/costs remain internal and must never be presented as the
 * customer's wallet balance.
 */

export type VendorCreditPack = {
  key: string;
  credits: number;
  priceBrl: number;
  enterprise?: boolean;
};

export const VENDOR_CREDIT_PACKS: VendorCreditPack[] = [
  { key: "credits_1k", credits: 1_000, priceBrl: 29 },
  { key: "credits_5k", credits: 5_000, priceBrl: 119 },
  { key: "credits_15k", credits: 15_000, priceBrl: 299 },
  { key: "credits_50k", credits: 50_000, priceBrl: 799 },
  { key: "credits_150k", credits: 150_000, priceBrl: 1_990 },
  { key: "credits_500k", credits: 500_000, priceBrl: 4_990 },
];

export function getVendorCreditPackByKey(key: string) {
  return VENDOR_CREDIT_PACKS.find((pack) => pack.key === key) ?? null;
}

export function getVendorCreditPackByCredits(credits: number) {
  return VENDOR_CREDIT_PACKS.find((pack) => pack.credits === credits) ?? null;
}

export function vendorCreditRetailValueBrl(credits: number, pack: VendorCreditPack) {
  if (!Number.isFinite(credits) || credits <= 0 || pack.credits <= 0) return 0;
  return (credits / pack.credits) * pack.priceBrl;
}

/**
 * Deprecated compatibility aliases. Do not use in new UI/business logic.
 * They intentionally point at Vendor Credits, not provider tokens.
 */
export const VENDOR_TOKEN_PACK_PRICE_BRL = VENDOR_CREDIT_PACKS[2]!.priceBrl;
export const VENDOR_TOKEN_PACK_TOKENS = VENDOR_CREDIT_PACKS[2]!.credits;
export const VENDOR_TOKENS_PER_BRL =
  VENDOR_TOKEN_PACK_TOKENS / VENDOR_TOKEN_PACK_PRICE_BRL;

export function brlToVendorTokens(brl: number): number {
  if (!Number.isFinite(brl) || brl <= 0) return 0;
  return Math.ceil(brl * VENDOR_TOKENS_PER_BRL);
}
