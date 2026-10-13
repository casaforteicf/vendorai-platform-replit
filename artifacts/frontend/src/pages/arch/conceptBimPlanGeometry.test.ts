import { describe, expect, it } from "vitest";
import { projectBimPlan } from "./conceptBimPlanGeometry";
import type { BimModel } from "./conceptBimElementModel";

const model: BimModel = { schemaVersion: 1, elements: [
  { id: "stair", kind: "stair", x: 2, y: 3, parameters: { floor: 0, rise: 2.8, run: 4.5, stepCount: 16, width: 1.2 } },
  { id: "slab", kind: "slab", x: 5, y: 6, parameters: { floor: 1, width: 8, depth: 10, thickness: 0.16, openings: [{ x: 1, y: 2, width: 2, depth: 3 }] } },
  { id: "roof", kind: "roof", x: 0, y: 1, floor: 2, parameters: { kind: "pitched", width: 8, depth: 10, pitchDegrees: 30, eave: 0.4 } },
] };

describe("Arqdor BIM plan projection", () => {
  it("projects only the requested floor in metres", () => {
    expect(projectBimPlan(model, 0)).toEqual([{ id: "stair", kind: "stair", floor: 0, x: 2, y: 3, width: 1.2, depth: 4.5 }]);
    expect(projectBimPlan(model, 2)).toEqual([{ id: "roof", kind: "roof", floor: 2, x: 0, y: 1, width: 8, depth: 10 }]);
  });
  it("adds void outlines in world coordinates for slab openings", () => {
    expect(projectBimPlan(model, 1)).toEqual([
      { id: "slab", kind: "slab", floor: 1, x: 5, y: 6, width: 8, depth: 10 },
      { id: "slab:opening:0", parentId: "slab", kind: "slab-opening", floor: 1, x: 6, y: 8, width: 2, depth: 3 },
    ]);
  });
  it("does not alter the source model", () => {
    const original = JSON.stringify(model);
    projectBimPlan(model, 1);
    expect(JSON.stringify(model)).toBe(original);
  });
  it("rejects invalid geometry instead of showing misleading outlines", () => {
    expect(() => projectBimPlan({ schemaVersion: 1, elements: [{ ...model.elements[0], x: NaN }] }, 0)).toThrow("ARQDOR_BIM_INVALID_MODEL");
    expect(() => projectBimPlan(model, -1)).toThrow("ARQDOR_BIM_INVALID_FLOOR");
  });
});
