import { describe, expect, it } from "vitest";
import {
  buildVendorAiLaunchOffer,
  resolveCommercialBillingPhase,
} from "./commercialOffer.js";
import {
  addCalendarMonth,
  logicalDueFromVendorAiCycleKey,
  resolveVendorAiSubscriptionPrice,
  vendorAiSubscriptionCycleKey,
} from "./vendorai-subscription-rules.js";
import { resolveClientTenantForDeal } from "./trial-tenant-resolution.js";

describe("VendorAI launch offer phases", () => {
  const startedAt = new Date("2026-01-01T12:00:00.000Z");
  const offer = buildVendorAiLaunchOffer(startedAt);

  it("keeps day 0 and day 4 in trial", () => {
    expect(resolveCommercialBillingPhase(offer, startedAt)).toBe("trial");
    expect(resolveCommercialBillingPhase(offer, new Date("2026-01-05T12:00:00.000Z"))).toBe("trial");
  });

  it("moves to promo_1 exactly at the end of day 5", () => {
    expect(offer.trialEndsAt.toISOString()).toBe("2026-01-06T12:00:00.000Z");
    expect(resolveCommercialBillingPhase(offer, offer.trialEndsAt)).toBe("promo_1");
  });

  it("moves to promo_2 exactly after the 60-day first promotional window", () => {
    expect(resolveCommercialBillingPhase(offer, new Date(offer.promoPhase1EndsAt.getTime() - 1))).toBe("promo_1");
    expect(resolveCommercialBillingPhase(offer, offer.promoPhase1EndsAt)).toBe("promo_2");
  });

  it("moves to regular exactly after the six-month second promotional window", () => {
    expect(resolveCommercialBillingPhase(offer, new Date(offer.promoPhase2EndsAt.getTime() - 1))).toBe("promo_2");
    expect(resolveCommercialBillingPhase(offer, offer.promoPhase2EndsAt)).toBe("regular");
  });
});

describe("VendorAI subscription pricing", () => {
  const common = {
    promoPhase1Price: "497.00",
    promoPhase2Price: "990.00",
    regularPriceAtTransition: null,
  };

  it("uses zero during trial", () => {
    expect(resolveVendorAiSubscriptionPrice({ phase: "trial", ...common })).toEqual({
      price: "0.00",
      regularSnapshot: null,
    });
  });

  it("uses 497 in promo_1 and 990 in promo_2", () => {
    expect(resolveVendorAiSubscriptionPrice({ phase: "promo_1", ...common }).price).toBe("497.00");
    expect(resolveVendorAiSubscriptionPrice({ phase: "promo_2", ...common }).price).toBe("990.00");
  });

  it("captures the regular catalog price once and preserves the snapshot", () => {
    const firstRegular = resolveVendorAiSubscriptionPrice({
      phase: "regular",
      ...common,
      catalogMonthlyPriceCents: 129_900,
    });
    expect(firstRegular).toEqual({ price: "1299.00", regularSnapshot: "1299.00" });

    const afterCatalogChange = resolveVendorAiSubscriptionPrice({
      phase: "regular",
      ...common,
      regularPriceAtTransition: firstRegular.regularSnapshot,
      catalogMonthlyPriceCents: 199_900,
    });
    expect(afterCatalogChange).toEqual({ price: "1299.00", regularSnapshot: "1299.00" });
  });

  it("fails closed when regular price is unavailable", () => {
    expect(() => resolveVendorAiSubscriptionPrice({
      phase: "regular",
      ...common,
      catalogMonthlyPriceCents: null,
    })).toThrow(/regular catalog price is unavailable/);
  });
});

describe("VendorAI monthly billing calendar", () => {
  it("preserves day 31 through February without permanent drift", () => {
    const jan31 = new Date("2026-01-31T12:00:00.000Z");
    const feb = addCalendarMonth(jan31, 31);
    const mar = addCalendarMonth(feb, 31);
    expect(feb.toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(mar.toISOString()).toBe("2026-03-31T12:00:00.000Z");
  });

  it("uses February 29 in leap year", () => {
    expect(addCalendarMonth(new Date("2028-01-31T08:30:00.000Z"), 31).toISOString())
      .toBe("2028-02-29T08:30:00.000Z");
  });

  it("preserves a day-30 anchor", () => {
    expect(addCalendarMonth(new Date("2026-04-30T08:30:00.000Z"), 30).toISOString())
      .toBe("2026-05-30T08:30:00.000Z");
  });

  it("handles year rollover", () => {
    expect(addCalendarMonth(new Date("2026-12-31T08:30:00.000Z"), 31).toISOString())
      .toBe("2027-01-31T08:30:00.000Z");
  });
});

describe("VendorAI billing cycle identity", () => {
  it("builds a deterministic cycle key and parses its logical due date", () => {
    const due = new Date("2026-09-30T17:45:00.000Z");
    const key = vendorAiSubscriptionCycleKey("sub-123", due);
    expect(key).toBe("subscription:sub-123:2026-09-30");
    expect(vendorAiSubscriptionCycleKey("sub-123", due)).toBe(key);
    expect(logicalDueFromVendorAiCycleKey(key)?.toISOString()).toBe("2026-09-30T00:00:00.000Z");
  });

  it("rejects malformed or legacy cycle keys", () => {
    expect(logicalDueFromVendorAiCycleKey("monthly:tenant:2026-09")).toBeNull();
    expect(logicalDueFromVendorAiCycleKey("subscription:sub-123:not-a-date")).toBeNull();
  });
});

describe("trial tenant resolution", () => {
  it("uses exactly the trialTenantId for a trial deal", () => {
    expect(resolveClientTenantForDeal({
      dealTenantId: "vendorai-sales-tenant",
      leadSource: "trial_signup",
      discoveryData: { trialTenantId: "customer-trial-tenant" },
    })).toEqual({
      tenantId: "customer-trial-tenant",
      fromTrial: true,
      valid: true,
    });
  });

  it("fails closed when a trial loses trialTenantId instead of falling back to the seller tenant", () => {
    expect(resolveClientTenantForDeal({
      dealTenantId: "vendorai-sales-tenant",
      leadSource: "trial_signup",
      discoveryData: {},
    })).toEqual({ tenantId: null, fromTrial: true, valid: false });
  });
});
