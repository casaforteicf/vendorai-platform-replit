import { describe, expect, it } from "vitest";
import { evaluateDaylightVentilationSolar } from "./conceptClimatePerformance";
import { evaluateConceptAcceptance } from "./conceptAcceptance";
import type { ConceptRoomShape } from "./conceptGeometry";

const room = (overrides: Partial<ConceptRoomShape> & Pick<ConceptRoomShape, "id" | "kind" | "label">): ConceptRoomShape => ({
  width: 3,
  depth: 3,
  floor: 0,
  x: 0,
  y: 0,
  ...overrides,
});

describe("Etapa 83 — Daylight, Ventilation & Solar Orientation Gate", () => {
  it("marca ambiente habitável sem janela externa", () => {
    const rooms = [
      room({ id: "outer", kind: "sala", label: "Sala", x: 0, y: 0, width: 8, depth: 3 }),
      room({ id: "left", kind: "circulacao", label: "Circulação esquerda", x: 0, y: 3, width: 2.5, depth: 3 }),
      room({ id: "inner", kind: "quarto", label: "Quarto interno", x: 2.5, y: 3, width: 3, depth: 3 }),
      room({ id: "right", kind: "circulacao", label: "Circulação direita", x: 5.5, y: 3, width: 2.5, depth: 3 }),
      room({ id: "bottom", kind: "sala", label: "Sala fundos", x: 0, y: 6, width: 8, depth: 3 }),
    ];

    const result = evaluateDaylightVentilationSolar(rooms, 12, 12);

    expect(result.issues.some((issue) => issue.id === "daylight-no-window-inner")).toBe(true);
  });

  it("não inventa orientação solar quando o norte não foi informado", () => {
    const rooms = [room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 })];
    const result = evaluateDaylightVentilationSolar(rooms, 12, 20);

    expect(result.solarAnalysis).toBe("insufficient_data");
    expect(result.issues.some((issue) => issue.id === "solar-insufficient-orientation")).toBe(true);
  });

  it("faz análise solar quando a orientação norte está disponível", () => {
    const rooms = [room({ id: "bed", kind: "quarto", label: "Quarto", x: 0, y: 0, width: 3.2, depth: 3.2 })];
    const result = evaluateDaylightVentilationSolar(rooms, 12, 20, {
      frontSide: "top",
      northSide: "top",
    });

    expect(result.solarAnalysis).toBe("available");
    expect(result.rooms[0].solarExposure).toBeDefined();
  });

  it("integra iluminação/ventilação no quality gate sem bloquear por falta de norte", () => {
    const result = evaluateConceptAcceptance({
      lotWidth: 12,
      lotDepth: 20,
      floors: 1,
      rooms: [room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 })],
      site: { frontSide: "top", northSide: null },
    });

    expect(result.climate.solarAnalysis).toBe("insufficient_data");
    expect(result.issues.some((issue) => issue.id === "solar-insufficient-orientation")).toBe(false);
  });
});
