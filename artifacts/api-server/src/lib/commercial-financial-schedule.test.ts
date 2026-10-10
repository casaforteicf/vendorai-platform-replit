import { describe, expect, it } from "vitest";
import { allocateExactly, buildFinancialSchedule } from "./commercial-financial-schedule";

describe("LOTE 05 — cronograma físico-financeiro", () => {
  it("normaliza o total físico para 100% sem perda de centavos", () => {
    const result = buildFinancialSchedule(100_001, 10_001, [
      { id: "fundacao", weight: 1 },
      { id: "paredes", weight: 1 },
      { id: "acabamento", weight: 1 },
    ]);
    expect(result.stages.reduce((s, v) => s + v.physicalBasisPoints, 0)).toBe(10000);
    expect(result.stages.reduce((s, v) => s + v.grossCents, 0)).toBe(100_001);
    expect(result.stages.reduce((s, v) => s + v.advanceDeductionCents, 0)).toBe(10_001);
    expect(result.stages.reduce((s, v) => s + v.balanceCents, 0)).toBe(90_000);
    expect(result.stages.every((v) => v.balanceCents >= 0)).toBe(true);
  });
  it("permite etapas simultâneas sem impor sequenciamento", () => {
    const result = buildFinancialSchedule(50_000, 5_000, [
      { id: "instalacao", weight: 3, startsAt: "2026-11-01", endsAt: "2026-11-10" },
      { id: "pintura", weight: 2, startsAt: "2026-11-03", endsAt: "2026-11-07" },
    ]);
    expect(result.stages[1].startsAt).toBe("2026-11-03");
    expect(result.remainingCents).toBe(45_000);
  });
  it("não aceita entrada maior que contrato nem ID duplicado", () => {
    expect(() => buildFinancialSchedule(100, 101, [{ id: "a", weight: 1 }])).toThrow();
    expect(() => buildFinancialSchedule(100, 0, [{ id: "a", weight: 1 }, { id: "a", weight: 2 }])).toThrow();
  });
  it("distribui restos com desempate estável", () => {
    expect(allocateExactly(2, [1, 1, 1])).toEqual([1, 1, 0]);
    expect(allocateExactly(0, [1, 2])).toEqual([0, 0]);
  });
});
