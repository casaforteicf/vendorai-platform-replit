import type { ArchitecturalModel } from "./conceptArchitecturalModel";
import { architecturalSceneGeometry } from "./conceptArchitecturalViews";
export type DrawingPrimitive = { id: string; kind: "solid" | "roof" | "opening"; points: { u: number; z: number }[] };
/** Slice all storeys in absolute metres. Elevations are orthographic projections. */
export function architecturalSection(model: ArchitecturalModel, axis: "x" | "y", position: number, elevation = false): DrawingPrimitive[] {
  if (!Number.isFinite(position)) return [];
  const scene = architecturalSceneGeometry(model, 0, true, true);
  const items: DrawingPrimitive[] = [];
  for (const box of scene.boxes) {
    const start = box[axis], size = axis === "x" ? box.width : box.depth;
    if (!elevation && (position < start || position >= start + size)) continue;
    const u = axis === "x" ? box.y : box.x, length = axis === "x" ? box.depth : box.width;
    items.push({ id: box.id, kind: "solid", points: [{ u, z: box.z }, { u: u + length, z: box.z }, { u: u + length, z: box.z + box.height }, { u, z: box.z + box.height }] });
  }
  for (const face of scene.roofFaces) {
    const projected = (p: { x: number; y: number; z: number }) => ({ u: axis === "x" ? p.y : p.x, z: p.z });
    if (elevation) { items.push({ id: face.id, kind: "roof", points: face.vertices.map(projected) }); continue; }
    const hits: { u: number; z: number }[] = [];
    for (let i = 0; i < face.vertices.length; i++) {
      const a = face.vertices[i], b = face.vertices[(i + 1) % face.vertices.length];
      if (a[axis] === position) hits.push(projected(a));
      if ((a[axis] < position && b[axis] > position) || (a[axis] > position && b[axis] < position)) {
        const t = (position - a[axis]) / (b[axis] - a[axis]);
        hits.push(projected({ x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), z: a.z + t * (b.z - a.z) }));
      }
    }
    const unique = hits.filter((p, i) => hits.findIndex(q => Math.abs(p.u - q.u) < 1e-9 && Math.abs(p.z - q.z) < 1e-9) === i);
    if (unique.length >= 2) items.push({ id: face.id, kind: "roof", points: unique });
  }
  return items;
}

/** Plan footprints with slab cuts derived from the same solid cells as 3D. */
export function architecturalDocumentationPlan(model: ArchitecturalModel, floor: number): DrawingPrimitive[] {
  if (!Number.isInteger(floor) || floor < 0) return [];
  const scene = architecturalSceneGeometry(model, floor, false, false);
  const rectangles = scene.boxes.filter(box => box.kind === "slab").map(box => ({ id: box.id, x: box.x, y: box.y, width: box.width, depth: box.depth }));
  rectangles.push(...model.stairs.filter(stair => stair.floor === floor).map(stair => ({ id: stair.id, x: stair.x, y: stair.y, width: stair.width, depth: stair.run })));
  return rectangles.map(rect => ({ id: rect.id, kind: "solid", points: [{ u: rect.x, z: -rect.y }, { u: rect.x + rect.width, z: -rect.y }, { u: rect.x + rect.width, z: -rect.y - rect.depth }, { u: rect.x, z: -rect.y - rect.depth }] }));
}
