import type { ArchitecturalModel } from "./conceptArchitecturalModel";
import { architecturalSlabVoids, rectangularSolidCells } from "./conceptArchitecturalSlabVoids";
export function architecturalQuantityRows(model: ArchitecturalModel) {
  return model.slabs.flatMap(slab => {
    const net = rectangularSolidCells(slab, architecturalSlabVoids(model, slab)).reduce((sum, cell) => sum + cell.width * cell.depth, 0);
    return [{ id: slab.id, floor: slab.floor as number | null, item: "Laje: área líquida", unit: "m²", quantity: net }, { id: slab.id, floor: slab.floor as number | null, item: "Laje: volume geométrico", unit: "m³", quantity: net * slab.thickness }];
  }).concat(model.stairs.map(stair => ({ id: stair.id, floor: stair.floor, item: "Escada: quantidade", unit: "un", quantity: 1 })), model.roofs.map(roof => ({ id: roof.id, floor: null, item: "Cobertura: projeção com beiral", unit: "m²", quantity: (roof.width + 2 * roof.overhang) * (roof.depth + 2 * roof.overhang) })));
}
export function architecturalScheduleCsv(model: ArchitecturalModel) {
  const cell = (value: string | number) => { const text = String(value); return '"' + (/^\s*[=+@-]/.test(text) ? "'" : "") + text.replace(/"/g, '""') + '"'; };
  return "\uFEFF" + [["ID", "Pavimento (índice)", "Medição", "Unidade", "Quantidade"], ...architecturalQuantityRows(model).map(row => [row.id, row.floor ?? "", row.item, row.unit, row.quantity.toFixed(4).replace(".", ",")])].map(row => row.map(cell).join(";")).join("\r\n");
}
