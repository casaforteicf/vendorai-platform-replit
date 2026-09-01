import type { CommercialBillingPhase } from "./commercialOffer.js";

/**
 * Advances one calendar month while optionally preserving a contractual anchor
 * day. Example with anchor 31: Jan 31 → Feb 28/29 → Mar 31, instead of drifting
 * permanently to the 28th after February.
 */
export function addCalendarMonth(date: Date, anchorDay = date.getUTCDate()): Date {
  const result = new Date(date);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  const normalizedAnchor = Math.min(31, Math.max(1, Math.trunc(anchorDay)));
  result.setUTCDate(Math.min(normalizedAnchor, lastDay));
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

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function vendorAiSubscriptionCycleKey(subscriptionId: string, dueDate: Date): string {
  return `subscription:${subscriptionId}:${dateKey(dueDate)}`;
}

export function logicalDueFromVendorAiCycleKey(value: string | null | undefined): Date | null {
  if (!value?.startsWith("subscription:")) return null;
  const parts = value.split(":");
  const raw = parts[2];
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}
