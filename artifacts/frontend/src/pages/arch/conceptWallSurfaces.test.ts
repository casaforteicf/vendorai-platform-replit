import { expect, it } from "vitest";
import { exposedWallFaces } from "./conceptWallSurfaces";
import { partitionOrthogonalWallSolids } from "./conceptWallSolidUnion";
const wall = { id: "a", x1: 0, y1: 0, x2: 4, y2: 0, thickness: 0.2 };
const surfaceArea = (faces: ReturnType<typeof exposedWallFaces>) => [...faces.values()].flat().reduce((sum, f) => sum + (f.u1 - f.u0) * (f.v1 - f.v0), 0);
it("mantém as seis faces externas de uma parede isolada", () => {
  const pieces = partitionOrthogonalWallSolids([wall], [], 2.8);
  const faces = exposedWallFaces(pieces);
  expect(faces.get(pieces[0])).toHaveLength(6);
  expect(surfaceArea(faces)).toBeCloseTo(25.12);
});
it("remove faces internas de dois trechos adjacentes", () => {
  const pieces = partitionOrthogonalWallSolids([{ ...wall, x2: 2 }, { ...wall, id: "b", x1: 2 }], [], 2.8);
  const faces = exposedWallFaces(pieces);
  expect(surfaceArea(faces)).toBeCloseTo(25.12);
  expect([...faces.values()].flat().filter(f => f.axis === 0 && f.plane === 2)).toHaveLength(0);
});
it("mantém apenas a superfície da união no cruzamento", () => {
  const pieces = partitionOrthogonalWallSolids([wall, { ...wall, id: "b", x1: 2, x2: 2, y1: -2, y2: 2 }], [], 2.8);
  expect(surfaceArea(exposedWallFaces(pieces))).toBeCloseTo(47.92);
});
it("preserva as superfícies de revelo de uma porta", () => {
  const opening = { roomId: "custom-wall:a", x: 1, y: 0, type: "door" as const, orientation: "horizontal" as const, width: 0.8, height: 2.1 };
  expect(surfaceArea(exposedWallFaces(partitionOrthogonalWallSolids([wall], [opening], 2.8)))).toBeCloseTo(22.6);
});
it("não muda o caminho de paredes diagonais", () => {
  const pieces = partitionOrthogonalWallSolids([{ ...wall, x2: 3, y2: 4 }], [], 2.8);
  expect(exposedWallFaces(pieces).size).toBe(0);
});
