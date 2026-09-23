/**
 * Canonical customer-facing Vendor.ai token standard.
 *
 * One token unit is stable across the whole platform:
 *   1 BRL of commercial value = 1,000 Vendor Tokens.
 *
 * Provider currencies, API tokens, Vendor Credits and internal cost weights are
 * implementation details and must never be exposed as alternative customer balances.
 */
export const VENDOR_TOKENS_PER_BRL = 1_000;
export const VENDOR_TOKEN_PACK_PRICE_BRL = 165;
export const VENDOR_TOKEN_PACK_TOKENS =
  VENDOR_TOKEN_PACK_PRICE_BRL * VENDOR_TOKENS_PER_BRL;

export const VENDOR_PREMIUM_MARKUP_MULTIPLIER = 1.8;

export function brlToVendorTokens(brl: number): number {
  if (!Number.isFinite(brl) || brl <= 0) return 0;
  return Math.ceil(brl * VENDOR_TOKENS_PER_BRL);
}

export function vendorTokensToBrl(tokens: number): number {
  if (!Number.isFinite(tokens) || tokens <= 0) return 0;
  return tokens / VENDOR_TOKENS_PER_BRL;
}

export function premiumCostToVendorTokens(input: {
  providerCostUsd: number;
  exchangeRateBrl: number;
  markupMultiplier?: number;
}): number {
  const providerCostUsd = Math.max(0, Number(input.providerCostUsd || 0));
  const exchangeRateBrl = Math.max(0, Number(input.exchangeRateBrl || 0));
  const markupMultiplier = Math.max(
    1,
    Number(input.markupMultiplier ?? VENDOR_PREMIUM_MARKUP_MULTIPLIER),
  );
  return brlToVendorTokens(providerCostUsd * exchangeRateBrl * markupMultiplier);
}
