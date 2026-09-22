import type { FacadeDesignState, FacadeVolume } from "./conceptFacadeDesign";
import type { SitePlacement } from "./conceptSitePlacement";

type RoomLike = {
  kind: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  label?: string;
};

export type SiteExteriorPlan = {
  frontLabel: string;
  frontageLength: number;
  garagePercent: number | null;
  garageSide: "left" | "center" | "right" | null;
  hasPool: boolean;
  hasGourmet: boolean;
  leisureSummary: string;
};

function projectedPercent(room: RoomLike, lotWidth: number, lotDepth: number, placement: SitePlacement) {
  const cx = room.x + room.width / 2;
  const cy = room.y + room.depth / 2;

  if (placement.frontSide === "left") return Math.max(0, Math.min(100, ((lotDepth - cy) / Math.max(1, lotDepth)) * 100));
  if (placement.frontSide === "right") return Math.max(0, Math.min(100, (cy / Math.max(1, lotDepth)) * 100));
  if (placement.frontSide === "top") return Math.max(0, Math.min(100, ((lotWidth - cx) / Math.max(1, lotWidth)) * 100));
  return Math.max(0, Math.min(100, (cx / Math.max(1, lotWidth)) * 100));
}

export function buildSiteExteriorPlan(
  rooms: RoomLike[],
  lotWidth: number,
  lotDepth: number,
  placement: SitePlacement,
): SiteExteriorPlan {
  const garage = rooms.find((room) => room.kind === "garagem");
  const pool = rooms.find((room) => room.kind === "piscina");
  const gourmet = rooms.find((room) => room.kind === "gourmet");
  const garagePercent = garage ? projectedPercent(garage, lotWidth, lotDepth, placement) : null;
  const garageSide = garagePercent == null ? null : garagePercent < 40 ? "left" : garagePercent > 60 ? "right" : "center";

  return {
    frontLabel:
      placement.frontSide === "bottom" ? "frente inferior"
        : placement.frontSide === "top" ? "frente superior"
        : placement.frontSide === "left" ? "frente lateral esquerda"
        : "frente lateral direita",
    frontageLength: placement.frontSide === "left" || placement.frontSide === "right" ? lotDepth : lotWidth,
    garagePercent,
    garageSide,
    hasPool: Boolean(pool),
    hasGourmet: Boolean(gourmet),
    leisureSummary: pool && gourmet
      ? "gourmet e piscina existentes na planta devem permanecer vinculados à área de lazer"
      : pool
        ? "piscina existente na planta deve permanecer na área de lazer"
        : gourmet
          ? "espaço gourmet existente na planta deve permanecer vinculado ao quintal"
          : "sem área de lazer especial modelada",
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
  };
}
