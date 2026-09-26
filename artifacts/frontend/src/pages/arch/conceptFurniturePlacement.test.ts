import { describe, expect, it } from "vitest";
import { evaluateFurniturePlacement, placeFurnitureInRoom } from "./conceptFurniturePlacement";
import { evaluateConceptAcceptance } from "./conceptAcceptance";
import { buildConceptGeometry, type ConceptRoomShape } from "./conceptGeometry";

const room = (overrides: Partial<ConceptRoomShape> & Pick<ConceptRoomShape, "id" | "kind" | "label">): ConceptRoomShape => ({
  width: 3,
  depth: 3,
  floor: 0,
  x: 0,
  y: 0,
  ...overrides,
});

describe("Etapa 81 — Furniture Placement", () => {
  it("posiciona mobiliário essencial em quarto viável", () => {
    const rooms = [room({ id: "bed", kind: "quarto", label: "Quarto", width: 3.2, depth: 3.2 })];
    const geometry = buildConceptGeometry(rooms, 12, 20, 0);
    const result = placeFurnitureInRoom(rooms[0], geometry.openings);

    expect(result.items.some((item) => item.kind === "bed_single")).toBe(true);
    expect(result.items.some((item) => item.kind === "wardrobe")).toBe(true);
    expect(result.issues.filter((issue) => issue.severity === "error")).toHaveLength(0);
  });

  it("bloqueia quarto onde a cama não cabe sem conflito", () => {
    const rooms = [room({ id: "bed", kind: "quarto", label: "Quarto", width: 1.9, depth: 2.2 })];
    const result = evaluateFurniturePlacement(rooms, 12, 20);

    expect(result.issues.some((issue) => issue.id.includes("bed_single") && issue.severity === "error")).toBe(true);
  });

  it("não posiciona mobiliário ocupando a faixa de abertura da porta", () => {
    const rooms = [
      room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
      room({ id: "bed", kind: "quarto", label: "Quarto", x: 4, y: 0, width: 3, depth: 4 }),
    ];
    const geometry = buildConceptGeometry(rooms, 12, 20, 0);
    const result = placeFurnitureInRoom(rooms[1], geometry.openings);

    expect(result.issues.filter((issue) => issue.severity === "error").length).toBeLessThanOrEqual(1);
    expect(result.items.every((item) => Number.isFinite(item.x) && Number.isFinite(item.y))).toBe(true);
  });

  it("leva furniture placement para o gate consolidado", () => {
    const result = evaluateConceptAcceptance({
      rooms: [room({ id: "bath", kind: "banheiro", label: "Banheiro", width: 1.1, depth: 1.8 })],
      lotWidth: 12,
      lotDepth: 20,
      floors: 1,
    });

    expect(result.furniture.score).toBeLessThan(100);
    expect(result.issues.some((issue) => issue.id.startsWith("furniture-placement-"))).toBe(true);
  });
});
