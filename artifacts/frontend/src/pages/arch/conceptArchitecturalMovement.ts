import { applyArchitecturalEdits, type ArchitecturalElement, type ArchitecturalModel } from "./conceptArchitecturalModel";
/** Translate owned holes together with a slab; retain floor, height and dimensions. */
export function moveArchitecturalElement(model: ArchitecturalModel, id: string, dx: number, dy: number, lotWidth: number, lotDepth: number) {
  if (![dx, dy, lotWidth, lotDepth].every(Number.isFinite) || lotWidth <= 0 || lotDepth <= 0) return { error: "Movimento inválido." };
  let element: Exclude<ArchitecturalElement, { kind: "opening" }> | undefined;
  const slab = model.slabs.find(item => item.id === id);
  const stair = model.stairs.find(item => item.id === id);
  const roof = model.roofs.find(item => item.id === id);
  if (slab) element = { kind: "slab", value: { ...slab, x: slab.x + dx, y: slab.y + dy, voids: slab.voids.map(hole => ({ ...hole, x: hole.x + dx, y: hole.y + dy })) } };
  else if (stair) element = { kind: "stair", value: { ...stair, x: stair.x + dx, y: stair.y + dy } };
  else if (roof) element = { kind: "roof", value: { ...roof, x: roof.x + dx, y: roof.y + dy } };
  if (!element) return { error: "Elemento não encontrado." };
  const value = element.value;
  const depth = element.kind === "stair" ? element.value.run : element.value.depth;
  if (![value.x, value.y].every(Number.isFinite) || value.x < 0 || value.y < 0 || value.x + value.width > lotWidth + 1e-8 || value.y + depth > lotDepth + 1e-8) return { error: "O elemento deve permanecer dentro do terreno." };
  return applyArchitecturalEdits(model, [{ action: "upsert", element }]);
}
