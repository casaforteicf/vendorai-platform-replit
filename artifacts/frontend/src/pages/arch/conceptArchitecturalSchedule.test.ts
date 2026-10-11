import { expect, it } from "vitest";
import { emptyArchitecturalModel } from "./conceptArchitecturalModel";
import { architecturalQuantityRows, architecturalScheduleCsv } from "./conceptArchitecturalSchedule";
it("subtracts overlapping stair and manual holes once and recomputes volume", () => {
 const model = emptyArchitecturalModel();
 model.slabs.push({ id: "s", floor: 1, x: 0, y: 0, width: 4, depth: 5, thickness: 0.2, elevation: 3.12, voids: [{ x: 1, y: 0, width: 1, depth: 1 }] });
 model.stairs.push({ id: "st", floor: 0, x: 1, y: 0, width: 1, run: 4.2, rise: 2.8 });
 expect(architecturalQuantityRows(model)[0].quantity).toBeCloseTo(15.8);
 expect(architecturalQuantityRows(model)[1].quantity).toBeCloseTo(3.16);
 model.stairs[0].openSlab = false;
 expect(architecturalQuantityRows(model)[0].quantity).toBe(19);
});
it("exports projected area with beirals and neutralizes formula IDs", () => {
 const model = emptyArchitecturalModel();
 model.roofs.push({ id: '=HYPERLINK("x")', x: 0, y: 0, width: 3, depth: 4, elevation: 3, pitchDegrees: 30, overhang: 0.5, type: "gable" });
 expect(architecturalQuantityRows(model)[0].quantity).toBe(20);
 expect(architecturalScheduleCsv(model)).toContain('"\'=HYPERLINK(""x"")"');
 expect(architecturalScheduleCsv(model)).toContain('"20,0000"');
 expect(architecturalQuantityRows(emptyArchitecturalModel())).toEqual([]);
});
