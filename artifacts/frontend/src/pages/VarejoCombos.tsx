import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListVarejoCombos,
  useCreateVarejoCombo,
  useUpdateVarejoCombo,
  useDeleteVarejoCombo,
  useListVarejoComboItens,
  useCreateVarejoComboItem,
  useDeleteVarejoComboItem,
  useListVarejoProdutos,
  getListVarejoCombosQueryKey,
  getListVarejoComboItensQueryKey,
} from "@workspace/api-client-react";
import type { VarejoCombo } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Gift, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";

function ComboForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Partial<VarejoCombo>;
  onSave: (d: Record<string,unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    nome: initial?.nome ?? "",
    descricao: initial?.descricao ?? "",
    preco: initial?.preco ?? "",
    ativo: initial?.ativo ?? true,
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string,unknown> = { ...form };
    if (!payload.preco) delete payload.preco;
    if (!payload.descricao) delete payload.descricao;
    onSave(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Nome do Combo / Look *</Label>
        <Input required value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>Descrição</Label>
        <Input placeholder="Descreva o look ou oferta especial..." value={form.descricao as string} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
      </div>
      <div className="space-y-2">
        <Label>Preço do Combo (R$)</Label>
        <Input type="number" step="0.01" min="0" value={form.preco as string} onChange={(e) => setForm((f) => ({ ...f, preco: e.target.value }))} />
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="ativo" checked={form.ativo} onChange={(e) => setForm((f) => ({ ...f, ativo: e.target.checked }))} className="h-4 w-4" />
        <Label htmlFor="ativo">Ativo</Label>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar"}</Button>
      </div>
    </form>
  );
}

function ComboItens({ comboId, tenantId }: { comboId: string; tenantId: string }) {
  const qc = useQueryClient();
  const { data: itens = [] } = useListVarejoComboItens(tenantId, comboId);
  const { data: produtos = [] } = useListVarejoProdutos(tenantId);
  const createItem = useCreateVarejoComboItem();
  const deleteItem = useDeleteVarejoComboItem();

  const [form, setForm] = useState({ produtoId: "", tamanho: "", cor: "", quantidade: "1" });
  const [adding, setAdding] = useState(false);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListVarejoComboItensQueryKey(tenantId, comboId) });
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string,unknown> = { ...form, quantidade: Number(form.quantidade) };
    if (!data.produtoId) delete data.produtoId;
    if (!data.tamanho) delete data.tamanho;
    if (!data.cor) delete data.cor;
    createItem.mutate({ tenantId, comboId, data: data as any }, {
      onSuccess: () => { setAdding(false); setForm({ produtoId: "", tamanho: "", cor: "", quantidade: "1" }); invalidate(); },
    });
  }

  const prodMap = Object.fromEntries(produtos.map((p) => [p.id, p]));

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Peças do Look ({itens.length})</p>
        <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)} className="h-7 text-xs">
          <Plus className="h-3 w-3 mr-1" /> Adicionar Peça
        </Button>
      </div>
      {adding && (
        <form onSubmit={handleAdd} className="grid grid-cols-4 gap-2 mb-3 p-2 bg-muted/30 rounded">
          <select className="h-8 rounded-md border border-input bg-background px-2 text-xs col-span-2" value={form.produtoId} onChange={(e) => setForm((f) => ({ ...f, produtoId: e.target.value }))}>
            <option value="">Livre (sem produto)</option>
            {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <Input className="h-8 text-xs" placeholder="Tamanho" value={form.tamanho} onChange={(e) => setForm((f) => ({ ...f, tamanho: e.target.value }))} />
          <Input className="h-8 text-xs" placeholder="Cor" value={form.cor} onChange={(e) => setForm((f) => ({ ...f, cor: e.target.value }))} />
          <Input className="h-8 text-xs col-span-2" type="number" min="1" placeholder="Qtd" value={form.quantidade} onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))} />
          <Button type="submit" size="sm" className="h-8 text-xs col-span-2" disabled={createItem.isPending}>Adicionar</Button>
        </form>
      )}
      {itens.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">Nenhuma peça adicionada ao look.</p>
      ) : (
        <div className="space-y-1">
          {itens.map((i) => (
            <div key={i.id} className="flex items-center justify-between">
              <p className="text-xs">
                <span className="font-medium">{i.produtoId ? prodMap[i.produtoId]?.nome ?? "Produto" : "Peça livre"}</span>
                {i.tamanho && <span className="text-muted-foreground"> · {i.tamanho}</span>}
                {i.cor && <span className="text-muted-foreground"> / {i.cor}</span>}
                <span className="text-muted-foreground"> · {i.quantidade} un.</span>
              </p>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => deleteItem.mutate({ tenantId, comboId, itemId: i.id }, { onSuccess: invalidate })}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VarejoCombos() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();

  const { data: combos = [], isLoading } = useListVarejoCombos(tenantId);
  const createMut = useCreateVarejoCombo();
  const updateMut = useUpdateVarejoCombo();
  const deleteMut = useDeleteVarejoCombo();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VarejoCombo | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListVarejoCombosQueryKey(tenantId) });
  }

  function handleSave(data: Record<string,unknown>) {
    if (editing) {
      updateMut.mutate({ tenantId, comboId: editing.id, data: data as any }, {
        onSuccess: () => { setEditing(null); invalidate(); },
      });
    } else {
      createMut.mutate({ tenantId, data: { ...data, tenantId } as any }, {
        onSuccess: () => { setOpen(false); invalidate(); },
      });
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Combos & Looks</h1>
          <p className="text-muted-foreground text-sm">Monte kits e looks pré-definidos para venda cruzada</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Combo
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Novo Combo / Look</DialogTitle></DialogHeader>
          <ComboForm onSave={handleSave} onCancel={() => setOpen(false)} isPending={createMut.isPending} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Combo</DialogTitle></DialogHeader>
          {editing && (
            <ComboForm initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} isPending={updateMut.isPending} />
          )}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : combos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Gift className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum combo ou look cadastrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {combos.map((c) => (
            <Card key={c.id} className={!c.ativo ? "opacity-60" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="text-base truncate">{c.nome}</CardTitle>
                    {c.descricao && <p className="text-xs text-muted-foreground truncate">{c.descricao}</p>}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.preco && (
                      <span className="text-sm font-bold text-primary">R$ {Number(c.preco).toFixed(2)}</span>
                    )}
                    {!c.ativo && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Inativo</span>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setExpanded(expanded === c.id ? null : c.id)}>
                      {expanded === c.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir combo?</AlertDialogTitle>
                          <AlertDialogDescription>Todas as peças do look serão removidas.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive text-destructive-foreground"
                            onClick={() => deleteMut.mutate({ tenantId, comboId: c.id }, { onSuccess: invalidate })}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              {expanded === c.id && (
                <CardContent className="pt-0">
                  <ComboItens comboId={c.id} tenantId={tenantId} />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
