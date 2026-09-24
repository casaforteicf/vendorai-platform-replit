export type SiteFrontSide = "bottom" | "top" | "left" | "right";

export type SitePlacement = {
  frontSide: SiteFrontSide;
  setbackFront: number;
  setbackRear: number;
  setbackLeft: number;
  setbackRight: number;
};

// A planta 2D, os modelos e o encaixe automático tratam o topo do lote (y = 0) como frente/acesso.
// O padrão antigo era "bottom", e a fachada gerada mostrava os fundos da casa.
export const DEFAULT_SITE_PLACEMENT: SitePlacement = {
  frontSide: "top",
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


export type SitePlacementSuggestion = {
  id: "access" | "balanced" | "free_area";
  title: string;
  description: string;
  origin: { x: number; y: number };
  metrics: {
    frontFree: number;
    rearFree: number;
    leftFree: number;
    rightFree: number;
  };
};

function clearanceMetrics(
  origin: { x: number; y: number },
  bounds: SiteBuildingBounds,
  lotWidth: number,
  lotDepth: number,
  placement: SitePlacement,
) {
  const envelope = getBuildableEnvelope(lotWidth, lotDepth, placement);
  const leftFree = Math.max(0, origin.x - envelope.minX);
  const rightFree = Math.max(0, envelope.maxX - (origin.x + bounds.width));
  const topFree = Math.max(0, origin.y - envelope.minY);
  const bottomFree = Math.max(0, envelope.maxY - (origin.y + bounds.depth));

  if (placement.frontSide === "top") {
    return { frontFree: topFree, rearFree: bottomFree, leftFree, rightFree };
  }
  if (placement.frontSide === "left") {
    return { frontFree: leftFree, rearFree: rightFree, leftFree: bottomFree, rightFree: topFree };
  }
  if (placement.frontSide === "right") {
    return { frontFree: rightFree, rearFree: leftFree, leftFree: topFree, rightFree: bottomFree };
  }
  return { frontFree: bottomFree, rearFree: topFree, leftFree, rightFree };
}

function frontAlignedOrigin(
  bounds: SiteBuildingBounds,
  envelope: ReturnType<typeof getBuildableEnvelope>,
  placement: SitePlacement,
  crossAxisRatio: number,
) {
  const xSpan = Math.max(0, envelope.width - bounds.width);
  const ySpan = Math.max(0, envelope.depth - bounds.depth);
  const crossX = envelope.minX + xSpan * crossAxisRatio;
  const crossY = envelope.minY + ySpan * crossAxisRatio;

  if (placement.frontSide === "top") return { x: crossX, y: envelope.minY };
  if (placement.frontSide === "left") return { x: envelope.minX, y: crossY };
  if (placement.frontSide === "right") return { x: envelope.maxX - bounds.width, y: crossY };
  return { x: crossX, y: envelope.maxY - bounds.depth };
}

export function buildSitePlacementSuggestions(
  rooms: Array<{ kind: string; x: number; y: number; width: number; depth: number }>,
  lotWidth: number,
  lotDepth: number,
  placement: SitePlacement,
): SitePlacementSuggestion[] {
  const bounds = getBuildingBounds(rooms);
  if (!bounds) return [];

  const envelope = getBuildableEnvelope(lotWidth, lotDepth, placement);
  if (bounds.width > envelope.width + 0.001 || bounds.depth > envelope.depth + 0.001) return [];

  const centered = {
    x: envelope.minX + Math.max(0, (envelope.width - bounds.width) / 2),
    y: envelope.minY + Math.max(0, (envelope.depth - bounds.depth) / 2),
  };

  const frontCenter = frontAlignedOrigin(bounds, envelope, placement, 0.5);

  // Leaves the widest continuous side strip available for garden, access or leisure.
  const sideA = frontAlignedOrigin(bounds, envelope, placement, 0);
  const sideB = frontAlignedOrigin(bounds, envelope, placement, 1);
  const sideAMetrics = clearanceMetrics(sideA, bounds, lotWidth, lotDepth, placement);
  const sideBMetrics = clearanceMetrics(sideB, bounds, lotWidth, lotDepth, placement);
  const sideAScore = Math.max(sideAMetrics.leftFree, sideAMetrics.rightFree) + sideAMetrics.rearFree * 1.25;
  const sideBScore = Math.max(sideBMetrics.leftFree, sideBMetrics.rightFree) + sideBMetrics.rearFree * 1.25;
  const freeAreaOrigin = sideBScore > sideAScore ? sideB : sideA;

  return [
    {
      id: "access",
      title: "Acesso e garagem",
      description: "Aproxima a casa da rua e facilita entrada de veículos e pedestres.",
      origin: frontCenter,
      metrics: clearanceMetrics(frontCenter, bounds, lotWidth, lotDepth, placement),
    },
    {
      id: "balanced",
      title: "Implantação equilibrada",
      description: "Distribui os espaços livres ao redor da casa de forma mais uniforme.",
      origin: centered,
      metrics: clearanceMetrics(centered, bounds, lotWidth, lotDepth, placement),
    },
    {
      id: "free_area",
      title: "Mais área livre",
      description: "Encosta a casa em uma lateral para liberar uma faixa maior para jardim, lazer ou circulação.",
      origin: freeAreaOrigin,
      metrics: clearanceMetrics(freeAreaOrigin, bounds, lotWidth, lotDepth, placement),
    },
  ];
}

/**
 * Rascunhos salvos com o padrão antigo (frente "bottom" e recuos padrão, nunca ajustados pelo usuário)
 * passam a usar a frente no topo, igual à planta.
 */
export function migrateLegacySitePlacement(value: unknown): SitePlacement {
  const placement = normalizeSitePlacement(value);
  const untouchedLegacyDefault = placement.frontSide === "bottom"
    && placement.setbackFront === 4
    && placement.setbackRear === 2
    && placement.setbackLeft === 1.5
    && placement.setbackRight === 1.5;
  return untouchedLegacyDefault ? { ...placement, frontSide: "top" } : placement;
}
