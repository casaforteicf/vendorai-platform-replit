import { describe, expect, it } from "vitest";
import { evaluateCirculationAndDoorSwing } from "./conceptCirculation";
import { evaluateFurniturePlacement } from "./conceptFurniturePlacement";
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

describe("Etapa 82 — Circulation Path & Door Swing", () => {
  it("marca ambiente desconectado da circulação principal", () => {
    const rooms = [
      room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
      room({ id: "bed", kind: "quarto", label: "Quarto isolado", x: 8, y: 8, width: 3, depth: 3 }),
    ];

    const result = evaluateCirculationAndDoorSwing(rooms, 14, 20);

    expect(result.unreachableRoomIds).toContain("bed");
    expect(result.issues.some((issue) => issue.id === "circulation-unreachable-bed" && issue.severity === "error")).toBe(true);
  });

  it("reconhece conexão por porta entre ambientes adjacentes", () => {
    const rooms = [
      room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
      room({ id: "kitchen", kind: "cozinha", label: "Cozinha", x: 4, y: 0, width: 3, depth: 4 }),
    ];

    const result = evaluateCirculationAndDoorSwing(rooms, 12, 20);

    expect(result.unreachableRoomIds).toHaveLength(0);
    expect(result.reachableRoomIds).toEqual(expect.arrayContaining(["living", "kitchen"]));
  });

  it("usa mobiliário real para detectar conflito de passagem", () => {
    const rooms = [
      room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
      room({ id: "bed", kind: "quarto", label: "Quarto", x: 4, y: 0, width: 3, depth: 4 }),
    ];
    const furniture = evaluateFurniturePlacement(rooms, 12, 20);
    const result = evaluateCirculationAndDoorSwing(rooms, 12, 20, furniture.items);

    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.issues.every((issue) => issue.id.length > 0)).toBe(true);
  });

  it("integra circulação ao acceptance gate", () => {
    const result = evaluateConceptAcceptance({
      rooms: [
        room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
        room({ id: "bed", kind: "quarto", label: "Quarto isolado", x: 8, y: 8, width: 3, depth: 3 }),
      ],
      lotWidth: 14,
      lotDepth: 20,
      floors: 1,
    });

    expect(result.circulation.score).toBeLessThan(100);
    expect(result.issues.some((issue) => issue.id.startsWith("circulation-unreachable-"))).toBe(true);
  });
});
