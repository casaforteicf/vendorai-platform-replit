import type { DrawingPrimitive } from "./conceptArchitecturalSections";
export type DocumentationWall = { id: string; floor: number; x1: number; y1: number; x2: number; y2: number; thickness?: number };
export type DocumentationOpening = { id: string; wallId: string; floor: number; type: "door" | "window"; offset: number; width?: number; height?: number; sillHeight?: number };
/** Plan cut at 1.20 m; offset is normalized along the wall, at opening centre. */
export function documentationWallPlan(walls: readonly DocumentationWall[], openings: readonly DocumentationOpening[], floor: number): DrawingPrimitive[] {
 const result: DrawingPrimitive[] = [];
 for (const wall of walls) {
  if (wall.floor !== floor) continue;
  const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1, length = Math.hypot(dx, dy), thickness = wall.thickness ?? 0.15;
  if (![wall.x1, wall.y1, wall.x2, wall.y2, thickness, length].every(Number.isFinite) || length < 1e-9 || thickness <= 0) continue;
  const cuts = openings.filter(o => o.wallId === wall.id && o.floor === floor).flatMap(o => {
   const width = o.width ?? (o.type === "door" ? 0.9 : 1.2), height = o.height ?? (o.type === "door" ? 2.1 : 1.2), sill = o.sillHeight ?? (o.type === "door" ? 0 : 0.9);
   if (![o.offset, width, height, sill].every(Number.isFinite) || width <= 0 || height <= 0 || sill < 0 || o.offset < 0 || o.offset > 1 || sill > 1.2 || sill + height <= 1.2) return [];
   return [[Math.max(0, o.offset * length - width / 2), Math.min(length, o.offset * length + width / 2)]];
  }).sort((a,b) => a[0] - b[0]);
  let cursor = 0;
  const spans: number[][] = [];
  for (const [start,end] of cuts) { if (start > cursor) spans.push([cursor,start]); cursor = Math.max(cursor,end); }
  if (cursor < length) spans.push([cursor,length]);
  const ux = dx / length, uy = dy / length, nx = -uy * thickness / 2, ny = ux * thickness / 2;
  spans.forEach(([a,b],i) => result.push({ id: `wall:${wall.id}:${i}`, kind: "solid", points: [[a,1],[b,1],[b,-1],[a,-1]].map(([t, side]) => ({ u: wall.x1 + ux * t + nx * side, z: -(wall.y1 + uy * t + ny * side) })) }));
 }
 return result;
}
