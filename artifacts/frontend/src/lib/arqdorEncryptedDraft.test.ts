import { describe, expect, it } from "vitest";
import { decryptLocalDraft, encryptLocalDraft, localDraftUploadStatus, type DraftScope, type LocalDraft } from "./arqdorEncryptedDraft";
import type { ProjectContinuity } from "./projectContinuity";

const scope: DraftScope = { userId: "u1", tenantId: "t1", projectId: "p1", contextId: "project:p1" };
const remote: ProjectContinuity = { projectId: "p1", contextId: "project:p1", revision: "r3", capabilities: ["studio_2d"] };
const draft: LocalDraft = { scope, change: { operationId: "op1", projectId: "p1", baseRevision: "r3", kind: "geometry" },
  savedAt: "2026-10-11T10:00:00.000Z", content: { walls: [{ id: "w1", length: 250 }] } };
const key = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);

describe("MULTI-03 encrypted Arqdor drafts", () => {
  it("round-trips only under the same authorized scope", async () => {
    const secret = await key();
    const stored = await encryptLocalDraft(draft, scope, remote, secret);
    expect(JSON.stringify(stored)).not.toContain("walls");
    expect(await decryptLocalDraft(stored, scope, secret)).toEqual(draft);
  });
  it("rejects cross-tenant access and tampering", async () => {
    const secret = await key();
    const stored = await encryptLocalDraft(draft, scope, remote, secret);
    await expect(decryptLocalDraft(stored, { ...scope, tenantId: "other" }, secret)).rejects.toThrow("OFFLINE_SCOPE_DENIED");
    await expect(decryptLocalDraft({ ...stored, operationId: "replaced" }, scope, secret)).rejects.toThrow();
  });
  it("rejects outdated source versions before encryption and upload", async () => {
    const secret = await key();
    const old = { ...draft, change: { ...draft.change, baseRevision: "r2" } };
    await expect(encryptLocalDraft(old, scope, remote, secret)).rejects.toThrow("OFFLINE_REVISION_NOT_CURRENT");
    expect(localDraftUploadStatus(old, remote)).toBe("conflict");
  });
});
