import { describe, expect, it } from "vitest";
import {
  calculateBreakRate,
  mergeResponseStats,
  normalizeObjectionLabel,
  outcomeBreaksObjection,
  resolveEventOutcome,
} from "./closer-objection-learning.js";

describe("closer objection learning", () => {
  it("normaliza a objeção sem misturar pontuação e acentos", () => {
    expect(normalizeObjectionLabel("  Está CARO!!! ")).toBe("esta caro");
  });

  it("calcula taxa de quebra com proteção de limites", () => {
    expect(calculateBreakRate(7, 10)).toBe("70.00");
    expect(calculateBreakRate(20, 10)).toBe("100.00");
    expect(calculateBreakRate(0, 0)).toBeNull();
  });

  it("agrega usos e conversões da mesma resposta", () => {
    const once = mergeResponseStats([], "Posso calcular com seus dados?", true);
    const twice = mergeResponseStats(once, "  posso calcular com seus dados?  ", false);

    expect(twice).toEqual([
      { texto: "Posso calcular com seus dados?", usos: 2, conversoes: 1 },
    ]);
  });

  it("prioriza o resultado real do lead sobre inferência", () => {
    expect(resolveEventOutcome({ leadStatus: "cliente", inferredOutcome: "no_change" })).toBe("won");
    expect(resolveEventOutcome({ leadStatus: "perdido", inferredOutcome: "advanced" })).toBe("lost");
    expect(resolveEventOutcome({ leadStatus: "negociacao", inferredOutcome: "advanced" })).toBe("advanced");
  });

  it("considera avanço e ganho como quebra da objeção", () => {
    expect(outcomeBreaksObjection("advanced")).toBe(true);
    expect(outcomeBreaksObjection("won")).toBe(true);
    expect(outcomeBreaksObjection("lost")).toBe(false);
  });
});
