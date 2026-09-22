export type SiteFrontSide = "bottom" | "top" | "left" | "right";

export type SitePlacement = {
  frontSide: SiteFrontSide;
  setbackFront: number;
  setbackRear: number;
  setbackLeft: number;
  setbackRight: number;
};

export const DEFAULT_SITE_PLACEMENT: SitePlacement = {
  frontSide: "bottom",
  setbackFront: 4,
  setbackRear: 2,
  setbackLeft: 1.5,
  setbackRight: 1.5,
};

export function normalizeSitePlacement(value: unknown): SitePlacement {
  const source = value && typeof value === "object" ? value as Partial<SitePlacement> : {};
  const frontSide: SiteFrontSide = ["bottom", "top", "left", "right"].includes(String(source.frontSide))
    ? source.frontSide as SiteFrontSide
    : DEFAULT_SITE_PLACEMENT.frontSide;

  const finite = (input: unknown, fallback: number) => {
    const parsed = Number(input);
    return Number.isFinite(parsed) ? Math.max(0, Math.min(20, parsed)) : fallback;
  };

  return {
    frontSide,
    setbackFront: finite(source.setbackFront, DEFAULT_SITE_PLACEMENT.setbackFront),
    setbackRear: finite(source.setbackRear, DEFAULT_SITE_PLACEMENT.setbackRear),
    setbackLeft: finite(source.setbackLeft, DEFAULT_SITE_PLACEMENT.setbackLeft),
    setbackRight: finite(source.setbackRight, DEFAULT_SITE_PLACEMENT.setbackRight),
  };
}

export function resolveSiteSetbacks(placement: SitePlacement) {
  if (placement.frontSide === "top") {
    return {
      top: placement.setbackFront,
      bottom: placement.setbackRear,
      left: placement.setbackLeft,
      right: placement.setbackRight,
    };
  }
  if (placement.frontSide === "left") {
    return {
      top: placement.setbackRight,
      bottom: placement.setbackLeft,
      left: placement.setbackFront,
      right: placement.setbackRear,
    };
  }
  if (placement.frontSide === "right") {
    return {
      top: placement.setbackLeft,
      bottom: placement.setbackRight,
      left: placement.setbackRear,
      right: placement.setbackFront,
    };
  }
  return {
    top: placement.setbackRear,
    bottom: placement.setbackFront,
    left: placement.setbackLeft,
    right: placement.setbackRight,
  };
}

export type SiteBuildingBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  depth: number;
};

export function getBuildingBounds(
  rooms: Array<{ kind: string; x: number; y: number; width: number; depth: number }>,
): SiteBuildingBounds | null {
  const buildingRooms = rooms.filter((room) => room.kind !== "piscina");
  if (!buildingRooms.length) return null;

  const minX = Math.min(...buildingRooms.map((room) => room.x));
  const minY = Math.min(...buildingRooms.map((room) => room.y));
  const maxX = Math.max(...buildingRooms.map((room) => room.x + room.width));
  const maxY = Math.max(...buildingRooms.map((room) => room.y + room.depth));
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    depth: maxY - minY,
  };
}

export function getBuildableEnvelope(
  lotWidth: number,
  lotDepth: number,
  placement: SitePlacement,
) {
  const setbacks = resolveSiteSetbacks(placement);
  const minX = Math.min(lotWidth, setbacks.left);
  const minY = Math.min(lotDepth, setbacks.top);
  const maxX = Math.max(minX, lotWidth - setbacks.right);
  const maxY = Math.max(minY, lotDepth - setbacks.bottom);
  return {
    ...setbacks,
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    depth: Math.max(0, maxY - minY),
  };
}

export function clampBuildingOrigin(
  desiredX: number,
  desiredY: number,
  bounds: SiteBuildingBounds,
  lotWidth: number,
  lotDepth: number,
  placement: SitePlacement,
) {
  const envelope = getBuildableEnvelope(lotWidth, lotDepth, placement);
  const maxOriginX = Math.max(envelope.minX, envelope.maxX - bounds.width);
  const maxOriginY = Math.max(envelope.minY, envelope.maxY - bounds.depth);

  return {
    x: Math.max(envelope.minX, Math.min(maxOriginX, desiredX)),
    y: Math.max(envelope.minY, Math.min(maxOriginY, desiredY)),
    fits: bounds.width <= envelope.width + 0.001 && bounds.depth <= envelope.depth + 0.001,
  };
}
