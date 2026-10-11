import { applyArchitecturalEdits, type ArchitecturalModel, type ArchitecturalElement } from "./conceptArchitecturalModel";
import { moveArchitecturalElement } from "./conceptArchitecturalMovement";
/** Copy saved parameters; translate manual slab holes with their owner. */
export function duplicateArchitecturalElement(model: ArchitecturalModel, sourceId: string, dx: number, dy: number, lotWidth: number, lotDepth: number) {
  if (dx === 0 && dy === 0) return { error: "Informe um deslocamento para distinguir a cópia do original." };
  const moved = moveArchitecturalElement(model, sourceId, dx, dy, lotWidth, lotDepth);
  if ("error" in moved) return moved;
  const used = new Set([...model.slabs, ...model.stairs, ...model.roofs, ...model.openings].map(item => item.id));
  let suffix = 1;
  while (used.has(`${sourceId}-copia-${suffix}`)) suffix++;
  const id = `${sourceId}-copia-${suffix}`;
  let element: ArchitecturalElement;
  const slab = moved.value.slabs.find(item => item.id === sourceId);
  const stair = moved.value.stairs.find(item => item.id === sourceId);
  const roof = moved.value.roofs.find(item => item.id === sourceId);
  if (slab) element = { kind: "slab", value: { ...slab, id, voids: slab.voids.map(hole => ({ ...hole })) } };
  else if (stair) element = { kind: "stair", value: { ...stair, id } };
  else if (roof) element = { kind: "roof", value: { ...roof, id } };
  else return { error: "Elemento não encontrado." };
  const result = applyArchitecturalEdits(model, [{ action: "upsert", element }]);
  return "error" in result ? result : { value: result.value, id };
}
