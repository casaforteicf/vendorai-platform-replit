import { describe, expect, it } from "vitest";
import { furnitureOverlaps, furnitureLayoutCollisionError, furnitureHasClearance, furnitureBlocksZone } from "./conceptFurnitureCollision";
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
  it("normalizes large finite rotations before collision detection", () => {
    const other = { ...item, x: 1 };
    expect(furnitureOverlaps({ ...item, rotation: 360000 }, other)).toBe(true);
    expect(furnitureOverlaps({ ...item, rotation: 1e308 }, other)).toBe(
      furnitureOverlaps({ ...item, rotation: 1e308 % 360 }, other),
    );
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

describe("furniture circulation clearance", () => {
  it("requires the requested gap while allowing its boundary", () => {
    expect(furnitureHasClearance(item, { ...item, x: 2.2 }, 0.3)).toBe(false);
    expect(furnitureHasClearance(item, { ...item, x: 2.3 }, 0.3)).toBe(true);
  });
  it("keeps the clearance band aligned with rotated furniture", () => {
    const rotated = { ...item, rotation: 90 };
    expect(furnitureHasClearance(rotated, { ...item, x: 1.6 }, 0.2)).toBe(false);
    expect(furnitureHasClearance(rotated, { ...item, x: 1.8 }, 0.2)).toBe(true);
  });
  it("permits decoration and ignores other floors", () => {
    expect(furnitureHasClearance(item, { ...item, kind: "rug" }, 0.4)).toBe(true);
    expect(furnitureHasClearance(item, { ...item, floor: 1 }, 0.4)).toBe(true);
    expect(furnitureHasClearance(item, item, NaN)).toBe(false);
  });
});

describe("opening clearance zones", () => {
  const zone = { x: 1.6, y: 0, width: 0.2, height: 1 };
  it("detects a rotated tip entering a zone outside the unrotated box", () => {
    expect(furnitureBlocksZone({ ...item, width: 1, depth: 2, rotation: 90 }, zone)).toBe(false);
    expect(furnitureBlocksZone({ ...item, x: 0.7, width: 1, depth: 2, rotation: 90 }, zone)).toBe(true);
  });
  it("allows an opening zone clear of the rotated contour", () => {
    expect(furnitureBlocksZone({ ...item, rotation: 90 }, { x: 0, y: 0, width: 0.2, height: 0.2 })).toBe(false);
  });
  it("checks margins and supports rotated zones", () => {
    expect(furnitureBlocksZone(item, { x: 2.1, y: 0, width: 1, height: 1 }, 0.2)).toBe(true);
    expect(furnitureBlocksZone(item, { x: 2.2, y: 0, width: 1, height: 1 }, 0.2)).toBe(false);
    expect(furnitureBlocksZone(item, { x: 1, y: 0, width: 1, height: 1, rotation: 45 })).toBe(true);
  });
});
