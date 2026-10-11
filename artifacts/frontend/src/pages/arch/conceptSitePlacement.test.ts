import { describe, expect, it } from "vitest";
import {
  DEFAULT_SITE_PLACEMENT,
  buildSitePlacementSuggestions,
  clampBuildingOrigin,
  getBuildableEnvelope,
  getSiteBoundaryPoints,
  normalizeSitePlacement,
  pointInSitePolygon,
  polygonArea,
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
  it("preserva um lote irregular real e calcula sua área", () => {
    const placement = normalizeSitePlacement({
      ...DEFAULT_SITE_PLACEMENT,
      setbackFront: 0,
      setbackRear: 0,
      setbackLeft: 0,
      setbackRight: 0,
      lotBoundary: {
        kind: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 16, y: 30 },
          { x: 2, y: 30 },
        ],
      },
    });
    const boundary = getSiteBoundaryPoints(20, 30, placement);
    const envelope = getBuildableEnvelope(20, 30, placement);

    expect(boundary).toHaveLength(4);
    expect(polygonArea(boundary)).toBeCloseTo(510, 4);
    expect(envelope.area).toBeCloseTo(510, 4);
    expect(pointInSitePolygon({ x: 10, y: 15 }, envelope.polygon)).toBe(true);
    expect(pointInSitePolygon({ x: 19.5, y: 29 }, envelope.polygon)).toBe(false);
  });

  it("reposiciona a casa para dentro do polígono irregular", () => {
    const placement = normalizeSitePlacement({
      ...DEFAULT_SITE_PLACEMENT,
      setbackFront: 0,
      setbackRear: 0,
      setbackLeft: 0,
      setbackRight: 0,
      lotBoundary: {
        kind: "polygon",
        points: [
          { x: 0, y: 0 },
          { x: 20, y: 0 },
          { x: 14, y: 30 },
          { x: 4, y: 30 },
        ],
      },
    });
    const bounds = { minX: 0, minY: 0, maxX: 6, maxY: 5, width: 6, depth: 5 };
    const clamped = clampBuildingOrigin(14, 24, bounds, 20, 30, placement);
    const envelope = getBuildableEnvelope(20, 30, placement);

    expect(clamped.fits).toBe(true);
    expect([
      { x: clamped.x, y: clamped.y },
      { x: clamped.x + bounds.width, y: clamped.y },
      { x: clamped.x + bounds.width, y: clamped.y + bounds.depth },
      { x: clamped.x, y: clamped.y + bounds.depth },
    ].every((point) => pointInSitePolygon(point, envelope.polygon))).toBe(true);
  });
});

