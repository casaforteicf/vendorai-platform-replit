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
  const gateWidth = 30;
  const gateX = Math.max(2, Math.min(100 - gateWidth - 2, garageCenter - gateWidth / 2));
  const planterX = garageCenter < 50 ? 68 : 8;

  const generated: FacadeVolume[] = [
    autoVolume("site-auto-wall", "wall", "Implantação · Muro frontal", 4, 69, 92, 22, "stone-graphite", 0.25),
    autoVolume("site-auto-gate", "gate", "Implantação · Portão garagem", gateX, 56, gateWidth, 34, "metal-black", 0.18),
    autoVolume("site-auto-planter", "planter", "Implantação · Jardim frontal", planterX, 76, 22, 11, "concrete-light", 0.5),
  ];

  if (plan.hasGourmet) {
    generated.push(autoVolume("site-auto-pergola", "pergola", "Implantação · Pergolado lazer", garageCenter < 50 ? 58 : 8, 42, 28, 16, "wood-dark", 1.4));
  }

  return {
    ...design,
    showLandscaping: true,
    volumes: [...kept, ...generated],
  };
}
