type Point = { x: number; y: number };

/** Exact metric length: never silently clip or round a user's measurement. */
export function measuredWallEnd(start: Point, directionPoint: Point, input: string, bounds: { width: number; depth: number }): { end: Point } | { error: string } {
  const text = input.trim();
  const length = /^\d+(?:[.,]\d+)?$/.test(text) ? Number(text.replace(",", ".")) : NaN;
  if (!Number.isFinite(length) || length < 0.5) return { error: "Informe um comprimento de pelo menos 0,50 m." };
  const dx = directionPoint.x - start.x;
  const dy = directionPoint.y - start.y;
  const magnitude = Math.hypot(dx, dy);
  if (magnitude < 0.001) return { error: "Indique a direção da parede na planta antes de aplicar a medida." };
  const end = { x: start.x + dx / magnitude * length, y: start.y + dy / magnitude * length };
  if (end.x < 0 || end.x > bounds.width || end.y < 0 || end.y > bounds.depth) return { error: "A medida ultrapassa a área de desenho. Amplie a área ou ajuste a direção." };
  return { end };
}

/** Network snap has priority over the grid, preserving imported metric coordinates. */
export function boundSnappedWallPoint(point: Point, bounds: { width: number; depth: number }) {
  return { x: Math.max(0, Math.min(bounds.width, point.x)), y: Math.max(0, Math.min(bounds.depth, point.y)) };
}
