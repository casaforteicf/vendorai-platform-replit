import { describe, expect, it } from "vitest";
import { generateArchitecturalSearchNeighborhood } from "./conceptArchitecturalSearch";
import { optimizeArchitecturalCandidates } from "./conceptMultiObjectiveOptimizer";
import type { ConceptRoomShape } from "./conceptGeometry";

const room = (overrides: Partial<ConceptRoomShape> & Pick<ConceptRoomShape, "id" | "kind" | "label">): ConceptRoomShape => ({
  width: 3,
  depth: 3,
  floor: 0,
  x: 0,
  y: 0,
  ...overrides,
});

describe("Etapa 88 — Architectural Search Engine", () => {
  it("gera vizinhanças controladas sem ultrapassar o limite configurado", () => {
    const result = generateArchitecturalSearchNeighborhood({
      lotWidth: 14,
      lotDepth: 20,
      maxCandidates: 10,
      rooms: [
        room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
        room({ id: "kitchen", kind: "cozinha", label: "Cozinha", x: 4, y: 0, width: 3, depth: 4 }),
        room({ id: "bed", kind: "quarto", label: "Quarto", x: 0, y: 4, width: 3, depth: 3 }),
      ],
    });

    expect(result.length).toBeGreaterThan(0);
    expect(result.length).toBeLessThanOrEqual(10);
  });

  it("preserva ambientes locked", () => {
    const locked = room({ id: "locked", kind: "sala", label: "Sala", x: 1, y: 1, width: 4, depth: 4, locked: true });
    const result = generateArchitecturalSearchNeighborhood({
      lotWidth: 14,
      lotDepth: 20,
      rooms: [
        locked,
        room({ id: "bed", kind: "quarto", label: "Quarto", x: 5, y: 1, width: 3, depth: 3 }),
      ],
    });

    expect(result.every((candidate) => {
      const current = candidate.rooms.find((item) => item.id === "locked");
      return current?.x === locked.x
        && current?.y === locked.y
        && current?.width === locked.width
        && current?.depth === locked.depth;
    })).toBe(true);
  });

  it("mantém todos os ambientes dentro do lote", () => {
    const result = generateArchitecturalSearchNeighborhood({
      lotWidth: 10,
      lotDepth: 12,
      rooms: [
        room({ id: "living", kind: "sala", label: "Sala", x: 0.5, y: 0.5, width: 4, depth: 4 }),
        room({ id: "bed", kind: "quarto", label: "Quarto", x: 4.5, y: 0.5, width: 3, depth: 3 }),
      ],
    });

    expect(result.every((candidate) => candidate.rooms.every((item) =>
      item.x >= 0
      && item.y >= 0
      && item.x + item.width <= 10.05
      && item.y + item.depth <= 12.05
    ))).toBe(true);
  });

  it("amplia o conjunto de candidatos do otimizador", () => {
    const result = optimizeArchitecturalCandidates({
      lotWidth: 14,
      lotDepth: 20,
      floors: 1,
      variantsPerFloor: 2,
      searchCandidates: 8,
      rooms: [
        room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
        room({ id: "kitchen", kind: "cozinha", label: "Cozinha", x: 4, y: 0, width: 3, depth: 4 }),
        room({ id: "bed", kind: "quarto", label: "Quarto", x: 0, y: 4, width: 3.2, depth: 3.2 }),
      ],
    });

    expect(result.candidates.length).toBeGreaterThan(2);
    expect(result.paretoFront.length).toBeGreaterThan(0);
  });
});
