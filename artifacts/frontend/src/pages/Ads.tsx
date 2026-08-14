import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Megaphone, Plus, Loader2, Sparkles, Check, Copy, Search } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

type ItemTipo = "produto" | "veiculo" | "imovel";
type TipoAnuncio = "shopping" | "rsa_pmax";
type Modo = "unico" | "carrossel";

interface AdCampaign {
  id: string;
  plataforma: string;
  tipoAnuncio: TipoAnuncio;
  vertical: string;
  itemTipo: ItemTipo;
  itemId: string | null;
  categoriaFiltro: string | null;
  modo: Modo;
  orcamentoDiario: string;
  status: string;
  externalCampaignId: string | null;
}

interface AdCreative {
  id: string;
  campaignId: string;
  headlines: string[];
  descriptions: string[];
  status: "rascunho" | "aprovado";
}

interface ItemBusca { id: string; label: string }

const STATUS_LABEL: Record<string, string> = {
  rascunho: "Rascunho",
  aguardando_conexao_plataforma: "Aguardando conexão",
  ativo: "Ativa",
  pausado: "Pausada",
  encerrado: "Encerrada",
};
const STATUS_COLOR: Record<string, string> = {
  rascunho: "bg-muted text-muted-foreground",
  aguardando_conexao_plataforma: "bg-amber-100 text-amber-800",
  ativo: "bg-green-100 text-green-800",
  pausado: "bg-slate-200 text-slate-700",
  encerrado: "bg-red-100 text-red-700",
};

const EMPTY_FORM = {
  itemTipo: "veiculo" as ItemTipo,
  itemId: "",
  itemLabel: "",
  tipoAnuncio: "rsa_pmax" as TipoAnuncio,
  modo: "unico" as Modo,
  categoriaFiltro: "",
  orcamentoDiario: "",
  vertical: "",
};

export default function Ads() {
  const { user } = useAuth();
  const tenantId = (user as any)?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [itemSearch, setItemSearch] = useState("");
  const [expandedCreative, setExpandedCreative] = useState<Record<string, AdCreative | null>>({});

  const { data: campaigns = [], isLoading } = useQuery<AdCampaign[]>({
    queryKey: ["ad-campaigns", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/ads/campaigns`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: feedInfo } = useQuery<{ feedUrl: string }>({
    queryKey: ["ads-shopping-feed-url", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/ads/shopping-feed/url`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  // Busca de item conforme o tipo escolhido — reaproveita as listagens já
  // existentes de cada módulo, sem endpoint novo.
  const { data: itensDisponiveis = [] } = useQuery<ItemBusca[]>({
    queryKey: ["ads-item-search", tenantId, form.itemTipo, itemSearch],
    queryFn: async () => {
      if (form.itemTipo === "produto") {
        const r = await fetch(`/api/tenants/${tenantId}/produtos-catalogo`, { headers: authHeaders() });
        const data = r.ok ? await r.json() : [];
        return data.map((p: any) => ({ id: p.id, label: `${p.nome} — R$ ${p.precoBase}` }));
      }
      if (form.itemTipo === "veiculo") {
        const r = await fetch(`/api/tenants/${tenantId}/veiculos/estoque`, { headers: authHeaders() });
        const data = r.ok ? await r.json() : [];
        return data.map((v: any) => ({ id: v.id, label: `${v.marca} ${v.modelo}${v.versao ? " " + v.versao : ""} — R$ ${v.valor}` }));
      }
      const r = await fetch(`/api/tenants/${tenantId}/imoveis/propriedades`, { headers: authHeaders() });
      const data = r.ok ? await r.json() : [];
      return data.map((i: any) => ({ id: i.id, label: `${i.titulo} — R$ ${i.valor}` }));
    },
    enabled: open && !!tenantId,
  });

  const itensFiltrados = itemSearch.trim()
    ? itensDisponiveis.filter((i) => i.label.toLowerCase().includes(itemSearch.toLowerCase())).slice(0, 8)
    : itensDisponiveis.slice(0, 8);

  const criarCampanha = useMutation({
    mutationFn: async () => {
      const body = {
        tenantId,
        plataforma: "google",
        tipoAnuncio: form.tipoAnuncio,
        vertical: form.vertical || form.itemTipo,
        itemTipo: form.itemTipo,
        itemId: form.modo === "unico" ? form.itemId : null,
        categoriaFiltro: form.modo === "carrossel" ? form.categoriaFiltro : null,
        modo: form.modo,
        orcamentoDiario: form.orcamentoDiario,
      };
      const r = await fetch(`/api/tenants/${tenantId}/ads/campaigns`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error((await r.json())?.error?.formErrors?.join(", ") ?? "Falha ao criar campanha");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ad-campaigns", tenantId] });
      toast({ title: "Campanha criada", description: "Agora gere o criativo antes de aprovar." });
      setOpen(false);
      setForm({ ...EMPTY_FORM });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const gerarCriativo = useMutation({
    mutationFn: async (campaignId: string) => {
      const r = await fetch(`/api/tenants/${tenantId}/ads/campaigns/${campaignId}/gerar-criativo`, {
        method: "POST", headers: authHeaders(),
      });
      if (!r.ok) throw new Error((await r.json())?.error ?? "Falha ao gerar criativo");
      return (await r.json()) as AdCreative;
    },
    onSuccess: (creative) => {
      setExpandedCreative((prev) => ({ ...prev, [creative.campaignId]: creative }));
      toast({ title: "Criativo gerado", description: "Revise os títulos e descrições antes de aprovar." });
    },
    onError: (e: any) => toast({ title: "Não foi possível gerar", description: e.message, variant: "destructive" }),
  });

  const aprovarCriativo = useMutation({
    mutationFn: async (creativeId: string) => {
      const r = await fetch(`/api/tenants/${tenantId}/ads/creatives/${creativeId}/aprovar`, {
        method: "POST", headers: authHeaders(),
      });
      if (!r.ok) throw new Error("Falha ao aprovar");
      return (await r.json()) as AdCreative;
    },
    onSuccess: (creative) => {
      setExpandedCreative((prev) => ({ ...prev, [creative.campaignId]: creative }));
      toast({ title: "Criativo aprovado" });
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary" />
          <h1 className="text-xl font-semibold">Anúncios</h1>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nova campanha</Button>
      </div>

      <Card className="bg-muted/30">
        <CardContent className="pt-4 text-sm space-y-2">
          <p className="font-medium">Como funciona hoje</p>
          <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
            <li>Plataforma disponível agora: <strong>Google</strong>. Meta, TikTok e LinkedIn entram depois.</li>
            <li>Veículos, imóveis e serviços usam texto gerado por IA (Google Search/Performance Max).</li>
            <li>Farmácia, mercado e distribuidoras usam o feed do Google Shopping.</li>
            <li>Nenhuma campanha publica sozinha — todo criativo passa por aprovação antes.</li>
          </ul>
          {feedInfo?.feedUrl && (
            <div className="flex items-center gap-2 pt-2">
              <span className="text-xs text-muted-foreground">URL do feed do Shopping:</span>
              <code className="text-xs bg-background px-2 py-1 rounded border truncate max-w-xs">{feedInfo.feedUrl}</code>
              <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => { navigator.clipboard.writeText(feedInfo.feedUrl); toast({ title: "Copiado" }); }}>
                <Copy className="h-3 w-3" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-3">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : campaigns.length === 0 ? (
        <Card><CardContent className="pt-6 text-center text-muted-foreground">Nenhuma campanha ainda. Clique em "Nova campanha" pra começar.</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const creative = expandedCreative[c.id];
            return (
              <Card key={c.id}>
                <CardContent className="pt-4 space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="capitalize">{c.itemTipo}</Badge>
                        <Badge variant="outline" className="capitalize">{c.tipoAnuncio === "shopping" ? "Shopping" : "Search/PMax (IA)"}</Badge>
                        <Badge variant="outline" className="capitalize">{c.modo === "unico" ? "Item único" : "Carrossel"}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">Orçamento diário: R$ {c.orcamentoDiario}</p>
                    </div>
                    <Badge className={STATUS_COLOR[c.status] ?? ""}>{STATUS_LABEL[c.status] ?? c.status}</Badge>
                  </div>

                  {c.tipoAnuncio === "rsa_pmax" && (
                    <div className="space-y-2">
                      {!creative ? (
                        <Button size="sm" variant="secondary" disabled={gerarCriativo.isPending}
                          onClick={() => gerarCriativo.mutate(c.id)}>
                          {gerarCriativo.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                          Gerar criativo
                        </Button>
                      ) : (
                        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Títulos ({creative.headlines.length})</p>
                            <div className="flex flex-wrap gap-1">
                              {creative.headlines.map((h, i) => <Badge key={i} variant="secondary" className="font-normal">{h}</Badge>)}
                            </div>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Descrições ({creative.descriptions.length})</p>
                            <div className="space-y-1">
                              {creative.descriptions.map((d, i) => <p key={i} className="text-sm">{d}</p>)}
                            </div>
                          </div>
                          <div className="flex gap-2 pt-1">
                            {creative.status === "aprovado" ? (
                              <Badge className="bg-green-100 text-green-800"><Check className="h-3 w-3 mr-1" /> Aprovado</Badge>
                            ) : (
                              <Button size="sm" onClick={() => aprovarCriativo.mutate(creative.id)} disabled={aprovarCriativo.isPending}>
                                {aprovarCriativo.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                                Aprovar criativo
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => gerarCriativo.mutate(c.id)} disabled={gerarCriativo.isPending}>
                              Gerar de novo
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {c.tipoAnuncio === "shopping" && (
                    <p className="text-xs text-muted-foreground">Este item entra automaticamente no feed do Shopping acima — não precisa de criativo gerado à parte.</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Nova campanha</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Tipo de item</Label>
              <Select value={form.itemTipo} onValueChange={(v) => setForm((f) => ({ ...f, itemTipo: v as ItemTipo, itemId: "", itemLabel: "" }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="veiculo">Veículo</SelectItem>
                  <SelectItem value="imovel">Imóvel</SelectItem>
                  <SelectItem value="produto">Produto (catálogo)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Tipo de anúncio</Label>
              <Select value={form.tipoAnuncio} onValueChange={(v) => setForm((f) => ({ ...f, tipoAnuncio: v as TipoAnuncio }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="rsa_pmax">Search/Performance Max (texto gerado por IA)</SelectItem>
                  <SelectItem value="shopping">Google Shopping (feed de produto)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Modo</Label>
              <Select value={form.modo} onValueChange={(v) => setForm((f) => ({ ...f, modo: v as Modo }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="unico">Só este item</SelectItem>
                  <SelectItem value="carrossel">Carrossel (este + sugestões relacionadas)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.modo === "unico" ? (
              <div>
                <Label>Buscar item</Label>
                <div className="relative">
                  <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <Input className="pl-8" placeholder="Digite pra buscar..." value={itemSearch} onChange={(e) => setItemSearch(e.target.value)} />
                </div>
                {form.itemId && <p className="text-xs text-muted-foreground mt-1">Selecionado: {form.itemLabel}</p>}
                {itemSearch && (
                  <div className="border rounded-md mt-1 max-h-40 overflow-y-auto">
                    {itensFiltrados.map((it) => (
                      <button key={it.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                        onClick={() => { setForm((f) => ({ ...f, itemId: it.id, itemLabel: it.label })); setItemSearch(""); }}>
                        {it.label}
                      </button>
                    ))}
                    {itensFiltrados.length === 0 && <p className="px-3 py-2 text-sm text-muted-foreground">Nada encontrado</p>}
                  </div>
                )}
              </div>
            ) : (
              <div>
                <Label>Categoria/segmento pra puxar sugestões</Label>
                <Input placeholder="Ex: SUV, Farmácia > Higiene" value={form.categoriaFiltro} onChange={(e) => setForm((f) => ({ ...f, categoriaFiltro: e.target.value }))} />
              </div>
            )}

            <div>
              <Label>Orçamento diário (R$)</Label>
              <Input type="number" step="0.01" placeholder="50.00" value={form.orcamentoDiario} onChange={(e) => setForm((f) => ({ ...f, orcamentoDiario: e.target.value }))} />
            </div>

            <Button className="w-full" disabled={criarCampanha.isPending || !form.orcamentoDiario || (form.modo === "unico" && !form.itemId)}
              onClick={() => criarCampanha.mutate()}>
              {criarCampanha.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
              Criar campanha (rascunho)
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
