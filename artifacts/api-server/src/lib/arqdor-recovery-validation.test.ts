import { describe, expect, it } from "vitest";
import { restoreConceptPayloadSchema } from "./arqdor-recovery-validation";

const valid = {
  operationId: "c1b457df-5e21-45c1-8578-d71b1d420527",
  expectedUpdatedAt: "2026-10-11T12:00:00.000Z",
  confirm: "RESTORE_REVIEWED_GEOMETRY",
  rooms: [{ id: "room1", label: "Sala", kind: "sala", x: 1, y: 1, width: 4, depth: 5, floor: 0 }],
  openingOverrides: { window1: { x: 3, y: 2, type: "window" } },
};
describe("MULTI-04.3 strict restore schema", () => {
  it("accepts a valid geometry-only project request", () => {
    expect(restoreConceptPayloadSchema.safeParse(valid).success).toBe(true);
  });
  it("rejects hidden server-owned updates and unexpected properties", () => {
    expect(restoreConceptPayloadSchema.safeParse({ ...valid, status: "submitted" }).success).toBe(false);
    expect(restoreConceptPayloadSchema.safeParse({
      ...valid, rooms: [{ ...valid.rooms[0], tenantId: "other" }],
    }).success).toBe(false);
    expect(restoreConceptPayloadSchema.safeParse({
      ...valid, openingOverrides: { window1: { x: 1, y: 2, type: "window", ownerUserId: "other" } },
    }).success).toBe(false);
  });
  it("requires explicit confirmation, revision and bounded dimensions", () => {
    expect(restoreConceptPayloadSchema.safeParse({ ...valid, confirm: "yes" }).success).toBe(false);
    expect(restoreConceptPayloadSchema.safeParse({ ...valid, rooms: [{ ...valid.rooms[0], width: 1e20 }] }).success).toBe(false);
  });
});
