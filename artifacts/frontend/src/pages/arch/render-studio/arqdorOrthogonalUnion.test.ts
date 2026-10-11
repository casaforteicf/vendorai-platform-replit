import { describe, expect, it } from "vitest";
import { unionOrthogonalWalls } from "./arqdorOrthogonalUnion";
import type { ParametricWall } from "./RenderStudioParametricWebgl";

function wall(start: [number, number], end: [number, number],
              openings: ParametricWall["openings"] = []): ParametricWall {
  return { id: `w-${start.join("-")}-${end.join("-")}`, start, end,
    thickness: 0.2, height: 3, openings };
}

function requireClosed(walls: ParametricWall[], faces: number) {
  const union = unionOrthogonalWalls(walls);
  expect(union.faces).toHaveLength(faces);
  expect(union.topology).toEqual({
    boundaryEdges: 0, nonmanifoldEdges: 0, orientationErrors: 0,
    connectedSolidComponents: 1, connectedBoundaryComponents: 1, signedVolumeMatchesOccupancy: true,
    closedByEdgeIncidence: true,
  });
}

describe("Arqdor orthogonal wall volume union", () => {
  const base = wall([0, 0], [4, 0]);
  const door = { id: "door", kind: "door" as const,
    offset: 0.5, width: 1, sill: 0, height: 2.1 };
  const window = { id: "window", kind: "window" as const,
    offset: 2, width: 1, sill: 1, height: 1 };

  it("closes a single wall and corner, tee and cross joins", () => {
    requireClosed([base], 6);
    requireClosed([base, wall([4, 0], [4, 3])], 26);
    requireClosed([base, wall([2, 0], [2, 3])], 26);
    requireClosed([base, wall([2, -2], [2, 2])], 22);
  });

  it("reports net material volume and external surface from the joined solid", () => {
    const single = unionOrthogonalWalls([base]);
    expect(single.netVolumeM3).toBeCloseTo(2.4, 6);
    expect(single.exposedSurfaceM2).toBeCloseTo(2 * (4 * .2 + 4 * 3 + .2 * 3), 6);
    const opened = unionOrthogonalWalls([wall([0, 0], [4, 0], [door])]);
    expect(opened.netVolumeM3).toBeCloseTo(2.4 - .2 * 1 * 2.1, 6);
    expect(opened.exposedSurfaceM2).toBeGreaterThan(0);
    const joined = unionOrthogonalWalls([base, wall([2, 0], [2, 3])]);
    expect(joined.netVolumeM3).toBeLessThan(2.4 + 1.8);
    expect(joined.topology.signedVolumeMatchesOccupancy).toBe(true);
  });

  it("cuts a true door and window opening", () => {
    requireClosed([wall([0, 0], [4, 0], [door])], 22);
    requireClosed([wall([0, 0], [4, 0], [window])], 32);
    const both = unionOrthogonalWalls([wall([0, 0], [4, 0], [door, window])]);
    expect(both.openingCount).toBe(2);
    expect(both.faces).toHaveLength(60);
    expect(both.topology.closedByEdgeIncidence).toBe(true);
  });

  it("does not represent disconnected walls as one solid", () => {
    const result = unionOrthogonalWalls([base, wall([6, 0], [8, 0])]);
    expect(result.topology.connectedSolidComponents).toBe(2);
    expect(result.topology.connectedBoundaryComponents).toBe(2);
    expect(result.topology.closedByEdgeIncidence).toBe(false);
  });

  it("rejects overlapping doors and windows just as the Python geometry contract does", () => {
    expect(() => unionOrthogonalWalls([
      wall([0, 0], [4, 0], [
        { ...door, offset: 0.5, width: 1.5 },
        { ...window, offset: 1.2, sill: 1, height: 1 },
      ]),
    ])).toThrow(/Aberturas sobrepostas/);
    // Adjacent opening edges are not overlapping volumes.
    expect(unionOrthogonalWalls([
      wall([0, 0], [4, 0], [
        { ...door, offset: 0.5, width: 1.5 },
        { ...window, offset: 2.0 },
      ]),
    ]).openingCount).toBe(2);
  });

  it("rejects malformed coordinates and openings before generating geometry", () => {
    expect(() => unionOrthogonalWalls([
      { ...wall([0, 0], [4, 0]), start: [Number.NaN, 0] },
    ])).toThrow(/Coordenadas/);
    expect(() => unionOrthogonalWalls([
      { ...wall([0, 0], [4, 0]), end: [Infinity, 0] },
    ])).toThrow(/Coordenadas/);
    expect(() => unionOrthogonalWalls([
      { ...wall([0, 0], [4, 0]), openings: null },
    ] as unknown as ParametricWall[])).toThrow(/Aberturas inválidas/);
    expect(() => unionOrthogonalWalls([
      wall([0, 0], [4, 0], [{ ...window, width: Number.NaN }]),
    ])).toThrow(/Vão inválido/);
  });

  it("rejects diagonal geometry and invalid aperture positions", () => {
    expect(() => unionOrthogonalWalls([wall([0, 0], [4, 2])]))
      .toThrow(/diagonal/);
    expect(() => unionOrthogonalWalls([
      wall([0, 0], [4, 0], [{ ...window, offset: 3.5 }]),
    ])).toThrow(/Vão inválido/);
  });
});
