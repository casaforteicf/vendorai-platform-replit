import { describe, expect, it } from "vitest";
import { backupReceiptMatches } from "./arqdorConflictBackupGate";
const identity = { projectId: "p1", localRevision: "r1", remoteRevision: "r2", snapshotFingerprint: "hash-1" };
const receipt = { ...identity, verifiedAt: "2026-10-11T20:00:00Z", storage: "encrypted-indexeddb" as const };
describe("MULTI-04.12 conflict backup gate", () => {
  it("requires an explicit receipt", () => {
    expect(backupReceiptMatches(identity, null)).toBe(false);
    expect(backupReceiptMatches(identity, receipt)).toBe(true);
  });
  it("rejects receipts for other revisions, projects or local snapshots", () => {
    expect(backupReceiptMatches({ ...identity, remoteRevision: "r3" }, receipt)).toBe(false);
    expect(backupReceiptMatches({ ...identity, projectId: "p2" }, receipt)).toBe(false);
    expect(backupReceiptMatches({ ...identity, snapshotFingerprint: "hash-2" }, receipt)).toBe(false);
  });
  it("rejects malformed timestamps and unsupported storage", () => {
    expect(backupReceiptMatches(identity, { ...receipt, verifiedAt: "not-a-date" })).toBe(false);
    expect(backupReceiptMatches(identity, { ...receipt, storage: "checkbox" as "encrypted-indexeddb" })).toBe(false);
  });
});
