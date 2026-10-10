import { describe, expect, it } from "vitest";
import { furniturePresetFootprint, positionFurnitureInBounds } from "./conceptFurniturePreset";
import { furnitureFitsRoom } from "./conceptFurnitureRoomFit";
describe("furniture preset dimensions", () => {
  it("retains nominal dimensions rather than shrinking to a room", () => {
    const bed = furniturePresetFootprint(1.6, 2, 0, 0, 0);
    expect(bed.width).toBe(1.6);
    expect(bed.depth).toBe(2);
    expect(furnitureFitsRoom(bed, [{ x: 0, y: 0, width: 1.2, height: 2 }])).toBe(false);
  });
  it("converts a quarter-turn placement box to local dimensions around the same center", () => {
    const bed = furniturePresetFootprint(2, 1.6, 1, 1, 90);
    expect(bed.width).toBe(1.6);
    expect(bed.depth).toBe(2);
    expect(bed.x + bed.width / 2).toBe(2);
    expect(bed.y + bed.depth / 2).toBe(1.8);
    expect(furnitureFitsRoom(bed, [{ x: 1, y: 1, width: 2, height: 1.6 }])).toBe(true);
  });
  it("preserves sofa placement at negative and wrapped quarter turns", () => {
    for (const rotation of [-90, 270, 450]) {
      const sofa = furniturePresetFootprint(0.9, 2.2, 2, 3, rotation);
      expect(sofa.width).toBe(2.2);
      expect(sofa.depth).toBe(0.9);
      expect(furnitureFitsRoom(sofa, [{ x: 2, y: 3, width: 0.9, height: 2.2 }])).toBe(true);
    }
  });
});

describe("rotated furniture position limits", () => {
  it("positions the rotated envelope inside the room without resizing", () => {
    const object = { width: 1.6, depth: 2, rotation: 90, x: 99, y: -99 };
    const bounds = { x: 0, y: 0, width: 3, height: 2 };
    const position = positionFurnitureInBounds(object, bounds);
    expect(position).not.toBeNull();
    expect(furnitureFitsRoom({ ...object, ...position! }, [bounds])).toBe(true);
    expect(positionFurnitureInBounds(object, { ...bounds, width: 1.9 })).toBeNull();
  });
});
