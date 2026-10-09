type Wall = { id: string; x1: number; y1: number; x2: number; y2: number; thickness?: number };
type Opening = { x: number; y: number; roomId?: string; orientation: "horizontal" | "vertical"; type: "door" | "window"; width?: number; height?: number; sillHeight?: number };
export function openingVerticalBounds(opening: Pick<Opening, "type" | "height" | "sillHeight">, wallHeight: number) {
  const sill = opening.type === "door" ? 0 : opening.sillHeight ?? 0.9;
  const height = opening.height ?? (opening.type === "door" ? 2.1 : 1.2);
  if (![sill, height, wallHeight].every(Number.isFinite) || height <= 0 || wallHeight <= 0) return null;
  const bottom = Math.max(0, Math.min(wallHeight, sill));
  const top = Math.max(0, Math.min(wallHeight, sill + height));
  return top > bottom ? { bottom, top, height: top - bottom } : null;
}

export function splitWallVoids<W extends Wall>(wall: W, openings: Opening[], height: number) {
  const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1, length = Math.hypot(dx, dy);
  type Piece = { wall: W; zMin: number; zMax: number; kind: "solid" | "sill" | "lintel" };
  if (!Number.isFinite(length) || length < 1e-9 || !Number.isFinite(height) || height <= 0) return [] as Piece[];
  const holes = openings.flatMap(opening => {
    const linked = opening.roomId?.startsWith("custom-wall:");
    if (linked && opening.roomId !== `custom-wall:${wall.id}`) return [];
    if (!linked && ((opening.orientation === "horizontal" && Math.abs(dy) > 0.01) || (opening.orientation === "vertical" && Math.abs(dx) > 0.01))) return [];
    const along = ((opening.x - wall.x1) * dx + (opening.y - wall.y1) * dy) / length;
    const distance = Math.abs((opening.x - wall.x1) * dy - (opening.y - wall.y1) * dx) / length;
    if (!Number.isFinite(along) || !Number.isFinite(distance) || distance > 0.08 || along < 0 || along > length) return [];
    const width = opening.width ?? (opening.type === "door" ? 0.9 : 1.2);
    const vertical = openingVerticalBounds(opening, height);
    if (!Number.isFinite(width) || width <= 0 || !vertical) return [];
    const start = Math.max(0, along - width / 2), end = Math.min(length, along + width / 2);
    const { bottom, top } = vertical;
    return end > start && top > bottom ? [{ start, end, bottom, top }] : [];
  });
  const cuts = [...new Set([0, length, ...holes.flatMap(h => [h.start, h.end])])].sort((a, b) => a - b);
  const pieces: Piece[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    const start = cuts[i], end = cuts[i + 1], mid = (start + end) / 2;
    if (end - start < 1e-9) continue;
    const active = holes.filter(h => mid > h.start && mid < h.end).sort((a, b) => a.bottom - b.bottom);
    const segment = { ...wall, x1: wall.x1 + dx * start / length, y1: wall.y1 + dy * start / length, x2: wall.x1 + dx * end / length, y2: wall.y1 + dy * end / length };
    let cursor = 0;
    for (const hole of active) {
      if (hole.bottom > cursor + 1e-9) pieces.push({ wall: segment, zMin: cursor, zMax: hole.bottom, kind: cursor === 0 ? "sill" : "lintel" });
      cursor = Math.max(cursor, hole.top);
    }
    if (cursor < height - 1e-9) pieces.push({ wall: segment, zMin: cursor, zMax: height, kind: active.length ? "lintel" : "solid" });
  }
  return pieces;
}

export function alignOpeningPoint(point: { x: number; y: number }, opening: Opening, wall?: Wall) {
  if (!wall) return point;
  const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  if (length < 1e-9) return point;
  const ux = (wall.x2 - wall.x1) / length, uy = (wall.y2 - wall.y1) / length;
  const along = opening.orientation === "vertical" ? point.y - opening.y : point.x - opening.x;
  const across = opening.orientation === "vertical" ? -(point.x - opening.x) : point.y - opening.y;
  return { x: opening.x + ux * along - uy * across, y: opening.y + uy * along + ux * across };
}
export function alignOpeningSegment<T extends { x1: number; y1: number; x2: number; y2: number }>(segment: T, opening: Opening, wall?: Wall): T {
  const start = alignOpeningPoint({ x: segment.x1, y: segment.y1 }, opening, wall);
  const end = alignOpeningPoint({ x: segment.x2, y: segment.y2 }, opening, wall);
  return { ...segment, x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}
