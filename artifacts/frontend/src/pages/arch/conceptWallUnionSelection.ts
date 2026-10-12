import type { WallUnionMesh } from "./conceptWallUnion";

/**
 * Maps a raycast triangle to the original wall identity. Overlap regions may
 * legitimately have multiple contributors; never silently choose one.
 */
export type WallUnionPick =
  | { kind: "none"; wallIds: [] }
  | { kind: "wall"; wallId: string; wallIds: string[] }
  | { kind: "ambiguous"; wallIds: string[] };

export function resolveWallUnionPick(mesh: WallUnionMesh, faceIndex: number): WallUnionPick {
  if (!Number.isSafeInteger(faceIndex) || faceIndex < 0 ||
      faceIndex * 3 + 2 >= mesh.indices.length ||
      mesh.triangleWallIds.length !== mesh.indices.length / 3) {
    return { kind: "none", wallIds: [] };
  }

  const allowed = new Set(mesh.sourceWallIds);
  const wallIds = [...new Set(mesh.triangleWallIds[faceIndex] ?? [])]
    .filter(id => typeof id === "string" && allowed.has(id))
    .sort();
  if (wallIds.length === 0) return { kind: "none", wallIds: [] };
  if (wallIds.length === 1) return { kind: "wall", wallId: wallIds[0], wallIds };
  return { kind: "ambiguous", wallIds };
}
