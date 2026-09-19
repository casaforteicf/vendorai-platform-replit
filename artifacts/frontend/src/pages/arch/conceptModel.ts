import { buildConceptGeometry, type OpeningMarker, type WallSegment } from "./conceptGeometry";
import { detectClosedSpaces, type ClosedSpace } from "./conceptWallNetwork";
import {
  STAIR_LEVEL_HEIGHT,
  buildStairSlabOpenings,
  normalizeStairParameters,
  type StairCarrier,
  type StairSlabOpening,
} from "./conceptStairs";
import { normalizeConceptObject, type ConceptObject } from "./conceptObjects";
import {
  customOpeningToMarker,
  type CustomOpening,
  type CustomWall,
  type OpeningOverride,
  type Room,
  type SpaceProfile,
} from "./conceptEditorState";

export type ConceptModelLevel = {
  floor: number;
  elevation: number;
  floorToFloorHeight: number;
  walls: WallSegment[];
  customWalls: CustomWall[];
  closedSpaces: ClosedSpace[];
  openings: OpeningMarker[];
  labels: Record<string, string>;
  stairs: StairCarrier[];
  slabOpenings: StairSlabOpening[];
  objects: ConceptObject[];
};

export type ConceptModelInput = {
  floors: number;
  rooms: Room[];
  objects: ConceptObject[];
  lotWidth: number;
  lotDepth: number;
  openingOverrides: Record<string, OpeningOverride>;
  customWalls: CustomWall[];
  customOpenings: CustomOpening[];
  spaceProfiles: SpaceProfile[];
  wallFirstFloors: number[];
};

export function matchSpaceProfiles(
  spaces: ClosedSpace[],
  profiles: SpaceProfile[],
  floor: number,
) {
  const assignments = new Map<string, SpaceProfile>();
  const usedProfiles = new Set<string>();

  for (const space of spaces) {
    const best = profiles
      .filter((profile) => profile.floor === floor && !usedProfiles.has(profile.id))
      .map((profile) => {
        const distance = Math.hypot(
          profile.centroid.x - space.centroid.x,
          profile.centroid.y - space.centroid.y,
        );
        const areaRatio = Math.abs(profile.area - space.area) / Math.max(1, space.area);
        return { profile, score: distance + areaRatio * 2.5, distance, areaRatio };
      })
      .filter((candidate) => candidate.distance <= 3.5 && candidate.areaRatio <= 0.65)
      .sort((a, b) => a.score - b.score)[0]?.profile;

    if (best) {
      assignments.set(space.id, best);
      usedProfiles.add(best.id);
    }
  }

  return assignments;
}

export function buildConceptModelLevels(input: ConceptModelInput): ConceptModelLevel[] {
  const {
    floors,
    rooms,
    objects,
    lotWidth,
    lotDepth,
    openingOverrides,
    customWalls,
    customOpenings,
    spaceProfiles,
    wallFirstFloors,
  } = input;

  const floorToFloorHeight = (floorIndex: number) => {
    const stair = rooms.find((room) => room.floor === floorIndex && room.kind === "escada");
    return stair
      ? normalizeStairParameters(stair).stairFloorToFloorHeight
      : STAIR_LEVEL_HEIGHT;
  };

  const elevations: number[] = [];
  let runningElevation = 0;
  for (let floor = 0; floor < floors; floor += 1) {
    elevations[floor] = runningElevation;
    runningElevation += floorToFloorHeight(floor);
  }

  return Array.from({ length: floors }, (_, floorIndex) => {
    const base = buildConceptGeometry(rooms, lotWidth, lotDepth, floorIndex);
    const floorGeometry = {
      ...base,
      openings: base.openings.map((opening) => {
        const override = openingOverrides[opening.id];
        return override ? { ...opening, ...override } : opening;
      }),
    };

    const floorWallFirst = wallFirstFloors.includes(floorIndex);
    const floorCustomWalls = customWalls.filter((wall) => wall.floor === floorIndex);
    const legacyWalls = floorWallFirst ? [] : floorGeometry.walls;
    const floorCustomOpeningMarkers = customOpenings
      .filter((opening) => opening.floor === floorIndex)
      .flatMap((opening) => {
        const wall = floorCustomWalls.find((item) => item.id === opening.wallId);
        return wall ? [customOpeningToMarker(opening, wall)] : [];
      });

    const floorClosedSpaces = detectClosedSpaces(
      [
        ...legacyWalls.map((wall) => ({
          id: wall.id,
          x1: wall.x1,
          y1: wall.y1,
          x2: wall.x2,
          y2: wall.y2,
        })),
        ...floorCustomWalls.map((wall) => ({
          id: wall.id,
          x1: wall.x1,
          y1: wall.y1,
          x2: wall.x2,
          y2: wall.y2,
        })),
      ],
      lotWidth,
      lotDepth,
    );

    const profileAssignments = matchSpaceProfiles(floorClosedSpaces, spaceProfiles, floorIndex);
    const labels = Object.fromEntries(
      [...profileAssignments.entries()].map(([spaceId, profile]) => [spaceId, profile.label]),
    );

    return {
      floor: floorIndex,
      elevation: elevations[floorIndex] ?? 0,
      floorToFloorHeight: floorToFloorHeight(floorIndex),
      walls: legacyWalls,
      customWalls: floorCustomWalls,
      closedSpaces: floorClosedSpaces,
      openings: floorWallFirst
        ? floorCustomOpeningMarkers
        : [...floorGeometry.openings, ...floorCustomOpeningMarkers],
      labels,
      stairs: rooms
        .filter((room) => room.floor === floorIndex && room.kind === "escada")
        .map((room) => ({ ...room, ...normalizeStairParameters(room) })),
      slabOpenings: floorIndex > 0
        ? rooms
            .filter((room) => room.floor === floorIndex - 1 && room.kind === "escada")
            .flatMap((room) => buildStairSlabOpenings(room))
        : [],
      objects: objects
        .filter((object) => object.floor === floorIndex)
        .map((object) => normalizeConceptObject(object, lotWidth, lotDepth)),
    };
  });
}
