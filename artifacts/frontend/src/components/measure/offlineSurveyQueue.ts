import type { SurveyElement } from "./SurveyElementsEditor";

type PendingSurvey = { key: string; items: SurveyElement[]; updatedAt: string; revisionId?: string };
const DB_NAME = "arqdor-measure-offline-v1";
const STORE = "pending-surveys";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("Armazenamento offline indisponível"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}
async function transact<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const request = fn(tx.objectStore(STORE));
    request.onerror = () => reject(request.error);
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => { const result = request.result; db.close(); resolve(result); };
  });
}
export async function readPendingSurvey(key: string): Promise<PendingSurvey | undefined> {
  return transact("readonly", store => store.get(key));
}
export async function queueSurvey(key: string, items: SurveyElement[]): Promise<string> {
  if (!key || items.length > 200) throw new Error("Levantamento inválido para armazenamento offline");
  const revisionId = crypto.randomUUID();
  await transact("readwrite", store => store.put({ key, items, updatedAt: new Date().toISOString(), revisionId }));
  return revisionId;
}
export async function clearPendingSurvey(key: string, expectedRevisionId?: string): Promise<boolean> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    let matched = false;
    const get = store.get(key);
    get.onsuccess = () => {
      const current = get.result as PendingSurvey | undefined;
      if (!current) { matched = true; return; }
      if (expectedRevisionId && current.revisionId !== expectedRevisionId) return;
      matched = true;
      store.delete(key);
    };
    tx.oncomplete = () => { db.close(); resolve(matched); };
    tx.onabort = () => { db.close(); reject(tx.error); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
