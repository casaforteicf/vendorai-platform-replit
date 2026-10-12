import { describe, expect, it } from "vitest";
import { exportArqdorRecovery, importArqdorRecovery } from "./arqdorRecoveryPackage";
import type { DraftScope, LocalDraft } from "./arqdorEncryptedDraft";

const scope: DraftScope = { userId: "u1", tenantId: "tenant-1", projectId: "p1", contextId: "project:p1" };
const draft: LocalDraft = {
  scope,
  change: { operationId: "op1", projectId: "p1", baseRevision: "r1", kind: "geometry" },
  content: { walls: [{ id: "w1", length: 250 }] },
  savedAt: "2026-10-11T12:00:00.000Z",
};
const pass = "correto-forte-recovery-2026";

describe("MULTI-03.3 password-protected portable recovery", () => {
  it("roundtrips across independently derived session keys", async () => {
    const envelope = await exportArqdorRecovery(draft, scope, pass);
    expect(JSON.stringify(envelope)).not.toContain("walls");
    expect(await importArqdorRecovery(envelope, scope, pass)).toEqual(draft);
  });
  it("blocks wrong passphrase, modified payload and different tenant", async () => {
    const envelope = await exportArqdorRecovery(draft, scope, pass);
    await expect(importArqdorRecovery(envelope, scope, "senha-errada-longa")).rejects.toThrow();
    await expect(importArqdorRecovery({ ...envelope, ciphertext: envelope.ciphertext.map((x, i) => i === 0 ? x ^ 1 : x) }, scope, pass)).rejects.toThrow();
    await expect(importArqdorRecovery(envelope, { ...scope, tenantId: "tenant-2" }, pass)).rejects.toThrow("RECOVERY_SCOPE_DENIED");
  });
  it("never accepts weak recovery passphrases or incompatible package versions", async () => {
    await expect(exportArqdorRecovery(draft, scope, "short")).rejects.toThrow("RECOVERY_PASSPHRASE_TOO_SHORT");
    const envelope = await exportArqdorRecovery(draft, scope, pass);
    await expect(importArqdorRecovery({ ...envelope, version: 2 as 1 }, scope, pass)).rejects.toThrow("RECOVERY_INVALID_PACKAGE");
  });
});
