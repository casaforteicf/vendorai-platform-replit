/**
 * MULTI-04.12: backup receipt gate. A confirmation checkbox is NOT a backup.
 * Only an integration-supplied verification callback may produce this receipt.
 * This module never trusts a user-entered boolean or retries a remote overwrite.
 */
export type ConflictBackupIdentity = {
  projectId: string;
  localRevision: string;
  remoteRevision: string;
  snapshotFingerprint: string;
};
export type VerifiedConflictBackupReceipt = ConflictBackupIdentity & {
  verifiedAt: string;
  storage: "encrypted-export" | "encrypted-indexeddb";
};
export function backupReceiptMatches(
  expected: ConflictBackupIdentity,
  receipt: VerifiedConflictBackupReceipt | null,
): boolean {
  return !!receipt &&
    Object.keys(expected).every(key =>
      receipt[key as keyof ConflictBackupIdentity] === expected[key as keyof ConflictBackupIdentity]) &&
    Number.isFinite(Date.parse(receipt.verifiedAt)) &&
    (receipt.storage === "encrypted-export" || receipt.storage === "encrypted-indexeddb");
}
