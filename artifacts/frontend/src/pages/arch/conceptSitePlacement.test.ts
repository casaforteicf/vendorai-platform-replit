import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_PLACEMENT,
  buildSitePlacementSuggestions,
  getBuildableEnvelope,
  normalizeSitePlacement,
} from "./conceptSitePlacement";

const rooms = [
  { kind: "sala", x: 0, y: 0, width: 6, depth: 5 },
  { kind: "cozinha", x: 6, y: 0, width: 4, depth: 5 },
];

describe("conceptSitePlacement · etapa 91", () => {
  it("mantém compatibilidade com rascunhos antigos e normaliza o novo contexto", () => {
    const normalized = normalizeSitePlacement({
      frontSide: "top",
      setbackFront: 4,
      setbackRear: 2,
      setbackLeft: 1.5,
      setbackRight: 1.5,
      northSide: "left",
      slope: "to_rear",
      strategy: "solar",
    });

    expect(normalized.northSide).toBe("left");
    expect(normalized.slope).toBe("to_rear");
    expect(normalized.strategy).toBe("solar");
    expect(normalized.vehicleAccessSide).toBe("top");
  });

  it("gera recomendação inteligente dentro da área edificável", () => {
    const placement = normalizeSitePlacement({
      ...DEFAULT_SITE_PLACEMENT,
      northSide: "left",
      preferredViewSide: "bottom",
      avoidSide: "right",
      strategy: "solar",
    });
    const suggestions = buildSitePlacementSuggestions(rooms, 18, 30, placement);
    const recommended = suggestions.find((item) => item.id === "site_optimized");
    const envelope = getBuildableEnvelope(18, 30, placement);

    expect(recommended).toBeTruthy();
    expect(recommended?.score).toBeGreaterThan(0);
    expect(recommended?.origin.x).toBeGreaterThanOrEqual(envelope.minX - 0.001);
    expect(recommended?.origin.y).toBeGreaterThanOrEqual(envelope.minY - 0.001);
    expect((recommended?.origin.x ?? 0) + 10).toBeLessThanOrEqual(envelope.maxX + 0.001);
    expect((recommended?.origin.y ?? 0) + 5).toBeLessThanOrEqual(envelope.maxY + 0.001);
  });

  it("prioriza liberar faixa ao norte quando a estratégia solar está ativa", () => {
    const base = normalizeSitePlacement({
      ...DEFAULT_SITE_PLACEMENT,
      northSide: "left",
      strategy: "solar",
    });
    const suggestions = buildSitePlacementSuggestions(rooms, 20, 25, base);
    const recommended = suggestions.find((item) => item.id === "site_optimized");
    const balanced = suggestions.find((item) => item.id === "balanced");

    expect(recommended).toBeTruthy();
    expect(balanced).toBeTruthy();
    expect(recommended?.score).toBeGreaterThanOrEqual(balanced?.score ?? 0);
    expect(recommended?.reasons?.some((reason) => reason.includes("norte"))).toBe(true);
  });
});
