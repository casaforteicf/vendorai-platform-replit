import { expect, it } from "vitest";
import { architecturalSheetLayout } from "./conceptArchitecturalSheet";
it("converts metre view bounds into true millimetres at the selected scale", () => {
 const bounds = { minU: 0, maxU: 10, minZ: 0, maxZ: 6 };
 const result = architecturalSheetLayout(bounds, 100);
 if (!("value" in result)) throw Error(result.error);
 expect(result.value.width).toBeCloseTo(119);
 expect(result.value.height).toBeCloseTo(79);
 const half = architecturalSheetLayout(bounds, 200);
 if (!("value" in half)) throw Error(half.error);
 expect(half.value.width).toBeCloseTo(result.value.width / 2);
});
it("rejects oversized sheets and invalid scale without silently shrinking the drawing", () => {
 const bounds = { minU: 0, maxU: 25, minZ: 0, maxZ: 6 };
 expect(architecturalSheetLayout(bounds, 50)).toHaveProperty("error");
 expect(architecturalSheetLayout(bounds, 100)).toHaveProperty("value");
 expect(architecturalSheetLayout(bounds, 0)).toHaveProperty("error");
 expect(architecturalSheetLayout({ ...bounds, maxU: NaN }, 100)).toHaveProperty("error");
});

it("rejects reversed bounds instead of producing a misleading scaled sheet", () => {
 expect(architecturalSheetLayout({ minU: 5, maxU: 0, minZ: 0, maxZ: 3 }, 100)).toHaveProperty("error");
 expect(architecturalSheetLayout({ minU: 0, maxU: 5, minZ: 3, maxZ: 0 }, 100)).toHaveProperty("error");
});
