import type { ConceptModelLevel } from "./ConceptModel3D";
import type { ConceptRoomShape } from "./conceptGeometry";
import { normalizeSitePlacement, type SitePlacement } from "./conceptSitePlacement";

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
  stories: Array<{ floor: number; minAxis: number; maxAxis: number }>;
  openings: DerivedFacadeOpening[];
  garageRange?: { start: number; end: number };
  /** Varandas encostadas na frente: aparecem como recuo aberto, não como parede cega. */
  porchRanges: Array<{ floor: number; start: number; end: number }>;
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
    minX: Math.min(...(xs.length || wallXs.length ? [...xs, ...wallXs] : [0])),
    maxX: Math.max(...(xs.length || wallXs.length ? [...xs, ...wallXs] : [8])),
    minY: Math.min(...(ys.length || wallYs.length ? [...ys, ...wallYs] : [0])),
    maxY: Math.max(...(ys.length || wallYs.length ? [...ys, ...wallYs] : [8])),
  };
}

export function buildDerivedFacadeModel(
  levels: ConceptModelLevel[],
  rooms: ConceptRoomShape[],
  placement: SitePlacement,
  options?: { preserveOpeningGeometry?: boolean },
): DerivedFacadeModel {
  const safePlacement = normalizeSitePlacement(placement);
  const currentRooms = buildingRooms(rooms);
  const bounds = facadeBounds(rooms, levels);
  const horizontalFront = safePlacement.frontSide === "top" || safePlacement.frontSide === "bottom";

  const minAxis = horizontalFront ? bounds.minX : bounds.minY;
  const maxAxis = horizontalFront ? bounds.maxX : bounds.maxY;
  const width = Math.max(1, maxAxis - minAxis);
  const openings: DerivedFacadeOpening[] = [];
  // Parede do fundo de uma varanda frontal também aparece na fachada (é onde fica a porta de entrada).
  const porchBacks = currentRooms
    .filter((room) => /varanda/i.test(room.label ?? "") && room.kind !== "gourmet")
    .map((room) => ({
      floor: room.floor,
      start: horizontalFront ? room.x : room.y,
      end: horizontalFront ? room.x + room.width : room.y + room.depth,
      back: safePlacement.frontSide === "top" ? room.y + room.depth
        : safePlacement.frontSide === "bottom" ? room.y
          : safePlacement.frontSide === "left" ? room.x + room.width : room.x,
    }));

  for (const level of levels ?? []) {
    // Each storey can have a setback: its front is not the ground-floor front.
    const floorBounds = facadeBounds(currentRooms.filter((room) => room.floor === level.floor), [level]);
    const floorFront = safePlacement.frontSide === "top" ? floorBounds.minY
      : safePlacement.frontSide === "bottom" ? floorBounds.maxY
      : safePlacement.frontSide === "left" ? floorBounds.minX : floorBounds.maxX;
    for (const opening of level.openings ?? []) {
      const axis = horizontalFront ? opening.x : opening.y;
      const frontWalls = [...(level.walls ?? []), ...(level.customWalls ?? [])].filter((wall) => {
        const parallel = horizontalFront ? Math.abs(wall.y2 - wall.y1) < 0.01 : Math.abs(wall.x2 - wall.x1) < 0.01;
        const a = horizontalFront ? wall.x1 : wall.y1;
        const b = horizontalFront ? wall.x2 : wall.y2;
        return parallel && axis >= Math.min(a, b) - 0.01 && axis <= Math.max(a, b) + 0.01;
      });
      const depths = frontWalls.map((wall) => horizontalFront ? wall.y1 : wall.x1);
      const visibleFront = depths.length
        ? (safePlacement.frontSide === "top" || safePlacement.frontSide === "left" ? Math.min(...depths) : Math.max(...depths))
        : floorFront;
      const onFront = horizontalFront
        ? opening.orientation === "horizontal" && Math.abs(opening.y - visibleFront) <= 0.32
        : opening.orientation === "vertical" && Math.abs(opening.x - visibleFront) <= 0.32;
      const behindPorch = porchBacks.some((porch) => porch.floor === level.floor
        && axis >= porch.start - 0.01 && axis <= porch.end + 0.01
        && (horizontalFront ? opening.orientation === "horizontal" && Math.abs(opening.y - porch.back) <= 0.32
          : opening.orientation === "vertical" && Math.abs(opening.x - porch.back) <= 0.32));
      if (!onFront && !behindPorch) continue;
      openings.push({
        id: opening.id,
        type: opening.type,
        floor: level.floor,
        axis: horizontalFront ? opening.x : opening.y,
        width: Math.max(0.05, opening.width ?? (opening.type === "door" ? 0.9 : 1.2)),
        height: Math.max(0.05, opening.height ?? (opening.type === "door" ? 2.1 : 1.2)),
        sillHeight: opening.type === "door" ? 0 : Math.max(0, opening.sillHeight ?? 0.9),
        openingStyle: opening.openingStyle,
        swing: opening.swing,
      });
    }
  }

  // Porta e janela no mesmo trecho da fachada (ex.: porta de entrada no fundo da varanda e a
  // porta-janela da sala) não podem se sobrepor no desenho: a janela recua para o lado livre.
  if (!options?.preserveOpeningGeometry) for (const door of openings.filter((item) => item.type === "door")) {
    const doorStart = door.axis - door.width / 2 - 0.15;
    const doorEnd = door.axis + door.width / 2 + 0.15;
    for (let index = openings.length - 1; index >= 0; index -= 1) {
      const win = openings[index];
      if (win.type !== "window" || win.floor !== door.floor) continue;
      const winStart = win.axis - win.width / 2;
      const winEnd = win.axis + win.width / 2;
      if (winEnd <= doorStart || winStart >= doorEnd) continue;
      const left = doorStart - winStart;
      const right = winEnd - doorEnd;
      const keep = Math.max(left, right);
      if (keep < 0.6) {
        openings.splice(index, 1);
        continue;
      }
      win.width = keep;
      win.axis = left >= right ? winStart + keep / 2 : doorEnd + keep / 2;
    }
  }

  const frontEdge = (room: ConceptRoomShape) => safePlacement.frontSide === "top" ? room.y
    : safePlacement.frontSide === "bottom" ? -(room.y + room.depth)
      : safePlacement.frontSide === "left" ? room.x : -(room.x + room.width);
  const floorFrontEdge = (floor: number) => Math.min(...currentRooms.filter((room) => room.floor === floor).map(frontEdge));
  const touchesFront = (room: ConceptRoomShape) => frontEdge(room) - floorFrontEdge(room.floor) < 0.35;

  // Portão só quando a garagem abre para a rua (antes desenhava portão em garagem nos fundos).
  const garage = currentRooms.find((room) => room.kind === "garagem" && room.floor === 0 && touchesFront(room));
  const porchRanges = currentRooms
    .filter((room) => /varanda|sacada/i.test(room.label ?? "") && touchesFront(room))
    .map((room) => horizontalFront
      ? { floor: room.floor, start: room.x, end: room.x + room.width }
      : { floor: room.floor, start: room.y, end: room.y + room.depth });
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
    frontSide: safePlacement.frontSide,
    minAxis,
    maxAxis,
    width,
    floors: maxFloor + 1,
    height: (maxFloor + 1) * 2.96,
    stories: Array.from({ length: maxFloor + 1 }, (_, floor) => {
      const floorBounds = facadeBounds(currentRooms.filter((room) => room.floor === floor), (levels ?? []).filter((level) => level.floor === floor));
      return { floor, minAxis: horizontalFront ? floorBounds.minX : floorBounds.minY,
        maxAxis: horizontalFront ? floorBounds.maxX : floorBounds.maxY };
    }),
    openings,
    garageRange,
    porchRanges,
  };
}
