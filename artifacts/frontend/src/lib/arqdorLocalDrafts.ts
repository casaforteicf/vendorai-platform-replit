/**
 * MULTI-03: IndexedDB draft vault prototype. NOT connected to Arqdor autosave.
 * Local-only, explicit caller-controlled access: never makes authorization claims.
 * Avoids Cache Storage, service workers, tokens, or automatic network upload.
 */
export interface ArqdorLocalDraft {
  tenantId: string;
  userId: string;
  contextId: string;
  projectId: string;
  baseRevision: string;
  savedAt: string;
  payload: unknown;
}
const DB_NAME = "vendorai-arqdor-local-drafts-v1";
const STORE = "drafts";
const VERSION = 1;
const nonempty = (s: string) => typeof s === "string" && s.trim().length > 0;
function keyOf(d: Pick<ArqdorLocalDraft, "tenantId" | "userId" | "contextId" | "projectId">): string {
  const parts = [d.tenantId, d.userId, d.contextId, d.projectId];
  if (!parts.every(nonempty)) throw new Error("Missing project isolation identifiers");
  return JSON.stringify(parts);
}
function dbOpen(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Unable to open draft storage"));
    req.onblocked = () => reject(new Error("Draft storage upgrade blocked"));
  });
}
async function transaction<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore, done: (v: T) => void) => void): Promise<T> {
  const db = await dbOpen();
  return new Promise((resolve, reject) => {
    let result: T;
    let assigned = false;
    const tx = db.transaction(STORE, mode);
    tx.oncomplete = () => { db.close(); if (assigned) resolve(result); else reject(new Error("Draft transaction returned no value")); };
    tx.onabort = () => { db.close(); reject(tx.error ?? new Error("Draft transaction aborted")); };
    tx.onerror = () => { /* onabort resolves failure */ };
    try { action(tx.objectStore(STORE), value => { result = value; assigned = true; }); }
    catch (e) { tx.abort(); reject(e); }
  });
}
/** Only call after fresh server authorization of the exact tenant/user/project/context. */
export function saveArqdorDraft(draft: ArqdorLocalDraft): Promise<void> {
  if (!nonempty(draft.baseRevision) || !nonempty(draft.savedAt)) return Promise.reject(new Error("Missing revision metadata"));
  const key = keyOf(draft);
  // IDB structured clone rejects non-cloneable payloads; transaction aborts on failure.
  return transaction<void>("readwrite", (store, done) => {
    const req = store.put(draft, key);
    req.onsuccess = () => done(undefined);
  });
}
/** The caller must verify session and membership before exposing the draft. */
export function loadArqdorDraft(scope: Pick<ArqdorLocalDraft, "tenantId" | "userId" | "contextId" | "projectId">): Promise<ArqdorLocalDraft | undefined> {
  const key = keyOf(scope);
  return transaction<ArqdorLocalDraft | undefined>("readonly", (store, done) => {
    const req = store.get(key);
    req.onsuccess = () => done(req.result as ArqdorLocalDraft | undefined);
  });
}
/** Removes a single scoped draft only; does not clear drafts from other projects or users. */
export function deleteArqdorDraft(scope: Pick<ArqdorLocalDraft, "tenantId" | "userId" | "contextId" | "projectId">): Promise<void> {
  const key = keyOf(scope);
  return transaction<void>("readwrite", (store, done) => {
    const req = store.delete(key);
    req.onsuccess = () => done(undefined);
  });
}
