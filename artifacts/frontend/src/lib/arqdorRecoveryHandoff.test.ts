import { describe, expect, it, vi } from "vitest";
import { checkRecoveryAtHandoff } from "./arqdorRecoveryHandoff";
import type { DraftScope, LocalDraft } from "./arqdorEncryptedDraft";

const scope: DraftScope = { userId: "user", tenantId: "tenant", projectId: "project", contextId: "ctx" };
const draft: LocalDraft = {
  scope,
  change: { operationId: "operation", projectId: "project", baseRevision: "rev1", kind: "geometry" },
  savedAt: "2026-10-11T12:00:00Z",
  content: {},
};
const current = { projectId: "project", contextId: "ctx", revision: "rev1", capabilities: [] };
describe("MULTI-03.6 fresh backend validation", () => {
  it("calls the authorized server reader before allowing review", async () => {
    const read = vi.fn().mockResolvedValue(current);
    expect((await checkRecoveryAtHandoff(draft, scope, read)).status).toBe("review");
    expect(read).toHaveBeenCalledOnce();
  });
  it("blocks a concurrent revision update", async () => {
    const result = await checkRecoveryAtHandoff(draft, scope, async () => ({ ...current, revision: "rev2" }));
    expect(result.status).toBe("conflict");
  });
  it("fails closed when unauthorized or offline", async () => {
    expect((await checkRecoveryAtHandoff(draft, scope, async () => { throw new Error("403"); })).status).toBe("denied");
    expect((await checkRecoveryAtHandoff(draft, scope, async () => ({ ...current, revision: "" }))).status).toBe("denied");
  });
});
