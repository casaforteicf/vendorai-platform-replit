import { describe, expect, it } from "vitest";
import {
  buildOrthogonalWallTopology,
  detectClosedSpaces,
  orthogonalEnd,
  snapPointToWallNetwork,
} from "./conceptWallNetwork";

describe("conceptWallNetwork stability", () => {
  it("forces drafted wall endpoints to the dominant orthogonal axis", () => {
    expect(orthogonalEnd({ x: 0, y: 0 }, { x: 5, y: 1 })).toEqual({ x: 5, y: 0 });
    expect(orthogonalEnd({ x: 0, y: 0 }, { x: 1, y: 5 })).toEqual({ x: 0, y: 5 });
  });

  it("snaps to an existing wall endpoint before a segment projection", () => {
    const walls = [{ id: "w1", x1: 0, y1: 0, x2: 5, y2: 0 }];
    const snapped = snapPointToWallNetwork({ x: 0.1, y: 0.1 }, walls, 0.35);

    expect(snapped).toEqual({ x: 0, y: 0 });
  });

  it("splits orthogonal walls at intersections", () => {
    const topology = buildOrthogonalWallTopology([
      { id: "h", x1: 0, y1: 2, x2: 4, y2: 2 },
      { id: "v", x1: 2, y1: 0, x2: 2, y2: 4 },
    ]);

    expect(topology.nodes.some((node) => node.x === 2 && node.y === 2)).toBe(true);
    expect(topology.segments).toHaveLength(4);
  });

  it("detects a closed rectangular space", () => {
    const spaces = detectClosedSpaces([
      { id: "top", x1: 1, y1: 1, x2: 5, y2: 1 },
      { id: "right", x1: 5, y1: 1, x2: 5, y2: 4 },
      { id: "bottom", x1: 5, y1: 4, x2: 1, y2: 4 },
      { id: "left", x1: 1, y1: 4, x2: 1, y2: 1 },
    ], 10, 10);

    expect(spaces.length).toBeGreaterThanOrEqual(1);
    expect(spaces.some((space) => Math.abs(space.area - 12) < 0.01)).toBe(true);
  });
});
