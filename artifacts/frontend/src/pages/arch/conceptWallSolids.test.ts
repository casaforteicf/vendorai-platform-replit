import { describe, expect, it } from "vitest";
import { prepareWallSolids } from "./conceptWallSolids";

const wall = { id: "w1", floor: 0, x1: 0, y1: 0, x2: 4, y2: 0, thickness: 0.15, height: 3 };

describe("paredes 3D com vãos reais", () => {
  it("representa parede sem aberturas como um volume", () => {
    const result = prepareWallSolids([wall], []);
    expect(result.warnings).toEqual([]);
    expect(result.boxes).toEqual([{ wallId: "w1", floor: 0, x: 0, y: -0.075, z: 0, width: 4, depth: 0.15, height: 3 }]);
  });

  it("abre porta do piso e mantém faixa acima da verga", () => {
    const result = prepareWallSolids([wall], [{ id: "p1", wallId: "w1", floor: 0, offset: 0.5, width: 1, height: 2.1 }]);
    expect(result.warnings).toEqual([]);
    expect(result.boxes).toHaveLength(4);
    const central = result.boxes.filter((b) => b.x === 1.5);
    expect(central).toEqual([{ wallId: "w1", floor: 0, x: 1.5, y: -0.075, z: 2.1, width: 1, depth: 0.15, height: 0.9 }]);
  });

  it("preserva peitoril e verga de janela", () => {
    const result = prepareWallSolids([wall], [{ id: "j1", wallId: "w1", floor: 0, offset: 0.5, width: 1, height: 1.2, sillHeight: 0.9 }]);
    expect(result.boxes.filter((b) => b.x === 1.5).map((b) => [b.z,b.height])).toEqual([[0,0.9],[2.1,0.9]]);
  });

  it("recusa abertura fora da parede e sobreposição sem recorte oculto", () => {
    const result = prepareWallSolids([wall], [
      { id: "outside", wallId: "w1", floor: 0, offset: 0, width: 1, height: 2 },
      { id: "a", wallId: "w1", floor: 0, offset: 0.5, width: 1, height: 2 },
      { id: "b", wallId: "w1", floor: 0, offset: 0.55, width: 1, height: 2 },
    ]);
    expect(result.warnings).toContain("OPENING_OUTSIDE_WALL:outside");
    expect(result.warnings).toContain("OPENING_OVERLAP:b");
  });

  it("suporta parede vertical invertida, pavimento e elevação", () => {
    const result = prepareWallSolids([
      { ...wall, floor: 1, x1: 2, y1: 4, x2: 2, y2: 0, baseElevation: 3 },
    ], []);
    expect(result.boxes[0]).toMatchObject({ floor: 1, x: 1.925, y: 0, z: 3, width: 0.15, depth: 4, height: 3 });
  });

  it("recusa diagonais sem inventar volume ortogonal", () => {
    const result = prepareWallSolids([{...wall, x2: 3, y2: 2}],[]);
    expect(result.boxes).toEqual([]);
    expect(result.warnings).toContain("WALL_INVALID:w1");
  });
});
