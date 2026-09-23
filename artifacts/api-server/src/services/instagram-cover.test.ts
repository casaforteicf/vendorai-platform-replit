import { describe, expect, it } from "vitest";
import {
  computeInstagramCoverCropRegion,
  normalizeInstagramCoverCrop,
} from "./instagram-cover.js";

describe("instagram cover crop", () => {
  it("creates a centered 3:4 crop from landscape images", () => {
    const region = computeInstagramCoverCropRegion(1600, 900, { zoom: 1, x: 0, y: 0 });
    expect(region.width / region.height).toBeCloseTo(3 / 4, 2);
    expect(region.left).toBeGreaterThan(0);
    expect(region.top).toBe(0);
  });

  it("moves crop to the edges with normalized x/y coordinates", () => {
    const left = computeInstagramCoverCropRegion(1600, 900, { zoom: 1.5, x: -1, y: -1 });
    const right = computeInstagramCoverCropRegion(1600, 900, { zoom: 1.5, x: 1, y: 1 });
    expect(left.left).toBe(0);
    expect(left.top).toBe(0);
    expect(right.left + right.width).toBe(1600);
    expect(right.top + right.height).toBe(900);
  });

  it("clamps invalid editor values", () => {
    expect(normalizeInstagramCoverCrop({ zoom: 10, x: -5, y: 8 })).toEqual({
      zoom: 3,
      x: -1,
      y: 1,
    });
  });
});
