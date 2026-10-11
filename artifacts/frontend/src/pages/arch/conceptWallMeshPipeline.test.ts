import { describe, expect, it } from "vitest";
import { buildWallMeshPipeline } from "./conceptWallMeshPipeline";

const wall = {
  id: "w1", floor: 0, x1: 0, y1: 0, x2: 4, y2: 0,
  thickness: 0.15, height: 2.8,
};

describe("buildWallMeshPipeline", () => {
  it("triangulates an unobstructed wall without warnings", () => {
    const result = buildWallMeshPipeline([wall], []);
    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
    expect(result.meshes).toHaveLength(1);
    expect(result.meshes[0].positions).toHaveLength(24);
    expect(result.meshes[0].indices).toHaveLength(36);
    expect(result.meshes[0].wallId).toBe("w1");
  });

  it("preserves a real doorway void across mesh preparation", () => {
    const result = buildWallMeshPipeline(
      [wall], [{ id: "d1", wallId: "w1", floor: 0, offset: 0.5, width: 1, height: 2.1 }],
    );
    expect(result.valid).toBe(true);
    expect(result.meshes.length).toBeGreaterThan(1);
    expect(result.boxes.some((box) =>
      box.x < 2.5 && box.x + box.width > 1.5 &&
      box.z < 2.1 && box.z + box.height > 0
    )).toBe(false);
  });

  it("exposes orphan opening diagnostics and marks the output incomplete", () => {
    const result = buildWallMeshPipeline(
      [wall], [{ id: "orphan", wallId: "missing", floor: 0, offset: 0.5, width: 1, height: 2 }],
    );
    expect(result.valid).toBe(false);
    expect(result.warnings).toContain("OPENING_ORPHAN:orphan");
  });

  it("does not mutate supplied wall or opening objects", () => {
    const walls = [Object.freeze({ ...wall })];
    const openings = [Object.freeze({ id: "d1", wallId: "w1", floor: 0, offset: 0.5, width: 1, height: 2 })];
    expect(() => buildWallMeshPipeline(walls, openings)).not.toThrow();
  });
});
