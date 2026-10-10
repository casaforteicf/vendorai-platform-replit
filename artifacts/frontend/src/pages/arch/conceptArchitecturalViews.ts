import type { ArchitecturalModel } from "./conceptArchitecturalModel";

/** Shared readonly projections; metres in plan, elevation in 3D.
 * No React or renderer dependency: both views receive the same model snapshot. */
export type PlanPrimitive = {
  id: string;
  kind: "slab" | "slab-void" | "stair" | "roof";
  floor: number | null;
  x: number; y: number; width: number; depth: number;
};
export type SolidPrimitive = {
  id: string;
  kind: "slab" | "stair-step" | "roof-plane";
  floor: number | null;
  x: number; y: number; z: number;
  width: number; depth: number; height: number;
};
const valid = (...values: number[]) => values.every(Number.isFinite);

export function architecturalPlanPrimitives(model: ArchitecturalModel): PlanPrimitive[] {
  const items: PlanPrimitive[] = [];
  for (const slab of model.slabs) {
    items.push({ id: slab.id, kind: "slab", floor: slab.floor, x: slab.x, y: slab.y, width: slab.width, depth: slab.depth });
    slab.voids.forEach((opening, index) => items.push({ id: `${slab.id}:void:${index}`, kind: "slab-void", floor: slab.floor, ...opening }));
  }
  for (const stair of model.stairs) items.push({ id: stair.id, kind: "stair", floor: stair.floor, x: stair.x, y: stair.y, width: stair.width, depth: stair.run });
  for (const roof of model.roofs) items.push({ id: roof.id, kind: "roof", floor: null, x: roof.x - roof.overhang, y: roof.y - roof.overhang, width: roof.width + 2 * roof.overhang, depth: roof.depth + 2 * roof.overhang });
  return items;
}
/** Orthogonal slab cells subtract rectangular shafts, keeping openings clear in 3D. */
function slabCells(x: number, y: number, width: number, depth: number, holes: { x: number; y: number; width: number; depth: number }[]) {
  const xs = [...new Set([x, x + width, ...holes.flatMap(h => [h.x, h.x + h.width])])].sort((a, b) => a - b);
  const ys = [...new Set([y, y + depth, ...holes.flatMap(h => [h.y, h.y + h.depth])])].sort((a, b) => a - b);
  const cells: { x: number; y: number; width: number; depth: number }[] = [];
  for (let ix = 0; ix < xs.length - 1; ix++) for (let iy = 0; iy < ys.length - 1; iy++) {
    const x0 = xs[ix], y0 = ys[iy], w = xs[ix + 1] - x0, d = ys[iy + 1] - y0;
    if (w <= 1e-9 || d <= 1e-9) continue;
    const cx = x0 + w / 2, cy = y0 + d / 2;
    if (holes.some(h => cx > h.x && cx < h.x + h.width && cy > h.y && cy < h.y + h.depth)) continue;
    cells.push({ x: x0, y: y0, width: w, depth: d });
  }
  return cells;
}
export function architecturalSolidPrimitives(model: ArchitecturalModel): SolidPrimitive[] {
  const solids: SolidPrimitive[] = [];
  for (const slab of model.slabs) {
    slabCells(slab.x, slab.y, slab.width, slab.depth, slab.voids).forEach((cell, index) => solids.push({
      id: `${slab.id}:solid:${index}`, kind: "slab", floor: slab.floor, ...cell,
      z: slab.elevation - slab.thickness, height: slab.thickness,
    }));
  }
  for (const stair of model.stairs) {
    const steps = Math.max(2, Math.round(stair.rise / (stair.preferredRiser ?? 0.175)));
    const riser = stair.rise / steps, tread = stair.run / (steps - 1);
    if (!valid(riser, tread) || riser <= 0 || tread <= 0) continue;
    for (let index = 0; index < steps - 1; index++) solids.push({
      id: `${stair.id}:step:${index}`, kind: "stair-step", floor: stair.floor,
      x: stair.x, y: stair.y + index * tread, z: index * riser,
      width: stair.width, depth: tread, height: (index + 1) * riser,
    });
  }
  for (const roof of model.roofs) {
    const span = roof.type === "gable" ? roof.depth / 2 : roof.type === "mono" ? roof.depth : 0;
    const rise = Math.tan(roof.pitchDegrees * Math.PI / 180) * span;
    solids.push({ id: roof.id, kind: "roof-plane", floor: null,
      x: roof.x - roof.overhang, y: roof.y - roof.overhang, z: roof.elevation,
      width: roof.width + 2 * roof.overhang, depth: roof.depth + 2 * roof.overhang, height: rise });
  }
  return solids;
}
