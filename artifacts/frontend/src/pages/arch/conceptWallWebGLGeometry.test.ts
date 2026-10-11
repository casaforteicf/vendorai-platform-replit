import { describe, expect, it } from "vitest";
import { wallBoxesToMeshes } from "./conceptWallBoxMesh";
import { wallMeshToWebGL } from "./conceptWallWebGLGeometry";

describe("wall mesh WebGL conversion", () => {
  it("maps plan coordinates to Three.js and preserves outward normals", () => {
    const source = wallBoxesToMeshes([{ wallId: "a", floor: 2, x: 1, y: 2, z: 3, width: 2, depth: 0.15, height: 2.8 }])[0];
    const result = wallMeshToWebGL(source, 10, 12);
    expect(result.positions.slice(0, 3)).toEqual([-4, 3, -4]);
    expect(result.wallId).toBe("a");
    expect(result.floor).toBe(2);
    expect(result.indices).toHaveLength(36);
    // Lower horizontal face must point down in y-up coordinates.
    const [a, b, c] = result.indices.slice(0, 3);
    const at = (i: number) => result.positions.slice(i * 3, i * 3 + 3);
    const p = at(a), q = at(b), r = at(c);
    const ux=q[0]-p[0], uz=q[2]-p[2], vx=r[0]-p[0], vz=r[2]-p[2];
    const ny = uz*vx - ux*vz;
    expect(ny).toBeLessThan(0);
  });
  it("rejects invalid topology and lot dimensions", () => {
    const mesh = wallBoxesToMeshes([{ wallId: "a", floor: 0, x: 0, y: 0, z: 0, width: 1, depth: 0.15, height: 2 }])[0];
    expect(() => wallMeshToWebGL(mesh, 0, 10)).toThrow("WALL_WEBGL_INVALID:a");
    expect(() => wallMeshToWebGL({...mesh, indices: [99,0,1]}, 10, 10)).toThrow("WALL_WEBGL_INVALID:a");
  });
});
