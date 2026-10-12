import { describe, expect, it } from "vitest";
import { exportArqdorRecovery } from "./arqdorRecoveryPackage";
import { verifySelectedRecoveryFile } from "./arqdorSavedRecoveryVerifier";
import type { DraftScope, LocalDraft } from "./arqdorEncryptedDraft";

const scope: DraftScope = { userId: "u1", tenantId: "t1", projectId: "p1", contextId: "project:p1" };
const draft: LocalDraft = {
  scope,
  change: { operationId: "op1", projectId: "p1", baseRevision: "revision1", kind: "geometry" },
  content: { rooms: [{ id: "r1", width: 4 }] },
  savedAt: "2026-10-11T18:00:00Z",
};
const passphrase = "senha-segura-de-teste";
describe("MULTI-04.15 selected saved-file verification", () => {
  it("reads and verifies the exact encrypted draft", async () => {
    const envelope = await exportArqdorRecovery(draft, scope, passphrase);
    const text = JSON.stringify(envelope);
    await expect(verifySelectedRecoveryFile({ size: text.length, text: async () => text }, draft, scope, passphrase)).resolves.toBeUndefined();
  });
  it("rejects different local changes", async () => {
    const envelope = await exportArqdorRecovery(draft, scope, passphrase);
    const text = JSON.stringify(envelope);
    await expect(verifySelectedRecoveryFile({ size: text.length, text: async () => text },
      { ...draft, content: { rooms: [{ id: "r1", width: 5 }] } }, scope, passphrase)).rejects.toThrow("RECOVERY_FILE_DOES_NOT_MATCH_LOCAL_DRAFT");
  });
  it("rejects an oversized or empty file", async () => {
    await expect(verifySelectedRecoveryFile({ size: 0, text: async () => "" }, draft, scope, passphrase)).rejects.toThrow();
  });
});
