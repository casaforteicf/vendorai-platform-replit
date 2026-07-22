import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListInsumos,
  useCreateInsumo,
  useUpdateInsumo,
  useDeleteInsumo,
  getListInsumosQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Package, Pencil, Trash2, Search, Upload, Download } from "lucide-react";
import type { Insumo } from "@workspace/api-client-react";
import { csvDecimal, downloadCsvTemplate, parseConstructionCsv } from "@/lib/construction-csv";
import { useToast } from "@/hooks/use-toast";

const CATEGORIAS = ["Alvenaria", "Concreto", "Cobertura", "Elétrica", "Hidráulica", "Acabamento", "Estrutura", "Movimento de terra", "Ferramentas", "Outros"];

const UNIDADES = ["un", "m²", "m³", "m", "kg", "t", "l", "cj", "pc", "sc", "cx"];

function InsumoForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Partial<Insumo>;
  onSave: (data: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    nome: initial?.nome ?? "",
    descricao: initial?.descricao ?? "",
    unidade: initial?.unidade ?? "un",
    precoUnitario: initial?.precoUnitario ?? "",
    categoria: initial?.categoria ?? "",
    codigo: initial?.codigo ?? "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") delete payload[k]; });
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
          <Label>Preço unitário (R$)</Label>
          <Input type="number" step="0.0001" value={form.precoUnitario as string} onChange={(e) => setForm((f) => ({ ...f, precoUnitario: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Categoria</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.categoria} onChange={(e) => setForm((f) => ({ ...f, categoria: e.target.value }))}>
            <option value="">Selecione...</option>
            {CATEGORIAS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Código interno</Label>
          <Input value={form.codigo} onChange={(e) => setForm((f) => ({ ...f, codigo: e.target.value }))} />
        </div>
        <div className="sm:col-span-2 space-y-2">
          <Label>Descrição</Label>
          <Input value={form.descricao as string} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar"}</Button>
      </div>
    </form>
  );
}

function EditDialog({ tenantId, insumo }: { tenantId: string; insumo: Insumo }) {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const { mutateAsync, isPending } = useUpdateInsumo();

  async function handleSave(data: Record<string, unknown>) {
    await mutateAsync({ tenantId, insumoId: insumo.id, data: data as any });
    await qc.invalidateQueries({ queryKey: getListInsumosQueryKey(tenantId) });
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0"><Pencil className="h-3.5 w-3.5" /></Button>
      </DialogTrigger>
      <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar insumo</DialogTitle></DialogHeader>
        <InsumoForm initial={insumo} onSave={handleSave} onCancel={() => setOpen(false)} isPending={isPending} />
      </DialogContent>
    </Dialog>
  );
}

export default function Insumos() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  const { data: insumos = [], isLoading } = useListInsumos(tenantId, {}, {
    query: { enabled: !!tenantId, queryKey: getListInsumosQueryKey(tenantId) },
  });

  const { mutateAsync: createInsumo, isPending: isCreating } = useCreateInsumo();
  const { mutateAsync: deleteInsumo } = useDeleteInsumo();

  async function handleCreate(data: Record<string, unknown>) {
    await createInsumo({ tenantId, data: data as any });
    await qc.invalidateQueries({ queryKey: getListInsumosQueryKey(tenantId) });
    setAddOpen(false);
  }

  async function handleDelete(insumoId: string) {
    await deleteInsumo({ tenantId, insumoId });
    await qc.invalidateQueries({ queryKey: getListInsumosQueryKey(tenantId) });
  }

  async function handleCsvImport() {
    if (!importFile || !tenantId) return;
    setImporting(true);
    try {
      const rows = parseConstructionCsv(await importFile.text());
      if (!rows.length) throw new Error("O CSV está vazio ou não possui cabeçalho.");
      const known = new Set(insumos.flatMap((item) => [item.codigo?.trim().toLowerCase(), item.nome.trim().toLowerCase()].filter(Boolean) as string[]));
      let imported = 0;
      let ignored = 0;
      for (const row of rows) {
        const nome = row.nome?.trim();
        const codigo = row.codigo?.trim();
        const key = (codigo || nome || "").toLowerCase();
        if (!nome || !row.unidade?.trim() || !key || known.has(key)) { ignored += 1; continue; }
        const precoUnitario = csvDecimal(row.preco_unitario);
        await createInsumo({ tenantId, data: {
          nome,
          unidade: row.unidade.trim(),
          ...(codigo ? { codigo } : {}),
          ...(row.descricao ? { descricao: row.descricao } : {}),
          ...(row.categoria ? { categoria: row.categoria } : {}),
          ...(precoUnitario ? { precoUnitario } : {}),
        } as any });
        known.add(key);
        known.add(nome.toLowerCase());
        imported += 1;
      }
      await qc.invalidateQueries({ queryKey: getListInsumosQueryKey(tenantId) });
      toast({ title: `${imported} insumo(s) importado(s)`, description: ignored ? `${ignored} linha(s) inválida(s) ou já cadastrada(s) foram ignoradas.` : undefined });
      setImportOpen(false); setImportFile(null);
    } catch (error) {
      toast({ title: "Não foi possível importar o CSV", description: error instanceof Error ? error.message : "Confira o arquivo e tente novamente.", variant: "destructive" });
    } finally { setImporting(false); }
  }

  const filtered = insumos.filter((i) => {
    if (catFilter !== "all" && i.categoria !== catFilter) return false;
    if (search && !i.nome.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const categorias = [...new Set(insumos.map((i) => i.categoria).filter(Boolean))];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6 text-blue-500" />
            Insumos e Materiais
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Cadastro central de materiais e insumos para alocação em obras</p>
        </div>
        <div className="flex flex-wrap gap-2">
        <Dialog open={importOpen} onOpenChange={setImportOpen}>
          <DialogTrigger asChild><Button size="sm" variant="outline" className="gap-2"><Upload className="h-4 w-4" />Importar CSV</Button></DialogTrigger>
          <DialogContent className="w-full max-w-lg">
            <DialogHeader><DialogTitle>Importar insumos por CSV</DialogTitle></DialogHeader>
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">Use uma linha por insumo. Separadores vírgula, ponto e vírgula e tabulação são aceitos.</p>
              <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => downloadCsvTemplate("modelo-insumos.csv", "codigo;nome;descricao;unidade;preco_unitario;categoria\nMAT-001;Cimento CP II;Saco 50 kg;sc;39,90;Concreto\n")}><Download className="h-4 w-4" />Baixar modelo</Button>
              <Input type="file" accept=".csv,text/csv" onChange={(e) => setImportFile(e.target.files?.[0] ?? null)} />
              <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setImportOpen(false)}>Cancelar</Button><Button onClick={handleCsvImport} disabled={!importFile || importing}>{importing ? "Importando..." : "Importar"}</Button></div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Novo insumo</Button>
          </DialogTrigger>
          <DialogContent className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Novo insumo</DialogTitle></DialogHeader>
            <InsumoForm onSave={handleCreate} onCancel={() => setAddOpen(false)} isPending={isCreating} />
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-56">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar insumo..." className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[{ value: "all", label: "Todos" }, ...categorias.map((c) => ({ value: c!, label: c! }))].map((opt) => (
            <button key={opt.value} onClick={() => setCatFilter(opt.value)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${catFilter === opt.value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table / Cards */}
      {isLoading ? (
        <div className="h-40 rounded-xl bg-muted animate-pulse" />
      ) : filtered.length === 0 ? (
        <div className="text-center py-20 text-muted-foreground">
          <Package className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">Nenhum insumo encontrado</p>
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            {/* Mobile cards */}
            <div className="md:hidden divide-y">
              {filtered.map((insumo) => (
                <div key={insumo.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">{insumo.nome}</p>
                      {insumo.descricao && <p className="text-xs text-muted-foreground mt-0.5">{insumo.descricao}</p>}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <EditDialog tenantId={tenantId} insumo={insumo} />
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Excluir insumo?</AlertDialogTitle>
                            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(insumo.id)}>Excluir</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {insumo.categoria && (
                      <span><span className="font-medium text-foreground">Categoria:</span> {insumo.categoria}</span>
                    )}
                    <span>
                      <span className="font-medium text-foreground">Unidade:</span>{" "}
                      <span className="font-mono bg-muted px-1.5 py-0.5 rounded">{insumo.unidade}</span>
                    </span>
                    {insumo.precoUnitario && (
                      <span>
                        <span className="font-medium text-foreground">Preço:</span>{" "}
                        <span className="font-mono">R$ {Number(insumo.precoUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>
                      </span>
                    )}
                    {insumo.codigo && (
                      <span><span className="font-medium text-foreground">Código:</span> <span className="font-mono">#{insumo.codigo}</span></span>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/30">
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nome</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Categoria</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Unidade</th>
                    <th className="text-right px-4 py-3 font-medium text-muted-foreground">Preço unitário</th>
                    <th className="text-left px-4 py-3 font-medium text-muted-foreground">Código</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((insumo) => (
                    <tr key={insumo.id} className="border-b hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-medium">{insumo.nome}</div>
                        {insumo.descricao && <div className="text-xs text-muted-foreground">{insumo.descricao}</div>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{insumo.categoria ?? "—"}</td>
                      <td className="px-4 py-3"><span className="px-2 py-0.5 bg-muted rounded text-xs font-mono">{insumo.unidade}</span></td>
                      <td className="px-4 py-3 text-right font-mono">
                        {insumo.precoUnitario ? `R$ ${Number(insumo.precoUnitario).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{insumo.codigo ?? "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <EditDialog tenantId={tenantId} insumo={insumo} />
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir insumo?</AlertDialogTitle>
                                <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(insumo.id)}>Excluir</AlertDialogAction>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
