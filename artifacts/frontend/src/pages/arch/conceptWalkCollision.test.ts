import { describe, expect, it } from "vitest";
import { canWalkTo, moveWalkPosition, walkStep, walkWall } from "./conceptWalkCollision";
const wall = { id: "w", x1: 0, y1: 0, x2: 4, y2: 0, thickness: 0.15 };
const door = { type: "door" as const, orientation: "horizontal" as const, x: 2, y: 0, width: 0.9, height: 2.1 };
describe("walk collision matches physical door voids", () => {
  it("allows passage at the center but keeps visitor clear of jambs", () => {
    const w = walkWall(wall, [door]);
    expect(canWalkTo(2, 0, [w])).toBe(true);
    expect(canWalkTo(2.3, 0, [w])).toBe(false);
    expect(canWalkTo(1, 0, [w])).toBe(false);
  });
  it("does not enlarge narrow or low doors", () => {
    expect(canWalkTo(2, 0, [walkWall(wall, [{ ...door, width: 0.4 }])])).toBe(false);
    expect(canWalkTo(2, 0, [walkWall(wall, [{ ...door, height: 1.5 }])])).toBe(false);
  });
  it("does not create passage for windows, nearby doors or perpendicular markers", () => {
    for (const opening of [{ ...door, type: "window" as const }, { ...door, y: 0.15 }, { ...door, orientation: "vertical" as const }])
      expect(canWalkTo(2, 0, [walkWall(wall, [opening])])).toBe(false);
  });
  it("uses linked diagonal doors only in their own wall", () => {
    const diagonal = { ...wall, x2: 4, y2: 4 };
    const opening = { ...door, y: 2, roomId: "custom-wall:w" };
    expect(canWalkTo(2, 2, [walkWall(diagonal, [opening])])).toBe(true);
    expect(canWalkTo(2, 2, [walkWall({ ...diagonal, id: "other" }, [opening])])).toBe(false);
  });
  it("merges overlapping door voids and checks every crossing wall", () => {
    const w = walkWall(wall, [door, { ...door, x: 2.4 }]);
    expect(canWalkTo(2.2, 0, [w])).toBe(true);
    expect(canWalkTo(2.2, 0, [w, walkWall({ ...wall, id: "cross", x1: 2.2, x2: 2.2, y1: -2, y2: 2 }, [door])])).toBe(false);
  });
});

describe("walk movement", () => {
  it("rejects non-finite positions and invalid visitor radii", () => {
    expect(canWalkTo(NaN, 0, [])).toBe(false);
    expect(canWalkTo(Infinity, 0, [])).toBe(false);
    expect(canWalkTo(0, -Infinity, [])).toBe(false);
    expect(canWalkTo(0, 0, [], 0)).toBe(false);
    expect(canWalkTo(0, 0, [], NaN)).toBe(false);
    expect(canWalkTo(0, 0, [])).toBe(true);
  });
  it("does not jump across a thin wall in a long movement", () => {
    const end = moveWalkPosition({ x: 1, y: -1 }, { x: 1, y: 1 }, [walkWall(wall, [])]);
    expect(end.y).toBeLessThan(-0.3);
  });
  it("crosses a sufficiently large doorway", () => {
    const end = moveWalkPosition({ x: 2, y: -1 }, { x: 2, y: 1 }, [walkWall(wall, [door])]);
    expect(end.y).toBeCloseTo(1);
  });
  it("slides along a wall instead of stopping both directions", () => {
    const end = moveWalkPosition({ x: 1, y: -0.4 }, { x: 2, y: 0.4 }, [walkWall(wall, [])]);
    expect(end.x).toBeCloseTo(2);
    expect(end.y).toBeLessThan(-0.3);
  });
  it("ignores invalid movement coordinates", () => {
    expect(moveWalkPosition({ x: 1, y: 1 }, { x: NaN, y: 2 }, [])).toEqual({ x: 1, y: 1 });
  });
});

describe("walk speed", () => {
  it("travels the same distance at 30 and 60 fps", () => {
    const slow = walkStep(0, 1, 0, 0.12, 1000 / 30);
    const fast = walkStep(0, 1, 0, 0.12, 1000 / 60);
    expect(slow.y).toBeCloseTo(fast.y * 2);
  });
  it("keeps diagonal movement at the configured speed", () => {
    const straight = walkStep(0, 1, 0, 0.12, 1000 / 60);
    const diagonal = walkStep(0, 1, 1, 0.12, 1000 / 60);
    expect(Math.hypot(diagonal.x, diagonal.y)).toBeCloseTo(Math.hypot(straight.x, straight.y));
  });
  it("limits the first movement after a long pause", () => {
    expect(walkStep(0, 1, 0, 0.12, 5000)).toEqual(walkStep(0, 1, 0, 0.12, 100));
    expect(walkStep(0, 1, 0, 0.12, -10)).toEqual({ x: 0, y: -0 });
  });
});
