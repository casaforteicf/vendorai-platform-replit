import { deriveArqdorRecoveryKey, type ArqdorRecoveryKeyDescriptor } from "./arqdorRecoveryKey";
import { encryptLocalDraft, decryptLocalDraft, type DraftScope, type LocalDraft, type EncryptedDraft } from "./arqdorEncryptedDraft";
import type { ProjectContinuity } from "./projectContinuity";

/** MULTI-09.3: only ciphertext and KDF salt ever reach IndexedDB. */
type StoredEnvelope = { descriptor: ArqdorRecoveryKeyDescriptor; encrypted: EncryptedDraft };
const DB_NAME = "vendorai-arqdor-encrypted-drafts-v1";
const STORE = "envelopes";
function keyOf(scope: DraftScope): string {
  const values = [scope.tenantId, scope.userId, scope.contextId, scope.projectId];
  if (values.some(v => !v || typeof v !== "string")) throw new Error("OFFLINE_SCOPE_DENIED");
  return JSON.stringify(values);
}
function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Cannot open encrypted drafts"));
    request.onblocked = () => reject(new Error("Draft database blocked"));
  });
}
async function inStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore, finish: (result: T) => void) => void): Promise<T> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    let value: T;
    let completed = false;
    tx.oncomplete = () => { db.close(); completed ? resolve(value) : reject(new Error("Incomplete draft transaction")); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Draft transaction aborted")); };
    try { operation(tx.objectStore(STORE), v => { value = v; completed = true; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}
async function readEnvelope(scope: DraftScope): Promise<StoredEnvelope | undefined> {
  const id = keyOf(scope);
  return inStore("readonly", (store, finish) => {
    const request = store.get(id);
    request.onsuccess = () => finish(request.result as StoredEnvelope | undefined);
  });
}
/** Call only after current server authorization; neither key nor phrase is persisted. */
export async function storeEncryptedArqdorDraft(
  draft: LocalDraft, authorized: DraftScope, current: ProjectContinuity, passphrase: string,
): Promise<void> {
  const id = keyOf(authorized);
  // Reuse salt only if an envelope exists; never silently rotate a recovery
  // phrase while keeping the previous draft unreadable.
  const previous = await readEnvelope(authorized);
  const { key, descriptor } = await deriveArqdorRecoveryKey(passphrase, previous?.descriptor);
  const encrypted = await encryptLocalDraft(draft, authorized, current, key);
  await inStore<void>("readwrite", (store, finish) => {
    const request = store.put({ descriptor, encrypted } satisfies StoredEnvelope, id);
    request.onsuccess = () => finish(undefined);
  });
}
/**
 * Reauthorization MUST be performed by the caller before invoking this method.
 * Decryption never uploads or overwrites server content.
 */
export async function openEncryptedArqdorDraft(authorized: DraftScope, passphrase: string): Promise<LocalDraft | undefined> {
  const record = await readEnvelope(authorized);
  if (!record) return undefined;
  const { key } = await deriveArqdorRecoveryKey(passphrase, record.descriptor);
  return decryptLocalDraft(record.encrypted, authorized, key);
}
export async function discardEncryptedArqdorDraft(authorized: DraftScope): Promise<void> {
  const id = keyOf(authorized);
  await inStore<void>("readwrite", (store, finish) => {
    const request = store.delete(id);
    request.onsuccess = () => finish(undefined);
  });
}
