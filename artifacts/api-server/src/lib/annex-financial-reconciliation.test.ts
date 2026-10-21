import { describe, expect, it } from "vitest";
import { reconcileAnnexTotals } from "./annex-financial-reconciliation.js";

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
