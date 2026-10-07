export type SiteFrontSide = "bottom" | "top" | "left" | "right";

export type SiteSlope = "flat" | "to_front" | "to_rear" | "to_left" | "to_right";
export type SitePlacementStrategy = "balanced" | "access" | "solar" | "leisure";
export type SitePoint = { x: number; y: number };
export type SiteBoundary = { kind: "polygon"; points: SitePoint[] };

export type SitePlacement = {
  frontSide: SiteFrontSide;
  setbackFront: number;
  setbackRear: number;
  setbackLeft: number;
  setbackRight: number;
  /** Lado do lote voltado para o norte geográfico. Null = ainda não informado. */
  northSide?: SiteFrontSide | null;
  /** Acesso principal de veículos. Em lotes comuns coincide com a rua, mas pode ser lateral. */
  vehicleAccessSide?: SiteFrontSide | null;
  /** Direção predominante de queda do terreno. */
  slope?: SiteSlope;
  /** Lado com vista/paisagem que o cliente quer preservar. */
  preferredViewSide?: SiteFrontSide | null;
  /** Lado com ruído, vizinho crítico ou insolação indesejada. */
  avoidSide?: SiteFrontSide | null;
  /** Prioridade usada pelo arquiteto digital para ordenar as sugestões. */
  strategy?: SitePlacementStrategy;
  /** Perímetro real do lote quando não for retangular. Coordenadas em metros dentro do workspace. */
  lotBoundary?: SiteBoundary | null;
};

// A planta 2D, os modelos e o encaixe automático tratam o topo do lote (y = 0) como frente/acesso.
// O padrão antigo era "bottom", e a fachada gerada mostrava os fundos da casa.
export const DEFAULT_SITE_PLACEMENT: SitePlacement = {
  frontSide: "top",
  setbackFront: 4,
  setbackRear: 2,
  setbackLeft: 1.5,
  setbackRight: 1.5,
  northSide: null,
  vehicleAccessSide: "top",
  slope: "flat",
  preferredViewSide: null,
  avoidSide: null,
  strategy: "balanced",
  lotBoundary: null,
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

  const optionalSide = (input: unknown): SiteFrontSide | null =>
    ["bottom", "top", "left", "right"].includes(String(input)) ? input as SiteFrontSide : null;
  const slope: SiteSlope = ["flat", "to_front", "to_rear", "to_left", "to_right"].includes(String(source.slope))
    ? source.slope as SiteSlope
    : "flat";
  const strategy: SitePlacementStrategy = ["balanced", "access", "solar", "leisure"].includes(String(source.strategy))
    ? source.strategy as SitePlacementStrategy
    : "balanced";
    ? rawBoundary!.points.flatMap((point) => {
        const x = Number((point as SitePoint)?.x);
        const y = Number((point as SitePoint)?.y);
        return Number.isFinite(x) && Number.isFinite(y) ? [{ x: Math.max(0, x), y: Math.max(0, y) }] : [];
      }).slice(0, 12)
    : [];
  const lotBoundary: SiteBoundary | null =
    rawBoundary?.kind === "polygon" && boundaryPoints.length >= 3
      ? { kind: "polygon", points: boundaryPoints }
      : null;
  const rawBoundary = source.lotBoundary && typeof source.lotBoundary === "object"
    ? source.lotBoundary as Partial<SiteBoundary>
    : null;
  const boundaryPoints = Array.isArray(rawBoundary?.points)
    ? rawBoundary!.points.flatMap((point) => {
        const x = Number((point as SitePoint)?.x);
        const y = Number((point as SitePoint)?.y);
        return Number.isFinite(x) && Number.isFinite(y) ? [{ x: Math.max(0, x), y: Math.max(0, y) }] : [];
      }).slice(0, 12)
    : [];
  const lotBoundary: SiteBoundary | null =
    rawBoundary?.kind === "polygon" && boundaryPoints.length >= 3
      ? { kind: "polygon", points: boundaryPoints }
      : null;

  return {
    frontSide,
    setbackFront: finite(source.setbackFront, DEFAULT_SITE_PLACEMENT.setbackFront),
    setbackRear: finite(source.setbackRear, DEFAULT_SITE_PLACEMENT.setbackRear),
    setbackLeft: finite(source.setbackLeft, DEFAULT_SITE_PLACEMENT.setbackLeft),
    setbackRight: finite(source.setbackRight, DEFAULT_SITE_PLACEMENT.setbackRight),
    northSide: optionalSide(source.northSide),
    vehicleAccessSide: optionalSide(source.vehicleAccessSide) ?? frontSide,
    slope,
    preferredViewSide: optionalSide(source.preferredViewSide),
    avoidSide: optionalSide(source.avoidSide),
    strategy,
    lotBoundary,
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

    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

export function getSiteBoundaryPoints(
  lotWidth: number,
  lotDepth: number,
  placement: SitePlacement,
): SitePoint[] {
  const rectangle = [
    { x: 0, y: 0 },
    { x: lotWidth, y: 0 },
    { x: lotWidth, y: lotDepth },
    { x: 0, y: lotDepth },
  ];
  const raw = placement.lotBoundary?.kind === "polygon" ? placement.lotBoundary.points : [];
  if (!Array.isArray(raw) || raw.length < 3) return rectangle;
  const points = raw.map((point) => ({
    x: Math.max(0, Math.min(lotWidth, Number(point.x) || 0)),
    y: Math.max(0, Math.min(lotDepth, Number(point.y) || 0)),
  }));
  return polygonArea(points) > 0.1 ? points : rectangle;
}

function clipPolygonAxis(
  input: SitePoint[],
  inside: (point: SitePoint) => boolean,
  intersection: (from: SitePoint, to: SitePoint) => SitePoint,
) {
  if (!input.length) return [];
  const output: SitePoint[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const from = input[index];
    const to = input[(index + 1) % input.length];
    const fromInside = inside(from);
    const toInside = inside(to);
    if (fromInside && toInside) output.push(to);
    else if (fromInside && !toInside) output.push(intersection(from, to));
    else if (!fromInside && toInside) {
      output.push(intersection(from, to));
      output.push(to);
    }
  }
  return output;
}

function clipPolygonToRect(points: SitePoint[], minX: number, minY: number, maxX: number, maxY: number) {
  const intersectX = (x: number) => (from: SitePoint, to: SitePoint): SitePoint => {
    const delta = to.x - from.x;
    const t = Math.abs(delta) < 1e-9 ? 0 : (x - from.x) / delta;
    return { x, y: from.y + (to.y - from.y) * t };
  };
  const intersectY = (y: number) => (from: SitePoint, to: SitePoint): SitePoint => {
    const delta = to.y - from.y;
    const t = Math.abs(delta) < 1e-9 ? 0 : (y - from.y) / delta;
    return { x: from.x + (to.x - from.x) * t, y };
  };

  let clipped = points;
  clipped = clipPolygonAxis(clipped, (p) => p.x >= minX - 1e-9, intersectX(minX));
  clipped = clipPolygonAxis(clipped, (p) => p.x <= maxX + 1e-9, intersectX(maxX));
  clipped = clipPolygonAxis(clipped, (p) => p.y >= minY - 1e-9, intersectY(minY));
  clipped = clipPolygonAxis(clipped, (p) => p.y <= maxY + 1e-9, intersectY(maxY));
  return clipped;
}

export function pointInSitePolygon(point: SitePoint, polygon: SitePoint[]) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
    const onSegment = Math.abs(cross) < 1e-7
      && point.x >= Math.min(a.x, b.x) - 1e-7 && point.x <= Math.max(a.x, b.x) + 1e-7
      && point.y >= Math.min(a.y, b.y) - 1e-7 && point.y <= Math.max(a.y, b.y) + 1e-7;
    if (onSegment) return true;
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-12) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function rectangleInsidePolygon(x: number, y: number, width: number, depth: number, polygon: SitePoint[]) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ].every((point) => pointInSitePolygon(point, polygon));
}

export function polygonArea(points: SitePoint[]) {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum) / 2;
}

export function getSiteBoundaryPoints(
  lotWidth: number,
  lotDepth: number,
  placement: SitePlacement,
): SitePoint[] {
  const rectangle = [
    { x: 0, y: 0 },
    { x: lotWidth, y: 0 },
    { x: lotWidth, y: lotDepth },
    { x: 0, y: lotDepth },
  ];
  const raw = placement.lotBoundary?.kind === "polygon" ? placement.lotBoundary.points : [];
  if (!Array.isArray(raw) || raw.length < 3) return rectangle;
  const points = raw.map((point) => ({
    x: Math.max(0, Math.min(lotWidth, Number(point.x) || 0)),
    y: Math.max(0, Math.min(lotDepth, Number(point.y) || 0)),
  }));
  return polygonArea(points) > 0.1 ? points : rectangle;
}

function clipPolygonAxis(
  input: SitePoint[],
  inside: (point: SitePoint) => boolean,
  intersection: (from: SitePoint, to: SitePoint) => SitePoint,
) {
  if (!input.length) return [];
  const output: SitePoint[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const from = input[index];
    const to = input[(index + 1) % input.length];
    const fromInside = inside(from);
    const toInside = inside(to);
    if (fromInside && toInside) output.push(to);
    else if (fromInside && !toInside) output.push(intersection(from, to));
    else if (!fromInside && toInside) {
      output.push(intersection(from, to));
      output.push(to);
    }
  }
  return output;
}

function clipPolygonToRect(points: SitePoint[], minX: number, minY: number, maxX: number, maxY: number) {
  const intersectX = (x: number) => (from: SitePoint, to: SitePoint): SitePoint => {
    const delta = to.x - from.x;
    const t = Math.abs(delta) < 1e-9 ? 0 : (x - from.x) / delta;
    return { x, y: from.y + (to.y - from.y) * t };
  };
  const intersectY = (y: number) => (from: SitePoint, to: SitePoint): SitePoint => {
    const delta = to.y - from.y;
    const t = Math.abs(delta) < 1e-9 ? 0 : (y - from.y) / delta;
    return { x: from.x + (to.x - from.x) * t, y };
  };

  let clipped = points;
  clipped = clipPolygonAxis(clipped, (p) => p.x >= minX - 1e-9, intersectX(minX));
  clipped = clipPolygonAxis(clipped, (p) => p.x <= maxX + 1e-9, intersectX(maxX));
  clipped = clipPolygonAxis(clipped, (p) => p.y >= minY - 1e-9, intersectY(minY));
  clipped = clipPolygonAxis(clipped, (p) => p.y <= maxY + 1e-9, intersectY(maxY));
  return clipped;
}

export function pointInSitePolygon(point: SitePoint, polygon: SitePoint[]) {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const cross = (point.y - a.y) * (b.x - a.x) - (point.x - a.x) * (b.y - a.y);
    const onSegment = Math.abs(cross) < 1e-7
      && point.x >= Math.min(a.x, b.x) - 1e-7 && point.x <= Math.max(a.x, b.x) + 1e-7
      && point.y >= Math.min(a.y, b.y) - 1e-7 && point.y <= Math.max(a.y, b.y) + 1e-7;
    if (onSegment) return true;
    const intersects = ((a.y > point.y) !== (b.y > point.y))
      && point.x < ((b.x - a.x) * (point.y - a.y)) / ((b.y - a.y) || 1e-12) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function rectangleInsidePolygon(x: number, y: number, width: number, depth: number, polygon: SitePoint[]) {
  return [
    { x, y },
    { x: x + width, y },
    { x: x + width, y: y + depth },
    { x, y: y + depth },
  ].every((point) => pointInSitePolygon(point, polygon));
}

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
  const lotPolygon = getSiteBoundaryPoints(lotWidth, lotDepth, placement);
  const polygon = clipPolygonToRect(lotPolygon, setbackMinX, setbackMinY, setbackMaxX, setbackMaxY);
  const minX = polygon.length ? Math.min(...polygon.map((point) => point.x)) : setbackMinX;
  const minY = polygon.length ? Math.min(...polygon.map((point) => point.y)) : setbackMinY;
  const maxX = polygon.length ? Math.max(...polygon.map((point) => point.x)) : minX;
  const maxY = polygon.length ? Math.max(...polygon.map((point) => point.y)) : minY;
  const setbackMinX = Math.min(lotWidth, setbacks.left);
  const setbackMinY = Math.min(lotDepth, setbacks.top);
  const setbackMaxX = Math.max(setbackMinX, lotWidth - setbacks.right);
  const setbackMaxY = Math.max(setbackMinY, lotDepth - setbacks.bottom);
  const lotPolygon = getSiteBoundaryPoints(lotWidth, lotDepth, placement);
  const polygon = clipPolygonToRect(lotPolygon, setbackMinX, setbackMinY, setbackMaxX, setbackMaxY);
  const minX = polygon.length ? Math.min(...polygon.map((point) => point.x)) : setbackMinX;
  const minY = polygon.length ? Math.min(...polygon.map((point) => point.y)) : setbackMinY;
  const maxX = polygon.length ? Math.max(...polygon.map((point) => point.x)) : minX;
  const maxY = polygon.length ? Math.max(...polygon.map((point) => point.y)) : minY;
  return {
    ...setbacks,
    minX,
    minY,
    maxX,
    maxY,
    width: Math.max(0, maxX - minX),
    depth: Math.max(0, maxY - minY),
    polygon,
    lotPolygon,
    area: polygonArea(polygon),
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
  const target = {
    x: Math.max(envelope.minX, Math.min(maxOriginX, desiredX)),
    y: Math.max(envelope.minY, Math.min(maxOriginY, desiredY)),
  };
  }

  let best: { x: number; y: number; distance: number } | null = null;
  const steps = 30;
  for (let ix = 0; ix <= steps; ix += 1) {
    const x = envelope.minX + (maxOriginX - envelope.minX) * (ix / steps);
    for (let iy = 0; iy <= steps; iy += 1) {
      const y = envelope.minY + (maxOriginY - envelope.minY) * (iy / steps);
      if (!rectangleInsidePolygon(x, y, bounds.width, bounds.depth, envelope.polygon)) continue;
      const distance = (x - target.x) ** 2 + (y - target.y) ** 2;
      if (!best || distance < best.distance) best = { x, y, distance };
    }
  }
  return best ? { x: best.x, y: best.y, fits: true } : { ...target, fits: false };
  const canFitByBounds = bounds.width <= envelope.width + 0.001 && bounds.depth <= envelope.depth + 0.001;
  if (!canFitByBounds || envelope.polygon.length < 3) return { ...target, fits: false };
  if (rectangleInsidePolygon(target.x, target.y, bounds.width, bounds.depth, envelope.polygon)) {
    return { ...target, fits: true };
  }
  let best: { x: number; y: number; distance: number } | null = null;
  const steps = 30;
  for (let ix = 0; ix <= steps; ix += 1) {
    const x = envelope.minX + (maxOriginX - envelope.minX) * (ix / steps);
    for (let iy = 0; iy <= steps; iy += 1) {
      const y = envelope.minY + (maxOriginY - envelope.minY) * (iy / steps);
      if (!rectangleInsidePolygon(x, y, bounds.width, bounds.depth, envelope.polygon)) continue;
      const distance = (x - target.x) ** 2 + (y - target.y) ** 2;
      if (!best || distance < best.distance) best = { x, y, distance };
    }
  }
  return best ? { x: best.x, y: best.y, fits: true } : { ...target, fits: false };
}


export type SitePlacementSuggestion = {
  id: "access" | "balanced" | "free_area" | "site_optimized";
  title: string;
  description: string;
  origin: { x: number; y: number };
  score?: number;
  reasons?: string[];
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

function physicalClearance(
  origin: { x: number; y: number },
  bounds: SiteBuildingBounds,
  lotWidth: number,
  lotDepth: number,
) {
    top: Math.max(0, origin.y),
    bottom: Math.max(0, lotDepth - (origin.y + bounds.depth)),
    left: Math.max(0, origin.x),
    right: Math.max(0, lotWidth - (origin.x + bounds.width)),
  };
}

function scoreSiteOrigin(
  origin: { x: number; y: number },
  bounds: SiteBuildingBounds,
  lotWidth: number,
  lotDepth: number,
  placement: SitePlacement,
) {
  const m = clearanceMetrics(origin, bounds, lotWidth, lotDepth, placement);
  const physical = physicalClearance(origin, bounds, lotWidth, lotDepth);
  const reasons: string[] = [];
  let score = 60;

  const freeBySide = (side: SiteFrontSide | null | undefined) => side ? physical[side] : 0;

  // Acesso: menos percurso entre a rua/acesso de veículos e a edificação.
  const accessSide = placement.vehicleAccessSide ?? placement.frontSide;
  const accessGap = freeBySide(accessSide);
  score += Math.max(0, 18 - accessGap * 2.2);
  if (accessGap <= 4.5) reasons.push("bom vínculo com o acesso de veículos");

  // Solar: no hemisfério sul, preservar abertura e área livre ao norte favorece insolação.
  if (placement.northSide) {
    const northFree = freeBySide(placement.northSide);
    score += Math.min(18, northFree * 2.5);
    if (northFree >= 2.5) reasons.push("preserva faixa livre ao norte para luz natural");
  }

  // Vista/lazer: evita encostar a casa exatamente no lado de maior interesse.
  if (placement.preferredViewSide) {
    const viewFree = freeBySide(placement.preferredViewSide);
    score += Math.min(14, viewFree * 2.2);
    if (viewFree >= 2.5) reasons.push("valoriza a vista/área externa preferida");
  }

  // Vizinho crítico/ruído: aproximar a massa construída desse lado ajuda a liberar o lado oposto.
  if (placement.avoidSide) {
    const avoidFree = freeBySide(placement.avoidSide);
    score += Math.max(0, 10 - avoidFree * 1.8);
    if (avoidFree <= 2) reasons.push("reduz exposição ao lado crítico informado");
  }

  // Declive: como regra conceitual, privilegiar implantação próxima ao lado alto para reduzir corte/aterro.
  const slopeHighSide: SiteFrontSide | null =
    placement.slope === "to_front" ? (
      placement.frontSide === "top" ? "bottom" : placement.frontSide === "bottom" ? "top" :
      placement.frontSide === "left" ? "right" : "left"
    )
      : placement.slope === "to_rear" ? placement.frontSide
      : placement.slope === "to_left" ? "right"
      : placement.slope === "to_right" ? "left"
      : null;
  if (slopeHighSide) {
    const highGap = freeBySide(slopeHighSide);
    score += Math.max(0, 10 - highGap * 1.5);
    if (highGap <= 2.5) reasons.push("aproxima a casa do lado alto e tende a reduzir movimentação de terra");
  }

  // Estratégia escolhida pelo cliente/arquiteto.
  if (placement.strategy === "leisure") {
    score += Math.min(12, Math.max(m.rearFree, m.leftFree, m.rightFree) * 1.5);
  } else if (placement.strategy === "solar" && placement.northSide) {
    score += Math.min(12, freeBySide(placement.northSide) * 1.5);
  } else if (placement.strategy === "access") {
    score += Math.max(0, 12 - accessGap * 1.5);
  } else {
    const values = [m.frontFree, m.rearFree, m.leftFree, m.rightFree];
    const spread = Math.max(...values) - Math.min(...values);
    score += Math.max(0, 10 - spread);
  }

  return { score: Math.round(score), reasons, metrics: m };
}

function buildOptimizedOrigin(
  bounds: SiteBuildingBounds,
  lotWidth: number,
  lotDepth: number,
  placement: SitePlacement,
) {
  const envelope = getBuildableEnvelope(lotWidth, lotDepth, placement);
  const xSpan = Math.max(0, envelope.width - bounds.width);
  const ySpan = Math.max(0, envelope.depth - bounds.depth);
  const ratios = [0, 0.25, 0.5, 0.75, 1];
  let best = { x: envelope.minX, y: envelope.minY, score: -Infinity, reasons: [] as string[], metrics: clearanceMetrics({ x: envelope.minX, y: envelope.minY }, bounds, lotWidth, lotDepth, placement) };
  for (const rx of ratios) {
    for (const ry of ratios) {
      const requested = { x: envelope.minX + xSpan * rx, y: envelope.minY + ySpan * ry };
      const fitted = clampBuildingOrigin(requested.x, requested.y, bounds, lotWidth, lotDepth, placement);
      if (!fitted.fits) continue;
      const origin = { x: fitted.x, y: fitted.y };
      const evaluated = scoreSiteOrigin(origin, bounds, lotWidth, lotDepth, placement);
      if (evaluated.score > best.score) best = { ...origin, ...evaluated };
    }
  }
  return best;
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

  const centered = fit({
  const fit = (origin: { x: number; y: number }) => {
    const fitted = clampBuildingOrigin(origin.x, origin.y, bounds, lotWidth, lotDepth, placement);
    return { x: fitted.x, y: fitted.y };
  };
  const centered = fit({
    x: envelope.minX + Math.max(0, (envelope.width - bounds.width) / 2),
    y: envelope.minY + Math.max(0, (envelope.depth - bounds.depth) / 2),
  });

  const frontCenter = fit(frontAlignedOrigin(bounds, envelope, placement, 0.5));

  // Leaves the widest continuous side strip available for garden, access or leisure.
  const sideA = fit(frontAlignedOrigin(bounds, envelope, placement, 0));
  const sideB = fit(frontAlignedOrigin(bounds, envelope, placement, 1));
  const sideAMetrics = clearanceMetrics(sideA, bounds, lotWidth, lotDepth, placement);
  const sideBMetrics = clearanceMetrics(sideB, bounds, lotWidth, lotDepth, placement);
  const sideAScore = Math.max(sideAMetrics.leftFree, sideAMetrics.rightFree) + sideAMetrics.rearFree * 1.25;
  const sideBScore = Math.max(sideBMetrics.leftFree, sideBMetrics.rightFree) + sideBMetrics.rearFree * 1.25;
  const freeAreaOrigin = sideBScore > sideAScore ? sideB : sideA;

  const optimized = buildOptimizedOrigin(bounds, lotWidth, lotDepth, placement);
  const candidates: SitePlacementSuggestion[] = [
    {
      id: "site_optimized",
      title: "Recomendada pela IA",
      description: "Cruza acesso, norte/sol, declive, vista, lado crítico e a estratégia escolhida.",
      origin: { x: optimized.x, y: optimized.y },
      score: optimized.score,
      reasons: optimized.reasons,
      metrics: optimized.metrics,
    },
    {
      id: "access",
      title: "Acesso e garagem",
      description: "Aproxima a casa da rua e facilita entrada de veículos e pedestres.",
      origin: frontCenter,
      ...scoreSiteOrigin(frontCenter, bounds, lotWidth, lotDepth, placement),
    },
    {
      id: "balanced",
      title: "Implantação equilibrada",
      description: "Distribui os espaços livres ao redor da casa de forma mais uniforme.",
      origin: centered,
      ...scoreSiteOrigin(centered, bounds, lotWidth, lotDepth, placement),
    },
    {
      id: "free_area",
      title: "Mais área livre",
      description: "Encosta a casa em uma lateral para liberar uma faixa maior para jardim, lazer ou circulação.",
      origin: freeAreaOrigin,
      ...scoreSiteOrigin(freeAreaOrigin, bounds, lotWidth, lotDepth, placement),
    },
  ];
  return candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
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
