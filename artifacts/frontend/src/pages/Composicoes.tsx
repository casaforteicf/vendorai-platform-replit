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
import { Plus, Layers, Pencil, Trash2, Search, ChevronDown, ChevronUp, X, Upload, Download, Package } from "lucide-react";
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

function ComposicaoForm({
  tenantId,
  initial,
  initialItems,
  onSave,
  onCancel,
  isPending,
}: {
  tenantId: string;
  initial?: { nome?: string; descricao?: string; unidade?: string; codigo?: string };
  initialItems?: InsumoItem[];
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
  const [itens, setItens] = useState<InsumoItem[]>(initialItems ?? []);
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
    payload.itens = itens.map((i) => ({
      insumoId: i.insumoId,
      quantidade: i.quantidade,
      ...(i.precoUnitario ? { precoUnitario: i.precoUnitario } : {}),
    }));
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
        <div>
          <Label>Insumos da composição</Label>
          <p className="text-xs text-muted-foreground mt-1">
            Deixe o preço em branco para usar a base mestre do insumo. Preencha somente quando quiser fixar um preço específico nesta composição.
          </p>
        </div>
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

function ComposicaoEditDialog({
  tenantId,
  composicao,
}: {
  tenantId: string;
  composicao: { id: string; nome: string; descricao?: string | null; unidade: string; codigo?: string | null };
}) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { data, isLoading } = useGetComposicao(tenantId, composicao.id, {
    query: {
      enabled: open,
      queryKey: getGetComposicaoQueryKey(tenantId, composicao.id),
    },
  });
  const { mutateAsync: updateComposicao, isPending } = useUpdateComposicao();

  const detail = data as any;
  const initialItems: InsumoItem[] = (detail?.itens ?? []).map((item: any) => ({
    insumoId: item.insumoId,
    quantidade: String(item.quantidade ?? "1"),
    precoUnitario: item.precoUnitario ? String(item.precoUnitario) : "",
  }));

  async function handleUpdate(payload: Record<string, unknown>) {
    await updateComposicao({
      tenantId,
      composicaoId: composicao.id,
      data: payload as any,
    });
    await Promise.all([
      qc.invalidateQueries({ queryKey: getListComposicoesQueryKey(tenantId) }),
      qc.invalidateQueries({ queryKey: getGetComposicaoQueryKey(tenantId, composicao.id) }),
    ]);
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="Editar composição">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar composição</DialogTitle></DialogHeader>
        {isLoading || !detail ? (
          <div className="space-y-2 py-4">
            <div className="h-10 bg-muted animate-pulse rounded" />
            <div className="h-28 bg-muted animate-pulse rounded" />
          </div>
        ) : (
          <ComposicaoForm
            key={`${composicao.id}-${initialItems.length}`}
            tenantId={tenantId}
            initial={{
              nome: detail.nome,
              descricao: detail.descricao ?? "",
              unidade: detail.unidade,
              codigo: detail.codigo ?? "",
            }}
            initialItems={initialItems}
            onSave={handleUpdate}
            onCancel={() => setOpen(false)}
            isPending={isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Composicoes() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
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
        <Button size="sm" variant="outline" className="gap-2" onClick={() => { window.location.href = "/insumos"; }}>
          <Package className="h-4 w-4" />Insumos
        </Button>
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
                        <div className="mt-1 flex items-center gap-2 text-xs">
                          <span className="text-muted-foreground">Custo atual:</span>
                          <span className="font-mono font-semibold">
                            R$ {Number(comp.custoTotal ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/{comp.unidade}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setExpandedId(isExpanded ? null : comp.id)} title={isExpanded ? "Ocultar insumos" : "Ver insumos"}>
                        {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      <ComposicaoEditDialog tenantId={tenantId} composicao={comp} />
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
