import { describe, expect, it } from "vitest";
import { runIterativeArchitecturalSearch } from "./conceptIterativeSearch";
import type { ConceptRoomShape } from "./conceptGeometry";

const room = (overrides: Partial<ConceptRoomShape> & Pick<ConceptRoomShape, "id" | "kind" | "label">): ConceptRoomShape => ({
  width: 3,
  depth: 3,
  floor: 0,
  x: 0,
  y: 0,
  ...overrides,
});

describe("Etapa 89 — Iterative Search & Learning Loop", () => {
  it("executa múltiplas gerações dentro do limite configurado", () => {
    const result = runIterativeArchitecturalSearch({
      lotWidth: 14,
      lotDepth: 20,
      floors: 1,
      maxGenerations: 3,
      seedsPerGeneration: 2,
      neighborhoodSize: 6,
      rooms: [
        room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
        room({ id: "kitchen", kind: "cozinha", label: "Cozinha", x: 4, y: 0, width: 3, depth: 4 }),
        room({ id: "bed", kind: "quarto", label: "Quarto", x: 0, y: 4, width: 3.2, depth: 3.2 }),
      ],
      intent: { livingIntegratedKitchen: true },
    });

    expect(result.generations.length).toBeGreaterThan(0);
    expect(result.generations.length).toBeLessThanOrEqual(3);
    expect(["max_generations", "converged", "no_candidates"]).toContain(result.stoppedReason);
  });

  it("mantém score recomendado não pior que a primeira geração útil quando há refinamento", () => {
    const result = runIterativeArchitecturalSearch({
      lotWidth: 14,
      lotDepth: 20,
      floors: 1,
      maxGenerations: 4,
      neighborhoodSize: 8,
      rooms: [
        room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
        room({ id: "kitchen", kind: "cozinha", label: "Cozinha", x: 7, y: 0, width: 3, depth: 4 }),
        room({ id: "bed", kind: "quarto", label: "Quarto", x: 0, y: 5, width: 3, depth: 3 }),
      ],
      intent: { livingIntegratedKitchen: true },
    });

    const first = result.generations[0]?.bestBalanceScore ?? 0;
    const final = result.recommended?.balanceScore ?? 0;
    expect(final).toBeGreaterThanOrEqual(first);
  });

  it("preserva ambientes locked ao longo das gerações", () => {
    const locked = room({ id: "locked", kind: "sala", label: "Sala", x: 1, y: 1, width: 4, depth: 4, locked: true });
    const result = runIterativeArchitecturalSearch({
      lotWidth: 14,
      lotDepth: 20,
      floors: 1,
      maxGenerations: 2,
      rooms: [
        locked,
        room({ id: "bed", kind: "quarto", label: "Quarto", x: 5, y: 1, width: 3, depth: 3 }),
      ],
    });

    const current = result.recommended?.rooms.find((item) => item.id === "locked");
    expect(current?.x).toBe(locked.x);
    expect(current?.y).toBe(locked.y);
    expect(current?.width).toBe(locked.width);
    expect(current?.depth).toBe(locked.depth);
  });

  it("não prefere solução bloqueada quando existe candidata utilizável", () => {
    const result = runIterativeArchitecturalSearch({
      lotWidth: 14,
      lotDepth: 20,
      floors: 1,
      maxGenerations: 2,
      rooms: [
        room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
        room({ id: "kitchen", kind: "cozinha", label: "Cozinha", x: 4, y: 0, width: 3, depth: 4 }),
      ],
    });

    if (result.paretoFront.some((candidate) => candidate.acceptance.status !== "blocked")) {
      expect(result.recommended?.acceptance.status).not.toBe("blocked");
    }
  });
});
