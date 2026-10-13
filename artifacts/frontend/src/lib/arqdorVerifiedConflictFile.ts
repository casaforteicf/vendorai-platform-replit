import type { DraftScope, LocalDraft } from "./arqdorEncryptedDraft";
import { verifySelectedRecoveryFile } from "./arqdorSavedRecoveryVerifier";
import type { ConflictBackupIdentity, VerifiedConflictBackupReceipt } from "./arqdorConflictBackupGate";

export async function fingerprintConflictDraft(draft: LocalDraft): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(draft));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Receipt only after reopening the user-selected encrypted file with its passphrase. */
export async function verifyConflictRecoveryFile(input: {
  file: Pick<File, "size" | "text">;
  draft: LocalDraft;
  authorizedScope: DraftScope;
  identity: ConflictBackupIdentity;
  passphrase: string;
}): Promise<VerifiedConflictBackupReceipt> {
  const { draft, authorizedScope, identity } = input;
  if (identity.projectId !== authorizedScope.projectId ||
      identity.projectId !== draft.scope.projectId ||
      identity.localRevision !== draft.change.baseRevision) {
    throw new Error("CONFLICT_BACKUP_SCOPE_MISMATCH");
  }
  const calculated = await fingerprintConflictDraft(draft);
  if (calculated !== identity.snapshotFingerprint) throw new Error("CONFLICT_BACKUP_FINGERPRINT_MISMATCH");
  await verifySelectedRecoveryFile(input.file, draft, authorizedScope, input.passphrase);
  return { ...identity, storage: "encrypted-export", verifiedAt: new Date().toISOString() };
}
