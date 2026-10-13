import { inspectBimModel, type BimModel } from "./conceptBimElementModel";

/** Pure BIM-to-plan adapter, in metres. No mutation of the legacy editor geometry. */
export type BimPlanShape = Readonly<{
  id: string;
  kind: "stair" | "slab" | "roof" | "slab-opening";
  floor: number;
  x: number;
  y: number;
  width: number;
  depth: number;
  parentId?: string;
}>;

/** Generates rectangles for a plan renderer. Openings are void overlays, not solid slabs. */
export function projectBimPlan(model: BimModel, floor: number): BimPlanShape[] {
  if (!Number.isInteger(floor) || floor < 0) throw new Error("ARQDOR_BIM_INVALID_FLOOR");
  if (inspectBimModel(model).length) throw new Error("ARQDOR_BIM_INVALID_MODEL");
  const shapes: BimPlanShape[] = [];
  for (const element of model.elements) {
    const level = element.kind === "roof" ? element.floor : element.parameters.floor;
    if (level !== floor) continue;
    if (element.kind === "stair") {
      shapes.push({ id: element.id, kind: "stair", floor, x: element.x, y: element.y, width: element.parameters.width, depth: element.parameters.run });
    } else if (element.kind === "roof") {
      shapes.push({ id: element.id, kind: "roof", floor, x: element.x, y: element.y, width: element.parameters.width, depth: element.parameters.depth });
    } else {
      shapes.push({ id: element.id, kind: "slab", floor, x: element.x, y: element.y, width: element.parameters.width, depth: element.parameters.depth });
      element.parameters.openings.forEach((opening, index) => {
        shapes.push({ id: element.id + ":opening:" + index, parentId: element.id, kind: "slab-opening", floor, x: element.x + opening.x, y: element.y + opening.y, width: opening.width, depth: opening.depth });
      });
    }
  }
  return shapes;
}
