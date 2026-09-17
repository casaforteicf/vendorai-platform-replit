import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, UtensilsCrossed, Loader2 } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const CATEGORIAS = [
  { value: "entrada", label: "Entrada" },
  { value: "prato_principal", label: "Prato principal" },
  { value: "lanche", label: "Lanche" },
  { value: "pizza", label: "Pizza" },
  { value: "bebida", label: "Bebida" },
  { value: "sobremesa", label: "Sobremesa" },
  { value: "padaria", label: "Padaria" },
  { value: "outro", label: "Outro" },
] as const;

function fmt(v: number | string | null) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const EMPTY_ITEM = {
  nome: "", descricao: "", categoria: "prato_principal" as string,
  preco: "", tempoPreparoMin: "", disponivel: true,
};

export default function FoodCardapio() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_ITEM });

  const QK = ["food-cardapio", tenantId];

  const { data: itens = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/food/cardapio`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: (payload: any) => {
      const url = editing
        ? `/api/tenants/${tenantId}/food/cardapio/${editing.id}`
        : `/api/tenants/${tenantId}/food/cardapio`;
      return fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: QK });
      toast({ title: editing ? "Item atualizado!" : "Item adicionado ao cardápio!" });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleDisponivel = useMutation({
    mutationFn: ({ id, disponivel }: { id: string; disponivel: boolean }) =>
      fetch(`/api/tenants/${tenantId}/food/cardapio/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ disponivel }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_ITEM });
    setDialogOpen(true);
  }
  function openEdit(item: any) {
    setEditing(item);
    setForm({
      nome: item.nome ?? "",
      descricao: item.descricao ?? "",
      categoria: item.categoria ?? "prato_principal",
      preco: item.preco != null ? String(item.preco) : "",
      tempoPreparoMin: item.tempoPreparoMin != null ? String(item.tempoPreparoMin) : "",
      disponivel: item.disponivel !== false,
    });
    setDialogOpen(true);
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome || !form.preco) {
      toast({ title: "Nome e preço são obrigatórios", variant: "destructive" });
      return;
    }
    save.mutate({
      ...form,
      tempoPreparoMin: form.tempoPreparoMin !== "" ? Number(form.tempoPreparoMin) : null,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <UtensilsCrossed className="h-5 w-5" /> Cardápio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Itens disponíveis para pedido — mesa, delivery ou retirada</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Novo Item
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}
            </div>
          ) : itens.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">Nenhum item no cardápio ainda.</p>
          ) : (
            <div className="divide-y">
              {itens.map((item: any) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{item.nome}</span>
                      <Badge variant="secondary" className="text-xs">
                        {CATEGORIAS.find((c) => c.value === item.categoria)?.label ?? item.categoria}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {fmt(item.preco)}
                      {item.tempoPreparoMin ? ` · ~${item.tempoPreparoMin} min` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Switch checked={item.disponivel !== false} onCheckedChange={(v) => toggleDisponivel.mutate({ id: item.id, disponivel: v })} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(item)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Item" : "Novo Item do Cardápio"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Nome <span className="text-destructive">*</span></Label>
              <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="ex: Pizza Margherita" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Preço (R$) <span className="text-destructive">*</span></Label>
                <Input type="number" min={0} step={0.01} value={form.preco} onChange={(e) => setForm((f) => ({ ...f, preco: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Tempo de preparo (min)</Label>
                <Input type="number" min={0} value={form.tempoPreparoMin} onChange={(e) => setForm((f) => ({ ...f, tempoPreparoMin: e.target.value }))} placeholder="opcional" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.disponivel} onCheckedChange={(v) => setForm((f) => ({ ...f, disponivel: v }))} />
              <Label>Disponível pra pedido agora</Label>
            </div>
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
