import { rectangularSolidCells } from "./conceptArchitecturalSlabVoids";
import type { DrawingPrimitive } from "./conceptArchitecturalSections";
export type DocumentationWall = { id: string; floor: number; x1: number; y1: number; x2: number; y2: number; thickness?: number };
export type DocumentationOpening = { id: string; wallId: string; floor: number; type: "door" | "window"; offset: number; width?: number; height?: number; sillHeight?: number; openingStyle?: "hinged" | "sliding" | "fixed" | "tilt_turn"; leafCount?: number; frameProfile?: string; glassType?: string; manufacturer?: string; catalogProductId?: string };
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

/** Wall sections use the editor's current storey convention: 2.96m + 0.16m. */
export function documentationWallSection(walls: readonly DocumentationWall[], openings: readonly DocumentationOpening[], axis: "x" | "y", position: number, elevation = false): DrawingPrimitive[] {
 if (!Number.isFinite(position)) return [];
 const result: DrawingPrimitive[] = [];
 for (const wall of walls) {
  const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1, length = Math.hypot(dx,dy), thickness = wall.thickness ?? 0.15;
  if (![wall.x1,wall.y1,wall.x2,wall.y2,length,thickness,wall.floor].every(Number.isFinite) || length < 1e-9 || thickness <= 0 || !Number.isInteger(wall.floor) || wall.floor < 0) continue;
  const holes = openings.filter(o => o.wallId === wall.id && o.floor === wall.floor).flatMap(o => {
   const width = o.width ?? (o.type === "door" ? 0.9 : 1.2), height = o.height ?? (o.type === "door" ? 2.1 : 1.2), sill = o.sillHeight ?? (o.type === "door" ? 0 : 0.9);
   if (![width,height,sill,o.offset].every(Number.isFinite) || width <= 0 || height <= 0 || sill < 0 || o.offset < 0 || o.offset > 1) return [];
   const x = Math.max(0, o.offset * length - width / 2), end = Math.min(length, o.offset * length + width / 2);
   return end > x && sill < 2.8 ? [{ x, y: sill, width: end - x, depth: Math.min(height, 2.8 - sill) }] : [];
  });
  const cells = rectangularSolidCells({ x: 0, y: 0, width: length, depth: 2.8 }, holes);
  const ux = dx / length, uy = dy / length, nx = -uy * thickness / 2, ny = ux * thickness / 2;
  cells.forEach((cell,index) => {
   const polygon = [[cell.x,1],[cell.x + cell.width,1],[cell.x + cell.width,-1],[cell.x,-1]].map(([s,side]) => ({ x: wall.x1 + ux * s + nx * side, y: wall.y1 + uy * s + ny * side }));
   const projection = (p: { x: number; y: number }) => axis === "x" ? p.y : p.x;
   const hits: number[] = [];
   if (elevation) hits.push(...polygon.map(projection));
   else for (let i=0;i<polygon.length;i++) {
    const a=polygon[i], b=polygon[(i+1)%polygon.length];
    if (Math.abs(a[axis] - position) < 1e-9) hits.push(projection(a));
    if ((a[axis] < position && b[axis] > position) || (a[axis] > position && b[axis] < position)) {
     const t=(position-a[axis])/(b[axis]-a[axis]);
     hits.push(projection({ x:a.x+t*(b.x-a.x), y:a.y+t*(b.y-a.y) }));
    }
   }
   if (hits.length < 2) return;
   const start=Math.min(...hits), end=Math.max(...hits), z=wall.floor*2.96+0.16+cell.y;
   if (end-start < 1e-9) return;
   result.push({ id:`wall:${wall.id}:section:${index}`, kind:"solid", points:[{u:start,z},{u:end,z},{u:end,z:z+cell.depth},{u:start,z:z+cell.depth}] });
  });
 }
 return result;
}

/** Schematic opening outlines; no invented manufacturer or leaf construction. */
export function documentationOpeningOutlines(walls: readonly DocumentationWall[], openings: readonly DocumentationOpening[], axis: "x" | "y", position: number, elevation = false): DrawingPrimitive[] {
 const result: DrawingPrimitive[] = [];
 for (const opening of openings) {
  const wall = walls.find(w => w.id === opening.wallId && w.floor === opening.floor);
  if (!wall) continue;
  const length = Math.hypot(wall.x2-wall.x1,wall.y2-wall.y1);
  const width = opening.width ?? (opening.type === "door" ? 0.9 : 1.2), height = opening.height ?? (opening.type === "door" ? 2.1 : 1.2), sill = opening.sillHeight ?? (opening.type === "door" ? 0 : 0.9);
  if (![length,width,height,sill,opening.offset].every(Number.isFinite) || length < 1e-9 || width <= 0 || height <= 0 || sill < 0 || opening.offset < 0 || opening.offset > 1 || sill >= 2.8) continue;
  const start = Math.max(0, opening.offset*length-width/2), end = Math.min(length, opening.offset*length+width/2);
  const ux = (wall.x2-wall.x1)/length, uy=(wall.y2-wall.y1)/length;
  const virtual = { ...wall, x1:wall.x1+ux*start, y1:wall.y1+uy*start, x2:wall.x1+ux*end, y2:wall.y1+uy*end };
  for (const shape of documentationWallSection([virtual], [], axis, position, elevation)) {
   const base=wall.floor*2.96+0.16;
   const points=shape.points.map(p => ({u:p.u,z:base+sill+(p.z-base>1e-9 ? Math.min(height,2.8-sill) : 0)}));
   result.push({ id:`opening:${opening.type}:${opening.id}`, kind:"opening", points:[...points,points[0]] });
  }
 }
 return result;
}
