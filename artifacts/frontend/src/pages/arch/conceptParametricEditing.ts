import type { ConceptRoomShape, OpeningMarker } from "./conceptGeometry";

export type EditableWall = {
  id: string;
  floor: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness?: number;
};

export type EditableObject = {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
};

export function clampRoomToLot<T extends ConceptRoomShape>(room: T, lotWidth: number, lotDepth: number): T {
  const minSize = room.kind === "piscina" ? 1.2 : 1;
  const width = Math.max(minSize, Math.min(lotWidth, Number(room.width) || minSize));
  const depth = Math.max(minSize, Math.min(lotDepth, Number(room.depth) || minSize));
  return {
    ...room,
    width,
    depth,
    x: Math.max(0, Math.min(Math.max(0, lotWidth - width), Number(room.x) || 0)),
    y: Math.max(0, Math.min(Math.max(0, lotDepth - depth), Number(room.y) || 0)),
  };
}

export function clampWallToLot<T extends EditableWall>(wall: T, lotWidth: number, lotDepth: number): T {
  return {
    ...wall,
    x1: Math.max(0, Math.min(lotWidth, Number(wall.x1) || 0)),
    x2: Math.max(0, Math.min(lotWidth, Number(wall.x2) || 0)),
    y1: Math.max(0, Math.min(lotDepth, Number(wall.y1) || 0)),
    y2: Math.max(0, Math.min(lotDepth, Number(wall.y2) || 0)),
    thickness: Math.max(0.08, Math.min(0.5, Number.isFinite(Number(wall.thickness)) && Number(wall.thickness) > 0 ? Number(wall.thickness) : 0.15)),
  };
}

export function clampObjectToLot<T extends EditableObject>(object: T, lotWidth: number, lotDepth: number): T {
  const width = Math.max(0.3, Math.min(lotWidth, Number(object.width) || 0.3));
  const depth = Math.max(0.3, Math.min(lotDepth, Number(object.depth) || 0.3));
  return {
    ...object,
    width,
    depth,
    x: Math.max(0, Math.min(Math.max(0, lotWidth - width), Number(object.x) || 0)),
    y: Math.max(0, Math.min(Math.max(0, lotDepth - depth), Number(object.y) || 0)),
  };
}

export function normalizeOpeningDimensions(
  opening: Pick<OpeningMarker, "type"> & Partial<Pick<OpeningMarker, "width" | "height" | "sillHeight" | "openingStyle" | "swing">>,
) {
  const isDoor = opening.type === "door";
  return {
    width: Math.max(0.5, Math.min(4, Number(opening.width) || (isDoor ? 0.9 : 1.2))),
    height: Math.max(0.5, Math.min(2.8, Number(opening.height) || (isDoor ? 2.1 : 1.2))),
    sillHeight: isDoor ? 0 : Math.max(0, Math.min(2.2,
      opening.sillHeight != null && Number.isFinite(Number(opening.sillHeight)) ? Number(opening.sillHeight) : 0.9)),
    openingStyle: opening.openingStyle ?? (isDoor ? "hinged" : "sliding"),
    swing: opening.swing ?? "left",
  };
}

export function sameRoomIdentity(before: ConceptRoomShape[], after: ConceptRoomShape[]) {
  const beforeIds = before.map((room) => room.id).sort();
  const afterIds = after.map((room) => room.id).sort();
  return beforeIds.length === afterIds.length && beforeIds.every((id, index) => id === afterIds[index]);
}


