import { describe, expect, it } from "vitest";
import { furnitureOverlaps, furnitureLayoutCollisionError } from "./conceptFurnitureCollision";
const item = { kind: "sofa", label: "Sofá", floor: 0, x: 0, y: 0, width: 2, depth: 1, rotation: 0 };
describe("layout furniture collisions", () => {
  it("rejects overlapping footprints but allows touching edges", () => {
    expect(furnitureOverlaps(item, { ...item, x: 1 })).toBe(true);
    expect(furnitureOverlaps(item, { ...item, x: 2 })).toBe(false);
  });
  it("uses rotated contours instead of bounding boxes", () => {
    const diagonal = { ...item, width: 4, depth: 0.2, rotation: 45 };
    expect(furnitureOverlaps(diagonal, { ...diagonal, y: 0.5 })).toBe(false);
    expect(furnitureOverlaps(diagonal, { ...diagonal, y: 0.1 })).toBe(true);
  });
  it("separates floors and permits decorative layering", () => {
    expect(furnitureOverlaps(item, { ...item, floor: 1 })).toBe(false);
    for (const kind of ["rug", "lamp", "tv", "plant", "outlet"]) expect(furnitureOverlaps(item, { ...item, kind })).toBe(false);
  });
  it("checks existing furniture and collisions within the proposed batch", () => {
    expect(furnitureLayoutCollisionError([item], [{ ...item, x: 1 }])).toContain("Sofá");
    expect(furnitureLayoutCollisionError([item, { ...item, x: 1 }], [])).toContain("Sofá");
    expect(furnitureLayoutCollisionError([item, { ...item, x: 3 }], [])).toBeNull();
  });
  it("ignores malformed existing footprints", () => {
    expect(furnitureOverlaps(item, { ...item, rotation: NaN })).toBe(false);
    expect(furnitureOverlaps(item, { ...item, width: 0 })).toBe(false);
  });
});
