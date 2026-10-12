import { describe, expect, it } from "vitest";
import { evaluateArqdorDraftSync, syncDecisionMessage } from "./arqdorDraftReconciliation";

const draft = {
  tenantId: "tenant-a", userId: "user-a", contextId: "context-a",
  projectId: "project-a", baseRevision: "rev-1",
};
const remote = { ...draft, revision: "rev-1", canEdit: true };

describe("MULTI-04 local draft reconciliation preflight", () => {
  it("accepts equal authorized revisions for preflight only", () => {
    expect(evaluateArqdorDraftSync(draft, remote)).toEqual({
      status: "ready", projectId: "project-a", expectedRevision: "rev-1",
    });
  });
  it("preserves local draft on revision disagreement", () => {
    const result = evaluateArqdorDraftSync(draft, { ...remote, revision: "rev-2" });
    expect(result.status).toBe("conflict");
    expect(syncDecisionMessage(result)).toContain("Preserve seu rascunho");
  });
  it("denies revoked edit rights", () => {
    expect(evaluateArqdorDraftSync(draft, { ...remote, canEdit: false })).toEqual({
      status: "denied", reason: "unauthorized",
    });
  });
  it.each(["tenantId", "userId", "contextId", "projectId"] as const)(
    "denies cross-scope access for %s", field => {
      expect(evaluateArqdorDraftSync(draft, { ...remote, [field]: "someone-else" })).toEqual({
        status: "denied", reason: "scope-mismatch",
      });
    },
  );
  it("denies missing revisions and ids", () => {
    expect(evaluateArqdorDraftSync(draft, { ...remote, revision: "" })).toEqual({
      status: "denied", reason: "invalid-revision",
    });
    expect(evaluateArqdorDraftSync({ ...draft, projectId: "" }, remote)).toEqual({
      status: "denied", reason: "scope-mismatch",
    });
  });
});
