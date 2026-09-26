import { describe, expect, it } from "vitest";
import {
  recommendArchitecturalPatterns,
  typologyPatternAffinity,
  mergePatternPreferences,
} from "./conceptPatternLibrary";
import type { ClientBrief } from "./conceptClientBrief";

const brief = (overrides: Partial<ClientBrief> = {}): ClientBrief => ({
  bedrooms: 3,
  suites: 1,
  floors: 1,
  garageSpaces: 2,
  gourmet: false,
  pool: false,
  office: false,
  integratedKitchen: true,
  privateAwaySocial: true,
  ...overrides,
});

describe("Etapa 90 — Architectural Design Memory & Pattern Library", () => {
  it("prioriza padrão de lote estreito quando a largura é reduzida", () => {
    const result = recommendArchitecturalPatterns(
      brief({ bedrooms: 2, floors: 1, garageSpaces: 1 }),
      8.5,
    );

    expect(result[0]?.pattern.id).toBe("br_narrow_lot");
  });

  it("reconhece múltiplas suítes como padrão especializado", () => {
    const result = recommendArchitecturalPatterns(
      brief({ bedrooms: 3, suites: 3 }),
      14,
    );

    expect(result.some((item) => item.pattern.id === "br_multi_suite")).toBe(true);
    const multiSuite = result.find((item) => item.pattern.id === "br_multi_suite");
    expect(multiSuite?.reasons.some((reason) => reason.includes("suítes"))).toBe(true);
  });

  it("reconhece home office como necessidade arquitetônica", () => {
    const result = recommendArchitecturalPatterns(
      brief({ office: true }),
      14,
    );

    expect(result.some((item) => item.pattern.id === "br_home_office")).toBe(true);
  });

  it("aumenta afinidade de tipologias recomendadas pelo padrão", () => {
    const recommendations = recommendArchitecturalPatterns(
      brief({ office: true }),
      14,
    );

    const preferred = typologyPatternAffinity("terrea_home_office", recommendations);
    const unrelated = typologyPatternAffinity("terrea_campo", recommendations);

    expect(preferred).toBeGreaterThan(unrelated);
  });

  it("combina preferências espaciais dos melhores padrões", () => {
    const recommendations = recommendArchitecturalPatterns(
      brief({ bedrooms: 3, suites: 2, gourmet: true, pool: true }),
      15,
    );
    const preferences = mergePatternPreferences(recommendations);

    expect(preferences.privateAwaySocial).toBe(true);
    expect(preferences.gourmetNearPool).toBe(true);
  });
});
