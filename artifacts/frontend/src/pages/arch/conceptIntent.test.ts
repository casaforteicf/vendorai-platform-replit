import { describe, expect, it } from "vitest";
import { evaluateConceptIntent } from "./conceptIntent";
import type { ConceptRoomShape } from "./conceptGeometry";

const room = (overrides: Partial<ConceptRoomShape> & Pick<ConceptRoomShape, "id" | "kind" | "label">): ConceptRoomShape => ({
  width: 3,
  depth: 3,
  floor: 0,
  x: 0,
  y: 0,
  ...overrides,
});

describe("Etapa 79 — Intent Gate", () => {
  it("penaliza sala e cozinha separadas quando o briefing pede integração", () => {
    const result = evaluateConceptIntent([
      room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
      room({ id: "kitchen", kind: "cozinha", label: "Cozinha", x: 8, y: 0, width: 3, depth: 4 }),
    ], { livingIntegratedKitchen: true });

    expect(result.score).toBeLessThan(100);
    expect(result.issues.some((issue) => issue.id === "intent-living-kitchen-direct")).toBe(true);
  });

  it("reconhece integração direta entre sala e cozinha", () => {
    const result = evaluateConceptIntent([
      room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
      room({ id: "kitchen", kind: "cozinha", label: "Cozinha", x: 4, y: 0, width: 3, depth: 4 }),
    ], { livingIntegratedKitchen: true });

    expect(result.score).toBe(100);
    expect(result.strengths.some((item) => item.includes("integração"))).toBe(true);
  });

  it("penaliza área íntima muito próxima da garagem quando privacidade é prioridade", () => {
    const result = evaluateConceptIntent([
      room({ id: "suite", kind: "suite", label: "Suíte", x: 0, y: 0, width: 4, depth: 4 }),
      room({ id: "garage", kind: "garagem", label: "Garagem", x: 4, y: 0, width: 5.5, depth: 5.5 }),
    ], { privateAwaySocial: true });

    expect(result.issues.some((issue) => issue.id === "intent-private-away-social")).toBe(true);
  });

  it("considera aderência à área desejada", () => {
    const result = evaluateConceptIntent([
      room({ id: "living", kind: "sala", label: "Sala", x: 0, y: 0, width: 4, depth: 4 }),
      room({ id: "bed", kind: "quarto", label: "Quarto", x: 4, y: 0, width: 3, depth: 3 }),
    ], { desiredAreaTotal: 160 });

    expect(result.score).toBeLessThan(100);
    expect(result.issues.some((issue) => issue.id === "intent-area-target")).toBe(true);
  });
});
