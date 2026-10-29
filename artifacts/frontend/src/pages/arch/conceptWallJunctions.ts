import type { EditableWall } from "./conceptParametricEditing";

export type WallJunction = {
  firstWallId: string;
  secondWallId: string;
  floor: number;
  x: number;
  y: number;
  kind: "endpoint" | "crossing" | "tee";
};

/** Detects point junctions only. Collinear overlap is intentionally excluded. */
export function detectWallJunctions(walls: readonly EditableWall[], epsilon = 1e-7): WallJunction[] {
  const result: WallJunction[] = [];
  const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
  const near = (a: number, b: number) => Math.abs(a - b) <= epsilon;
  for (let i = 0; i < walls.length; i++) {
    const a = walls[i];
    if (![a.x1, a.y1, a.x2, a.y2].every(Number.isFinite)) continue;
    const rx = a.x2 - a.x1, ry = a.y2 - a.y1;
    if (Math.hypot(rx, ry) <= epsilon) continue;
    for (let j = i + 1; j < walls.length; j++) {
      const b = walls[j];
      if (a.floor !== b.floor || ![b.x1, b.y1, b.x2, b.y2].every(Number.isFinite)) continue;
      const sx = b.x2 - b.x1, sy = b.y2 - b.y1;
      if (Math.hypot(sx, sy) <= epsilon) continue;
      const denom = cross(rx, ry, sx, sy);
      if (Math.abs(denom) <= epsilon * Math.hypot(rx, ry) * Math.hypot(sx, sy)) continue;
      const qx = b.x1 - a.x1, qy = b.y1 - a.y1;
      const t = cross(qx, qy, sx, sy) / denom;
      const u = cross(qx, qy, rx, ry) / denom;
      if (t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) continue;
      const aEnd = near(t, 0) || near(t, 1);
      const bEnd = near(u, 0) || near(u, 1);
      result.push({
        firstWallId: a.id, secondWallId: b.id, floor: a.floor,
        x: a.x1 + Math.max(0, Math.min(1, t)) * rx,
        y: a.y1 + Math.max(0, Math.min(1, t)) * ry,
        kind: aEnd && bEnd ? "endpoint" : aEnd || bEnd ? "tee" : "crossing",
      });
    }
  }
  return result;
}
