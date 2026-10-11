import { describe, expect, it } from "vitest";
import { applyArchitecturalEdits, architecturalQuantities, cloneArchitecturalModel, type ArchitecturalModel } from "./conceptArchitecturalModel";
import { architecturalFloorCells, architecturalPlanPrimitives, architecturalSolidPrimitives } from "./conceptArchitecturalViews";
const model = (): ArchitecturalModel => ({ version: 1, openings: [], roofs: [],
  slabs: [{ id: "upper", floor: 1, x: 0, y: 0, width: 5, depth: 6, thickness: 0.15, elevation: 3.12,
    voids: [{ x: 1, y: 1, width: 1, depth: 1 }] }],
  stairs: [{ id: "stair", floor: 0, x: 1, y: 1, width: 1, run: 4.2, rise: 2.8 }] });
describe("stair cuts across shared architectural views", () => {
  it("subtracts overlapping manual and automatic cuts only once", () => {
    const m = model();
    expect(architecturalQuantities(m).slabNetArea).toBeCloseTo(25.8);
    const area = architecturalSolidPrimitives(m).filter(p => p.kind === "slab").reduce((sum, p) => sum + p.width * p.depth, 0);
    expect(area).toBeCloseTo(25.8);
    expect(architecturalPlanPrimitives(m).filter(p => p.kind === "slab-void")).toHaveLength(2);
    expect(architecturalFloorCells(m, 1, { x: 0, y: 0, width: 5, height: 6 }).reduce((sum, p) => sum + p.width * p.height, 0)).toBeCloseTo(area);
    expect(m.slabs[0].voids).toHaveLength(1);
  });
  it("regenerates cuts after moving and removing stairs, preserving manual cuts", () => {
    const m = model();
    const moved = applyArchitecturalEdits(m, [{ action: "upsert", element: { kind: "stair", value: { ...m.stairs[0], x: 3 } } }]);
    if (!("value" in moved)) throw Error(moved.error);
    expect(architecturalQuantities(moved.value).slabNetArea).toBeCloseTo(24.8);
    const removed = applyArchitecturalEdits(moved.value, [{ action: "remove", kind: "stair", id: "stair" }]);
    if (!("value" in removed)) throw Error(removed.error);
    expect(architecturalQuantities(removed.value).slabNetArea).toBe(29);
    expect(architecturalQuantities(m).slabNetArea).toBeCloseTo(25.8);
  });
  it("clips boundary cuts and excludes stairs on another floor or with the option off", () => {
    const m = model(); m.stairs[0].x = 4.5;
    expect(architecturalQuantities(m).slabNetArea).toBeCloseTo(26.9);
    m.stairs[0].openSlab = false;
    expect(architecturalQuantities(m).slabNetArea).toBe(29);
    delete m.stairs[0].openSlab; m.stairs[0].floor = 1;
    expect(architecturalQuantities(m).slabNetArea).toBe(29);
  });
  it("keeps history snapshots isolated and restores derived cuts from their stairs", () => {
    const before = cloneArchitecturalModel(model());
    const after = cloneArchitecturalModel(before); after.stairs[0].openSlab = false; after.slabs[0].voids[0].width = 2;
    const restored = cloneArchitecturalModel(before);
    expect(architecturalQuantities(restored).slabNetArea).toBeCloseTo(25.8);
    restored.slabs[0].voids[0].x = 3;
    expect(before.slabs[0].voids[0].x).toBe(1);
    expect(before.stairs[0].openSlab).toBeUndefined();
    expect(architecturalQuantities(after).slabNetArea).toBe(28);
  });
});
