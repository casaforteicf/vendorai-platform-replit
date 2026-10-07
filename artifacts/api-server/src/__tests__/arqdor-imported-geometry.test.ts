import { describe, expect, it } from "vitest";
import { importedFloorPlanToEditableGeometry } from "../lib/arqdor-imported-geometry.js";

describe("Arqdor imported project geometry", () => {
  it("converte coordenadas normalizadas em paredes métricas e vincula abertura", () => {
    const preview = importedFloorPlanToEditableGeometry({
      page: 1,
      label: "Planta baixa térreo",
      confidence: 0.95,
      widthMeters: 10,
      depthMeters: 8,
      requiresCalibration: false,
      walls: [
        { id: "w-a", x1: 0.1, y1: 0.1, x2: 0.9, y2: 0.1, thickness: 0.15, classification: "external", confidence: 0.97, evidence: ["cota 8,00m"] },
        { id: "w-b", x1: 0.9, y1: 0.1, x2: 0.9, y2: 0.9, thickness: 0.15, classification: "external", confidence: 0.96 },
        { id: "w-c", x1: 0.9, y1: 0.9, x2: 0.1, y2: 0.9, thickness: 0.15, classification: "external", confidence: 0.96 },
        { id: "w-d", x1: 0.1, y1: 0.9, x2: 0.1, y2: 0.1, thickness: 0.15, classification: "external", confidence: 0.96 },
      ],
      openings: [
        { code: "J04", wallIndex: 0, type: "window", offset: 0.5, width: 1.2, height: 2.2, sillHeight: 0.7, confidence: 0.99 },
      ],
      rooms: [
        { id: "sala", label: "Sala de Estar", areaM2: 30, centroid: { x: 0.5, y: 0.5 } },
      ],
      dimensions: [],
      warnings: [],
    });

    expect(preview.canApply).toBe(true);
    expect(preview.walls).toHaveLength(4);
    expect(preview.walls[0]).toMatchObject({ id: "w-a", x1: 1, y1: 0.8, x2: 9, y2: 0.8 });
    expect(preview.openings[0]).toMatchObject({ wallId: "w-a", code: "J04", width: 1.2, height: 2.2, sillHeight: 0.7 });
    expect(preview.spaces[0]?.centroid).toEqual({ x: 5, y: 4 });
  });

  it("bloqueia aplicação quando a escala real ainda não é conhecida", () => {
    const preview = importedFloorPlanToEditableGeometry({
      page: 1,
      label: "Planta sem cota geral",
      confidence: 0.9,
      widthMeters: null,
      depthMeters: null,
      requiresCalibration: true,
      walls: [{ x1: 0, y1: 0, x2: 1, y2: 0, confidence: 0.9 }],
      openings: [],
      rooms: [],
      dimensions: [],
      warnings: [],
    });

    expect(preview.requiresCalibration).toBe(true);
    expect(preview.canApply).toBe(false);
    expect(preview.walls).toHaveLength(0);
  });

  it("encaixa encontros próximos sem redesenhar a planta", () => {
    const preview = importedFloorPlanToEditableGeometry({
      page: 1,
      confidence: 0.9,
      widthMeters: 10,
      depthMeters: 10,
      requiresCalibration: false,
      walls: [
        { x1: 0.1, y1: 0.1, x2: 0.5, y2: 0.1, confidence: 0.9 },
        { x1: 0.505, y1: 0.1, x2: 0.505, y2: 0.5, confidence: 0.9 },
        { x1: 0.505, y1: 0.5, x2: 0.1, y2: 0.5, confidence: 0.9 },
      ],
      openings: [],
      rooms: [],
      dimensions: [],
      warnings: [],
    });

    expect(preview.topologyRepairs).toBeGreaterThan(0);
    expect(preview.canApply).toBe(true);
  });
});
