import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Scissors, Loader2 } from "lucide-react";

const getBase = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const CATEGORIAS = [
  { value: "cabelo",       label: "Cabelo" },
  { value: "coloracao",   label: "Coloração" },
  { value: "estetica",    label: "Estética" },
  { value: "unhas",       label: "Unhas" },
  { value: "sobrancelha", label: "Sobrancelha/Cílios" },
  { value: "massagem",    label: "Massagem" },
  { value: "maquiagem",   label: "Maquiagem" },
  { value: "outros",      label: "Outros" },
] as const;

type CategoriaKey = typeof CATEGORIAS[number]["value"];

const CAT_COLORS: Record<string, string> = {
  cabelo:      "bg-pink-50 text-pink-700 border-pink-200",
  coloracao:   "bg-violet-50 text-violet-700 border-violet-200",
  estetica:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  unhas:       "bg-rose-50 text-rose-700 border-rose-200",
  sobrancelha: "bg-amber-50 text-amber-700 border-amber-200",
  massagem:    "bg-blue-50 text-blue-700 border-blue-200",
  maquiagem:   "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  outros:      "bg-slate-50 text-slate-600 border-slate-200",
};

const EMPTY_FORM = {
  nome: "", categoria: "cabelo" as CategoriaKey, duracaoMinutos: 60,
  preco: "", comissaoPercentual: "", ativo: true,
};

function fmt(v: number | string) {
  return Number(v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Servicos() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const QK = ["beauty-servicos", tenantId];

  const { data: servicos = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/beauty/servicos`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: (payload: any) => {
      const url = editing
        ? `/api/tenants/${tenantId}/beauty/servicos/${editing.id}`
        : `/api/tenants/${tenantId}/beauty/servicos`;
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
      toast({ title: editing ? "Serviço atualizado!" : "Serviço criado!" });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleAtivo = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      fetch(`/api/tenants/${tenantId}/beauty/servicos/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ ativo }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    onError: () => toast({ title: "Erro ao atualizar", variant: "destructive" }),
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(s: any) {
    setEditing(s);
    setForm({
      nome: s.nome ?? "",
      categoria: s.categoria ?? "cabelo",
      duracaoMinutos: s.duracaoMinutos ?? 60,
      preco: String(s.preco ?? ""),
      comissaoPercentual: s.comissaoPercentual != null ? String(s.comissaoPercentual) : "",
      ativo: s.ativo !== false,
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
      preco: form.preco,
      duracaoMinutos: Number(form.duracaoMinutos),
      comissaoPercentual: form.comissaoPercentual !== "" ? Number(form.comissaoPercentual) : null,
    });
  }

  const ativos   = Array.isArray(servicos) ? servicos.filter((s) => s.ativo !== false) : [];
  const inativos = Array.isArray(servicos) ? servicos.filter((s) => s.ativo === false)  : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Scissors className="h-5 w-5" /> Serviços
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {Array.isArray(servicos) ? servicos.length : 0} serviço(s) cadastrado(s)
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Novo Serviço
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Ativos ({ativos.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : ativos.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">Nenhum serviço ativo. Crie o primeiro!</p>
          ) : (
            <div className="divide-y">
              {ativos.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{s.nome}</span>
                      <Badge variant="outline" className={`text-xs ${CAT_COLORS[s.categoria] ?? ""}`}>
                        {CATEGORIAS.find((c) => c.value === s.categoria)?.label ?? s.categoria}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.duracaoMinutos} min · {fmt(s.preco)}
                      {s.comissaoPercentual != null && ` · Comissão ${s.comissaoPercentual}%`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Switch
                      checked={s.ativo !== false}
                      onCheckedChange={(v) => toggleAtivo.mutate({ id: s.id, ativo: v })}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {inativos.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Inativos ({inativos.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {inativos.map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 px-4 py-3 opacity-60 hover:opacity-80 transition-opacity">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm line-through">{s.nome}</p>
                    <p className="text-xs text-muted-foreground">{s.duracaoMinutos} min · {fmt(s.preco)}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Switch
                      checked={false}
                      onCheckedChange={(v) => toggleAtivo.mutate({ id: s.id, ativo: v })}
                    />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(s)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Serviço" : "Novo Serviço"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Nome <span className="text-destructive">*</span></Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="ex: Corte feminino"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select
                value={form.categoria}
                onValueChange={(v) => setForm((f) => ({ ...f, categoria: v as CategoriaKey }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Duração (min) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min={5}
                  step={5}
                  value={form.duracaoMinutos}
                  onChange={(e) => setForm((f) => ({ ...f, duracaoMinutos: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Preço (R$) <span className="text-destructive">*</span></Label>
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={form.preco}
                  onChange={(e) => setForm((f) => ({ ...f, preco: e.target.value }))}
                  placeholder="0,00"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Comissão (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={form.comissaoPercentual}
                onChange={(e) => setForm((f) => ({ ...f, comissaoPercentual: e.target.value }))}
                placeholder="ex: 40"
              />
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={form.ativo}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))}
                />
                <Label>Ativo</Label>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Salvar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
