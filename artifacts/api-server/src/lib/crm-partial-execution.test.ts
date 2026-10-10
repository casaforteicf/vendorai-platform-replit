import { describe, expect, it } from "vitest";
import { canAllocateQuantity, quantityUnits, remainingQuantity } from "./crm-partial-execution.js";

describe("CRM V4 — execução parcial por item", () => {
  it("subtrai lotes parciais sem perder casas decimais", () => {
    expect(remainingQuantity(1, [0.1, 0.2])).toBe(0.7);
    expect(remainingQuantity(10, [2, 3.125])).toBe(4.875);
  });

  it("impede reserva acima da quantidade total", () => {
    expect(canAllocateQuantity(4, [2, 1.5], 0.5001)).toBe(false);
    expect(canAllocateQuantity(4, [2, 1.5], 0.5)).toBe(true);
    expect(canAllocateQuantity(4, [4], 0.01)).toBe(false);
  });

  it("impede valor zero e quantidades com precisão excessiva", () => {
    expect(canAllocateQuantity(1, [], 0)).toBe(false);
    expect(() => quantityUnits(0.00001)).toThrow();
    expect(() => quantityUnits(Number.NaN)).toThrow();
    expect(() => quantityUnits(-1)).toThrow();
  });

  it("preserva saldo não negativo de lotes históricos", () => {
    expect(remainingQuantity(1, [0.6, 0.6])).toBe(0);
  });
});
