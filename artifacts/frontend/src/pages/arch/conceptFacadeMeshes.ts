import type { FacadeDesignState, FacadeMaterialId } from "./conceptFacadeDesign";
import type { SiteFrontSide } from "./conceptSitePlacement";

export type FacadeMeshBox = { id: string; width: number; height: number; depth: number; x: number; y: number; z: number; materialId: FacadeMaterialId; opacity: number };

/** Metric projections shared with the facade's percentage coordinate system. */
export function buildFacadeMeshBoxes(design: FacadeDesignState, bounds: {
  minX: number; maxX: number; minZ: number; maxZ: number;
}, buildingHeight: number, front: SiteFrontSide): FacadeMeshBox[] {
  const boxes: FacadeMeshBox[] = [];
  const horizontal = front === "top" || front === "bottom";
  const start = horizontal ? bounds.minX : bounds.minZ;
  const end = horizontal ? bounds.maxX : bounds.maxZ;
  const span = end - start;
  const reverse = front === "bottom" || front === "left";
  for (const volume of design.volumes) {
    const w = span * volume.width / 100;
    const h = buildingHeight * volume.height / 100;
    const d = Math.max(0.02, volume.depth);
    const left = span * volume.x / 100;
    const top = buildingHeight * (1 - volume.y / 100);
    if (![w, h, d, left, top].every(Number.isFinite) || w <= 0 || h <= 0) continue;
    const add = (dx: number, dy: number, width: number, height: number, depth = d) => {
      const axis = reverse ? end - left - dx - width / 2 : start + left + dx + width / 2;
      const frontPosition = front === "top" ? bounds.minZ - depth / 2
        : front === "bottom" ? bounds.maxZ + depth / 2
        : front === "left" ? bounds.minX - depth / 2 : bounds.maxX + depth / 2;
      boxes.push({ id: volume.id, width: horizontal ? width : depth, height,
        depth: horizontal ? depth : width, x: horizontal ? axis : frontPosition,
        y: top - dy - height / 2, z: horizontal ? frontPosition : axis,
        materialId: volume.materialId, opacity: volume.opacity ?? 1 });
    };
    if (volume.kind === "portal" || volume.kind === "frame") {
      const edge = Math.min(0.18, w / 5, h / 5);
      add(0, 0, w, edge); add(0, edge, edge, h - edge); add(w - edge, edge, edge, h - edge);
      if (volume.kind === "frame") add(edge, h - edge, w - 2 * edge, edge);
    } else if (volume.kind === "slats" || volume.kind === "gate") {
      const count = Math.max(3, Math.ceil(w / 0.15));
      for (let i = 0; i < count; i++) add(i * w / count, 0, w / count * 0.45, h);
    } else if (volume.kind === "pergola") {
      const beam = Math.min(0.12, h / 4, w / 8);
      add(0, 0, w, beam);
      for (let i = 0; i < 6; i++) add(i * (w - beam) / 5, 0, beam, h);
    } else if (volume.kind === "balcony") {
      add(0, h * 0.8, w, h * 0.2);
      add(0, 0, w, h * 0.8, Math.min(d, 0.08));
    } else {
      add(0, 0, w, h);
    }
  }
  return boxes;
}
