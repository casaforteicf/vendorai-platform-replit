import { describe, expect, it } from "vitest";
import { furnitureFitsRoom } from "./conceptFurnitureRoomFit";
describe("furniture footprint inside room cells", () => {
  const object = { x: 1, y: 1, width: 2, depth: 2, rotation: 0 };
  it("accepts an object crossing internal cell boundaries", () => {
    expect(furnitureFitsRoom(object, [{ x: 0, y: 0, width: 2, height: 4 }, { x: 2, y: 0, width: 2, height: 4 }])).toBe(true);
  });
  it("checks rotated corners and supports diagonal furniture", () => {
    const cells = [{ x: 0, y: 0, width: 4, height: 4 }];
    expect(furnitureFitsRoom({ ...object, rotation: 45 }, cells)).toBe(true);
    expect(furnitureFitsRoom({ ...object, x: 0, rotation: 45 }, cells)).toBe(false);
  });
  it("rejects furniture across the missing portion of an L shaped room", () => {
    expect(furnitureFitsRoom(object, [{ x: 0, y: 0, width: 4, height: 2 }, { x: 0, y: 2, width: 2, height: 2 }])).toBe(false);
  });
  it("rejects gaps even when all corners lie in valid cells", () => {
    expect(furnitureFitsRoom({ ...object, x: 0, y: 0, width: 4, depth: 4 }, [{ x: 0, y: 0, width: 1, height: 4 }, { x: 3, y: 0, width: 1, height: 4 }])).toBe(false);
  });
});
