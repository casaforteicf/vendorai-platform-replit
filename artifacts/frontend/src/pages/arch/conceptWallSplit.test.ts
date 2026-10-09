import { expect, it } from "vitest";
import { splitWallWithOpenings } from "./conceptWallOperations";

it("preserva posição física, medidas e vínculo do produto ao dividir parede diagonal", () => {
  const wall = { id: "w", floor: 1, x1: 0, y1: 0, x2: 6, y2: 8, thickness: 0.25 };
  const openings = [0.2, 0.8].map((offset, i) => ({ id: String(i), wallId: "w", type: "window" as const, offset, width: 1, height: 1.37, catalogProductId: "product" }));
  const result = splitWallWithOpenings(wall, openings, "second")!;
  expect(result.walls).toEqual([{ ...wall, x2: 3, y2: 4 }, { ...wall, id: "second", x1: 3, y1: 4 }]);
  expect(result.openings[0]).toEqual({ ...openings[0], offset: 0.4 });
  expect(result.openings[1]).toMatchObject({ wallId: "second", offset: expect.closeTo(0.6), width: 1, height: 1.37, catalogProductId: "product" });
  expect(openings[1].wallId).toBe("w");
});
it("preserva aberturas de outras paredes e bloqueia divisão através do vão", () => {
  const wall = { id: "w", x1: 0, y1: 0, x2: 4, y2: 0 };
  const other = { wallId: "other", type: "door" as const, offset: 0.5 };
  expect(splitWallWithOpenings(wall, [other], "second")!.openings[0]).toBe(other);
  expect(splitWallWithOpenings(wall, [{ ...other, wallId: "w", width: 1 }], "second")).toBeNull();
});
it("aceita divisão tangente ao vão e rejeita trechos curtos", () => {
  const wall = { id: "w", x1: 0, y1: 0, x2: 4, y2: 0 };
  const opening = { wallId: "w", type: "door" as const, offset: 0.375, width: 1 };
  expect(splitWallWithOpenings(wall, [opening], "second")).not.toBeNull();
  expect(splitWallWithOpenings({ ...wall, x2: 0.9 }, [], "second")).toBeNull();
});
