/**
 * Quantity arithmetic is normalized to 4 decimal places, matching
 * the operational quantity precision in obra_execucao.
 * Never rely on floating point equality when reserving partial batches.
 */
export function quantityUnits(value: number): number {
  if (!Number.isFinite(value) || value < 0 || Math.abs(value * 10000 - Math.round(value * 10000)) > 0.000001) {
    throw new Error("Quantidade deve ser positiva ou zero, com no máximo quatro casas decimais.");
  }
  return Math.round(value * 10000);
}

export function remainingQuantity(original: number, allocated: readonly number[]): number {
  const capacity = quantityUnits(original);
  const committed = allocated.reduce((sum, n) => sum + quantityUnits(n), 0);
  return Math.max(0, capacity - committed) / 10000;
}

export function canAllocateQuantity(original: number, allocated: readonly number[], requested: number): boolean {
  if (!(requested > 0)) return false;
  return quantityUnits(requested) <= quantityUnits(remainingQuantity(original, allocated));
}
