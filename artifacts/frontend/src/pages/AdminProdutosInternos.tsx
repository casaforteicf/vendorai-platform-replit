import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  BarChart3,
  Boxes,
  CheckCircle2,
  Coins,
  Gauge,
  Layers3,
  Loader2,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Trash2,
  Users,
  WalletCards,
} from "lucide-react";

type TipoProduto = "servico" | "produto" | "oferta" | "etapa";
type OfferKind = "free" | "subscription" | "module" | "prepaid_pass" | "consumption_pack" | "service";
type ViewMode = "commercial" | "library";

interface ProdutoInterno {
  id: string;
  categoria: string;
  nome: string;
  descricaoUso: string;
  tipo: TipoProduto;
  nichosRelacionados: string[];
  ordem: number;
  ativo: boolean;
}

interface CommercialProduct {
  commercialKey: string;
  offerKind: OfferKind;
  includedInGrowth: boolean;
  maxUsers: number | null;
  moduleKeys: string[];
  segmentKeys: string[];
  benefits: string[];
  dependencies: string[];
  active: boolean;
  displayOrder: number;
  catalogProductId: string | null;
  name: string | null;
  sku: string | null;
  monthlyPrice: string | number | null;
  basePrice: string | number | null;
  implementationPrice: string | number | null;
  recurring: string | null;
  catalogActive: boolean | null;
}

interface UsageQuota {
  id: string;
  commercialKey: string;
  metricKey: string;
  monthlyQuantity: string | number | null;
  hardCapQuantity: string | number | null;
  overageAllowed: boolean;
  active: boolean;
}

interface UsageMetric {
  key: string;
  name: string;
  unitSingular: string;
  unitPlural: string;
  vendorCreditsPerUnit: number;
  customerVisible: boolean;
  active: boolean;
}

interface UsageRow {
  commercialKey: string | null;
  metricKey: string;
  quantity: string | number;
  vendorCredits: string | number;
  costUsd: string | number;
  events: string | number;
}

interface CommercialModelResponse {
  products: CommercialProduct[];
  quotas: UsageQuota[];
  metrics: UsageMetric[];
  usage: UsageRow[];
  enforcementMode: "measure_only" | string;
}

interface QuotaDraft {
  monthly: string;
  hardCap: string;
  overageAllowed: boolean;
}

const TIPO_LABEL: Record<TipoProduto, string> = {
  servico: "Serviço",
  produto: "Solução",
  oferta: "Oferta",
  etapa: "Etapa do processo",
};
const TIPO_STYLE: Record<TipoProduto, string> = {
  servico: "border-blue-300 text-blue-700 bg-blue-50",
  produto: "border-primary/30 text-primary bg-primary/5",
  oferta: "border-amber-300 text-amber-700 bg-amber-50",
  etapa: "border-violet-300 text-violet-700 bg-violet-50",
};
const OFFER_LABEL: Record<OfferKind, string> = {
  free: "Entrada grátis",
  subscription: "Plano",
  module: "Módulo",
  prepaid_pass: "Pré-pago",
  consumption_pack: "Pacote de consumo",
  service: "Serviço",
};
const OFFER_STYLE: Record<OfferKind, string> = {
  free: "border-emerald-300 bg-emerald-50 text-emerald-700",
  subscription: "border-blue-300 bg-blue-50 text-blue-700",
  module: "border-blue-300 bg-blue-50 text-blue-700",
  prepaid_pass: "border-violet-300 bg-violet-50 text-violet-700",
  consumption_pack: "border-amber-300 bg-amber-50 text-amber-700",
  service: "border-slate-300 bg-slate-50 text-slate-700",
};

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

function money(value: string | number | null | undefined) {
  const numberValue = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number.isFinite(numberValue) ? numberValue : 0);
}

function usd(value: string | number | null | undefined) {
  const numberValue = Number(value ?? 0);
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(Number.isFinite(numberValue) ? numberValue : 0);
}

function numericOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

export default function AdminProdutosInternos() {
  const { toast } = useToast();
  const [view, setView] = useState<ViewMode>("commercial");

  const [commercial, setCommercial] = useState<CommercialModelResponse | null>(null);
  const [commercialLoading, setCommercialLoading] = useState(true);
  const [commercialSaving, setCommercialSaving] = useState<string | null>(null);
  const [quotaSaving, setQuotaSaving] = useState<string | null>(null);
  const [quotaDrafts, setQuotaDrafts] = useState<Record<string, QuotaDraft>>({});
  const [commercialSearch, setCommercialSearch] = useState("");

  const [produtos, setProdutos] = useState<ProdutoInterno[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | TipoProduto>("todos");
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<ProdutoInterno | null>(null);
  const [form, setForm] = useState({ categoria: "", nome: "", descricaoUso: "", tipo: "produto" as TipoProduto, nichosTexto: "" });
  const [salvando, setSalvando] = useState(false);

  async function carregarModeloComercial() {
    setCommercialLoading(true);
    try {
      const r = await fetch("/api/admin/commercial-model", { headers: authHeaders() });
      const body = await r.json().catch(() => null) as CommercialModelResponse | { error?: string } | null;
      if (!r.ok || !body || !("products" in body)) throw new Error(body && "error" in body ? body.error : "Falha ao carregar modelo comercial");
      setCommercial(body);
      const drafts: Record<string, QuotaDraft> = {};
      for (const quota of body.quotas ?? []) {
        drafts[`${quota.commercialKey}:${quota.metricKey}`] = {
          monthly: quota.monthlyQuantity == null ? "" : String(quota.monthlyQuantity),
          hardCap: quota.hardCapQuantity == null ? "" : String(quota.hardCapQuantity),
          overageAllowed: quota.overageAllowed,
        };
      }
      setQuotaDrafts(drafts);
    } catch (error) {
      toast({ title: "Erro ao carregar Produtos & Monetização", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setCommercialLoading(false);
    }
  }

  async function carregar() {
    setLoading(true);
    try {
      const r = await fetch("/api/admin/produtos-internos", { headers: authHeaders() });
      if (!r.ok) throw new Error("Falha ao carregar");
      setProdutos(await r.json());
    } catch {
      toast({ title: "Erro ao carregar serviços e etapas", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void Promise.all([carregarModeloComercial(), carregar()]);
  }, []);

  const commercialProducts = useMemo(() => {
    const search = commercialSearch.trim().toLowerCase();
    const rows = commercial?.products ?? [];
    if (!search) return rows;
    return rows.filter((product) => [product.name, product.sku, product.commercialKey, ...(product.moduleKeys ?? []), ...(product.segmentKeys ?? [])]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search)));
  }, [commercial, commercialSearch]);

  const commercialSummary = useMemo(() => {
    const products = commercial?.products ?? [];
    const usage = commercial?.usage ?? [];
    return {
      active: products.filter((product) => product.active).length,
      growth: products.filter((product) => product.active && product.includedInGrowth).length,
      recurringValue: products
        .filter((product) => product.active)
        .reduce((sum, product) => sum + Number(product.monthlyPrice ?? 0), 0),
      costUsd: usage.reduce((sum, item) => sum + Number(item.costUsd ?? 0), 0),
      vendorCredits: usage.reduce((sum, item) => sum + Number(item.vendorCredits ?? 0), 0),
    };
  }, [commercial]);

  const metricsByKey = useMemo(() => new Map((commercial?.metrics ?? []).map((metric) => [metric.key, metric])), [commercial]);
  const usageByProductMetric = useMemo(() => {
    const map = new Map<string, UsageRow>();
    for (const item of commercial?.usage ?? []) {
      map.set(`${item.commercialKey ?? ""}:${item.metricKey}`, item);
    }
    return map;
  }, [commercial]);

  const porCategoria = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtrados = produtos.filter((p) => {
      if (filtroTipo !== "todos" && p.tipo !== filtroTipo) return false;
      if (!termo) return true;
      return p.nome.toLowerCase().includes(termo) || p.descricaoUso.toLowerCase().includes(termo) || p.categoria.toLowerCase().includes(termo);
    });
    const grupos = new Map<string, ProdutoInterno[]>();
    for (const p of filtrados) {
      const lista = grupos.get(p.categoria) ?? [];
      lista.push(p);
      grupos.set(p.categoria, lista);
    }
    return grupos;
  }, [produtos, busca, filtroTipo]);

  async function patchCommercialProduct(product: CommercialProduct, patch: Partial<Pick<CommercialProduct, "includedInGrowth" | "active">>) {
    setCommercialSaving(product.commercialKey);
    try {
      const r = await fetch(`/api/admin/commercial-model/products/${encodeURIComponent(product.commercialKey)}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const body = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? "Falha ao atualizar produto comercial");
      await carregarModeloComercial();
      toast({ title: "Produto comercial atualizado" });
    } catch (error) {
      toast({ title: "Erro ao atualizar produto", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setCommercialSaving(null);
    }
  }

  async function saveQuota(quota: UsageQuota) {
    const key = `${quota.commercialKey}:${quota.metricKey}`;
    const draft = quotaDrafts[key] ?? { monthly: "", hardCap: "", overageAllowed: quota.overageAllowed };
    setQuotaSaving(key);
    try {
      const r = await fetch(`/api/admin/commercial-model/products/${encodeURIComponent(quota.commercialKey)}/quotas/${encodeURIComponent(quota.metricKey)}`, {
        method: "PATCH",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyQuantity: numericOrNull(draft.monthly),
          hardCapQuantity: numericOrNull(draft.hardCap),
          overageAllowed: draft.overageAllowed,
        }),
      });
      const body = await r.json().catch(() => ({})) as { error?: string };
      if (!r.ok) throw new Error(body.error ?? "Falha ao atualizar franquia");
      await carregarModeloComercial();
      toast({ title: "Franquia atualizada" });
    } catch (error) {
      toast({ title: "Erro ao salvar franquia", description: error instanceof Error ? error.message : undefined, variant: "destructive" });
    } finally {
      setQuotaSaving(null);
    }
  }

  function abrirNovo() {
    setEditando(null);
    setForm({ categoria: "", nome: "", descricaoUso: "", tipo: "servico", nichosTexto: "" });
    setModalOpen(true);
  }

  function abrirEdicao(p: ProdutoInterno) {
    setEditando(p);
    setForm({ categoria: p.categoria, nome: p.nome, descricaoUso: p.descricaoUso, tipo: p.tipo, nichosTexto: (p.nichosRelacionados ?? []).join(", ") });
    setModalOpen(true);
  }

  async function salvar() {
    if (!form.categoria.trim() || !form.nome.trim() || !form.descricaoUso.trim()) return;
    setSalvando(true);
    try {
      const url = editando ? `/api/admin/produtos-internos/${editando.id}` : "/api/admin/produtos-internos";
      const nichosRelacionados = form.nichosTexto.split(",").map((n) => n.trim()).filter(Boolean);
      const r = await fetch(url, {
        method: editando ? "PATCH" : "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ categoria: form.categoria, nome: form.nome, descricaoUso: form.descricaoUso, tipo: form.tipo, nichosRelacionados }),
      });
      if (!r.ok) throw new Error("Falha ao salvar");
      setModalOpen(false);
      await carregar();
      toast({ title: editando ? "Item atualizado" : "Item criado" });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  }

  async function excluir(p: ProdutoInterno) {
    if (!confirm(`Excluir "${p.nome}"?`)) return;
    try {
      const r = await fetch(`/api/admin/produtos-internos/${p.id}`, { method: "DELETE", headers: authHeaders() });
      if (!r.ok) throw new Error("Falha ao excluir");
      await carregar();
      toast({ title: "Item excluído" });
    } catch {
      toast({ title: "Erro ao excluir", variant: "destructive" });
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <WalletCards className="h-6 w-6 text-blue-500" />
            Produtos & Monetização
          </h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            Central comercial do VendorAI: o catálogo define o que é vendido e o preço; esta tela liga cada oferta aos módulos técnicos, Growth, franquias, consumo e custo real.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void carregarModeloComercial()} disabled={commercialLoading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${commercialLoading ? "animate-spin" : ""}`} />
          Atualizar dados
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 rounded-xl border bg-muted/30 p-1.5">
        <Button type="button" size="sm" variant={view === "commercial" ? "default" : "ghost"} onClick={() => setView("commercial")}>
          <Coins className="mr-1.5 h-4 w-4" /> Produtos comerciais
        </Button>
        <Button type="button" size="sm" variant={view === "library" ? "default" : "ghost"} onClick={() => setView("library")}>
          <Package className="mr-1.5 h-4 w-4" /> Biblioteca interna
        </Button>
      </div>

      {view === "commercial" ? (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Card><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Ofertas ativas</span><CheckCircle2 className="h-4 w-4 text-emerald-600" /></div><p className="mt-2 text-2xl font-semibold">{commercialSummary.active}</p></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Incluídas no Growth</span><Sparkles className="h-4 w-4 text-blue-500" /></div><p className="mt-2 text-2xl font-semibold">{commercialSummary.growth}</p></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Valor modular listado</span><Layers3 className="h-4 w-4 text-blue-600" /></div><p className="mt-2 text-xl font-semibold">{money(commercialSummary.recurringValue)}<span className="text-xs font-normal text-muted-foreground">/mês</span></p></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Custo medido no mês</span><BarChart3 className="h-4 w-4 text-violet-600" /></div><p className="mt-2 text-xl font-semibold">{usd(commercialSummary.costUsd)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><div className="flex items-center justify-between"><span className="text-xs text-muted-foreground">Vendor Credits medidos</span><Gauge className="h-4 w-4 text-amber-600" /></div><p className="mt-2 text-2xl font-semibold">{commercialSummary.vendorCredits.toLocaleString("pt-BR")}</p></CardContent></Card>
          </div>

          <Card className="border-blue-200 bg-blue-50/40">
            <CardContent className="grid gap-4 p-4 md:grid-cols-4">
              <div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">CRM Free</p><p className="mt-1 text-sm">Porta de entrada permanente, 1 usuário.</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Por módulos</p><p className="mt-1 text-sm">Cliente assina somente as capacidades de que precisa.</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Growth</p><p className="mt-1 text-sm">R$ 1.490/mês, usuários ilimitados e módulos aplicáveis ao segmento.</p></div>
              <div><p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Growth por período</p><p className="mt-1 text-sm">5 dias grátis/mês e blocos adicionais de 5 dias por R$ 399.</p></div>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[240px] max-w-lg flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={commercialSearch} onChange={(event) => setCommercialSearch(event.target.value)} placeholder="Buscar produto, SKU, módulo técnico ou segmento..." className="pl-9" />
            </div>
            <Badge variant="outline" className="h-8 px-3">Enforcement: {commercial?.enforcementMode === "measure_only" ? "somente medição" : commercial?.enforcementMode ?? "—"}</Badge>
          </div>

          {commercialLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : !commercial ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">O modelo comercial ainda não está disponível neste ambiente.</CardContent></Card>
          ) : commercialProducts.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum produto comercial encontrado.</CardContent></Card>
          ) : (
            <div className="space-y-4">
              {commercialProducts.map((product) => {
                const productQuotas = (commercial.quotas ?? []).filter((quota) => quota.commercialKey === product.commercialKey);
                const canBeInGrowth = product.offerKind === "module" || (product.offerKind === "subscription" && product.commercialKey !== "vendor.growth");
                const monthly = Number(product.monthlyPrice ?? 0);
                const base = Number(product.basePrice ?? 0);
                const priceLabel = monthly > 0 ? `${money(monthly)}/mês` : base > 0 ? money(base) : "Sem preço no catálogo";
                const saving = commercialSaving === product.commercialKey;
                return (
                  <Card key={product.commercialKey} className={!product.active ? "opacity-70" : undefined}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <CardTitle className="text-base">{product.name ?? product.commercialKey}</CardTitle>
                            <Badge variant="outline" className={`text-[10px] ${OFFER_STYLE[product.offerKind]}`}>{OFFER_LABEL[product.offerKind]}</Badge>
                            {product.includedInGrowth && <Badge className="bg-blue-500 text-white hover:bg-blue-500">Incluído no Growth</Badge>}
                            {product.catalogActive === false && <Badge variant="destructive">Catálogo inativo</Badge>}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>{product.sku ?? "SKU ainda não vinculado"}</span>
                            <span className="font-medium text-foreground">{priceLabel}</span>
                            <span>{product.maxUsers == null ? "Usuários conforme oferta" : `Até ${product.maxUsers} usuário${product.maxUsers === 1 ? "" : "s"}`}</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-4 rounded-lg border bg-muted/20 px-3 py-2">
                          {canBeInGrowth && (
                            <label className="flex items-center gap-2 text-xs"><span>Growth</span><Switch checked={product.includedInGrowth} disabled={saving} onCheckedChange={(checked) => void patchCommercialProduct(product, { includedInGrowth: checked })} /></label>
                          )}
                          <label className="flex items-center gap-2 text-xs"><span>Oferta ativa</span><Switch checked={product.active} disabled={saving} onCheckedChange={(checked) => void patchCommercialProduct(product, { active: checked })} /></label>
                          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid gap-4 xl:grid-cols-[1.1fr_1fr]">
                        <div className="space-y-3">
                          <div>
                            <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold"><Boxes className="h-3.5 w-3.5" />Módulos técnicos liberados</div>
                            <div className="flex flex-wrap gap-1.5">
                              {(product.moduleKeys ?? []).length > 0 ? product.moduleKeys.map((moduleKey) => <Badge key={moduleKey} variant="secondary" className="font-mono text-[10px]">{moduleKey}</Badge>) : <span className="text-xs text-muted-foreground">Nenhum módulo técnico associado.</span>}
                            </div>
                          </div>
                          {(product.segmentKeys ?? []).length > 0 && (
                            <div><p className="mb-1.5 text-xs font-semibold">Aplicação por segmento</p><div className="flex flex-wrap gap-1.5">{product.segmentKeys.map((segment) => <Badge key={segment} variant="outline" className="text-[10px]">{segment}</Badge>)}</div></div>
                          )}
                          {(product.benefits ?? []).length > 0 && (
                            <div><p className="mb-1.5 text-xs font-semibold">Valor entregue</p><div className="grid gap-1 sm:grid-cols-2">{product.benefits.slice(0, 6).map((benefit) => <div key={benefit} className="flex gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" /><span>{benefit}</span></div>)}</div></div>
                          )}
                        </div>

                        <div className="rounded-lg border bg-muted/10 p-3">
                          <div className="mb-3 flex items-center justify-between gap-2"><div><p className="text-xs font-semibold">Franquias e consumo</p><p className="text-[11px] text-muted-foreground">Cliente vê unidades reais; Vendor Credits ficam na camada interna.</p></div><Gauge className="h-4 w-4 text-muted-foreground" /></div>
                          {productQuotas.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Sem franquia específica cadastrada. O acesso continua sendo medido sem bloqueio.</p>
                          ) : (
                            <div className="space-y-3">
                              {productQuotas.map((quota) => {
                                const quotaKey = `${quota.commercialKey}:${quota.metricKey}`;
                                const metric = metricsByKey.get(quota.metricKey);
                                const usage = usageByProductMetric.get(quotaKey);
                                const draft = quotaDrafts[quotaKey] ?? { monthly: quota.monthlyQuantity == null ? "" : String(quota.monthlyQuantity), hardCap: quota.hardCapQuantity == null ? "" : String(quota.hardCapQuantity), overageAllowed: quota.overageAllowed };
                                const monthlyQuantity = Number(quota.monthlyQuantity ?? 0);
                                const usedQuantity = Number(usage?.quantity ?? 0);
                                const percent = monthlyQuantity > 0 ? Math.min(100, (usedQuantity / monthlyQuantity) * 100) : 0;
                                return (
                                  <div key={quotaKey} className="space-y-2 rounded-md border bg-background p-2.5">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div><p className="text-xs font-medium">{metric?.name ?? quota.metricKey}</p><p className="text-[10px] text-muted-foreground">{usedQuantity.toLocaleString("pt-BR")} usados no mês · {Number(usage?.vendorCredits ?? 0).toLocaleString("pt-BR")} credits · {usd(usage?.costUsd)}</p></div>
                                      {monthlyQuantity > 0 && <Badge variant="outline" className="text-[10px]">{percent.toFixed(0)}%</Badge>}
                                    </div>
                                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end">
                                      <label className="space-y-1"><span className="text-[10px] text-muted-foreground">Franquia/mês</span><Input className="h-8 text-xs" type="number" min="0" step="1" value={draft.monthly} onChange={(event) => setQuotaDrafts((current) => ({ ...current, [quotaKey]: { ...draft, monthly: event.target.value } }))} placeholder="Ilimitado" /></label>
                                      <label className="space-y-1"><span className="text-[10px] text-muted-foreground">Teto técnico</span><Input className="h-8 text-xs" type="number" min="0" step="1" value={draft.hardCap} onChange={(event) => setQuotaDrafts((current) => ({ ...current, [quotaKey]: { ...draft, hardCap: event.target.value } }))} placeholder="Sem teto" /></label>
                                      <label className="flex h-8 items-center gap-2 whitespace-nowrap text-[10px]"><Switch checked={draft.overageAllowed} onCheckedChange={(checked) => setQuotaDrafts((current) => ({ ...current, [quotaKey]: { ...draft, overageAllowed: checked } }))} />Excedente</label>
                                      <Button type="button" size="sm" variant="outline" className="h-8" disabled={quotaSaving === quotaKey} onClick={() => void saveQuota(quota)}>{quotaSaving === quotaKey ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}</Button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <Card className="border-dashed">
            <CardContent className="p-4 text-sm text-muted-foreground">
              A Biblioteca interna continua separada da camada comercial. Ela descreve serviços, soluções, ofertas e etapas usados por IA, atendimento e materiais; não libera telas nem gera cobrança automaticamente.
            </CardContent>
          </Card>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div><h2 className="text-lg font-semibold">Serviços, soluções e etapas</h2><p className="mt-1 text-sm text-muted-foreground">Conteúdo interno que complementa o catálogo comercial.</p></div>
            <Button type="button" onClick={abrirNovo}><Plus className="h-4 w-4 mr-1.5" />Novo item</Button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1 min-w-[200px]"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" /><Input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar serviço, etapa, solução ou categoria..." className="pl-9" /></div>
            <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as "todos" | TipoProduto)}><SelectTrigger className="w-[190px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="todos">Todos os tipos</SelectItem><SelectItem value="servico">Serviço</SelectItem><SelectItem value="etapa">Etapa do processo</SelectItem><SelectItem value="produto">Solução</SelectItem><SelectItem value="oferta">Oferta</SelectItem></SelectContent></Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : porCategoria.size === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-10">Nenhum item encontrado.</p>
          ) : (
            Array.from(porCategoria.entries()).map(([categoria, itens]) => (
              <div key={categoria} className="space-y-2"><div className="flex items-center gap-2"><h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{categoria}</h2><Badge variant="outline" className="text-[10px]">{itens.length}</Badge></div><div className="grid grid-cols-1 md:grid-cols-2 gap-2">{itens.map((p) => (
                <Card key={p.id}><CardContent className="py-3 flex items-start justify-between gap-2"><div className="min-w-0"><div className="flex items-center gap-1.5 flex-wrap"><p className="text-sm font-medium">{p.nome}</p><Badge variant="outline" className={`text-[10px] ${TIPO_STYLE[p.tipo]}`}>{TIPO_LABEL[p.tipo]}</Badge></div><p className="text-xs text-muted-foreground mt-0.5">{p.descricaoUso}</p>{(p.nichosRelacionados?.length ?? 0) > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{p.nichosRelacionados.map((n, i) => <span key={i} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{n}</span>)}</div>}</div><div className="flex gap-1 shrink-0"><Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={() => abrirEdicao(p)}><Pencil className="h-3.5 w-3.5" /></Button><Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => excluir(p)}><Trash2 className="h-3.5 w-3.5" /></Button></div></CardContent></Card>
              ))}</div></div>
            ))
          )}
        </>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editando ? "Editar item" : "Novo item"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><div className="space-y-1.5"><p className="text-sm font-medium">Categoria</p><Input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Ex: Atendimento, Obras, Implantação..." /></div><div className="space-y-1.5"><p className="text-sm font-medium">Tipo</p><Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as TipoProduto })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="servico">Serviço</SelectItem><SelectItem value="etapa">Etapa do processo</SelectItem><SelectItem value="produto">Solução</SelectItem><SelectItem value="oferta">Oferta</SelectItem></SelectContent></Select></div></div>
            <div className="space-y-1.5"><p className="text-sm font-medium">Nome</p><Input value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Ex: Instalação, Projeto executivo, Agente SDR..." /></div>
            <div className="space-y-1.5"><p className="text-sm font-medium">Descrição de uso</p><Textarea value={form.descricaoUso} onChange={(e) => setForm({ ...form, descricaoUso: e.target.value })} rows={3} placeholder="Explique objetivamente o serviço, etapa ou solução e quando ela é usada." /></div>
            <div className="space-y-1.5"><p className="text-sm font-medium">Nichos relacionados (opcional)</p><Input value={form.nichosTexto} onChange={(e) => setForm({ ...form, nichosTexto: e.target.value })} placeholder="Ex: Farmácia, Construção, Imobiliária (separado por vírgula)" /><p className="text-xs text-muted-foreground">Deixe em branco quando o item puder ser usado em qualquer segmento.</p></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button><Button type="button" onClick={salvar} disabled={salvando}>{salvando && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
