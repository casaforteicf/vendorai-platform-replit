import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, User2, Loader2, Phone } from "lucide-react";

const getBase = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const EMPTY_FORM = {
  nome: "", especialidades: "", telefone: "", email: "",
  comissaoPercentual: "", ativo: true,
};

export default function Profissionais() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });

  const QK = ["beauty-profissionais", tenantId];

  const { data: profissionais = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/beauty/profissionais`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: (payload: any) => {
      const url = editing
        ? `/api/tenants/${tenantId}/beauty/profissionais/${editing.id}`
        : `/api/tenants/${tenantId}/beauty/profissionais`;
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
      toast({ title: editing ? "Profissional atualizado!" : "Profissional criado!" });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleAtivo = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      fetch(`/api/tenants/${tenantId}/beauty/profissionais/${id}`, {
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

  function openEdit(p: any) {
    setEditing(p);
    setForm({
      nome: p.nome ?? "",
      especialidades: Array.isArray(p.especialidades) ? p.especialidades.join(", ") : (p.especialidades ?? ""),
      telefone: p.telefone ?? "",
      email: p.email ?? "",
      comissaoPercentual: p.comissaoPercentual != null ? String(p.comissaoPercentual) : "",
      ativo: p.ativo !== false,
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    const especialidadesArr = form.especialidades
      ? form.especialidades.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    save.mutate({
      ...form,
      especialidades: especialidadesArr,
      comissaoPercentual: form.comissaoPercentual !== "" ? Number(form.comissaoPercentual) : null,
    });
  }

  const ativos   = Array.isArray(profissionais) ? profissionais.filter((p) => p.ativo !== false) : [];
  const inativos = Array.isArray(profissionais) ? profissionais.filter((p) => p.ativo === false)  : [];

  function ProfCard({ p }: { p: any }) {
    const especialidadesArr: string[] = Array.isArray(p.especialidades)
      ? p.especialidades
      : typeof p.especialidades === "string" && p.especialidades
        ? p.especialidades.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
    const initials = p.nome?.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase() ?? "?";

    return (
      <Card className={p.ativo === false ? "opacity-60" : ""}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm">{p.nome}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch
                    checked={p.ativo !== false}
                    onCheckedChange={(v) => toggleAtivo.mutate({ id: p.id, ativo: v })}
                  />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(p)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              {especialidadesArr.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {especialidadesArr.map((esp) => (
                    <Badge key={esp} variant="secondary" className="text-xs">{esp}</Badge>
                  ))}
                </div>
              )}
              <div className="flex flex-col gap-0.5 mt-2">
                {p.telefone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-3 w-3" /> {p.telefone}
                  </p>
                )}
                {p.comissaoPercentual != null && (
                  <p className="text-xs text-muted-foreground">Comissão: {p.comissaoPercentual}%</p>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <User2 className="h-5 w-5" /> Profissionais
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {Array.isArray(profissionais) ? profissionais.length : 0} profissional(is) cadastrado(s)
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Novo Profissional
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : ativos.length === 0 && inativos.length === 0 ? (
        <Card className="p-10 text-center">
          <User2 className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nenhum profissional cadastrado. Adicione o primeiro!</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {ativos.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Ativos ({ativos.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ativos.map((p: any) => <ProfCard key={p.id} p={p} />)}
              </div>
            </div>
          )}
          {inativos.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Inativos ({inativos.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {inativos.map((p: any) => <ProfCard key={p.id} p={p} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Profissional" : "Novo Profissional"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Nome <span className="text-destructive">*</span></Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Nome completo"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Especialidades</Label>
              <Input
                value={form.especialidades}
                onChange={(e) => setForm((f) => ({ ...f, especialidades: e.target.value }))}
                placeholder="Corte, Coloração, Unhas (separar por vírgula)"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input
                  value={form.telefone}
                  onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                  placeholder="(11) 99999-9999"
                />
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
                  placeholder="40"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="profissional@exemplo.com"
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
