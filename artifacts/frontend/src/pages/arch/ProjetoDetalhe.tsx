import { useState, useEffect, useCallback } from "react";
import { useRoute, Link } from "wouter";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Plus, Sparkles, Loader2, Pencil, Trash2, Link2,
  Search, LayoutGrid, DollarSign, Clock,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────
type Projeto = {
  id: string;
  titulo: string;
  clienteNome: string | null;
  status: string;
  tipoObra: string | null;
  areaM2: string | null;
  orcamentoTotal: string | null;
  portalAtivo: boolean;
};

type Ambiente = {
  id: string;
  nome: string;
  areaM2: string | null;
  descricao: string | null;
  ordem: number;
};

type OrcamentoItem = {
  id: string;
  ambienteId: string | null;
  categoria: string | null;
  descricao: string;
  quantidade: string;
  unidade: string | null;
  valorUnitario: string;
  valorTotal: string;
  fornecedor: string | null;
  geradoPorIa: boolean;
  produtoId: string | null;
};

type OrcamentoGrupo = {
  ambienteId: string | null;
  categoria: string | null;
  itens: OrcamentoItem[];
  totalCategoria: number;
};

type CatalogoProduto = {
  id: string;
  nome: string;
  categoria: string | null;
  precoBase: string | null;
  fornecedor: string | null;
};

// ── Constants ──────────────────────────────────────────────────────────────
const CATEGORIAS = ["Móveis", "Iluminação", "Revestimentos", "Elétrica", "Hidráulica", "Marcenaria", "Acessórios", "Pintura", "Outros"];

const STATUS_CLASS: Record<string, string> = {
  briefing:    "bg-gray-100 text-gray-700 border-gray-200",
  orcamento:   "bg-blue-50 text-blue-700 border-blue-200",
  aprovado:    "bg-green-50 text-green-700 border-green-200",
  em_execucao: "bg-amber-50 text-amber-700 border-amber-200",
  entregue:    "bg-emerald-50 text-emerald-800 border-emerald-200",
  cancelado:   "bg-red-50 text-red-700 border-red-200",
};

const STATUS_LABEL: Record<string, string> = {
  briefing: "Briefing", orcamento: "Orçamento", aprovado: "Aprovado",
  em_execucao: "Em Execução", entregue: "Entregue", cancelado: "Cancelado",
};

const EMPTY_ITEM = {
  ambienteId: "__none__", categoria: "Móveis", descricao: "",
  quantidade: "1", unidade: "un", valorUnitario: "0", fornecedor: "",
};

const EMPTY_AMB = { nome: "", areaM2: "", descricao: "" };

// ── Helpers ────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem("vendorai_token"); }
function getBase()  { return (import.meta.env.BASE_URL ?? "/").replace(/\/$/, ""); }
function fmt(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function authH(): Record<string, string> {
  return { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` };
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_CLASS[status] ?? "bg-gray-100 text-gray-700"}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────
export default function ProjetoDetalhe() {
  const [, params] = useRoute("/arch/projetos/:id");
  const projetoId = params?.id ?? "";
  const { toast } = useToast();
  const { user } = useAuth();

  // ── Project data
  const [projeto, setProjeto]     = useState<Projeto | null>(null);
  const [ambientes, setAmbientes] = useState<Ambiente[]>([]);
  const [loading, setLoading]     = useState(true);

  // ── Orçamento data
  const [grupos, setGrupos]         = useState<OrcamentoGrupo[]>([]);
  const [totalGeral, setTotalGeral] = useState(0);
  const [orcLoading, setOrcLoading] = useState(false);
  const [gerandoIA, setGerandoIA]   = useState(false);

  // ── Item dialog state
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<OrcamentoItem | null>(null);
  const [itemForm, setItemForm]       = useState({ ...EMPTY_ITEM });
  const [savingItem, setSavingItem]   = useState(false);

  // ── Vincular dialog state
  const [vinculandoItem, setVinculandoItem]     = useState<OrcamentoItem | null>(null);
  const [catalogSearch, setCatalogSearch]       = useState("");
  const [catalogResults, setCatalogResults]     = useState<CatalogoProduto[]>([]);
  const [selectedProduto, setSelectedProduto]   = useState<CatalogoProduto | null>(null);
  const [vinculando, setVinculando]             = useState(false);

  // ── Ambiente dialog state
  const [addAmbienteOpen, setAddAmbienteOpen]     = useState(false);
  const [editingAmbiente, setEditingAmbiente]     = useState<Ambiente | null>(null);
  const [ambienteForm, setAmbienteForm]           = useState({ ...EMPTY_AMB });
  const [savingAmbiente, setSavingAmbiente]       = useState(false);

  // ── Data loaders ───────────────────────────────────────────────────────
  const loadProjeto = useCallback(async () => {
    if (!projetoId) return;
    const res = await fetch(`${getBase()}/api/arch/projetos/${projetoId}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setProjeto(data.projeto ?? null);
    setAmbientes(data.ambientes ?? []);
  }, [projetoId]);

  const loadOrcamento = useCallback(async () => {
    if (!projetoId) return;
    setOrcLoading(true);
    const res = await fetch(`${getBase()}/api/arch/projetos/${projetoId}/orcamento`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok) {
      const data = await res.json();
      setGrupos(data.grupos ?? []);
      setTotalGeral(Number(data.totalGeral ?? 0));
    }
    setOrcLoading(false);
  }, [projetoId]);

  useEffect(() => {
    if (!projetoId) return;
    setLoading(true);
    Promise.all([loadProjeto(), loadOrcamento()]).finally(() => setLoading(false));
  }, [projetoId]);

  // ── Helpers ────────────────────────────────────────────────────────────
  function nomeAmbiente(id: string | null): string {
    if (!id) return "Sem ambiente";
    return ambientes.find((a) => a.id === id)?.nome ?? "Ambiente";
  }

  function countItens(ambId: string): number {
    return grupos
      .filter((g) => g.ambienteId === ambId)
      .reduce((s, g) => s + g.itens.length, 0);
  }

  // Group orcamento itens by ambienteId
  const byAmbiente: Record<string, OrcamentoGrupo[]> = {};
  for (const g of grupos) {
    const key = g.ambienteId ?? "__sem__";
    if (!byAmbiente[key]) byAmbiente[key] = [];
    byAmbiente[key].push(g);
  }

  // ── Gerar com IA ───────────────────────────────────────────────────────
  async function gerarIA() {
    setGerandoIA(true);
    try {
      const res = await fetch(`${getBase()}/api/arch/projetos/${projetoId}/orcamento/gerar-ia`, {
        method: "POST",
        headers: authH(),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Falha ao gerar orçamento.");
      }
      await Promise.all([loadOrcamento(), loadProjeto()]);
      toast({ title: "Orçamento gerado com IA!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setGerandoIA(false);
    }
  }

  // ── Item CRUD ──────────────────────────────────────────────────────────
  function openAddItem() {
    setItemForm({ ...EMPTY_ITEM });
    setEditingItem(null);
    setAddItemOpen(true);
  }

  function openEditItem(item: OrcamentoItem) {
    setItemForm({
      ambienteId:    item.ambienteId ?? "__none__",
      categoria:     item.categoria ?? "Móveis",
      descricao:     item.descricao,
      quantidade:    item.quantidade,
      unidade:       item.unidade ?? "un",
      valorUnitario: item.valorUnitario,
      fornecedor:    item.fornecedor ?? "",
    });
    setEditingItem(item);
    setAddItemOpen(true);
  }

  async function handleSaveItem(e: React.FormEvent) {
    e.preventDefault();
    setSavingItem(true);
    try {
      const ambId = itemForm.ambienteId === "__none__" ? undefined : itemForm.ambienteId || undefined;
      const body = {
        ambienteId:    ambId,
        categoria:     itemForm.categoria || undefined,
        descricao:     itemForm.descricao,
        quantidade:    Number(itemForm.quantidade),
        unidade:       itemForm.unidade || undefined,
        valorUnitario: Number(itemForm.valorUnitario),
        fornecedor:    itemForm.fornecedor || undefined,
      };

      const url = editingItem
        ? `${getBase()}/api/arch/orcamento/${editingItem.id}`
        : `${getBase()}/api/arch/projetos/${projetoId}/orcamento`;

      const res = await fetch(url, {
        method: editingItem ? "PATCH" : "POST",
        headers: authH(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Falha ao salvar item.");
      }
      setAddItemOpen(false);
      await Promise.all([loadOrcamento(), loadProjeto()]);
      toast({ title: editingItem ? "Item atualizado!" : "Item adicionado!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingItem(false);
    }
  }

  async function deleteItem(id: string) {
    const res = await fetch(`${getBase()}/api/arch/orcamento/${id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (res.ok || res.status === 204) {
      await Promise.all([loadOrcamento(), loadProjeto()]);
      toast({ title: "Item removido." });
    }
  }

  // ── Vincular produto ───────────────────────────────────────────────────
  async function searchCatalogo(busca: string) {
    if (!busca.trim()) { setCatalogResults([]); return; }
    const res = await fetch(
      `${getBase()}/api/arch/catalogo?busca=${encodeURIComponent(busca)}&limit=10`,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    );
    if (res.ok) setCatalogResults(await res.json());
  }

  function openVincular(item: OrcamentoItem) {
    setVinculandoItem(item);
    setCatalogSearch("");
    setCatalogResults([]);
    setSelectedProduto(null);
  }

  async function handleVincular() {
    if (!vinculandoItem || !selectedProduto) return;
    setVinculando(true);
    try {
      const res = await fetch(
        `${getBase()}/api/arch/orcamento/${vinculandoItem.id}/vincular-produto`,
        { method: "POST", headers: authH(), body: JSON.stringify({ produtoId: selectedProduto.id }) },
      );
      if (!res.ok) throw new Error("Falha ao vincular produto.");
      setVinculandoItem(null);
      await loadOrcamento();
      toast({ title: "Produto vinculado!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setVinculando(false);
    }
  }

  // ── Ambientes CRUD ─────────────────────────────────────────────────────
  function openAddAmbiente() {
    setAmbienteForm({ ...EMPTY_AMB });
    setEditingAmbiente(null);
    setAddAmbienteOpen(true);
  }

  function openEditAmbiente(amb: Ambiente) {
    setAmbienteForm({ nome: amb.nome, areaM2: amb.areaM2 ?? "", descricao: amb.descricao ?? "" });
    setEditingAmbiente(amb);
    setAddAmbienteOpen(true);
  }

  async function handleSaveAmbiente(e: React.FormEvent) {
    e.preventDefault();
    setSavingAmbiente(true);
    try {
      const body = {
        nome:      ambienteForm.nome,
        areaM2:    ambienteForm.areaM2 ? Number(ambienteForm.areaM2) : undefined,
        descricao: ambienteForm.descricao || undefined,
      };
      const url = editingAmbiente
        ? `${getBase()}/api/arch/projetos/${projetoId}/ambientes/${editingAmbiente.id}`
        : `${getBase()}/api/arch/projetos/${projetoId}/ambientes`;
      const res = await fetch(url, {
        method: editingAmbiente ? "PATCH" : "POST",
        headers: authH(),
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Falha ao salvar ambiente.");
      }
      setAddAmbienteOpen(false);
      await loadProjeto();
      toast({ title: editingAmbiente ? "Ambiente atualizado!" : "Ambiente adicionado!" });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setSavingAmbiente(false);
    }
  }

  async function deleteAmbiente(id: string) {
    const res = await fetch(
      `${getBase()}/api/arch/projetos/${projetoId}/ambientes/${id}`,
      { method: "DELETE", headers: { Authorization: `Bearer ${getToken()}` } },
    );
    if (res.ok || res.status === 204) {
      await loadProjeto();
      toast({ title: "Ambiente removido." });
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-5 p-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!projeto) {
    return (
      <div className="max-w-6xl mx-auto p-6">
        <p className="text-destructive">Projeto não encontrado.</p>
        <Link href="/arch/projetos"><Button variant="outline" className="mt-4"><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button></Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Back link */}
      <Link href="/arch/projetos">
        <Button variant="ghost" size="sm" className="-ml-2">
          <ArrowLeft className="h-4 w-4 mr-1" /> Projetos
        </Button>
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{projeto.titulo}</h1>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
            {projeto.clienteNome && <span>👤 {projeto.clienteNome}</span>}
            {projeto.tipoObra    && <span>🏗 {projeto.tipoObra}</span>}
            {projeto.areaM2      && <span>📐 {Number(projeto.areaM2).toFixed(0)} m²</span>}
            {projeto.orcamentoTotal && Number(projeto.orcamentoTotal) > 0 && (
              <span className="font-medium text-green-700">💰 {fmt(Number(projeto.orcamentoTotal))}</span>
            )}
          </div>
        </div>
        <StatusBadge status={projeto.status} />
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <Tabs defaultValue="orcamento">
        <TabsList>
          <TabsTrigger value="orcamento">Orçamento</TabsTrigger>
          <TabsTrigger value="ambientes">Ambientes</TabsTrigger>
          <TabsTrigger value="cenas">Cenas 3D</TabsTrigger>
          <TabsTrigger value="portal">Portal</TabsTrigger>
        </TabsList>

        {/* ═══════════════════════════════════════════════════════════════
            ABA: ORÇAMENTO
        ════════════════════════════════════════════════════════════════ */}
        <TabsContent value="orcamento" className="space-y-4 mt-4">
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={gerarIA} disabled={gerandoIA}>
              {gerandoIA
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Gerando orçamento...</>
                : <><Sparkles className="h-4 w-4 mr-2" />Gerar com IA</>}
            </Button>
            <Button onClick={openAddItem}>
              <Plus className="h-4 w-4 mr-2" /> Adicionar item
            </Button>
          </div>

          {orcLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : grupos.length === 0 ? (
            <div className="rounded-lg border p-12 text-center">
              <DollarSign className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum item no orçamento ainda</p>
              <p className="text-sm text-muted-foreground mt-1">
                Clique em "Gerar com IA" (recomendado: cadastre ambientes primeiro) ou "Adicionar item".
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(byAmbiente).map(([ambKey, cats]) => (
                <div key={ambKey}>
                  <h3 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
                    {ambKey === "__sem__" ? "Sem ambiente" : nomeAmbiente(cats[0].ambienteId)}
                  </h3>

                  <div className="space-y-3">
                    {cats.map((grupo) => (
                      <div key={`${grupo.ambienteId}-${grupo.categoria}`} className="rounded-lg border overflow-hidden">
                        <div className="bg-muted/40 px-4 py-2 flex items-center justify-between border-b">
                          <span className="text-sm font-medium">{grupo.categoria ?? "Sem categoria"}</span>
                          <span className="text-sm text-muted-foreground">{fmt(grupo.totalCategoria)}</span>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="text-muted-foreground bg-background border-b">
                              <tr>
                                <th className="px-4 py-2 text-left font-medium">Descrição</th>
                                <th className="px-4 py-2 text-right font-medium">Qtd</th>
                                <th className="px-4 py-2 text-left font-medium hidden sm:table-cell">Unidade</th>
                                <th className="px-4 py-2 text-right font-medium hidden md:table-cell">Valor Unit.</th>
                                <th className="px-4 py-2 text-right font-medium">Total</th>
                                <th className="px-4 py-2 text-left font-medium hidden lg:table-cell">Fornecedor</th>
                                <th className="px-4 py-2 text-center font-medium">Ações</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y bg-background">
                              {grupo.itens.map((item) => (
                                <tr key={item.id} className="hover:bg-muted/20 transition-colors">
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center gap-2">
                                      <span>{item.descricao}</span>
                                      {item.geradoPorIa && (
                                        <span className="inline-flex items-center rounded-full border border-purple-200 bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
                                          IA
                                        </span>
                                      )}
                                      {item.produtoId && (
                                        <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                                          Catálogo
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-2.5 text-right">{Number(item.quantidade)}</td>
                                  <td className="px-4 py-2.5 hidden sm:table-cell text-muted-foreground">{item.unidade ?? "—"}</td>
                                  <td className="px-4 py-2.5 text-right hidden md:table-cell">{fmt(Number(item.valorUnitario))}</td>
                                  <td className="px-4 py-2.5 text-right font-medium">{fmt(Number(item.valorTotal))}</td>
                                  <td className="px-4 py-2.5 hidden lg:table-cell text-muted-foreground text-xs">{item.fornecedor ?? "—"}</td>
                                  <td className="px-4 py-2.5">
                                    <div className="flex items-center justify-center gap-0.5">
                                      <Button
                                        variant="ghost" size="sm" className="h-7 w-7 p-0"
                                        title="Editar"
                                        onClick={() => openEditItem(item)}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button
                                        variant="ghost" size="sm" className="h-7 w-7 p-0 text-blue-600"
                                        title="Vincular produto do catálogo"
                                        onClick={() => openVincular(item)}
                                      >
                                        <Link2 className="h-3.5 w-3.5" />
                                      </Button>
                                      <AlertDialog>
                                        <AlertDialogTrigger asChild>
                                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive" title="Excluir">
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </AlertDialogTrigger>
                                        <AlertDialogContent>
                                          <AlertDialogHeader>
                                            <AlertDialogTitle>Excluir item?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                              Esta ação não pode ser desfeita.
                                            </AlertDialogDescription>
                                          </AlertDialogHeader>
                                          <AlertDialogFooter>
                                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                            <AlertDialogAction onClick={() => deleteItem(item.id)}>Excluir</AlertDialogAction>
                                          </AlertDialogFooter>
                                        </AlertDialogContent>
                                      </AlertDialog>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {/* Total Geral */}
              <div className="flex justify-end pt-2">
                <div className="rounded-xl border bg-green-50 px-6 py-3.5 flex items-center gap-6">
                  <span className="text-sm font-medium text-muted-foreground">Total Geral</span>
                  <span className="text-2xl font-bold text-green-700">{fmt(totalGeral)}</span>
                </div>
              </div>
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            ABA: AMBIENTES
        ════════════════════════════════════════════════════════════════ */}
        <TabsContent value="ambientes" className="space-y-4 mt-4">
          <div className="flex justify-end">
            <Button onClick={openAddAmbiente}>
              <Plus className="h-4 w-4 mr-2" /> Adicionar ambiente
            </Button>
          </div>

          {ambientes.length === 0 ? (
            <div className="rounded-lg border p-12 text-center">
              <LayoutGrid className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-muted-foreground font-medium">Nenhum ambiente cadastrado</p>
              <p className="text-sm text-muted-foreground mt-1">Adicione ambientes para organizar o orçamento por cômodo.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {ambientes.map((amb) => {
                const n = countItens(amb.id);
                return (
                  <Card key={amb.id}>
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-base truncate">{amb.nome}</CardTitle>
                        <div className="flex gap-0.5 shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openEditAmbiente(amb)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive">
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir ambiente?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Os itens de orçamento vinculados a este ambiente perderão a referência.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteAmbiente(amb.id)}>Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1">
                      {amb.areaM2 && (
                        <p className="text-sm text-muted-foreground">📐 {Number(amb.areaM2).toFixed(1)} m²</p>
                      )}
                      <p className="text-sm text-muted-foreground">
                        {n} {n === 1 ? "item" : "itens"} no orçamento
                      </p>
                      {amb.descricao && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{amb.descricao}</p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            ABA: CENAS 3D (placeholder)
        ════════════════════════════════════════════════════════════════ */}
        <TabsContent value="cenas" className="mt-4">
          <div className="rounded-lg border p-12 text-center">
            <Clock className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="font-medium">Cenas 3D</p>
            <p className="text-sm text-muted-foreground mt-1">Em breve — gere renders fotorrealistas dos ambientes com IA.</p>
          </div>
        </TabsContent>

        {/* ═══════════════════════════════════════════════════════════════
            ABA: PORTAL (placeholder)
        ════════════════════════════════════════════════════════════════ */}
        <TabsContent value="portal" className="mt-4">
          <div className="rounded-lg border p-12 text-center">
            <Clock className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="font-medium">Portal do Cliente</p>
            <p className="text-sm text-muted-foreground mt-1">Em breve — compartilhe o projeto com o cliente em um link seguro.</p>
          </div>
        </TabsContent>
      </Tabs>

      {/* ══════════════════════════════════════════════════════════════════
          DIALOG: Adicionar / Editar Item
      ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={addItemOpen} onOpenChange={setAddItemOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Editar item" : "Adicionar item"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveItem} className="space-y-3 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Ambiente</Label>
                <Select value={itemForm.ambienteId} onValueChange={(v) => setItemForm((f) => ({ ...f, ambienteId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Sem ambiente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem ambiente</SelectItem>
                    {ambientes.map((a) => <SelectItem key={a.id} value={a.id}>{a.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Categoria</Label>
                <Select value={itemForm.categoria} onValueChange={(v) => setItemForm((f) => ({ ...f, categoria: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIAS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="col-span-2 space-y-1">
                <Label>Descrição *</Label>
                <Input
                  value={itemForm.descricao}
                  onChange={(e) => setItemForm((f) => ({ ...f, descricao: e.target.value }))}
                  placeholder="Ex: Sofá de 3 lugares"
                  required
                />
              </div>

              <div className="space-y-1">
                <Label>Quantidade</Label>
                <Input type="number" min="0" step="0.01"
                  value={itemForm.quantidade}
                  onChange={(e) => setItemForm((f) => ({ ...f, quantidade: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Unidade</Label>
                <Input value={itemForm.unidade}
                  onChange={(e) => setItemForm((f) => ({ ...f, unidade: e.target.value }))}
                  placeholder="un, m², m, kg"
                />
              </div>

              <div className="space-y-1">
                <Label>Valor Unitário (R$)</Label>
                <Input type="number" min="0" step="0.01"
                  value={itemForm.valorUnitario}
                  onChange={(e) => setItemForm((f) => ({ ...f, valorUnitario: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Fornecedor</Label>
                <Input value={itemForm.fornecedor}
                  onChange={(e) => setItemForm((f) => ({ ...f, fornecedor: e.target.value }))}
                  placeholder="Nome do fornecedor"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setAddItemOpen(false)} disabled={savingItem}>Cancelar</Button>
              <Button type="submit" disabled={savingItem || !itemForm.descricao}>
                {savingItem ? "Salvando..." : editingItem ? "Salvar" : "Adicionar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════
          DIALOG: Vincular Produto do Catálogo
      ═══════════════════════════════════════════════════════════════════ */}
      <Dialog
        open={!!vinculandoItem}
        onOpenChange={(o) => {
          if (!o) { setVinculandoItem(null); setCatalogResults([]); setSelectedProduto(null); setCatalogSearch(""); }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Vincular produto do catálogo</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <p className="text-sm text-muted-foreground">
              Item: <span className="font-medium text-foreground">{vinculandoItem?.descricao}</span>
            </p>

            <div className="flex gap-2">
              <Input
                placeholder="Buscar no catálogo..."
                value={catalogSearch}
                onChange={(e) => { setCatalogSearch(e.target.value); searchCatalogo(e.target.value); }}
              />
              <Button variant="outline" type="button" onClick={() => searchCatalogo(catalogSearch)}>
                <Search className="h-4 w-4" />
              </Button>
            </div>

            {catalogResults.length > 0 && (
              <div className="max-h-56 overflow-y-auto rounded-lg border divide-y">
                {catalogResults.map((p) => (
                  <div
                    key={p.id}
                    onClick={() => setSelectedProduto(p)}
                    className={`px-4 py-3 cursor-pointer flex items-center justify-between hover:bg-muted/50 transition-colors ${selectedProduto?.id === p.id ? "bg-primary/5 border-l-2 border-primary" : ""}`}
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{p.nome}</p>
                      {(p.categoria || p.fornecedor) && (
                        <p className="text-xs text-muted-foreground">
                          {[p.categoria, p.fornecedor].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    {p.precoBase && (
                      <span className="text-sm font-medium text-green-700 ml-3 shrink-0">{fmt(Number(p.precoBase))}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {catalogSearch && catalogResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">Nenhum produto encontrado no catálogo.</p>
            )}

            {selectedProduto && (
              <div className="rounded-lg bg-green-50 border border-green-200 px-4 py-3">
                <p className="text-sm font-medium text-green-800">✓ {selectedProduto.nome}</p>
                {selectedProduto.precoBase && (
                  <p className="text-xs text-green-700 mt-0.5">
                    O valor unitário será atualizado para {fmt(Number(selectedProduto.precoBase))}
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setVinculandoItem(null)} disabled={vinculando}>Cancelar</Button>
              <Button onClick={handleVincular} disabled={!selectedProduto || vinculando}>
                {vinculando ? "Vinculando..." : "Vincular"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══════════════════════════════════════════════════════════════════
          DIALOG: Adicionar / Editar Ambiente
      ═══════════════════════════════════════════════════════════════════ */}
      <Dialog open={addAmbienteOpen} onOpenChange={setAddAmbienteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAmbiente ? "Editar ambiente" : "Adicionar ambiente"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveAmbiente} className="space-y-3 mt-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input
                value={ambienteForm.nome}
                onChange={(e) => setAmbienteForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Ex: Sala de Estar"
                required
              />
            </div>
            <div className="space-y-1">
              <Label>Área (m²)</Label>
              <Input type="number" min="0" step="0.01"
                value={ambienteForm.areaM2}
                onChange={(e) => setAmbienteForm((f) => ({ ...f, areaM2: e.target.value }))}
                placeholder="35"
              />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea
                value={ambienteForm.descricao}
                onChange={(e) => setAmbienteForm((f) => ({ ...f, descricao: e.target.value }))}
                placeholder="Descrição do ambiente..."
                rows={3}
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={() => setAddAmbienteOpen(false)} disabled={savingAmbiente}>Cancelar</Button>
              <Button type="submit" disabled={savingAmbiente || !ambienteForm.nome}>
                {savingAmbiente ? "Salvando..." : editingAmbiente ? "Salvar" : "Adicionar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
