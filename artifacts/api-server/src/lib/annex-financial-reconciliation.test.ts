import { describe, expect, it } from "vitest";
import { reconcileAnnexTotals, reconcileAnnexMeasurements, reconcileClassifiedContractPayments, auditEntryAmortization } from "./annex-financial-reconciliation.js";

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

describe("classified contractual installments", () => {
  it("balances explicit entry PVC and measurement components without approving annex", () => {
    const report = reconcileClassifiedContractPayments("900015.70", [
      { id: "entrada", kind: "entrada", amount: "90000", referenceId: "contract-entry" },
      { id: "pvc", kind: "pvc", amount: "90000", referenceId: "contract-pvc" },
      { id: "medicao", kind: "medicao", amount: "720015.70", referenceId: "contract-measurements" },
    ]);
    expect(report.issues).toHaveLength(0);
    expect(report.sum).toBe("900015.70");
    expect(report.canIssueAnnexB).toBe(false);
  });
  it("flags duplicate or unsourced installments", () => {
    const report = reconcileClassifiedContractPayments("200", [
      { id: "a", kind: "entrada", amount: "100" },
      { id: "a", kind: "pvc", amount: "100" },
    ]);
    expect(report.issues.map(x => x.code)).toContain("DUPLICATE_PAYMENT_LINE");
    expect(report.issues.map(x => x.code)).toContain("PAYMENT_SOURCE_MISSING");
  });
});

describe("entry advance accounting", () => {
  it("tracks amortization as utilization of advance, not second revenue", () => {
    const result = auditEntryAmortization("90000", [
      { id: "m1", valorBruto: "20000", amortizacaoEntrada: "3000", valorLiquido: "17000", saldoEntradaApos: "87000" },
      { id: "m2", valorBruto: "30000", amortizacaoEntrada: "5000", valorLiquido: "25000", saldoEntradaApos: "82000" },
    ]);
    expect(result.remainingEntry).toBe("82000.00");
    expect(result.issues).toHaveLength(0);
    expect(result.canIssueAnnexB).toBe(false);
  });
  it("detects amortization beyond the contractual advance", () => {
    const result = auditEntryAmortization("100", [
      { id: "m1", valorBruto: "200", amortizacaoEntrada: "120", valorLiquido: "80", saldoEntradaApos: "0" },
    ]);
    expect(result.issues.map(x => x.code)).toContain("ENTRY_OVER_AMORTIZED");
  });
});
