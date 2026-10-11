import { describe, expect, it } from "vitest";
import { calculateAtrOriginShareCents, resolveAtrOriginParticipation } from "./atr-origin-rules.js";
const base = {
  originTenantId: "incorporadora-a",
  originPartnerId: "parceiro-a",
  categoryCode: "materiais",
  occurredAt: new Date("2026-10-12T12:00:00Z"),
  agreements: [{
    id: "contract-v1", originTenantId: "incorporadora-a", originPartnerId: "parceiro-a",
    version: 1, status: "active" as const,
    effectiveFrom: "2026-01-01T00:00:00Z", effectiveUntil: null,
  }],
  categories: [{ agreementId: "contract-v1", categoryCode: "materiais", sharePercent: "10", enabled: true }],
};
describe("ATR origin participation", () => {
  it("allocates 10% of received platform commission, not order gross", () => {
    expect(calculateAtrOriginShareCents(250000, 10)).toBe(25000);
  });
  it("preserves origin while applying category agreement", () => {
    expect(resolveAtrOriginParticipation(base)).toMatchObject({
      agreementId: "contract-v1", agreementVersion: 1, sharePercent: 10,
    });
  });
  it("does not pay for a disabled category", () => {
    expect(resolveAtrOriginParticipation({ ...base, categories: [{ ...base.categories[0], enabled: false }] })).toBeNull();
  });
  it("does not pay a different tenant origin", () => {
    expect(resolveAtrOriginParticipation({ ...base, originTenantId: "incorporadora-b" })).toBeNull();
  });
  it("does not apply agreements before effective date", () => {
    expect(resolveAtrOriginParticipation({ ...base, occurredAt: new Date("2025-01-01") })).toBeNull();
  });
  it("does not permit invalid basis or percentages", () => {
    expect(() => calculateAtrOriginShareCents(250000, 101)).toThrow();
    expect(() => calculateAtrOriginShareCents(-1, 10)).toThrow();
  });
});
