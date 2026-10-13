import { describe, expect, it } from "vitest";
import { projectBimMeshes } from "./conceptBimMeshGeometry";
import type { BimModel } from "./conceptBimElementModel";

const model: BimModel = { schemaVersion: 1, elements: [
  { id: "stair", kind: "stair", x: 2, y: 3, parameters: { floor: 0, rise: 2.8, run: 4.5, stepCount: 16, width: 1.2 } },
  { id: "slab", kind: "slab", x: 5, y: 6, parameters: { floor: 1, width: 8, depth: 10, thickness: 0.16, openings: [{ x: 1, y: 2, width: 2, depth: 3 }] } },
  { id: "roof", kind: "roof", x: 0, y: 1, floor: 2, parameters: { kind: "pitched", width: 8, depth: 10, pitchDegrees: 30, eave: 0.4 } },
] };

describe("Arqdor BIM experimental 3D mesh adapter", () => {
  it("derives three meshes from the same stable BIM element IDs", () => {
    const result = projectBimMeshes(model);
    expect(result.map(x => x.id)).toEqual(["stair", "slab", "roof"]);
    expect(result.every(x => x.positions.length > 0 && x.positions.length % 9 === 0)).toBe(true);
    expect(result.every(x => x.positions.every(Number.isFinite))).toBe(true);
  });
  it("keeps stair triangles within the specified run", () => {
    const stairs = projectBimMeshes(model)[0].positions;
    const depths = stairs.filter((_, index) => index % 3 === 2);
    expect(Math.min(...depths)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...depths)).toBeCloseTo(7.5);
    expect(stairs.length / 9).toBe(15 * 12);
  });
  it("does not fill the slab opening with triangle centroids", () => {
    const slab = projectBimMeshes(model)[1];
    for(let i=0;i<slab.positions.length;i+=9) {
      const p=slab.positions;
      const x=(p[i]+p[i+3]+p[i+6])/3;
      const z=(p[i+2]+p[i+5]+p[i+8])/3;
      expect(x > 6 && x < 8 && z > 8 && z < 11).toBe(false);
    }
  });
  it("maintains floor elevation and does not mutate model", () => {
    const before=JSON.stringify(model);
    const roof=projectBimMeshes(model)[2];
    expect(Math.min(...roof.positions.filter((_,i)=>i%3===1))).toBeCloseTo(5.6);
    expect(JSON.stringify(model)).toBe(before);
  });
  it("rejects invalid floor height and invalid models", () => {
    expect(()=>projectBimMeshes(model,0)).toThrow("ARQDOR_BIM_INVALID_FLOOR_HEIGHT");
    expect(()=>projectBimMeshes({ schemaVersion:1, elements:[{...model.elements[0],x:NaN}] })).toThrow("ARQDOR_BIM_INVALID_MODEL");
  });
});
