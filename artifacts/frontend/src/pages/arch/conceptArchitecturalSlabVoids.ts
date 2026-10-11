import type { ArchitecturalModel } from "./conceptArchitecturalModel";
import type { Rect, Slab } from "./conceptArchitecturalElements";

/** Derived cuts never overwrite authored openings. Moving/removing stairs regenerates them. */
export function architecturalSlabVoids(model: ArchitecturalModel, slab: Slab): Rect[] {
  const stairCuts = model.stairs.filter(stair => stair.floor + 1 === slab.floor && stair.openSlab !== false)
    .map(stair => ({ x: stair.x, y: stair.y, width: stair.width, depth: stair.run }));
  return [...slab.voids, ...stairCuts].map(hole => {
    const x = Math.max(slab.x, hole.x), y = Math.max(slab.y, hole.y);
    return { x, y, width: Math.min(slab.x + slab.width, hole.x + hole.width) - x,
      depth: Math.min(slab.y + slab.depth, hole.y + hole.depth) - y };
  }).filter(hole => hole.width > 1e-9 && hole.depth > 1e-9);
}

/** Subtract the union of cuts, so overlapping manual/stair openings count only once. */
export function rectangularSolidCells(rect: Rect, holes: Rect[]): Rect[] {
  const xs = [...new Set([rect.x, rect.x + rect.width, ...holes.flatMap(h => [h.x, h.x + h.width])])].sort((a, b) => a - b);
  const ys = [...new Set([rect.y, rect.y + rect.depth, ...holes.flatMap(h => [h.y, h.y + h.depth])])].sort((a, b) => a - b);
  const cells: Rect[] = [];
  for (let ix = 0; ix < xs.length - 1; ix++) for (let iy = 0; iy < ys.length - 1; iy++) {
    const x = xs[ix], y = ys[iy], width = xs[ix + 1] - x, depth = ys[iy + 1] - y;
    if (width <= 1e-9 || depth <= 1e-9) continue;
    const cx = x + width / 2, cy = y + depth / 2;
    if (cx < rect.x || cx > rect.x + rect.width || cy < rect.y || cy > rect.y + rect.depth) continue;
    if (holes.some(h => cx > h.x && cx < h.x + h.width && cy > h.y && cy < h.y + h.depth)) continue;
    cells.push({ x, y, width, depth });
  }
  return cells;
}
