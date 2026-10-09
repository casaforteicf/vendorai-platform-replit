import { describe, expect, it } from "vitest";
import { matchesApprovedBudget } from "./budget-import-integrity.js";

const approved = {
  valorTotal: 113,
  itens: [{ descricao: "Janela PVC", quantidade: 2, valorUnitario: 50 }],
};
const submitted = {
  valorTotal: 113,
  itens: [{ nome: "Janela PVC", quantidade: 2, valorUnitario: 50 }],
};

describe("approved budget integrity", () => {
  it("accepts reviewed items with an approved total including freight/tax", () => {
    expect(matchesApprovedBudget(approved, submitted)).toBe(true);
  });
  it("rejects altered item value, quantity or description", () => {
    expect(matchesApprovedBudget(approved, { ...submitted, itens: [{ ...submitted.itens[0], valorUnitario: 49 }] })).toBe(false);
    expect(matchesApprovedBudget(approved, { ...submitted, itens: [{ ...submitted.itens[0], quantidade: 3 }] })).toBe(false);
    expect(matchesApprovedBudget(approved, { ...submitted, itens: [{ ...submitted.itens[0], nome: "Outro" }] })).toBe(false);
  });
  it("rejects mismatched total, empty snapshot or item count", () => {
    expect(matchesApprovedBudget(approved, { ...submitted, valorTotal: 112 })).toBe(false);
    expect(matchesApprovedBudget(null, submitted)).toBe(false);
    expect(matchesApprovedBudget(approved, { ...submitted, itens: [] })).toBe(false);
  });
  it("rejects nonfinite and negative values", () => {
    expect(matchesApprovedBudget({ ...approved, valorTotal: Number.NaN }, submitted)).toBe(false);
    expect(matchesApprovedBudget(approved, { ...submitted, itens: [{ ...submitted.itens[0], valorUnitario: Number.POSITIVE_INFINITY }] })).toBe(false);
    expect(matchesApprovedBudget(approved, { ...submitted, itens: [{ ...submitted.itens[0], quantidade: -1 }] })).toBe(false);
  });
});
