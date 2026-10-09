import { describe, expect, it } from "vitest";
import { objectTransformPatch } from "./conceptObjectTransform";
describe("object transform commit", () => {
  it("snaps position and yaw", () => {
    expect(objectTransformPatch({ x: 0, z: 0 }, -Math.PI / 2, 1, 2, 10, 10)).toEqual({ x: 4.5, y: 4, rotation: 90 });
  });
  it("clamps after snapping at a non grid boundary", () => {
    expect(objectTransformPatch({ x: 20, z: 20 }, 0, 1.03, 1.03, 10, 10)).toEqual({ x: 8.97, y: 8.97, rotation: 0 });
  });
  it("keeps oversized objects at a non negative origin", () => {
    expect(objectTransformPatch({ x: -20, z: 20 }, 0, 12, 12, 10, 10)).toEqual({ x: 0, y: 0, rotation: 0 });
  });
  it("rejects invalid dimensions and positions", () => {
    expect(objectTransformPatch({ x: NaN, z: 0 }, 0, 1, 1, 10, 10)).toBeNull();
    expect(objectTransformPatch({ x: 0, z: 0 }, 0, 0, 1, 10, 10)).toBeNull();
  });
});
