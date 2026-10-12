import { expect, it } from "vitest";
import { documentationWallPlan } from "./conceptDocumentationWalls";
const wall = { id: "w", floor: 0, x1: 0, y1: 0, x2: 4, y2: 0 };
it("uses 15cm default and cuts normalized centred door opening", () => {
 const shapes = documentationWallPlan([wall], [{ id: "d", wallId: "w", floor: 0, type: "door", offset: 0.5, width: 1 }], 0);
 expect(shapes).toHaveLength(2);
 expect(shapes[0].points[1].u).toBe(1.5);
 expect(shapes[1].points[0].u).toBe(2.5);
 expect(shapes[0].points[0].z).toBe(-0.075);
 expect(documentationWallPlan([wall], [], 1)).toEqual([]);
});
it("keeps high windows solid at cut height and handles diagonal walls and overlapping cuts", () => {
 const opening = { id: "j", wallId: "w", floor: 0, type: "window" as const, offset: 0.5, width: 1, sillHeight: 1.5 };
 expect(documentationWallPlan([wall], [opening], 0)).toHaveLength(1);
 const lower = { ...opening, sillHeight: 0.9 };
 expect(documentationWallPlan([wall], [lower, lower], 0)).toHaveLength(2);
 const diagonal = documentationWallPlan([{ ...wall, y2: 4 }], [], 0)[0];
 expect(diagonal.points[0].u).toBeLessThan(0);
 expect(diagonal.points[1].u).toBeLessThan(4);
 expect(documentationWallPlan([{ ...wall, x2: 0 }], [], 0)).toEqual([]);
});
