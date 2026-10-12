/** Pure geometric preparation for wall solids with door/window voids.
 * Coordinates are metres. Boxes do not imply boolean union or a watertight BIM mesh.
 */
export type SolidWall = { id: string; floor: number; x1: number; y1: number; x2: number; y2: number; thickness: number; height: number; baseElevation?: number };
export type SolidOpening = { id: string; wallId: string; floor: number; offset: number; width: number; height: number; sillHeight?: number };
export type WallBox = { wallId: string; floor: number; x: number; y: number; z: number; width: number; depth: number; height: number };
export type WallSolidResult = { boxes: WallBox[]; warnings: string[] };

const EPS = 1e-7;
const round = (n: number) => Math.round(n * 1e6) / 1e6;

/** The opening offset is a fraction [0,1] of the source wall length, measured from its first endpoint. */
export function prepareWallSolids(walls: SolidWall[], openings: SolidOpening[]): WallSolidResult {
  const boxes: WallBox[] = [];
  const warnings: string[] = [];
  const wallKeys = new Set(walls.map((wall) => `${wall.floor}:${wall.id}`));
  const seenKeys = new Set<string>();
  for (const opening of openings) {
    if (!wallKeys.has(`${opening.floor}:${opening.wallId}`)) warnings.push(`OPENING_ORPHAN:${opening.id}`);
  }
  for (const wall of walls) {
    const wallKey = `${wall.floor}:${wall.id}`;
    if (seenKeys.has(wallKey)) {
      warnings.push(`WALL_DUPLICATE:${wall.id}`);
      continue;
    }
    seenKeys.add(wallKey);
    if (![wall.x1, wall.y1, wall.x2, wall.y2].every(Number.isFinite)) {
      warnings.push(`WALL_INVALID:${wall.id}`);
      continue;
    }
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const length = Math.hypot(dx, dy);
    const horizontal = Math.abs(dy) < EPS;
    const vertical = Math.abs(dx) < EPS;
    const base = wall.baseElevation ?? 0;
    if (!Number.isFinite(length) || length < 0.05 || !(horizontal || vertical) ||
        !Number.isFinite(wall.thickness) || wall.thickness <= 0 ||
        !Number.isFinite(wall.height) || wall.height <= 0 || !Number.isFinite(base)) {
      warnings.push(`WALL_INVALID:${wall.id}`);
      continue;
    }
    const assigned = openings.filter((o) => o.wallId === wall.id && o.floor === wall.floor);
    type Void = { id: string; start: number; end: number; low: number; high: number };
    const voids: Void[] = [];
    for (const o of assigned) {
      const sill = o.sillHeight ?? 0;
      if (![o.offset, o.width, o.height, sill].every(Number.isFinite) ||
          o.offset < 0 || o.offset > 1 || o.width <= 0 || o.height <= 0 || sill < 0 ||
          sill + o.height > wall.height + EPS) {
        warnings.push(`OPENING_INVALID:${o.id}`);
        continue;
      }
      const center = o.offset * length;
      const start = center - o.width / 2;
      const end = center + o.width / 2;
      if (start < -EPS || end > length + EPS) {
        warnings.push(`OPENING_OUTSIDE_WALL:${o.id}`);
        continue;
      }
      voids.push({ id: o.id, start: Math.max(0, start), end: Math.min(length, end), low: sill, high: sill + o.height });
    }
    // Reject overlapping openings rather than silently creating incorrect wall solids.
    voids.sort((a, b) => a.start - b.start || a.low - b.low || a.id.localeCompare(b.id));
    const accepted: Void[] = [];
    for (const opening of voids) {
      if (accepted.some((other) => opening.start < other.end - EPS && other.start < opening.end - EPS &&
          opening.low < other.high - EPS && other.low < opening.high - EPS)) {
        warnings.push(`OPENING_OVERLAP:${opening.id}`);
      } else accepted.push(opening);
    }
    const cuts = [...new Set([0, length, ...accepted.flatMap((o) => [o.start, o.end])])].sort((a,b) => a-b);
    for (let i=0; i<cuts.length-1; i++) {
      const a=cuts[i], b=cuts[i+1];
      if (b-a < EPS) continue;
      const midpoint=(a+b)/2;
      const active=accepted.filter((o) => o.start < midpoint && o.end > midpoint);
      const elevations=[...new Set([0,wall.height,...active.flatMap((o)=>[o.low,o.high])])].sort((a,b)=>a-b);
      for (let j=0;j<elevations.length-1;j++) {
        const bottom=elevations[j],top=elevations[j+1];
        if (top-bottom<EPS || active.some((o)=>o.low < (top+bottom)/2 && o.high > (top+bottom)/2)) continue;
        const startX=horizontal ? wall.x1+Math.sign(dx)*a : wall.x1;
        const endX=horizontal ? wall.x1+Math.sign(dx)*b : wall.x1;
        const startY=vertical ? wall.y1+Math.sign(dy)*a : wall.y1;
        const endY=vertical ? wall.y1+Math.sign(dy)*b : wall.y1;
        boxes.push({wallId:wall.id,floor:wall.floor,
          x:round(Math.min(startX,endX)-(vertical ? wall.thickness/2 : 0)),
          y:round(Math.min(startY,endY)-(horizontal ? wall.thickness/2 : 0)),
          z:round(base+bottom),
          width:round(horizontal ? b-a : wall.thickness),
          depth:round(vertical ? b-a : wall.thickness),
          height:round(top-bottom)});
      }
    }
  }
  return { boxes, warnings };
}
