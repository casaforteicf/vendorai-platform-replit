import { describe, expect, it } from "vitest";
import {
  addCalendarMonth,
  isSubscriptionPlanSlug,
  resolveVendorAiSubscriptionPrice,
} from "./vendorai-subscription-lifecycle.js";
import { buildVendorAiLaunchOffer, resolveCommercialBillingPhase } from "./commercialOffer.js";

describe("VendorAI subscription lifecycle", () => {
  it("mantém o trial grátis por 5 dias e entra em promo_1 no vencimento", () => {
    const start = new Date("2026-09-01T12:00:00.000Z");
    const offer = buildVendorAiLaunchOffer(start);

    expect(resolveCommercialBillingPhase(offer, new Date("2026-09-06T11:59:59.999Z"))).toBe("trial");
    expect(resolveCommercialBillingPhase(offer, new Date("2026-09-06T12:00:00.000Z"))).toBe("promo_1");
  });

  it("aplica R$ 497 na promo_1 e R$ 990 na promo_2", () => {
    expect(resolveVendorAiSubscriptionPrice({
      phase: "promo_1",
      promoPhase1Price: "497.00",
      promoPhase2Price: "990.00",
      regularPriceAtTransition: null,
    }).price).toBe("497.00");

    expect(resolveVendorAiSubscriptionPrice({
      phase: "promo_2",
      promoPhase1Price: "497.00",
      promoPhase2Price: "990.00",
      regularPriceAtTransition: null,
    }).price).toBe("990.00");
  });

  it("congela o preço regular do catálogo na primeira transição", () => {
    const first = resolveVendorAiSubscriptionPrice({
      phase: "regular",
      promoPhase1Price: "497.00",
      promoPhase2Price: "990.00",
      regularPriceAtTransition: null,
      catalogMonthlyPriceCents: 189_000,
    });
    expect(first).toEqual({ price: "1890.00", regularSnapshot: "1890.00" });

    const later = resolveVendorAiSubscriptionPrice({
      phase: "regular",
      promoPhase1Price: "497.00",
      promoPhase2Price: "990.00",
      regularPriceAtTransition: first.regularSnapshot,
      catalogMonthlyPriceCents: 249_000,
    });
    expect(later.price).toBe("1890.00");
  });

  it("avança mês preservando o último dia possível", () => {
    expect(addCalendarMonth(new Date("2026-01-31T12:00:00.000Z")).toISOString()).toBe("2026-02-28T12:00:00.000Z");
    expect(addCalendarMonth(new Date("2028-01-31T12:00:00.000Z")).toISOString()).toBe("2028-02-29T12:00:00.000Z");
  });

  it("aceita todos os slugs do catálogo suportados por subscriptions", () => {
    for (const slug of ["start", "starter", "growth", "pme_plus", "enterprise"]) {
      expect(isSubscriptionPlanSlug(slug)).toBe(true);
    }
    expect(isSubscriptionPlanSlug("inventado")).toBe(false);
  });
});
