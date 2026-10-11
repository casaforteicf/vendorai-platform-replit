type Wall = { x1: number; y1: number; x2: number; y2: number };
type LinkedOpening = { wallId: string; offset: number; width?: number; type: "door" | "window" };
export function splitWallWithOpenings<W extends Wall & { id: string }, O extends LinkedOpening>(wall: W, openings: O[], secondWallId: string): { walls: W[]; openings: O[] } | null {
  const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
  if (!Number.isFinite(length) || length < 1 || openingCrossesWallMidpoint(length, openings.filter(o => o.wallId === wall.id))) return null;
  const midpoint = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
  return {
    walls: [{ ...wall, x2: midpoint.x, y2: midpoint.y }, { ...wall, id: secondWallId, x1: midpoint.x, y1: midpoint.y }],
    openings: openings.map(opening => opening.wallId !== wall.id ? opening : opening.offset < 0.5
      ? { ...opening, offset: opening.offset * 2 }
      : { ...opening, wallId: secondWallId, offset: (opening.offset - 0.5) * 2 }),
  };
}
export function duplicateWallPlacement(wall: Wall, width: number, depth: number) {
  const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return null;
  for (const direction of [1, -1]) {
    const ox = -dy / length * 0.25 * direction, oy = dx / length * 0.25 * direction;
    const next = { x1: wall.x1 + ox, y1: wall.y1 + oy, x2: wall.x2 + ox, y2: wall.y2 + oy };
    if ([next.x1, next.x2].every(x => x >= 0 && x <= width) && [next.y1, next.y2].every(y => y >= 0 && y <= depth)) return next;
  }
  return null;
}
export function openingCrossesWallMidpoint(length: number, openings: Array<{ offset: number; width?: number; type: "door" | "window" }>) {
  return openings.some(opening => Math.abs(opening.offset * length - length / 2) < (opening.width ?? (opening.type === "door" ? 0.9 : 1.2)) / 2 - 1e-9);
}
