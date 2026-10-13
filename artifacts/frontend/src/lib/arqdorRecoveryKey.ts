/**
 * MULTI-09.2: derive a non-extractable AES-GCM key from a user-supplied recovery
 * passphrase. Store only the random salt with the encrypted envelope; never
 * persist the passphrase or key, and never derive the key from a JWT.
 *
 * This helper is NOT enabled by the editor. It must be paired with a user
 * unlock/reauthorization flow and the existing arqdorEncryptedDraft.ts codec.
 */
const KEY_ITERATIONS = 310_000;
const encoder = new TextEncoder();
export interface ArqdorRecoveryKeyDescriptor {
  version: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: number[];
}
export async function deriveArqdorRecoveryKey(
  passphrase: string,
  descriptor?: ArqdorRecoveryKeyDescriptor,
): Promise<{ key: CryptoKey; descriptor: ArqdorRecoveryKeyDescriptor }> {
  if (!globalThis.crypto?.subtle || !globalThis.crypto.getRandomValues) throw new Error("Secure WebCrypto unavailable");
  if (typeof passphrase !== "string" || passphrase.length < 12) throw new Error("Recovery phrase must contain at least 12 characters");
  if (descriptor && (descriptor.version !== 1 || descriptor.kdf !== "PBKDF2-SHA256" ||
      descriptor.iterations !== KEY_ITERATIONS || descriptor.salt.length !== 16 ||
      descriptor.salt.some(n => !Number.isInteger(n) || n < 0 || n > 255))) {
    throw new Error("Invalid key derivation descriptor");
  }
  const metadata: ArqdorRecoveryKeyDescriptor = descriptor ?? {
    version: 1, kdf: "PBKDF2-SHA256", iterations: KEY_ITERATIONS,
    salt: Array.from(crypto.getRandomValues(new Uint8Array(16))),
  };
  const material = await crypto.subtle.importKey(
    "raw", encoder.encode(passphrase), "PBKDF2", false, ["deriveKey"],
  );
  const key = await crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", iterations: metadata.iterations, salt: new Uint8Array(metadata.salt) },
    material, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"],
  );
  return { key, descriptor: metadata };
}
