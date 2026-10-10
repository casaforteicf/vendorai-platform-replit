import { describe, expect, it } from "vitest";
import { furnitureLayoutRevision } from "./conceptFurnitureLayoutRevision";
const object = { id: "a", floor: 0, kind: "bed", x: 0, y: 0, width: 2, depth: 1, rotation: 0, materialId: "white" };
const opening = { id: "door", floor: 0, wallId: "wall", type: "door", offset: 0.5, width: 0.9 };
const base = { floor: 0, lotWidth: 10, lotDepth: 10, spaceId: "room", spaceKind: "quarto", cells: [{ x: 0, y: 0, width: 5, height: 5 }], walls: [{ id: "wall", floor: 0, x1: 0, y1: 0, x2: 5, y2: 0, thickness: 0.15 }], openings: [opening], objects: [object] };
describe("furniture suggestion revision", () => {
  it("invalidates changes to opening placement and furniture rotation", () => {
    expect(furnitureLayoutRevision({ ...base, openings: [{ ...opening, offset: 0.7 }] })).not.toBe(furnitureLayoutRevision(base));
    expect(furnitureLayoutRevision({ ...base, objects: [{ ...object, rotation: 90 }] })).not.toBe(furnitureLayoutRevision(base));
  });
  it("invalidates wall, room, lot and room usage changes", () => {
    for (const patch of [{ lotWidth: 9 }, { spaceKind: "sala" }, { cells: [{ x: 0, y: 0, width: 4, height: 5 }] }, { walls: [{ ...base.walls[0], thickness: 0.2 }] }]) expect(furnitureLayoutRevision({ ...base, ...patch })).not.toBe(furnitureLayoutRevision(base));
  });
  it("preserves suggestions after material edits or other floor changes", () => {
    expect(furnitureLayoutRevision({ ...base, objects: [{ ...object, materialId: "wood" }, { ...object, id: "upstairs", floor: 1 }] })).toBe(furnitureLayoutRevision(base));
  });
  it("ignores array ordering but detects object removal", () => {
    const second = { ...object, id: "b", x: 3 };
    expect(furnitureLayoutRevision({ ...base, objects: [object, second] })).toBe(furnitureLayoutRevision({ ...base, objects: [second, object] }));
    expect(furnitureLayoutRevision({ ...base, objects: [] })).not.toBe(furnitureLayoutRevision(base));
  });
});
