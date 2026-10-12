import { evaluateOfflineUpload, type LocalChange, type ProjectContinuity } from "./projectContinuity";

/**
 * MULTI-03: local encrypted drafts, opt-in only. Never used as authentication,
 * membership verification or a sync engine. Caller must supply an authorized
 * session-bound non-extractable AES-GCM CryptoKey; do NOT persist this key.
 * Losing that key makes drafts unreadable (intended secure fail-closed).
 */
export type DraftScope = { userId: string; tenantId: string; projectId: string; contextId: string };
export type LocalDraft = {
  scope: DraftScope;
  change: LocalChange;
  content: unknown;
  savedAt: string;
};
export type EncryptedDraft = {
  version: 1;
  scope: DraftScope;
  operationId: string;
  iv: number[];
  ciphertext: number[];
};
export function validateDraft(draft: LocalDraft, authorized: DraftScope, current: ProjectContinuity): void {
  const scope = draft.scope;
  if (!scope.userId || !scope.tenantId || !scope.projectId || !scope.contextId ||
      Object.keys(authorized).some(key => scope[key as keyof DraftScope] !== authorized[key as keyof DraftScope])) {
    throw new Error("OFFLINE_SCOPE_DENIED");
  }
  if (!draft.change.operationId || draft.change.projectId !== scope.projectId ||
      current.projectId !== scope.projectId || current.contextId !== scope.contextId ||
      evaluateOfflineUpload(draft.change, current) !== "eligible") {
    throw new Error("OFFLINE_REVISION_NOT_CURRENT");
  }
  if (!Number.isFinite(Date.parse(draft.savedAt))) throw new Error("OFFLINE_INVALID_TIMESTAMP");
}
function aad(scope: DraftScope, operationId: string): Uint8Array {
  return new TextEncoder().encode(JSON.stringify([scope.userId, scope.tenantId, scope.projectId, scope.contextId, operationId, 1]));
}
export async function encryptLocalDraft(
  draft: LocalDraft, authorized: DraftScope, current: ProjectContinuity, key: CryptoKey,
): Promise<EncryptedDraft> {
  validateDraft(draft, authorized, current);
  if (key.algorithm.name !== "AES-GCM" || !key.usages.includes("encrypt")) throw new Error("OFFLINE_INVALID_KEY");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new TextEncoder().encode(JSON.stringify(draft));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad(draft.scope, draft.change.operationId) }, key, bytes,
  );
  return { version: 1, scope: { ...draft.scope }, operationId: draft.change.operationId,
    iv: Array.from(iv), ciphertext: Array.from(new Uint8Array(ciphertext)) };
}
export async function decryptLocalDraft(
  encrypted: EncryptedDraft, authorized: DraftScope, key: CryptoKey,
): Promise<LocalDraft> {
  if (encrypted.version !== 1 || encrypted.iv.length !== 12 ||
      Object.keys(authorized).some(k => encrypted.scope[k as keyof DraftScope] !== authorized[k as keyof DraftScope])) {
    throw new Error("OFFLINE_SCOPE_DENIED");
  }
  if (key.algorithm.name !== "AES-GCM" || !key.usages.includes("decrypt")) throw new Error("OFFLINE_INVALID_KEY");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(encrypted.iv),
      additionalData: aad(encrypted.scope, encrypted.operationId) }, key, new Uint8Array(encrypted.ciphertext),
  );
  const draft = JSON.parse(new TextDecoder().decode(decrypted)) as LocalDraft;
  if (draft.change.operationId !== encrypted.operationId ||
      Object.keys(authorized).some(k => draft.scope[k as keyof DraftScope] !== authorized[k as keyof DraftScope])) {
    throw new Error("OFFLINE_SCOPE_DENIED");
  }
  return draft;
}
/** Explicit reconciliation gate; NEVER pushes changes to remote endpoints. */
export function localDraftUploadStatus(draft: LocalDraft, remote: ProjectContinuity) {
  return evaluateOfflineUpload(draft.change, remote);
}
