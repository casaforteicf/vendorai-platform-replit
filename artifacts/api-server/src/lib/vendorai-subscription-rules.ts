import type { CommercialBillingPhase } from "./commercialOffer.js";

/**
 * Advances an exact number of calendar months while optionally preserving a
 * contractual anchor day. Example with anchor 31: Jan 31 → Feb 28/29 → Mar 31,
 * instead of drifting permanently to the 28th after February.
 */
export function addCalendarMonths(
  date: Date,
  months: number,
  anchorDay = date.getUTCDate(),
): Date {
  const result = new Date(date);
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + Math.trunc(months));
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  const normalizedAnchor = Math.min(31, Math.max(1, Math.trunc(anchorDay)));
  result.setUTCDate(Math.min(normalizedAnchor, lastDay));
  return result;
}

export function addCalendarMonth(date: Date, anchorDay = date.getUTCDate()): Date {
  return addCalendarMonths(date, 1, anchorDay);
}

export function addCalendarYear(date: Date, anchorDay = date.getUTCDate()): Date {
  return addCalendarMonths(date, 12, anchorDay);
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

export function resolveVendorAiAnnualPrice(input: {
  annualPriceAtTransition: string | number | null;
  catalogMonthlyAnnualPriceCents?: number | null;
}): { monthlyEquivalent: string; annualTotal: string; annualSnapshot: string } {
  const persisted = Number(input.annualPriceAtTransition ?? 0);
  if (persisted > 0) {
    const monthlyEquivalent = persisted.toFixed(2);
    return {
      monthlyEquivalent,
      annualTotal: (persisted * 12).toFixed(2),
      annualSnapshot: monthlyEquivalent,
    };
  }

  const cents = Number(input.catalogMonthlyAnnualPriceCents ?? 0);
  if (!(cents > 0)) throw new Error("VendorAI subscription annual catalog price is unavailable");
  const monthly = cents / 100;
  const monthlyEquivalent = monthly.toFixed(2);
  return {
    monthlyEquivalent,
    annualTotal: (monthly * 12).toFixed(2),
    annualSnapshot: monthlyEquivalent,
  };
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
