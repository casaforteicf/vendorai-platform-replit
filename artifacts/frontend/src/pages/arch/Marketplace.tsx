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
  TrendingUp, DollarSign, ReceiptText, Building2, Star, Send, ClipboardList,
  ShieldCheck, Trash2, Plus, Link2, Copy,
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

type MarketProtectionRule = {
  id: string;
  escopo: "categoria" | "subcategoria" | "produto_servico";
  valor: string;
  modo: "exclusivo" | "preferencial" | "aberto" | "bloqueado";
  prioridade: number;
  ativo: boolean;
  observacoes: string | null;
};

type MarketCompany = {
  id: string;
  nome: string;
  slug: string | null;
  vertical: string | null;
  avaliacao: number | null;
  totalAvaliacoes: number;
  produtosCompativeis: number;
  categorias: string[];
  fotos: string[];
  totalVendas: number;
};

type MarketContextResponse = {
  contexto: {
    busca: string | null;
    categoria: string | null;
    origem: string | null;
    origemId: string | null;
    quantidade: number | null;
    unidade: string | null;
  };
  empresas: MarketCompany[];
  produtos: Array<{
    id: string;
    masterProductId: string | null;
    fornecedorTenantId: string;
    fornecedorNome: string;
    nome: string;
    descricao: string | null;
    categoria: string | null;
    preco: number | null;
    imagens: string[];
    especificacoes: Record<string, unknown>;
    totalVendas: number;
    avaliacaoFornecedor: number | null;
    totalAvaliacoesFornecedor: number;
    acaoPrincipal: "comprar" | "cotar";
  }>;
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

type MarketProposal = {
  proposta: {
    id: string;
    demandaId: string;
    fornecedorTenantId: string;
    status: string;
    valorTotal: string | null;
    frete: string | null;
    desconto: string | null;
    impostos: string | null;
    prazoEntregaDias: number | null;
    validadeAte: string | null;
    condicaoPagamento: string | null;
    observacoes: string | null;
    itens: Array<Record<string, unknown>>;
  };
  fornecedorNome: string;
};

type MarketDemand = {
  id: string;
  titulo: string;
  descricao: string | null;
  categoria: string | null;
  produtoServico: string | null;
  quantidade: string | null;
  unidade: string | null;
  visibilidade: string;
  prazoResposta: string | null;
  dataNecessidade: string | null;
  compradorNome: string | null;
  conviteStatus: string | null;
  origemAcesso: "convite" | "market";
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
  const { user, isEffectiveAdmin } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const urlParams = new URLSearchParams(window.location.search);
  const contextOrigem = urlParams.get("origem");
  const contextOrigemId = urlParams.get("origemId");
  const contextQuantidade = urlParams.get("quantidade");
  const contextUnidade = urlParams.get("unidade");
  const contextProjetoId = urlParams.get("projetoId");
  const contextObraId = urlParams.get("obraId");
  const contextOrcamentoId = urlParams.get("orcamentoId");
  const contextOrcamentoItemId = urlParams.get("orcamentoItemId");
  const contextRenderId = urlParams.get("renderId");
  const contextAtividadeId = urlParams.get("atividadeId");
  const contextEtapaId = urlParams.get("etapaId");

  // ── Explorar state
  const [items, setItems]           = useState<MarketplaceItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [itemsLoaded, setItemsLoaded]   = useState(false);
  const [busca, setBusca]           = useState(() => urlParams.get("q") ?? urlParams.get("busca") ?? "");
  const [catFilter, setCatFilter]   = useState(() => urlParams.get("categoria") ?? "__all__");
  const [companies, setCompanies]   = useState<MarketCompany[]>([]);
  const [resultMode, setResultMode] = useState<"tudo" | "empresas" | "produtos">("tudo");
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishTitle, setPublishTitle] = useState(() => urlParams.get("titulo") ?? urlParams.get("q") ?? "");
  const [publishVisibility, setPublishVisibility] = useState<"privada" | "parceiros" | "regional" | "aberta">("privada");
  const [publishSupplierIds, setPublishSupplierIds] = useState<string[]>([]);
  const [submittingPublish, setSubmittingPublish] = useState(false);
  const [protectionOpen, setProtectionOpen] = useState(false);
  const [publicExperienceOpen, setPublicExperienceOpen] = useState(false);
  const [publicExperienceLoading, setPublicExperienceLoading] = useState(false);
  const [publicExperienceSaving, setPublicExperienceSaving] = useState(false);
  const [publicExperience, setPublicExperience] = useState({
    enabled: false,
    showOnSite: false,
    siteButtonLabel: "Projete sua casa",
    siteButtonColor: "#f97316",
    marketEnabled: false,
    headline: "",
    subheadline: "",
    logoUrl: "",
    primaryColor: "#f97316",
    embedEnabled: true,
    marketButtonLabel: "Ver produtos e soluções",
    publicPath: "",
    embedCode: "",
  });
  const [protectionRules, setProtectionRules] = useState<MarketProtectionRule[]>([]);
  const [protectionLoading, setProtectionLoading] = useState(false);
  const [protectionSaving, setProtectionSaving] = useState(false);
  const [newProtectionScope, setNewProtectionScope] = useState<MarketProtectionRule["escopo"]>("categoria");
  const [newProtectionValue, setNewProtectionValue] = useState("");
  const [newProtectionMode, setNewProtectionMode] = useState<MarketProtectionRule["modo"]>("exclusivo");
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

  // ── Minhas cotações state
  const [minhasDemandas, setMinhasDemandas] = useState<MarketDemand[]>([]);
  const [minhasDemandasLoading, setMinhasDemandasLoading] = useState(false);
  const [minhasDemandasLoaded, setMinhasDemandasLoaded] = useState(false);
  const [proposalDemand, setProposalDemand] = useState<MarketDemand | null>(null);
  const [proposalOptions, setProposalOptions] = useState<MarketProposal[]>([]);
  const [proposalOptionsLoading, setProposalOptionsLoading] = useState(false);
  const [selectingProposalId, setSelectingProposalId] = useState<string | null>(null);

  // ── Cotações recebidas state
  const [demandasRecebidas, setDemandasRecebidas] = useState<MarketDemand[]>([]);
  const [demandasLoading, setDemandasLoading] = useState(false);
  const [demandasLoaded, setDemandasLoaded] = useState(false);
  const [respondendoDemanda, setRespondendoDemanda] = useState<MarketDemand | null>(null);
  const [proposalTotal, setProposalTotal] = useState("");
  const [proposalLeadDays, setProposalLeadDays] = useState("");
  const [proposalPayment, setProposalPayment] = useState("");
  const [proposalNotes, setProposalNotes] = useState("");
  const [submittingProposal, setSubmittingProposal] = useState(false);

  // ── Vendas state
  const [vendas, setVendas]                 = useState<Venda[]>([]);
  const [totalComissoes, setTotalComissoes] = useState(0);
  const [vendasLoading, setVendasLoading]   = useState(false);
  const [vendasLoaded, setVendasLoaded]     = useState(false);

  // ── Loaders ────────────────────────────────────────────────────────────
  const loadItems = useCallback(async () => {
    setItemsLoading(true);
    const params = new URLSearchParams({ limit: "60" });
    if (busca)                   params.set("busca", busca);
    if (catFilter !== "__all__") params.set("categoria", catFilter);
    if (contextOrigem)           params.set("origem", contextOrigem);
    if (contextOrigemId)         params.set("origemId", contextOrigemId);
    if (contextQuantidade)       params.set("quantidade", contextQuantidade);
    if (contextUnidade)          params.set("unidade", contextUnidade);
    const res = await fetch(`/api/arch/market/contexto?${params}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) {
      const data: MarketContextResponse = await res.json();
      setCompanies(data.empresas ?? []);
      setItems((data.produtos ?? []).map((p) => ({
        id: p.id,
        vendedorTenantId: p.fornecedorTenantId,
        nome: p.nome,
        descricao: p.descricao,
        categoria: p.categoria,
        preco: p.preco == null ? null : String(p.preco),
        comissaoVendorai: null,
        imagens: p.imagens,
        ativo: true,
        totalVendas: p.totalVendas,
        createdAt: new Date().toISOString(),
      })));
    } else {
      setCompanies([]);
      setItems([]);
    }
    setItemsLoading(false);
    setItemsLoaded(true);
  }, [busca, catFilter, contextOrigem, contextOrigemId, contextQuantidade, contextUnidade]);

  async function openPublicExperience() {
    setPublicExperienceOpen(true);
    setPublicExperienceLoading(true);
    try {
      const res = await fetch("/api/arch/public-link", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        setPublicExperience({
          enabled: Boolean(body.enabled),
          showOnSite: Boolean(body.showOnSite),
          siteButtonLabel: body.siteButtonLabel ?? "Projete sua casa",
          siteButtonColor: body.siteButtonColor ?? "#f97316",
          marketEnabled: Boolean(body.marketEnabled),
          headline: body.headline ?? "",
          subheadline: body.subheadline ?? "",
          logoUrl: body.logoUrl ?? "",
          primaryColor: body.primaryColor ?? "#f97316",
          embedEnabled: body.embedEnabled !== false,
          marketButtonLabel: body.marketButtonLabel ?? "Ver produtos e soluções",
          publicPath: body.publicPath ?? "",
          embedCode: body.embedCode ?? "",
        });
      } else {
        throw new Error(body?.error ?? "Não foi possível carregar a configuração pública.");
      }
    } catch (err: any) {
      toast({ title: "Erro ao carregar experiência pública", description: err.message, variant: "destructive" });
    } finally {
      setPublicExperienceLoading(false);
    }
  }

  async function savePublicExperience() {
    setPublicExperienceSaving(true);
    try {
      const res = await fetch("/api/arch/public-link", {
        method: "PUT",
        headers: authH(),
        body: JSON.stringify(publicExperience),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Não foi possível salvar.");
      toast({ title: "Experiência pública atualizada" });
      await openPublicExperience();
    } catch (err: any) {
      toast({ title: "Erro ao salvar", description: err.message, variant: "destructive" });
    } finally {
      setPublicExperienceSaving(false);
    }
  }

  async function copyPublicValue(value: string, label: string) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    toast({ title: `${label} copiado` });
  }

  async function loadProtectionRules() {
    setProtectionLoading(true);
    try {
      const res = await fetch("/api/arch/market/protecoes", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setProtectionRules(await res.json());
    } finally {
      setProtectionLoading(false);
    }
  }

  async function openProtectionConfig() {
    setProtectionOpen(true);
    await loadProtectionRules();
  }

  async function saveProtectionRule() {
    const value = newProtectionValue.trim();
    if (!value) {
      toast({ title: "Informe a categoria, subcategoria ou produto/serviço.", variant: "destructive" });
      return;
    }
    setProtectionSaving(true);
    try {
      const res = await fetch("/api/arch/market/protecoes", {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({
          escopo: newProtectionScope,
          valor: value,
          modo: newProtectionMode,
          prioridade: newProtectionScope === "produto_servico" ? 10 : newProtectionScope === "subcategoria" ? 20 : 30,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.formErrors?.[0] ?? body?.error ?? "Não foi possível salvar a regra.");
      setNewProtectionValue("");
      await loadProtectionRules();
      await loadItems();
      toast({ title: "Proteção comercial atualizada" });
    } catch (err: any) {
      toast({ title: "Erro ao salvar proteção", description: String(err?.message ?? err), variant: "destructive" });
    } finally {
      setProtectionSaving(false);
    }
  }

  async function deleteProtectionRule(id: string) {
    const res = await fetch(`/api/arch/market/protecoes/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) {
      toast({ title: "Não foi possível remover a regra", variant: "destructive" });
      return;
    }
    setProtectionRules((rules) => rules.filter((rule) => rule.id !== id));
    await loadItems();
  }

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

  const loadMinhasDemandas = useCallback(async () => {
    if (minhasDemandasLoaded) return;
    setMinhasDemandasLoading(true);
    try {
      const res = await fetch("/api/arch/market/demandas/minhas", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setMinhasDemandas(await res.json());
    } finally {
      setMinhasDemandasLoading(false);
      setMinhasDemandasLoaded(true);
    }
  }, [minhasDemandasLoaded]);

  async function openDemandProposals(demanda: MarketDemand) {
    setProposalDemand(demanda);
    setProposalOptions([]);
    setProposalOptionsLoading(true);
    try {
      const res = await fetch(`/api/arch/market/demandas/${demanda.id}/propostas`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setProposalOptions(await res.json());
    } finally {
      setProposalOptionsLoading(false);
    }
  }

  async function selectMarketProposal(propostaId: string) {
    if (!proposalDemand) return;
    setSelectingProposalId(propostaId);
    try {
      const res = await fetch(`/api/arch/market/demandas/${proposalDemand.id}/propostas/${propostaId}/selecionar`, {
        method: "POST",
        headers: authH(),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Não foi possível selecionar a proposta.");
      setProposalDemand(null);
      setMinhasDemandasLoaded(false);
      toast({
        title: "Proposta selecionada",
        description: body?.procurementSync?.synced
          ? body.procurementSync.requiresReconciliation
            ? "Proposta vinculada às cotações da obra; alguns itens precisam de reconciliação."
            : "Proposta vinculada automaticamente à cotação da obra."
          : "A seleção foi registrada no Arqdor Market.",
      });
    } catch (err: any) {
      toast({ title: "Erro ao selecionar", description: err.message, variant: "destructive" });
    } finally {
      setSelectingProposalId(null);
    }
  }

  const loadDemandasRecebidas = useCallback(async () => {
    if (demandasLoaded) return;
    setDemandasLoading(true);
    try {
      const res = await fetch("/api/arch/market/demandas/recebidas", {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (res.ok) setDemandasRecebidas(await res.json());
    } finally {
      setDemandasLoading(false);
      setDemandasLoaded(true);
    }
  }, [demandasLoaded]);

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

  async function handlePublicarNecessidade() {
    const title = publishTitle.trim() || busca.trim();
    if (!title) {
      toast({ title: "Informe a necessidade", description: "Dê um nome para a cotação que será publicada.", variant: "destructive" });
      return;
    }

    setSubmittingPublish(true);
    try {
      const res = await fetch("/api/arch/market/demandas", {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({
          origem: contextOrigem ?? "manual",
          origemId: contextOrigemId ?? undefined,
          projetoId: contextProjetoId ?? undefined,
          obraId: contextObraId ?? undefined,
          orcamentoId: contextOrcamentoId ?? undefined,
          orcamentoItemId: contextOrcamentoItemId ?? undefined,
          renderId: contextRenderId ?? undefined,
          atividadeId: contextAtividadeId ?? undefined,
          etapaId: contextEtapaId ?? undefined,
          titulo: title,
          descricao: busca ? `Necessidade originada do contexto: ${busca}` : undefined,
          categoria: catFilter !== "__all__" ? catFilter : undefined,
          produtoServico: busca || title,
          quantidade: contextQuantidade ? Number(contextQuantidade) : undefined,
          unidade: contextUnidade ?? undefined,
          visibilidade: publishVisibility,
          fornecedorTenantIds: publishSupplierIds,
          publicar: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Não foi possível publicar a necessidade.");
      }
      setPublishOpen(false);
      setPublishSupplierIds([]);
      toast({ title: "Necessidade publicada", description: "Ela já está disponível no Arqdor Market conforme a visibilidade escolhida." });
    } catch (err: any) {
      toast({ title: "Erro ao publicar", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingPublish(false);
    }
  }

  function openResponderDemanda(demanda: MarketDemand) {
    setRespondendoDemanda(demanda);
    setProposalTotal("");
    setProposalLeadDays("");
    setProposalPayment("");
    setProposalNotes("");
  }

  async function handleEnviarProposta() {
    if (!respondendoDemanda) return;
    const total = Number(proposalTotal);
    if (!Number.isFinite(total) || total < 0) {
      toast({ title: "Informe um valor total válido", variant: "destructive" });
      return;
    }
    setSubmittingProposal(true);
    try {
      const res = await fetch(`/api/arch/market/demandas/${respondendoDemanda.id}/propostas`, {
        method: "POST",
        headers: authH(),
        body: JSON.stringify({
          valorTotal: total,
          prazoEntregaDias: proposalLeadDays ? Number(proposalLeadDays) : undefined,
          condicaoPagamento: proposalPayment || undefined,
          observacoes: proposalNotes || undefined,
          itens: [{
            descricao: respondendoDemanda.produtoServico || respondendoDemanda.titulo,
            quantidade: respondendoDemanda.quantidade ? Number(respondendoDemanda.quantidade) : undefined,
            unidade: respondendoDemanda.unidade || undefined,
            valorTotal: total,
          }],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Não foi possível enviar a proposta.");
      }
      setRespondendoDemanda(null);
      setDemandasLoaded(false);
      toast({ title: "Proposta enviada", description: "O comprador recebeu sua resposta dentro do Arqdor Market." });
    } catch (err: any) {
      toast({ title: "Erro ao enviar proposta", description: err.message, variant: "destructive" });
    } finally {
      setSubmittingProposal(false);
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Arqdor Market</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Encontre empresas, produtos e serviços compatíveis com o contexto técnico do seu projeto e orçamento.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isEffectiveAdmin && (
              <>
                <Button variant="outline" onClick={openPublicExperience}>
                  <Link2 className="h-4 w-4 mr-2" /> Link do parceiro
                </Button>
                <Button variant="outline" onClick={openProtectionConfig}>
                  <ShieldCheck className="h-4 w-4 mr-2" /> Proteção comercial
                </Button>
              </>
            )}
          <Button variant="outline" onClick={() => { setPublishSupplierIds([]); setPublishOpen(true); }}>
            <Send className="h-4 w-4 mr-2" /> Publicar necessidade
          </Button>
          </div>
        </div>
      </div>

      <Tabs defaultValue="explorar">
        <TabsList>
          <TabsTrigger value="explorar">Explorar</TabsTrigger>
          <TabsTrigger value="minhas-cotacoes" onClick={loadMinhasDemandas}>Minhas cotações</TabsTrigger>
          <TabsTrigger value="cotacoes" onClick={loadDemandasRecebidas}>Cotações recebidas</TabsTrigger>
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

          {(contextOrigem || contextQuantidade || contextUnidade) && (
            <div className="rounded-xl border bg-violet-50/60 border-violet-200 p-4">
              <div className="flex items-start gap-3">
                <ClipboardList className="h-5 w-5 text-violet-700 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-violet-950">Necessidade do projeto</p>
                  <p className="text-sm text-violet-800 mt-1">
                    {busca || "Item técnico"}
                    {contextQuantidade ? ` · ${contextQuantidade}${contextUnidade ? ` ${contextUnidade}` : ""}` : ""}
                  </p>
                  <p className="text-xs text-violet-700 mt-1">
                    O Market está priorizando fornecedores e produtos compatíveis com este contexto.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant={resultMode === "tudo" ? "default" : "outline"} onClick={() => setResultMode("tudo")}>
              Tudo
            </Button>
            <Button size="sm" variant={resultMode === "empresas" ? "default" : "outline"} onClick={() => setResultMode("empresas")}>
              Empresas {companies.length > 0 ? `(${companies.length})` : ""}
            </Button>
            <Button size="sm" variant={resultMode === "produtos" ? "default" : "outline"} onClick={() => setResultMode("produtos")}>
              Produtos {items.length > 0 ? `(${items.length})` : ""}
            </Button>
          </div>

          {!itemsLoading && (resultMode === "tudo" || resultMode === "empresas") && companies.length > 0 && (
            <div className="space-y-2">
              <div>
                <p className="text-sm font-semibold">Empresas compatíveis</p>
                <p className="text-xs text-muted-foreground">Parceiros do ecossistema com produtos relacionados à necessidade.</p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {companies.map(company => (
                  <Card key={company.id} className="overflow-hidden">
                    {company.fotos[0] && (
                      <div className="h-28 bg-muted">
                        <img src={company.fotos[0]} alt={company.nome} className="h-full w-full object-cover" />
                      </div>
                    )}
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-violet-700" />
                            <p className="font-semibold text-sm truncate">{company.nome}</p>
                          </div>
                          <p className="text-xs text-muted-foreground mt-1">
                            {company.produtosCompativeis} produto(s) compatível(is)
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          {company.avaliacao != null ? (
                            <div className="flex items-center gap-1 text-sm font-semibold">
                              <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                              {company.avaliacao.toFixed(1)}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">Sem avaliações</span>
                          )}
                          {company.totalAvaliacoes > 0 && (
                            <p className="text-[11px] text-muted-foreground">{company.totalAvaliacoes} avaliação(ões)</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {company.categorias.slice(0, 4).map(cat => <Badge key={cat} variant="secondary">{cat}</Badge>)}
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => setResultMode("produtos")}>
                          Ver produtos
                        </Button>
                        <Button size="sm" className="flex-1" onClick={() => {
                          setPublishTitle(busca || `Cotação para ${company.nome}`);
                          setPublishVisibility("privada");
                          setPublishSupplierIds([company.id]);
                          setPublishOpen(true);
                        }}>
                          Solicitar cotação
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}


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
                  : "Outros arquitetos ainda não publicaram produtos."}
              </p>
            </div>
          )}

          {!itemsLoading && (resultMode === "tudo" || resultMode === "produtos") && items.length > 0 && (
            <div className="space-y-2">
              <div>
                <p className="text-sm font-semibold">Produtos compatíveis</p>
                <p className="text-xs text-muted-foreground">Compra direta quando houver preço; itens sob consulta seguem para cotação.</p>
              </div>
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
                        {item.preco && Number(item.preco) > 0 ? (
                          <Button size="sm" className="h-7 text-xs" onClick={() => openBuy(item)}>
                            <ShoppingCart className="h-3 w-3 mr-1" /> Comprar
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                            setPublishTitle(`Cotação — ${item.nome}`);
                            setPublishVisibility("privada");
                            setPublishSupplierIds([item.vendedorTenantId]);
                            setPublishOpen(true);
                          }}>
                            <Send className="h-3 w-3 mr-1" /> Cotar
                          </Button>
                        )}
                      </div>
                      {item.totalVendas > 0 && (
                        <p className="text-xs text-muted-foreground">{item.totalVendas} venda(s)</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="minhas-cotacoes" className="mt-4 space-y-3">
          {minhasDemandasLoading && (
            <div className="space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
            </div>
          )}
          {!minhasDemandasLoading && minhasDemandasLoaded && minhasDemandas.length === 0 && (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <Send className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-medium text-sm">Nenhuma necessidade publicada</p>
              <p className="text-xs text-muted-foreground mt-1">Publique uma necessidade para receber propostas de fornecedores.</p>
            </div>
          )}
          {!minhasDemandasLoading && minhasDemandas.map((demanda) => (
            <Card key={demanda.id}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{demanda.titulo}</p>
                      <Badge variant={demanda.status === "adjudicada" ? "default" : "secondary"}>{demanda.status}</Badge>
                      <Badge variant="outline">{demanda.visibilidade}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {demanda.quantidade ? `${demanda.quantidade} ${demanda.unidade ?? ""}` : demanda.produtoServico ?? demanda.descricao ?? "Necessidade técnica"}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => openDemandProposals(demanda)}>
                    Ver propostas
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="cotacoes" className="mt-4 space-y-3">
          {demandasLoading && (
            <div className="space-y-2">
              {[1,2,3].map(i => <Skeleton key={i} className="h-28 rounded-xl" />)}
            </div>
          )}
          {!demandasLoading && demandasLoaded && demandasRecebidas.length === 0 && (
            <div className="rounded-lg border border-dashed p-12 text-center">
              <ClipboardList className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
              <p className="font-medium text-sm">Nenhuma cotação disponível</p>
              <p className="text-xs text-muted-foreground mt-1">Convites e oportunidades do Market aparecerão aqui.</p>
            </div>
          )}
          {!demandasLoading && demandasRecebidas.map((demanda) => (
            <Card key={demanda.id}>
              <CardContent className="p-4">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{demanda.titulo}</p>
                      <Badge variant={demanda.origemAcesso === "convite" ? "default" : "secondary"}>
                        {demanda.origemAcesso === "convite" ? "Convite" : "Market"}
                      </Badge>
                      {demanda.categoria && <Badge variant="outline">{demanda.categoria}</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {demanda.compradorNome ? `Solicitante: ${demanda.compradorNome}` : "Solicitante protegido"}
                    </p>
                    {(demanda.quantidade || demanda.unidade) && (
                      <p className="text-sm">
                        Quantidade: <strong>{demanda.quantidade ?? "—"} {demanda.unidade ?? ""}</strong>
                      </p>
                    )}
                    {demanda.descricao && <p className="text-sm text-muted-foreground">{demanda.descricao}</p>}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {demanda.dataNecessidade && <span>Necessidade: {fmtDate(demanda.dataNecessidade)}</span>}
                      {demanda.prazoResposta && <span>Responder até: {fmtDate(demanda.prazoResposta)}</span>}
                    </div>
                  </div>
                  <Button size="sm" onClick={() => openResponderDemanda(demanda)}>
                    <Send className="h-4 w-4 mr-2" /> Enviar proposta
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
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

      <Dialog open={publicExperienceOpen} onOpenChange={setPublicExperienceOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Experiência pública do parceiro</DialogTitle>
          </DialogHeader>
          {publicExperienceLoading ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
          ) : (
            <div className="space-y-5 mt-2 max-h-[72vh] overflow-y-auto pr-1">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm font-medium">
                  Link público ativo
                  <Switch checked={publicExperience.enabled} onCheckedChange={(checked) => setPublicExperience((v) => ({ ...v, enabled: checked }))} />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm font-medium">
                  Market no pré-projeto
                  <Switch checked={publicExperience.marketEnabled} onCheckedChange={(checked) => setPublicExperience((v) => ({ ...v, marketEnabled: checked }))} />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm font-medium">
                  Botão no site gerado
                  <Switch checked={publicExperience.showOnSite} onCheckedChange={(checked) => setPublicExperience((v) => ({ ...v, showOnSite: checked }))} />
                </label>
                <label className="flex items-center justify-between gap-3 rounded-xl border p-3 text-sm font-medium">
                  Permitir embed/iframe
                  <Switch checked={publicExperience.embedEnabled} onCheckedChange={(checked) => setPublicExperience((v) => ({ ...v, embedEnabled: checked }))} />
                </label>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Título público</Label>
                  <Input value={publicExperience.headline} onChange={(e) => setPublicExperience((v) => ({ ...v, headline: e.target.value }))} placeholder="Projete a sua casa" />
                </div>
                <div className="space-y-1.5">
                  <Label>Texto do botão do Market</Label>
                  <Input value={publicExperience.marketButtonLabel} onChange={(e) => setPublicExperience((v) => ({ ...v, marketButtonLabel: e.target.value }))} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Subtítulo</Label>
                  <Input value={publicExperience.subheadline} onChange={(e) => setPublicExperience((v) => ({ ...v, subheadline: e.target.value }))} placeholder="Crie seu pré-projeto e encontre soluções compatíveis." />
                </div>
                <div className="space-y-1.5">
                  <Label>Logo pública (URL)</Label>
                  <Input value={publicExperience.logoUrl} onChange={(e) => setPublicExperience((v) => ({ ...v, logoUrl: e.target.value }))} placeholder="https://..." />
                </div>
                <div className="space-y-1.5">
                  <Label>Cor principal</Label>
                  <div className="flex gap-2">
                    <input type="color" value={publicExperience.primaryColor} onChange={(e) => setPublicExperience((v) => ({ ...v, primaryColor: e.target.value }))} className="h-10 w-12 rounded border p-1" />
                    <Input value={publicExperience.primaryColor} onChange={(e) => setPublicExperience((v) => ({ ...v, primaryColor: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="rounded-xl border bg-muted/30 p-4 space-y-3">
                <p className="text-sm font-semibold">Link para colocar no site do parceiro</p>
                <div className="flex gap-2">
                  <Input readOnly value={publicExperience.publicPath ? `${window.location.origin}${publicExperience.publicPath}` : ""} />
                  <Button variant="outline" size="icon" onClick={() => void copyPublicValue(publicExperience.publicPath ? `${window.location.origin}${publicExperience.publicPath}` : "", "Link")}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {publicExperience.embedEnabled && (
                  <>
                    <p className="text-sm font-semibold pt-1">Código para incorporar no próprio site</p>
                    <div className="flex gap-2">
                      <Input readOnly value={publicExperience.embedCode} />
                      <Button variant="outline" size="icon" onClick={() => void copyPublicValue(publicExperience.embedCode, "Código de incorporação")}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
                <p className="text-xs text-muted-foreground">
                  O Market público usa as mesmas regras de Proteção comercial. Categorias exclusivas do parceiro não exibem concorrentes.
                </p>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setPublicExperienceOpen(false)}>Fechar</Button>
                <Button onClick={savePublicExperience} disabled={publicExperienceSaving}>
                  {publicExperienceSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Salvando…</> : "Salvar experiência"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={protectionOpen} onOpenChange={setProtectionOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Proteção comercial do Arqdor Market</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 mt-2">
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <p className="font-medium">Como funciona</p>
              <p className="text-muted-foreground mt-1">
                A proteção vale para toda entrada contextual do Market deste tenant. Em <strong>Exclusivo</strong>, apenas sua empresa aparece naquela atividade.
                Em <strong>Preferencial</strong>, sua empresa vem primeiro. Em <strong>Aberto</strong>, o Market mostra terceiros normalmente.
                Em <strong>Bloqueado</strong>, a categoria não é exibida.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-[170px_1fr_170px_auto]">
              <Select value={newProtectionScope} onValueChange={(value) => setNewProtectionScope(value as MarketProtectionRule["escopo"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="categoria">Categoria</SelectItem>
                  <SelectItem value="subcategoria">Subcategoria</SelectItem>
                  <SelectItem value="produto_servico">Produto/serviço</SelectItem>
                </SelectContent>
              </Select>
              <Input
                value={newProtectionValue}
                onChange={(e) => setNewProtectionValue(e.target.value)}
                placeholder={newProtectionScope === "categoria" ? "Ex.: Materiais de construção" : newProtectionScope === "subcategoria" ? "Ex.: Cimento" : "Ex.: Cimento CP-II"}
              />
              <Select value={newProtectionMode} onValueChange={(value) => setNewProtectionMode(value as MarketProtectionRule["modo"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="exclusivo">Exclusivo</SelectItem>
                  <SelectItem value="preferencial">Preferencial</SelectItem>
                  <SelectItem value="aberto">Aberto</SelectItem>
                  <SelectItem value="bloqueado">Bloqueado</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={saveProtectionRule} disabled={protectionSaving}>
                {protectionSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>

            <div className="space-y-2 max-h-[45vh] overflow-y-auto">
              {protectionLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando regras…</div>
              ) : protectionRules.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  Nenhuma proteção comercial configurada. Sem regras, o Market não mostra os próprios produtos do tenant e opera normalmente com terceiros.
                </div>
              ) : protectionRules.map((rule) => (
                <div key={rule.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{rule.escopo.replace("_", "/")}</Badge>
                      <span className="font-medium text-sm">{rule.valor}</span>
                      <Badge variant={rule.modo === "exclusivo" ? "default" : "secondary"}>{rule.modo}</Badge>
                    </div>
                    {rule.observacoes && <p className="text-xs text-muted-foreground mt-1">{rule.observacoes}</p>}
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => deleteProtectionRule(rule.id)} title="Remover regra">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!proposalDemand} onOpenChange={() => setProposalDemand(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Propostas — {proposalDemand?.titulo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2 max-h-[65vh] overflow-y-auto">
            {proposalOptionsLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando propostas…</div>
            ) : proposalOptions.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Ainda não há propostas para esta cotação.</p>
            ) : proposalOptions.map(({ proposta, fornecedorNome }) => (
              <div key={proposta.id} className="rounded-xl border p-4 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">{fornecedorNome}</p>
                    <p className="text-xs text-muted-foreground">
                      {proposta.prazoEntregaDias != null ? `Entrega em ${proposta.prazoEntregaDias} dias` : "Prazo não informado"}
                      {proposta.condicaoPagamento ? ` · ${proposta.condicaoPagamento}` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-lg">{proposta.valorTotal != null ? fmt(Number(proposta.valorTotal)) : "Valor não informado"}</p>
                    <Badge variant="outline">{proposta.status}</Badge>
                  </div>
                </div>
                {(proposta.frete || proposta.desconto || proposta.impostos) && (
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {proposta.frete && <span>Frete: {fmt(Number(proposta.frete))}</span>}
                    {proposta.desconto && <span>Desconto: {fmt(Number(proposta.desconto))}</span>}
                    {proposta.impostos && <span>Impostos: {fmt(Number(proposta.impostos))}</span>}
                  </div>
                )}
                {proposta.observacoes && <p className="text-sm text-muted-foreground">{proposta.observacoes}</p>}
                {proposalDemand?.status !== "adjudicada" && proposta.status !== "recusada" && (
                  <div className="flex justify-end">
                    <Button size="sm" onClick={() => selectMarketProposal(proposta.id)} disabled={selectingProposalId !== null}>
                      {selectingProposalId === proposta.id ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Selecionando…</> : "Selecionar proposta"}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!respondendoDemanda} onOpenChange={() => setRespondendoDemanda(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Responder cotação — {respondendoDemanda?.titulo}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Valor total da proposta</Label>
              <Input type="number" min="0" step="0.01" value={proposalTotal} onChange={e => setProposalTotal(e.target.value)} placeholder="0,00" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Prazo de entrega (dias)</Label>
                <Input type="number" min="0" value={proposalLeadDays} onChange={e => setProposalLeadDays(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Condição de pagamento</Label>
                <Input value={proposalPayment} onChange={e => setProposalPayment(e.target.value)} placeholder="Ex.: 28 dias" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Observações</Label>
              <Input value={proposalNotes} onChange={e => setProposalNotes(e.target.value)} placeholder="Marca, frete, disponibilidade, condições..." />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRespondendoDemanda(null)}>Cancelar</Button>
              <Button onClick={handleEnviarProposta} disabled={submittingProposal}>
                {submittingProposal ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Enviando…</> : <><Send className="h-4 w-4 mr-2" />Enviar proposta</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Publicar necessidade no Arqdor Market</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Título da necessidade</Label>
              <Input value={publishTitle} onChange={e => setPublishTitle(e.target.value)} placeholder="Ex.: Cimento CP-II — 80 sacos" />
            </div>
            <div className="space-y-1.5">
              <Label>Quem pode visualizar</Label>
              <Select value={publishVisibility} onValueChange={(value) => setPublishVisibility(value as typeof publishVisibility)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="privada">Privada — somente empresas convidadas</SelectItem>
                  <SelectItem value="parceiros">Rede de parceiros</SelectItem>
                  <SelectItem value="regional">Market regional</SelectItem>
                  <SelectItem value="aberta">Market aberto</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Dados pessoais do cliente e valores internos do orçamento não são publicados por esta ação.
                {publishSupplierIds.length > 0 ? ` Esta cotação será enviada diretamente para ${publishSupplierIds.length} empresa(s) selecionada(s).` : ""}
              </p>
            </div>
            {(contextQuantidade || contextUnidade || contextOrigem) && (
              <div className="rounded-lg border bg-muted/40 p-3 text-xs space-y-1">
                <p className="font-medium text-sm">Contexto enviado com a cotação</p>
                {contextQuantidade && <p>Quantidade: {contextQuantidade} {contextUnidade ?? ""}</p>}
                {contextOrigem && <p>Origem: {contextOrigem}</p>}
                {catFilter !== "__all__" && <p>Categoria: {catFilter}</p>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPublishOpen(false)}>Cancelar</Button>
              <Button onClick={handlePublicarNecessidade} disabled={submittingPublish}>
                {submittingPublish ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Publicando…</> : <><Send className="h-4 w-4 mr-2" />Publicar</>}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
