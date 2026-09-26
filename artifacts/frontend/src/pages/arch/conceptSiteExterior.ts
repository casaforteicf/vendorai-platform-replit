import type { FacadeDesignState, FacadeVolume } from "./conceptFacadeDesign";
import { normalizeSitePlacement, type SitePlacement } from "./conceptSitePlacement";

type RoomLike = {
  kind: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  label?: string;
};

export type SiteExteriorZoneKind =
  | "driveway"
  | "pedestrian"
  | "deck"
  | "garden"
  | "service"
  | "pool_buffer";

export type SiteExteriorZone = {
  id: string;
  kind: SiteExteriorZoneKind;
  label: string;
  x: number;
  y: number;
  width: number;
  depth: number;
};

export type SiteExteriorPlan = {
  frontLabel: string;
  frontageLength: number;
  garagePercent: number | null;
  garageSide: "left" | "center" | "right" | null;
  hasPool: boolean;
  hasGourmet: boolean;
  leisureSummary: string;
  zones: SiteExteriorZone[];
  pedestrianEntry: { x: number; y: number } | null;
  vehicleEntry: { x: number; y: number } | null;
};

function projectedPercent(room: RoomLike, lotWidth: number, lotDepth: number, placement: SitePlacement) {
  const safePlacement = normalizeSitePlacement(placement);
  const cx = room.x + room.width / 2;
  const cy = room.y + room.depth / 2;

  if (safePlacement.frontSide === "left") return Math.max(0, Math.min(100, ((lotDepth - cy) / Math.max(1, lotDepth)) * 100));
  if (safePlacement.frontSide === "right") return Math.max(0, Math.min(100, (cy / Math.max(1, lotDepth)) * 100));
  if (safePlacement.frontSide === "top") return Math.max(0, Math.min(100, ((lotWidth - cx) / Math.max(1, lotWidth)) * 100));
  return Math.max(0, Math.min(100, (cx / Math.max(1, lotWidth)) * 100));
}

export function buildSiteExteriorPlan(
  rooms: RoomLike[],
  lotWidth: number,
  lotDepth: number,
  placement: SitePlacement,
): SiteExteriorPlan {
  const safePlacement = normalizeSitePlacement(placement);
  const garage = rooms.find((room) => room.kind === "garagem");
  const pool = rooms.find((room) => room.kind === "piscina");
  const gourmet = rooms.find((room) => room.kind === "gourmet");
  const garagePercent = garage ? projectedPercent(garage, lotWidth, lotDepth, safePlacement) : null;
  const garageSide = garagePercent == null ? null : garagePercent < 40 ? "left" : garagePercent > 60 ? "right" : "center";

  const built = rooms.filter((room) => room.kind !== "piscina");
  const minX = built.length ? Math.min(...built.map((room) => room.x)) : lotWidth * 0.25;
  const minY = built.length ? Math.min(...built.map((room) => room.y)) : lotDepth * 0.25;
  const maxX = built.length ? Math.max(...built.map((room) => room.x + room.width)) : lotWidth * 0.75;
  const maxY = built.length ? Math.max(...built.map((room) => room.y + room.depth)) : lotDepth * 0.75;
  const garageCenter = garage
    ? { x: garage.x + garage.width / 2, y: garage.y + garage.depth / 2 }
    : { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };

  const frontPoint = (cx: number) => {
    if (safePlacement.frontSide === "top") return { x: cx, y: 0 };
    if (safePlacement.frontSide === "bottom") return { x: cx, y: lotDepth };
    if (safePlacement.frontSide === "left") return { x: 0, y: cx };
    return { x: lotWidth, y: cx };
  };
  const vehicleEntry = safePlacement.frontSide === "top" || safePlacement.frontSide === "bottom"
    ? frontPoint(garageCenter.x)
    : frontPoint(garageCenter.y);

  const mainEntranceCandidate = built.find((room) => /hall|entrada|sala|estar/i.test(room.label ?? ""))
    ?? built.find((room) => room.kind === "sala")
    ?? built[0];
  const entranceCenter = mainEntranceCandidate
    ? { x: mainEntranceCandidate.x + mainEntranceCandidate.width / 2, y: mainEntranceCandidate.y + mainEntranceCandidate.depth / 2 }
    : { x: lotWidth / 2, y: lotDepth / 2 };
  const pedestrianEntry = safePlacement.frontSide === "top" || safePlacement.frontSide === "bottom"
    ? frontPoint(entranceCenter.x)
    : frontPoint(entranceCenter.y);

  const zones: SiteExteriorZone[] = [];
  if (garage) {
    const drivewayWidth = Math.max(2.8, Math.min(6.5, garage.width));
    if (safePlacement.frontSide === "top") zones.push({
      id: "site-driveway",
      kind: "driveway",
      label: "Acesso de veículos",
      x: Math.max(0, garageCenter.x - drivewayWidth / 2),
      y: 0,
      width: drivewayWidth,
      depth: Math.max(1, garage.y),
    });
    else if (safePlacement.frontSide === "bottom") zones.push({
      id: "site-driveway",
      kind: "driveway",
      label: "Acesso de veículos",
      x: Math.max(0, garageCenter.x - drivewayWidth / 2),
      y: garage.y + garage.depth,
      width: drivewayWidth,
      depth: Math.max(1, lotDepth - (garage.y + garage.depth)),
    });
    else if (safePlacement.frontSide === "left") zones.push({
      id: "site-driveway",
      kind: "driveway",
      label: "Acesso de veículos",
      x: 0,
      y: Math.max(0, garageCenter.y - drivewayWidth / 2),
      width: Math.max(1, garage.x),
      depth: drivewayWidth,
    });
    else zones.push({
      id: "site-driveway",
      kind: "driveway",
      label: "Acesso de veículos",
      x: garage.x + garage.width,
      y: Math.max(0, garageCenter.y - drivewayWidth / 2),
      width: Math.max(1, lotWidth - (garage.x + garage.width)),
      depth: drivewayWidth,
    });
  }

  const pathWidth = 1.2;
  if (mainEntranceCandidate) {
    if (safePlacement.frontSide === "top") zones.push({
      id: "site-pedestrian",
      kind: "pedestrian",
      label: "Acesso de pedestres",
      x: Math.max(0, entranceCenter.x - pathWidth / 2),
      y: 0,
      width: pathWidth,
      depth: Math.max(1, mainEntranceCandidate.y),
    });
    else if (safePlacement.frontSide === "bottom") zones.push({
      id: "site-pedestrian",
      kind: "pedestrian",
      label: "Acesso de pedestres",
      x: Math.max(0, entranceCenter.x - pathWidth / 2),
      y: mainEntranceCandidate.y + mainEntranceCandidate.depth,
      width: pathWidth,
      depth: Math.max(1, lotDepth - (mainEntranceCandidate.y + mainEntranceCandidate.depth)),
    });
    else if (safePlacement.frontSide === "left") zones.push({
      id: "site-pedestrian",
      kind: "pedestrian",
      label: "Acesso de pedestres",
      x: 0,
      y: Math.max(0, entranceCenter.y - pathWidth / 2),
      width: Math.max(1, mainEntranceCandidate.x),
      depth: pathWidth,
    });
    else zones.push({
      id: "site-pedestrian",
      kind: "pedestrian",
      label: "Acesso de pedestres",
      x: mainEntranceCandidate.x + mainEntranceCandidate.width,
      y: Math.max(0, entranceCenter.y - pathWidth / 2),
      width: Math.max(1, lotWidth - (mainEntranceCandidate.x + mainEntranceCandidate.width)),
      depth: pathWidth,
    });
  }

  if (pool) {
    const buffer = 0.8;
    zones.push({
      id: "site-pool-buffer",
      kind: "pool_buffer",
      label: "Faixa de segurança da piscina",
      x: Math.max(0, pool.x - buffer),
      y: Math.max(0, pool.y - buffer),
      width: Math.min(lotWidth - Math.max(0, pool.x - buffer), pool.width + buffer * 2),
      depth: Math.min(lotDepth - Math.max(0, pool.y - buffer), pool.depth + buffer * 2),
    });
    const deckDepth = Math.max(1.2, Math.min(3, pool.depth * 0.45));
    zones.push({
      id: "site-deck",
      kind: "deck",
      label: "Deck da área de lazer",
      x: Math.max(0, pool.x - 0.6),
      y: Math.max(0, pool.y - deckDepth),
      width: Math.min(lotWidth - Math.max(0, pool.x - 0.6), pool.width + 1.2),
      depth: deckDepth,
    });
  } else if (gourmet) {
    zones.push({
      id: "site-deck",
      kind: "deck",
      label: "Pátio do gourmet",
      x: Math.max(0, gourmet.x - 0.5),
      y: Math.min(lotDepth - 1.5, gourmet.y + gourmet.depth),
      width: Math.min(lotWidth - Math.max(0, gourmet.x - 0.5), gourmet.width + 1),
      depth: 1.5,
    });
  }

  const rearGardenDepth = Math.max(0, lotDepth - maxY);
  if (rearGardenDepth >= 1.2) zones.push({
    id: "site-garden-rear",
    kind: "garden",
    label: "Jardim / quintal",
    x: Math.max(0, minX),
    y: maxY,
    width: Math.min(lotWidth - Math.max(0, minX), Math.max(1, maxX - minX)),
    depth: rearGardenDepth,
  });

  return {
    frontLabel:
      safePlacement.frontSide === "bottom" ? "frente inferior"
        : safePlacement.frontSide === "top" ? "frente superior"
        : safePlacement.frontSide === "left" ? "frente lateral esquerda"
        : "frente lateral direita",
    frontageLength: safePlacement.frontSide === "left" || safePlacement.frontSide === "right" ? lotDepth : lotWidth,
    garagePercent,
    garageSide,
    hasPool: Boolean(pool),
    hasGourmet: Boolean(gourmet),
    leisureSummary: pool && gourmet
      ? "gourmet e piscina existentes na planta permanecem vinculados à área de lazer com deck e faixa de circulação"
      : pool
        ? "piscina existente permanece na área de lazer com deck e faixa de segurança"
        : gourmet
          ? "espaço gourmet permanece vinculado ao quintal/pátio externo"
          : "implantação organiza acessos, jardim e áreas livres sem inventar lazer inexistente",
    zones,
    pedestrianEntry,
    vehicleEntry,
  };
}

function autoVolume(
  id: string,
  kind: FacadeVolume["kind"],
  label: string,
  x: number,
  y: number,
  width: number,
  height: number,
  materialId: FacadeVolume["materialId"],
  depth: number,
): FacadeVolume {
  return { id, kind, label, x, y, width, height, depth, materialId, opacity: 1 };
}

export function applySiteExteriorToFacade(
  design: FacadeDesignState,
  plan: SiteExteriorPlan,
): FacadeDesignState {
  const kept = design.volumes.filter((volume) => !volume.label.startsWith("Implantação ·"));
  const garageCenter = plan.garagePercent ?? 50;
  const gateWidth = 26;
  const gateX = Math.max(4, Math.min(100 - gateWidth - 4, garageCenter - gateWidth / 2));
  const gateRight = gateX + gateWidth;
  const leftWallWidth = Math.max(0, gateX - 5);
  const rightWallWidth = Math.max(0, 95 - gateRight);
  const planterX = garageCenter < 50 ? Math.min(72, gateRight + 8) : 8;

  const generated: FacadeVolume[] = [
    ...(leftWallWidth > 8
      ? [autoVolume("site-auto-wall-left", "wall", "Implantação · Muro frontal esquerdo", 4, 77, leftWallWidth, 13, "stone-graphite", 0.2)]
      : []),
    autoVolume("site-auto-gate", "gate", "Implantação · Portão garagem", gateX, 62, gateWidth, 28, "metal-black", 0.16),
    ...(rightWallWidth > 8
      ? [autoVolume("site-auto-wall-right", "wall", "Implantação · Muro frontal direito", gateRight + 1, 77, rightWallWidth, 13, "stone-graphite", 0.2)]
      : []),
    autoVolume("site-auto-planter", "planter", "Implantação · Jardim frontal", planterX, 78, 18, 9, "concrete-light", 0.4),
  ];

  return {
    ...design,
    showLandscaping: true,
    volumes: [...kept, ...generated],
    siteExterior: {
      zones: plan.zones,
      pedestrianEntry: plan.pedestrianEntry,
      vehicleEntry: plan.vehicleEntry,
    },
  };
}
