import { describe, expect, it } from "vitest";
import { validateConceptWalls } from "./conceptWallPreflight";

const wall = { id: "a", floor: 0, x1: 1, y1: 1, x2: 4, y2: 1, thickness: 0.15 };

describe("Arqdor Projeto — pré-validação de paredes", () => {
  it("aceita geometria válida e espessura de 15 cm", () => {
    expect(validateConceptWalls([wall], 12, 25)).toEqual([]);
  });
  it("não modifica a geometria original", () => {
    const original = { ...wall, x2: 20 };
    const snapshot = { ...original };
    expect(validateConceptWalls([original], 12, 25)).toContainEqual({ wallId: "a", code: "OUTSIDE_LOT" });
    expect(original).toEqual(snapshot);
  });
  it("bloqueia lote inválido, evitando falsa validação", () => {
    expect(validateConceptWalls([wall], 0, 25)).toEqual([{ wallId: "", code: "INVALID_LOT" }]);
  });
  it("identifica duplicidades, segmentos degenerados e espessuras inválidas", () => {
    const issues = validateConceptWalls([wall, { ...wall, x2: 1, thickness: 0.7 }], 12, 25);
    expect(issues.map((issue) => issue.code)).toEqual(["DUPLICATE_ID", "ZERO_LENGTH", "INVALID_THICKNESS"]);
  });
  it("rejeita coordenadas não finitas sem tentar corrigi-las", () => {
    expect(validateConceptWalls([{ ...wall, x1: Number.NaN }], 12, 25))
      .toEqual([{ wallId: "a", code: "INVALID_COORDINATE" }]);
  });
  it("permite parede dentro da margem de tolerância numérica", () => {
    expect(validateConceptWalls([{ ...wall, x2: 12.0004 }], 12, 25)).toEqual([]);
  });
});
