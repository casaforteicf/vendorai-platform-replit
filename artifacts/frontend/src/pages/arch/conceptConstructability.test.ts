import { describe, expect, it } from "vitest";
import { evaluateConstructability } from "./conceptConstructability";
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

describe("Etapa 85 — Structural & Constructability Intelligence", () => {
  it("sinaliza vão preliminar excessivo", () => {
    const result = evaluateConstructability([
      room({ id: "living", kind: "sala", label: "Sala ampla", width: 9.5, depth: 4 }),
    ]);

    expect(result.issues.some((issue) => issue.id === "constructability-long-span-living")).toBe(true);
  });

  it("sinaliza áreas molhadas muito dispersas", () => {
    const result = evaluateConstructability([
      room({ id: "kitchen", kind: "cozinha", label: "Cozinha", x: 0, y: 0 }),
      room({ id: "bath", kind: "banheiro", label: "Banheiro", x: 10, y: 10 }),
    ]);

    expect(result.issues.some((issue) => issue.id.startsWith("constructability-wet-dispersed-"))).toBe(true);
  });

  it("sinaliza área molhada superior longe de prumada inferior", () => {
    const result = evaluateConstructability([
      room({ id: "lower-bath", kind: "banheiro", label: "Banheiro térreo", floor: 0, x: 0, y: 0 }),
      room({ id: "upper-bath", kind: "banheiro", label: "Banheiro superior", floor: 1, x: 8, y: 8 }),
    ]);

    expect(result.issues.some((issue) => issue.id === "constructability-wet-stack-upper-bath")).toBe(true);
  });

  it("integra construtibilidade ao acceptance gate", () => {
    const result = evaluateConceptAcceptance({
      lotWidth: 14,
      lotDepth: 20,
      floors: 1,
      rooms: [
        room({ id: "living", kind: "sala", label: "Sala ampla", width: 9.5, depth: 4 }),
      ],
    });

    expect(result.constructability.score).toBeLessThan(100);
    expect(result.issues.some((issue) => issue.id.startsWith("constructability-long-span-"))).toBe(true);
  });
});
