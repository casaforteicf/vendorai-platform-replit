import { describe, expect, it } from "vitest";
import { exportArqdorRecovery } from "./arqdorRecoveryPackage";
import { fingerprintConflictDraft, verifyConflictRecoveryFile } from "./arqdorVerifiedConflictFile";
import type { DraftScope, LocalDraft } from "./arqdorEncryptedDraft";

const scope: DraftScope = { userId: "u1", tenantId: "t1", projectId: "p1", contextId: "project:p1" };
const draft: LocalDraft = {
  scope, change: { operationId: "op1", projectId: "p1", baseRevision: "r1", kind: "geometry" },
  content: { rooms: [{ id: "room1", width: 4 }] }, savedAt: "2026-10-11T18:00:00Z",
};
const password = "senha-para-backup-seguro";
async function fixtures() {
  const backup = await exportArqdorRecovery(draft, scope, password);
  const content = JSON.stringify(backup);
  const identity = {
    projectId: "p1", localRevision: "r1", remoteRevision: "r2",
    snapshotFingerprint: await fingerprintConflictDraft(draft),
  };
  return { identity, file: { size: content.length, text: async () => content } };
}
describe("MULTI-04.16: verify user-selected conflict backup", () => {
  it("accepts only a decryptable matching saved file", async () => {
    const { file, identity } = await fixtures();
    const receipt = await verifyConflictRecoveryFile({ file, draft, authorizedScope: scope, identity, passphrase: password });
    expect(receipt.storage).toBe("encrypted-export");
    expect(receipt.snapshotFingerprint).toBe(identity.snapshotFingerprint);
  });
  it("rejects a different draft, project, revision or passphrase", async () => {
    const { file, identity } = await fixtures();
    const args = { file, draft, authorizedScope: scope, identity, passphrase: password };
    await expect(verifyConflictRecoveryFile({ ...args, draft: { ...draft, content: { rooms: [] } } })).rejects.toThrow();
    await expect(verifyConflictRecoveryFile({ ...args, identity: { ...identity, projectId: "p2" } })).rejects.toThrow();
    await expect(verifyConflictRecoveryFile({ ...args, identity: { ...identity, localRevision: "r3" } })).rejects.toThrow();
    await expect(verifyConflictRecoveryFile({ ...args, passphrase: "senha-incorreta-teste" })).rejects.toThrow();
  });
});
