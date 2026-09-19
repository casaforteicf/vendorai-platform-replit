export type WallNetworkSegment = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type WallNetworkPoint = { x: number; y: number };

const distance = (a: WallNetworkPoint, b: WallNetworkPoint) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export function orthogonalEnd(start: WallNetworkPoint, raw: WallNetworkPoint) {
  const dx = Math.abs(raw.x - start.x);
  const dy = Math.abs(raw.y - start.y);
  return dx >= dy ? { x: raw.x, y: start.y } : { x: start.x, y: raw.y };
}

export function snapPointToWallNetwork(
  raw: WallNetworkPoint,
  walls: WallNetworkSegment[],
  threshold = 0.35,
  excludeWallId?: string,
): WallNetworkPoint {
  const candidates: Array<{ point: WallNetworkPoint; distance: number; priority: number }> = [];

  for (const wall of walls) {
    if (wall.id === excludeWallId) continue;

    const endpoints = [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 },
    ];

    for (const endpoint of endpoints) {
      const d = distance(raw, endpoint);
      if (d <= threshold) candidates.push({ point: endpoint, distance: d, priority: 0 });
    }

    const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
    const vertical = Math.abs(wall.x1 - wall.x2) < 0.01;

    if (horizontal) {
      const minX = Math.min(wall.x1, wall.x2);
      const maxX = Math.max(wall.x1, wall.x2);
      const projected = { x: Math.max(minX, Math.min(maxX, raw.x)), y: wall.y1 };
      const d = distance(raw, projected);
      if (d <= threshold) candidates.push({ point: projected, distance: d, priority: 1 });
    } else if (vertical) {
      const minY = Math.min(wall.y1, wall.y2);
      const maxY = Math.max(wall.y1, wall.y2);
      const projected = { x: wall.x1, y: Math.max(minY, Math.min(maxY, raw.y)) };
      const d = distance(raw, projected);
      if (d <= threshold) candidates.push({ point: projected, distance: d, priority: 1 });
    }
  }

  candidates.sort((a, b) => a.priority - b.priority || a.distance - b.distance);
  return candidates[0]?.point ?? raw;
}

export function wallLength(wall: WallNetworkSegment) {
  return Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
}

export function wallMidpoint(wall: WallNetworkSegment) {
  return { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
}
