import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const MASTER_KEY = process.env["MASTER_ENCRYPTION_KEY"];

function getKey(): Buffer {
  if (!MASTER_KEY) throw new Error("MASTER_ENCRYPTION_KEY not configured");
  return scryptSync(MASTER_KEY, "vendorai-salt", 32);
}

/**
 * Encrypt a string using AES-256-GCM.
 * Returns "iv:authTag:ciphertext" as base64, colon-separated.
 */
export function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(text, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${encrypted.toString("base64")}`;
}

/**
 * Decrypt a string encrypted with encrypt().
 * Input format: "iv:authTag:ciphertext" as base64, colon-separated.
 */
export function decrypt(encryptedText: string): string {
  const [ivB64, authTagB64, ciphertextB64] = encryptedText.split(":");
  if (!ivB64 || !authTagB64 || !ciphertextB64) {
    throw new Error("Invalid encrypted format");
  }
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
