import { describe, expect, it } from "vitest";
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

describe("Etapa 87 — Multi-objective Architectural Optimizer", () => {
  it("gera candidatos e identifica Pareto front", () => {
    const result = optimizeArchitecturalCandidates({
      lotWidth: 14,
      lotDepth: 20,
      floors: 1,
      rooms: [
        room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
        room({ id: "kitchen", kind: "cozinha", label: "Cozinha", x: 4, y: 0, width: 3, depth: 4 }),
        room({ id: "bed", kind: "quarto", label: "Quarto", x: 0, y: 4, width: 3.2, depth: 3.2 }),
      ],
      intent: { livingIntegratedKitchen: true },
    });

    expect(result.candidates.length).toBeGreaterThan(0);
    expect(result.paretoFront.length).toBeGreaterThan(0);
    expect(result.paretoFront.every((candidate) => candidate.paretoEfficient)).toBe(true);
  });

  it("não recomenda candidato bloqueado quando existe alternativa utilizável", () => {
    const result = optimizeArchitecturalCandidates({
      lotWidth: 14,
      lotDepth: 20,
      floors: 1,
      rooms: [
        room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
        room({ id: "kitchen", kind: "cozinha", label: "Cozinha", x: 4, y: 0, width: 3, depth: 4 }),
      ],
    });

    if (result.paretoFront.some((candidate) => candidate.acceptance.status !== "blocked")) {
      expect(result.recommended?.acceptance.status).not.toBe("blocked");
    }
  });

  it("expõe vetor completo de objetivos e trade-offs", () => {
    const result = optimizeArchitecturalCandidates({
      lotWidth: 12,
      lotDepth: 18,
      floors: 1,
      rooms: [
        room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
        room({ id: "garage", kind: "garagem", label: "Garagem", x: 4, y: 0, width: 5.5, depth: 5.5 }),
        room({ id: "bed", kind: "quarto", label: "Quarto", x: 0, y: 4, width: 3, depth: 3 }),
      ],
      intent: { privateAwaySocial: true },
    });

    const candidate = result.candidates[0];
    expect(candidate.objectives).toMatchObject({
      technical: expect.any(Number),
      intent: expect.any(Number),
      ergonomics: expect.any(Number),
      furniture: expect.any(Number),
      circulation: expect.any(Number),
      climate: expect.any(Number),
      privacyAcoustic: expect.any(Number),
      constructability: expect.any(Number),
      buildability: expect.any(Number),
      costEfficiency: expect.any(Number),
    });
    expect(Array.isArray(candidate.tradeoffs)).toBe(true);
  });

  it("mantém score de equilíbrio limitado a 0..100", () => {
    const result = optimizeArchitecturalCandidates({
      lotWidth: 10,
      lotDepth: 15,
      floors: 1,
      rooms: [room({ id: "living", kind: "sala", label: "Sala", width: 4, depth: 4 })],
    });

    expect(result.candidates.every((candidate) => candidate.balanceScore >= 0 && candidate.balanceScore <= 100)).toBe(true);
  });
});
