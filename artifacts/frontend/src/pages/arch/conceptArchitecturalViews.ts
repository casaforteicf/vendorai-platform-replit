import { architecturalSlabVoids, rectangularSolidCells } from "./conceptArchitecturalSlabVoids";
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
    architecturalSlabVoids(model, slab).forEach((opening, index) => items.push({ id: `${slab.id}:void:${index}`, kind: "slab-void", floor: slab.floor, ...opening }));
  }
  for (const stair of model.stairs) items.push({ id: stair.id, kind: "stair", floor: stair.floor, x: stair.x, y: stair.y, width: stair.width, depth: stair.run });
  for (const roof of model.roofs) items.push({ id: roof.id, kind: "roof", floor: null, x: roof.x - roof.overhang, y: roof.y - roof.overhang, width: roof.width + 2 * roof.overhang, depth: roof.depth + 2 * roof.overhang });
  return items;
}
export function architecturalSolidPrimitives(model: ArchitecturalModel): SolidPrimitive[] {
  const solids: SolidPrimitive[] = [];
  for (const slab of model.slabs) {
    rectangularSolidCells(slab, architecturalSlabVoids(model, slab)).forEach((cell, index) => solids.push({
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
      x: stair.x, y: stair.y + index * tread, z: 0,
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


export type ArchitecturalScene = { boxes: SolidPrimitive[]; roofFaces: { id: string; vertices: { x: number; y: number; z: number }[] }[] };
/** Absolute world elevations for both official 3D renderers. */
export function architecturalSceneGeometry(model: ArchitecturalModel, floor: number, allFloors: boolean, showRoof: boolean): ArchitecturalScene {
  const boxes = architecturalSolidPrimitives(model).filter(item => item.kind !== "roof-plane" && (allFloors || item.floor === floor))
    .map(item => item.kind === "stair-step" ? { ...item, z: item.z + (item.floor ?? 0) * 2.96 + 0.16 } : item);
  const roofFaces: ArchitecturalScene["roofFaces"] = [];
  if (showRoof) for (const roof of model.roofs) {
    const x0 = roof.x - roof.overhang, x1 = roof.x + roof.width + roof.overhang;
    const y0 = roof.y - roof.overhang, y1 = roof.y + roof.depth + roof.overhang;
    const slope = Math.tan(roof.pitchDegrees * Math.PI / 180);
    const heightAt = (y: number) => roof.elevation + (roof.type === "flat" ? 0 : roof.type === "mono" ? y - roof.y : Math.min(y - roof.y, roof.y + roof.depth - y)) * slope;
    const face = (start: number, end: number, index: number) => roofFaces.push({ id: `${roof.id}:face:${index}`, vertices: [
      { x: x0, y: start, z: heightAt(start) }, { x: x1, y: start, z: heightAt(start) },
      { x: x1, y: end, z: heightAt(end) }, { x: x0, y: end, z: heightAt(end) },
    ] });
    if (roof.type === "gable") { const ridge = roof.y + roof.depth / 2; face(y0, ridge, 0); face(ridge, y1, 1); }
    else face(y0, y1, 0);
  }
  return { boxes, roofFaces };
}

/** Keep generated room finishes clear wherever the authored floor has a shaft. */
export function architecturalFloorCells(model: ArchitecturalModel | undefined, floor: number, cell: { x: number; y: number; width: number; height: number }) {
  const holes = (model?.slabs ?? []).filter(slab => slab.floor === floor).flatMap(slab => architecturalSlabVoids(model!, slab))
    .map(hole => {
      const x = Math.max(cell.x, hole.x), y = Math.max(cell.y, hole.y);
      return { x, y, width: Math.min(cell.x + cell.width, hole.x + hole.width) - x,
        depth: Math.min(cell.y + cell.height, hole.y + hole.depth) - y };
    }).filter(hole => hole.width > 0 && hole.depth > 0);
  if (!holes.length) return [cell];
  return rectangularSolidCells({ x: cell.x, y: cell.y, width: cell.width, depth: cell.height }, holes)
    .map(piece => ({ x: piece.x, y: piece.y, width: piece.width, height: piece.depth }));
}

