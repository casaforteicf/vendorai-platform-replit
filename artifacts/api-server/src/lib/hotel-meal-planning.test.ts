import { describe, expect, it } from "vitest";
import { forecastIngredientDemand, suggestPurchaseQuantity } from "./hotel-meal-planning";

describe("HOTEL-03 meal forecasting", () => {
  it("scales gross ingredients and consolidates kilograms with grams", () => {
    const demand = forecastIngredientDemand([
      {productId:"rice",grossQuantityPerBatch:1,batchPortions:10,plannedPortions:25,unit:"kg"},
      {productId:"rice",grossQuantityPerBatch:500,batchPortions:10,plannedPortions:10,unit:"g"},
    ]);
    expect(demand).toEqual([{productId:"rice",unit:"g",required:3000}]);
  });
  it("never converts incompatible count units to mass", () => {
    const demand = forecastIngredientDemand([
      {productId:"eggs",grossQuantityPerBatch:2,batchPortions:1,plannedPortions:5,unit:"un"}
    ]);
    expect(demand[0]?.required).toBe(10);
    expect(demand[0]?.unit).toBe("un");
  });
  it("never suggests a negative purchase quantity", () => {
    expect(suggestPurchaseQuantity(10, 15)).toBe(0);
    expect(suggestPurchaseQuantity(10, 3)).toBe(7);
  });
  it("rejects unsupported or invalid input", () => {
    expect(() => suggestPurchaseQuantity(-1, 1)).toThrow();
    expect(() => forecastIngredientDemand([{productId:"x",grossQuantityPerBatch:1,batchPortions:0,plannedPortions:10,unit:"kg"}])).toThrow();
  });
});
