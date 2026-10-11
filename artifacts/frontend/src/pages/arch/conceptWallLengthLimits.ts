/** Maximum length in the existing direction, anchored at the wall start. */
export function wallLengthLimit(wall: { x1: number; y1: number; x2: number; y2: number }, width: number, depth: number) {
  if (![wall.x1, wall.y1, wall.x2, wall.y2, width, depth].every(Number.isFinite) || width <= 0 || depth <= 0) return 0;
  const dx = wall.x2 - wall.x1, dy = wall.y2 - wall.y1;
  const length = Math.hypot(dx, dy);
  if (length < 0.001) return 0;
  const ux = dx / length, uy = dy / length;
  const xLimit = ux > 1e-10 ? (width - wall.x1) / ux : ux < -1e-10 ? -wall.x1 / ux : Infinity;
  const yLimit = uy > 1e-10 ? (depth - wall.y1) / uy : uy < -1e-10 ? -wall.y1 / uy : Infinity;
  return Math.max(0, Math.min(xLimit, yLimit));
}
