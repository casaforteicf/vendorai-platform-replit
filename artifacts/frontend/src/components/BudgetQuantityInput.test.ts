import { describe, expect, it } from "vitest";
import {
  formatBudgetQuantity,
  normalizeBudgetQuantity,
  parseBudgetQuantity,
  quantityStep,
} from "./BudgetQuantityInput";

describe("BudgetQuantityInput helpers", () => {
  it("usa passo 1 para produto e 0,01 para composição", () => {
    expect(quantityStep(false)).toBe(1);
    expect(quantityStep(true)).toBe(0.01);
  });

  it("não força quatro casas decimais em composição", () => {
    expect(normalizeBudgetQuantity(0.00012, true)).toBe(0.01);
    expect(formatBudgetQuantity(12.5, true)).toBe("12.5");
    expect(formatBudgetQuantity(12.25, true)).toBe("12.25");
  });

  it("aceita vírgula e ponto na digitação", () => {
    expect(parseBudgetQuantity("12,25", true)).toBe(12.25);
    expect(parseBudgetQuantity("12.25", true)).toBe(12.25);
  });

  it("mantém produto inteiro e mínimo 1", () => {
    expect(normalizeBudgetQuantity(4.9, false)).toBe(4);
    expect(normalizeBudgetQuantity(0, false)).toBe(1);
  });
});
