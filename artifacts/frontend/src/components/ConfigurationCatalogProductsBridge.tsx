import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ExternalLink, RefreshCw, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

type CatalogProduct = {
  id: string;
  nome: string;
  descricao?: string | null;
  precoBase?: string | number | null;
  ativo?: boolean;
  categoriaNome?: string | null;
};

function formatPrice(value: CatalogProduct["precoBase"]): string {
  if (value === null || value === undefined || value === "") return "Preço não informado";
  const numeric = typeof value === "number" ? value : Number(String(value).replace(",", "."));
  if (!Number.isFinite(numeric)) return "Preço não informado";
  return numeric.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function ConfigurationCatalogProductsBridge() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(false);

  const authHeaders = useCallback(() => ({
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    "Content-Type": "application/json",
  }), []);

  const loadProducts = useCallback(async () => {
    if (!tenantId) {
      setProducts([]);
      setError("Não foi possível identificar a empresa atual.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${encodeURIComponent(tenantId)}/produtos-catalogo`, {
        headers: authHeaders(),
        credentials: "include",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      const data = await response.json() as CatalogProduct[];
      setProducts(Array.isArray(data) ? data : []);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Erro desconhecido";
      setError(`Não foi possível carregar o Catálogo: ${message}`);
    } finally {
      setLoading(false);
    }
  }, [authHeaders, tenantId]);

  useEffect(() => {
    let currentLegacyBlock: HTMLElement | null = null;
    let currentHost: HTMLElement | null = null;

    const install = () => {
      if (currentHost?.isConnected) return;
      const root = document.querySelector<HTMLElement>(".vendor-config-without-site");
      if (!root) return;

      const heading = Array.from(root.querySelectorAll<HTMLElement>("h2, h3, h4, label")).find((element) => {
        const text = element.textContent?.replace(/\s+/g, " ").trim();
        return text === "Produtos e Serviços" || text === "Produtos e Serviços — referência legada";
      });
      if (!heading) return;

      const legacyBlock = heading.closest<HTMLElement>(".space-y-2") ?? heading.parentElement;
      if (!legacyBlock) return;

      const existingHost = legacyBlock.parentElement?.querySelector<HTMLElement>("[data-live-catalog-products-host='true']");
      if (existingHost) {
        currentLegacyBlock = legacyBlock;
        currentHost = existingHost;
        legacyBlock.hidden = true;
        legacyBlock.setAttribute("aria-hidden", "true");
        setMountNode(existingHost);
        return;
      }

      const host = document.createElement("div");
      host.dataset.liveCatalogProductsHost = "true";
      legacyBlock.insertAdjacentElement("beforebegin", host);
      legacyBlock.hidden = true;
      legacyBlock.setAttribute("aria-hidden", "true");
      legacyBlock.dataset.replacedByLiveCatalog = "true";

      currentLegacyBlock = legacyBlock;
      currentHost = host;
      setMountNode(host);
    };

    install();
    const root = document.querySelector<HTMLElement>(".vendor-config-without-site");
    const observer = new MutationObserver(install);
    if (root) observer.observe(root, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (currentLegacyBlock?.dataset.replacedByLiveCatalog === "true") {
        currentLegacyBlock.hidden = false;
        currentLegacyBlock.removeAttribute("aria-hidden");
        delete currentLegacyBlock.dataset.replacedByLiveCatalog;
      }
      currentHost?.remove();
    };
  }, []);

  useEffect(() => {
    if (mountNode) void loadProducts();
  }, [loadProducts, mountNode]);

  const deleteProduct = useCallback(async (product: CatalogProduct) => {
    const confirmed = window.confirm(
      `Excluir “${product.nome}” do Catálogo oficial?\n\nEsta ação remove o item do cadastro principal e pode afetar propostas, vendas, automações e integrações que usam este produto/serviço.`,
    );
    if (!confirmed) return;

    setDeletingId(product.id);
    setError(null);
    try {
      const response = await fetch(`/api/produtos-catalogo/${encodeURIComponent(product.id)}`, {
        method: "DELETE",
        headers: authHeaders(),
        credentials: "include",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || `HTTP ${response.status}`);
      }
      setProducts((current) => current.filter((item) => item.id !== product.id));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Erro desconhecido";
      setError(`Não foi possível excluir “${product.nome}”: ${message}`);
    } finally {
      setDeletingId(null);
    }
  }, [authHeaders]);

  const activeCount = useMemo(() => products.filter((product) => product.ativo !== false).length, [products]);

  if (!mountNode) return null;

  return createPortal(
    <section className="config-live-catalog" aria-label="Produtos e serviços do Catálogo">
      <style>{`
        .vendor-settings-compact > section,
        .vendor-settings-compact > details {
          max-width: none !important;
          width: 100% !important;
          padding-left: 0 !important;
          padding-right: 0 !important;
        }

        .vendor-settings-compact,
        .vendor-settings-compact button,
        .vendor-settings-compact input,
        .vendor-settings-compact textarea,
        .vendor-settings-compact select {
          font-family: inherit !important;
        }

        .vendor-settings-compact .vendor-config-without-site {
          width: 100% !important;
          max-width: none !important;
          font-size: .76rem !important;
          line-height: 1.32 !important;
        }

        .vendor-settings-compact .vendor-config-without-site h1 {
          font-size: .95rem !important;
          line-height: 1.3 !important;
          font-weight: 650 !important;
        }
        .vendor-settings-compact .vendor-config-without-site h2,
        .vendor-settings-compact .vendor-config-without-site h3,
        .vendor-settings-compact .vendor-config-without-site h4 {
          font-size: .8rem !important;
          line-height: 1.3 !important;
          font-weight: 650 !important;
        }
        .vendor-settings-compact .vendor-config-without-site label,
        .vendor-settings-compact .vendor-config-without-site .text-sm {
          font-size: .7rem !important;
          line-height: 1.32 !important;
        }
        .vendor-settings-compact .vendor-config-without-site .text-xs,
        .vendor-settings-compact .vendor-config-without-site p {
          font-size: .66rem !important;
          line-height: 1.34 !important;
        }
        .vendor-settings-compact .vendor-config-without-site [role="tab"] {
          min-height: 2rem !important;
          padding-top: .35rem !important;
          padding-bottom: .35rem !important;
          font-size: .7rem !important;
          font-weight: 500 !important;
        }
        .vendor-settings-compact .vendor-config-without-site input:not([type="checkbox"]):not([type="radio"]),
        .vendor-settings-compact .vendor-config-without-site select {
          min-height: 2rem !important;
          height: 2rem !important;
          padding-top: .35rem !important;
          padding-bottom: .35rem !important;
          font-size: .72rem !important;
        }
        .vendor-settings-compact .vendor-config-without-site textarea {
          min-height: 4.25rem !important;
          padding-top: .45rem !important;
          padding-bottom: .45rem !important;
          font-size: .72rem !important;
          line-height: 1.35 !important;
        }
        .vendor-settings-compact .vendor-config-without-site button {
          font-size: .68rem !important;
        }
        .vendor-settings-compact .vendor-config-without-site .p-6 { padding: .9rem !important; }
        .vendor-settings-compact .vendor-config-without-site .p-5 { padding: .85rem !important; }
        .vendor-settings-compact .vendor-config-without-site .p-4 { padding: .75rem !important; }
        .vendor-settings-compact .vendor-config-without-site .space-y-6 > :not([hidden]) ~ :not([hidden]) { margin-top: .8rem !important; }
        .vendor-settings-compact .vendor-config-without-site .space-y-5 > :not([hidden]) ~ :not([hidden]) { margin-top: .72rem !important; }
        .vendor-settings-compact .vendor-config-without-site .space-y-4 > :not([hidden]) ~ :not([hidden]) { margin-top: .65rem !important; }
        .vendor-settings-compact .vendor-config-without-site .space-y-3 > :not([hidden]) ~ :not([hidden]) { margin-top: .55rem !important; }
        .vendor-settings-compact .vendor-config-without-site .gap-6 { gap: 1rem !important; }
        .vendor-settings-compact .vendor-config-without-site .gap-4 { gap: .75rem !important; }
        .vendor-settings-compact .vendor-config-without-site .gap-3 { gap: .6rem !important; }

        .config-live-catalog {
          display: grid;
          gap: .5rem;
          width: 100%;
          margin: .1rem 0 .7rem;
          font-family: inherit;
        }
        .config-live-catalog__toggle {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: .75rem;
          padding: .62rem .72rem;
          border: 1px solid hsl(var(--border));
          border-radius: .65rem;
          background: hsl(var(--background));
          text-align: left;
          transition: background-color 140ms ease;
        }
        .config-live-catalog__toggle:hover { background: hsl(var(--muted) / .35); }
        .config-live-catalog__title-copy { display: grid; gap: .1rem; min-width: 0; }
        .config-live-catalog__title-copy strong { font-size: .78rem; line-height: 1.25; color: hsl(var(--foreground)); }
        .config-live-catalog__count { font-size: .66rem; line-height: 1.25; color: hsl(var(--muted-foreground)); }
        .config-live-catalog__chevron { flex: 0 0 auto; transition: transform 140ms ease; }
        .config-live-catalog__chevron.is-open { transform: rotate(180deg); }
        .config-live-catalog__source {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: .4rem .6rem;
          padding: .58rem .7rem;
          border: 1px solid hsl(var(--border));
          border-radius: .6rem;
          background: hsl(var(--muted) / .26);
        }
        .config-live-catalog__source-copy { display: grid; gap: .08rem; flex: 1 1 24rem; min-width: 0; }
        .config-live-catalog__source-copy strong { font-size: .7rem; line-height: 1.25; }
        .config-live-catalog__source-copy span { font-size: .64rem; line-height: 1.3; color: hsl(var(--muted-foreground)); }
        .config-live-catalog__actions { display: flex; flex-wrap: wrap; gap: .35rem; margin-left: auto; }
        .config-live-catalog__action {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: .3rem;
          min-height: 1.9rem;
          padding: .32rem .55rem;
          border: 1px solid hsl(var(--border));
          border-radius: .48rem;
          background: hsl(var(--background));
          font-size: .65rem;
          font-weight: 600;
        }
        .config-live-catalog__action:hover { background: hsl(var(--muted) / .55); }
        .config-live-catalog__action:disabled { opacity: .55; cursor: wait; }
        .config-live-catalog__list { overflow: hidden; border: 1px solid hsl(var(--border)); border-radius: .65rem; background: hsl(var(--background)); }
        .config-live-catalog__row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .5rem .7rem; align-items: center; padding: .56rem .68rem; }
        .config-live-catalog__row + .config-live-catalog__row { border-top: 1px solid hsl(var(--border)); }
        .config-live-catalog__product { display: grid; gap: .12rem; min-width: 0; }
        .config-live-catalog__product-head { display: flex; flex-wrap: wrap; align-items: center; gap: .25rem .38rem; }
        .config-live-catalog__product-name { font-size: .72rem; font-weight: 650; color: hsl(var(--foreground)); }
        .config-live-catalog__badge { display: inline-flex; align-items: center; min-height: 1.05rem; padding: .06rem .34rem; border-radius: 999px; background: hsl(var(--muted)); font-size: .57rem; font-weight: 650; color: hsl(var(--muted-foreground)); }
        .config-live-catalog__badge.is-active { background: hsl(142 70% 45% / .1); color: hsl(142 55% 34%); }
        .config-live-catalog__description { font-size: .62rem; line-height: 1.3; color: hsl(var(--muted-foreground)); }
        .config-live-catalog__meta { display: flex; flex-wrap: wrap; gap: .25rem .5rem; font-size: .61rem; color: hsl(var(--muted-foreground)); }
        .config-live-catalog__price { font-weight: 600; color: hsl(var(--foreground)); }
        .config-live-catalog__delete { display: inline-flex; align-items: center; justify-content: center; width: 1.85rem; height: 1.85rem; border-radius: .45rem; color: hsl(var(--muted-foreground)); }
        .config-live-catalog__delete:hover { background: hsl(0 75% 55% / .1); color: hsl(0 68% 45%); }
        .config-live-catalog__delete:disabled { opacity: .45; cursor: wait; }
        .config-live-catalog__state { padding: .72rem; text-align: center; font-size: .66rem; color: hsl(var(--muted-foreground)); }
        .config-live-catalog__error { padding: .55rem .65rem; border: 1px solid hsl(0 70% 50% / .28); border-radius: .55rem; background: hsl(0 70% 50% / .07); font-size: .66rem; line-height: 1.3; color: hsl(0 55% 40%); }
        @media (max-width: 640px) {
          .config-live-catalog__source { align-items: stretch; }
          .config-live-catalog__actions { width: 100%; margin-left: 0; }
          .config-live-catalog__action { flex: 1 1 auto; }
          .config-live-catalog__row { grid-template-columns: minmax(0, 1fr) auto; }
        }
      `}</style>

      <button
        type="button"
        className="config-live-catalog__toggle"
        aria-expanded={listOpen}
        onClick={() => setListOpen((current) => !current)}
      >
        <span className="config-live-catalog__title-copy">
          <strong>Produtos e Serviços</strong>
          <span className="config-live-catalog__count">
            {loading ? "Carregando..." : `${products.length} cadastrados · ${activeCount} ativos`}
          </span>
        </span>
        <ChevronDown size={15} className={`config-live-catalog__chevron ${listOpen ? "is-open" : ""}`} />
      </button>

      <div className="config-live-catalog__source">
        <div className="config-live-catalog__source-copy">
          <strong>Fonte oficial: Catálogo</strong>
          <span>Produtos, preços, estoque e imagens são administrados no Catálogo.</span>
        </div>
        <div className="config-live-catalog__actions">
          <button type="button" className="config-live-catalog__action" onClick={() => void loadProducts()} disabled={loading}>
            <RefreshCw size={12} /> Atualizar
          </button>
          <a className="config-live-catalog__action" href="/catalogo">
            <ExternalLink size={12} /> Abrir Catálogo
          </a>
        </div>
      </div>

      {error && <div className="config-live-catalog__error" role="alert">{error}</div>}

      {listOpen && (
        <div className="config-live-catalog__list">
          {loading && products.length === 0 ? (
            <div className="config-live-catalog__state">Carregando produtos e serviços...</div>
          ) : products.length === 0 ? (
            <div className="config-live-catalog__state">Nenhum produto ou serviço cadastrado.</div>
          ) : (
            products.map((product) => (
              <div className="config-live-catalog__row" key={product.id}>
                <div className="config-live-catalog__product">
                  <div className="config-live-catalog__product-head">
                    <span className="config-live-catalog__product-name">{product.nome}</span>
                    <span className={`config-live-catalog__badge ${product.ativo !== false ? "is-active" : ""}`}>
                      {product.ativo !== false ? "Ativo" : "Inativo"}
                    </span>
                    {product.categoriaNome && <span className="config-live-catalog__badge">{product.categoriaNome}</span>}
                  </div>
                  {product.descricao && <span className="config-live-catalog__description">{product.descricao}</span>}
                  <div className="config-live-catalog__meta">
                    <span className="config-live-catalog__price">{formatPrice(product.precoBase)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="config-live-catalog__delete"
                  aria-label={`Excluir ${product.nome} do Catálogo`}
                  title="Excluir do Catálogo oficial"
                  disabled={deletingId === product.id}
                  onClick={() => void deleteProduct(product)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </section>,
    mountNode,
  );
}
