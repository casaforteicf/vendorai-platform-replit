import { expect, it } from "vitest";
import { emptyArchitecturalModel } from "./conceptArchitecturalModel";
import { architecturalSection } from "./conceptArchitecturalSections";
it("keeps slab voids open in sections and respects absolute elevations", () => {
 const model = emptyArchitecturalModel();
 model.slabs.push({ id: "s", floor: 1, x: 0, y: 0, width: 4, depth: 4, thickness: 0.2, elevation: 3.12, voids: [{ x: 1, y: 1, width: 1, depth: 1 }] });
 const cut = architecturalSection(model, "x", 1.5);
 expect(cut).toHaveLength(2);
 expect(cut.every(item => item.points.every(p => p.u <= 1 || p.u >= 2))).toBe(true);
 expect(cut[0].points[0].z).toBeCloseTo(2.92);
 expect(architecturalSection(model, "x", 5)).toEqual([]);
 expect(architecturalSection(model, "x", NaN)).toEqual([]);
});
it("intersects real pitched roof faces and updates with model edits", () => {
 const model = emptyArchitecturalModel();
 model.roofs.push({ id: "r", x: 0, y: 0, width: 4, depth: 4, elevation: 3, pitchDegrees: 45, overhang: 0, type: "gable" });
 const cut = architecturalSection(model, "x", 2);
 expect(cut).toHaveLength(2);
 expect(Math.max(...cut.flatMap(item => item.points.map(p => p.z)))).toBeCloseTo(5);
 expect(architecturalSection(model, "y", 2).flatMap(item => item.points).every(p => Math.abs(p.z - 5) < 1e-8)).toBe(true);
 model.roofs[0].pitchDegrees = 0;
 expect(architecturalSection(model, "x", 2).flatMap(item => item.points).every(p => p.z === 3)).toBe(true);
 expect(architecturalSection(model, "x", 10, true)).toHaveLength(2);
});

it("derives plans by floor while preserving slab holes", async () => {
 const { architecturalDocumentationPlan } = await import("./conceptArchitecturalSections");
 const model = emptyArchitecturalModel();
 model.slabs.push({ id: "s", floor: 1, x: 0, y: 0, width: 4, depth: 4, thickness: 0.2, elevation: 3.12, voids: [{ x: 1, y: 1, width: 1, depth: 1 }] });
 expect(architecturalDocumentationPlan(model, 0)).toEqual([]);
 const plan = architecturalDocumentationPlan(model, 1);
 expect(plan).toHaveLength(8);
 const area = plan.reduce((sum, item) => {
 const us = item.points.map(p => p.u), zs = item.points.map(p => p.z);
 return sum + (Math.max(...us) - Math.min(...us)) * (Math.max(...zs) - Math.min(...zs));
 }, 0);
 expect(area).toBe(15);
 expect(architecturalDocumentationPlan(model, NaN)).toEqual([]);
});
