import { describe, expect, it } from "vitest";
import { boundedObjectGeometry, objectTransformPatch } from "./conceptObjectTransform";
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

describe("rotated object bounds", () => {
  it("keeps every corner within the lot at diagonal angles", () => {
    for (const degrees of [5, 45, 90, 135, 225, 315]) {
      const patch = objectTransformPatch({ x: 100, z: -100 }, -degrees * Math.PI / 180, 2, 4, 10, 12)!;
      const angle = patch.rotation * Math.PI / 180;
      for (const x of [-1, 1]) for (const y of [-2, 2]) {
        const px = patch.x + 1 + x * Math.cos(angle) - y * Math.sin(angle);
        const py = patch.y + 2 + x * Math.sin(angle) + y * Math.cos(angle);
        expect(px).toBeGreaterThanOrEqual(-1e-8); expect(px).toBeLessThanOrEqual(10 + 1e-8);
        expect(py).toBeGreaterThanOrEqual(-1e-8); expect(py).toBeLessThanOrEqual(12 + 1e-8);
      }
    }
  });
  it("bounds according to the final snapped angle", () => {
    const patch = objectTransformPatch({ x: 100, z: 100 }, -43 * Math.PI / 180, 2, 4, 10, 10)!;
    expect(patch.rotation).toBe(45);
    expect(patch.x + 1 + 3 / Math.sqrt(2)).toBeCloseTo(10);
  });
});

it("preserves exact angles when only translating or resizing in SVG", () => {
  const patch = objectTransformPatch({ x: 0, z: 0 }, -13 * Math.PI / 180, 2, 4, 10, 10, false)!;
  expect(patch.rotation).toBeCloseTo(13);
});

it("keeps exact panel coordinates without imposing the drag grid", () => {
  const patch = boundedObjectGeometry({ x: 2.123, y: 3.456, width: 1, depth: 2, rotation: 13 }, 10, 10)!;
  expect(patch.x).toBeCloseTo(2.123); expect(patch.y).toBeCloseTo(3.456); expect(patch.rotation).toBeCloseTo(13);
});
it("repositions a rotated rectangle away from the edge in the central model", () => {
  const patch = boundedObjectGeometry({ x: 0, y: 0, width: 2, depth: 4, rotation: 45 }, 10, 10)!;
  expect(patch.x).toBeCloseTo(3 / Math.sqrt(2) - 1);
  expect(patch.y).toBeCloseTo(3 / Math.sqrt(2) - 2);
});
