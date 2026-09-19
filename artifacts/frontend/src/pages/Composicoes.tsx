import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListComposicoes,
  useGetComposicao,
  useCreateComposicao,
  useUpdateComposicao,
  useDeleteComposicao,
  useListInsumos,
  getListComposicoesQueryKey,
  getGetComposicaoQueryKey,
  getListInsumosQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Layers, Trash2, Search, ChevronDown, ChevronUp, X, Upload, Download, Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import { csvDecimal, downloadCsvTemplate, parseConstructionCsv } from "@/lib/construction-csv";
import { useToast } from "@/hooks/use-toast";

const UNIDADES = ["un", "m²", "m³", "m", "kg", "t", "l", "cj", "pc", "sc", "cx"];

function ComposicaoDetail({ tenantId, composicaoId }: { tenantId: string; composicaoId: string }) {
  const { data, isLoading } = useGetComposicao(tenantId, composicaoId, {
    query: { enabled: !!composicaoId, queryKey: getGetComposicaoQueryKey(tenantId, composicaoId) },
  });

  if (isLoading) return <div className="h-20 bg-muted animate-pulse rounded" />;
  if (!data || !(data as any).itens?.length) return <p className="text-xs text-muted-foreground">Nenhum insumo cadastrado</p>;

  const total = (data as any).itens.reduce((sum: number, i: any) => {
    const preco = parseFloat(i.precoUnitario ?? i.insumo?.precoUnitario ?? "0");
    return sum + preco * parseFloat(i.quantidade ?? "0");
  }, 0);

  return (
    <div className="space-y-2">
      {/* Mobile: labeled rows */}
      <div className="md:hidden space-y-2">
        {(data as any).itens.map((item: any) => {
          const preco = parseFloat(item.precoUnitario ?? item.insumo?.precoUnitario ?? "0");
          const custo = preco * parseFloat(item.quantidade ?? "0");
          return (
            <div key={item.id} className="flex items-center justify-between gap-2 text-xs border-b pb-2">
              <div className="min-w-0">
                <p className="font-medium truncate">{item.insumo?.nome ?? "—"}</p>
                <p className="text-muted-foreground font-mono">
                  {parseFloat(item.quantidade).toLocaleString("pt-BR")} {item.insumo?.unidade ?? ""}
                </p>
              </div>
              <span className="font-mono shrink-0 text-right">
                {custo > 0 ? `R$ ${custo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
              </span>
            </div>
          );
        })}
        {total > 0 && (
          <div className="flex items-center justify-between text-xs pt-1">
            <span className="text-muted-foreground">Total estimado</span>
            <span className="font-mono font-semibold">R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
          </div>
        )}
      </div>
      {/* Desktop: table */}
      <table className="hidden md:table w-full text-xs">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-1.5 pr-3">Insumo</th>
            <th className="text-right py-1.5 px-3">Qtd</th>
            <th className="text-left py-1.5 px-3">Un.</th>
            <th className="text-right py-1.5 pl-3">Custo</th>
          </tr>
        </thead>
        <tbody>
          {(data as any).itens.map((item: any) => {
            const preco = parseFloat(item.precoUnitario ?? item.insumo?.precoUnitario ?? "0");
            const custo = preco * parseFloat(item.quantidade ?? "0");
            return (
              <tr key={item.id} className="border-b">
                <td className="py-1.5 pr-3">{item.insumo?.nome ?? "—"}</td>
                <td className="py-1.5 px-3 text-right font-mono">{parseFloat(item.quantidade).toLocaleString("pt-BR")}</td>
                <td className="py-1.5 px-3 font-mono">{item.insumo?.unidade ?? "—"}</td>
                <td className="py-1.5 pl-3 text-right font-mono">{custo > 0 ? `R$ ${custo.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}</td>
              </tr>
            );
          })}
        </tbody>
        {total > 0 && (
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-2 text-muted-foreground">Total estimado</td>
              <td className="pt-2 text-right font-mono font-semibold">R$ {total.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}

type InsumoItem = { insumoId: string; quantidade: string; precoUnitario: string };

type AiCompositionItem = {
  insumoId: string | null;
  nomeSugerido: string;
  nome: string;
  unidade: string;
  codigo: string | null;
  categoria: string | null;
  quantidade: number;
  precoUnitario: number | null;
  subtotal: number | null;
  status: "ok" | "sem_preco" | "nao_cadastrado";
  observacao?: string | null;
};

type AiCompositionDraft = {
  nome: string;
  descricao: string | null;
  unidade: string;
  itens: AiCompositionItem[];
  custoTotalConhecido: number;
  itensPendentes: number;
  coberturaPct: number;
  podeSalvarCompleta: boolean;
  aviso: string | null;
};

function ComposicaoForm({
  tenantId,
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  tenantId: string;
  initial?: { nome?: string; descricao?: string; unidade?: string; codigo?: string };
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    nome: initial?.nome ?? "",
    descricao: initial?.descricao ?? "",
    unidade: initial?.unidade ?? "m²",
    codigo: initial?.codigo ?? "",
  });
  const [itens, setItens] = useState<InsumoItem[]>([]);
  const [insumoSearch, setInsumoSearch] = useState("");

  const { data: allInsumos = [] } = useListInsumos(tenantId, {}, { query: { enabled: !!tenantId, queryKey: getListInsumosQueryKey(tenantId) } });
  const filteredInsumos = allInsumos.filter((i) => i.nome.toLowerCase().includes(insumoSearch.toLowerCase()));

  function addInsumo(insumoId: string) {
    if (itens.find((i) => i.insumoId === insumoId)) return;
    setItens((prev) => [...prev, { insumoId, quantidade: "1", precoUnitario: "" }]);
    setInsumoSearch("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") delete payload[k]; });
    if (itens.length > 0) {
      payload.itens = itens.map((i) => ({ insumoId: i.insumoId, quantidade: i.quantidade, ...(i.precoUnitario ? { precoUnitario: i.precoUnitario } : {}) }));
    }
    onSave(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2 space-y-2">
          <Label>Nome *</Label>
          <Input required value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Unidade *</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.unidade} onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value }))}>
            {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Código interno</Label>
          <Input value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} />
        </div>
        <div className="sm:col-span-2 space-y-2">
          <Label>Descrição</Label>
          <Input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Insumos da composição</Label>
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar insumo..." className="pl-8" value={insumoSearch} onChange={(e) => setInsumoSearch(e.target.value)} />
        </div>
        {insumoSearch && filteredInsumos.length > 0 && (
          <div className="border rounded-md max-h-40 overflow-y-auto">
            {filteredInsumos.slice(0, 8).map((ins) => (
              <button key={ins.id} type="button" onClick={() => addInsumo(ins.id)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-muted flex items-center justify-between">
                <span>{ins.nome}</span>
                <span className="text-xs text-muted-foreground font-mono">{ins.unidade}</span>
              </button>
            ))}
          </div>
        )}
        {itens.length > 0 && (
          <div className="space-y-2 mt-2">
            {itens.map((item, idx) => {
              const ins = allInsumos.find((i) => i.id === item.insumoId);
              return (
                <div key={item.insumoId} className="flex flex-col gap-1.5 rounded-md border p-2 sm:border-0 sm:p-0 sm:flex-row sm:items-center sm:gap-2 text-sm">
                  <div className="flex items-center justify-between gap-2 sm:flex-1 sm:min-w-0">
                    <span className="flex-1 truncate font-medium sm:font-normal">{ins?.nome ?? item.insumoId}</span>
                    <button type="button" className="sm:hidden text-muted-foreground" onClick={() => setItens((prev) => prev.filter((_, j) => j !== idx))}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input type="number" step="0.001" min="0.001" value={item.quantidade} onChange={(e) => setItens((prev) => prev.map((i, j) => j === idx ? { ...i, quantidade: e.target.value } : i))} className="w-20 h-8 text-xs" placeholder="Qtd" />
                    <span className="text-xs text-muted-foreground w-8 shrink-0">{ins?.unidade}</span>
                    <Input type="number" step="0.0001" min="0" value={item.precoUnitario} onChange={(e) => setItens((prev) => prev.map((i, j) => j === idx ? { ...i, precoUnitario: e.target.value } : i))} className="flex-1 sm:w-28 sm:flex-none h-8 text-xs" placeholder="R$/un" />
                    <button type="button" className="hidden sm:block text-muted-foreground" onClick={() => setItens((prev) => prev.filter((_, j) => j !== idx))}>
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar"}</Button>
      </div>
    </form>
  );
}

export default function Composicoes() {
  const { user, token } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPedido, setAiPedido] = useState("");
  const [aiUnidade, setAiUnidade] = useState("m²");
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiDraft, setAiDraft] = useState<AiCompositionDraft | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { toast } = useToast();

  const { data: composicoes = [], isLoading } = useListComposicoes(tenantId, {}, {
    query: { enabled: !!tenantId, queryKey: getListComposicoesQueryKey(tenantId) },
  });
  const { data: insumos = [] } = useListInsumos(tenantId, {}, {
    query: { enabled: !!tenantId, queryKey: getListInsumosQueryKey(tenantId) },
  });
  const { mutateAsync: createComposicao, isPending: isCreating } = useCreateComposicao();
  const { mutateAsync: deleteComposicao } = useDeleteComposicao();

  async function handleCreate(data: Record<string, unknown>) {
    await createComposicao({ tenantId, data: data as any });
    await qc.invalidateQueries({ queryKey: getListComposicoesQueryKey(tenantId) });
    setAddOpen(false);
  }

  async function handleGenerateAi() {
    if (!tenantId || !token || aiPedido.trim().length < 5) return;
    setAiGenerating(true);
    setAiDraft(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/composicoes/gerar-ia`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pedido: aiPedido.trim(),
          unidadePreferida: aiUnidade,
        }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error ?? "Não foi possível gerar a composição.");
      setAiDraft(body as AiCompositionDraft);
    } catch (error) {
      toast({
        title: "Não foi possível gerar a composição",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setAiGenerating(false);
    }
  }

  async function handleSaveAiDraft() {
    if (!aiDraft?.podeSalvarCompleta) return;
    try {
      await createComposicao({
        tenantId,
        data: {
          nome: aiDraft.nome,
          descricao: aiDraft.descricao ?? undefined,
          unidade: aiDraft.unidade,
          itens: aiDraft.itens.map((item) => ({
            insumoId: item.insumoId!,
            quantidade: String(item.quantidade),
          })),
        } as any,
      });
      await qc.invalidateQueries({ queryKey: getListComposicoesQueryKey(tenantId) });
      toast({
        title: "Composição criada",
        description: aiDraft.itensPendentes > 0
          ? "A composição foi salva, mas ainda possui insumos sem preço cadastrado."
          : "Todos os insumos foram vinculados à base de custos.",
      });
      setAiOpen(false);
      setAiPedido("");
      setAiDraft(null);
    } catch (error) {
      toast({
        title: "Não foi possível salvar",
        description: error instanceof Error ? error.message : "Tente novamente.",
        variant: "destructive",
      });
    }
  }

  async function handleCsvImport() {
    if (!importFile || !tenantId) return;
    setImporting(true);
    try {
      const rows = parseConstructionCsv(await importFile.text());
      if (!rows.length) throw new Error("O CSV está vazio ou não possui cabeçalho.");
      const byInsumoCode = new Map(insumos.filter((i) => i.codigo).map((i) => [i.codigo!.trim().toLowerCase(), i]));
      const byInsumoName = new Map(insumos.map((i) => [i.nome.trim().toLowerCase(), i]));
      const groups = new Map<string, typeof rows>();
      for (const row of rows) {
        const key = (row.composicao_codigo || row.composicao_nome || row.codigo || row.nome || "").trim().toLowerCase();
        if (!key) continue;
        groups.set(key, [...(groups.get(key) ?? []), row]);
      }
      const existing = new Set(composicoes.flatMap((item) => [item.codigo?.trim().toLowerCase(), item.nome.trim().toLowerCase()].filter(Boolean) as string[]));
      let imported = 0;
      let ignored = rows.length - [...groups.values()].reduce((sum, group) => sum + group.length, 0);
      for (const [key, group] of groups) {
        const first = group[0];
        const nome = (first.composicao_nome || first.nome || "").trim();
        const codigo = (first.composicao_codigo || first.codigo || "").trim();
        const unidade = (first.unidade || "un").trim();
        if (!nome || existing.has(key)) { ignored += group.length; continue; }
        const itens = group.flatMap((row) => {
          const insumo = row.insumo_codigo
            ? byInsumoCode.get(row.insumo_codigo.trim().toLowerCase())
            : byInsumoName.get((row.insumo_nome || "").trim().toLowerCase());
          const quantidade = csvDecimal(row.quantidade);
          if (!insumo || !quantidade) { ignored += 1; return []; }
          const precoUnitario = csvDecimal(row.preco_unitario);
          return [{ insumoId: insumo.id, quantidade, ...(precoUnitario ? { precoUnitario } : {}) }];
        });
        if (!itens.length && group.some((row) => row.insumo_codigo || row.insumo_nome)) continue;
        await createComposicao({ tenantId, data: {
          nome,
          unidade,
          ...(codigo ? { codigo } : {}),
          ...(first.descricao ? { descricao: first.descricao } : {}),
          ...(itens.length ? { itens } : {}),
        } as any });
        existing.add(key); existing.add(nome.toLowerCase()); imported += 1;
      }
      await qc.invalidateQueries({ queryKey: getListComposicoesQueryKey(tenantId) });
      toast({ title: `${imported} composição(ões) importada(s)`, description: ignored ? `${ignored} linha(s) foram ignoradas por duplicidade, dados inválidos ou insumo não encontrado.` : undefined });
      setImportOpen(false); setImportFile(null);
    } catch (error) {
      toast({ title: "Não foi possível importar o CSV", description: error instanceof Error ? error.message : "Confira o arquivo e tente novamente.", variant: "destructive" });
    } finally { setImporting(false); }
  }

  const filtered = composicoes.filter((c) =>
    !search || c.nome.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6 text-purple-500" />
            Composições
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Cadastro central de composições para alocação em obras</p>
        </div>
        <div className="flex flex-wrap gap-2">
        <Dialog open={aiOpen} onOpenChange={(open) => { setAiOpen(open); if (!open) setAiDraft(null); }}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Sparkles className="h-4 w-4" />
              Gerar com IA
            </Button>
          </DialogTrigger>
          <DialogContent className="w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Gerar composição técnica com IA</DialogTitle></DialogHeader>
            <div className="space-y-5">
              <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
                A IA monta os consumos por unidade do serviço e tenta vincular cada item aos insumos já cadastrados. <strong className="text-foreground">Ela não cria preços.</strong>
              </div>
              <div className="space-y-2">
                <Label>Descreva o serviço *</Label>
                <textarea
                  className="min-h-28 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  value={aiPedido}
                  onChange={(e) => setAiPedido(e.target.value)}
                  placeholder="Ex.: Parede ICF 17 cm completa por m², incluindo blocos, concreto, aço, conectores, montagem e equipamentos necessários."
                />
              </div>
              <div className="max-w-xs space-y-2">
                <Label>Unidade da composição</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                  value={aiUnidade}
                  onChange={(e) => setAiUnidade(e.target.value)}
                >
                  {UNIDADES.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleGenerateAi} disabled={aiGenerating || aiPedido.trim().length < 5} className="gap-2">
                  <Sparkles className="h-4 w-4" />
                  {aiGenerating ? "Gerando..." : aiDraft ? "Gerar novamente" : "Gerar composição"}
                </Button>
              </div>

              {aiDraft && (
                <div className="space-y-4 border-t pt-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{aiDraft.nome}</h3>
                      <span className="rounded bg-muted px-2 py-0.5 text-xs font-mono">{aiDraft.unidade}</span>
                    </div>
                    {aiDraft.descricao && <p className="mt-1 text-sm text-muted-foreground">{aiDraft.descricao}</p>}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Custo conhecido</p><p className="mt-1 text-lg font-semibold">{aiDraft.custoTotalConhecido.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p></CardContent></Card>
                    <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Cobertura de preços</p><p className="mt-1 text-lg font-semibold">{aiDraft.coberturaPct.toLocaleString("pt-BR")}%</p></CardContent></Card>
                    <Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Pendências</p><p className="mt-1 text-lg font-semibold">{aiDraft.itensPendentes}</p></CardContent></Card>
                  </div>

                  {aiDraft.aviso && (
                    <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{aiDraft.aviso}</span>
                    </div>
                  )}

                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full min-w-[680px] text-sm">
                      <thead className="bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2 text-left">Insumo</th>
                          <th className="px-3 py-2 text-right">Consumo</th>
                          <th className="px-3 py-2 text-left">Un.</th>
                          <th className="px-3 py-2 text-right">Preço base</th>
                          <th className="px-3 py-2 text-right">Parcial</th>
                          <th className="px-3 py-2 text-left">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {aiDraft.itens.map((item, index) => (
                          <tr key={`${item.insumoId ?? item.nomeSugerido}-${index}`} className="border-t">
                            <td className="px-3 py-2">
                              <div className="font-medium">{item.nome}</div>
                              {item.observacao && <div className="mt-0.5 text-xs text-muted-foreground">{item.observacao}</div>}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 4 })}</td>
                            <td className="px-3 py-2">{item.unidade}</td>
                            <td className="px-3 py-2 text-right font-mono">{item.precoUnitario == null ? "—" : item.precoUnitario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                            <td className="px-3 py-2 text-right font-mono">{item.subtotal == null ? "—" : item.subtotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</td>
                            <td className="px-3 py-2">
                              {item.status === "ok" ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" />Vinculado</span>
                              ) : item.status === "sem_preco" ? (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />Sem preço</span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-xs font-medium text-destructive"><AlertTriangle className="h-3.5 w-3.5" />Cadastrar insumo</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {!aiDraft.podeSalvarCompleta && (
                    <p className="text-sm text-destructive">
                      Existem itens que ainda não estão cadastrados como insumo. Cadastre-os na base e gere novamente para salvar a composição completa.
                    </p>
                  )}

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button variant="outline" onClick={() => setAiDraft(null)}>Editar pedido</Button>
                    <Button onClick={handleSaveAiDraft} disabled={!aiDraft.podeSalvarCompleta || isCreating}>
                      {isCreating ? "Salvando..." : "Salvar composição"}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-2"><Upload className="h-4 w-4" />Importar CSV</Button></DialogTrigger>
          <DialogContent className="w-full max-w-2xl">
            <DialogHeader><DialogTitle>Importar composições detalhadas</DialogTitle></DialogHeader>
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">Use uma linha para cada insumo. Repita os dados da composição nas linhas seguintes. O insumo deve estar previamente cadastrado e pode ser identificado pelo código ou nome.</p>
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => downloadCsvTemplate("modelo-composicoes.csv", "composicao_codigo;composicao_nome;descricao;unidade;insumo_codigo;insumo_nome;quantidade;preco_unitario\nCOMP-001;Concreto fck 25 MPa;Composição por m³;m³;MAT-001;;7;39,90\nCOMP-001;Concreto fck 25 MPa;Composição por m³;m³;MAT-002;;0,70;120,00\n")}><Download className="h-4 w-4" />Baixar modelo</Button>
              <Input type="file" accept=".csv,text/csv" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button><Button onClick={handleCsvImport} disabled={!importFile || importing}>{importing ? "Importando..." : "Importar"}</Button></div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Nova composição</Button>
          </DialogTrigger>
          <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova composição</DialogTitle></DialogHeader>
            <ComposicaoForm tenantId={tenantId} onSave={handleCreate} onCancel={() => setAddOpen(false)} isPending={isCreating} />
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar composição..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted animate-pulse rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Layers className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Nenhuma composição cadastrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((comp) => {
            const isExpanded = expandedId === comp.id;
            return (
              <Card key={comp.id}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{comp.nome}</span>
                          <span className="text-xs px-2 py-0.5 bg-muted rounded font-mono">{comp.unidade}</span>
                          {comp.codigo && <span className="text-xs text-muted-foreground font-mono">#{comp.codigo}</span>}
                        </div>
                        {comp.descricao && <p className="text-xs text-muted-foreground mt-0.5">{comp.descricao}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpandedId(isExpanded ? null : comp.id)}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader><AlertDialogTitle>Excluir composição?</AlertDialogTitle><AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription></AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={async () => { await deleteComposicao({ tenantId, composicaoId: comp.id }); qc.invalidateQueries({ queryKey: getListComposicoesQueryKey(tenantId) }); }}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t">
                      <ComposicaoDetail tenantId={tenantId} composicaoId={comp.id} />
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
