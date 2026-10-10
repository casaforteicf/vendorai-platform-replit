import { createRoof, createSlab, createStraightStair, openingSchedule, type Roof, type Slab, type Stair, type OpeningScheduleItem } from "./conceptArchitecturalElements";

/** Serializable model shared by future 2D, 3D and documentation adapters. */
export type ArchitecturalModel = {
  version: 1;
  slabs: Slab[];
  stairs: Stair[];
  roofs: Roof[];
  openings: OpeningScheduleItem[];
};
export type ArchitecturalElement = { kind: "slab"; value: Slab } | { kind: "stair"; value: Stair } | { kind: "roof"; value: Roof } | { kind: "opening"; value: OpeningScheduleItem };
export type ArchitecturalEdit = { action: "upsert"; element: ArchitecturalElement } | { action: "remove"; kind: ArchitecturalElement["kind"]; id: string };
type Result<T> = { value: T } | { error: string };
export const emptyArchitecturalModel = (): ArchitecturalModel => ({ version: 1, slabs: [], stairs: [], roofs: [], openings: [] });
const clone = (model: ArchitecturalModel): ArchitecturalModel => ({
  version: 1, slabs: model.slabs.map(s => ({ ...s, voids: s.voids.map(v => ({ ...v })) })),
  stairs: model.stairs.map(s => ({ ...s })), roofs: model.roofs.map(r => ({ ...r })), openings: model.openings.map(o => ({ ...o })),
});
function validOpening(o: OpeningScheduleItem): boolean {
  return Boolean(o.id && o.wallId && (o.type === "door" || o.type === "window")) &&
    [o.width, o.height, o.sillHeight, o.quantity].every(Number.isFinite) &&
    o.width > 0 && o.height > 0 && o.sillHeight >= 0 && Number.isFinite(o.sillHeight + o.height) &&
    Number.isInteger(o.quantity) && o.quantity > 0;
}
export function applyArchitecturalEdits(model: ArchitecturalModel, edits: readonly ArchitecturalEdit[]): Result<ArchitecturalModel> {
  if (model.version !== 1) return { error: "Versão do modelo incompatível." };
  const next = clone(model);
  for (const edit of edits) {
    const kind = edit.action === "upsert" ? edit.element.kind : edit.kind;
    const key = kind === "slab" ? "slabs" : kind === "stair" ? "stairs" : kind === "roof" ? "roofs" : "openings";
    const entries = next[key] as Array<{ id: string }>;
    if (edit.action === "remove") {
      const index = entries.findIndex(entry => entry.id === edit.id);
      if (index < 0) return { error: "Elemento não encontrado." };
      entries.splice(index, 1);
      continue;
    }
    const element = edit.element.value;
    if (!element.id) return { error: "Elemento sem identificador." };
    if (kind === "slab") {
      const validation = createSlab(element as Slab);
      if ("error" in validation) return validation;
    } else if (kind === "stair") {
      const validation = createStraightStair(element as Stair);
      if ("error" in validation) return validation;
    } else if (kind === "roof") {
      const validation = createRoof(element as Roof);
      if ("error" in validation) return validation;
    } else if (!validOpening(element as OpeningScheduleItem)) return { error: "Esquadria inválida." };
    const value = kind === "slab" ? { ...(element as Slab), voids: (element as Slab).voids.map(v => ({ ...v })) } : { ...element };
    const index = entries.findIndex(entry => entry.id === element.id);
    if (index < 0) entries.push(value);
    else entries[index] = value;
  }
  return { value: next };
}
/** Read-models do not mutate the central snapshot. */
export function architecturalQuantities(model: ArchitecturalModel) {
  return {
    slabNetArea: model.slabs.reduce((total, slab) => total + slab.width * slab.depth - slab.voids.reduce((area, v) => area + v.width * v.depth, 0), 0),
    roofFootprintArea: model.roofs.reduce((total, roof) => total + (roof.width + 2 * roof.overhang) * (roof.depth + 2 * roof.overhang), 0),
    openings: openingSchedule(model.openings),
    stairs: model.stairs.length,
  };
}
