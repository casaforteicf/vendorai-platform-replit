import { expect, it } from "vitest";
import { duplicateWallPlacement, openingCrossesWallMidpoint } from "./conceptWallOperations";
it("duplica uma diagonal preservando comprimento e direção", () => {
  const wall = { x1: 1, y1: 1, x2: 4, y2: 5 };
  const copy = duplicateWallPlacement(wall, 12, 10)!;
  expect(copy.x2 - copy.x1).toBeCloseTo(3);
  expect(copy.y2 - copy.y1).toBeCloseTo(4);
});
it("tenta o lado oposto junto ao limite sem cortar a parede", () => {
  expect(duplicateWallPlacement({ x1: 1, y1: 10, x2: 4, y2: 10 }, 12, 10)).toEqual({ x1: 1, y1: 9.75, x2: 4, y2: 9.75 });
});
it("não duplica quando nenhum deslocamento completo cabe", () => {
  expect(duplicateWallPlacement({ x1: 0, y1: 0, x2: 12, y2: 10 }, 12, 10)).toBeNull();
});
it("bloqueia divisão através de abertura e permite borda coincidente", () => {
  expect(openingCrossesWallMidpoint(4, [{ offset: 0.5, width: 1, type: "door" }])).toBe(true);
  expect(openingCrossesWallMidpoint(4, [{ offset: 0.375, width: 1, type: "door" }])).toBe(false);
});
