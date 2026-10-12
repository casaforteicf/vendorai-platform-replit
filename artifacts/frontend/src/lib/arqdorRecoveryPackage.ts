import { type DraftScope, type LocalDraft } from "./arqdorEncryptedDraft";

/**
 * MULTI-03.3 — User-controlled encrypted recovery file.
 * This is not account recovery or cloud sync. Password is never persisted.
 * A saved export remains readable after the browser session key is destroyed,
 * provided the user retains BOTH the export and its recovery passphrase.
 */
export interface ArqdorRecoveryEnvelope {
  format: "vendorai-arqdor-recovery";
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: 310000;
  salt: number[];
  iv: number[];
  ciphertext: number[];
}
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const header = encoder.encode("vendorai-arqdor-recovery:v1");
function assertPassphrase(passphrase: string) {
  if (typeof passphrase !== "string" || passphrase.length < 12) {
    throw new Error("RECOVERY_PASSPHRASE_TOO_SHORT");
  }
}
function assertScope(draft: LocalDraft, expected: DraftScope) {
  if (Object.values(expected).some(v => !v) ||
      Object.keys(expected).some(k => draft.scope[k as keyof DraftScope] !== expected[k as keyof DraftScope]) ||
      draft.change.projectId !== expected.projectId || !draft.change.operationId || !draft.change.baseRevision) {
    throw new Error("RECOVERY_SCOPE_DENIED");
  }
}
async function derive(passphrase: string, salt: Uint8Array, usages: KeyUsage[]) {
  const material = await crypto.subtle.importKey("raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 310000, hash: "SHA-256" },
    material, { name: "AES-GCM", length: 256 }, false, usages,
  );
}
export async function exportArqdorRecovery(
  draft: LocalDraft, authorized: DraftScope, passphrase: string,
): Promise<ArqdorRecoveryEnvelope> {
  assertPassphrase(passphrase);
  assertScope(draft, authorized);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(passphrase, salt, ["encrypt"]);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: header },
    key, encoder.encode(JSON.stringify(draft)),
  );
  return {
    format: "vendorai-arqdor-recovery", version: 1, kdf: "PBKDF2-SHA256",
    iterations: 310000, salt: Array.from(salt), iv: Array.from(iv),
    ciphertext: Array.from(new Uint8Array(ciphertext)),
  };
}
export async function importArqdorRecovery(
  packageData: ArqdorRecoveryEnvelope, authorized: DraftScope, passphrase: string,
): Promise<LocalDraft> {
  assertPassphrase(passphrase);
  if (!packageData || packageData.format !== "vendorai-arqdor-recovery" ||
      packageData.version !== 1 || packageData.kdf !== "PBKDF2-SHA256" ||
      packageData.iterations !== 310000 || !Array.isArray(packageData.salt) ||
      !Array.isArray(packageData.iv) || !Array.isArray(packageData.ciphertext) ||
      packageData.salt.length !== 16 || packageData.iv.length !== 12 ||
      packageData.ciphertext.length < 16 ||
      [...packageData.salt, ...packageData.iv, ...packageData.ciphertext].some(n =>
        !Number.isInteger(n) || n < 0 || n > 255)) {
    throw new Error("RECOVERY_INVALID_PACKAGE");
  }
  const key = await derive(passphrase, new Uint8Array(packageData.salt), ["decrypt"]);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(packageData.iv), additionalData: header },
    key, new Uint8Array(packageData.ciphertext),
  );
  const draft = JSON.parse(decoder.decode(plaintext)) as LocalDraft;
  assertScope(draft, authorized);
  return draft; // caller must compare baseRevision with remote before applying
}
