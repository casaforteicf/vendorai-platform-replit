import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListVarejoFornecedores,
  useCreateVarejoFornecedor,
  useUpdateVarejoFornecedor,
  useDeleteVarejoFornecedor,
  getListVarejoFornecedoresQueryKey,
} from "@workspace/api-client-react";
import type { VarejoFornecedor } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Truck, Search, Phone, Mail } from "lucide-react";

function FornecedorForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Partial<VarejoFornecedor>;
  onSave: (d: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    nome: initial?.nome ?? "",
    marca: initial?.marca ?? "",
    contato: initial?.contato ?? "",
    email: initial?.email ?? "",
    telefone: initial?.telefone ?? "",
    cnpj: initial?.cnpj ?? "",
    condicoesPagamento: initial?.condicoesPagamento ?? "",
    prazoEntregaDias: initial?.prazoEntregaDias ? String(initial.prazoEntregaDias) : "",
    observacoes: initial?.observacoes ?? "",
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: Record<string, unknown> = { ...form };
    if (form.prazoEntregaDias) payload.prazoEntregaDias = Number(form.prazoEntregaDias);
    Object.keys(payload).forEach((k) => { if (payload[k] === "") delete payload[k]; });
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
          <Label>Marca / Grife</Label>
          <Input value={form.marca} onChange={(e) => setForm((f) => ({ ...f, marca: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>CNPJ</Label>
          <Input value={form.cnpj} onChange={(e) => setForm((f) => ({ ...f, cnpj: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Contato</Label>
          <Input value={form.contato} onChange={(e) => setForm((f) => ({ ...f, contato: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Telefone</Label>
          <Input value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} />
        </div>
        <div className="col-span-2 space-y-2">
          <Label>E-mail</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Condições de Pagamento</Label>
          <Input placeholder="Ex: 30/60/90 dias" value={form.condicoesPagamento} onChange={(e) => setForm((f) => ({ ...f, condicoesPagamento: e.target.value }))} />
        </div>
        <div className="space-y-2">
          <Label>Prazo de Entrega (dias)</Label>
          <Input type="number" min="0" value={form.prazoEntregaDias} onChange={(e) => setForm((f) => ({ ...f, prazoEntregaDias: e.target.value }))} />
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

export default function VarejoFornecedores() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();

  const { data: fornecedores = [], isLoading } = useListVarejoFornecedores(tenantId);
  const createMut = useCreateVarejoFornecedor();
  const updateMut = useUpdateVarejoFornecedor();
  const deleteMut = useDeleteVarejoFornecedor();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VarejoFornecedor | null>(null);
  const [search, setSearch] = useState("");

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListVarejoFornecedoresQueryKey(tenantId) });
  }

  function handleSave(data: Record<string, unknown>) {
    if (editing) {
      updateMut.mutate({ tenantId, fornecedorId: editing.id, data: data as any }, {
        onSuccess: () => { setEditing(null); invalidate(); },
      });
    } else {
      createMut.mutate({ tenantId, data: { ...data, tenantId } as any }, {
        onSuccess: () => { setOpen(false); invalidate(); },
      });
    }
  }

  const filtered = search
    ? fornecedores.filter((f) => [f.nome, f.marca, f.contato].join(" ").toLowerCase().includes(search.toLowerCase()))
    : fornecedores;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Fornecedores</h1>
          <p className="text-muted-foreground text-sm">Marcas e representantes do seu mix de produtos</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Novo Fornecedor
        </Button>
      </div>

      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Novo Fornecedor</DialogTitle></DialogHeader>
          <FornecedorForm onSave={handleSave} onCancel={() => setOpen(false)} isPending={createMut.isPending} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Editar Fornecedor</DialogTitle></DialogHeader>
          {editing && (
            <FornecedorForm initial={editing} onSave={handleSave} onCancel={() => setEditing(null)} isPending={updateMut.isPending} />
          )}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Truck className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhum fornecedor encontrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtered.map((f) => (
            <Card key={f.id} className="hover:shadow-sm transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{f.nome}</CardTitle>
                    {f.marca && <p className="text-xs text-muted-foreground">{f.marca}</p>}
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(f)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir fornecedor?</AlertDialogTitle>
                          <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground"
                            onClick={() => deleteMut.mutate({ tenantId, fornecedorId: f.id }, { onSuccess: invalidate })}
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0 space-y-1">
                {f.telefone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Phone className="h-3 w-3" /> {f.telefone}
                  </p>
                )}
                {f.email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                    <Mail className="h-3 w-3" /> {f.email}
                  </p>
                )}
                {f.condicoesPagamento && (
                  <p className="text-xs text-muted-foreground">Pagamento: {f.condicoesPagamento}</p>
                )}
                {f.prazoEntregaDias && (
                  <p className="text-xs text-muted-foreground">Prazo: {f.prazoEntregaDias} dias</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
