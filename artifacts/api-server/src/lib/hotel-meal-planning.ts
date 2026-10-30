export interface MealPlanIngredient {
  productId: string;
  grossQuantityPerBatch: number;
  batchPortions: number;
  plannedPortions: number;
  unit: "g" | "kg" | "ml" | "l" | "un";
}

export interface Demand {
  productId: string;
  unit: "g" | "ml" | "un";
  required: number;
}

/** Calculates gross ingredient requirements, without inventing occupancy or stock.
 * Returns canonical mass/volume units and does not create purchase orders.
 */
export function forecastIngredientDemand(lines: MealPlanIngredient[]): Demand[] {
  const result = new Map<string, Demand>();
  for (const line of lines) {
    const values = [line.grossQuantityPerBatch, line.batchPortions, line.plannedPortions];
    if (values.some(n => !Number.isFinite(n)) || line.grossQuantityPerBatch <= 0
      || line.batchPortions <= 0 || !Number.isInteger(line.batchPortions)
      || line.plannedPortions < 0 || !Number.isInteger(line.plannedPortions)) {
      throw new Error("Invalid planned recipe quantity");
    }
    const unit = line.unit === "kg" ? "g" : line.unit === "l" ? "ml" : line.unit;
    const factor = line.unit === "kg" || line.unit === "l" ? 1000 : 1;
    const quantity = line.grossQuantityPerBatch * factor * line.plannedPortions / line.batchPortions;
    if (!Number.isFinite(quantity)) throw new Error("Demand overflow");
    const key = line.productId + ":" + unit;
    const existing = result.get(key);
    result.set(key, { productId: line.productId, unit, required: (existing?.required ?? 0) + quantity });
  }
  return [...result.values()].sort((a,b) => a.productId.localeCompare(b.productId) || a.unit.localeCompare(b.unit));
}

export function suggestPurchaseQuantity(required: number, available: number): number {
  if (![required, available].every(Number.isFinite) || required < 0 || available < 0)
    throw new Error("Invalid demand or availability");
  return Math.max(0, required - available);
}
