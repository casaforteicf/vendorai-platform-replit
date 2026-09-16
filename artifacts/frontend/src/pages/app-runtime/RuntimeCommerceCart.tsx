import { useEffect, useMemo, useState } from "react";
import { Loader2, Minus, PackageOpen, Plus, ShoppingBag, Trash2 } from "lucide-react";
import {
  RUNTIME_CART_EVENT,
  readRuntimeCart,
  setRuntimeCartQuantity,
  type RuntimeCartItem,
} from "./runtimeCommerceState";

type JsonObject = Record<string, unknown>;

type CatalogProduct = {
  id: string;
  name: string;
  sku?: string | null;
  imageUrl?: string | null;
  basePrice?: string | number | null;
  promotionalPrice?: string | number | null;
  promotionEndsAt?: string | null;
  available?: boolean;
  controlsStock?: boolean;
  stockQuantity?: number | null;
};

type CatalogPayload = { items?: CatalogProduct[] };

type Props = { appId: string; lang: "pt" | "es" };

const COPY = {
  pt: {
    empty: "Seu carrinho está vazio.",
    unavailable: "Não foi possível validar o carrinho no catálogo agora.",
    total: "Total",
    checkout: "Gerar checkout",
    checkoutPending: "O checkout será gerado automaticamente ao confirmar a compra assim que a integração de pagamento deste app estiver habilitada.",
    unavailableItem: "Item indisponível",
    noSku: "Produto sem SKU não pode seguir para checkout.",
  },
  es: {
    empty: "Tu carrito está vacío.",
    unavailable: "No fue posible validar el carrito con el catálogo ahora.",
    total: "Total",
    checkout: "Generar checkout",
    checkoutPending: "El checkout se generará automáticamente al confirmar la compra cuando la integración de pago de esta app esté habilitada.",
    unavailableItem: "Producto no disponible",
    noSku: "Un producto sin SKU no puede continuar al checkout.",
  },
} as const;

function sessionStorageKey(appId: string) {
  return `vendorai:app-user-session:${appId}`;
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function promotionActive(product: CatalogProduct) {
  const price = numberValue(product.promotionalPrice);
  if (price === null) return false;
  if (!product.promotionEndsAt) return true;
  const end = new Date(product.promotionEndsAt).getTime();
  return Number.isFinite(end) && end >= Date.now();
}

function currentPrice(product?: CatalogProduct) {
  if (!product) return null;
  return numberValue(promotionActive(product) ? product.promotionalPrice : product.basePrice);
}

function money(value: number, lang: "pt" | "es") {
  return new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "es-AR", {
    style: "currency",
    currency: "BRL",
  }).format(value);
}

function safeData(value: unknown): CatalogPayload {
  return value && typeof value === "object" && !Array.isArray(value) ? value as CatalogPayload : {};
}

export default function RuntimeCommerceCart({ appId, lang }: Props) {
  const copy = COPY[lang];
  const [items, setItems] = useState<RuntimeCartItem[]>(() => readRuntimeCart(appId));
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setItems(readRuntimeCart(appId));
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ appId?: string }>).detail;
      if (!detail?.appId || detail.appId === appId) setItems(readRuntimeCart(appId));
    };
    window.addEventListener(RUNTIME_CART_EVENT, handler);
    return () => window.removeEventListener(RUNTIME_CART_EVENT, handler);
  }, [appId]);

  useEffect(() => {
    if (appId.startsWith("preview-")) {
      setLoading(false);
      return;
    }
    const token = window.localStorage.getItem(sessionStorageKey(appId));
    if (!token) {
      setLoading(false);
      return;
    }
    let alive = true;
    void (async () => {
      setLoading(true);
      setFailed(false);
      try {
        const response = await fetch(`/api/app-runtime/apps/${encodeURIComponent(appId)}/data/catalog.products`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        });
        if (!response.ok) throw new Error("catalog_unavailable");
        const payload = await response.json() as JsonObject;
        const data = safeData(payload.data);
        if (alive) setCatalog(Array.isArray(data.items) ? data.items : []);
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [appId]);

  const catalogById = useMemo(() => new Map(catalog.map((product) => [product.id, product])), [catalog]);
  const rows = useMemo(() => items.map((item) => {
    const product = catalogById.get(item.productId);
    const price = currentPrice(product);
    return {
      item,
      product,
      price,
      lineTotal: price === null ? null : price * item.quantity,
      available: product?.available !== false,
    };
  }), [catalogById, items]);

  const total = rows.reduce((sum, row) => sum + (row.lineTotal ?? 0), 0);
  const checkoutBlocked = rows.some((row) => !row.available || !row.item.sku || row.price === null);

  if (loading && items.length > 0) {
    return <section className="rounded-2xl border bg-white p-8 text-center shadow-sm"><Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" /></section>;
  }

  if (items.length === 0) {
    return <section className="rounded-2xl border border-dashed bg-white p-10 text-center text-sm text-slate-500"><ShoppingBag className="mx-auto mb-3 h-7 w-7 text-slate-400" />{copy.empty}</section>;
  }

  return (
    <section className="space-y-4">
      {failed && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">{copy.unavailable}</div>}

      <div className="space-y-3">
        {rows.map(({ item, product, price, lineTotal, available }) => (
          <article key={item.productId} className="flex gap-3 rounded-2xl border bg-white p-3 shadow-sm sm:p-4">
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-slate-50">
              {(product?.imageUrl || item.imageUrl) ? <img src={product?.imageUrl || item.imageUrl || ""} alt="" className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center"><PackageOpen className="h-6 w-6 text-slate-300" /></div>}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-slate-900">{product?.name || item.name}</h3>
                  <p className="mt-0.5 text-[11px] text-slate-400">SKU {item.sku || "—"}</p>
                </div>
                <button type="button" onClick={() => setRuntimeCartQuantity(appId, item.productId, 0)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              </div>

              {!available && <p className="mt-1 text-xs font-semibold text-rose-600">{copy.unavailableItem}</p>}
              {!item.sku && <p className="mt-1 text-xs font-semibold text-amber-700">{copy.noSku}</p>}

              <div className="mt-3 flex items-end justify-between gap-3">
                <div className="inline-flex items-center rounded-xl border bg-slate-50 p-1">
                  <button type="button" onClick={() => setRuntimeCartQuantity(appId, item.productId, item.quantity - 1)} className="rounded-lg p-1.5 text-slate-600 hover:bg-white"><Minus className="h-3.5 w-3.5" /></button>
                  <span className="min-w-8 text-center text-sm font-semibold text-slate-800">{item.quantity}</span>
                  <button type="button" onClick={() => setRuntimeCartQuantity(appId, item.productId, item.quantity + 1)} className="rounded-lg p-1.5 text-slate-600 hover:bg-white"><Plus className="h-3.5 w-3.5" /></button>
                </div>
                <div className="text-right">
                  {price !== null && <p className="text-xs text-slate-400">{money(price, lang)} / un.</p>}
                  <p className="text-sm font-bold text-slate-950">{lineTotal === null ? "—" : money(lineTotal, lang)}</p>
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>

      <div className="sticky bottom-24 rounded-2xl border bg-white p-4 shadow-lg sm:static sm:shadow-sm">
        <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">{copy.total}</span><strong className="text-xl text-slate-950">{money(total, lang)}</strong></div>
        <button type="button" disabled className="mt-4 flex h-12 w-full items-center justify-center rounded-xl text-sm font-bold text-white opacity-60" style={{ backgroundColor: "var(--app-runtime-primary, #0f172a)" }}>{copy.checkout}</button>
        <p className={`mt-2 text-xs leading-5 ${checkoutBlocked ? "text-amber-700" : "text-slate-500"}`}>{copy.checkoutPending}</p>
      </div>
    </section>
  );
}
