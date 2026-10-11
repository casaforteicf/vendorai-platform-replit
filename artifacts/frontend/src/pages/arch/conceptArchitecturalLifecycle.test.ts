import { expect, it } from "vitest";
import { applyArchitecturalEdits, architecturalQuantities, cloneArchitecturalModel, emptyArchitecturalModel, readArchitecturalModel, type ArchitecturalModel } from "./conceptArchitecturalModel";
import { duplicateArchitecturalElement } from "./conceptArchitecturalDuplication";
import { moveArchitecturalElement, resizeArchitecturalElement } from "./conceptArchitecturalMovement";
import { architecturalPlanPrimitives, architecturalSolidPrimitives } from "./conceptArchitecturalViews";
function value(result: { value: ArchitecturalModel } | { error: string }) {
  if ("error" in result) throw Error(result.error);
  return result.value;
}
it("preserves edited and duplicated geometry through JSON persistence and renderer adapters", () => {
  let model = value(applyArchitecturalEdits(emptyArchitecturalModel(), [
    { action: "upsert", element: { kind: "slab", value: { id: "s", floor: 1, x: 0, y: 0, width: 4, depth: 4, thickness: 0.2, elevation: 3.12, voids: [{ x: 1, y: 1, width: 1, depth: 1 }] } } },
    { action: "upsert", element: { kind: "stair", value: { id: "st", floor: 0, x: 2, y: 0, width: 1, run: 4.2, rise: 2.8, openSlab: true } } },
    { action: "upsert", element: { kind: "roof", value: { id: "r", x: 0, y: 0, width: 4, depth: 4, elevation: 6, pitchDegrees: 25, overhang: 0.3, type: "gable" } } },
  ]));
  model = value(moveArchitecturalElement(model, "s", 0.5, 0.5, 20, 20));
  model = value(resizeArchitecturalElement(model, "s", 5, 5, 20, 20));
  const beforeCopy = cloneArchitecturalModel(model);
  model = value(duplicateArchitecturalElement(model, "s", 6, 0, 20, 20));
  const restored = value(readArchitecturalModel(JSON.parse(JSON.stringify({ configuration: { architecturalModel: model } })).configuration.architecturalModel));
  expect(restored).toEqual(model);
  expect(architecturalQuantities(restored)).toEqual(architecturalQuantities(model));
  expect(architecturalPlanPrimitives(restored)).toEqual(architecturalPlanPrimitives(model));
  expect(architecturalSolidPrimitives(restored)).toEqual(architecturalSolidPrimitives(model));
  const removed = value(applyArchitecturalEdits(restored, [{ action: "remove", kind: "slab", id: "s-copia-1" }]));
  expect(removed).toEqual(beforeCopy);
  removed.slabs[0].voids[0].x = 3;
  expect(restored.slabs[0].voids[0].x).toBe(1.5);
});
it("rejects identifier collisions before a snapshot becomes impossible to reopen", () => {
  const model = value(applyArchitecturalEdits(emptyArchitecturalModel(), [{ action: "upsert", element: { kind: "roof", value: { id: "same", x: 0, y: 0, width: 3, depth: 3, elevation: 3, pitchDegrees: 0, overhang: 0, type: "flat" } } }]));
  const result = applyArchitecturalEdits(model, [{ action: "upsert", element: { kind: "slab", value: { id: "same", floor: 0, x: 0, y: 0, width: 3, depth: 3, thickness: 0.15, elevation: 3, voids: [] } } }]);
  expect(result).toHaveProperty("error");
  expect(value(readArchitecturalModel(JSON.parse(JSON.stringify(model))))).toEqual(model);
});
it("rejects invalid floors on write as well as on restore", () => {
  for (const floor of [-1, 0.5, NaN]) {
    const result = applyArchitecturalEdits(emptyArchitecturalModel(), [{ action: "upsert", element: { kind: "slab", value: { id: "s", floor, x: 0, y: 0, width: 3, depth: 3, thickness: 0.15, elevation: 3, voids: [] } } }]);
    expect(result).toHaveProperty("error");
  }
});
