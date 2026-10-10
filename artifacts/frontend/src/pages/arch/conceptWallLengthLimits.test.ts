import { expect, it } from "vitest";
import { wallLengthLimit } from "./conceptWallLengthLimits";
it("limita paredes horizontais e verticais desde o início", () => {
  expect(wallLengthLimit({ x1: 2, y1: 3, x2: 4, y2: 3 }, 12, 10)).toBe(10);
  expect(wallLengthLimit({ x1: 2, y1: 3, x2: 1, y2: 3 }, 12, 10)).toBe(2);
  expect(wallLengthLimit({ x1: 2, y1: 3, x2: 2, y2: 4 }, 12, 10)).toBe(7);
});
it("usa o primeiro limite atingido em uma diagonal", () => {
  expect(wallLengthLimit({ x1: 2, y1: 3, x2: 3, y2: 4 }, 12, 10)).toBeCloseTo(7 * Math.sqrt(2));
});
it("rejeita geometria não finita e terreno inválido", () => {
  expect(wallLengthLimit({ x1: NaN, y1: 2, x2: 3, y2: 4 }, 12, 10)).toBe(0);
  expect(wallLengthLimit({ x1: 2, y1: 2, x2: 3, y2: 4 }, Infinity, 10)).toBe(0);
  expect(wallLengthLimit({ x1: 2, y1: 2, x2: 3, y2: 4 }, -1, 10)).toBe(0);
});
it("rejeita uma parede sem direção", () => {
  expect(wallLengthLimit({ x1: 2, y1: 3, x2: 2, y2: 3 }, 12, 10)).toBe(0);
});
