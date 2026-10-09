import { expect, it } from "vitest";
import { freeOpeningOffset, openingsOverlap, openingFitsWall } from "./conceptOpeningPlacement";
it("verifica largura real do produto sem reduzir para fazê-lo caber", () => {
  expect(openingFitsWall({ type: "window", width: 3, offset: 0.5 }, 2)).toBe(false);
  expect(openingFitsWall({ type: "door", width: 1, offset: 0.25 }, 2)).toBe(true);
  expect(openingFitsWall({ type: "door", width: 1, offset: 0.1 }, 2)).toBe(false);
});
it("rejeita posição e largura não finitas", () => {
  expect(openingFitsWall({ type: "door", offset: NaN }, 4)).toBe(false);
  expect(openingFitsWall({ type: "door", offset: 0.5, width: Infinity }, 4)).toBe(false);
});
it("insere no centro quando livre e busca outro intervalo quando ocupado", () => {
  const door = { type: "door" as const, width: 0.9, offset: 0.5 };
  expect(freeOpeningOffset(door, [], 4)).toBe(0.5);
  const offset = freeOpeningOffset(door, [door], 4)!;
  expect(offset).not.toBe(0.5);
  expect(openingsOverlap({ ...door, offset }, door, 4)).toBe(false);
});
it("rejeita duplicação em parede cheia", () => {
  const door = { type: "door" as const, width: 0.9, offset: 0.5 };
  expect(freeOpeningOffset(door, [door], 1)).toBeNull();
});
it("permite aberturas separadas verticalmente e bordas coincidentes", () => {
  const door = { type: "door" as const, width: 0.9, height: 2.1, offset: 0.5 };
  const window = { type: "window" as const, width: 0.9, height: 0.5, sillHeight: 2.1, offset: 0.5 };
  expect(openingsOverlap(door, window, 4)).toBe(false);
  expect(openingsOverlap(door, { ...door, offset: 0.725 }, 4)).toBe(false);
});
