import { describe, expect, it } from "vitest";
import { evaluateRecoveryForReview } from "./arqdorRecoveryReview";
import type { DraftScope, LocalDraft } from "./arqdorEncryptedDraft";
const scope: DraftScope = { userId: "u1", tenantId: "t1", projectId: "p1", contextId: "project:p1" };
const draft: LocalDraft = { scope, savedAt: "2026-10-11T10:00:00Z", content: { walls: [] },
  change: { operationId: "op1", projectId: "p1", baseRevision: "r1", kind: "geometry" } };
const remote = { projectId: "p1", contextId: "project:p1", revision: "r1", capabilities: ["studio_2d"] as const };
describe("MULTI-03.5 recovery gate", () => {
  it("offers review only on matching revision and scope", () => {
    expect(evaluateRecoveryForReview(draft, scope, remote)).toEqual({ status: "review", operationId: "op1", revision: "r1" });
  });
  it("blocks overwrite on revision mismatch", () => {
    expect(evaluateRecoveryForReview(draft, scope, { ...remote, revision: "r2" })).toMatchObject({
      status: "conflict", localRevision: "r1", remoteRevision: "r2" });
  });
  it("rejects cross-tenant and cross-project recovery", () => {
    expect(evaluateRecoveryForReview(draft, { ...scope, tenantId: "other" }, remote).status).toBe("denied");
    expect(evaluateRecoveryForReview(draft, scope, { ...remote, projectId: "p2" }).status).toBe("denied");
  });
});
