import { useCallback, useEffect, useMemo, useState } from "react";
import "./planner5d-reference.css";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  getListCategoriasProdutoQueryKey,
  useListCategoriasProduto,
} from "@workspace/api-client-react";
import {
  ArrowRight,
  Boxes,
  Building2,
  CheckCircle2,
  ClipboardList,
  Factory,
  FileText,
  Filter,
  HardHat,
  Image,
  Loader2,
  MapPin,
  Package,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  Truck,
  Users,
  Wrench,
} from "lucide-react";

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

function getToken() {
  return localStorage.getItem("vendorai_token");
}

function getBase() {
  return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
}

function authH(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  };
}

function fmt(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("pt-BR");
}

const STATUS_PEDIDO: Record<string, { label: string; cls: string }> = {
  pendente: { label: "Pendente", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  aprovado: { label: "Aprovado", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  cancelado: { label: "Cancelado", cls: "bg-red-50 text-red-700 border-red-200" },
};

const SEGMENTOS = [
  { label: "Materiais", icon: Boxes, query: "material" },
  { label: "Esquadrias", icon: Building2, query: "esquadria" },
  { label: "Móveis", icon: Package, query: "móvel" },
  { label: "Construção", icon: HardHat, query: "construção" },
  { label: "Instalação", icon: Wrench, query: "instalação" },
  { label: "Fabricantes", icon: Factory, query: "fabricante" },
];

export default function Marketplace() {
  const { toast } = useToast();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsLoaded, setItemsLoaded] = useState(false);
  const [busca, setBusca] = useState("");
  const [catFilter, setCatFilter] = useState("__all__");
  const [activeTab, setActiveTab] = useState("market");

  const { data: categoriasProduto = [] } = useListCategoriasProduto(tenantId, {
    query: {
      queryKey: getListCategoriasProdutoQueryKey(tenantId),
      enabled: !!tenantId,
      staleTime: 300_000,
    },
  });
  const categoriasOrdenadas = ordenarArvoreCategorias(categoriasProduto);

  const [buying, setBuying] = useState<MarketplaceItem | null>(null);
  const [buyQty, setBuyQty] = useState("1");
  const [buyProjeto, setBuyProjeto] = useState("__none__");
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [submittingBuy, setSubmittingBuy] = useState(false);
  const [projetoContexto, setProjetoContexto] = useState("__all__");

  const [meusProdutos, setMeusProdutos] = useState<MarketplaceItem[]>([]);
  const [meusProdutosLoading, setMeusProdutosLoading] = useState(false);
  const [meusProdutosLoaded, setMeusProdutosLoaded] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [pedidosLoading, setPedidosLoading] = useState(false);
  const [pedidosLoaded, setPedidosLoaded] = useState(false);

  const [vendas, setVendas] = useState<Venda[]>([]);
  const [vendasLoading, setVendasLoading] = useState(false);
  const [vendasLoaded, setVendasLoaded] = useState(false);

  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    try {
      const params = new URLSearchParams({ limit: "60" });
      if (busca) params.set("busca", busca);
      if (catFilter !== "__all__") params.set("categoria", catFilter);

      const res = await fetch(`/api/arch/marketplace?${params}`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });

      if (!res.ok) throw new Error("Não foi possível carregar o Market Arqdor.");
      setItems(await res.json());
    } catch (err: any) {
      toast({
        title: "Market Arqdor",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setItemsLoading(false);
      setItemsLoaded(true);
    }
  }, [busca, catFilter, toast]);

  const loadProjetos = useCallback(async () => {
    if (projetos.length > 0) return;
    const res = await fetch("/api/arch/projetos?limit=50", {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) {
      const data = await res.json();
      setProjetos(
        (data.projetos ?? data).map((p: any) => ({ id: p.id, titulo: p.titulo })),
      );
    }
  }, [projetos.length]);

  const loadMeusProdutos = useCallback(async () => {
    if (meusProdutosLoaded) return;
    setMeusProdutosLoading(true);
    try {
      const res = await fetch("/api/arch/marketplace/meus-produtos", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Falha ao carregar sua vitrine.");
      setMeusProdutos(await res.json());
    } finally {
      setMeusProdutosLoading(false);
      setMeusProdutosLoaded(true);
    }
  }, [meusProdutosLoaded]);

  const loadPedidos = useCallback(async () => {
    if (pedidosLoaded) return;
    setPedidosLoading(true);
    try {
      const res = await fetch("/api/arch/marketplace/pedidos", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Falha ao carregar pedidos.");
      setPedidos(await res.json());
    } finally {
      setPedidosLoading(false);
      setPedidosLoaded(true);
    }
  }, [pedidosLoaded]);

  const loadVendas = useCallback(async () => {
    if (vendasLoaded) return;
    setVendasLoading(true);
    try {
      const res = await fetch("/api/arch/marketplace/vendas", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!res.ok) throw new Error("Falha ao carregar vendas.");
      const data = await res.json();
      setVendas(data.vendas ?? []);
    } finally {
      setVendasLoading(false);
      setVendasLoaded(true);
    }
  }, [vendasLoaded]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  useEffect(() => {
    loadProjetos();
  }, [loadProjetos]);

  const fornecedores = useMemo(() => {
    const grouped = new Map<
      string,
      { tenantId: string; itens: MarketplaceItem[]; categorias: Set<string> }
    >();

    items.forEach((item) => {
      const current = grouped.get(item.vendedorTenantId) ?? {
        tenantId: item.vendedorTenantId,
        itens: [],
        categorias: new Set<string>(),
      };
      current.itens.push(item);
      if (item.categoria) current.categorias.add(item.categoria);
      grouped.set(item.vendedorTenantId, current);
    });

    return [...grouped.values()].sort((a, b) => b.itens.length - a.itens.length);
  }, [items]);

  const projetoSelecionado = projetos.find((p) => p.id === projetoContexto);

  function openBuy(item: MarketplaceItem) {
    setBuying(item);
    setBuyQty("1");
    setBuyProjeto(projetoContexto !== "__all__" ? projetoContexto : "__none__");
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
          projetoId: buyProjeto !== "__none__" ? buyProjeto : undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Falha ao realizar compra.");
      }

      setBuying(null);
      toast({
        title: "Pedido criado",
        description:
          buyProjeto !== "__none__"
            ? "Item vinculado ao projeto e ao orçamento."
            : "Pedido registrado no Market Arqdor.",
      });
      setPedidosLoaded(false);
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingBuy(false);
    }
  }

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
      setMeusProdutos((prev) =>
        prev.map((p) => (p.id === item.id ? updated : p)),
      );
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    } finally {
      setTogglingId(null);
    }
  }

  const applySegment = (query: string) => {
    setCatFilter("__all__");
    setBusca(query);
    setActiveTab("market");
  };

  const openProcurement = () => {
    const params = new URLSearchParams({ module: "procurement" });
    if (projetoContexto !== "__all__") params.set("project_id", projetoContexto);
    window.location.assign(`/arch/studio?${params.toString()}`);
  };

  return (
    <div className="arqdor-reference-ui mx-auto max-w-[1480px] space-y-5 pb-10">
      <section className="overflow-hidden rounded-2xl border border-emerald-100 bg-[linear-gradient(135deg,#061510_0%,#0c261c_56%,#103426_100%)] text-white shadow-sm">
        <div className="grid gap-8 px-6 py-7 lg:grid-cols-[1fr_420px] lg:px-8">
          <div>
            <div className="mb-4 flex items-center gap-2">
              <Badge className="border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/10">
                ARQDOR MARKET
              </Badge>
              <span className="text-xs text-emerald-100/65">
                Ecossistema de fornecedores, produtos e serviços
              </span>
            </div>

            <h1 className="max-w-3xl text-3xl font-semibold tracking-tight lg:text-4xl">
              Do projeto à cotação, compra e contratação em um único fluxo.
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-50/70">
              Encontre materiais, esquadrias, móveis, construtoras, instaladores e
              parceiros do ecossistema. O Market Arqdor reutiliza o motor comercial
              do Praça.ai e mantém cada pedido ligado ao projeto e ao orçamento.
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              {[
                ["Fornecedores verificados", ShieldCheck],
                ["Logística integrada", Truck],
                ["Pedidos vinculados ao projeto", ClipboardList],
                ["Catálogo técnico", Boxes],
              ].map(([label, Icon]: any) => (
                <span
                  key={label}
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/75"
                >
                  <Icon className="h-3.5 w-3.5 text-emerald-300" />
                  {label}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-sm">
            <p className="text-xs font-medium uppercase tracking-[0.14em] text-emerald-200/70">
              Contexto do projeto
            </p>
            <p className="mt-1 text-sm text-white/70">
              Selecione um projeto para manter compras e cotações no contexto correto.
            </p>

            <Select value={projetoContexto} onValueChange={setProjetoContexto}>
              <SelectTrigger className="mt-4 border-white/10 bg-white text-slate-900">
                <SelectValue placeholder="Todos os projetos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Navegar sem projeto</SelectItem>
                {projetos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.titulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="mt-4 rounded-lg border border-white/10 bg-black/10 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="h-4 w-4 text-emerald-300" />
                {projetoSelecionado ? projetoSelecionado.titulo : "Market aberto"}
              </div>
              <p className="mt-1 text-xs leading-5 text-white/60">
                {projetoSelecionado
                  ? "Novas compras já podem ser vinculadas a este projeto."
                  : "Você pode explorar fornecedores e selecionar o projeto no momento da compra."}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {SEGMENTOS.map(({ label, icon: Icon, query }) => (
          <button
            key={label}
            type="button"
            onClick={() => applySegment(query)}
            className="group flex items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
              <Icon className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-medium">{label}</span>
              <span className="block text-[11px] text-muted-foreground">Explorar</span>
            </span>
          </button>
        ))}
      </section>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="market">Market</TabsTrigger>
            <TabsTrigger value="fornecedores">Fornecedores</TabsTrigger>
            <TabsTrigger value="pedidos" onClick={loadPedidos}>Pedidos</TabsTrigger>
            <TabsTrigger value="vitrine" onClick={loadMeusProdutos}>Minha vitrine</TabsTrigger>
            <TabsTrigger value="vendas" onClick={loadVendas}>Vendas</TabsTrigger>
          </TabsList>

          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="gap-2" onClick={openProcurement}>
              <FileText className="h-4 w-4" />
              Minhas cotações
            </Button>
            <Button
              size="sm"
              className="gap-2 bg-emerald-700 hover:bg-emerald-800"
              onClick={openProcurement}
            >
              <ClipboardList className="h-4 w-4" />
              Cotar itens do orçamento
            </Button>
          </div>
        </div>

        <TabsContent value="market" className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_240px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="h-11 bg-white pl-9"
                placeholder="Buscar cimento, esquadrias, revestimentos, móveis, serviços..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="h-11 bg-white">
                <Filter className="mr-2 h-4 w-4 text-muted-foreground" />
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todas as categorias</SelectItem>
                {categoriasOrdenadas.map(({ categoria: c, profundidade }) => (
                  <SelectItem key={c.id} value={c.nome}>
                    {"　".repeat(profundidade)}
                    {profundidade > 0 ? "↳ " : ""}
                    {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {itemsLoading && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-80 rounded-xl" />
              ))}
            </div>
          )}

          {!itemsLoading && itemsLoaded && items.length === 0 && (
            <div className="rounded-xl border border-dashed bg-white p-16 text-center">
              <Store className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium">Nenhuma oferta encontrada</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ajuste a busca ou escolha outra categoria.
              </p>
            </div>
          )}

          {!itemsLoading && items.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => {
                const thumb = item.imagens?.[0];
                const preco = Number(item.preco ?? 0);

                return (
                  <Card
                    key={item.id}
                    className="group overflow-hidden border-slate-200 bg-white transition hover:-translate-y-0.5 hover:shadow-md"
                  >
                    <div className="relative h-44 overflow-hidden bg-slate-50">
                      {thumb ? (
                        <img
                          src={`${getBase()}${thumb}`}
                          alt={item.nome}
                          className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center">
                          <Image className="h-10 w-10 text-muted-foreground/20" />
                        </div>
                      )}

                      <div className="absolute left-3 top-3 flex gap-1.5">
                        <Badge className="border-white/60 bg-white/90 text-slate-700 hover:bg-white">
                          {item.categoria ?? "Produto"}
                        </Badge>
                      </div>
                    </div>

                    <CardContent className="space-y-3 p-4">
                      <div>
                        <h3 className="line-clamp-2 text-sm font-semibold">{item.nome}</h3>
                        <p className="mt-1 line-clamp-2 min-h-8 text-xs leading-4 text-muted-foreground">
                          {item.descricao || "Item disponível no ecossistema Arqdor."}
                        </p>
                      </div>

                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                          Ecossistema
                        </span>
                        {item.totalVendas > 0 && (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            {item.totalVendas} pedido(s)
                          </span>
                        )}
                      </div>

                      <div className="flex items-end justify-between gap-3 border-t pt-3">
                        <div>
                          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Valor
                          </p>
                          <p className="text-base font-semibold text-slate-900">
                            {preco > 0 ? fmt(preco) : "Sob consulta"}
                          </p>
                        </div>

                        <Button
                          size="sm"
                          className="gap-1.5 bg-emerald-700 hover:bg-emerald-800"
                          onClick={() => openBuy(item)}
                        >
                          {preco > 0 ? (
                            <ShoppingCart className="h-3.5 w-3.5" />
                          ) : (
                            <ReceiptText className="h-3.5 w-3.5" />
                          )}
                          {preco > 0 ? "Comprar" : "Solicitar"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        <TabsContent value="fornecedores" className="space-y-4">
          <div className="rounded-xl border bg-white p-5">
            <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center">
              <div>
                <h2 className="text-base font-semibold">Fornecedores do ecossistema</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Empresas com itens disponíveis para compra ou cotação no Market Arqdor.
                </p>
              </div>
              <Badge variant="outline">{fornecedores.length} fornecedor(es)</Badge>
            </div>
          </div>

          {fornecedores.length === 0 ? (
            <div className="rounded-xl border border-dashed bg-white p-14 text-center">
              <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium">Nenhum fornecedor disponível</p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {fornecedores.map((fornecedor, index) => (
                <Card key={fornecedor.tenantId} className="bg-white">
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                          <Building2 className="h-5 w-5" />
                        </span>
                        <div>
                          <p className="text-sm font-semibold">
                            Fornecedor {String(index + 1).padStart(2, "0")}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Parceiro do ecossistema VendorAI
                          </p>
                        </div>
                      </div>
                      <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                        Verificado
                      </Badge>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Ofertas
                        </p>
                        <p className="mt-1 text-sm font-semibold">{fornecedor.itens.length}</p>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-3">
                        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Categorias
                        </p>
                        <p className="mt-1 text-sm font-semibold">
                          {fornecedor.categorias.size}
                        </p>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {[...fornecedor.categorias].slice(0, 4).map((categoria) => (
                        <Badge key={categoria} variant="outline" className="font-normal">
                          {categoria}
                        </Badge>
                      ))}
                    </div>

                    <Button
                      variant="outline"
                      className="mt-4 w-full justify-between"
                      onClick={() => {
                        const firstCategory = [...fornecedor.categorias][0];
                        if (firstCategory) setCatFilter(firstCategory);
                        setActiveTab("market");
                      }}
                    >
                      Ver ofertas
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="pedidos">
          {pedidosLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          )}

          {!pedidosLoading && pedidosLoaded && pedidos.length === 0 && (
            <div className="rounded-xl border border-dashed bg-white p-12 text-center">
              <ReceiptText className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium">Nenhum pedido realizado</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Compras e solicitações feitas no Market aparecem aqui.
              </p>
            </div>
          )}

          {!pedidosLoading && pedidos.length > 0 && (
            <div className="overflow-hidden rounded-xl border bg-white">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50/70">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Data</th>
                    <th className="px-4 py-3 text-left font-medium">Item</th>
                    <th className="px-4 py-3 text-right font-medium">Qtd</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    <th className="px-4 py-3 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pedidos.map((p) => {
                    const st =
                      STATUS_PEDIDO[p.status ?? "pendente"] ??
                      STATUS_PEDIDO.pendente;

                    return (
                      <tr key={p.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 text-muted-foreground">
                          {fmtDate(p.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                          {p.itemId.slice(0, 8)}…
                        </td>
                        <td className="px-4 py-3 text-right">{p.quantidade ?? "—"}</td>
                        <td className="px-4 py-3 text-right font-medium">
                          {p.valorTotal ? fmt(Number(p.valorTotal)) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${st.cls}`}
                            >
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

        <TabsContent value="vitrine">
          {meusProdutosLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          )}

          {!meusProdutosLoading && meusProdutosLoaded && meusProdutos.length === 0 && (
            <div className="rounded-xl border border-dashed bg-white p-12 text-center">
              <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium">Sua vitrine ainda está vazia</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Publique itens do catálogo no Market Arqdor para receber pedidos.
              </p>
            </div>
          )}

          {!meusProdutosLoading && meusProdutos.length > 0 && (
            <div className="overflow-hidden rounded-xl border bg-white">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50/70">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Produto</th>
                    <th className="px-4 py-3 text-left font-medium">Categoria</th>
                    <th className="px-4 py-3 text-right font-medium">Preço</th>
                    <th className="px-4 py-3 text-right font-medium">Pedidos</th>
                    <th className="px-4 py-3 text-center font-medium">Publicado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {meusProdutos.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-4 py-3">
                        <p className="max-w-60 truncate font-medium">{p.nome}</p>
                        {p.descricao && (
                          <p className="max-w-60 truncate text-xs text-muted-foreground">
                            {p.descricao}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {p.categoria ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        {p.preco && Number(p.preco) > 0 ? fmt(Number(p.preco)) : "Sob consulta"}
                      </td>
                      <td className="px-4 py-3 text-right">{p.totalVendas}</td>
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

        <TabsContent value="vendas">
          {vendasLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 rounded-lg" />
              ))}
            </div>
          )}

          {!vendasLoading && vendasLoaded && vendas.length === 0 && (
            <div className="rounded-xl border border-dashed bg-white p-12 text-center">
              <Store className="mx-auto mb-3 h-10 w-10 text-muted-foreground/30" />
              <p className="text-sm font-medium">Nenhuma venda ainda</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pedidos recebidos pela sua vitrine aparecerão aqui.
              </p>
            </div>
          )}

          {!vendasLoading && vendas.length > 0 && (
            <div className="overflow-hidden rounded-xl border bg-white">
              <table className="w-full text-sm">
                <thead className="border-b bg-slate-50/70">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium">Data</th>
                    <th className="px-4 py-3 text-left font-medium">Produto</th>
                    <th className="px-4 py-3 text-right font-medium">Qtd</th>
                    <th className="px-4 py-3 text-right font-medium">Total</th>
                    <th className="px-4 py-3 text-center font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {vendas.map(({ pedido, itemNome }) => {
                    const st =
                      STATUS_PEDIDO[pedido.status ?? "pendente"] ??
                      STATUS_PEDIDO.pendente;

                    return (
                      <tr key={pedido.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3 text-muted-foreground">
                          {fmtDate(pedido.createdAt)}
                        </td>
                        <td className="px-4 py-3 font-medium">{itemNome}</td>
                        <td className="px-4 py-3 text-right">
                          {pedido.quantidade ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-emerald-700">
                          {pedido.valorTotal ? fmt(Number(pedido.valorTotal)) : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex justify-center">
                            <span
                              className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${st.cls}`}
                            >
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
      </Tabs>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-emerald-700" />
              <p className="text-sm font-semibold">Cotação orientada pelo orçamento</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              A entrada pelo orçamento deve filtrar fornecedores pela atividade e pelos
              itens selecionados, preservando quantidade, unidade, especificação e projeto.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <Star className="h-4 w-4 text-emerald-700" />
              <p className="text-sm font-semibold">Reputação e qualidade</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              A classificação do parceiro deve considerar qualidade, pontualidade,
              atendimento, histórico de pedidos e avaliações do ecossistema.
            </p>
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardContent className="p-5">
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-emerald-700" />
              <p className="text-sm font-semibold">Cobertura e logística</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              Região atendida, retirada, entrega, prazo e logística permanecem ligados
              ao mesmo motor comercial utilizado pelo Praça.ai.
            </p>
          </CardContent>
        </Card>
      </section>

      <Dialog open={!!buying} onOpenChange={() => setBuying(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{buying?.preco && Number(buying.preco) > 0 ? "Comprar" : "Solicitar"} — {buying?.nome}</DialogTitle>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            {buying?.preco && Number(buying.preco) > 0 ? (
              <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 p-3">
                <p className="text-xs text-emerald-800/70">Preço unitário</p>
                <p className="text-lg font-bold text-emerald-900">
                  {fmt(Number(buying.preco))}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border bg-slate-50 p-3">
                <p className="text-sm font-medium">Valor sob consulta</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  A solicitação será vinculada ao projeto selecionado quando informado.
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Quantidade</Label>
              <Input
                type="number"
                min="1"
                value={buyQty}
                onChange={(e) => setBuyQty(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label>
                Projeto <span className="text-xs text-muted-foreground">(recomendado)</span>
              </Label>
              <Select value={buyProjeto} onValueChange={setBuyProjeto}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um projeto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Sem projeto</SelectItem>
                  {projetos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {buyProjeto !== "__none__" && (
                <p className="text-xs text-emerald-700">
                  O item ficará ligado ao orçamento e histórico do projeto.
                </p>
              )}
            </div>

            {buying?.preco && Number(buying.preco) > 0 && Number(buyQty) > 0 && (
              <div className="rounded-lg border p-3 text-right">
                <p className="text-xs text-muted-foreground">Total estimado</p>
                <p className="font-bold">
                  {fmt(Number(buying.preco) * Number(buyQty))}
                </p>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setBuying(null)}>
                Cancelar
              </Button>
              <Button
                className="bg-emerald-700 hover:bg-emerald-800"
                onClick={handleComprar}
                disabled={submittingBuy || !buyQty || Number(buyQty) < 1}
              >
                {submittingBuy ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processando…
                  </>
                ) : buying?.preco && Number(buying.preco) > 0 ? (
                  "Confirmar compra"
                ) : (
                  "Enviar solicitação"
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
