import { validateRoof, validateSlab, validateStair, type RoofInput, type SlabInput, type StairInput, type ParameterIssue } from "./conceptBimElementPreflight";

/** A non-destructive, serializable element collection for a future shared 2D/3D BIM adapter.
 * The legacy editor state is not written by this module.
 */
export type BimElement =
  | Readonly<{ id: string; kind: "stair"; x: number; y: number; parameters: StairInput }>
  | Readonly<{ id: string; kind: "slab"; x: number; y: number; parameters: SlabInput }>
  | Readonly<{ id: string; kind: "roof"; x: number; y: number; floor: number; parameters: RoofInput }>;
export type BimModel = Readonly<{ schemaVersion: 1; elements: readonly BimElement[] }>;
export type BimModelIssue = Readonly<{ id: string; code: "DUPLICATE_ID" | "INVALID_ID" | "INVALID_POSITION" | "INVALID_FLOOR" | "INVALID_PARAMETERS"; details?: readonly ParameterIssue[] }>;

export function inspectBimModel(model: BimModel): BimModelIssue[] {
  const issues: BimModelIssue[] = [];
  const seen = new Set<string>();
  for (const element of model.elements) {
    if (typeof element.id !== "string" || !element.id.trim()) issues.push({ id: element.id, code: "INVALID_ID" });
    else if (seen.has(element.id)) issues.push({ id: element.id, code: "DUPLICATE_ID" });
    seen.add(element.id);
    if (!Number.isFinite(element.x) || !Number.isFinite(element.y)) issues.push({ id: element.id, code: "INVALID_POSITION" });
    if (element.kind === "roof" && (!Number.isInteger(element.floor) || element.floor < 0)) issues.push({ id: element.id, code: "INVALID_FLOOR" });
    const result = element.kind === "stair" ? validateStair(element.parameters)
      : element.kind === "slab" ? validateSlab(element.parameters)
      : validateRoof(element.parameters);
    if (!result.valid) issues.push({ id: element.id, code: "INVALID_PARAMETERS", details: result.issues });
  }
  return issues;
}

export function upsertBimElement(model: BimModel, element: BimElement): BimModel {
  const next: BimModel = {
    schemaVersion: 1,
    elements: model.elements.some(existing => existing.id === element.id)
      ? model.elements.map(existing => existing.id === element.id ? element : existing)
      : [...model.elements, element],
  };
  const issues = inspectBimModel(next);
  if (issues.length) throw new Error("ARQDOR_BIM_INVALID:" + issues.map(issue => issue.code).join(","));
  return next;
}

export function removeBimElement(model: BimModel, id: string): BimModel {
  return { schemaVersion: 1, elements: model.elements.filter(element => element.id !== id) };
}
