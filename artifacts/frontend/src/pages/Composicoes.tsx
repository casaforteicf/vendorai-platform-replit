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
import { Plus, Layers, Pencil, Trash2, Search, ChevronDown, ChevronUp, X } from "lucide-react";

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
      <table className="w-full text-xs">
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
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2 space-y-2">
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
        <div className="col-span-2 space-y-2">
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
                <div key={item.insumoId} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate">{ins?.nome ?? item.insumoId}</span>
                  <Input type="number" step="0.001" min="0.001" value={item.quantidade} onChange={(e) => setItens((prev) => prev.map((i, j) => j === idx ? { ...i, quantidade: e.target.value } : i))} className="w-24 h-8 text-xs" placeholder="Qtd" />
                  <span className="text-xs text-muted-foreground w-8 shrink-0">{ins?.unidade}</span>
                  <Input type="number" step="0.0001" min="0" value={item.precoUnitario} onChange={(e) => setItens((prev) => prev.map((i, j) => j === idx ? { ...i, precoUnitario: e.target.value } : i))} className="w-28 h-8 text-xs" placeholder="R$/un" />
                  <button type="button" onClick={() => setItens((prev) => prev.filter((_, j) => j !== idx))}><X className="h-4 w-4 text-muted-foreground" /></button>
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
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: composicoes = [], isLoading } = useListComposicoes(tenantId, {}, {
    query: { enabled: !!tenantId, queryKey: getListComposicoesQueryKey(tenantId) },
  });
  const { mutateAsync: createComposicao, isPending: isCreating } = useCreateComposicao();
  const { mutateAsync: deleteComposicao } = useDeleteComposicao();

  async function handleCreate(data: Record<string, unknown>) {
    await createComposicao({ tenantId, data: data as any });
    await qc.invalidateQueries({ queryKey: getListComposicoesQueryKey(tenantId) });
    setAddOpen(false);
  }

  const filtered = composicoes.filter((c) =>
    !search || c.nome.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6 text-purple-500" />
            Composições
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Cadastro central de composições para alocação em obras</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2"><Plus className="h-4 w-4" />Nova composição</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova composição</DialogTitle></DialogHeader>
            <ComposicaoForm tenantId={tenantId} onSave={handleCreate} onCancel={() => setAddOpen(false)} isPending={isCreating} />
          </DialogContent>
        </Dialog>
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
