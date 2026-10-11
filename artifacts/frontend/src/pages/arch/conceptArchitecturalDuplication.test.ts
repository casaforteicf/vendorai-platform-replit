import { expect, it } from "vitest";
import { emptyArchitecturalModel } from "./conceptArchitecturalModel";
import { duplicateArchitecturalElement } from "./conceptArchitecturalDuplication";
function fixture() {
  const model = emptyArchitecturalModel();
  model.slabs.push({ id: "s", floor: 1, x: 1, y: 1, width: 3, depth: 3, elevation: 3.12, thickness: 0.2, voids: [{ x: 2, y: 2, width: 1, depth: 1 }] });
  return model;
}
it("copies a slab and translates independent manual holes without modifying the source", () => {
  const model = fixture(); const snapshot = JSON.stringify(model);
  const result = duplicateArchitecturalElement(model, "s", 4, 2, 12, 20);
  if (!("value" in result)) throw Error(result.error);
  expect(result.id).toBe("s-copia-1");
  expect(result.value.slabs[1]).toMatchObject({ id: result.id, x: 5, y: 3, floor: 1, elevation: 3.12, thickness: 0.2, voids: [{ x: 6, y: 4, width: 1, depth: 1 }] });
  result.value.slabs[1].voids[0].x = 8;
  expect(JSON.stringify(model)).toBe(snapshot);
  expect(result.value.slabs[0].voids[0].x).toBe(2);
});
it("avoids identifier collisions across types and repeated copies", () => {
  const model = fixture();
  model.roofs.push({ id: "s-copia-1", x: 0, y: 0, width: 3, depth: 3, elevation: 3, pitchDegrees: 30, overhang: 0.3, type: "gable" });
  const first = duplicateArchitecturalElement(model, "s", 1, 0, 12, 20);
  if (!("value" in first)) throw Error(first.error);
  expect(first.id).toBe("s-copia-2");
  const second = duplicateArchitecturalElement(first.value, "s", 2, 0, 12, 20);
  expect(second).toHaveProperty("id", "s-copia-3");
});
it("preserves stair opening behavior and roof parameters", () => {
  const model = emptyArchitecturalModel();
  model.stairs.push({ id: "st", floor: 0, x: 0, y: 0, width: 1, run: 4.2, rise: 2.8, preferredRiser: 0.175, openSlab: false });
  model.roofs.push({ id: "r", x: 0, y: 0, width: 3, depth: 3, elevation: 3, pitchDegrees: 30, overhang: 0.3, type: "gable" });
  const stair = duplicateArchitecturalElement(model, "st", 2, 0, 12, 20);
  const roof = duplicateArchitecturalElement(model, "r", 0, 4, 12, 20);
  if (!("value" in stair) || !("value" in roof)) throw Error("Invalid copy");
  expect(stair.value.stairs[1]).toMatchObject({ floor: 0, rise: 2.8, run: 4.2, preferredRiser: 0.175, openSlab: false });
  expect(roof.value.roofs[1]).toMatchObject({ elevation: 3, pitchDegrees: 30, overhang: 0.3, type: "gable" });
});
it("rejects missing elements, coincident copies, invalid offsets and lot overflow atomically", () => {
  const model = fixture(); const snapshot = JSON.stringify(model);
  for (const [dx, dy] of [[0, 0], [NaN, 1], [-2, 0], [10, 0]]) expect(duplicateArchitecturalElement(model, "s", dx, dy, 12, 20)).toHaveProperty("error");
  expect(duplicateArchitecturalElement(model, "missing", 1, 1, 12, 20)).toHaveProperty("error");
  expect(JSON.stringify(model)).toBe(snapshot);
});
