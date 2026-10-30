import { describe, expect, it } from "vitest";
import { calculateRecipeCost } from "./hotel-recipe-cost";

describe("HOTEL-02: gastronomic acquisition cost", () => {
  it("converts kg to g and divides total cost by portions", () => {
    const result = calculateRecipeCost([{
      productId: "rice", quantityGross: 500, quantityUnit: "g",
      yieldFactor: 0.9, purchaseQuantity: 5, purchaseUnit: "kg",
      purchaseTotalCost: 50,
    }], 5);
    expect(result.totalCost).toBe(5);
    expect(result.costPerPortion).toBe(1);
    expect(result.ingredients[0]?.netYield).toBe(450);
  });

  it("uses gross consumption exactly once when yield is lower than 100%", () => {
    const result = calculateRecipeCost([{
      productId: "meat", quantityGross: 2, quantityUnit: "kg",
      yieldFactor: 0.8, purchaseQuantity: 4, purchaseUnit: "kg",
      purchaseTotalCost: 100,
    }], 10);
    expect(result.totalCost).toBe(50);
    expect(result.costPerPortion).toBe(5);
  });

  it("rejects incompatible units", () => {
    expect(() => calculateRecipeCost([{
      productId: "milk", quantityGross: 1, quantityUnit: "kg",
      yieldFactor: 1, purchaseQuantity: 1, purchaseUnit: "l",
      purchaseTotalCost: 12,
    }], 1)).toThrow("Incompatible");
  });

  it("rejects missing ingredients and invalid portions", () => {
    expect(() => calculateRecipeCost([], 5)).toThrow();
    expect(() => calculateRecipeCost([{
      productId: "x", quantityGross: 1, quantityUnit: "un",
      yieldFactor: 1, purchaseQuantity: 1, purchaseUnit: "un",
      purchaseTotalCost: 2,
    }], 0)).toThrow();
  });
  it("converts liters into milliliters without changing unit costs", () => {
    const result = calculateRecipeCost([{
      productId: "juice", quantityGross: 250, quantityUnit: "ml",
      yieldFactor: 1, purchaseQuantity: 2, purchaseUnit: "l",
      purchaseTotalCost: 16,
    }], 2);
    expect(result.totalCost).toBe(2);
    expect(result.costPerPortion).toBe(1);
  });

  it("rejects invalid purchase and yield data", () => {
    const item = {
      productId: "x", quantityGross: 1, quantityUnit: "kg" as const,
      yieldFactor: 1, purchaseQuantity: 1, purchaseUnit: "kg" as const,
      purchaseTotalCost: 3,
    };
    expect(() => calculateRecipeCost([{ ...item, yieldFactor: 1.2 }], 1)).toThrow();
    expect(() => calculateRecipeCost([{ ...item, purchaseQuantity: 0 }], 1)).toThrow();
    expect(() => calculateRecipeCost([{ ...item, purchaseTotalCost: -1 }], 1)).toThrow();
  });

});
