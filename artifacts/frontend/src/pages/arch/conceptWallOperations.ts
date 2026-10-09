type Wall = { x1: number; y1: number; x2: number; y2: number };
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
