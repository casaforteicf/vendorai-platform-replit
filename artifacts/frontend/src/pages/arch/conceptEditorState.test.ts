import { describe, expect, it } from "vitest";
import {
  autoArrange,
  cloneEditorSnapshot,
  createRoom,
  customOpeningToMarker,
  normalizeCustomOpeningForWall,
  normalizeDraftRooms,
  type EditorSnapshot,
} from "./conceptEditorState";

describe("concept editor state", () => {
  it("mantém apenas ambientes singleton por pavimento", () => {
    const a = { ...createRoom("sala", 0), id: "a" };
    const b = { ...createRoom("sala", 0), id: "b" };
    const upper = { ...createRoom("sala", 1), id: "upper" };
    const normalized = normalizeDraftRooms([a, b, upper]);
    expect(normalized.map((room) => room.id)).toEqual(["a", "upper"]);
  });

  it("mantém uma única altura piso-a-piso entre escadas do mesmo pavimento", () => {
    const first = { ...createRoom("escada", 0), id: "a", stairFloorToFloorHeight: 3.2 };
    const second = { ...createRoom("escada", 0), id: "b", stairFloorToFloorHeight: 3.5 };
    const normalized = normalizeDraftRooms([first, second]);
    expect(normalized[0]?.stairFloorToFloorHeight).toBe(3.2);
    expect(normalized[1]?.stairFloorToFloorHeight).toBe(3.2);
  });

  it("normaliza abertura pela parede e gera marker do mesmo objeto", () => {
    const wall = { id: "w", floor: 0, x1: 0, y1: 2, x2: 4, y2: 2 };
    const opening = {
      id: "o",
      wallId: "w",
      floor: 0,
      type: "door" as const,
      offset: 0,
      width: 2,
    };
    const normalized = normalizeCustomOpeningForWall(opening, wall);
    const marker = customOpeningToMarker(normalized, wall);
    expect(normalized.offset).toBeGreaterThan(0);
    expect(marker.wallId).toBe("w");
    expect(marker.x).toBeCloseTo(4 * normalized.offset);
    expect(marker.y).toBe(2);
  });

  it("organiza somente o pavimento alvo", () => {
    const ground = { ...createRoom("quarto", 0), id: "g", x: 9, y: 9 };
    const upper = { ...createRoom("quarto", 1), id: "u", x: 7, y: 7 };
    const result = autoArrange([ground, upper], 12, 20, 0);
    expect(result.find((room) => room.id === "g")?.x).toBe(0);
    expect(result.find((room) => room.id === "u")?.x).toBe(7);
  });

  it("clona snapshot sem compartilhar objetos editáveis", () => {
    const snapshot: EditorSnapshot = {
      rooms: [{ ...createRoom("quarto"), id: "r" }],
      customWalls: [],
      customOpenings: [],
      objects: [],
      wallFirstFloors: [0],
      openingOverrides: { a: { x: 1, y: 2, type: "door" } },
    };
    const cloned = cloneEditorSnapshot(snapshot);
    cloned.rooms[0]!.x = 99;
    cloned.openingOverrides.a!.x = 99;
    expect(snapshot.rooms[0]!.x).not.toBe(99);
    expect(snapshot.openingOverrides.a!.x).not.toBe(99);
  });
});
