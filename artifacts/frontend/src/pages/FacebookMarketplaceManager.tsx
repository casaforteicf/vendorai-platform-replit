import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, Loader2, PackageCheck, Pencil, Plus, Save, Sparkles, Store, Trash2, X } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type CampaignSummary = {
  id: string;
  nome: string;
  tipo: string;
  status: string;
};

type CatalogProduct = {
  id: string;
  nome: string;
  sku?: string | null;
  precoBase: string;
  precoPromocional?: string | null;
  imagemUrl?: string | null;
  imagens?: string[] | null;
  ativo?: boolean;
};

type MarketplaceStatus = "draft" | "ready" | "published" | "paused" | "sold" | "renewal_due" | "failed";

type ListingEdit = {
  title: string;
  description: string;
  price: string;
  category: string;
  city: string;
  state: string;
};

type MarketplaceListing = {
  id: string;
  productId: string;
  productName: string;
  productImage?: string | null;
  sku?: string | null;
  title: string;
  description: string;
  price: string;
  category?: string | null;
  condition: string;
  city?: string | null;
  state?: string | null;
  mediaUrls: string[];
  externalUrl?: string | null;
  publishMode: string;
  status: MarketplaceStatus;
  publishedAt?: string | null;
  updatedAt: string;
};

const STATUS_LABEL: Record<MarketplaceStatus, string> = {
  draft: "Rascunho",
  ready: "Pronto para publicar",
  published: "Publicado",
  paused: "Pausado",
  sold: "Vendido",
  renewal_due: "Renovar",
  failed: "Falhou",
};

function authHeaders() {
  const token = localStorage.getItem("vendorai_token") ?? "";
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function money(value: string | number) {
  const numeric = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number.isFinite(numeric) ? numeric : 0,
  );
}

function StatusPill({ status }: { status: MarketplaceStatus }) {
  return (
    <span className="inline-flex rounded-full border bg-muted/40 px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
      {STATUS_LABEL[status]}
    </span>
  );
}

export default function FacebookMarketplaceManager() {
  const { user } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.tenantId ?? "";
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [productId, setProductId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [category, setCategory] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [externalUrls, setExternalUrls] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ListingEdit | null>(null);

  const loadData = useCallback(async () => {
    if (!tenantId) return;
    const [productResponse, campaignResponse, listingResponse] = await Promise.all([
      fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: authHeaders() }),
      fetch(`/api/tenants/${tenantId}/campaigns`, { headers: authHeaders() }),
      fetch(`/api/tenants/${tenantId}/facebook-marketplace/listings`, { headers: authHeaders() }),
    ]);

    if (productResponse.ok) {
      const data = (await productResponse.json()) as CatalogProduct[];
      setProducts(data.filter((item) => item.ativo !== false));
    }
    if (campaignResponse.ok) {
      const data = (await campaignResponse.json()) as CampaignSummary[];
      setCampaigns(data);
    }
    if (listingResponse.ok) {
      const data = (await listingResponse.json()) as MarketplaceListing[];
      setListings(data);
      setExternalUrls(
        Object.fromEntries(data.map((item) => [item.id, item.externalUrl ?? ""])),
      );
    }
  }, [tenantId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const stats = useMemo(() => {
    const count = (statuses: MarketplaceStatus[]) =>
      listings.filter((item) => statuses.includes(item.status)).length;
    return {
      drafts: count(["draft"]),
      ready: count(["ready", "renewal_due"]),
      published: count(["published"]),
      sold: count(["sold"]),
    };
  }, [listings]);

  async function createDraft() {
    if (!productId || !tenantId) {
      toast({ title: "Selecione um produto do catálogo", variant: "destructive" });
      return;
    }
    setCreating(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/facebook-marketplace/drafts`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          productId,
          campaignId: campaignId || null,
          city: city.trim() || null,
          state: state.trim() || null,
          category: category.trim() || null,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível gerar o anúncio.");
      toast({ title: "Rascunho criado", description: "Título e descrição foram preparados a partir do catálogo." });
      setProductId("");
      setCampaignId("");
      setCategory("");
      await loadData();
    } catch (error) {
      toast({
        title: "Falha ao criar anúncio",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  async function copyListing(listing: MarketplaceListing) {
    const text = `${listing.title}\n\n${listing.description}\n\nPreço: ${money(listing.price)}`;
    await navigator.clipboard.writeText(text);
    toast({ title: "Anúncio copiado", description: "Título, descrição e preço estão na área de transferência." });
  }

  async function prepareAndOpen(listing: MarketplaceListing) {
    if (!tenantId) return;
    setBusyId(listing.id);
    try {
      const response = await fetch(
        `/api/tenants/${tenantId}/facebook-marketplace/listings/${listing.id}/prepare`,
        { method: "POST", headers: authHeaders() },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível preparar a publicação.");
      await copyListing(listing);
      window.open(
        data?.handoff?.marketplaceCreateUrl || "https://www.facebook.com/marketplace/create/item",
        "_blank",
        "noopener,noreferrer",
      );
      await loadData();
    } catch (error) {
      toast({
        title: "Falha ao preparar publicação",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  function beginEdit(listing: MarketplaceListing) {
    setEditingId(listing.id);
    setEditForm({
      title: listing.title,
      description: listing.description,
      price: listing.price,
      category: listing.category ?? "",
      city: listing.city ?? "",
      state: listing.state ?? "",
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  async function saveEdit(listingId: string) {
    if (!editForm) return;
    const saved = await patchListing(listingId, {
      title: editForm.title.trim(),
      description: editForm.description.trim(),
      price: editForm.price,
      category: editForm.category.trim() || null,
      city: editForm.city.trim() || null,
      state: editForm.state.trim() || null,
    });
    if (saved) {
      cancelEdit();
      toast({ title: "Rascunho atualizado", description: "As alterações foram salvas antes da publicação." });
    }
  }

  async function patchListing(listingId: string, body: Record<string, unknown>): Promise<boolean> {
    if (!tenantId) return false;
    setBusyId(listingId);
    try {
      const response = await fetch(
        `/api/tenants/${tenantId}/facebook-marketplace/listings/${listingId}`,
        {
          method: "PATCH",
          headers: authHeaders(),
          body: JSON.stringify(body),
        },
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.error || "Não foi possível atualizar o anúncio.");
      await loadData();
      return true;
    } catch (error) {
      toast({
        title: "Falha ao atualizar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
      return false;
    } finally {
      setBusyId(null);
    }
  }

  async function deleteListing(listingId: string) {
    if (!tenantId) return;
    setBusyId(listingId);
    try {
      const response = await fetch(
        `/api/tenants/${tenantId}/facebook-marketplace/listings/${listingId}`,
        { method: "DELETE", headers: authHeaders() },
      );
      if (!response.ok && response.status !== 204) {
        throw new Error("Não foi possível excluir o anúncio.");
      }
      await loadData();
    } catch (error) {
      toast({
        title: "Falha ao excluir",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            <Store className="h-3.5 w-3.5" />
            Canal de venda
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Facebook Marketplace</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Gere anúncios a partir do catálogo, copie o conteúdo, abra o Marketplace e acompanhe publicação, pausa, venda e renovação.
          </p>
        </div>
        <div className="rounded-xl border bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
          <strong className="block text-foreground">Modo assistido</strong>
          O VendorAI prepara tudo e registra o ciclo. A confirmação final acontece no Facebook enquanto não houver conector oficial elegível.
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Rascunhos", stats.drafts],
          ["Prontos / renovar", stats.ready],
          ["Publicados", stats.published],
          ["Vendidos", stats.sold],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-semibold">Gerar anúncio do catálogo</h2>
            <p className="text-xs text-muted-foreground">A IA cria título e descrição sem inventar dados fora do produto cadastrado.</p>
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-[2fr_1.5fr_1fr_100px_1.2fr_auto]">
          <select
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Selecione um produto</option>
            {products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.nome}{product.sku ? ` · ${product.sku}` : ""} · {money(product.precoPromocional || product.precoBase)}
              </option>
            ))}
          </select>
          <select
            value={campaignId}
            onChange={(event) => setCampaignId(event.target.value)}
            className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          >
            <option value="">Sem campanha vinculada</option>
            {campaigns.map((campaign) => (
              <option key={campaign.id} value={campaign.id}>
                {campaign.nome} · {campaign.status}
              </option>
            ))}
          </select>
          <Input value={city} onChange={(event) => setCity(event.target.value)} placeholder="Cidade" />
          <Input value={state} onChange={(event) => setState(event.target.value.toUpperCase())} placeholder="UF" maxLength={2} />
          <Input value={category} onChange={(event) => setCategory(event.target.value)} placeholder="Categoria (opcional)" />
          <Button onClick={() => void createDraft()} disabled={creating || !productId}>
            {creating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Gerar
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        {listings.length === 0 ? (
          <div className="rounded-2xl border border-dashed p-10 text-center">
            <Store className="mx-auto h-8 w-8 text-muted-foreground" />
            <h3 className="mt-3 font-semibold">Nenhum anúncio preparado</h3>
            <p className="mt-1 text-sm text-muted-foreground">Selecione um produto acima para criar o primeiro rascunho.</p>
          </div>
        ) : (
          listings.map((listing) => {
            const image = listing.mediaUrls?.[0] || listing.productImage;
            const busy = busyId === listing.id;
            return (
              <article key={listing.id} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <div className="grid gap-0 lg:grid-cols-[180px_1fr]">
                  <div className="min-h-44 bg-muted/40">
                    {image ? (
                      <img src={image} alt={listing.productName} className="h-full min-h-44 w-full object-cover" />
                    ) : (
                      <div className="flex h-full min-h-44 items-center justify-center text-muted-foreground">
                        <Store className="h-8 w-8" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-4 p-5">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusPill status={listing.status} />
                          <span className="text-xs text-muted-foreground">{listing.productName}</span>
                        </div>
                        {editingId === listing.id && editForm ? (
                          <div className="mt-3 grid gap-3">
                            <Input
                              value={editForm.title}
                              onChange={(event) => setEditForm((current) => current ? { ...current, title: event.target.value } : current)}
                              placeholder="Título do anúncio"
                            />
                            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={editForm.price}
                                onChange={(event) => setEditForm((current) => current ? { ...current, price: event.target.value } : current)}
                                placeholder="Preço"
                              />
                              <Input
                                value={editForm.category}
                                onChange={(event) => setEditForm((current) => current ? { ...current, category: event.target.value } : current)}
                                placeholder="Categoria"
                              />
                            </div>
                            <div className="grid gap-3 sm:grid-cols-[1fr_100px]">
                              <Input
                                value={editForm.city}
                                onChange={(event) => setEditForm((current) => current ? { ...current, city: event.target.value } : current)}
                                placeholder="Cidade"
                              />
                              <Input
                                value={editForm.state}
                                onChange={(event) => setEditForm((current) => current ? { ...current, state: event.target.value } : current)}
                                placeholder="UF"
                                maxLength={2}
                              />
                            </div>
                            <Textarea
                              value={editForm.description}
                              onChange={(event) => setEditForm((current) => current ? { ...current, description: event.target.value } : current)}
                              rows={6}
                              placeholder="Descrição do anúncio"
                            />
                          </div>
                        ) : (
                          <>
                            <h3 className="mt-2 text-lg font-semibold">{listing.title}</h3>
                            <p className="mt-1 text-xl font-bold text-primary">{money(listing.price)}</p>
                            <p className="mt-2 line-clamp-3 whitespace-pre-line text-sm text-muted-foreground">
                              {listing.description}
                            </p>
                          </>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {editingId === listing.id ? (
                          <>
                            <Button variant="outline" size="sm" onClick={cancelEdit} disabled={busy}>
                              <X className="mr-1.5 h-4 w-4" />
                              Cancelar
                            </Button>
                            <Button size="sm" onClick={() => void saveEdit(listing.id)} disabled={busy || !editForm?.title.trim() || !editForm?.description.trim()}>
                              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
                              Salvar
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button variant="outline" size="sm" onClick={() => beginEdit(listing)}>
                              <Pencil className="mr-1.5 h-4 w-4" />
                              Editar
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => void copyListing(listing)}>
                              <Copy className="mr-1.5 h-4 w-4" />
                              Copiar
                            </Button>
                            <Button size="sm" onClick={() => void prepareAndOpen(listing)} disabled={busy}>
                              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-1.5 h-4 w-4" />}
                              Publicar
                            </Button>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 xl:grid-cols-[180px_1fr_auto_auto]">
                      <select
                        value={listing.status}
                        onChange={(event) =>
                          void patchListing(listing.id, { status: event.target.value as MarketplaceStatus })
                        }
                        className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                        disabled={busy}
                      >
                        {Object.entries(STATUS_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <Input
                        value={externalUrls[listing.id] ?? ""}
                        onChange={(event) =>
                          setExternalUrls((current) => ({ ...current, [listing.id]: event.target.value }))
                        }
                        placeholder="Cole aqui a URL do anúncio publicado"
                      />
                      <Button
                        variant="outline"
                        onClick={() =>
                          void patchListing(listing.id, {
                            externalUrl: externalUrls[listing.id]?.trim() || null,
                            status: externalUrls[listing.id]?.trim() ? "published" : listing.status,
                          })
                        }
                        disabled={busy}
                      >
                        <PackageCheck className="mr-1.5 h-4 w-4" />
                        Salvar publicação
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => void deleteListing(listing.id)} disabled={busy} aria-label="Excluir anúncio">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>

                    {listing.externalUrl && (
                      <a
                        href={listing.externalUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        Abrir anúncio publicado <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
