import { describe, expect, it } from "vitest";
import { buildOrthogonalWallUnion } from "./conceptWallUnion";
import { resolveWallUnionPick } from "./conceptWallUnionSelection";

const box = (wallId: string, x: number, y: number, width: number, depth: number) => ({
  wallId, floor: 0, x, y, z: 0, width, depth, height: 2.8,
});

describe("union face selection", () => {
  it("resolves a face with a unique owning wall", () => {
    const mesh = buildOrthogonalWallUnion([box("a", 0, 0, 2, 0.15)]).meshes[0];
    expect(resolveWallUnionPick(mesh, 0)).toEqual({ kind: "wall", wallId: "a", wallIds: ["a"] });
  });
  it("returns explicit ambiguity for a shared overlap surface", () => {
    const mesh = buildOrthogonalWallUnion([
      box("horizontal", 0, 1, 3, 0.15),
      box("vertical", 1.4, 0, 0.15, 3),
    ]).meshes[0];
    const shared = mesh.triangleWallIds.findIndex(ids => ids.length > 1);
    expect(shared).toBeGreaterThanOrEqual(0);
    expect(resolveWallUnionPick(mesh, shared)).toEqual({
      kind: "ambiguous", wallIds: ["horizontal", "vertical"],
    });
  });
  it("does not select an unrelated wall when face provenance is missing", () => {
    const mesh = buildOrthogonalWallUnion([box("a", 0, 0, 2, 0.15)]).meshes[0];
    expect(resolveWallUnionPick({ ...mesh, triangleWallIds: [[], ...mesh.triangleWallIds.slice(1)] }, 0))
      .toEqual({ kind: "none", wallIds: [] });
    expect(resolveWallUnionPick({
      ...mesh, triangleWallIds: [["different"], ...mesh.triangleWallIds.slice(1)],
    }, 0)).toEqual({ kind: "none", wallIds: [] });
  });
  it("fails closed on invalid face indices or corrupt metadata", () => {
    const mesh = buildOrthogonalWallUnion([box("a", 0, 0, 2, 0.15)]).meshes[0];
    expect(resolveWallUnionPick(mesh, -1).kind).toBe("none");
    expect(resolveWallUnionPick(mesh, 100000).kind).toBe("none");
    expect(resolveWallUnionPick({ ...mesh, triangleWallIds: [] }, 0).kind).toBe("none");
  });
});
