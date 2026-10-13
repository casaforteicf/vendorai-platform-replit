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
  it("reporta espessura inválida mesmo com coordenada não finita", () => {
    const invalid = { ...wall, x1: Number.NaN, thickness: 0.7 };
    expect(validateConceptWalls([invalid], 12, 25)).toEqual([
      { wallId: "a", code: "INVALID_COORDINATE" },
      { wallId: "a", code: "INVALID_THICKNESS" },
    ]);
    expect(invalid.thickness).toBe(0.7);
  });
  it("distingue identificador vazio de identificador duplicado", () => {
    expect(validateConceptWalls([{ ...wall, id: "" }], 12, 25))
      .toContainEqual({ wallId: "", code: "INVALID_WALL_ID" });
    expect(validateConceptWalls([wall, { ...wall }], 12, 25))
      .toContainEqual({ wallId: "a", code: "DUPLICATE_ID" });
  });
  it("não aceita pavimentos não inteiros, negativos ou não finitos", () => {
    for (const floor of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(validateConceptWalls([{ ...wall, floor }], 12, 25))
        .toContainEqual({ wallId: "a", code: "INVALID_FLOOR" });
    }
  });
  it("recusa tolerância inválida em vez de produzir aprovação enganosa", () => {
    for (const tolerance of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 0.02, 5]) {
      expect(validateConceptWalls([wall], 12, 25, tolerance))
        .toEqual([{ wallId: "", code: "INVALID_TOLERANCE" }]);
    }
  });
  it("identifica segmentos com comprimento abaixo da tolerância", () => {
    expect(validateConceptWalls([{ ...wall, x2: 1.0005 }], 12, 25, 0.001))
      .toContainEqual({ wallId: "a", code: "ZERO_LENGTH" });
  });
  it("detecta parede que ultrapassa o lote com suas faces, mesmo com eixo interno", () => {
    const nearEdge = { ...wall, y1: 0.04, y2: 0.04, thickness: 0.15 };
    expect(validateConceptWalls([nearEdge], 12, 25))
      .toContainEqual({ wallId: "a", code: "OUTSIDE_LOT" });
  });
  it("não mascara violação dos limites quando duas paredes têm o mesmo ID", () => {
    const first = { ...wall, x2: 15, y1: 1, y2: 1 };
    const second = { ...wall, y1: 0.04, y2: 0.04 };
    const issues = validateConceptWalls([first, second], 12, 25);
    expect(issues.filter((issue) => issue.code === "OUTSIDE_LOT")).toHaveLength(2);
    expect(issues).toContainEqual({ wallId: "a", code: "DUPLICATE_ID" });
  });
  it("mantém parede afastada das bordas válida com espessura real", () => {
    expect(validateConceptWalls([{ ...wall, y1: 0.2, y2: 0.2 }], 12, 25)).toEqual([]);
  });
  it("permite parede dentro da margem de tolerância numérica", () => {
    expect(validateConceptWalls([{ ...wall, x2: 12.0004 }], 12, 25)).toEqual([]);
  });
});
