import { exportArqdorRecovery, importArqdorRecovery } from "./arqdorRecoveryPackage";
import type { DraftScope, LocalDraft } from "./arqdorEncryptedDraft";

/** Produces an encrypted portable copy and verifies it can be decrypted. */
export async function verifyRecoveryRoundTrip(
  draft: LocalDraft, scope: DraftScope, passphrase: string,
) {
  const encrypted = await exportArqdorRecovery(draft, scope, passphrase);
  const restored = await importArqdorRecovery(encrypted, scope, passphrase);
  if (JSON.stringify(restored) !== JSON.stringify(draft)) {
    throw new Error("RECOVERY_VERIFICATION_FAILED");
  }
  return encrypted;
}
