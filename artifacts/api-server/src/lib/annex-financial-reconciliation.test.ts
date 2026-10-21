import { describe, expect, it } from "vitest";
import { reconcileAnnexTotals, reconcileAnnexMeasurements } from "./annex-financial-reconciliation.js";

describe("annex finance reconciliation", () => {
  it("compares amounts without certifying a signed contract", () => {
    const report = reconcileAnnexTotals(900015.70, [90000, 90000, 720015.70]);
    expect(report.equal).toBe(true);
    expect(report.canIssueAnnexB).toBe(false);
    expect(report.contractualApprovalVerified).toBe(false);
  });
  it("reports mismatched totals", () => {
    expect(reconcileAnnexTotals(1000, [400, 500]).equal).toBe(false);
  });
});

describe("annex measurement arithmetic", () => {
  it("reconciles gross less entry amortization with net", () => {
    const report = reconcileAnnexMeasurements([{ id: "m1", valorBruto: "20000.00", amortizacaoEntrada: "3000.00", valorLiquido: "17000.00", saldoEntradaApos: "87000.00" }]);
    expect(report.issues).toHaveLength(0);
    expect(report.netTotal).toBe("17000.00");
    expect(report.canIssueAnnexB).toBe(false);
  });
  it("signals mismatched payments rather than silently changing them", () => {
    const report = reconcileAnnexMeasurements([{ id: "m2", valorBruto: "100.00", amortizacaoEntrada: "20.00", valorLiquido: "90.00", saldoEntradaApos: "0" }]);
    expect(report.issues.map(x => x.code)).toContain("MEASUREMENT_BALANCE_MISMATCH");
  });
});
