import { describe, expect, it } from "vitest";
import { checkMeasurementArithmetic } from "./annex-financial-check.js";

describe("conferência aritmética de medição", () => {
  it("aceita bruto menos amortização igual a líquido", () => {
    expect(checkMeasurementArithmetic([{ id: "m1", valorBruto: "15000.00", amortizacaoEntrada: "5000.00", valorLiquido: "10000.00", saldoEntradaApos: "25000.00" }])).toEqual([]);
  });
  it("detecta amortização duplicada ou líquido divergente", () => {
    const issues = checkMeasurementArithmetic([{ id: "m2", valorBruto: "15000.00", amortizacaoEntrada: "5000.00", valorLiquido: "15000.00", saldoEntradaApos: "25000.00" }]);
    expect(issues.map(x => x.code)).toContain("MEDICAO_NAO_FECHA");
  });
  it("sinaliza amortização superior ao valor bruto", () => {
    const issues = checkMeasurementArithmetic([{ id: "m3", valorBruto: "500.00", amortizacaoEntrada: "600.00", valorLiquido: "0", saldoEntradaApos: "0" }]);
    expect(issues.map(x => x.code)).toContain("MEDICAO_VALOR_INCONSISTENTE");
  });
});
