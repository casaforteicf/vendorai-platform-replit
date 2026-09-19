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
  const usableWalls = walls.filter((wall) => wallLength(wall) >= 0.05);
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
