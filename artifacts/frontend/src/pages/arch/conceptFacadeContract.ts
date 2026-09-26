import type { ConceptModelLevel } from "./ConceptModel3D";
import type { ConceptRoomShape } from "./conceptGeometry";
import { buildDerivedFacadeModel } from "./conceptFacadeGeometry";
import { normalizeSitePlacement, type SitePlacement } from "./conceptSitePlacement";

export type FacadeGeometryContract = {
  version: "master_facade_v1";
  frontSide: SitePlacement["frontSide"];
  roof: "platibanda" | "aparente" | "misto";
  derivedFacade: ReturnType<typeof buildDerivedFacadeModel>;
  walls: Array<{
    id: string;
    floor: number;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    thickness?: number;
  }>;
  openings: Array<{
    id: string;
    floor: number;
    type: "door" | "window";
    orientation: "horizontal" | "vertical";
    x: number;
    y: number;
    width: number;
    height: number;
    sillHeight: number;
  }>;
  roomFootprints: Array<{
    id: string;
    kind: string;
    floor: number;
    x: number;
    y: number;
    width: number;
    depth: number;
  }>;
};

export function buildFacadeGeometryContract(input: {
  levels: ConceptModelLevel[];
  rooms: ConceptRoomShape[];
  placement: SitePlacement;
  roof: "platibanda" | "aparente" | "misto";
}): FacadeGeometryContract {
  const placement = normalizeSitePlacement(input.placement);
  const derivedFacade = buildDerivedFacadeModel(input.levels, input.rooms, placement);

  const walls = input.levels.flatMap((level) => [
    ...(level.walls ?? []).map((wall, index) => ({
      id: String((wall as { id?: string }).id ?? `auto-wall-${level.floor}-${index}`),
      floor: level.floor,
      x1: wall.x1,
      y1: wall.y1,
      x2: wall.x2,
      y2: wall.y2,
      thickness: (wall as { thickness?: number }).thickness,
    })),
    ...(level.customWalls ?? []).map((wall) => ({
      id: wall.id,
      floor: level.floor,
      x1: wall.x1,
      y1: wall.y1,
      x2: wall.x2,
      y2: wall.y2,
      thickness: wall.thickness,
    })),
  ]);

  const openings = input.levels.flatMap((level) =>
    (level.openings ?? []).map((opening) => ({
      id: opening.id,
      floor: level.floor,
      type: opening.type,
      orientation: opening.orientation,
      x: opening.x,
      y: opening.y,
      width: Math.max(0.05, opening.width ?? (opening.type === "door" ? 0.9 : 1.2)),
      height: Math.max(0.05, opening.height ?? (opening.type === "door" ? 2.1 : 1.2)),
      sillHeight: opening.type === "door" ? 0 : Math.max(0, opening.sillHeight ?? 0.9),
    }))
  );

  const roomFootprints = (input.rooms ?? [])
    .filter((room) => room.kind !== "piscina")
    .map((room) => ({
      id: room.id,
      kind: room.kind,
      floor: room.floor,
      x: room.x,
      y: room.y,
      width: room.width,
      depth: room.depth,
    }));

  return {
    version: "master_facade_v1",
    frontSide: placement.frontSide,
    roof: input.roof,
    derivedFacade,
    walls,
    openings,
    roomFootprints,
  };
}
