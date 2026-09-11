import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, RefreshCw, Trash2 } from "lucide-react";
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
        .config-live-catalog { display: grid; gap: .65rem; width: 100%; margin: .15rem 0 .9rem; }
        .config-live-catalog__title { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: .35rem .75rem; }
        .config-live-catalog__title > strong { font-size: .9rem; color: hsl(var(--foreground)); }
        .config-live-catalog__count { font-size: .72rem; color: hsl(var(--muted-foreground)); }
        .config-live-catalog__source { display: flex; flex-wrap: wrap; align-items: center; gap: .45rem .65rem; padding: .7rem .8rem; border: 1px solid hsl(var(--border)); border-radius: .65rem; background: hsl(var(--muted) / .32); }
        .config-live-catalog__source-copy { display: grid; gap: .12rem; flex: 1 1 26rem; min-width: 0; }
        .config-live-catalog__source-copy strong { font-size: .78rem; }
        .config-live-catalog__source-copy span { font-size: .72rem; line-height: 1.35; color: hsl(var(--muted-foreground)); }
        .config-live-catalog__actions { display: flex; flex-wrap: wrap; gap: .4rem; margin-left: auto; }
        .config-live-catalog__action { display: inline-flex; align-items: center; justify-content: center; gap: .35rem; min-height: 2rem; padding: .38rem .6rem; border: 1px solid hsl(var(--border)); border-radius: .5rem; background: hsl(var(--background)); font-size: .7rem; font-weight: 600; }
        .config-live-catalog__action:hover { background: hsl(var(--muted) / .55); }
        .config-live-catalog__action:disabled { opacity: .55; cursor: wait; }
        .config-live-catalog__list { overflow: hidden; border: 1px solid hsl(var(--border)); border-radius: .7rem; background: hsl(var(--background)); }
        .config-live-catalog__row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: .6rem .8rem; align-items: center; padding: .68rem .75rem; }
        .config-live-catalog__row + .config-live-catalog__row { border-top: 1px solid hsl(var(--border)); }
        .config-live-catalog__product { display: grid; gap: .18rem; min-width: 0; }
        .config-live-catalog__product-head { display: flex; flex-wrap: wrap; align-items: center; gap: .32rem .45rem; }
        .config-live-catalog__product-name { font-size: .8rem; font-weight: 650; color: hsl(var(--foreground)); }
        .config-live-catalog__badge { display: inline-flex; align-items: center; min-height: 1.15rem; padding: .08rem .38rem; border-radius: 999px; background: hsl(var(--muted)); font-size: .61rem; font-weight: 650; color: hsl(var(--muted-foreground)); }
        .config-live-catalog__badge.is-active { background: hsl(142 70% 45% / .1); color: hsl(142 55% 34%); }
        .config-live-catalog__description { font-size: .68rem; line-height: 1.35; color: hsl(var(--muted-foreground)); }
        .config-live-catalog__meta { display: flex; flex-wrap: wrap; gap: .3rem .6rem; font-size: .67rem; color: hsl(var(--muted-foreground)); }
        .config-live-catalog__price { font-weight: 600; color: hsl(var(--foreground)); }
        .config-live-catalog__delete { display: inline-flex; align-items: center; justify-content: center; width: 2rem; height: 2rem; border-radius: .5rem; color: hsl(var(--muted-foreground)); }
        .config-live-catalog__delete:hover { background: hsl(0 75% 55% / .1); color: hsl(0 68% 45%); }
        .config-live-catalog__delete:disabled { opacity: .45; cursor: wait; }
        .config-live-catalog__state { padding: .9rem .8rem; text-align: center; font-size: .74rem; color: hsl(var(--muted-foreground)); }
        .config-live-catalog__error { padding: .65rem .75rem; border: 1px solid hsl(0 70% 50% / .28); border-radius: .6rem; background: hsl(0 70% 50% / .07); font-size: .72rem; line-height: 1.35; color: hsl(0 55% 40%); }
        @media (max-width: 640px) {
          .config-live-catalog__source { align-items: stretch; }
          .config-live-catalog__actions { width: 100%; margin-left: 0; }
          .config-live-catalog__action { flex: 1 1 auto; }
          .config-live-catalog__row { grid-template-columns: minmax(0, 1fr) auto; }
        }
      `}</style>

      <div className="config-live-catalog__title">
        <strong>Produtos e Serviços</strong>
        <span className="config-live-catalog__count">
          {loading ? "Carregando..." : `${products.length} cadastrados · ${activeCount} ativos`}
        </span>
      </div>

      <div className="config-live-catalog__source">
        <div className="config-live-catalog__source-copy">
          <strong>Fonte oficial: Catálogo</strong>
          <span>Esta lista é carregada diretamente do Catálogo. Excluir aqui exclui o item do Catálogo oficial; não existe mais uma segunda lista de produtos nas Configurações.</span>
        </div>
        <div className="config-live-catalog__actions">
          <button type="button" className="config-live-catalog__action" onClick={() => void loadProducts()} disabled={loading}>
            <RefreshCw size={13} /> Atualizar lista
          </button>
          <a className="config-live-catalog__action" href="/catalogo">
            <ExternalLink size={13} /> Abrir Catálogo
          </a>
        </div>
      </div>

      {error && <div className="config-live-catalog__error" role="alert">{error}</div>}

      <div className="config-live-catalog__list">
        {loading && products.length === 0 ? (
          <div className="config-live-catalog__state">Carregando todos os produtos e serviços do Catálogo...</div>
        ) : products.length === 0 ? (
          <div className="config-live-catalog__state">Nenhum produto ou serviço cadastrado no Catálogo.</div>
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
                <Trash2 size={15} />
              </button>
            </div>
          ))
        )}
      </div>
    </section>,
    mountNode,
  );
}
