import { describe, expect, it } from "vitest";
import {
  normalizeOrcamentoMoney,
  normalizeOrcamentoQuantity,
  roundOrcamentoNumber,
} from "./orcamento-numbers.js";

describe("orcamento numbers", () => {
  it("arredonda valores para no máximo duas casas decimais", () => {
    expect(roundOrcamentoNumber(12.345)).toBe(12.35);
    expect(roundOrcamentoNumber("8.999")).toBe(9);
    expect(roundOrcamentoNumber(4.987)).toBe(4.99);
  });

  it("mantém quantidade positiva com mínimo de 0,01", () => {
    expect(normalizeOrcamentoQuantity(0)).toBe(0.01);
    expect(normalizeOrcamentoQuantity(2.344)).toBe(2.34);
  });

  it("não permite valor monetário negativo", () => {
    expect(normalizeOrcamentoMoney(-10)).toBe(0);
    expect(normalizeOrcamentoMoney(19.996)).toBe(20);
  });
});
