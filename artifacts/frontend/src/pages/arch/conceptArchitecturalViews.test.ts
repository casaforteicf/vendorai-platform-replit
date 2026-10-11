import { describe, expect, it } from "vitest";
import { applyArchitecturalEdits, emptyArchitecturalModel } from "./conceptArchitecturalModel";
import { architecturalPlanPrimitives, architecturalSolidPrimitives, architecturalSceneGeometry, architecturalFloorCells } from "./conceptArchitecturalViews";
const slab = { id: "l1", floor: 1, x: 0, y: 0, width: 4, depth: 3, thickness: 0.15, elevation: 3,
  voids: [{ x: 1, y: 1, width: 1, depth: 1 }] };
describe("shared architectural view projections", () => {
  it("derives matching footprints for a slab, including its opening", () => {
    const result = applyArchitecturalEdits(emptyArchitecturalModel(), [{ action: "upsert", element: { kind: "slab", value: slab } }]);
    expect(result).toHaveProperty("value");
    if (!("value" in result)) return;
    const plan = architecturalPlanPrimitives(result.value);
    const solids = architecturalSolidPrimitives(result.value);
    expect(plan.find(item => item.kind === "slab-void")).toMatchObject({ x: 1, y: 1, width: 1, depth: 1, floor: 1 });
    const volumeArea = solids.filter(item => item.kind === "slab").reduce((sum, item) => sum + item.width * item.depth, 0);
    expect(volumeArea).toBeCloseTo(11);
    expect(solids.every(item => item.z === 2.85 && item.height === 0.15)).toBe(true);
  });
  it("updates both projections from one immutable edit", () => {
    const initial = applyArchitecturalEdits(emptyArchitecturalModel(), [{ action: "upsert", element: { kind: "slab", value: slab } }]);
    if (!("value" in initial)) throw Error("invalid fixture");
    const updated = applyArchitecturalEdits(initial.value, [{ action: "upsert", element: { kind: "slab", value: { ...slab, width: 5 } } }]);
    if (!("value" in updated)) throw Error("invalid edit");
    expect(architecturalPlanPrimitives(updated.value).find(item => item.kind === "slab")?.width).toBe(5);
    expect(architecturalSolidPrimitives(updated.value).filter(item => item.kind === "slab").reduce((sum, p) => sum + p.width * p.depth, 0)).toBeCloseTo(14);
    expect(initial.value.slabs[0].width).toBe(4);
  });
  it("projects stair steps and roof extent from shared parameters", () => {
    const base = emptyArchitecturalModel();
    base.stairs.push({ id: "e1", floor: 0, x: 1, y: 1, width: 1, run: 4.5, rise: 2.8 });
    base.roofs.push({ id: "r1", x: 0, y: 0, width: 6, depth: 4, elevation: 3, pitchDegrees: 30, overhang: 0.5, type: "gable" });
    expect(architecturalPlanPrimitives(base).find(p => p.id === "r1")).toMatchObject({ x: -0.5, width: 7 });
    expect(architecturalSolidPrimitives(base).filter(p => p.kind === "stair-step").length).toBeGreaterThan(0);
    expect(architecturalSolidPrimitives(base).find(p => p.id === "r1")?.height).toBeCloseTo(2 * Math.tan(Math.PI / 6));
  });
});


describe("official architectural scene geometry", () => {
  it("keeps cumulative stair steps on the floor base without doubled elevation", () => {
    const model = emptyArchitecturalModel();
    model.stairs.push({ id: "stair", floor: 1, x: 0, y: 0, width: 1, run: 4.5, rise: 2.8 });
    const boxes = architecturalSceneGeometry(model, 1, false, false).boxes;
    expect(boxes.every(box => box.z === 3.12)).toBe(true);
    expect(boxes.at(-1)!.height).toBeLessThan(2.8);
    expect(architecturalSceneGeometry(model, 0, false, false).boxes).toHaveLength(0);
  });
  it("builds roof slopes and honors roof visibility", () => {
    const model = emptyArchitecturalModel();
    model.roofs.push({ id: "roof", x: 0, y: 0, width: 6, depth: 4, elevation: 3, pitchDegrees: 30, overhang: 0.5, type: "gable" });
    const scene = architecturalSceneGeometry(model, 0, true, true);
    expect(scene.roofFaces).toHaveLength(2);
    expect(scene.roofFaces[0].vertices[2].z).toBeCloseTo(3 + 2 * Math.tan(Math.PI / 6));
    expect(scene.roofFaces[0].vertices[0].z).toBeCloseTo(3 - 0.5 * Math.tan(Math.PI / 6));
    expect(architecturalSceneGeometry(model, 0, true, false).roofFaces).toHaveLength(0);
  });
});

it("cuts generated finishes without extending cells beyond the room", () => {
  const model = { slabs: [{ id: "s", floor: 0, x: 0, y: 0, width: 4, depth: 4, elevation: 0.16, thickness: 0.16, voids: [{ x: 1, y: 1, width: 2, depth: 2 }] }], stairs: [], roofs: [] };
  const cells = architecturalFloorCells(model, 0, { x: 0, y: 0, width: 2, height: 2 });
  expect(cells.reduce((sum, cell) => sum + cell.width * cell.height, 0)).toBe(3);
  expect(cells.every(cell => cell.x + cell.width <= 2 && cell.y + cell.height <= 2)).toBe(true);
  expect(architecturalFloorCells(model, 1, { x: 0, y: 0, width: 2, height: 2 })).toHaveLength(1);
});
