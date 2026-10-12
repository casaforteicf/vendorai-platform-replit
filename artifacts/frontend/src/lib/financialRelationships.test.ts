import { describe, expect, it } from "vitest";
import { validateFinancialArrangement, amountsBySubject, type FinancialArrangement } from "./financialRelationships";

const base: FinancialArrangement = {
  transactionId: "deal-1", currency: "BRL", totalCents: 100000, status: "draft",
  participants: [
    { subjectId: "vendor", role: "seller", amountCents: 85000 },
    { subjectId: "broker", role: "commission_recipient", amountCents: 15000 },
  ],
};
describe("UI-01.9 financial relationships", () => {
  it("validates allocations in integer cents", () => {
    expect(validateFinancialArrangement(base)).toEqual([]);
    expect(amountsBySubject(base)).toEqual({ vendor: 85000, broker: 15000 });
  });
  it("rejects missing or mismatched allocations", () => {
    expect(validateFinancialArrangement({ ...base, totalCents: 99999 })).toContain("allocation_mismatch");
    expect(validateFinancialArrangement({ ...base, participants: [] })).toContain("missing_seller");
  });
  it("rejects duplicate beneficiary positions, negative and fractional amounts", () => {
    expect(validateFinancialArrangement({ ...base, participants: [
      { subjectId: "vendor", role: "seller", amountCents: 85000 },
      { subjectId: "vendor", role: "seller", amountCents: 15000 },
    ] })).toContain("duplicate_role_allocation");
    expect(validateFinancialArrangement({ ...base, participants: [
      { subjectId: "vendor", role: "seller", amountCents: -1 },
    ] })).toContain("invalid_allocation");
    expect(validateFinancialArrangement({ ...base, totalCents: 12.3 })).toContain("invalid_total");
  });
  it("does not infer financial positions from profile roles", () => {
    expect(base.participants[1]?.role).toBe("commission_recipient");
    expect(base.status).toBe("draft");
  });
});
