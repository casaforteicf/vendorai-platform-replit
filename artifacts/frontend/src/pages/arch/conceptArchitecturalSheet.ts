/** SVG view bounds are in metres; an A3 sheet uses millimetres. */
export function architecturalSheetLayout(bounds: { minU: number; maxU: number; minZ: number; maxZ: number }, scale: number) {
  if (![bounds.minU, bounds.maxU, bounds.minZ, bounds.maxZ, scale].every(Number.isFinite) || ![50, 100, 200].includes(scale)) return { error: "Escala ou dimensões inválidas." };
  const width = (Math.max(1, bounds.maxU - bounds.minU) + 1.9) * 1000 / scale;
  const height = (Math.max(1, bounds.maxZ - bounds.minZ) + 1.9) * 1000 / scale;
  if (width > 390 || height > 240) return { error: "A vista não cabe na folha A3 nesta escala. Escolha uma escala menor (1:100 ou 1:200)." };
  return { value: { width, height, x: 15 + (390 - width) / 2, y: 10 + (240 - height) / 2, scale } };
}
