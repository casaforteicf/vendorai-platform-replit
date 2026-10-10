import { describe, expect, it } from "vitest";
import { uniqueFurnitureLayouts } from "./conceptFurnitureLayoutOptions";
const a = { id: "a", kind: "bed", floor: 0, x: 1, y: 1, width: 2, depth: 1, rotation: 0 };
describe("distinct furniture options", () => {
  it("keeps the best duplicate despite changed IDs and ordering", () => {
    const b = { ...a, id: "b", kind: "chair", x: 4 };
    const best = { score: 20, objects: [{ ...b, id: "new-b" }, { ...a, id: "new-a", rotation: 360 }] };
    expect(uniqueFurnitureLayouts([{ score: 10, objects: [a, b] }, best])).toEqual([best]);
  });
  it("preserves genuinely different positions and orientations", () => {
    expect(uniqueFurnitureLayouts([{ score: 1, objects: [a] }, { score: 2, objects: [{ ...a, x: 2 }] }, { score: 3, objects: [{ ...a, rotation: 180 }] }])).toHaveLength(3);
  });
  it("ignores numerical noise and excludes empty options", () => {
    expect(uniqueFurnitureLayouts([{ score: 1, objects: [a] }, { score: 2, objects: [{ ...a, x: 1.00000001 }] }, { score: 3, objects: [] }])).toHaveLength(1);
  });
  it("limits ranked results without mutating the input", () => {
    const variants = [1, 2, 3, 4].map(score => ({ score, objects: [{ ...a, x: score }] }));
    expect(uniqueFurnitureLayouts(variants).map(item => item.score)).toEqual([4, 3, 2]);
    expect(variants[0].score).toBe(1);
  });
});
