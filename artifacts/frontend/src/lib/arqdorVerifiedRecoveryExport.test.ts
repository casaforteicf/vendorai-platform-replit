import { describe, expect, it } from "vitest";
import { verifyRecoveryRoundTrip } from "./arqdorVerifiedRecoveryExport";
import type { DraftScope, LocalDraft } from "./arqdorEncryptedDraft";

const scope: DraftScope = { userId: "u1", tenantId: "t1", projectId: "p1", contextId: "project:p1" };
const draft: LocalDraft = {
  scope, change: { operationId: "o1", projectId: "p1", baseRevision: "r1", kind: "geometry" },
  content: { rooms: [{ id: "r1", width: 5 }] }, savedAt: "2026-10-11T18:00:00Z",
};
describe("MULTI-04.13 verified recovery payload", () => {
  it("encrypts and checks a reversible package before offering it for export", async () => {
    const result = await verifyRecoveryRoundTrip(draft, scope, "senha-de-recuperacao-forte");
    expect(result.format).toBe("vendorai-arqdor-recovery");
    expect(JSON.stringify(result)).not.toContain("rooms");
  });
  it("rejects a scope from another tenant", async () => {
    await expect(verifyRecoveryRoundTrip(draft, { ...scope, tenantId: "t2" }, "senha-de-recuperacao-forte")).rejects.toThrow();
  });
});
