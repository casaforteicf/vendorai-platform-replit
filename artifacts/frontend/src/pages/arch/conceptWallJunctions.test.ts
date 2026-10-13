import { describe, expect, it } from "vitest";
import { detectWallJunctions } from "./conceptWallJunctions";

const wall = (id: string, floor: number, x1: number, y1: number, x2: number, y2: number) =>
  ({ id, floor, x1, y1, x2, y2, thickness: 0.15 });

describe("Arqdor — junções entre paredes", () => {
  it("identifica cruzamento real", () => {
    expect(detectWallJunctions([wall("a", 0, 0, 2, 4, 2), wall("b", 0, 2, 0, 2, 4)]))
      .toEqual([{ firstWallId: "a", secondWallId: "b", floor: 0, x: 2, y: 2, kind: "crossing" }]);
  });
  it("identifica T e encontro entre extremidades", () => {
    expect(detectWallJunctions([wall("a", 0, 0, 0, 4, 0), wall("b", 0, 2, 0, 2, 3)])[0].kind).toBe("tee");
    expect(detectWallJunctions([wall("a", 0, 0, 0, 4, 0), wall("b", 0, 4, 0, 4, 3)])[0].kind).toBe("endpoint");
  });
  it("não une paredes de pavimentos diferentes", () => {
    expect(detectWallJunctions([wall("a", 0, 0, 2, 4, 2), wall("b", 1, 2, 0, 2, 4)])).toEqual([]);
  });
  it("não inventa junção em segmentos paralelos ou distantes", () => {
    expect(detectWallJunctions([wall("a", 0, 0, 0, 4, 0), wall("b", 0, 1, 1, 3, 1)])).toEqual([]);
  });
  it("ignora geometria degenerada ou inválida", () => {
    expect(detectWallJunctions([wall("a", 0, 0, 0, 0, 0), wall("b", 0, 0, -1, 0, 1)])).toEqual([]);
  });
});
