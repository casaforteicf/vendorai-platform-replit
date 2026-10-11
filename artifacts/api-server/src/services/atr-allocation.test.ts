import { describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  insert: vi.fn(),
  origin: { id: "origin-1", identityKind: "person", identityId: "buyer-1", originTenantId: "tenant-origin", originPartnerId: "partner-1" },
  agreements: [
    { id: "specific", originTenantId: "tenant-origin", originPartnerId: "partner-1", version: 1, status: "active", effectiveFrom: new Date("2026-01-01"), effectiveUntil: null },
    { id: "fallback", originTenantId: "tenant-origin", originPartnerId: null, version: 1, status: "active", effectiveFrom: new Date("2026-01-01"), effectiveUntil: null },
  ],
  categories: [
    { agreementId: "specific", categoryCode: "materiais", sharePercent: "10", enabled: false },
    { agreementId: "fallback", categoryCode: "materiais", sharePercent: "10", enabled: true },
  ],
}));
vi.mock("drizzle-orm", () => ({
  eq: (column: string, value: unknown) => ({ column, value }),
  and: (...conditions: unknown[]) => ({ conditions }),
  inArray: (column: string, values: unknown[]) => ({ column, values }),
}));
vi.mock("@workspace/db", () => ({
  atrIdentityOriginsTable: { table: "origins", identityKind: "identityKind", identityId: "identityId" },
  atrOriginAgreementsTable: { table: "agreements", originTenantId: "originTenantId" },
  atrOriginAgreementCategoriesTable: { table: "categories", enabled: "enabled", agreementId: "agreementId" },
  atrCommissionAllocationsTable: { table: "allocations" },
  atrCommissionAdjustmentsTable: { table: "adjustments" },
  db: {
    insert: state.insert,
    select: () => ({
      from: (table: { table: string }) => ({
        where: (condition: { column?: string; value?: unknown; values?: unknown[] }) => {
          let rows: unknown[] = table.table === "origins" ? [state.origin]
            : table.table === "agreements" ? state.agreements : state.categories;
          if (table.table === "categories" && condition.column === "enabled") {
            rows = state.categories.filter(c => c.enabled === condition.value);
          }
          if (table.table === "categories" && condition.column === "agreementId") {
            rows = state.categories.filter(c => condition.values?.includes(c.agreementId));
          }
          return Object.assign(Promise.resolve(rows), { limit: async () => rows.slice(0, 1) });
        },
      }),
    }),
  },
}));
import { allocateAtrReceipt } from "./atr-allocation.js";
describe("ATR receipt category override", () => {
  it("does not accrue via fallback when the partner explicitly disables a category", async () => {
    state.insert.mockClear();
    const result = await allocateAtrReceipt({
      identityKind: "person", identityId: "buyer-1", sourceTenantId: "seller-tenant",
      sourceType: "order", sourceId: "order-1", receiptId: "receipt-1",
      categoryCode: "materiais", occurredAt: new Date("2026-10-10"),
      platformNetReceivedCents: 10000, reconciliationConfirmed: true,
    });
    expect(result).toBeNull();
    expect(state.insert).not.toHaveBeenCalled();
  });
});
