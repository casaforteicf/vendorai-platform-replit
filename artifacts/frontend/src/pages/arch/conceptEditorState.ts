import type { ConceptFacadePreferences } from "./ConceptVolumetry";
import type { OpeningMarker } from "./conceptGeometry";
import {
  clampOpeningOffset,
  clampOpeningWidthForWall,
  normalizeOpeningParameters,
  sanitizeOpeningParametersForPersistence,
  type OpeningParameters,
} from "./conceptOpenings";
import {
  defaultStairSourceParameters,
  normalizeStairParameters,
  type StairParameters,
} from "./conceptStairs";
import type { ConceptTypology, LayoutPreferences } from "./conceptTemplates";
import type { ConceptObject } from "./conceptObjects";
import type { ConceptMaterialScheme } from "./conceptMaterials";

export type RoomKind =
  | "sala"
  | "cozinha"
  | "suite"
  | "quarto"
  | "banheiro"
  | "lavanderia"
  | "garagem"
  | "gourmet"
  | "piscina"
  | "circulacao"
  | "escada"
  | "outro";

export type Room = {
  id: string;
  kind: RoomKind;
  label: string;
  width: number;
  depth: number;
  floor: number;
  x: number;
  y: number;
  locked?: boolean;
} & StairParameters;

export type OpeningOverride = {
  x: number;
  y: number;
  type: "door" | "window";
};

export type CustomWall = {
  id: string;
  floor: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness?: number;
};

export type CustomOpening = {
  id: string;
  wallId: string;
  floor: number;
  type: "door" | "window";
  offset: number;
} & OpeningParameters;

export type SpaceProfile = {
  id: string;
  floor: number;
  label: string;
  kind: string;
  centroid: { x: number; y: number };
  area: number;
};

export type EditorSnapshot = {
  rooms: Room[];
  customWalls: CustomWall[];
  customOpenings: CustomOpening[];
  objects: ConceptObject[];
  wallFirstFloors: number[];
  openingOverrides: Record<string, OpeningOverride>;
};

export type CustomerProfile = {
  name?: string;
  phone?: string;
  email?: string;
  budgetRange?: string;
  timeframe?: string;
  notes?: string;
};

export type ConceptRenderState = {
  renderId?: string;
  status?: "idle" | "processing" | "completed" | "error";
  resultImageUrl?: string;
  generatedAt?: string;
  error?: string;
};

export type ConceptDraftResponse = {
  id: string;
  status?: string;
  archProjetoId?: string | null;
  currentStep: number;
  lot: { width: number; depth: number };
  configuration: {
    floors: number;
    desiredArea: number;
    typology?: ConceptTypology;
    layoutPreferences?: LayoutPreferences;
    wallFirstFloors?: number[];
    showDimensions?: boolean;
    customWalls?: CustomWall[];
    customOpenings?: CustomOpening[];
    spaceProfiles?: SpaceProfile[];
    objects?: ConceptObject[];
    materials?: ConceptMaterialScheme;
  };
  rooms: Room[];
  openingOverrides: Record<string, OpeningOverride>;
  customerProfile?: CustomerProfile;
  facadePreferences?: ConceptFacadePreferences;
  conceptRender?: ConceptRenderState;
  selectedVariant: number;
};

const ROOM_DEFAULTS: Record<RoomKind, Omit<Room, "id" | "x" | "y" | "floor">> = {
  sala: { kind: "sala", label: "Sala + jantar", width: 5.5, depth: 4.5 },
  cozinha: { kind: "cozinha", label: "Cozinha", width: 3.5, depth: 3.5 },
  suite: { kind: "suite", label: "Suíte", width: 4, depth: 3.5 },
  quarto: { kind: "quarto", label: "Quarto", width: 3.2, depth: 3 },
  banheiro: { kind: "banheiro", label: "Banheiro", width: 2.4, depth: 1.5 },
  lavanderia: { kind: "lavanderia", label: "Lavanderia", width: 2.5, depth: 2 },
  garagem: { kind: "garagem", label: "Garagem 2 vagas", width: 5.8, depth: 5.5 },
  gourmet: { kind: "gourmet", label: "Gourmet", width: 4, depth: 3.5 },
  piscina: { kind: "piscina", label: "Piscina", width: 6, depth: 3 },
  circulacao: { kind: "circulacao", label: "Circulação", width: 1.2, depth: 5 },
  escada: { kind: "escada", label: "Escada", width: 2.2, depth: 3.8 },
  outro: { kind: "outro", label: "Outro ambiente", width: 3, depth: 3 },
};

export const SINGLETON_ROOM_KINDS = new Set<RoomKind>([
  "sala",
  "cozinha",
  "garagem",
  "lavanderia",
  "gourmet",
  "piscina",
]);

export function conceptUid() {
  return Math.random().toString(36).slice(2, 9);
}

export function createRoom(kind: RoomKind, floor = 0): Room {
  const base = ROOM_DEFAULTS[kind];
  return {
    ...base,
    ...(kind === "escada" ? defaultStairSourceParameters() : {}),
    id: conceptUid(),
    floor,
    x: 8,
    y: 8,
  };
}

export function customWallLength(wall: CustomWall) {
  return Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
}

export function normalizeCustomOpeningForWall(
  opening: CustomOpening,
  wall: CustomWall,
  patch: Partial<CustomOpening> = {},
): CustomOpening {
  const merged = { ...opening, ...patch };
  const params = normalizeOpeningParameters(merged.type, merged);
  const width = clampOpeningWidthForWall(params.width, customWallLength(wall));
  const offset = clampOpeningOffset(merged.offset, width, customWallLength(wall));
  return {
    ...merged,
    ...params,
    width,
    offset,
  };
}

export function normalizeCustomOpeningsForWalls(
  openings: CustomOpening[],
  walls: CustomWall[],
  forPersistence = false,
): CustomOpening[] {
  const wallsById = new Map(walls.map((wall) => [wall.id, wall]));
  return openings.map((opening) => {
    const wall = wallsById.get(opening.wallId);
    const normalized = wall
      ? normalizeCustomOpeningForWall(opening, wall)
      : { ...opening, ...normalizeOpeningParameters(opening.type, opening) };

    return forPersistence
      ? {
          ...normalized,
          ...sanitizeOpeningParametersForPersistence(normalized.type, normalized),
        }
      : normalized;
  });
}

export function customOpeningToMarker(
  opening: CustomOpening,
  wall: CustomWall,
): OpeningMarker {
  const normalized = normalizeCustomOpeningForWall(opening, wall);
  const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
  return {
    id: normalized.id,
    type: normalized.type,
    wallId: normalized.wallId,
    offset: normalized.offset,
    x: wall.x1 + (wall.x2 - wall.x1) * normalized.offset,
    y: wall.y1 + (wall.y2 - wall.y1) * normalized.offset,
    orientation: horizontal ? "horizontal" : "vertical",
    roomId: `custom-wall:${wall.id}`,
    width: normalized.width,
    height: normalized.height,
    sillHeight: normalized.sillHeight,
    openingStyle: normalized.openingStyle,
    swing: normalized.swing,
    presetId: normalized.presetId,
    manufacturer: normalized.manufacturer,
    productLine: normalized.productLine,
    profile: normalized.profile,
    frameMaterial: normalized.frameMaterial,
    frameColor: normalized.frameColor,
    glassType: normalized.glassType,
    glassThicknessMm: normalized.glassThicknessMm,
    leafCount: normalized.leafCount,
    unitCost: normalized.unitCost,
    components: normalized.components,
  };
}

function normalizeStairRoom(room: Room): Room {
  if (room.kind !== "escada") return room;
  const params = normalizeStairParameters(room);
  return {
    ...room,
    stairShape: params.stairShape,
    stairDirection: params.stairDirection,
    stairFloorToFloorHeight: params.stairFloorToFloorHeight,
    stairRiserCount: params.stairRiserCount,
    stairTreadDepth: params.stairTreadDepth,
    stairFlightWidth: params.stairFlightWidth,
    stairLandingDepth: params.stairLandingDepth,
  };
}

export function normalizeDraftRooms(input: Room[]) {
  const seen = new Set<string>();
  const normalized = input.map(normalizeStairRoom);
  const floorHeights = new Map<number, number>();

  for (const room of normalized) {
    if (room.kind !== "escada" || floorHeights.has(room.floor)) continue;
    floorHeights.set(room.floor, normalizeStairParameters(room).stairFloorToFloorHeight);
  }

  return normalized
    .map((room) =>
      room.kind === "escada" && floorHeights.has(room.floor)
        ? { ...room, stairFloorToFloorHeight: floorHeights.get(room.floor) }
        : room
    )
    .filter((room) => {
      if (!SINGLETON_ROOM_KINDS.has(room.kind)) return true;
      const key = `${room.floor}:${room.kind}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function autoArrange(
  rooms: Room[],
  lotWidth: number,
  lotDepth: number,
  floor: number,
) {
  const floorRooms = rooms.filter((room) => room.floor === floor);
  const others = rooms.filter((room) => room.floor !== floor);
  const gap = 1;
  const result: Room[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowDepth = 0;

  for (const room of floorRooms) {
    if (cursorX + room.width > lotWidth && cursorX > 0) {
      cursorX = 0;
      cursorY += rowDepth + gap;
      rowDepth = 0;
    }

    result.push({
      ...room,
      x: Math.min(cursorX, Math.max(0, lotWidth - room.width)),
      y: Math.min(cursorY, Math.max(0, lotDepth - room.depth)),
    });

    cursorX += room.width + gap;
    rowDepth = Math.max(rowDepth, room.depth);
  }

  return [...others, ...result];
}

export function cloneEditorSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    rooms: snapshot.rooms.map((room) => ({ ...room })),
    customWalls: snapshot.customWalls.map((wall) => ({ ...wall })),
    customOpenings: snapshot.customOpenings.map((opening) => ({ ...opening })),
    objects: snapshot.objects.map((object) => ({ ...object })),
    wallFirstFloors: [...snapshot.wallFirstFloors],
    openingOverrides: Object.fromEntries(
      Object.entries(snapshot.openingOverrides).map(([key, value]) => [key, { ...value }]),
    ),
  };
}
