export type RoofType = "platibanda" | "aparente" | "misto";
export type RoofWaterCount = 1 | 2 | 4;
export type RoofRidgeOrientation = "x" | "y";
export type RoofSlopeDirection = "north" | "south" | "east" | "west";

export type RoofParameters = {
  roofWaters?: RoofWaterCount;
  roofPitchDeg?: number;
  roofOverhang?: number;
  roofRidgeOrientation?: RoofRidgeOrientation;
  roofSlopeDirection?: RoofSlopeDirection;
  roofParapetHeight?: number;
  roofMixedRatio?: number;
};

export type RoofInput = {
  roof: RoofType;
} & RoofParameters;

export type NormalizedRoofParameters = {
  roof: RoofType;
  roofWaters: RoofWaterCount;
  roofPitchDeg: number;
  roofOverhang: number;
  roofRidgeOrientation: RoofRidgeOrientation;
  roofSlopeDirection: RoofSlopeDirection;
  roofParapetHeight: number;
  roofMixedRatio: number;
};

export type RoofBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type RoofPoint3 = {
  x: number;
  y: number;
  z: number;
};

export type RoofFace = {
  id: string;
  role: "roof" | "slab" | "parapet";
  points: RoofPoint3[];
};

export type RoofPlanGuide = {
  id: string;
  kind: "ridge" | "hip" | "slope" | "split";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

const TYPES = new Set<RoofType>(["platibanda", "aparente", "misto"]);
const WATERS = new Set<number>([1, 2, 4]);
const RIDGE_ORIENTATIONS = new Set<RoofRidgeOrientation>(["x", "y"]);
const SLOPE_DIRECTIONS = new Set<RoofSlopeDirection>(["north", "south", "east", "west"]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function defaultRoofParameters(roof: RoofType = "platibanda"): NormalizedRoofParameters {
  return {
    roof,
    roofWaters: 2,
    roofPitchDeg: 25,
    roofOverhang: 0.45,
    roofRidgeOrientation: "x",
    roofSlopeDirection: "south",
    roofParapetHeight: 0.65,
    roofMixedRatio: 0.45,
  };
}

export function normalizeRoofParameters(source: Partial<RoofInput> | undefined): NormalizedRoofParameters {
  const rawRoof = source?.roof;
  const roof = rawRoof && TYPES.has(rawRoof) ? rawRoof : "platibanda";
  const defaults = defaultRoofParameters(roof);
  const rawWaters = finiteOr(source?.roofWaters, defaults.roofWaters);

  return {
    roof,
    roofWaters: WATERS.has(rawWaters) ? rawWaters as RoofWaterCount : defaults.roofWaters,
    roofPitchDeg: clamp(finiteOr(source?.roofPitchDeg, defaults.roofPitchDeg), 3, 55),
    roofOverhang: clamp(finiteOr(source?.roofOverhang, defaults.roofOverhang), 0, 1.5),
    roofRidgeOrientation: source?.roofRidgeOrientation && RIDGE_ORIENTATIONS.has(source.roofRidgeOrientation)
      ? source.roofRidgeOrientation
      : defaults.roofRidgeOrientation,
    roofSlopeDirection: source?.roofSlopeDirection && SLOPE_DIRECTIONS.has(source.roofSlopeDirection)
      ? source.roofSlopeDirection
      : defaults.roofSlopeDirection,
    roofParapetHeight: clamp(finiteOr(source?.roofParapetHeight, defaults.roofParapetHeight), 0.25, 1.5),
    roofMixedRatio: clamp(finiteOr(source?.roofMixedRatio, defaults.roofMixedRatio), 0.2, 0.8),
  };
}

export function roofBoundsWidth(bounds: RoofBounds) {
  return Math.max(0, bounds.maxX - bounds.minX);
}

export function roofBoundsDepth(bounds: RoofBounds) {
  return Math.max(0, bounds.maxY - bounds.minY);
}

export function expandRoofBounds(bounds: RoofBounds, overhang: number): RoofBounds {
  const amount = Math.max(0, overhang);
  return {
    minX: bounds.minX - amount,
    minY: bounds.minY - amount,
    maxX: bounds.maxX + amount,
    maxY: bounds.maxY + amount,
  };
}

function pitchRise(run: number, pitchDeg: number) {
  return Math.max(0, run) * Math.tan((pitchDeg * Math.PI) / 180);
}

function flatRoofFaces(bounds: RoofBounds, baseZ: number, parapetHeight: number, prefix = "flat"): RoofFace[] {
  const zTop = baseZ + parapetHeight;
  const slab: RoofFace = {
    id: `${prefix}-slab`,
    role: "slab",
    points: [
      { x: bounds.minX, y: bounds.minY, z: baseZ },
      { x: bounds.maxX, y: bounds.minY, z: baseZ },
      { x: bounds.maxX, y: bounds.maxY, z: baseZ },
      { x: bounds.minX, y: bounds.maxY, z: baseZ },
    ],
  };
  const parapets: RoofFace[] = [
    {
      id: `${prefix}-parapet-north`,
      role: "parapet",
      points: [
        { x: bounds.minX, y: bounds.minY, z: baseZ },
        { x: bounds.maxX, y: bounds.minY, z: baseZ },
        { x: bounds.maxX, y: bounds.minY, z: zTop },
        { x: bounds.minX, y: bounds.minY, z: zTop },
      ],
    },
    {
      id: `${prefix}-parapet-south`,
      role: "parapet",
      points: [
        { x: bounds.maxX, y: bounds.maxY, z: baseZ },
        { x: bounds.minX, y: bounds.maxY, z: baseZ },
        { x: bounds.minX, y: bounds.maxY, z: zTop },
        { x: bounds.maxX, y: bounds.maxY, z: zTop },
      ],
    },
    {
      id: `${prefix}-parapet-west`,
      role: "parapet",
      points: [
        { x: bounds.minX, y: bounds.maxY, z: baseZ },
        { x: bounds.minX, y: bounds.minY, z: baseZ },
        { x: bounds.minX, y: bounds.minY, z: zTop },
        { x: bounds.minX, y: bounds.maxY, z: zTop },
      ],
    },
    {
      id: `${prefix}-parapet-east`,
      role: "parapet",
      points: [
        { x: bounds.maxX, y: bounds.minY, z: baseZ },
        { x: bounds.maxX, y: bounds.maxY, z: baseZ },
        { x: bounds.maxX, y: bounds.maxY, z: zTop },
        { x: bounds.maxX, y: bounds.minY, z: zTop },
      ],
    },
  ];
  return [slab, ...parapets];
}

function oneWaterFace(bounds: RoofBounds, baseZ: number, params: NormalizedRoofParameters, prefix: string): RoofFace[] {
  const width = roofBoundsWidth(bounds);
  const depth = roofBoundsDepth(bounds);
  const direction = params.roofSlopeDirection;
  const run = direction === "east" || direction === "west" ? width : depth;
  const rise = pitchRise(run, params.roofPitchDeg);

  let nw = baseZ;
  let ne = baseZ;
  let se = baseZ;
  let sw = baseZ;

  if (direction === "south") {
    nw += rise;
    ne += rise;
  } else if (direction === "north") {
    sw += rise;
    se += rise;
  } else if (direction === "east") {
    nw += rise;
    sw += rise;
  } else {
    ne += rise;
    se += rise;
  }

  return [{
    id: `${prefix}-one-water`,
    role: "roof",
    points: [
      { x: bounds.minX, y: bounds.minY, z: nw },
      { x: bounds.maxX, y: bounds.minY, z: ne },
      { x: bounds.maxX, y: bounds.maxY, z: se },
      { x: bounds.minX, y: bounds.maxY, z: sw },
    ],
  }];
}

function twoWaterFaces(bounds: RoofBounds, baseZ: number, params: NormalizedRoofParameters, prefix: string): RoofFace[] {
  const width = roofBoundsWidth(bounds);
  const depth = roofBoundsDepth(bounds);

  if (params.roofRidgeOrientation === "x") {
    const midY = (bounds.minY + bounds.maxY) / 2;
    const rise = pitchRise(depth / 2, params.roofPitchDeg);
    return [
      {
        id: `${prefix}-north-plane`,
        role: "roof",
        points: [
          { x: bounds.minX, y: bounds.minY, z: baseZ },
          { x: bounds.maxX, y: bounds.minY, z: baseZ },
          { x: bounds.maxX, y: midY, z: baseZ + rise },
          { x: bounds.minX, y: midY, z: baseZ + rise },
        ],
      },
      {
        id: `${prefix}-south-plane`,
        role: "roof",
        points: [
          { x: bounds.minX, y: midY, z: baseZ + rise },
          { x: bounds.maxX, y: midY, z: baseZ + rise },
          { x: bounds.maxX, y: bounds.maxY, z: baseZ },
          { x: bounds.minX, y: bounds.maxY, z: baseZ },
        ],
      },
    ];
  }

  const midX = (bounds.minX + bounds.maxX) / 2;
  const rise = pitchRise(width / 2, params.roofPitchDeg);
  return [
    {
      id: `${prefix}-west-plane`,
      role: "roof",
      points: [
        { x: bounds.minX, y: bounds.minY, z: baseZ },
        { x: midX, y: bounds.minY, z: baseZ + rise },
        { x: midX, y: bounds.maxY, z: baseZ + rise },
        { x: bounds.minX, y: bounds.maxY, z: baseZ },
      ],
    },
    {
      id: `${prefix}-east-plane`,
      role: "roof",
      points: [
        { x: midX, y: bounds.minY, z: baseZ + rise },
        { x: bounds.maxX, y: bounds.minY, z: baseZ },
        { x: bounds.maxX, y: bounds.maxY, z: baseZ },
        { x: midX, y: bounds.maxY, z: baseZ + rise },
      ],
    },
  ];
}

function fourWaterFaces(bounds: RoofBounds, baseZ: number, params: NormalizedRoofParameters, prefix: string): RoofFace[] {
  const width = roofBoundsWidth(bounds);
  const depth = roofBoundsDepth(bounds);

  if (params.roofRidgeOrientation === "x") {
    const run = depth / 2;
    const midY = (bounds.minY + bounds.maxY) / 2;
    const ridgeInset = Math.min(run, width / 2);
    let ridgeX1 = bounds.minX + ridgeInset;
    let ridgeX2 = bounds.maxX - ridgeInset;
    if (ridgeX1 > ridgeX2) ridgeX1 = ridgeX2 = (bounds.minX + bounds.maxX) / 2;
    const ridgeZ = baseZ + pitchRise(run, params.roofPitchDeg);

    return [
      {
        id: `${prefix}-north-hip`,
        role: "roof",
        points: [
          { x: bounds.minX, y: bounds.minY, z: baseZ },
          { x: bounds.maxX, y: bounds.minY, z: baseZ },
          { x: ridgeX2, y: midY, z: ridgeZ },
          { x: ridgeX1, y: midY, z: ridgeZ },
        ],
      },
      {
        id: `${prefix}-south-hip`,
        role: "roof",
        points: [
          { x: ridgeX1, y: midY, z: ridgeZ },
          { x: ridgeX2, y: midY, z: ridgeZ },
          { x: bounds.maxX, y: bounds.maxY, z: baseZ },
          { x: bounds.minX, y: bounds.maxY, z: baseZ },
        ],
      },
      {
        id: `${prefix}-west-hip`,
        role: "roof",
        points: [
          { x: bounds.minX, y: bounds.minY, z: baseZ },
          { x: ridgeX1, y: midY, z: ridgeZ },
          { x: bounds.minX, y: bounds.maxY, z: baseZ },
        ],
      },
      {
        id: `${prefix}-east-hip`,
        role: "roof",
        points: [
          { x: bounds.maxX, y: bounds.minY, z: baseZ },
          { x: bounds.maxX, y: bounds.maxY, z: baseZ },
          { x: ridgeX2, y: midY, z: ridgeZ },
        ],
      },
    ];
  }

  const run = width / 2;
  const midX = (bounds.minX + bounds.maxX) / 2;
  const ridgeInset = Math.min(run, depth / 2);
  let ridgeY1 = bounds.minY + ridgeInset;
  let ridgeY2 = bounds.maxY - ridgeInset;
  if (ridgeY1 > ridgeY2) ridgeY1 = ridgeY2 = (bounds.minY + bounds.maxY) / 2;
  const ridgeZ = baseZ + pitchRise(run, params.roofPitchDeg);

  return [
    {
      id: `${prefix}-west-hip`,
      role: "roof",
      points: [
        { x: bounds.minX, y: bounds.minY, z: baseZ },
        { x: midX, y: ridgeY1, z: ridgeZ },
        { x: midX, y: ridgeY2, z: ridgeZ },
        { x: bounds.minX, y: bounds.maxY, z: baseZ },
      ],
    },
    {
      id: `${prefix}-east-hip`,
      role: "roof",
      points: [
        { x: midX, y: ridgeY1, z: ridgeZ },
        { x: bounds.maxX, y: bounds.minY, z: baseZ },
        { x: bounds.maxX, y: bounds.maxY, z: baseZ },
        { x: midX, y: ridgeY2, z: ridgeZ },
      ],
    },
    {
      id: `${prefix}-north-hip`,
      role: "roof",
      points: [
        { x: bounds.minX, y: bounds.minY, z: baseZ },
        { x: bounds.maxX, y: bounds.minY, z: baseZ },
        { x: midX, y: ridgeY1, z: ridgeZ },
      ],
    },
    {
      id: `${prefix}-south-hip`,
      role: "roof",
      points: [
        { x: bounds.minX, y: bounds.maxY, z: baseZ },
        { x: midX, y: ridgeY2, z: ridgeZ },
        { x: bounds.maxX, y: bounds.maxY, z: baseZ },
      ],
    },
  ];
}

function pitchedRoofFaces(bounds: RoofBounds, baseZ: number, params: NormalizedRoofParameters, prefix = "pitched"): RoofFace[] {
  if (params.roofWaters === 1) return oneWaterFace(bounds, baseZ, params, prefix);
  if (params.roofWaters === 4) return fourWaterFaces(bounds, baseZ, params, prefix);
  return twoWaterFaces(bounds, baseZ, params, prefix);
}

export function buildRoofFaces(bounds: RoofBounds, baseZ: number, source: RoofInput): RoofFace[] {
  const params = normalizeRoofParameters(source);

  if (params.roof === "platibanda") {
    return flatRoofFaces(bounds, baseZ, params.roofParapetHeight);
  }

  if (params.roof === "misto") {
    const width = roofBoundsWidth(bounds);
    const splitX = bounds.minX + width * params.roofMixedRatio;
    const flatBounds = { ...bounds, maxX: splitX };
    const pitchedBase = { ...bounds, minX: splitX };
    const pitchedBounds = expandRoofBounds(pitchedBase, params.roofOverhang);
    return [
      ...flatRoofFaces(flatBounds, baseZ, params.roofParapetHeight, "mixed-flat"),
      ...pitchedRoofFaces(pitchedBounds, baseZ, { ...params, roof: "aparente" }, "mixed-pitched"),
    ];
  }

  return pitchedRoofFaces(expandRoofBounds(bounds, params.roofOverhang), baseZ, params);
}

export function roofPeakZ(bounds: RoofBounds, baseZ: number, source: RoofInput) {
  return Math.max(
    baseZ,
    ...buildRoofFaces(bounds, baseZ, source).flatMap((face) => face.points.map((point) => point.z)),
  );
}

export function roofPlanBounds(bounds: RoofBounds, source: RoofInput) {
  const params = normalizeRoofParameters(source);
  return params.roof === "platibanda"
    ? bounds
    : expandRoofBounds(bounds, params.roofOverhang);
}

function pitchedPlanGuides(bounds: RoofBounds, params: NormalizedRoofParameters, prefix = "roof"): RoofPlanGuide[] {
  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;

  if (params.roofWaters === 1) {
    const target =
      params.roofSlopeDirection === "north" ? { x: cx, y: bounds.minY } :
      params.roofSlopeDirection === "south" ? { x: cx, y: bounds.maxY } :
      params.roofSlopeDirection === "east" ? { x: bounds.maxX, y: cy } :
      { x: bounds.minX, y: cy };
    return [{
      id: `${prefix}-slope`,
      kind: "slope",
      x1: cx,
      y1: cy,
      x2: target.x,
      y2: target.y,
    }];
  }

  if (params.roofRidgeOrientation === "x") {
    if (params.roofWaters === 2) {
      return [{
        id: `${prefix}-ridge`,
        kind: "ridge",
        x1: bounds.minX,
        y1: cy,
        x2: bounds.maxX,
        y2: cy,
      }];
    }
    const run = roofBoundsDepth(bounds) / 2;
    const inset = Math.min(run, roofBoundsWidth(bounds) / 2);
    const x1 = Math.min(cx, bounds.minX + inset);
    const x2 = Math.max(cx, bounds.maxX - inset);
    return [
      { id: `${prefix}-ridge`, kind: "ridge", x1, y1: cy, x2, y2: cy },
      { id: `${prefix}-hip-nw`, kind: "hip", x1: bounds.minX, y1: bounds.minY, x2: x1, y2: cy },
      { id: `${prefix}-hip-ne`, kind: "hip", x1: bounds.maxX, y1: bounds.minY, x2: x2, y2: cy },
      { id: `${prefix}-hip-sw`, kind: "hip", x1: bounds.minX, y1: bounds.maxY, x2: x1, y2: cy },
      { id: `${prefix}-hip-se`, kind: "hip", x1: bounds.maxX, y1: bounds.maxY, x2: x2, y2: cy },
    ];
  }

  if (params.roofWaters === 2) {
    return [{
      id: `${prefix}-ridge`,
      kind: "ridge",
      x1: cx,
      y1: bounds.minY,
      x2: cx,
      y2: bounds.maxY,
    }];
  }

  const run = roofBoundsWidth(bounds) / 2;
  const inset = Math.min(run, roofBoundsDepth(bounds) / 2);
  const y1 = Math.min(cy, bounds.minY + inset);
  const y2 = Math.max(cy, bounds.maxY - inset);
  return [
    { id: `${prefix}-ridge`, kind: "ridge", x1: cx, y1, x2: cx, y2 },
    { id: `${prefix}-hip-nw`, kind: "hip", x1: bounds.minX, y1: bounds.minY, x2: cx, y2: y1 },
    { id: `${prefix}-hip-ne`, kind: "hip", x1: bounds.maxX, y1: bounds.minY, x2: cx, y2: y1 },
    { id: `${prefix}-hip-sw`, kind: "hip", x1: bounds.minX, y1: bounds.maxY, x2: cx, y2: y2 },
    { id: `${prefix}-hip-se`, kind: "hip", x1: bounds.maxX, y1: bounds.maxY, x2: cx, y2: y2 },
  ];
}

export function buildRoofPlanGuides(bounds: RoofBounds, source: RoofInput): RoofPlanGuide[] {
  const params = normalizeRoofParameters(source);
  if (params.roof === "platibanda") return [];

  if (params.roof === "misto") {
    const splitX = bounds.minX + roofBoundsWidth(bounds) * params.roofMixedRatio;
    const pitchedBounds = expandRoofBounds({ ...bounds, minX: splitX }, params.roofOverhang);
    return [
      {
        id: "roof-mixed-split",
        kind: "split",
        x1: splitX,
        y1: bounds.minY,
        x2: splitX,
        y2: bounds.maxY,
      },
      ...pitchedPlanGuides(pitchedBounds, { ...params, roof: "aparente" }, "roof-mixed"),
    ];
  }

  return pitchedPlanGuides(expandRoofBounds(bounds, params.roofOverhang), params);
}

export function roofFacadeRise(width: number, depth: number, source: RoofInput) {
  const params = normalizeRoofParameters(source);
  const safeWidth = Math.max(0, width);
  const safeDepth = Math.max(0, depth);

  if (params.roof === "platibanda") return params.roofParapetHeight;

  if (params.roofWaters === 1) {
    const run = params.roofSlopeDirection === "east" || params.roofSlopeDirection === "west"
      ? safeWidth
      : safeDepth;
    return pitchRise(run, params.roofPitchDeg);
  }

  if (params.roofWaters === 4) {
    const run = params.roofRidgeOrientation === "x" ? safeDepth / 2 : safeWidth / 2;
    return pitchRise(run, params.roofPitchDeg);
  }

  const run = params.roofRidgeOrientation === "x" ? safeDepth / 2 : safeWidth / 2;
  return pitchRise(run, params.roofPitchDeg);
}

export function buildRoofFacadeProfile(width: number, depth: number, source: RoofInput) {
  const params = normalizeRoofParameters(source);
  const rise = roofFacadeRise(width, depth, params);
  const w = Math.max(0.01, width);

  if (params.roofWaters === 1) {
    if (params.roofSlopeDirection === "east") {
      return [{ x: 0, z: 0 }, { x: 0, z: rise }, { x: w, z: 0 }];
    }
    if (params.roofSlopeDirection === "west") {
      return [{ x: 0, z: 0 }, { x: w, z: rise }, { x: w, z: 0 }];
    }
    const frontHigh = params.roofSlopeDirection === "north";
    const edge = frontHigh ? rise : Math.min(0.12, rise);
    return [{ x: 0, z: 0 }, { x: 0, z: edge }, { x: w, z: edge }, { x: w, z: 0 }];
  }

  if (params.roofWaters === 2) {
    if (params.roofRidgeOrientation === "y") {
      return [{ x: 0, z: 0 }, { x: w / 2, z: rise }, { x: w, z: 0 }];
    }
    return [{ x: 0, z: 0 }, { x: w * 0.08, z: rise }, { x: w * 0.92, z: rise }, { x: w, z: 0 }];
  }

  if (params.roofRidgeOrientation === "x") {
    return [{ x: 0, z: 0 }, { x: w * 0.22, z: rise }, { x: w * 0.78, z: rise }, { x: w, z: 0 }];
  }

  return [{ x: 0, z: 0 }, { x: w / 2, z: rise }, { x: w, z: 0 }];
}
