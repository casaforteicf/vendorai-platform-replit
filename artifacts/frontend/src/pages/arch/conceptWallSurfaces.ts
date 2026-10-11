import type { partitionOrthogonalWallSolids } from "./conceptWallSolidUnion";
type Piece = ReturnType<typeof partitionOrthogonalWallSolids>[number];
type Rect = { u0: number; u1: number; v0: number; v1: number };
export type WallFace = Rect & { axis: number; direction: number; plane: number; vertices: number[][] };
const epsilon = 1e-8;
function subtractRect(a: Rect, b: Rect): Rect[] {
  const u0 = Math.max(a.u0, b.u0), u1 = Math.min(a.u1, b.u1), v0 = Math.max(a.v0, b.v0), v1 = Math.min(a.v1, b.v1);
  if (u1 - u0 <= epsilon || v1 - v0 <= epsilon) return [a];
  return [{ ...a, u1: u0 }, { ...a, u0: u1 }, { u0, u1, v0: a.v0, v1: v0 }, { u0, u1, v0: v1, v1: a.v1 }].filter(r => r.u1 - r.u0 > epsilon && r.v1 - r.v0 > epsilon);
}
export function exposedWallFaces<P extends Piece>(pieces: P[]): Map<P, WallFace[]> {
  const boxes = pieces.flatMap(piece => {
    const horizontal = Math.abs(piece.wall.y2 - piece.wall.y1) < epsilon;
    if (!horizontal && Math.abs(piece.wall.x2 - piece.wall.x1) >= epsilon) return [];
    const half = (piece.wall.thickness ?? 0.15) / 2;
    return [{ piece, min: [Math.min(piece.wall.x1, piece.wall.x2) - (horizontal ? 0 : half), Math.min(piece.wall.y1, piece.wall.y2) - (horizontal ? half : 0), piece.zMin], max: [Math.max(piece.wall.x1, piece.wall.x2) + (horizontal ? 0 : half), Math.max(piece.wall.y1, piece.wall.y2) + (horizontal ? half : 0), piece.zMax] }];
  });
  const result = new Map<P, WallFace[]>();
  for (const box of boxes) {
    const faces: WallFace[] = [];
    for (let axis = 0; axis < 3; axis++) for (const direction of [-1, 1]) {
      const u = (axis + 1) % 3, v = (axis + 2) % 3;
      const plane = direction < 0 ? box.min[axis] : box.max[axis];
      let remaining = [{ u0: box.min[u], u1: box.max[u], v0: box.min[v], v1: box.max[v] }];
      for (const other of boxes) {
        if (other === box) continue;
        const touching = direction > 0 ? Math.abs(other.min[axis] - plane) < epsilon : Math.abs(other.max[axis] - plane) < epsilon;
        if (!touching) continue;
        remaining = remaining.flatMap(rect => subtractRect(rect, { u0: other.min[u], u1: other.max[u], v0: other.min[v], v1: other.max[v] }));
      }
      for (const rect of remaining) {
        const vertices = [[rect.u0, rect.v0], [rect.u1, rect.v0], [rect.u1, rect.v1], [rect.u0, rect.v1]].map(([a, b]) => {
          const point = [0, 0, 0]; point[axis] = plane; point[u] = a; point[v] = b; return point;
        });
        faces.push({ ...rect, axis, direction, plane, vertices });
      }
    }
    result.set(box.piece, faces);
  }
  return result;
}
