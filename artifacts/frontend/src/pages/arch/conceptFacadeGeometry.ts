import type { ConceptModelLevel } from "./ConceptModel3D";
import type { ConceptRoomShape } from "./conceptGeometry";
import type { SitePlacement } from "./conceptSitePlacement";

export type DerivedFacadeOpening = {
  id: string;
  type: "door" | "window";
  floor: number;
  axis: number;
  width: number;
  height: number;
  sillHeight: number;
  openingStyle?: "hinged" | "sliding" | "fixed" | "tilt_turn";
  swing?: "left" | "right";
};

export type DerivedFacadeModel = {
  frontSide: SitePlacement["frontSide"];
  minAxis: number;
  maxAxis: number;
  width: number;
  floors: number;
  height: number;
  openings: DerivedFacadeOpening[];
  garageRange?: { start: number; end: number };
};

function buildingRooms(rooms: ConceptRoomShape[]) {
  return (Array.isArray(rooms) ? rooms : []).filter((room) => room.kind !== "piscina");
}

function facadeBounds(
  rooms: ConceptRoomShape[],
  levels: ConceptModelLevel[],
) {
  const currentRooms = buildingRooms(rooms);
  const xs = currentRooms.flatMap((room) => [room.x, room.x + room.width]);
  const ys = currentRooms.flatMap((room) => [room.y, room.y + room.depth]);
  const walls = (levels ?? []).flatMap((level) => [
    ...(level.walls ?? []),
    ...(level.customWalls ?? []),
  ]);
  const wallXs = walls.flatMap((wall) => [wall.x1, wall.x2]);
  const wallYs = walls.flatMap((wall) => [wall.y1, wall.y2]);
  return {
    minX: Math.min(...(xs.length ? xs : wallXs.length ? wallXs : [0])),
    maxX: Math.max(...(xs.length ? xs : wallXs.length ? wallXs : [8])),
    minY: Math.min(...(ys.length ? ys : wallYs.length ? wallYs : [0])),
    maxY: Math.max(...(ys.length ? ys : wallYs.length ? wallYs : [8])),
  };
}

export function buildDerivedFacadeModel(
  levels: ConceptModelLevel[],
  rooms: ConceptRoomShape[],
  placement: SitePlacement,
): DerivedFacadeModel {
  const currentRooms = buildingRooms(rooms);
  const bounds = facadeBounds(rooms, levels);
  const horizontalFront = placement.frontSide === "top" || placement.frontSide === "bottom";
  const front = placement.frontSide === "top"
    ? bounds.minY
    : placement.frontSide === "bottom"
      ? bounds.maxY
      : placement.frontSide === "left"
        ? bounds.minX
        : bounds.maxX;

  const minAxis = horizontalFront ? bounds.minX : bounds.minY;
  const maxAxis = horizontalFront ? bounds.maxX : bounds.maxY;
  const width = Math.max(1, maxAxis - minAxis);
  const openings: DerivedFacadeOpening[] = [];

  for (const level of levels ?? []) {
    for (const opening of level.openings ?? []) {
      const onFront = horizontalFront
        ? Math.abs(opening.y - front) <= 0.32
        : Math.abs(opening.x - front) <= 0.32;
      if (!onFront) continue;
      openings.push({
        id: opening.id,
        type: opening.type,
        floor: level.floor,
        axis: horizontalFront ? opening.x : opening.y,
        width: Math.max(0.45, opening.width ?? (opening.type === "door" ? 0.9 : 1.2)),
        height: Math.max(0.5, opening.height ?? (opening.type === "door" ? 2.1 : 1.2)),
        sillHeight: opening.type === "door" ? 0 : Math.max(0, opening.sillHeight ?? 0.9),
        openingStyle: opening.openingStyle,
        swing: opening.swing,
      });
    }
  }

  const garage = currentRooms.find((room) => room.kind === "garagem" && room.floor === 0);
  const garageRange = garage
    ? horizontalFront
      ? { start: garage.x, end: garage.x + garage.width }
      : { start: garage.y, end: garage.y + garage.depth }
    : undefined;

  const maxFloor = Math.max(
    0,
    ...currentRooms.map((room) => room.floor),
    ...(levels ?? []).map((level) => level.floor),
  );

  return {
    frontSide: placement.frontSide,
    minAxis,
    maxAxis,
    width,
    floors: maxFloor + 1,
    height: (maxFloor + 1) * 2.96,
    openings,
    garageRange,
  };
}
