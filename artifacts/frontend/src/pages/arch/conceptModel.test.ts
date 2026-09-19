import { describe, expect, it } from "vitest";
import { buildConceptModelLevels, matchSpaceProfiles } from "./conceptModel";
import { createRoom, type SpaceProfile } from "./conceptEditorState";

describe("concept model derivation", () => {
  it("acumula elevação usando a mesma altura paramétrica da escada", () => {
    const stair = {
      ...createRoom("escada", 0),
      id: "stair",
      stairFloorToFloorHeight: 3.2,
    };
    const levels = buildConceptModelLevels({
      floors: 2,
      rooms: [stair],
      objects: [],
      lotWidth: 12,
      lotDepth: 20,
      openingOverrides: {},
      customWalls: [],
      customOpenings: [],
      spaceProfiles: [],
      wallFirstFloors: [],
    });
    expect(levels[0]?.elevation).toBe(0);
    expect(levels[1]?.elevation).toBeCloseTo(3.2);
  });

  it("wall-first elimina paredes legadas e usa a rede customizada", () => {
    const room = { ...createRoom("sala", 0), id: "room", x: 1, y: 1, width: 4, depth: 4 };
    const customWalls = [
      { id: "a", floor: 0, x1: 0, y1: 0, x2: 5, y2: 0 },
      { id: "b", floor: 0, x1: 5, y1: 0, x2: 5, y2: 5 },
      { id: "c", floor: 0, x1: 5, y1: 5, x2: 0, y2: 5 },
      { id: "d", floor: 0, x1: 0, y1: 5, x2: 0, y2: 0 },
    ];
    const levels = buildConceptModelLevels({
      floors: 1,
      rooms: [room],
      objects: [],
      lotWidth: 12,
      lotDepth: 20,
      openingOverrides: {},
      customWalls,
      customOpenings: [],
      spaceProfiles: [],
      wallFirstFloors: [0],
    });
    expect(levels[0]?.walls).toHaveLength(0);
    expect(levels[0]?.customWalls).toHaveLength(4);
    expect(levels[0]?.closedSpaces.length).toBeGreaterThan(0);
  });

  it("reutiliza um único algoritmo de associação de perfil ao espaço", () => {
    const spaces = [{
      id: "space",
      cells: [{ x: 0, y: 0, width: 4, height: 4 }],
      bounds: { x: 0, y: 0, width: 4, height: 4 },
      centroid: { x: 2, y: 2 },
      area: 16,
    }];
    const profiles: SpaceProfile[] = [{
      id: "profile",
      floor: 0,
      label: "Sala",
      kind: "sala",
      centroid: { x: 2.1, y: 2.1 },
      area: 15.8,
    }];
    expect(matchSpaceProfiles(spaces, profiles, 0).get("space")?.label).toBe("Sala");
  });
});
