import { decryptLocalDraft, encryptLocalDraft, type DraftScope, type EncryptedDraft, type LocalDraft } from "./arqdorEncryptedDraft";
import type { ProjectContinuity } from "./projectContinuity";

/**
 * MULTI-03: IndexedDB persistence for encrypted Arqdor drafts.
 * Scope must be verified by server-backed session BEFORE these functions run.
 * The encryption key is supplied by the active session; never stored here.
 * No network access, background sync, credential cache or auto-upload.
 */
const DATABASE_NAME = "vendorai-arqdor-drafts-v1";
const STORE = "encrypted-drafts";
const VERSION = 1;

function scopeKey(scope: DraftScope, operationId: string): string {
  return JSON.stringify([scope.userId, scope.tenantId, scope.projectId, scope.contextId, operationId]);
}
function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("OFFLINE_STORAGE_UNAVAILABLE"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("OFFLINE_DB_OPEN_FAILED"));
    request.onblocked = () => reject(new Error("OFFLINE_DB_BLOCKED"));
  });
}
async function withStore<T>(
  mode: IDBTransactionMode,
  work: (store: IDBObjectStore, done: (result: T) => void) => void,
): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      let result: T;
      const transaction = db.transaction(STORE, mode);
      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error ?? new Error("OFFLINE_DB_TRANSACTION_FAILED"));
      transaction.onabort = () => reject(transaction.error ?? new Error("OFFLINE_DB_ABORTED"));
      try { work(transaction.objectStore(STORE), value => { result = value; }); }
      catch (error) { transaction.abort(); reject(error); }
    });
  } finally {
    db.close();
  }
}
/** Each operation is immutable in identity: same operationId may be overwritten only within same scope. */
export async function saveEncryptedArqdorDraft(
  draft: LocalDraft, authorized: DraftScope, current: ProjectContinuity, key: CryptoKey,
): Promise<void> {
  const encrypted = await encryptLocalDraft(draft, authorized, current, key);
  await withStore<void>("readwrite", store => {
    store.put(encrypted, scopeKey(encrypted.scope, encrypted.operationId));
  });
}
export async function readEncryptedArqdorDraft(
  authorized: DraftScope, operationId: string, key: CryptoKey,
): Promise<LocalDraft | null> {
  if (!operationId || Object.values(authorized).some(v => !v)) throw new Error("OFFLINE_SCOPE_DENIED");
  const encrypted = await withStore<EncryptedDraft | undefined>("readonly", (store, done) => {
    const request = store.get(scopeKey(authorized, operationId));
    request.onsuccess = () => done(request.result as EncryptedDraft | undefined);
  });
  if (!encrypted) return null;
  return decryptLocalDraft(encrypted, authorized, key);
}
/** Forget a draft after a verified server acknowledgement, or explicit user deletion. */
export async function deleteEncryptedArqdorDraft(
  authorized: DraftScope, operationId: string,
): Promise<void> {
  if (!operationId || Object.values(authorized).some(v => !v)) throw new Error("OFFLINE_SCOPE_DENIED");
  await withStore<void>("readwrite", store => {
    store.delete(scopeKey(authorized, operationId));
  });
}
/** Scoped list returns IDs only. No plaintext leaves the encrypted store. */
export async function listEncryptedArqdorDraftIds(authorized: DraftScope): Promise<string[]> {
  if (Object.values(authorized).some(v => !v)) throw new Error("OFFLINE_SCOPE_DENIED");
  const prefix = JSON.stringify([authorized.userId, authorized.tenantId, authorized.projectId, authorized.contextId]).slice(0, -1) + ",";
  return withStore<string[]>("readonly", (store, done) => {
    const ids: string[] = [];
    const request = store.openKeyCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { done(ids); return; }
      const rawKey = String(cursor.key);
      if (rawKey.startsWith(prefix)) {
        try {
          const segments = JSON.parse(rawKey) as string[];
          if (segments.length === 5 && typeof segments[4] === "string") ids.push(segments[4]);
        } catch { /* do not expose malformed entries */ }
      }
      cursor.continue();
    };
  });
}
