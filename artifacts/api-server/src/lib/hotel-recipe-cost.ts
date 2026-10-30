export type RecipeUnit = "g" | "kg" | "ml" | "l" | "un";
export interface RecipeIngredientCost {
  productId: string;
  quantityGross: number;
  quantityUnit: RecipeUnit;
  yieldFactor: number;
  purchaseQuantity: number;
  purchaseUnit: RecipeUnit;
  purchaseTotalCost: number;
}
export interface RecipeCostResult {
  totalCost: number;
  costPerPortion: number;
  ingredients: Array<{productId: string; cost: number; netYield: number; netYieldUnit: RecipeUnit}>;
}

function inBase(quantity: number, unit: RecipeUnit): {value: number; group: string} {
  if (unit === "kg") return {value: quantity * 1000, group: "mass"};
  if (unit === "g") return {value: quantity, group: "mass"};
  if (unit === "l") return {value: quantity * 1000, group: "volume"};
  if (unit === "ml") return {value: quantity, group: "volume"};
  return {value: quantity, group: "count"};
}

function valid(n: number, label: string, allowZero = false) {
  if (!Number.isFinite(n) || (allowZero ? n < 0 : n <= 0)) {
    throw new Error(`Invalid ${label}`);
  }
}

function money(n: number) { return Math.round((n + Number.EPSILON) * 10000) / 10000; }

/**
 * Cost is based on GROSS ingredient quantity consumed; yieldFactor represents
 * the NET edible/usable fraction, not an additional purchasing multiplier.
 * Prices must come from acquisition records, never menu selling prices.
 */
export function calculateRecipeCost(
  ingredients: RecipeIngredientCost[], portions: number,
): RecipeCostResult {
  valid(portions, "portions");
  if (!Number.isInteger(portions)) throw new Error("Portions must be an integer");
  if (!ingredients.length) throw new Error("Recipe has no ingredients");
  let totalCost = 0;
  const lines = ingredients.map((line) => {
    valid(line.quantityGross, "ingredient gross quantity");
    valid(line.purchaseQuantity, "purchase quantity");
    valid(line.purchaseTotalCost, "purchase total cost", true);
    valid(line.yieldFactor, "yield factor");
    if (line.yieldFactor > 1) throw new Error("Yield factor cannot exceed 1");
    const use = inBase(line.quantityGross, line.quantityUnit);
    const purchase = inBase(line.purchaseQuantity, line.purchaseUnit);
    if (use.group !== purchase.group) throw new Error("Incompatible ingredient and purchase units");
    const cost = use.value / purchase.value * line.purchaseTotalCost;
    totalCost += cost;
    return { productId: line.productId, cost: money(cost),
      netYield: money(line.quantityGross * line.yieldFactor), netYieldUnit: line.quantityUnit };
  });
  return { totalCost: money(totalCost), costPerPortion: money(totalCost / portions), ingredients: lines };
}
