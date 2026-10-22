import { describe, expect, it } from "vitest";
import { buildArchitecturalProjectStrategy } from "./arqdor-project-strategy.js";

const base = {
  lotWidth: 15,
  lotDepth: 30,
  floors: 1,
  intervention: "valorizar" as const,
  vision: {
    lifestyle: "familia",
    protagonist: "social",
    priorities: ["luz_natural", "privacidade"],
    budgetStrategy: "equilibrar",
    household: { adults: 2, children: 2, elderly: 0, pets: false },
    routine: { homeOffice: "sometimes", receivesGuests: "sometimes", cooking: "daily", accessibility: "none" },
  },
  brief: {
    gourmet: true,
    pool: true,
    office: false,
    integratedKitchen: true,
    privateAwaySocial: true,
    garageSpaces: 2,
  },
};

describe("estratégia arquitetônica · etapa 93", () => {
  it("define partido antes da geometria e inclui regras não negociáveis", () => {
    const strategy = buildArchitecturalProjectStrategy({ ...base, lotDepth: 28 });
    expect(strategy.party).toBe("l_courtyard");
    expect(strategy.zoning.social.length).toBeGreaterThan(20);
    expect(strategy.circulationLogic.length).toBeGreaterThan(20);
    expect(strategy.nonNegotiables.some((item) => item.includes("fachada"))).toBe(true);
  });

  it("usa espinha linear em lote estreito/profundo", () => {
    const strategy = buildArchitecturalProjectStrategy({
      ...base,
      lotWidth: 9.5,
      lotDepth: 32,
      brief: { ...base.brief, pool: false, gourmet: false },
    });
    expect(strategy.party).toBe("linear_spine");
    expect(strategy.circulationLogic).toContain("eixo principal");
  });

  it("preserva a espinha linear quando a profundidade atinge duas vezes a largura", () => {
    expect(buildArchitecturalProjectStrategy(base).party).toBe("linear_spine");
  });

  it("protege setor íntimo quando privacidade é prioridade", () => {
    const strategy = buildArchitecturalProjectStrategy(base);
    expect(strategy.nonNegotiables.some((item) => item.includes("dormitórios"))).toBe(true);
  });

  it("adiciona acessibilidade como requisito do partido", () => {
    const strategy = buildArchitecturalProjectStrategy({
      ...base,
      vision: {
        ...base.vision,
        household: { adults: 2, children: 0, elderly: 1, pets: false },
        routine: { ...base.vision.routine, accessibility: "required" },
      },
    });
    expect(strategy.nonNegotiables.some((item) => item.includes("acessível"))).toBe(true);
  });
});
