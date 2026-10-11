/** Serialize photo writes across tabs without storing auth tokens or cross-tab payloads. */
export async function withPhotoTabLock<T>(key: string, task: () => Promise<T>): Promise<T> {
  if (!key || !navigator.locks?.request) {
    throw new Error("Bloqueio entre abas indisponível neste navegador. Use uma única aba para sincronizar.");
  }
  return navigator.locks.request("arqdor-measure-photo:" + key, { mode: "exclusive" }, task);
}
