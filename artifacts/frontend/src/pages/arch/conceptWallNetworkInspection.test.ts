import { describe, expect, it } from "vitest";
import { inspectWallNetwork } from "./conceptWallNetworkInspection";
const wall = (id: string, floor: number, x1: number, y1: number, x2: number, y2: number) =>
  ({ id, floor, x1, y1, x2, y2, thickness: 0.15 });
describe("Arqdor Projeto — inspeção da malha arquitetônica", () => {
  it("detecta sobreposição parcial e preserva medidas", () => {
    const walls = [wall("a", 0, 0, 0, 5, 0), wall("b", 0, 3, 0, 8, 0)];
    const before = JSON.stringify(walls);
    const result = inspectWallNetwork(walls);
    expect(result.overlaps).toHaveLength(1);
    expect(result.overlaps[0]).toMatchObject({ firstWallId: "a", secondWallId: "b", length: 2, start: { x: 3, y: 0 }, end: { x: 5, y: 0 } });
    expect(JSON.stringify(walls)).toBe(before);
  });
  it("detecta linhas invertidas e uma parede contida em outra", () => {
    expect(inspectWallNetwork([wall("a", 0, 5, 0, 0, 0), wall("b", 0, 1, 0, 3, 0)]).overlaps[0].length).toBeCloseTo(2);
  });
  it("não acusa toque pela extremidade como sobreposição", () => {
    expect(inspectWallNetwork([wall("a", 0, 0, 0, 3, 0), wall("b", 0, 3, 0, 5, 0)]).overlaps).toEqual([]);
  });
  it("não mistura pavimentos ou linhas paralelas afastadas", () => {
    expect(inspectWallNetwork([wall("a", 0, 0, 0, 5, 0), wall("b", 1, 2, 0, 4, 0), wall("c", 0, 1, 1, 3, 1)]).overlaps).toEqual([]);
  });
  it("reporta encontros no mesmo relatório", () => {
    expect(inspectWallNetwork([wall("a", 0, 0, 2, 4, 2), wall("b", 0, 2, 0, 2, 4)]).junctions[0].kind).toBe("crossing");
  });
  it("rejeita tolerância inválida", () => {
    expect(() => inspectWallNetwork([], 0)).toThrow("INVALID_WALL_TOLERANCE");
  });
});
