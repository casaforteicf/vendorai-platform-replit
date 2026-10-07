import { useState, useEffect, useCallback } from "react";
import "./planner5d-reference.css";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { ordenarArvoreCategorias } from "@/lib/categoriaTree";
import { useListCategoriasProduto, getListCategoriasProdutoQueryKey } from "@workspace/api-client-react";
import {
  Search, Image, ShoppingCart, Loader2, Store, Package,
  TrendingUp, DollarSign, ReceiptText,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type MarketplaceItem = {
  id: string;
  vendedorTenantId: string;
  nome: string;
  descricao: string | null;
  categoria: string | null;
  preco: string | null;
  comissaoVendorai: string | null;
  imagens: string[] | null;
  ativo: boolean;
  totalVendas: number;
  createdAt: string;
};

type Pedido = {
  id: string;
  itemId: string;
  projetoId: string | null;
  quantidade: string | null;
  valorUnitario: string | null;
  valorTotal: string | null;
  comissao: string | null;
  status: string | null;
  createdAt: string;
};

type Venda = {
  pedido: Pedido;
  itemNome: string;
};

type Projeto = { id: string; titulo: string };

// ── Helpers ────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem("vendorai_token"); }
function getBase()  { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }
function authH(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}
function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("pt-BR");
}

const STATUS_PEDIDO: Record<string, { label: string; cls: string }> = {
  pendente:   { label: "Pendente",   cls: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  aprovado:   { label: "Aprovado",   cls: "bg-green-50 text-green-700 border-green-200" },
  cancelado:  { label: "Cancelado",  cls: "bg-red-50 text-red-700 border-red-200" },
};

// ── Main Component ─────────────────────────────────────────────────────────
export default function Marketplace() {
  const { toast } = useToast();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  // ── Explorar state
  const [items, setItems]           = useState<MarketplaceItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsLoaded, setItemsLoaded]   = useState(false);
  const [busca, setBusca]           = useState("");
  const [catFilter, setCatFilter]   = useState("__all__");
  const { data: categoriasProduto = [] } = useListCategoriasProduto(tenantId, {
    query: {
      queryKey: getListCategoriasProdutoQueryKey(tenantId),
      enabled: !!tenantId,
      staleTime: 300_000,
    },
  });
  const categoriasOrdenadas = ordenarArvoreCategorias(categoriasProduto);

  // ── Comprar dialog
  const [buying, setBuying]               = useState<MarketplaceItem | null>(null);
  const [buyQty, setBuyQty]               = useState("1");
  const [buyProjeto, setBuyProjeto]       = useState("__none__");
  const [projetos, setProjetos]           = useState<Projeto[]>([]);
  const [submittingBuy, setSubmittingBuy] = useState(false);

  // ── Meus Produtos state
  const [meusProdutos, setMeusProdutos]         = useState<MarketplaceItem[]>([]);
  const [meusProdutosLoading, setMeusProdutosLoading] = useState(false);
  const [meusProdutosLoaded, setMeusProdutosLoaded]   = useState(false);
  const [togglingId, setTogglingId]             = useState<string | null>(null);

  // ── Pedidos state
  const [pedidos, setPedidos]           = useState<Pedido[]>([]);
  const [pedidosLoading, setPedidosLoading] = useState(false);
  const [pedidosLoaded, setPedidosLoaded]   = useState(false);

  // ── Vendas state
  const [vendas, setVendas]                 = useState<Venda[]>([]);
  const [totalComissoes, setTotalComissoes] = useState(0);
  const [vendasLoading, setVendasLoading]   = useState(false);
  const [vendasLoaded, setVendasLoaded]     = useState(false);

  // ── Loaders ────────────────────────────────────────────────────────────
  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    const params = new URLSearchParams({ limit: "40" });
    if (busca)                   params.set("busca", busca);
    if (catFilter !== "__all__") params.set("categoria", catFilter);
    const res = await fetch(`/api/arch/marketplace?${params}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) setItems(await res.json());
    setItemsLoading(false);
    setItemsLoaded(true);
  }, [busca, catFilter]);

  const loadMeusProdutos = useCallback(async () => {
    if (meusProdutosLoaded) return;
    setMeusProdutosLoading(true);
    const res = await fetch(`/api/arch/marketplace/meus-produtos`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) setMeusProdutos(await res.json());
    setMeusProdutosLoading(false);
    setMeusProdutosLoaded(true);
  }, [meusProdutosLoaded]);

  const loadPedidos = useCallback(async () => {
    if (pedidosLoaded) return;
    setPedidosLoading(true);
    const res = await fetch(`/api/arch/marketplace/pedidos`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) setPedidos(await res.json());
    setPedidosLoading(false);
    setPedidosLoaded(true);
  }, [pedidosLoaded]);

  const loadVendas = useCallback(async () => {
    if (vendasLoaded) return;
    setVendasLoading(true);
    const res = await fetch(`/api/arch/marketplace/vendas`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) {
      const data = await res.json();
      setVendas(data.vendas ?? []);
      setTotalComissoes(Number(data.totalComissoes ?? 0));
    }
    setVendasLoading(false);
    setVendasLoaded(true);
  }, [vendasLoaded]);

  const loadProjetos = useCallback(async () => {
    if (projetos.length > 0) return;
    const res = await fetch(`/api/arch/projetos?limit=50`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) {
      const data = await res.json();
      setProjetos((data.projetos ?? data).map((p: any) => ({ id: p.id, titulo: p.titulo })));
    }
  }, [projetos.length]);

  useEffect(() => { loadItems(); }, [loadItems]);

  // ── Comprar ────────────────────────────────────────────────────────────
  function openBuy(item: MarketplaceItem) {
    setBuying(item);
    setBuyQty("1");
    setBuyProjeto("__none__");
    loadProjetos();
  }

  async function handleComprar() {
    if (!buying) return;
    setSubmittingBuy(true);
    try {
      const res = await fetch(`/api/arch/marketplace/${buying.id}/comprar`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({
          quantidade: Number(buyQty),
          projetoId:  buyProjeto !== "__none__" ? buyProjeto : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Falha ao realizar compra.");
      }
      setBuying(null);
      toast({ title: "Compra realizada!", description: buyProjeto !== "__none__" ? "Item adicionado ao orçamento do projeto." : undefined });
      setPedidosLoaded(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingBuy(false);
    }
  }

  // ── Toggle ativo (Meus Produtos) ───────────────────────────────────────
  async function toggleAtivo(item: MarketplaceItem) {
    setTogglingId(item.id);
    try {
      const res = await fetch(`/api/arch/marketplace/${item.id}`, {
        method: "PATCH",
        headers: authH(),
        body: JSON.stringify({ ativo: !item.ativo }),
      });
      if (!res.ok) throw new Error("Falha ao atualizar.");
      const updated: MarketplaceItem = await res.json();
      setMeusProdutos(prev => prev.map(p => p.id === item.id ? updated : p));
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="arqdor-reference-ui max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Arqdor Marketplace</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Conecte projetos a produtos, fornecedores e oportunidades em um só ecossistema
        </p>
      </div>

      <Tabs defaultValue="explorar">
        <TabsList>
          <TabsTrigger value="explorar">Explorar</TabsTrigger>
          <TabsTrigger value="meus-produtos" onClick={loadMeusProdutos}>Meus Produtos</TabsTrigger>
          <TabsTrigger value="pedidos" onClick={loadPedidos}>Pedidos</TabsTrigger>
          <TabsTrigger value="vendas" onClick={loadVendas}>Vendas</TabsTrigger>
        </TabsList>

        {/* ── ABA: EXPLORAR ───────────────────────────────────────────── */}
        <TabsContent value="explorar" className="mt-4 space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar produtos..."
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
            </div>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as categorias</SelectItem>
                {categoriasOrdenadas.map(({ categoria: c, profundidade }) => (
                  <SelectItem key={c.id} value={c.nome}>
                    {"　".repeat(profundidade)}{profundidade > 0 ? "↳ " : ""}{c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {itemsLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
            </div>
          )}

          {!itemsLoading && itemsLoaded && items.length === 0 && (
            <div className="rounded-lg border border-dashed p-16 text-center">
              <Store className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-medium text-sm">Nenhum produto disponível</p>
              <p className="text-xs text-muted-foreground mt-1">
                {busca || catFilter !== "__all__"
                  ? "Tente outros filtros."
                  : "Ainda não há ofertas publicadas para esta seleção."}
              </p>
            </div>
          )}

          {!itemsLoading && items.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {items.map(item => {
                const thumb = item.imagens?.[0];
                return (
                  <Card key={item.id} className="overflow-hidden">
                    <div className="relative h-40 bg-muted flex items-center justify-center">
                      {thumb ? (
                        <img
                          src={`${getBase()}${thumb}`}
                          alt={item.nome}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Image className="h-10 w-10 text-muted-foreground/20" />
                      )}
                    </div>
                    <CardContent className="p-3 space-y-2">
                      <div>
                        <p className="font-medium text-sm truncate">{item.nome}</p>
                        {item.categoria && (
                          <p className="text-xs text-muted-foreground">{item.categoria}</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        {item.preco && Number(item.preco) > 0 ? (
                          <p className="font-semibold text-sm text-green-700">{fmt(Number(item.preco))}</p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Sob consulta</p>
                        )}
                        <Button size="sm" className="h-7 text-xs" onClick={() => openBuy(item)}>
                          <ShoppingCart className="h-3 w-3 mr-1" /> Comprar
                        </Button>
                      </div>
                      {item.totalVendas > 0 && (
                        <p className="text-xs text-muted-foreground">{item.totalVendas} venda(s)</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── ABA: MEUS PRODUTOS ──────────────────────────────────────── */}
        <TabsContent value="meus-produtos" className="mt-4">
          {meusProdutosLoading && (
            <div className="space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          )}
          {!meusProdutosLoading && meusProdutosLoaded && meusProdutos.length === 0 && (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <Package className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-medium text-sm">Você ainda não publicou produtos</p>
              <p className="text-xs text-muted-foreground mt-1">Adicione um produto no Catálogo e marque "Publicar no Marketplace".</p>
            </div>
          )}
          {!meusProdutosLoading && meusProdutos.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Produto</th>
                    <th className="text-left px-4 py-3 font-medium">Categoria</th>
                    <th className="text-right px-4 py-3 font-medium">Preço</th>
                    <th className="text-right px-4 py-3 font-medium">Vendas</th>
                    <th className="text-center px-4 py-3 font-medium">Ativo</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {meusProdutos.map(p => (
                    <tr key={p.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <p className="font-medium truncate max-w-52">{p.nome}</p>
                        {p.descricao && <p className="text-xs text-muted-foreground truncate max-w-52">{p.descricao}</p>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{p.categoria ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        {p.preco && Number(p.preco) > 0 ? fmt(Number(p.preco)) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="inline-flex items-center gap-1">
                          <TrendingUp className="h-3.5 w-3.5 text-green-600" />
                          {p.totalVendas}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <Switch
                            checked={p.ativo}
                            disabled={togglingId === p.id}
                            onCheckedChange={() => toggleAtivo(p)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── ABA: PEDIDOS ────────────────────────────────────────────── */}
        <TabsContent value="pedidos" className="mt-4">
          {pedidosLoading && (
            <div className="space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          )}
          {!pedidosLoading && pedidosLoaded && pedidos.length === 0 && (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <ReceiptText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-medium text-sm">Nenhum pedido realizado</p>
              <p className="text-xs text-muted-foreground mt-1">Explore o marketplace e compre produtos de outros arquitetos.</p>
            </div>
          )}
          {!pedidosLoading && pedidos.length > 0 && (
            <div className="rounded-lg border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Data</th>
                    <th className="text-left px-4 py-3 font-medium">Item</th>
                    <th className="text-right px-4 py-3 font-medium">Qtd</th>
                    <th className="text-right px-4 py-3 font-medium">Total</th>
                    <th className="text-center px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pedidos.map(p => {
                    const st = STATUS_PEDIDO[p.status ?? "pendente"] ?? STATUS_PEDIDO["pendente"];
                    return (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">{fmtDate(p.createdAt)}</td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{p.itemId.slice(0, 8)}…</td>
                        <td className="px-4 py-3 text-right">{p.quantidade ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-medium">
                          {p.valorTotal ? fmt(Number(p.valorTotal)) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                              {st.label}
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* ── ABA: VENDAS ─────────────────────────────────────────────── */}
        <TabsContent value="vendas" className="mt-4 space-y-4">
          {vendasLoading && (
            <div className="space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}
            </div>
          )}
          {!vendasLoading && vendasLoaded && (
            <>
              {/* Summary card */}
              {totalComissoes > 0 && (
                <div className="inline-flex items-center gap-3 rounded-lg border bg-amber-50 border-amber-200 px-4 py-3">
                  <DollarSign className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="text-xs text-amber-700">Total em comissões pagas</p>
                    <p className="font-bold text-amber-800">{fmt(totalComissoes)}</p>
                  </div>
                </div>
              )}

              {vendas.length === 0 ? (
                <div className="rounded-lg border border-dashed p-12 text-center">
                  <TrendingUp className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
                  <p className="font-medium text-sm">Nenhuma venda ainda</p>
                  <p className="text-xs text-muted-foreground mt-1">Ative seus produtos no Marketplace para começar a vender.</p>
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="text-left px-4 py-3 font-medium">Data</th>
                        <th className="text-left px-4 py-3 font-medium">Produto</th>
                        <th className="text-right px-4 py-3 font-medium">Qtd</th>
                        <th className="text-right px-4 py-3 font-medium">Total</th>
                        <th className="text-right px-4 py-3 font-medium">Comissão</th>
                        <th className="text-center px-4 py-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {vendas.map(({ pedido, itemNome }) => {
                        const st = STATUS_PEDIDO[pedido.status ?? "pendente"] ?? STATUS_PEDIDO["pendente"];
                        return (
                          <tr key={pedido.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 text-muted-foreground">{fmtDate(pedido.createdAt)}</td>
                            <td className="px-4 py-3 font-medium max-w-52 truncate">{itemNome}</td>
                            <td className="px-4 py-3 text-right">{pedido.quantidade ?? "—"}</td>
                            <td className="px-4 py-3 text-right font-medium text-green-700">
                              {pedido.valorTotal ? fmt(Number(pedido.valorTotal)) : "—"}
                            </td>
                            <td className="px-4 py-3 text-right text-amber-700">
                              {pedido.comissao ? fmt(Number(pedido.comissao)) : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-center">
                                <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${st.cls}`}>
                                  {st.label}
                                </span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* ── Dialog: Comprar ─────────────────────────────────────────────── */}
      <Dialog open={!!buying} onOpenChange={() => setBuying(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Comprar — {buying?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {buying?.preco && Number(buying.preco) > 0 && (
              <div className="rounded-lg bg-muted p-3">
                <p className="text-xs text-muted-foreground">Preço unitário</p>
                <p className="font-bold text-lg">{fmt(Number(buying.preco))}</p>
                <p className="text-xs text-muted-foreground mt-0.5">+ 10% comissão VendorAI</p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min="1"
                value={buyQty}
                onChange={e => setBuyQty(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Vincular a projeto <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Select value={buyProjeto} onValueChange={setBuyProjeto}>
                <SelectTrigger><SelectValue placeholder="Nenhum projeto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum projeto</SelectItem>
                  {projetos.map(p => <SelectItem key={p.id} value={p.id}>{p.titulo}</SelectItem>)}
                </SelectContent>
              </Select>
              {buyProjeto !== "__none__" && (
                <p className="text-xs text-primary">Item será adicionado ao orçamento do projeto.</p>
              )}
            </div>

            {buying?.preco && Number(buying.preco) > 0 && Number(buyQty) > 0 && (
              <div className="rounded-lg border p-3 text-right">
                <p className="text-xs text-muted-foreground">Total estimado</p>
                <p className="font-bold">{fmt(Number(buying.preco) * Number(buyQty))}</p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBuying(null)}>Cancelar</Button>
              <Button onClick={handleComprar} disabled={submittingBuy || !buyQty || Number(buyQty) < 1}>
                {submittingBuy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Comprando…</> : "Confirmar compra"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
