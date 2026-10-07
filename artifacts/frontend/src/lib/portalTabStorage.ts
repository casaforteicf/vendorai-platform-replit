/**
 * Stable, obra-keyed localStorage helpers for the client portal tab preference.
 *
 * The tab preference is stored under a key that is tied to the obra ID (not the
 * share token), so the choice survives link regeneration.  When a client opens
 * the portal for the first time with a new token we migrate any value stored
 * under the old token-keyed entry to the obra-keyed entry, then remove the
 * token-keyed entry so it does not accumulate indefinitely.
 */

export const TAB_VALUES = ["dados", "executivo", "cronograma", "medicoes", "propostas", "diario", "galeria", "projetos", "contratos", "documentos", "manuais", "notas", "compras", "financeiro", "orcamento", "suporte", "chat"] as const;
export type TabId = (typeof TAB_VALUES)[number];

export const PORTAL_OBRA_PREFIX = "portal_tab_obra_";
const MAX_OBRA_KEYS = 10;

export function tokenStorageKey(token: string): string {
  return `portal_tab_${token}`;
}

export function obraStorageKey(obraId: string): string {
  return `${PORTAL_OBRA_PREFIX}${obraId}`;
}

export function isValidTab(value: string | null | undefined): value is TabId {
  return TAB_VALUES.includes(value as TabId);
}

/**
 * Read the tab preference for a given obra, merging any legacy token-keyed
 * value into the stable obra key in the process.
 *
 * Returns the resolved TabId (or null when no preference is stored yet).
 * Always removes the token-keyed entry after migration so it doesn't linger.
 */
export function resolveTabPreference(token: string, obraId: string): TabId | null {
  const OBRA_KEY = obraStorageKey(obraId);
  const TOKEN_KEY = tokenStorageKey(token);
  try {
    const obraValue = localStorage.getItem(OBRA_KEY);
    const tokenValue = localStorage.getItem(TOKEN_KEY);

    let resolved: TabId | null = null;

    if (isValidTab(obraValue)) {
      resolved = obraValue;
    } else if (isValidTab(tokenValue)) {
      localStorage.setItem(OBRA_KEY, tokenValue);
      resolved = tokenValue;
    }

    localStorage.removeItem(TOKEN_KEY);
    evictOldObraKeys(OBRA_KEY);

    return resolved;
  } catch {
    return null;
  }
}

/**
 * Persist the active tab under the most-stable key we currently have.
 * Pass `obraKey` once the fetch has resolved and the obra ID is known;
 * fall back to `tokenKey` during the brief window before the fetch completes.
 */
export function saveTabPreference(key: string, tab: TabId): void {
  try {
    localStorage.setItem(key, tab);
  } catch {
    /* localStorage may be unavailable (private browsing, storage quota) */
  }
}

function evictOldObraKeys(currentKey: string): void {
  try {
    const keys = Object.keys(localStorage).filter((k) =>
      k.startsWith(PORTAL_OBRA_PREFIX),
    );
    if (keys.length > MAX_OBRA_KEYS) {
      keys
        .filter((k) => k !== currentKey)
        .slice(0, keys.length - MAX_OBRA_KEYS)
        .forEach((k) => localStorage.removeItem(k));
    }
  } catch { /* ignore */ }
}
