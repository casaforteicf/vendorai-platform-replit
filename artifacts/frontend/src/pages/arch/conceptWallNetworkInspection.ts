import type { EditableWall } from "./conceptParametricEditing";
import { detectWallJunctions, type WallJunction } from "./conceptWallJunctions";

export type WallOverlap = {
  firstWallId: string;
  secondWallId: string;
  floor: number;
  start: { x: number; y: number };
  end: { x: number; y: number };
  length: number;
};

/** Read-only diagnostic; never edits the model or resolves conflicting wall IDs. */
export function inspectWallNetwork(walls: readonly EditableWall[], tolerance = 1e-6): {
  junctions: WallJunction[];
  overlaps: WallOverlap[];
} {
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new Error("INVALID_WALL_TOLERANCE");
  const overlaps: WallOverlap[] = [];
  const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
  for (let i = 0; i < walls.length; i++) {
    const a = walls[i];
    const ax = a.x2 - a.x1;
    const ay = a.y2 - a.y1;
    const length = Math.hypot(ax, ay);
    if (!Number.isFinite(length) || length <= tolerance) continue;
    const ux = ax / length, uy = ay / length;
    for (let j = i + 1; j < walls.length; j++) {
      const b = walls[j];
      if (a.floor !== b.floor) continue;
      if (![b.x1, b.y1, b.x2, b.y2].every(Number.isFinite)) continue;
      const bx = b.x2 - b.x1, by = b.y2 - b.y1;
      const bLength = Math.hypot(bx, by);
      if (!Number.isFinite(bLength) || bLength <= tolerance) continue;
      // Both endpoints of B must lie on the same infinite supporting line as A.
      if (Math.abs(cross(ux, uy, b.x1 - a.x1, b.y1 - a.y1)) > tolerance ||
          Math.abs(cross(ux, uy, b.x2 - a.x1, b.y2 - a.y1)) > tolerance) continue;
      const p = (b.x1 - a.x1) * ux + (b.y1 - a.y1) * uy;
      const q = (b.x2 - a.x1) * ux + (b.y2 - a.y1) * uy;
      const start = Math.max(0, Math.min(p, q));
      const end = Math.min(length, Math.max(p, q));
      if (end - start <= tolerance) continue; // Shared point is not an overlap.
      overlaps.push({
        firstWallId: a.id, secondWallId: b.id, floor: a.floor,
        start: { x: a.x1 + start * ux, y: a.y1 + start * uy },
        end: { x: a.x1 + end * ux, y: a.y1 + end * uy },
        length: end - start,
      });
    }
  }
  return { junctions: detectWallJunctions(walls, tolerance), overlaps };
}
