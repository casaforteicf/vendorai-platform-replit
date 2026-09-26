import { describe, expect, it } from "vitest";
import { evaluateBuildabilityCost } from "./conceptBuildabilityCost";
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

describe("Etapa 86 — Cost & Buildability Optimization", () => {
  it("penaliza forma pouco compacta com alto perímetro relativo", () => {
    const result = evaluateBuildabilityCost([
      room({ id: "a", kind: "sala", label: "Sala", x: 0, y: 0, width: 2, depth: 8 }),
      room({ id: "b", kind: "quarto", label: "Quarto", x: 6, y: 0, width: 2, depth: 8 }),
    ]);

    expect(result.costIndex).toBeGreaterThan(100);
    expect(result.issues.some((issue) => issue.id === "buildability-high-perimeter")).toBe(true);
  });

  it("premia solução mais compacta", () => {
    const compact = evaluateBuildabilityCost([
      room({ id: "a", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
      room({ id: "b", kind: "quarto", label: "Quarto", x: 4, y: 0, width: 3, depth: 4 }),
    ]);
    const fragmented = evaluateBuildabilityCost([
      room({ id: "a", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
      room({ id: "b", kind: "quarto", label: "Quarto", x: 8, y: 0, width: 3, depth: 4 }),
    ]);

    expect(compact.costIndex).toBeLessThanOrEqual(fragmented.costIndex);
  });

  it("penaliza desalinhamento relevante entre pavimentos", () => {
    const result = evaluateBuildabilityCost([
      room({ id: "lower", kind: "sala", label: "Sala", floor: 0, x: 0, y: 0, width: 5, depth: 5 }),
      room({ id: "upper", kind: "suite", label: "Suíte", floor: 1, x: 8, y: 8, width: 4, depth: 4 }),
    ]);

    expect(result.metrics.upperFloorMisalignment).toBeGreaterThan(0);
    expect(result.issues.some((issue) => issue.id === "buildability-upper-misalignment")).toBe(true);
  });

  it("integra eficiência construtiva ao acceptance gate", () => {
    const result = evaluateConceptAcceptance({
      lotWidth: 16,
      lotDepth: 20,
      floors: 1,
      rooms: [
        room({ id: "a", kind: "sala", label: "Sala", x: 0, y: 0, width: 2, depth: 8 }),
        room({ id: "b", kind: "quarto", label: "Quarto", x: 6, y: 0, width: 2, depth: 8 }),
      ],
    });

    expect(result.buildability.costIndex).toBeGreaterThan(100);
    expect(result.issues.some((issue) => issue.id.startsWith("buildability-"))).toBe(true);
  });
});
