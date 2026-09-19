export type StairShape = "straight" | "l" | "u";
export type StairDirection = "north" | "south" | "east" | "west";

export type StairParameters = {
  stairShape?: StairShape;
  stairDirection?: StairDirection;
  stairFloorToFloorHeight?: number;
  stairRiserCount?: number;
  stairTreadDepth?: number;
  stairFlightWidth?: number;
  stairLandingDepth?: number;
};

export type StairCarrier = {
  id: string;
  floor: number;
  x: number;
  y: number;
  width: number;
  depth: number;
} & StairParameters;

export type NormalizedStairParameters = {
  stairShape: StairShape;
  stairDirection: StairDirection;
  stairFloorToFloorHeight: number;
  stairRiserCount: number;
  stairTreadDepth: number;
  stairFlightWidth: number;
  stairLandingDepth: number;
  riserHeight: number;
  treadCount: number;
};

export type StairTread = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  rise: number;
};

export type StairLanding = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  rise: number;
};

export type StairSlabOpening = {
  id: string;
  stairId: string;
  sourceFloor: number;
  targetFloor: number;
  x: number;
  y: number;
  width: number;
  depth: number;
};

export const STAIR_LEVEL_HEIGHT = 2.96;

const SHAPES = new Set<StairShape>(["straight", "l", "u"]);
const DIRECTIONS = new Set<StairDirection>(["north", "south", "east", "west"]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function defaultStairSourceParameters(): Required<StairParameters> {
  return {
    stairShape: "straight",
    stairDirection: "north",
    stairFloorToFloorHeight: STAIR_LEVEL_HEIGHT,
    stairRiserCount: 17,
    stairTreadDepth: 0.28,
    stairFlightWidth: 1,
    stairLandingDepth: 1,
  };
}

export function defaultStairParameters(): NormalizedStairParameters {
  const source = defaultStairSourceParameters();
  return {
    ...source,
    riserHeight: source.stairFloorToFloorHeight / source.stairRiserCount,
    treadCount: source.stairRiserCount - 1,
  };
}

export function normalizeStairParameters(source: StairParameters & Partial<Pick<StairCarrier, "width" | "depth">>): NormalizedStairParameters {
  const defaults = defaultStairParameters();
  const stairFloorToFloorHeight = clamp(
    finiteOr(source.stairFloorToFloorHeight, defaults.stairFloorToFloorHeight),
    2.4,
    4.5,
  );
  const stairRiserCount = Math.round(clamp(
    finiteOr(source.stairRiserCount, defaults.stairRiserCount),
    12,
    30,
  ));
  const maxFlightWidth = Math.max(
    0.8,
    Math.min(
      2.4,
      finiteOr(source.width, 2.4),
      finiteOr(source.depth, 2.4),
    ),
  );
  const stairFlightWidth = clamp(
    finiteOr(source.stairFlightWidth, defaults.stairFlightWidth),
    0.8,
    maxFlightWidth,
  );

  return {
    stairShape: source.stairShape && SHAPES.has(source.stairShape)
      ? source.stairShape
      : defaults.stairShape,
    stairDirection: source.stairDirection && DIRECTIONS.has(source.stairDirection)
      ? source.stairDirection
      : defaults.stairDirection,
    stairFloorToFloorHeight,
    stairRiserCount,
    stairTreadDepth: clamp(finiteOr(source.stairTreadDepth, defaults.stairTreadDepth), 0.22, 0.36),
    stairFlightWidth,
    stairLandingDepth: clamp(finiteOr(source.stairLandingDepth, defaults.stairLandingDepth), 0.8, 2.5),
    riserHeight: stairFloorToFloorHeight / stairRiserCount,
    treadCount: Math.max(1, stairRiserCount - 1),
  };
}

export function riserCountForTargetHeight(floorToFloorHeight: number, targetRiserHeight: number) {
  const height = clamp(finiteOr(floorToFloorHeight, STAIR_LEVEL_HEIGHT), 2.4, 4.5);
  const target = clamp(finiteOr(targetRiserHeight, 0.175), 0.12, 0.24);
  return Math.round(clamp(Math.round(height / target), 12, 30));
}

type NormalizedPoint = { u: number; v: number };
type PathSegment = {
  start: { x: number; y: number };
  end: { x: number; y: number };
  length: number;
};

function transformPoint(point: NormalizedPoint, direction: StairDirection): NormalizedPoint {
  if (direction === "south") return { u: 1 - point.u, v: 1 - point.v };
  if (direction === "east") return { u: 1 - point.v, v: point.u };
  if (direction === "west") return { u: point.v, v: 1 - point.u };
  return point;
}

function normalizedPath(shape: StairShape): NormalizedPoint[] {
  if (shape === "l") {
    return [
      { u: 0.25, v: 0.92 },
      { u: 0.25, v: 0.25 },
      { u: 0.82, v: 0.25 },
    ];
  }
  if (shape === "u") {
    return [
      { u: 0.25, v: 0.92 },
      { u: 0.25, v: 0.18 },
      { u: 0.75, v: 0.18 },
      { u: 0.75, v: 0.82 },
    ];
  }
  return [
    { u: 0.5, v: 0.94 },
    { u: 0.5, v: 0.06 },
  ];
}

function stairPath(stair: StairCarrier) {
  const params = normalizeStairParameters(stair);
  const points = normalizedPath(params.stairShape)
    .map((point) => transformPoint(point, params.stairDirection))
    .map((point) => ({
      x: stair.x + point.u * stair.width,
      y: stair.y + point.v * stair.depth,
    }));

  const segments: PathSegment[] = [];
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    segments.push({
      start,
      end,
      length: Math.max(0.001, Math.hypot(end.x - start.x, end.y - start.y)),
    });
  }
  return { params, points, segments };
}

function pointAlongPath(segments: PathSegment[], distance: number) {
  let remaining = Math.max(0, distance);
  for (const segment of segments) {
    if (remaining <= segment.length) {
      const ratio = segment.length <= 0.001 ? 0 : remaining / segment.length;
      return {
        x: segment.start.x + (segment.end.x - segment.start.x) * ratio,
        y: segment.start.y + (segment.end.y - segment.start.y) * ratio,
        horizontal: Math.abs(segment.end.x - segment.start.x) >= Math.abs(segment.end.y - segment.start.y),
      };
    }
    remaining -= segment.length;
  }
  const last = segments[segments.length - 1];
  return {
    x: last?.end.x ?? 0,
    y: last?.end.y ?? 0,
    horizontal: last ? Math.abs(last.end.x - last.start.x) >= Math.abs(last.end.y - last.start.y) : false,
  };
}

export function buildStairTreads(stair: StairCarrier): StairTread[] {
  const { params, segments } = stairPath(stair);
  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  if (!segments.length || totalLength <= 0.001) return [];

  const spacing = totalLength / params.treadCount;
  const actualTreadDepth = Math.max(0.08, Math.min(params.stairTreadDepth, spacing * 0.92));

  return Array.from({ length: params.treadCount }, (_, index) => {
    const center = pointAlongPath(segments, spacing * (index + 0.5));
    const width = center.horizontal ? actualTreadDepth : params.stairFlightWidth;
    const depth = center.horizontal ? params.stairFlightWidth : actualTreadDepth;
    return {
      id: `${stair.id}-tread-${index}`,
      x: center.x - width / 2,
      y: center.y - depth / 2,
      width,
      depth,
      rise: params.stairFloorToFloorHeight * ((index + 1) / params.stairRiserCount),
    };
  });
}

export function buildStairLandings(stair: StairCarrier): StairLanding[] {
  const { params, points, segments } = stairPath(stair);
  if (points.length <= 2 || !segments.length) return [];

  const totalLength = segments.reduce((sum, segment) => sum + segment.length, 0);
  let cumulative = 0;

  return points.slice(1, -1).map((point, index) => {
    cumulative += segments[index]?.length ?? 0;
    const size = Math.max(params.stairFlightWidth, params.stairLandingDepth);
    const x1 = clamp(point.x - size / 2, stair.x, stair.x + stair.width);
    const y1 = clamp(point.y - size / 2, stair.y, stair.y + stair.depth);
    const x2 = clamp(point.x + size / 2, stair.x, stair.x + stair.width);
    const y2 = clamp(point.y + size / 2, stair.y, stair.y + stair.depth);
    return {
      id: `${stair.id}-landing-${index}`,
      x: x1,
      y: y1,
      width: Math.max(0.08, x2 - x1),
      depth: Math.max(0.08, y2 - y1),
      rise: totalLength > 0.001
        ? params.stairFloorToFloorHeight * (cumulative / totalLength)
        : 0,
    };
  });
}

export function buildStairSlabOpenings(stair: StairCarrier, clearance = 0.12): StairSlabOpening[] {
  const { params, segments } = stairPath(stair);
  const halfFlight = params.stairFlightWidth / 2 + Math.max(0, clearance);

  const segmentOpenings = segments.map((segment, index) => {
    const horizontal = Math.abs(segment.end.x - segment.start.x) >= Math.abs(segment.end.y - segment.start.y);
    const rawX = horizontal
      ? Math.min(segment.start.x, segment.end.x) - clearance
      : segment.start.x - halfFlight;
    const rawY = horizontal
      ? segment.start.y - halfFlight
      : Math.min(segment.start.y, segment.end.y) - clearance;
    const rawWidth = horizontal
      ? Math.abs(segment.end.x - segment.start.x) + clearance * 2
      : halfFlight * 2;
    const rawDepth = horizontal
      ? halfFlight * 2
      : Math.abs(segment.end.y - segment.start.y) + clearance * 2;

    const x1 = clamp(rawX, stair.x, stair.x + stair.width);
    const y1 = clamp(rawY, stair.y, stair.y + stair.depth);
    const x2 = clamp(rawX + rawWidth, stair.x, stair.x + stair.width);
    const y2 = clamp(rawY + rawDepth, stair.y, stair.y + stair.depth);

    return {
      id: `stair-opening-${stair.id}-${index}`,
      stairId: stair.id,
      sourceFloor: stair.floor,
      targetFloor: stair.floor + 1,
      x: x1,
      y: y1,
      width: Math.max(0, x2 - x1),
      depth: Math.max(0, y2 - y1),
    };
  }).filter((opening) => opening.width > 0.05 && opening.depth > 0.05);

  const landingOpenings = buildStairLandings(stair).map((landing, index) => ({
    id: `stair-opening-${stair.id}-landing-${index}`,
    stairId: stair.id,
    sourceFloor: stair.floor,
    targetFloor: stair.floor + 1,
    x: landing.x,
    y: landing.y,
    width: landing.width,
    depth: landing.depth,
  }));

  return [...segmentOpenings, ...landingOpenings];
}

export function stairFootprintMetrics(stair: StairCarrier) {
  const params = normalizeStairParameters(stair);
  const path = stairPath(stair);
  const pathLength = path.segments.reduce((sum, segment) => sum + segment.length, 0);
  const requiredRun = params.treadCount * params.stairTreadDepth;
  return {
    ...params,
    pathLength,
    requiredRun,
    runRatio: requiredRun > 0 ? pathLength / requiredRun : 1,
    fitsTreadDepth: pathLength + 0.05 >= requiredRun,
  };
}
