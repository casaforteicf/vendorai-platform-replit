import { describe, expect, it } from "vitest";
import {
  addCalendarMonth,
  isSubscriptionPlanSlug,
  resolveVendorAiSubscriptionPrice,
} from "./vendorai-subscription-lifecycle.js";
import { buildVendorAiLaunchOffer, resolveCommercialBillingPhase } from "./commercialOffer.js";

describe("VendorAI Growth subscription lifecycle", () => {
  it("mantém o trial grátis por 5 dias e entra direto no Growth regular", () => {
    const start = new Date("2026-09-01T12:00:00.000Z");
    const offer = buildVendorAiLaunchOffer(start);

    expect(offer.trialEndsAt.toISOString()).toBe("2026-09-06T12:00:00.000Z");
    expect(resolveCommercialBillingPhase(offer, new Date("2026-09-06T11:59:59.999Z"))).toBe("trial");
    expect(resolveCommercialBillingPhase(offer, new Date("2026-09-06T12:00:00.000Z"))).toBe("regular");
  });

  it("usa R$ 1.490 como preço aceito da assinatura Growth", () => {
    const offer = buildVendorAiLaunchOffer(new Date("2026-09-01T12:00:00.000Z"));
    expect(offer.regularPriceAtTransition).toBe("1490.00");

    expect(resolveVendorAiSubscriptionPrice({
      phase: "regular",
      regularPriceAtTransition: offer.regularPriceAtTransition,
      catalogMonthlyPriceCents: 199_900,
    })).toEqual({ price: "1490.00", regularSnapshot: "1490.00" });
  });

  it("avança mês preservando o último dia possível", () => {
    expect(addCalendarMonth(new Date("2026-01-31T12:00:00.000Z")).toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(addCalendarMonth(new Date("2028-01-31T12:00:00.000Z")).toISOString()).toBe("2028-02-29T12:00:00.000Z");
  });

  it("aceita somente Growth para novas subscriptions", () => {
    expect(isSubscriptionPlanSlug("growth")).toBe(true);
    for (const retired of ["start", "starter", "light", "pme_plus", "enterprise", "inventado"]) {
      expect(isSubscriptionPlanSlug(retired)).toBe(false);
    }
  });
});
