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

export type PhysicalStock = {
  productId: string;
  itemId: string;
  unit: string;
  quantity: number;
};
export type StockComparison = {
  productId: string;
  unit: "g" | "ml" | "un";
  required: number;
  available: number | null;
  suggested: number | null;
  status: "ready" | "unmapped" | "ambiguous" | "incompatible_unit";
};
/** Only calculate shortage when one unambiguous, compatible stock item exists.
 * Tenant/location scoping and source data reconciliation happen in the caller.
 */
export function compareDemandWithStock(demand: Demand[], physical: PhysicalStock[]): StockComparison[] {
  const normalize = (q: number, unit: string) => {
    if (!Number.isFinite(q) || q < 0) throw new Error("Invalid stock quantity");
    if (unit === "kg") return {unit:"g", quantity:q * 1000};
    if (unit === "l") return {unit:"ml", quantity:q * 1000};
    if (unit === "g" || unit === "ml" || unit === "un") return {unit, quantity:q};
    return null;
  };
  return demand.map(d => {
    const matches = physical.filter(p => p.productId === d.productId);
    const base = {productId:d.productId,unit:d.unit,required:d.required};
    if (!matches.length) return {...base,available:null,suggested:null,status:"unmapped" as const};
    if (new Set(matches.map(p => p.itemId)).size !== 1)
      return {...base,available:null,suggested:null,status:"ambiguous" as const};
    const normalized = matches.map(p=>normalize(p.quantity,p.unit));
    if (normalized.some(p=>!p || p.unit !== d.unit))
      return {...base,available:null,suggested:null,status:"incompatible_unit" as const};
    const available = normalized.reduce((sum,p)=>sum + (p?.quantity ?? 0),0);
    return {...base,available,suggested:suggestPurchaseQuantity(d.required,available),status:"ready" as const};
  });
}
