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

export type WallSnapKind = "intersection" | "endpoint" | "midpoint" | "alignment" | "perpendicular" | "none";

export type WallSnapResult = {
  point: WallNetworkPoint;
  kind: WallSnapKind;
  wallId?: string;
  distance: number;
};

export function snapPointToWallNetworkDetailed(
  raw: WallNetworkPoint,
  walls: WallNetworkSegment[],
  threshold = 0.35,
  excludeWallId?: string,
): WallSnapResult {
  const candidates: Array<WallSnapResult & { priority: number }> = [];
  const usableWalls = walls.filter((wall) => wall.id !== excludeWallId);

  const segmentIntersection = (a: WallNetworkSegment, b: WallNetworkSegment): WallNetworkPoint | null => {
    const r = { x: a.x2 - a.x1, y: a.y2 - a.y1 };
    const s = { x: b.x2 - b.x1, y: b.y2 - b.y1 };
    const cross = r.x * s.y - r.y * s.x;
    if (Math.abs(cross) < 0.000001) return null;
    const qMinusP = { x: b.x1 - a.x1, y: b.y1 - a.y1 };
    const t = (qMinusP.x * s.y - qMinusP.y * s.x) / cross;
    const u = (qMinusP.x * r.y - qMinusP.y * r.x) / cross;
    if (t < -0.001 || t > 1.001 || u < -0.001 || u > 1.001) return null;
    return { x: a.x1 + t * r.x, y: a.y1 + t * r.y };
  };

  for (let i = 0; i < usableWalls.length; i += 1) {
    for (let j = i + 1; j < usableWalls.length; j += 1) {
      const point = segmentIntersection(usableWalls[i], usableWalls[j]);
      if (!point) continue;
      const d = distance(raw, point);
      if (d <= threshold) candidates.push({ point, distance: d, priority: -3, kind: "intersection" });
    }
  }

  for (const wall of usableWalls) {
    const endpoints = [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 },
    ];

    for (const endpoint of endpoints) {
      const d = distance(raw, endpoint);
      if (d <= threshold) candidates.push({ point: endpoint, distance: d, priority: -2, kind: "endpoint", wallId: wall.id });
    }

    const midpoint = { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
    const midpointDistance = distance(raw, midpoint);
    if (midpointDistance <= threshold) {
      candidates.push({ point: midpoint, distance: midpointDistance, priority: -1, kind: "midpoint", wallId: wall.id });
    }

    for (const reference of [...endpoints, midpoint]) {
      const dxAlign = Math.abs(raw.x - reference.x);
      if (dxAlign <= threshold) {
        candidates.push({
          point: { x: reference.x, y: raw.y },
          distance: dxAlign,
          priority: 0,
          kind: "alignment",
          wallId: wall.id,
        });
      }
      const dyAlign = Math.abs(raw.y - reference.y);
      if (dyAlign <= threshold) {
        candidates.push({
          point: { x: raw.x, y: reference.y },
          distance: dyAlign,
          priority: 0,
          kind: "alignment",
          wallId: wall.id,
        });
      }
    }

    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared > 0.0001) {
      const tRaw = ((raw.x - wall.x1) * dx + (raw.y - wall.y1) * dy) / lengthSquared;
      const t = Math.max(0, Math.min(1, tRaw));
      const projected = { x: wall.x1 + dx * t, y: wall.y1 + dy * t };
      const d = distance(raw, projected);
      if (d <= threshold) candidates.push({ point: projected, distance: d, priority: 1, kind: "perpendicular", wallId: wall.id });
    }
  }

  candidates.sort((a, b) => a.priority - b.priority || a.distance - b.distance);
  const best = candidates[0];
  return best
    ? { point: best.point, kind: best.kind, wallId: best.wallId, distance: best.distance }
    : { point: raw, kind: "none", distance: Number.POSITIVE_INFINITY };
}

export function snapPointToWallNetwork(
  raw: WallNetworkPoint,
  walls: WallNetworkSegment[],
  threshold = 0.35,
  excludeWallId?: string,
): WallNetworkPoint {
  return snapPointToWallNetworkDetailed(raw, walls, threshold, excludeWallId).point;
}

export function wallLength(wall: WallNetworkSegment) {
  return Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
}

export function wallMidpoint(wall: WallNetworkSegment) {
  return { x: (wall.x1 + wall.x2) / 2, y: (wall.y1 + wall.y2) / 2 };
}



export type WallTopologyEndpointRef = {
  wallId: string;
  endpoint: "start" | "end";
};

export type WallTopologyNode = WallNetworkPoint & {
  id: string;
  segmentIds: string[];
  sourceWallIds: string[];
  endpointRefs: WallTopologyEndpointRef[];
};

export type WallTopologySegment = WallNetworkSegment & {
  sourceWallId: string;
};

export type WallTopology = {
  nodes: WallTopologyNode[];
  segments: WallTopologySegment[];
};

const topologyKey = (point: WallNetworkPoint) =>
  `${Math.round(point.x * 1000) / 1000}:${Math.round(point.y * 1000) / 1000}`;

const between = (value: number, a: number, b: number, epsilon = 0.001) =>
  value >= Math.min(a, b) - epsilon && value <= Math.max(a, b) + epsilon;

export function buildOrthogonalWallTopology(walls: WallNetworkSegment[]): WallTopology {
  const orthogonal = walls
    .filter((wall) => wallLength(wall) >= 0.05)
    .filter(
      (wall) =>
        Math.abs(wall.x1 - wall.x2) < 0.01 ||
        Math.abs(wall.y1 - wall.y2) < 0.01,
    );

  const splitPoints = new Map<string, WallNetworkPoint[]>();
  for (const wall of orthogonal) {
    splitPoints.set(wall.id, [
      { x: wall.x1, y: wall.y1 },
      { x: wall.x2, y: wall.y2 },
    ]);
  }

  for (let i = 0; i < orthogonal.length; i += 1) {
    for (let j = i + 1; j < orthogonal.length; j += 1) {
      const a = orthogonal[i];
      const b = orthogonal[j];
      const aHorizontal = Math.abs(a.y1 - a.y2) < 0.01;
      const bHorizontal = Math.abs(b.y1 - b.y2) < 0.01;

      if (aHorizontal !== bHorizontal) {
        const h = aHorizontal ? a : b;
        const v = aHorizontal ? b : a;
        const point = { x: v.x1, y: h.y1 };
        if (
          between(point.x, h.x1, h.x2) &&
          between(point.y, v.y1, v.y2)
        ) {
          splitPoints.get(a.id)?.push(point);
          splitPoints.get(b.id)?.push(point);
        }
        continue;
      }

      if (aHorizontal && Math.abs(a.y1 - b.y1) < 0.01) {
        for (const x of [a.x1, a.x2, b.x1, b.x2]) {
          if (between(x, a.x1, a.x2) && between(x, b.x1, b.x2)) {
            const point = { x, y: a.y1 };
            splitPoints.get(a.id)?.push(point);
            splitPoints.get(b.id)?.push(point);
          }
        }
      } else if (!aHorizontal && Math.abs(a.x1 - b.x1) < 0.01) {
        for (const y of [a.y1, a.y2, b.y1, b.y2]) {
          if (between(y, a.y1, a.y2) && between(y, b.y1, b.y2)) {
            const point = { x: a.x1, y };
            splitPoints.get(a.id)?.push(point);
            splitPoints.get(b.id)?.push(point);
          }
        }
      }
    }
  }

  const segments: WallTopologySegment[] = [];
  for (const wall of orthogonal) {
    const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
    const unique = new Map<string, WallNetworkPoint>();
    for (const point of splitPoints.get(wall.id) ?? []) {
      unique.set(topologyKey(point), point);
    }
    const ordered = [...unique.values()].sort((a, b) =>
      horizontal ? a.x - b.x : a.y - b.y,
    );
    for (let index = 0; index < ordered.length - 1; index += 1) {
      const start = ordered[index];
      const end = ordered[index + 1];
      if (distance(start, end) < 0.04) continue;
      segments.push({
        id: `${wall.id}:segment:${index}`,
        sourceWallId: wall.id,
        x1: start.x,
        y1: start.y,
        x2: end.x,
        y2: end.y,
      });
    }
  }

  const nodeMap = new Map<string, WallTopologyNode>();
  const ensureNode = (point: WallNetworkPoint) => {
    const key = topologyKey(point);
    let node = nodeMap.get(key);
    if (!node) {
      node = {
        id: `node:${key}`,
        x: point.x,
        y: point.y,
        segmentIds: [],
        sourceWallIds: [],
        endpointRefs: [],
      };
      nodeMap.set(key, node);
    }
    return node;
  };

  for (const segment of segments) {
    for (const point of [
      { x: segment.x1, y: segment.y1 },
      { x: segment.x2, y: segment.y2 },
    ]) {
      const node = ensureNode(point);
      if (!node.segmentIds.includes(segment.id)) node.segmentIds.push(segment.id);
      if (!node.sourceWallIds.includes(segment.sourceWallId)) {
        node.sourceWallIds.push(segment.sourceWallId);
      }
    }
  }

  for (const wall of orthogonal) {
    for (const [endpoint, point] of [
      ["start", { x: wall.x1, y: wall.y1 }],
      ["end", { x: wall.x2, y: wall.y2 }],
    ] as const) {
      const node = ensureNode(point);
      if (!node.endpointRefs.some((ref) => ref.wallId === wall.id && ref.endpoint === endpoint)) {
        node.endpointRefs.push({ wallId: wall.id, endpoint });
      }
    }
  }

  return {
    nodes: [...nodeMap.values()].sort((a, b) => a.y - b.y || a.x - b.x),
    segments,
  };
}

export type ClosedSpaceCell = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ClosedSpace = {
  id: string;
  area: number;
  centroid: WallNetworkPoint;
  cells: ClosedSpaceCell[];
  bounds: { x: number; y: number; width: number; height: number };
};

function uniqueSorted(values: number[]) {
  return [...new Set(values.map((value) => Math.round(value * 1000) / 1000))].sort((a, b) => a - b);
}

function coversVertical(
  wall: WallNetworkSegment,
  x: number,
  y1: number,
  y2: number,
  epsilon = 0.02,
) {
  if (Math.abs(wall.x1 - wall.x2) > epsilon || Math.abs(wall.x1 - x) > epsilon) return false;
  const minY = Math.min(wall.y1, wall.y2);
  const maxY = Math.max(wall.y1, wall.y2);
  return minY <= y1 + epsilon && maxY >= y2 - epsilon;
}

function coversHorizontal(
  wall: WallNetworkSegment,
  y: number,
  x1: number,
  x2: number,
  epsilon = 0.02,
) {
  if (Math.abs(wall.y1 - wall.y2) > epsilon || Math.abs(wall.y1 - y) > epsilon) return false;
  const minX = Math.min(wall.x1, wall.x2);
  const maxX = Math.max(wall.x1, wall.x2);
  return minX <= x1 + epsilon && maxX >= x2 - epsilon;
}

export function detectClosedSpaces(
  walls: WallNetworkSegment[],
  lotWidth: number,
  lotDepth: number,
): ClosedSpace[] {
  const topology = buildOrthogonalWallTopology(walls);
  const usableWalls = topology.segments;
  if (!usableWalls.length) return [];

  const xs = uniqueSorted([
    0,
    lotWidth,
    ...usableWalls.flatMap((wall) => [wall.x1, wall.x2]),
  ]).filter((value) => value >= 0 && value <= lotWidth);

  const ys = uniqueSorted([
    0,
    lotDepth,
    ...usableWalls.flatMap((wall) => [wall.y1, wall.y2]),
  ]).filter((value) => value >= 0 && value <= lotDepth);

  if (xs.length < 2 || ys.length < 2) return [];

  type Cell = ClosedSpaceCell & {
    ix: number;
    iy: number;
    outside: boolean;
    group: number;
  };

  const cells: Cell[][] = [];
  for (let iy = 0; iy < ys.length - 1; iy += 1) {
    const row: Cell[] = [];
    for (let ix = 0; ix < xs.length - 1; ix += 1) {
      row.push({
        ix,
        iy,
        x: xs[ix],
        y: ys[iy],
        width: xs[ix + 1] - xs[ix],
        height: ys[iy + 1] - ys[iy],
        outside: false,
        group: -1,
      });
    }
    cells.push(row);
  }

  const neighbors = (cell: Cell) => {
    const result: Cell[] = [];
    const { ix, iy } = cell;
    const x1 = xs[ix];
    const x2 = xs[ix + 1];
    const y1 = ys[iy];
    const y2 = ys[iy + 1];

    if (ix > 0 && !usableWalls.some((wall) => coversVertical(wall, x1, y1, y2))) {
      result.push(cells[iy][ix - 1]);
    }
    if (ix < xs.length - 2 && !usableWalls.some((wall) => coversVertical(wall, x2, y1, y2))) {
      result.push(cells[iy][ix + 1]);
    }
    if (iy > 0 && !usableWalls.some((wall) => coversHorizontal(wall, y1, x1, x2))) {
      result.push(cells[iy - 1][ix]);
    }
    if (iy < ys.length - 2 && !usableWalls.some((wall) => coversHorizontal(wall, y2, x1, x2))) {
      result.push(cells[iy + 1][ix]);
    }
    return result;
  };

  const outsideQueue: Cell[] = [];
  for (const row of cells) {
    for (const cell of row) {
      const x1 = xs[cell.ix];
      const x2 = xs[cell.ix + 1];
      const y1 = ys[cell.iy];
      const y2 = ys[cell.iy + 1];

      const exposedLeft =
        cell.ix === 0 &&
        !usableWalls.some((wall) => coversVertical(wall, x1, y1, y2));
      const exposedRight =
        cell.ix === xs.length - 2 &&
        !usableWalls.some((wall) => coversVertical(wall, x2, y1, y2));
      const exposedTop =
        cell.iy === 0 &&
        !usableWalls.some((wall) => coversHorizontal(wall, y1, x1, x2));
      const exposedBottom =
        cell.iy === ys.length - 2 &&
        !usableWalls.some((wall) => coversHorizontal(wall, y2, x1, x2));

      if (exposedLeft || exposedRight || exposedTop || exposedBottom) {
        cell.outside = true;
        outsideQueue.push(cell);
      }
    }
  }

  for (let cursor = 0; cursor < outsideQueue.length; cursor += 1) {
    const cell = outsideQueue[cursor];
    for (const next of neighbors(cell)) {
      if (next.outside) continue;
      next.outside = true;
      outsideQueue.push(next);
    }
  }

  const spaces: ClosedSpace[] = [];
  let group = 0;

  for (const row of cells) {
    for (const cell of row) {
      if (cell.outside || cell.group >= 0) continue;

      const queue = [cell];
      cell.group = group;
      const groupCells: Cell[] = [];

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const current = queue[cursor];
        groupCells.push(current);
        for (const next of neighbors(current)) {
          if (next.outside || next.group >= 0) continue;
          next.group = group;
          queue.push(next);
        }
      }

      const area = groupCells.reduce((sum, item) => sum + item.width * item.height, 0);
      if (area < 0.5) {
        group += 1;
        continue;
      }

      const centroid = groupCells.reduce(
        (acc, item) => {
          const cellArea = item.width * item.height;
          acc.x += (item.x + item.width / 2) * cellArea;
          acc.y += (item.y + item.height / 2) * cellArea;
          return acc;
        },
        { x: 0, y: 0 },
      );
      centroid.x /= area;
      centroid.y /= area;

      const minX = Math.min(...groupCells.map((item) => item.x));
      const minY = Math.min(...groupCells.map((item) => item.y));
      const maxX = Math.max(...groupCells.map((item) => item.x + item.width));
      const maxY = Math.max(...groupCells.map((item) => item.y + item.height));

      spaces.push({
        id: `closed-space-${group}`,
        area,
        centroid,
        cells: groupCells.map(({ x, y, width, height }) => ({ x, y, width, height })),
        bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
      });

      group += 1;
    }
  }

  return spaces.sort((a, b) => b.area - a.area);
}