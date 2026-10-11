import { expect, it } from "vitest";
import { emptyArchitecturalModel } from "./conceptArchitecturalModel";
import { moveArchitecturalElement, resizeArchitecturalElement } from "./conceptArchitecturalMovement";
it("translates slab holes while preserving dimensions and the original snapshot", () => {
  const m = emptyArchitecturalModel();
  m.slabs.push({ id: "s", floor: 1, x: 1, y: 1, width: 3, depth: 3, elevation: 3.12, thickness: 0.15, voids: [{ x: 2, y: 2, width: 1, depth: 1 }] });
  const moved = moveArchitecturalElement(m, "s", 1, 2, 12, 20);
  if (!("value" in moved)) throw Error(moved.error);
  expect(moved.value.slabs[0]).toMatchObject({ x: 2, y: 3, floor: 1, elevation: 3.12, voids: [{ x: 3, y: 4, width: 1, depth: 1 }] });
  expect(m.slabs[0].voids[0].x).toBe(2);
  expect(moveArchitecturalElement(m, "s", -2, 0, 12, 20)).toHaveProperty("error");
});
it("rejects non-finite offsets and missing elements without a partial update", () => {
  const m = emptyArchitecturalModel();
  expect(moveArchitecturalElement(m, "missing", 0, 0, 12, 20)).toHaveProperty("error");
  expect(moveArchitecturalElement(m, "missing", NaN, 0, 12, 20)).toHaveProperty("error");
  expect(m).toEqual(emptyArchitecturalModel());
});
it("moves stairs and roofs using their own footprints", () => {
  const m = emptyArchitecturalModel();
  m.stairs.push({ id: "st", floor: 0, x: 0, y: 0, width: 1, run: 4.2, rise: 2.8 });
  m.roofs.push({ id: "r", x: 0, y: 0, width: 3, depth: 3, elevation: 3, pitchDegrees: 30, overhang: 0.3, type: "gable" });
  expect(moveArchitecturalElement(m, "st", 1, 1, 12, 5)).toHaveProperty("error");
  const roof = moveArchitecturalElement(m, "r", 1, 1, 12, 20);
  expect(roof).toHaveProperty("value");
  if ("value" in roof) expect(roof.value.roofs[0]).toMatchObject({ x: 1, y: 1, overhang: 0.3 });
});

it("resizes slabs without scaling holes and rejects truncation and lot overflow", () => {
  const m = emptyArchitecturalModel();
  m.slabs.push({ id: "s", floor: 1, x: 1, y: 1, width: 3, depth: 3, elevation: 3.12, thickness: 0.15, voids: [{ x: 2, y: 2, width: 1, depth: 1 }] });
  const resized = resizeArchitecturalElement(m, "s", 4, 5, 12, 20);
  if (!("value" in resized)) throw Error(resized.error);
  expect(resized.value.slabs[0]).toMatchObject({ width: 4, depth: 5, thickness: 0.15, voids: m.slabs[0].voids });
  expect(m.slabs[0].width).toBe(3);
  for (const [w, d] of [[1, 3], [12, 3], [NaN, 3], [3, 0]]) expect(resizeArchitecturalElement(m, "s", w, d, 12, 20)).toHaveProperty("error");
});
it("validates stair proportions and preserves roof parameters during resize", () => {
  const m = emptyArchitecturalModel();
  m.stairs.push({ id: "st", floor: 0, x: 0, y: 0, width: 1, run: 4.2, rise: 2.8 });
  m.roofs.push({ id: "r", x: 0, y: 0, width: 3, depth: 3, elevation: 3, pitchDegrees: 30, overhang: 0.3, type: "gable" });
  expect(resizeArchitecturalElement(m, "st", 1, 1, 12, 20)).toHaveProperty("error");
  const roof = resizeArchitecturalElement(m, "r", 5, 4, 12, 20);
  if (!("value" in roof)) throw Error(roof.error);
  expect(roof.value.roofs[0]).toMatchObject({ width: 5, depth: 4, pitchDegrees: 30, overhang: 0.3, elevation: 3 });
});
