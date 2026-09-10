import { describe, expect, it } from "vitest";
import { resolveLandingOffer } from "./landing-offer.js";

describe("resolveLandingOffer", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");

  it("usa o valor promocional da LP quando a oferta está ativa", () => {
    const result = resolveLandingOffer({
      offer: {
        enabled: true,
        offerCode: "CONSTRUTORAS-SET",
        planSlug: "growth",
        vertical: "construtora",
        promotionalPriceCents: 69700,
        originalPriceCents: 99000,
        promotionalCycles: 3,
        startsAt: "2026-09-01T00:00:00.000Z",
        endsAt: "2026-09-30T23:59:59.000Z",
        billingCycle: "monthly",
      },
      catalogMonthlyPriceCents: 99000,
      fallbackPlanSlug: "growth",
      now,
    });

    expect(result.source).toBe("landing_offer");
    expect(result.chargePriceCents).toBe(69700);
    expect(result.originalPriceCents).toBe(99000);
    expect(result.promotionalCycles).toBe(3);
  });

  it("cai no preço padrão do plano quando a oferta expirou", () => {
    const result = resolveLandingOffer({
      offer: {
        enabled: true,
        planSlug: "growth",
        promotionalPriceCents: 49700,
        endsAt: "2026-08-31T23:59:59.000Z",
      },
      catalogMonthlyPriceCents: 99000,
      fallbackPlanSlug: "growth",
      now,
    });

    expect(result.source).toBe("plan_catalog");
    expect(result.reason).toBe("offer_expired");
    expect(result.chargePriceCents).toBe(99000);
  });

  it("não confia em valor externo: resolve somente oferta configurada e catálogo", () => {
    const result = resolveLandingOffer({
      offer: null,
      catalogMonthlyPriceCents: 129000,
      fallbackPlanSlug: "enterprise",
      now,
    });

    expect(result.source).toBe("plan_catalog");
    expect(result.chargePriceCents).toBe(129000);
  });

  it("calcula cobrança anual a partir do preço mensal-equivalente anual", () => {
    const result = resolveLandingOffer({
      offer: {
        enabled: true,
        planSlug: "growth",
        promotionalPriceCents: 80000,
        billingCycle: "annual",
      },
      catalogMonthlyPriceCents: 99000,
      catalogAnnualMonthlyPriceCents: 90000,
      fallbackPlanSlug: "growth",
      now,
    });

    expect(result.chargePriceCents).toBe(960000);
    expect(result.renewalPriceCents).toBe(1080000);
  });
});
