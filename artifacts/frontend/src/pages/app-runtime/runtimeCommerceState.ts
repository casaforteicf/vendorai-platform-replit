export type RuntimeCartItem = {
  productId: string;
  sku: string;
  name: string;
  imageUrl?: string | null;
  quantity: number;
};

export const RUNTIME_CART_EVENT = "vendorai:runtime-cart-changed";

function storageKey(appId: string) {
  return `vendorai:app-runtime-cart:${appId}`;
}

function checkoutStorageKey(appId: string) {
  return `vendorai:app-runtime-checkout-key:${appId}`;
}

function cartFingerprint(items: RuntimeCartItem[]) {
  return JSON.stringify(
    [...items]
      .map((item) => ({ sku: item.sku, quantity: item.quantity }))
      .sort((a, b) => a.sku.localeCompare(b.sku)),
  );
}

export function readRuntimeCart(appId: string): RuntimeCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey(appId)) ?? "[]") as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return [];
      const item = row as Partial<RuntimeCartItem>;
      const productId = typeof item.productId === "string" ? item.productId.trim() : "";
      const sku = typeof item.sku === "string" ? item.sku.trim() : "";
      const name = typeof item.name === "string" ? item.name.trim() : "";
      const quantity = Number(item.quantity);
      if (!productId || !sku || !name || !Number.isInteger(quantity) || quantity < 1) return [];
      return [{ productId, sku, name, imageUrl: typeof item.imageUrl === "string" ? item.imageUrl : null, quantity: Math.min(99, quantity) }];
    }).slice(0, 50);
  } catch {
    return [];
  }
}

export function writeRuntimeCart(appId: string, items: RuntimeCartItem[]) {
  if (typeof window === "undefined") return;
  const safe = items
    .filter((item) => item.productId && item.sku && item.name && item.quantity > 0)
    .map((item) => ({ ...item, quantity: Math.min(99, Math.max(1, Math.floor(item.quantity))) }))
    .slice(0, 50);
  window.localStorage.setItem(storageKey(appId), JSON.stringify(safe));
  window.dispatchEvent(new CustomEvent(RUNTIME_CART_EVENT, { detail: { appId, items: safe } }));
}

export function addRuntimeCartItem(appId: string, item: Omit<RuntimeCartItem, "quantity">, quantity = 1) {
  const current = readRuntimeCart(appId);
  const existing = current.find((row) => row.productId === item.productId);
  if (existing) {
    existing.quantity = Math.min(99, existing.quantity + Math.max(1, Math.floor(quantity)));
    existing.name = item.name;
    existing.sku = item.sku;
    existing.imageUrl = item.imageUrl ?? existing.imageUrl;
  } else {
    current.push({ ...item, quantity: Math.min(99, Math.max(1, Math.floor(quantity))) });
  }
  writeRuntimeCart(appId, current);
}

export function setRuntimeCartQuantity(appId: string, productId: string, quantity: number) {
  const current = readRuntimeCart(appId);
  if (quantity <= 0) {
    writeRuntimeCart(appId, current.filter((item) => item.productId !== productId));
    return;
  }
  writeRuntimeCart(appId, current.map((item) => item.productId === productId ? { ...item, quantity: Math.min(99, Math.max(1, Math.floor(quantity))) } : item));
}

export function clearRuntimeCart(appId: string) {
  writeRuntimeCart(appId, []);
  clearRuntimeCheckoutIdempotencyKey(appId);
}

export function getRuntimeCheckoutIdempotencyKey(appId: string, items: RuntimeCartItem[]) {
  if (typeof window === "undefined") return `checkout-${Date.now()}`;
  const fingerprint = cartFingerprint(items);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(checkoutStorageKey(appId)) ?? "null") as { fingerprint?: string; key?: string } | null;
    if (parsed?.fingerprint === fingerprint && typeof parsed.key === "string" && parsed.key.length >= 8) {
      return parsed.key;
    }
  } catch {
    // A nova chave abaixo substitui qualquer valor inválido.
  }

  const key = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `checkout-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(checkoutStorageKey(appId), JSON.stringify({ fingerprint, key }));
  return key;
}

export function clearRuntimeCheckoutIdempotencyKey(appId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(checkoutStorageKey(appId));
}
