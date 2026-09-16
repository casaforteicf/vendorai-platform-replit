import { useEffect, useMemo, useState } from "react";
import { Check, Loader2, PackageOpen, Search, ShoppingBag, X } from "lucide-react";
import { addRuntimeCartItem } from "./runtimeCommerceState";

type JsonObject = Record<string, unknown>;

type CatalogProduct = {
  id: string;
  name: string;
  sku?: string | null;
  brand?: string | null;
  description?: string | null;
  unit?: string | null;
  imageUrl?: string | null;
  basePrice?: string | number | null;
  promotionalPrice?: string | number | null;
  promotionEndsAt?: string | null;
  controlsStock?: boolean;
  stockQuantity?: number | null;
  available?: boolean;
  categoryId?: string | null;
  categoryName?: string | null;
  highlighted?: boolean;
  deliveryDays?: number | null;
};

type CatalogCategory = { id: string; name: string };
type CatalogPayload = { items?: CatalogProduct[]; categories?: CatalogCategory[]; total?: number };

type Props = {
  appId: string;
  lang: "pt" | "es";
};

const COPY = {
  pt: {
    search: "Buscar produtos",
    all: "Todos",
    empty: "Nenhum produto encontrado.",
    unavailable: "Catálogo indisponível neste momento.",
    inStock: "Disponível",
    outOfStock: "Indisponível",
    units: "un. em estoque",
    delivery: "Entrega em até",
    days: "dias",
    promo: "Oferta",
    details: "Ver detalhes",
    add: "Adicionar",
    added: "Adicionado",
    noSku: "Compra indisponível para este item",
  },
  es: {
    search: "Buscar productos",
    all: "Todos",
    empty: "No se encontraron productos.",
    unavailable: "Catálogo no disponible en este momento.",
    inStock: "Disponible",
    outOfStock: "No disponible",
    units: "un. en stock",
    delivery: "Entrega en hasta",
    days: "días",
    promo: "Oferta",
    details: "Ver detalles",
    add: "Agregar",
    added: "Agregado",
    noSku: "Compra no disponible para este producto",
  },
} as const;

function sessionStorageKey(appId: string) {
  return `vendorai:app-user-session:${appId}`;
}

function normalize(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    : "";
}

function numberValue(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function money(value: unknown, lang: "pt" | "es") {
  const numeric = numberValue(value);
  if (numeric === null) return "—";
  return new Intl.NumberFormat(lang === "pt" ? "pt-BR" : "es-AR", {
    style: "currency",
    currency: "BRL",
  }).format(numeric);
}

function activePromotion(product: CatalogProduct) {
  const promotional = numberValue(product.promotionalPrice);
  if (promotional === null) return false;
  if (!product.promotionEndsAt) return true;
  const end = new Date(product.promotionEndsAt).getTime();
  return Number.isFinite(end) && end >= Date.now();
}

function safeData(value: unknown): CatalogPayload {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as CatalogPayload;
}

export default function RuntimeCommerceCatalog({ appId, lang }: Props) {
  const copy = COPY[lang];
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("__all__");
  const [selectedProduct, setSelectedProduct] = useState<CatalogProduct | null>(null);
  const [addedProductId, setAddedProductId] = useState<string | null>(null);

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
        if (!alive) return;
        setProducts(Array.isArray(data.items) ? data.items : []);
        setCategories(Array.isArray(data.categories) ? data.categories : []);
      } catch {
        if (alive) setFailed(true);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [appId]);

  const filtered = useMemo(() => {
    const q = normalize(query);
    return products.filter((product) => {
      if (categoryId !== "__all__" && product.categoryId !== categoryId) return false;
      if (!q) return true;
      return [product.name, product.brand, product.sku, product.categoryName]
        .some((value) => normalize(value).includes(q));
    });
  }, [categoryId, products, query]);

  function addToCart(product: CatalogProduct) {
    if (product.available === false || !product.sku) return;
    addRuntimeCartItem(appId, {
      productId: product.id,
      sku: product.sku,
      name: product.name,
      imageUrl: product.imageUrl ?? null,
    });
    setAddedProductId(product.id);
    window.setTimeout(() => setAddedProductId((current) => current === product.id ? null : current), 1600);
  }

  if (loading) {
    return <section className="rounded-2xl border bg-white p-8 text-center shadow-sm"><Loader2 className="mx-auto h-6 w-6 animate-spin text-slate-400" /></section>;
  }

  if (failed) {
    return <section className="rounded-2xl border border-dashed bg-white p-7 text-center text-sm text-slate-500"><PackageOpen className="mx-auto mb-3 h-6 w-6 text-slate-400" />{copy.unavailable}</section>;
  }

  return (
    <section className="space-y-4">
      <div className="rounded-2xl border bg-white p-3 shadow-sm">
        <label className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
          <Search className="h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={copy.search}
            className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
          />
        </label>
      </div>

      {categories.length > 0 && (
        <div className="-mx-1 overflow-x-auto px-1 pb-1">
          <div className="flex min-w-max gap-2">
            <button type="button" onClick={() => setCategoryId("__all__")} className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${categoryId === "__all__" ? "border-transparent text-white" : "bg-white text-slate-600"}`} style={categoryId === "__all__" ? { backgroundColor: "var(--app-runtime-primary, #0f172a)" } : undefined}>{copy.all}</button>
            {categories.map((category) => <button key={category.id} type="button" onClick={() => setCategoryId(category.id)} className={`rounded-full border px-4 py-2 text-xs font-semibold transition ${categoryId === category.id ? "border-transparent text-white" : "bg-white text-slate-600"}`} style={categoryId === category.id ? { backgroundColor: "var(--app-runtime-primary, #0f172a)" } : undefined}>{category.name}</button>)}
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed bg-white p-8 text-center text-sm text-slate-500"><ShoppingBag className="mx-auto mb-3 h-6 w-6 text-slate-400" />{copy.empty}</div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {filtered.map((product) => {
            const promotional = activePromotion(product);
            const available = product.available !== false;
            const added = addedProductId === product.id;
            return (
              <article key={product.id} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                <button type="button" className="block w-full text-left" onClick={() => setSelectedProduct(product)}>
                  <div className="relative aspect-square bg-slate-50">
                    {product.imageUrl ? <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover" loading="lazy" /> : <div className="flex h-full items-center justify-center"><PackageOpen className="h-8 w-8 text-slate-300" /></div>}
                    {promotional && <span className="absolute left-2 top-2 rounded-full px-2 py-1 text-[10px] font-bold text-white" style={{ backgroundColor: "var(--app-runtime-primary, #0f172a)" }}>{copy.promo}</span>}
                  </div>
                  <div className="p-3 pb-1">
                    {product.categoryName && <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">{product.categoryName}</p>}
                    <h3 className="mt-1 line-clamp-2 min-h-10 text-sm font-semibold leading-5 text-slate-900">{product.name}</h3>
                    {product.brand && <p className="mt-1 truncate text-xs text-slate-400">{product.brand}</p>}
                    <div className="mt-3">
                      {promotional && <p className="text-[11px] text-slate-400 line-through">{money(product.basePrice, lang)}</p>}
                      <p className="text-base font-bold text-slate-950">{money(promotional ? product.promotionalPrice : product.basePrice, lang)}</p>
                    </div>
                    <div className="mt-3 border-t pt-2 text-[10px] leading-4">
                      <p className={available ? "font-semibold text-emerald-600" : "font-semibold text-rose-600"}>{available ? copy.inStock : copy.outOfStock}</p>
                      {available && product.controlsStock && typeof product.stockQuantity === "number" && <p className="text-slate-400">{product.stockQuantity} {copy.units}</p>}
                      {available && product.deliveryDays && <p className="text-slate-400">{copy.delivery} {product.deliveryDays} {copy.days}</p>}
                    </div>
                  </div>
                </button>
                <div className="p-3 pt-2">
                  <button type="button" onClick={() => addToCart(product)} disabled={!available || !product.sku} className="flex h-10 w-full items-center justify-center rounded-xl text-xs font-bold text-white transition disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500" style={available && product.sku ? { backgroundColor: "var(--app-runtime-primary, #0f172a)" } : undefined}>{added ? <><Check className="mr-1.5 h-4 w-4" />{copy.added}</> : available && product.sku ? copy.add : copy.noSku}</button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {selectedProduct && (
        <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/45 sm:items-center sm:justify-center sm:p-5" role="dialog" aria-modal="true">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:max-w-lg sm:rounded-3xl">
            <div className="sticky top-0 z-10 flex justify-end bg-white/95 p-3 backdrop-blur"><button type="button" onClick={() => setSelectedProduct(null)} className="rounded-full bg-slate-100 p-2 text-slate-600"><X className="h-5 w-5" /></button></div>
            <div className="px-5 pb-6 sm:px-6">
              <div className="overflow-hidden rounded-2xl bg-slate-50">
                {selectedProduct.imageUrl ? <img src={selectedProduct.imageUrl} alt={selectedProduct.name} className="aspect-square w-full object-cover" /> : <div className="flex aspect-square items-center justify-center"><PackageOpen className="h-12 w-12 text-slate-300" /></div>}
              </div>
              {selectedProduct.categoryName && <p className="mt-5 text-xs font-semibold uppercase tracking-wide text-slate-400">{selectedProduct.categoryName}</p>}
              <h2 className="mt-1 text-xl font-bold text-slate-950">{selectedProduct.name}</h2>
              {selectedProduct.brand && <p className="mt-1 text-sm text-slate-500">{selectedProduct.brand}</p>}
              {selectedProduct.description && <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-600">{selectedProduct.description}</p>}
              <div className="mt-5 flex items-end justify-between gap-3 border-t pt-4">
                <div>{activePromotion(selectedProduct) && <p className="text-xs text-slate-400 line-through">{money(selectedProduct.basePrice, lang)}</p>}<p className="text-2xl font-bold text-slate-950">{money(activePromotion(selectedProduct) ? selectedProduct.promotionalPrice : selectedProduct.basePrice, lang)}</p></div>
                <div className="text-right text-xs">{selectedProduct.available !== false ? <p className="font-semibold text-emerald-600">{copy.inStock}</p> : <p className="font-semibold text-rose-600">{copy.outOfStock}</p>}{selectedProduct.controlsStock && typeof selectedProduct.stockQuantity === "number" && <p className="text-slate-400">{selectedProduct.stockQuantity} {copy.units}</p>}</div>
              </div>
              <button type="button" onClick={() => addToCart(selectedProduct)} disabled={selectedProduct.available === false || !selectedProduct.sku} className="mt-5 flex h-12 w-full items-center justify-center rounded-xl text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500" style={selectedProduct.available !== false && selectedProduct.sku ? { backgroundColor: "var(--app-runtime-primary, #0f172a)" } : undefined}>{addedProductId === selectedProduct.id ? <><Check className="mr-2 h-4 w-4" />{copy.added}</> : selectedProduct.available !== false && selectedProduct.sku ? copy.add : copy.noSku}</button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
