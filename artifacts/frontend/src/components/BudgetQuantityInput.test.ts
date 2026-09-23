import { describe, expect, it } from "vitest";
import {
  formatBudgetQuantity,
  normalizeBudgetQuantity,
  parseBudgetQuantity,
  quantityStep,
} from "./BudgetQuantityInput";

describe("BudgetQuantityInput helpers", () => {
  it("usa passo 0,01 para produto e composição", () => {
    expect(quantityStep(false)).toBe(0.01);
    expect(quantityStep(true)).toBe(0.01);
  });

  it("mantém sempre duas casas decimais na exibição", () => {
    expect(normalizeBudgetQuantity(0.00012, true)).toBe(0.01);
    expect(formatBudgetQuantity(12.5, true)).toBe("12,50");
    expect(formatBudgetQuantity(12.25, true)).toBe("12,25");
  });

  it("aceita vírgula e ponto na digitação", () => {
    expect(parseBudgetQuantity("12,25", true)).toBe(12.25);
    expect(parseBudgetQuantity("12.25", true)).toBe(12.25);
  });

  it("arredonda para cima em duas casas decimais e mantém mínimo 0,01", () => {
    expect(normalizeBudgetQuantity(4.999, false)).toBe(5);
    expect(normalizeBudgetQuantity(4.987, false)).toBe(4.99);
    expect(normalizeBudgetQuantity(4.981, false)).toBe(4.99);
    expect(normalizeBudgetQuantity(0, false)).toBe(0.01);
    expect(parseBudgetQuantity("3,1415", false)).toBeNull();
  });
});
