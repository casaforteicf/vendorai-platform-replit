import { describe, expect, it } from "vitest";
import { buildConceptWallDiagnostics } from "./conceptWallDiagnostics";
const wall = (id: string, x1: number, y1: number, x2: number, y2: number) =>
  ({ id, floor: 0, x1, y1, x2, y2, thickness: 0.15 });
describe("Arqdor — diagnóstico agregado da planta", () => {
  it("reúne conflitos e ids sem alterar o modelo", () => {
    const walls = [wall("a", 0, 0, 5, 0), wall("b", 3, 0, 7, 0)];
    const before = JSON.stringify(walls);
    const result = buildConceptWallDiagnostics(walls, { width: 10, depth: 10 });
    expect(result.overlaps).toHaveLength(1);
    expect(result.affectedWallIds).toEqual(["a", "b"]);
    expect(result.hasBlockingIssues).toBe(true);
    expect(JSON.stringify(walls)).toBe(before);
  });
  it("não considera cruzamento válido como conflito bloqueante", () => {
    const result = buildConceptWallDiagnostics([wall("a", 0, 2, 4, 2), wall("b", 2, 0, 2, 4)], { width: 10, depth: 10 });
    expect(result.junctions[0].kind).toBe("crossing");
    expect(result.hasBlockingIssues).toBe(false);
  });
  it("marca parede fora do lote com o mesmo id", () => {
    const result = buildConceptWallDiagnostics([wall("x", 1, 1, 12, 1)], { width: 10, depth: 10 });
    expect(result.issues[0].code).toBe("OUTSIDE_LOT");
    expect(result.affectedWallIds).toEqual(["x"]);
  });
});
