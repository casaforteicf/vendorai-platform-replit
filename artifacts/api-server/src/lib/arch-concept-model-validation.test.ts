import { expect, it } from "vitest";
import { architecturalModelError } from "./arch-concept-model-validation";
import { readArchitecturalModel, emptyArchitecturalModel } from "../../../frontend/src/pages/arch/conceptArchitecturalModel";
const valid = { ...emptyArchitecturalModel(), slabs: [{ id: "s", floor: 1, x: 0, y: 0, width: 4, depth: 4, thickness: 0.15, elevation: 3.12, voids: [{ x: 1, y: 1, width: 1, depth: 1 }] }], stairs: [{ id: "st", floor: 0, x: 0, y: 0, width: 1, run: 4.2, rise: 2.8, openSlab: true }], roofs: [{ id: "r", x: 0, y: 0, width: 4, depth: 4, elevation: 6, pitchDegrees: 30, overhang: 0.3, type: "gable" }] };
it("accepts legacy, empty and authored models without modifying input", () => {
  for (const input of [undefined, null, emptyArchitecturalModel(), valid]) {
    const before = JSON.stringify(input);
    expect(architecturalModelError(input)).toBeNull();
    expect(readArchitecturalModel(input)).toHaveProperty("value");
    expect(JSON.stringify(input)).toBe(before);
  }
});
it("matches frontend rejection for corrupt geometry and cross-kind IDs", () => {
  const bad = [42, [], { version: 2 }, { ...valid, slabs: [null] }, { ...valid, stairs: [{ ...valid.stairs[0], id: "s" }] }, { ...valid, slabs: [{ ...valid.slabs[0], floor: -1 }] }, { ...valid, slabs: [{ ...valid.slabs[0], thickness: "15" }] }, { ...valid, slabs: [{ ...valid.slabs[0], voids: [{ x: 3, y: 3, width: 2, depth: 2 }] }] }, { ...valid, slabs: [{ ...valid.slabs[0], voids: [valid.slabs[0].voids[0], valid.slabs[0].voids[0]] }] }, { ...valid, stairs: [{ ...valid.stairs[0], run: 1 }] }, { ...valid, stairs: [{ ...valid.stairs[0], openSlab: "true" }] }, { ...valid, roofs: [{ ...valid.roofs[0], type: "flat" }] }, { ...valid, openings: [{ id: "j", wallId: "w", type: "window", width: 1, height: 1, sillHeight: 0.9, quantity: 0 }] }];
  for (const input of bad) {
    expect(architecturalModelError(input)).toBeTruthy();
    expect(readArchitecturalModel(input)).toHaveProperty("error");
  }
});
