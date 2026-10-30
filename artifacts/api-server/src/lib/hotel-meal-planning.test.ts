import { describe, expect, it } from "vitest";
import { forecastIngredientDemand, suggestPurchaseQuantity, compareDemandWithStock } from "./hotel-meal-planning";

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
  it("compares only compatible inventory units", () => {
    expect(compareDemandWithStock([{productId:"milk",unit:"ml",required:2000}],[
      {productId:"milk",itemId:"item-1",unit:"l",quantity:1.5},
    ])[0]).toMatchObject({status:"ready",available:1500,suggested:500});
  });
  it("never invents available stock or shortages from missing items", () => {
    expect(compareDemandWithStock([{productId:"rice",unit:"g",required:1000}],[])[0])
      .toMatchObject({status:"unmapped",available:null,suggested:null});
  });
  it("blocks ambiguous mappings and incompatible units", () => {
    const need = [{productId:"eggs",unit:"un" as const,required:10}];
    expect(compareDemandWithStock(need,[
      {productId:"eggs",itemId:"a",unit:"un",quantity:2},
      {productId:"eggs",itemId:"b",unit:"un",quantity:2},
    ])[0]?.status).toBe("ambiguous");
    expect(compareDemandWithStock(need,[
      {productId:"eggs",itemId:"a",unit:"kg",quantity:2},
    ])[0]?.status).toBe("incompatible_unit");
  });

  it("consolidates the same ingredient across five services without subtracting stock five times", () => {
    const demand = forecastIngredientDemand([
      {productId:"flour",grossQuantityPerBatch:0.5,batchPortions:10,plannedPortions:20,unit:"kg"},
      {productId:"flour",grossQuantityPerBatch:200,batchPortions:10,plannedPortions:10,unit:"g"},
      {productId:"flour",grossQuantityPerBatch:1,batchPortions:20,plannedPortions:40,unit:"kg"},
      {productId:"flour",grossQuantityPerBatch:300,batchPortions:10,plannedPortions:10,unit:"g"},
      {productId:"flour",grossQuantityPerBatch:0.25,batchPortions:5,plannedPortions:10,unit:"kg"},
    ]);
    expect(demand).toEqual([{productId:"flour",unit:"g",required:4000}]);
    expect(suggestPurchaseQuantity(demand[0]!.required,2500)).toBe(1500);
  });

});
