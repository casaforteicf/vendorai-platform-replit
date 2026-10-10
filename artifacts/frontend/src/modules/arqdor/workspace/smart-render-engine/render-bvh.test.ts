import { describe, expect, it } from "vitest";
import { createRenderBvh } from "./render-bvh";
import type { GeometryTransfer } from "./render-geometry-export";

const triangleScene: GeometryTransfer = {
  schemaVersion: 1, truncated: false, warnings: [], totalTriangles: 1,
  meshes: [{
    meshId: "wall-1", materialId: "mat-1", triangles: 1,
    positions: [0,0,0, 1,0,0, 0,1,0],
    normals: [0,0,1, 0,0,1, 0,0,1], uvs: [0,0, 1,0, 0,1],
  }],
};
describe("ARQDOR render BVH", () => {
  it("intersects triangle and returns material and barycentric hit", () => {
    const bvh = createRenderBvh(triangleScene);
    const hit = bvh.intersect({ origin: [0.25,0.25,1], direction: [0,0,-1] });
    expect(bvh.triangleCount).toBe(1);
    expect(hit?.meshId).toBe("wall-1");
    expect(hit?.materialId).toBe("mat-1");
    expect(hit?.distance).toBeCloseTo(1);
    expect(hit?.barycentric).toEqual([0.5,0.25,0.25]);
  });
  it("returns null for misses and rays pointing away", () => {
    const bvh = createRenderBvh(triangleScene);
    expect(bvh.intersect({origin:[2,2,1],direction:[0,0,-1]})).toBeNull();
    expect(bvh.intersect({origin:[0.25,0.25,1],direction:[0,0,1]})).toBeNull();
  });
  it("rejects incomplete geometry instead of rendering wrong geometry", () => {
    expect(() => createRenderBvh({...triangleScene,truncated:true})).toThrow();
    expect(() => createRenderBvh({...triangleScene,warnings:["instancing unsupported"]})).toThrow();
  });
  it("rejects invalid rays and handles empty scenes", () => {
    const bvh=createRenderBvh({...triangleScene,meshes:[],totalTriangles:0});
    expect(bvh.intersect({origin:[0,0,0],direction:[1,0,0]})).toBeNull();
    expect(() => bvh.intersect({origin:[0,0,0],direction:[0,0,0]})).toThrow();
  });
});
