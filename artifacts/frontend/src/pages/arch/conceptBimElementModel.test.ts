import { describe, expect, it } from "vitest";
import { editBimElementNumber, inspectBimModel, removeBimElement, upsertBimElement, type BimModel } from "./conceptBimElementModel";

const empty: BimModel = { schemaVersion: 1, elements: [] };
const slab = { id: "s1", kind: "slab" as const, x: 0, y: 0, parameters: {
  floor: 1, width: 8, depth: 10, thickness: 0.16, openings: [{ x: 1, y: 1, width: 2, depth: 2 }],
} };
const stair = { id: "t1", kind: "stair" as const, x: 2, y: 3, parameters: {
  floor: 0, rise: 2.8, run: 4.5, stepCount: 16, width: 1.2,
} };
const roof = { id: "r1", kind: "roof" as const, x: 0, y: 0, floor: 1, parameters: {
  kind: "pitched" as const, width: 8, depth: 10, pitchDegrees: 30, eave: 0.4,
} };

describe("Arqdor BIM element collection — isolated draft", () => {
  it("adds multiple elements without changing the original project", () => {
    const withSlab = upsertBimElement(empty, slab);
    const completed = upsertBimElement(upsertBimElement(withSlab, stair), roof);
    expect(empty.elements).toHaveLength(0);
    expect(completed.elements.map(e => e.id)).toEqual(["s1", "t1", "r1"]);
    expect(inspectBimModel(completed)).toEqual([]);
    expect(JSON.parse(JSON.stringify(completed))).toEqual(completed);
  });
  it("replaces one element by stable ID and preserves other elements", () => {
    const initial = upsertBimElement(upsertBimElement(empty, slab), roof);
    const updated = upsertBimElement(initial, { ...slab, parameters: { ...slab.parameters, thickness: 0.2 } });
    expect(initial.elements[0]).toEqual(slab);
    expect(updated.elements[0].kind).toBe("slab");
    expect(updated.elements[1]).toEqual(roof);
  });
  it("rejects invalid openings without losing the last valid model", () => {
    const initial = upsertBimElement(empty, slab);
    expect(() => upsertBimElement(initial, {
      ...slab, parameters: { ...slab.parameters, openings: [{ x: 9, y: 1, width: 2, depth: 2 }] },
    })).toThrow(/INVALID_PARAMETERS/);
    expect(initial.elements[0]).toEqual(slab);
  });
  it("detects duplicate IDs and non-finite placements", () => {
    expect(inspectBimModel({ schemaVersion: 1, elements: [slab, { ...stair, id: slab.id, x: NaN }] })
      .map(issue => issue.code)).toEqual(["DUPLICATE_ID", "INVALID_POSITION"]);
  });
  it("edits position and dimensions without modifying original elements", () => {
    const initial = upsertBimElement(empty, slab);
    const positioned = editBimElementNumber(initial, "s1", "x", 3.5);
    const resized = editBimElementNumber(positioned, "s1", "width", 9);
    expect((initial.elements[0] as typeof slab).x).toBe(0);
    expect((resized.elements[0] as typeof slab).parameters.width).toBe(9);
    expect(resized.elements[0].x).toBe(3.5);
  });
  it("rejects invalid dimensions, missing elements and unsupported keys", () => {
    const initial = upsertBimElement(empty, slab);
    expect(() => editBimElementNumber(initial, "s1", "width", -1)).toThrow(/ARQDOR_BIM_INVALID/);
    expect(() => editBimElementNumber(initial, "s1", "width", NaN)).toThrow("ARQDOR_BIM_NON_FINITE_VALUE");
    expect(() => editBimElementNumber(initial, "missing", "width", 2)).toThrow("ARQDOR_BIM_ELEMENT_NOT_FOUND");
    expect(() => editBimElementNumber(initial, "s1", "run", 2)).toThrow("ARQDOR_BIM_UNSUPPORTED_PARAMETER");
    expect(initial.elements[0]).toEqual(slab);
  });
  it("removes elements immutably", () => {
    const model = upsertBimElement(upsertBimElement(empty, slab), stair);
    expect(removeBimElement(model, slab.id).elements).toEqual([stair]);
    expect(model.elements).toHaveLength(2);
  });
});
