import { describe, expect, it } from "vitest";
import { validateRoof, validateSlab, validateStair } from "./conceptBimElementPreflight";
describe("Arqdor parametric BIM preflight", () => {
  it("calculates valid stair step dimensions in metres", () => {
    const r = validateStair({ floor: 0, rise: 2.8, run: 4.5, stepCount: 16, width: 1.2 });
    expect(r.valid).toBe(true);
    expect(r.value.riser).toBeCloseTo(0.175);
    expect(r.value.tread).toBeCloseTo(0.3);
  });
  it("rejects invalid stairs", () => {
    expect(validateStair({ floor: 0, rise: 3, run: 1, stepCount: 2, width: 1 }).valid).toBe(false);
  });
  it("validates slab openings without changing source", () => {
    const slab = { floor: 1, width: 10, depth: 8, thickness: 0.16, openings: [{ x: 1, y: 1, width: 2, depth: 3 }] };
    const previous = JSON.stringify(slab);
    expect(validateSlab(slab).valid).toBe(true);
    expect(JSON.stringify(slab)).toBe(previous);
  });
  it("flags crossing and outside slab openings", () => {
    const r = validateSlab({ floor: 1, width: 5, depth: 5, thickness: 0.16, openings: [
      { x: 2, y: 2, width: 2, depth: 2 },
      { x: 3, y: 3, width: 3, depth: 3 },
    ] });
    expect(r.issues.map(x => x.code)).toEqual(["OPENING_OUTSIDE_SLAB", "OPENING_COLLISION"]);
  });
  it("does not report a fake collision for zero-area slab openings", () => {
    const result = validateSlab({ floor: 1, width: 5, depth: 5, thickness: 0.16, openings: [
      { x: 2, y: 2, width: 0, depth: 2 },
      { x: 1, y: 1, width: 3, depth: 3 },
      { x: 2, y: 2, width: 2, depth: -1 },
    ] });
    expect(result.valid).toBe(false);
    expect(result.issues.filter(issue => issue.code === "OPENING_OUTSIDE_SLAB")).toHaveLength(2);
    expect(result.issues.some(issue => issue.code === "OPENING_COLLISION")).toBe(false);
  });
  it("still reports overlap between valid positive-area openings", () => {
    const result = validateSlab({ floor: 0, width: 8, depth: 8, thickness: 0.15, openings: [
      { x: 1, y: 1, width: 2, depth: 2 },
      { x: 2, y: 2, width: 3, depth: 3 },
    ] });
    expect(result.issues).toContainEqual({ path: "openings[1]", code: "OPENING_COLLISION" });
  });
  it("rejects non-finite roof pitches and unsupported kinds", () => {
    expect(validateRoof({ kind: "flat", width: 8, depth: 10, pitchDegrees: Number.NaN, eave: 0 }).valid).toBe(false);
    expect(validateRoof({ kind: "unknown" as "flat", width: 8, depth: 10, pitchDegrees: 0, eave: 0 }).valid).toBe(false);
  });
  it("calculates pitched-roof rise and rejects incompatible flat pitch", () => {
    expect(validateRoof({ kind: "pitched", width: 8, depth: 10, pitchDegrees: 45, eave: 0.4 }).value.rise).toBeCloseTo(4);
    expect(validateRoof({ kind: "flat", width: 8, depth: 10, pitchDegrees: 15, eave: 0 }).valid).toBe(false);
  });
});
