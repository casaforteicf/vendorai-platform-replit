import { describe, expect, it } from "vitest";
import { applyArchitecturalEdits, emptyArchitecturalModel } from "./conceptArchitecturalModel";
import { architecturalPlanPrimitives, architecturalSolidPrimitives } from "./conceptArchitecturalViews";
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
