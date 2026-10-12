import type { WallBox } from "./conceptWallSolids";

export type IndexedWallMesh = {
  wallId: string;
  floor: number;
  positions: number[];
  indices: number[];
};

/** Produces closed triangle faces for each individual box.
 * Multiple boxes remain separate; this is NOT a boolean union or manifold wall assembly.
 */
export function wallBoxesToMeshes(boxes: WallBox[]): IndexedWallMesh[] {
  return boxes.map((box) => {
    const { x, y, z, width: w, depth: d, height: h } = box;
    if (![x, y, z, w, d, h].every(Number.isFinite) || w <= 0 || d <= 0 || h <= 0) {
      throw new Error(`WALL_BOX_INVALID:${box.wallId}`);
    }
    const positions = [
      x,y,z, x+w,y,z, x+w,y+d,z, x,y+d,z,
      x,y,z+h, x+w,y,z+h, x+w,y+d,z+h, x,y+d,z+h,
    ];
    const indices = [
      0,2,1, 0,3,2, // bottom
      4,5,6, 4,6,7, // top
      0,1,5, 0,5,4, // front
      1,2,6, 1,6,5, // right
      2,3,7, 2,7,6, // back
      3,0,4, 3,4,7, // left
    ];
    return { wallId:box.wallId, floor:box.floor, positions, indices };
  });
}
