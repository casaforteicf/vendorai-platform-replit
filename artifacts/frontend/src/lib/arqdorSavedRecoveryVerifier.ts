import { importArqdorRecovery, type ArqdorRecoveryEnvelope } from "./arqdorRecoveryPackage";
import type { DraftScope, LocalDraft } from "./arqdorEncryptedDraft";

/** Independently checks a user-selected file against the unsaved local draft.
 * A successful check proves the selected bytes are decryptable and match;
 * it does not guarantee the file remains stored or that another device has a copy.
 */
export async function verifySelectedRecoveryFile(
  file: Pick<File, "size" | "text">,
  expected: LocalDraft,
  scope: DraftScope,
  passphrase: string,
): Promise<void> {
  if (file.size <= 0 || file.size > 20 * 1024 * 1024) throw new Error("RECOVERY_FILE_SIZE_INVALID");
  const packageData = JSON.parse(await file.text()) as ArqdorRecoveryEnvelope;
  const recovered = await importArqdorRecovery(packageData, scope, passphrase);
  if (JSON.stringify(recovered) !== JSON.stringify(expected)) {
    throw new Error("RECOVERY_FILE_DOES_NOT_MATCH_LOCAL_DRAFT");
  }
}
