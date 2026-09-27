import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  useListVarejoColecoes,
  useCreateVarejoColecao,
  useUpdateVarejoColecao,
  useDeleteVarejoColecao,
  getListVarejoColecoesQueryKey,
} from "@workspace/api-client-react";
import type { VarejoColecao } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const TEMPORADAS = ["verao", "inverno", "outono", "primavera", "especial"] as const;
const TEMPORADA_LABELS: Record<string, string> = {
  verao: "Verão", inverno: "Inverno", outono: "Outono", primavera: "Primavera", especial: "Especial",
};
const STATUS_LABELS: Record<string, string> = {
  planejamento: "Planejamento", ativa: "Ativa", encerrada: "Encerrada",
};
const STATUS_COLORS: Record<string, string> = {
  planejamento: "bg-yellow-100 text-yellow-800",
  ativa: "bg-green-100 text-green-800",
  encerrada: "bg-gray-100 text-gray-600",
};
const ano = new Date().getFullYear();

function ColecaoForm({
  initial,
  onSave,
  onCancel,
  isPending,
}: {
  initial?: Partial<VarejoColecao>;
  onSave: (d: Record<string, unknown>) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState({
    nome: initial?.nome ?? "",
    temporada: initial?.temporada ?? "verao",
    ano: String(initial?.ano ?? ano),
    status: initial?.status ?? "planejamento",
    descricao: initial?.descricao ?? "",
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ ...form, ano: Number(form.ano) });
      }}
      className="space-y-4"
    >
      <div className="space-y-2">
        <Label>Nome *</Label>
        <Input required value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Temporada *</Label>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={form.temporada}
            onChange={(e) => setForm((f) => ({ ...f, temporada: e.target.value as typeof f.temporada }))}
          >
            {TEMPORADAS.map((t) => <option key={t} value={t}>{TEMPORADA_LABELS[t]}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Ano *</Label>
          <Input type="number" required value={form.ano} onChange={(e) => setForm((f) => ({ ...f, ano: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <select
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
          value={form.status}
          onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as typeof f.status }))}
        >
          {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <Label>Descrição</Label>
        <Input value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} />
      </div>
      <div className="flex gap-2 justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={isPending}>{isPending ? "Salvando..." : "Salvar"}</Button>
      </div>
    </form>
  );
}

export default function VarejoColecoes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();

  const { data: colecoes = [], isLoading } = useListVarejoColecoes(tenantId);
  const createMut = useCreateVarejoColecao();
  const updateMut = useUpdateVarejoColecao();
  const deleteMut = useDeleteVarejoColecao();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<VarejoColecao | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: getListVarejoColecoesQueryKey(tenantId) });
  }

  function handleSave(data: Record<string, unknown>) {
    if (editing) {
      updateMut.mutate({ tenantId, colecaoId: editing.id, data: data as any }, {
        onSuccess: () => { setEditing(null); invalidate(); },
        onError: (error: unknown) => toast({ title: "Não foi possível atualizar a coleção", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" }),
      });
    } else {
      createMut.mutate({ tenantId, data: { ...data, tenantId } as any }, {
        onSuccess: () => { setOpen(false); invalidate(); },
        onError: (error: unknown) => toast({ title: "Não foi possível criar a coleção", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" }),
      });
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Coleções</h1>
          <p className="text-muted-foreground text-sm">Gerencie as coleções sazonais do seu catálogo</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nova Coleção
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nova Coleção</DialogTitle></DialogHeader>
          <ColecaoForm
            onSave={handleSave}
            onCancel={() => setOpen(false)}
            isPending={createMut.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar Coleção</DialogTitle></DialogHeader>
          {editing && (
            <ColecaoForm
              initial={editing}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
              isPending={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Carregando...</div>
      ) : colecoes.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Layers className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma coleção cadastrada ainda.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {colecoes.map((c) => (
            <Card key={c.id} className="hover:shadow-sm transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{c.nome}</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {TEMPORADA_LABELS[c.temporada]} {c.ano}
                    </p>
                  </div>
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[c.status]}`}>
                    {STATUS_LABELS[c.status]}
                  </span>
                </div>
              </CardHeader>
              {c.descricao && (
                <CardContent className="pt-0 pb-2">
                  <p className="text-sm text-muted-foreground">{c.descricao}</p>
                </CardContent>
              )}
              <CardContent className="pt-0">
                <div className="flex gap-2 justify-end">
                  <Button size="sm" variant="ghost" onClick={() => setEditing(c)}>
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
                        <AlertDialogTitle>Excluir coleção?</AlertDialogTitle>
                        <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground"
                          onClick={() => deleteMut.mutate({ tenantId, colecaoId: c.id }, { onSuccess: invalidate, onError: (error: unknown) => toast({ title: "Não foi possível excluir a coleção", description: error instanceof Error ? error.message : "Tente novamente.", variant: "destructive" }) })}
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
