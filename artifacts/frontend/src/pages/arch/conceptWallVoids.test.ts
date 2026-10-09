import { expect, it } from "vitest";
import { splitWallVoids, alignOpeningSegment } from "./conceptWallVoids";
const wall = { id: "w", x1: 0, y1: 0, x2: 6, y2: 8, thickness: 0.25 };
const door = { x: 3, y: 4, roomId: "custom-wall:w", orientation: "vertical" as const, type: "door" as const, width: 1, height: 2.1 };
const area = (pieces: ReturnType<typeof splitWallVoids>) => pieces.reduce((sum, p) => sum + Math.hypot(p.wall.x2 - p.wall.x1, p.wall.y2 - p.wall.y1) * (p.zMax - p.zMin), 0);
it("recorta vão em diagonal preservando espessura e área", () => {
  const pieces = splitWallVoids(wall, [door], 2.8);
  expect(area(pieces)).toBeCloseTo(28 - 2.1);
  expect(pieces.every(p => p.wall.thickness === 0.25)).toBe(true);
  expect(pieces.every(p => Math.abs(p.wall.y1 * 6 - p.wall.x1 * 8) < 1e-8)).toBe(true);
});
it("recorta porta e janela acima sem preencher os vãos", () => {
  const upper = { ...door, type: "window" as const, sillHeight: 2.3, height: 0.3 };
  const pieces = splitWallVoids(wall, [door, upper], 2.8);
  expect(area(pieces)).toBeCloseTo(28 - 2.4);
  const center = pieces.filter(p => Math.hypot(p.wall.x2 - p.wall.x1, p.wall.y2 - p.wall.y1) < 1.01);
  expect(center).toHaveLength(2);
  expect(center[0]).toMatchObject({ zMin: 2.1, zMax: 2.3 });
  expect(center[1].zMin).toBeCloseTo(2.6);
  expect(center[1].zMax).toBe(2.8);
});
it("recorta a união de vãos sobrepostos sem duplicar sólidos", () => {
  expect(area(splitWallVoids(wall, [door, { ...door, height: 2.5 }], 2.8))).toBeCloseTo(28 - 2.5);
});
it("não abre uma parede paralela usando abertura vinculada a outra", () => {
  expect(area(splitWallVoids({ ...wall, id: "other" }, [door], 2.8))).toBeCloseTo(28);
});
it("preserva área do recorte em parede de sentido inverso", () => {
  expect(area(splitWallVoids({ ...wall, x1: 6, y1: 8, x2: 0, y2: 0 }, [door], 2.8))).toBeCloseTo(25.9);
});
it("orienta esquadria pela direção da parede mantendo largura", () => {
  const segment = alignOpeningSegment({ x1: 3, y1: 3.5, x2: 3, y2: 4.5 }, door, wall);
  expect(segment.x1).toBeCloseTo(2.7);
  expect(segment.y1).toBeCloseTo(3.6);
  expect(Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1)).toBeCloseTo(1);
});
