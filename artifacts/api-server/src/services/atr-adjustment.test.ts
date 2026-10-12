import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ allocation: { allocatedCents: 100 }, adjustments: [] as any[], insert: vi.fn(), lock: vi.fn(), transaction: vi.fn() }));
vi.mock("@workspace/db", () => {
 const tx = {
  select: () => ({ from: (table: any) => ({ where: () => table.kind === "allocation"
   ? { limit: () => ({ for: async (mode: string) => { state.lock(mode); return [state.allocation]; } }) }
   : Promise.resolve(state.adjustments) }) }),
  insert: () => ({ values: (value: any) => { state.insert(value); return { returning: async () => [{ id: "new", ...value }] }; } }),
 };
 return { atrCommissionAllocationsTable: { kind: "allocation" }, atrCommissionAdjustmentsTable: { kind: "adjustment" }, atrIdentityOriginsTable: {}, atrOriginAgreementsTable: {}, atrOriginAgreementCategoriesTable: {}, db: { transaction: (fn: any) => { state.transaction(); return fn(tx); } } };
});
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), inArray: vi.fn() }));
import { recordAtrAdjustment } from "./atr-allocation.js";
const input = { allocationId: "a", type: "refund" as const, externalReference: "r", deltaCents: -40, reason: "refund" };
describe("ATR adjustments", () => {
 beforeEach(() => { state.adjustments = []; state.allocation = { allocatedCents: 100 }; vi.clearAllMocks(); });
 it("locks the allocation before recording a partial reversal", async () => {
  expect((await recordAtrAdjustment(input)).idempotent).toBe(false);
  expect(state.lock).toHaveBeenCalledWith("update");
  expect(state.insert).toHaveBeenCalledOnce();
 });
 it("returns the original adjustment for an identical retry", async () => {
  state.adjustments = [{ adjustmentType: "refund", externalReference: "r", deltaCents: -40, reason: "refund" }];
  expect(await recordAtrAdjustment(input)).toEqual({ adjustment: state.adjustments[0], idempotent: true });
  expect(state.insert).not.toHaveBeenCalled();
 });
 it.each([{ deltaCents: -30 }, { reason: "different" }])("rejects conflicting retries", async change => {
  state.adjustments = [{ adjustmentType: "refund", externalReference: "r", deltaCents: -40, reason: "refund" }];
  await expect(recordAtrAdjustment({ ...input, ...change })).rejects.toThrow("conflicting adjustment retry");
  expect(state.insert).not.toHaveBeenCalled();
 });
 it("includes earlier chargebacks when bounding a refund", async () => {
  state.adjustments = [{ adjustmentType: "chargeback", externalReference: "c", deltaCents: -70, reason: "chargeback" }];
  await expect(recordAtrAdjustment(input)).rejects.toThrow("exceeds available allocation");
  expect(state.insert).not.toHaveBeenCalled();
 });
 it("allows reversing exactly the remaining balance", async () => {
  state.adjustments = [{ adjustmentType: "chargeback", externalReference: "c", deltaCents: -60, reason: "chargeback" }];
  expect((await recordAtrAdjustment(input)).idempotent).toBe(false);
 });
 it.each([{ allocationId: " " }, { externalReference: " " }, { reason: " " }, { deltaCents: 0 }, { deltaCents: 1.5 }])("rejects invalid input before opening a transaction", async change => {
  await expect(recordAtrAdjustment({ ...input, ...change })).rejects.toThrow("Invalid ATR adjustment");
  expect(state.transaction).not.toHaveBeenCalled();
 });
 it("rejects positive refunds", async () => {
  await expect(recordAtrAdjustment({ ...input, deltaCents: 40 })).rejects.toThrow("Reversal must be negative");
  expect(state.transaction).not.toHaveBeenCalled();
 });
});
