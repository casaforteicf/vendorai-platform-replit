import { expect, it } from "vitest";
import { partitionOrthogonalWallSolids } from "./conceptWallSolidUnion";
const horizontal = { id: "a", x1: 0, y1: 0, x2: 4, y2: 0, thickness: 0.2, material: "stone" };
const vertical = { id: "b", x1: 2, y1: -2, x2: 2, y2: 2, thickness: 0.2, material: "paint" };
type Piece = ReturnType<typeof partitionOrthogonalWallSolids>[number];
const volume = (pieces: Piece[]) => pieces.reduce((sum, p) => sum + Math.hypot(p.wall.x2 - p.wall.x1, p.wall.y2 - p.wall.y1) * (p.wall.thickness ?? 0.15) * (p.zMax - p.zMin), 0);
function bounds(p: Piece) {
  const h = Math.abs(p.wall.y2 - p.wall.y1) < 1e-9, t = (p.wall.thickness ?? 0.15) / 2;
  return [Math.min(p.wall.x1, p.wall.x2) - (h ? 0 : t), Math.max(p.wall.x1, p.wall.x2) + (h ? 0 : t), Math.min(p.wall.y1, p.wall.y2) - (h ? t : 0), Math.max(p.wall.y1, p.wall.y2) + (h ? t : 0), p.zMin, p.zMax];
}
function expectDisjoint(pieces: Piece[]) {
  for (let i = 0; i < pieces.length; i++) for (let j = i + 1; j < pieces.length; j++) {
    const a = bounds(pieces[i]), b = bounds(pieces[j]);
    const overlap = [0, 2, 4].every(k => Math.min(a[k + 1], b[k + 1]) - Math.max(a[k], b[k]) > 1e-8);
    expect(overlap).toBe(false);
  }
}
it("resolve cruzamento sem duplicar volume", () => {
  const pieces = partitionOrthogonalWallSolids([horizontal, vertical], [], 2.8);
  expect(volume(pieces)).toBeCloseTo((0.8 + 0.8 - 0.04) * 2.8);
  expectDisjoint(pieces);
  expect(pieces.filter(p => p.wall.id === "b").every(p => p.wall.material === "paint")).toBe(true);
});
it("resolve encontros em T e L", () => {
  const t = partitionOrthogonalWallSolids([horizontal, { ...vertical, y1: 0 }], [], 2.8);
  expect(volume(t)).toBeCloseTo((0.8 + 0.4 - 0.02) * 2.8);
  expectDisjoint(t);
  const l = partitionOrthogonalWallSolids([horizontal, { ...vertical, x1: 4, x2: 4, y1: 0 }], [], 2.8);
  expect(volume(l)).toBeCloseTo((0.8 + 0.4 - 0.01) * 2.8);
  expectDisjoint(l);
});
it("remove parede duplicada sem alterar o modelo original", () => {
  expect(volume(partitionOrthogonalWallSolids([horizontal, { ...horizontal, id: "copy" }], [], 2.8))).toBeCloseTo(2.24);
  expect(horizontal).toMatchObject({ x1: 0, x2: 4, thickness: 0.2 });
});
it("preserva vãos e não preenche a área removida", () => {
  const opening = { roomId: "custom-wall:a", x: 1, y: 0, type: "door" as const, orientation: "horizontal" as const, width: 0.8, height: 2.1 };
  const pieces = partitionOrthogonalWallSolids([horizontal, vertical], [opening], 2.8);
  expect(volume(pieces)).toBeCloseTo((1.6 - 0.04) * 2.8 - 0.8 * 2.1 * 0.2);
  expectDisjoint(pieces);
});
it("preserva fragmentos finos em paredes de espessuras diferentes", () => {
  const pieces = partitionOrthogonalWallSolids([horizontal, { ...horizontal, id: "thicker", thickness: 0.25 }], [], 2.8);
  expect(volume(pieces)).toBeCloseTo(4 * 0.25 * 2.8);
  expectDisjoint(pieces);
  expect(pieces.some(p => (p.wall.thickness ?? 1) < 0.08)).toBe(true);
});
it("mantém diagonais no caminho existente", () => {
  const wall = { ...horizontal, x2: 3, y2: 4 };
  expect(partitionOrthogonalWallSolids([wall], [], 2.8)).toMatchObject([{ wall, zMin: 0, zMax: 2.8 }]);
});
