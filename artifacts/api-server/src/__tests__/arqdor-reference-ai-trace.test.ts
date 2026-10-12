import { describe, expect, it } from "vitest";
import { normalizeReferenceTrace } from "../lib/arqdor-reference-ai-trace.js";

describe("Arqdor reference AI trace normalization", () => {
  it("aplica 15 cm quando IA omite espessura e preserva espessuras medidas", () => {
    const result = normalizeReferenceTrace({
      walls: [
        { x1: 0.1, y1: 0.2, x2: 0.9, y2: 0.2, confidence: 0.9 },
        { x1: 0.1, y1: 0.5, x2: 0.9, y2: 0.5, thickness: 0.2, confidence: 0.9 },
      ], openings: [],
    }, { x: 0, y: 0, width: 10, depth: 10 }, "test-model");
    expect(result.walls[0]?.thickness).toBe(0.15);
    expect(result.walls[1]?.thickness).toBe(0.2);
  });

  it("converte coordenadas normalizadas para metros calibrados", () => {
    const result = normalizeReferenceTrace({
      summary: "ok",
      confidence: 0.9,
      walls: [
        { x1: 0.1, y1: 0.2, x2: 0.9, y2: 0.2, thickness: 0.15, confidence: 0.95 },
      ],
      openings: [
        { wallIndex: 0, type: "door", offset: 0.5, width: 0.9, height: 2.1, sillHeight: 0, confidence: 0.9 },
      ],
      warnings: [],
    }, { x: 2, y: 3, width: 10, depth: 8 }, "test-model");

    expect(result.walls).toHaveLength(1);
    expect(result.walls[0]).toMatchObject({ x1: 3, y1: 4.6, x2: 11, y2: 4.6 });
    expect(result.openings).toHaveLength(1);
    expect(result.openings[0]?.wallId).toBe(result.walls[0]?.id);
    expect(result.confidence).toBe(0.9);
  });

  it("ignora cotas e limites do terreno mesmo quando a IA os envia junto das paredes", () => {
    const result = normalizeReferenceTrace({
      walls: [
        { kind: "wall", x1: 0.2, y1: 0.3, x2: 0.8, y2: 0.3, confidence: 0.95 },
        { kind: "dimension", x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.1, confidence: 0.99 },
        { kind: "site_boundary", x1: 0.95, y1: 0.1, x2: 0.95, y2: 0.9, confidence: 0.99 },
      ],
      openings: [],
    }, { x: 0, y: 0, width: 10, depth: 10 }, "test-model");

    expect(result.walls).toHaveLength(1);
    expect(result.ignoredNonWallSegments).toBe(2);
    expect(result.warnings.some((warning) => warning.includes("não viraram paredes"))).toBe(true);
  });

  it("descarta segmentos muito diagonais", () => {
    const result = normalizeReferenceTrace({
      walls: [{ x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.9, confidence: 0.8 }],
      openings: [],
    }, { x: 0, y: 0, width: 10, depth: 10 }, "test-model");

    expect(result.walls).toHaveLength(0);
    expect(result.skippedWalls).toBe(1);
  });
  it("encaixa extremidade próxima em uma parede perpendicular sem redesenhar a planta", () => {
    const result = normalizeReferenceTrace({
      walls: [
        { x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.2, confidence: 0.9 },
        { x1: 0.505, y1: 0.19, x2: 0.505, y2: 0.8, confidence: 0.9 },
      ],
      openings: [],
    }, { x: 0, y: 0, width: 10, depth: 10 }, "test-model");

    expect(result.walls).toHaveLength(2);
    expect(result.topologyRepairs).toBeGreaterThan(0);
    expect(result.walls[0]?.x2).toBeCloseTo(result.walls[1]?.x1 ?? 0, 3);
    expect(result.walls[0]?.y2).toBeCloseTo(2, 3);
  });
});
