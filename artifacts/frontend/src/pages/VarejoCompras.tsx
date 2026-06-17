import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListVarejoPedidosCompra,
  useCreateVarejoPedidoCompra,
  useUpdateVarejoPedidoCompra,
  useDeleteVarejoPedidoCompra,
  useListVarejoPedidoCompraItens,
  useCreateVarejoPedidoCompraItem,
  useDeleteVarejoPedidoCompraItem,
  useListVarejoFornecedores,
  useListVarejoColecoes,
  useListVarejoProdutos,
  getListVarejoPedidosCompraQueryKey,
  getListVarejoPedidoCompraItensQueryKey,
} from "@workspace/api-client-react";
import type { VarejoPedidoCompra } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, ShoppingCart, Pencil, Trash2, ChevronDown, ChevronUp } from "lucide-react";

const STATUS_LABELS: Record<string,string> = {
  rascunho:"Rascunho", enviado:"Enviado", confirmado:"Confirmado", entregue:"Entregue", cancelado:"Cancelado",
};
const STATUS_COLORS: Record<string,string> = {
  rascunho:"bg-gray-100 text-gray-700",
  enviado:"bg-blue-100 text-blue-700",
  confirmado:"bg-yellow-100 text-yellow-700",
  entregue:"bg-green-100 text-green-700",
  cancelado:"bg-red-100 text-red-600",
};

function PedidoForm({
  initial,
  onSave,
  onCancel,
  isPending,
  fornecedores,
  colecoes,
}: {
  initial?: Partial<VarejoPedidoCompra>;
  onSave: (d: Record<string,unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
  fornecedores: {id:string;nome:string}[];
  colecoes: {id:string;nome:string}[];
}) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({
    fornecedorId: initial?.fornecedorId ?? "",
    colecaoId: initial?.colecaoId ?? "",
    status: initial?.status ?? "rascunho",
    dataEmissao: initial?.dataEmissao ?? today,
    dataPrevista: initial?.dataPrevista ?? "",
    valorTotal: initial?.valorTotal ?? "",
    observacoes: initial?.observacoes ?? "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string,unknown> = { ...form };
    Object.keys(payload).forEach((k) => { if (payload[k] === "") delete payload[k]; });
    onSave(payload);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Fornecedor</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.fornecedorId} onChange={(e) => setForm((f) => ({ ...f, fornecedorId: e.target.value }))}>
            <option value="">-- Nenhum --</option>
            {fornecedores.map((f) => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Coleção</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.colecaoId} onChange={(e) => setForm((f) => ({ ...f, colecaoId: e.target.value }))}>
            <option value="">-- Nenhuma --</option>
            {colecoes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as typeof f.status }))}>
            {Object.entries(STATUS_LABELS).map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Valor Total (R$)</Label>
          <Input type="number" step="0.01" value={form.valorTotal} onChange={(e) => setForm((f) => ({ ...f, valorTotal: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Data de Emissão *</Label>
          <Input required type="date" value={form.dataEmissao} onChange={(e) => setForm((f) => ({ ...f, dataEmissao: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Data Prevista</Label>
          <Input type="date" value={form.dataPrevista} onChange={(e) => setForm((f) => ({ ...f, dataPrevista: e.target.value }))} />
        </div>
        <div className="col-span-2 space-y-2">
          <Label>Observações</Label>
          <Input value={form.observacoes} onChange={(e) => setForm((f) => ({ ...f, observacoes: e.target.value }))} />
        </div>
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar"}</Button>
      </div>
    </form>
  );
}

function PedidoItens({ pedidoId, tenantId }: { pedidoId: string; tenantId: string }) {
  const qc = useQueryClient();
  const { data: itens = [] } = useListVarejoPedidoCompraItens(tenantId, pedidoId);
  const { data: produtos = [] } = useListVarejoProdutos(tenantId);
  const createItem = useCreateVarejoPedidoCompraItem();
  const deleteItem = useDeleteVarejoPedidoCompraItem();

  const [form, setForm] = useState({ produtoId: "", tamanho: "", cor: "", quantidade: "1", precoUnitario: "" });
  const [adding, setAdding] = useState(false);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListVarejoPedidoCompraItensQueryKey(tenantId, pedidoId) });
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string,unknown> = { ...form, quantidade: Number(form.quantidade) };
    if (!data.produtoId) delete data.produtoId;
    createItem.mutate({ tenantId, pedidoId, data: data as any }, {
      onSuccess: () => { setAdding(false); setForm({ produtoId: "", tamanho: "", cor: "", quantidade: "1", precoUnitario: "" }); invalidate(); },
    });
  }

  const prodMap = Object.fromEntries(produtos.map((p) => [p.id, p]));

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Itens do Pedido ({itens.length})</p>
        <Button size="sm" variant="ghost" onClick={() => setAdding((v) => !v)} className="h-7 text-xs">
          <Plus className="h-3 w-3 mr-1" /> Adicionar Item
        </Button>
      </div>
      {adding && (
        <form onSubmit={handleAdd} className="grid grid-cols-5 gap-2 mb-3 p-2 bg-muted/30 rounded">
          <select className="h-8 rounded-md border border-input bg-background px-2 text-xs col-span-2" value={form.produtoId} onChange={(e) => setForm((f) => ({ ...f, produtoId: e.target.value }))}>
            <option value="">Produto livre</option>
            {produtos.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
          <Input className="h-8 text-xs" placeholder="Tamanho" required value={form.tamanho} onChange={(e) => setForm((f) => ({ ...f, tamanho: e.target.value }))} />
          <Input className="h-8 text-xs" placeholder="Cor" required value={form.cor} onChange={(e) => setForm((f) => ({ ...f, cor: e.target.value }))} />
          <Input className="h-8 text-xs" type="number" placeholder="Qtd" min="1" required value={form.quantidade} onChange={(e) => setForm((f) => ({ ...f, quantidade: e.target.value }))} />
          <Input className="h-8 text-xs col-span-3" type="number" step="0.01" placeholder="Preço unitário (R$)" required value={form.precoUnitario} onChange={(e) => setForm((f) => ({ ...f, precoUnitario: e.target.value }))} />
          <Button type="submit" size="sm" className="h-8 text-xs col-span-2" disabled={createItem.isPending}>Salvar</Button>
        </form>
      )}
      {itens.length === 0 ? (
        <p className="text-xs text-muted-foreground py-2">Nenhum item adicionado.</p>
      ) : (
        <div className="divide-y">
          {itens.map((i) => (
            <div key={i.id} className="flex items-center justify-between py-1.5">
              <div className="text-xs">
                <span className="font-medium">{i.produtoId ? prodMap[i.produtoId]?.nome ?? "Produto" : "Item livre"}</span>
                <span className="text-muted-foreground"> · {i.tamanho} / {i.cor} · {i.quantidade} un. · R$ {Number(i.precoUnitario).toFixed(2)}</span>
              </div>
              <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:text-destructive"
                onClick={() => deleteItem.mutate({ tenantId, pedidoId, itemId: i.id }, { onSuccess: invalidate })}>
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function VarejoCompras() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();

  const { data: pedidos = [], isLoading } = useListVarejoPedidosCompra(tenantId);
  const { data: fornecedores = [] } = useListVarejoFornecedores(tenantId);
  const { data: colecoes = [] } = useListVarejoColecoes(tenantId);
  const createMut = useCreateVarejoPedidoCompra();
  const updateMut = useUpdateVarejoPedidoCompra();
  const deleteMut = useDeleteVarejoPedidoCompra();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VarejoPedidoCompra | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListVarejoPedidosCompraQueryKey(tenantId) });
  }

  function handleSave(data: Record<string,unknown>) {
    if (editing) {
      updateMut.mutate({ tenantId, pedidoId: editing.id, data: data as any }, {
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
          <h1 className="text-2xl font-bold">Pedidos de Compra</h1>
          <p className="text-muted-foreground text-sm">Pedidos para fornecedores e reposição de estoque</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Pedido
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Pedido de Compra</DialogTitle></DialogHeader>
          <PedidoForm onSave={handleSave} onCancel={() => setOpen(false)} isPending={createMut.isPending} fornecedores={fornecedores} colecoes={colecoes} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Pedido</DialogTitle></DialogHeader>
          {editing && (
            <PedidoForm initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} isPending={updateMut.isPending} fornecedores={fornecedores} colecoes={colecoes} />
          )}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : pedidos.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <ShoppingCart className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum pedido de compra cadastrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pedidos.map((p) => (
            <Card key={p.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLORS[p.status]}`}>
                      {STATUS_LABELS[p.status]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">
                        {(p as any).fornecedor?.nome ?? "Sem fornecedor"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {p.dataEmissao}{p.dataPrevista ? ` → ${p.dataPrevista}` : ""}
                        {(p as any).colecao ? ` · ${(p as any).colecao.nome}` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {p.valorTotal && (
                      <span className="text-sm font-semibold text-primary">R$ {Number(p.valorTotal).toFixed(2)}</span>
                    )}
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditing(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setExpanded(expanded === p.id ? null : p.id)}>
                      {expanded === p.id ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir pedido?</AlertDialogTitle>
                          <AlertDialogDescription>Todos os itens do pedido também serão removidos.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction className="bg-destructive text-destructive-foreground"
                            onClick={() => deleteMut.mutate({ tenantId, pedidoId: p.id }, { onSuccess: invalidate })}>
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              {expanded === p.id && (
                <CardContent className="pt-0">
                  {p.observacoes && <p className="text-xs text-muted-foreground mb-2">{p.observacoes}</p>}
                  <PedidoItens pedidoId={p.id} tenantId={tenantId} />
                </CardContent>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
