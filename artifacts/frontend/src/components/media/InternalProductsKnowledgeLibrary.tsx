import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Package, Search, Sparkles, Wand2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";

type InternalProduct = {
  id: string;
  categoria: string;
  nome: string;
  descricaoUso: string;
  tipo: "servico" | "produto" | "oferta";
  nichosRelacionados?: string[] | null;
  ordem?: number | null;
  ativo?: boolean | null;
};

const TYPE_LABEL: Record<InternalProduct["tipo"], string> = {
  servico: "Serviço",
  produto: "Produto",
  oferta: "Oferta",
};

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function normalizedText(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function replaceFirstText(root: HTMLElement, from: string, to: string) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    if (normalizedText(node.textContent) === from) {
      node.textContent = to;
      return true;
    }
    node = walker.nextNode();
  }
  return false;
}

export default function InternalProductsKnowledgeLibrary() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isSuperAdmin = user?.platformRole === "super_admin";
  const [products, setProducts] = useState<InternalProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isSuperAdmin) {
      setProducts([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    fetch("/api/admin/produtos-internos", { headers: authHeaders(), cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Não foi possível carregar a linha de produtos Vendor.ai.");
        return response.json();
      })
      .then((body) => {
        if (cancelled) return;
        const next = Array.isArray(body)
          ? (body as InternalProduct[]).filter((product) => product.ativo !== false)
          : [];
        setProducts(next);
      })
      .catch((error) => {
        if (cancelled) return;
        setProducts([]);
        toast({
          title: "Linha de produtos indisponível",
          description: error instanceof Error ? error.message : "Tente novamente.",
          variant: "destructive",
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [isSuperAdmin, toast]);

  useEffect(() => {
    if (!isSuperAdmin) return;

    const injectButton = () => {
      const container = document.getElementById("biblioteca-midias");
      if (!container) return;
      if (container.querySelector<HTMLButtonElement>('button[data-internal-products-library="true"]')) return;

      const sourceButton = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => normalizedText(button.textContent).includes("Produtos do catálogo"));
      if (!sourceButton?.parentElement) return;

      const clone = sourceButton.cloneNode(true) as HTMLButtonElement;
      clone.dataset.internalProductsLibrary = "true";
      clone.type = "button";
      clone.removeAttribute("aria-pressed");
      replaceFirstText(clone, "Produtos do catálogo", "Produtos Vendor.ai");

      const textNodes = Array.from(clone.querySelectorAll<HTMLElement>("span, p, div"));
      const countNode = textNodes.find((element) => /^\d+$/.test(normalizedText(element.textContent)));
      if (countNode) countNode.textContent = String(products.length);

      clone.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setOpen(true);
      });

      sourceButton.parentElement.appendChild(clone);
    };

    injectButton();
    const observer = new MutationObserver(injectButton);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", injectButton);

    return () => {
      observer.disconnect();
      window.removeEventListener("popstate", injectButton);
      document.querySelectorAll('button[data-internal-products-library="true"]').forEach((button) => button.remove());
    };
  }, [isSuperAdmin, products.length]);

  useEffect(() => {
    const container = document.getElementById("biblioteca-midias");
    if (!container) return;
    const mediaLibrary = container.firstElementChild as HTMLElement | null;
    if (!mediaLibrary) return;

    const previous = mediaLibrary.style.display;
    if (open) mediaLibrary.style.display = "none";
    return () => { mediaLibrary.style.display = previous; };
  }, [open]);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return products;
    return products.filter((product) => [
      product.categoria,
      product.nome,
      product.descricaoUso,
      TYPE_LABEL[product.tipo],
      ...(product.nichosRelacionados ?? []),
    ].join(" ").toLocaleLowerCase("pt-BR").includes(term));
  }, [products, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, InternalProduct[]>();
    for (const product of filtered) {
      const list = map.get(product.categoria) ?? [];
      list.push(product);
      map.set(product.categoria, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  if (!isSuperAdmin || !open) return null;

  return (
    <div data-internal-product-knowledge-root="true" className="mx-auto w-full max-w-[1500px] px-3 pb-24 pt-4 sm:px-6 lg:px-8">
      <header className="rounded-3xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground transition hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar à Biblioteca da Empresa
            </button>
            <div className="flex items-center gap-2">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                <Package className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Produtos Vendor.ai</h1>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  Linha interna de produtos, serviços e ofertas do Vendor.ai para a IA consultar ao criar posts, campanhas, sites, propostas e outros materiais.
                </p>
              </div>
            </div>
          </div>
          <a
            href="/content"
            className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-600"
          >
            <Wand2 className="h-4 w-4" /> Criar material
          </a>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-2xl border bg-background p-3">
            <p className="text-xs font-medium text-muted-foreground">Total</p>
            <p className="mt-2 text-xl font-semibold">{products.length}</p>
          </div>
          <div className="rounded-2xl border bg-background p-3">
            <p className="text-xs font-medium text-muted-foreground">Produtos</p>
            <p className="mt-2 text-xl font-semibold">{products.filter((item) => item.tipo === "produto").length}</p>
          </div>
          <div className="rounded-2xl border bg-background p-3">
            <p className="text-xs font-medium text-muted-foreground">Serviços</p>
            <p className="mt-2 text-xl font-semibold">{products.filter((item) => item.tipo === "servico").length}</p>
          </div>
          <div className="rounded-2xl border bg-background p-3">
            <p className="text-xs font-medium text-muted-foreground">Ofertas</p>
            <p className="mt-2 text-xl font-semibold">{products.filter((item) => item.tipo === "oferta").length}</p>
          </div>
        </div>
      </header>

      <div className="mt-5">
        <label className="relative block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar produto, categoria, descrição ou nicho"
            className="h-11 w-full rounded-xl border bg-background pl-10 pr-3 text-sm outline-none focus:border-orange-300"
          />
        </label>
      </div>

      {loading ? (
        <div className="flex min-h-[360px] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      ) : grouped.length === 0 ? (
        <div className="mt-5 rounded-3xl border border-dashed p-10 text-center">
          <Package className="mx-auto h-10 w-10 text-muted-foreground" />
          <p className="mt-3 font-semibold">Nenhum produto encontrado</p>
          <p className="mt-1 text-sm text-muted-foreground">Ajuste a busca ou cadastre novos itens em Super Admin → Produtos.</p>
        </div>
      ) : (
        <div className="mt-5 space-y-6">
          {grouped.map(([category, items]) => (
            <section key={category}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{category}</h2>
                <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">{items.length}</span>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map((product) => (
                  <article key={product.id} className="rounded-2xl border bg-card p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold">{product.nome}</h3>
                          <span className="rounded-full border bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{TYPE_LABEL[product.tipo]}</span>
                        </div>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{product.descricaoUso}</p>
                      </div>
                      <Sparkles className="h-4 w-4 shrink-0 text-orange-500" />
                    </div>
                    {(product.nichosRelacionados?.length ?? 0) > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {product.nichosRelacionados!.map((niche) => (
                          <span key={niche} className="rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">{niche}</span>
                        ))}
                      </div>
                    )}
                    <div className="mt-3 border-t pt-3">
                      <p className="text-[11px] text-muted-foreground">Disponível como referência estruturada no gerador de conteúdo do Vendor.ai.</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
