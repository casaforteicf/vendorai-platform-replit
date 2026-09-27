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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Stethoscope, Loader2, Phone } from "lucide-react";

const getBase = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
function authHeaders() {
  const t = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${t}`, "Content-Type": "application/json" };
}

const EMPTY = {
  nome: "", crm: "", especialidadeId: "", email: "", telefone: "", ativo: true,
};

export default function Medicos() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing]       = useState<any>(null);
  const [form, setForm]             = useState({ ...EMPTY });
  const [novaEsp, setNovaEsp]       = useState("");
  const [addEspOpen, setAddEspOpen] = useState(false);

  const QK_MEDICOS = ["clinic-medicos", tenantId];
  const QK_ESPS    = ["clinic-especialidades", tenantId];

  const { data: medicos = [], isLoading } = useQuery<any[]>({
    queryKey: QK_MEDICOS,
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/clinic/medicos`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId,
  });

  const { data: especialidades = [] } = useQuery<any[]>({
    queryKey: QK_ESPS,
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/clinic/especialidades`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: (payload: any) => {
      const url = editing
        ? `/api/tenants/${tenantId}/clinic/medicos/${editing.id}`
        : `/api/tenants/${tenantId}/clinic/medicos`;
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
      qc.invalidateQueries({ queryKey: QK_MEDICOS });
      toast({ title: editing ? "Médico atualizado!" : "Médico criado!" });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleAtivo = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      fetch(`/api/tenants/${tenantId}/clinic/medicos/${id}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ ativo }),
      }).then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? "Não foi possível alterar o status do médico.");
        return body;
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK_MEDICOS }),
    onError: (error: Error) => toast({ title: "Erro ao alterar médico", description: error.message, variant: "destructive" }),
  });

  const addEspecialidade = useMutation({
    mutationFn: (nome: string) =>
      fetch(`/api/tenants/${tenantId}/clinic/especialidades`, {
        method: "POST", headers: authHeaders(),
        body: JSON.stringify({ nome, duracaoMinutos: 30 }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: (row) => {
      qc.invalidateQueries({ queryKey: QK_ESPS });
      setForm((f) => ({ ...f, especialidadeId: row.id }));
      setNovaEsp(""); setAddEspOpen(false);
      toast({ title: "Especialidade criada!" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditing(null); setForm({ ...EMPTY }); setDialogOpen(true);
  }
  function openEdit(m: any) {
    setEditing(m);
    setForm({
      nome: m.nome ?? "", crm: m.crm ?? "",
      especialidadeId: m.especialidade?.id ?? m.especialidadeId ?? "",
      email: m.email ?? "", telefone: m.telefone ?? "",
      ativo: m.ativo !== false,
    });
    setDialogOpen(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome) { toast({ title: "Nome é obrigatório", variant: "destructive" }); return; }
    save.mutate({
      nome: form.nome, crm: form.crm || null,
      especialidadeId: form.especialidadeId || null,
      email: form.email || null, telefone: form.telefone || null,
      ativo: form.ativo,
    });
  }

  const ativos   = Array.isArray(medicos) ? medicos.filter((m) => m.ativo !== false) : [];
  const inativos = Array.isArray(medicos) ? medicos.filter((m) => m.ativo === false)  : [];
  const espsArr  = Array.isArray(especialidades) ? especialidades : [];

  function MedCard({ m }: { m: any }) {
    const initials = m.nome?.split(" ").slice(0, 2).map((n: string) => n[0]).join("").toUpperCase() ?? "?";
    return (
      <Card className={m.ativo === false ? "opacity-60" : ""}>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
              {initials}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm">Dr(a). {m.nome}</p>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Switch checked={m.ativo !== false}
                    onCheckedChange={(v) => toggleAtivo.mutate({ id: m.id, ativo: v })} />
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(m)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {m.crm && (
                  <Badge variant="outline" className="text-xs">CRM {m.crm}</Badge>
                )}
                {(m.especialidade?.nome ?? m.especialidadeNome) && (
                  <Badge variant="secondary" className="text-xs">
                    {m.especialidade?.nome ?? m.especialidadeNome}
                  </Badge>
                )}
              </div>
              {(m.telefone || m.email) && (
                <div className="mt-1.5 space-y-0.5">
                  {m.telefone && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" /> {m.telefone}
                    </p>
                  )}
                  {m.email && (
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  )}
                </div>
              )}
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
            <Stethoscope className="h-5 w-5" /> Médicos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {Array.isArray(medicos) ? medicos.length : 0} médico(s) cadastrado(s)
          </p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-2" /> Novo Médico</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[1,2,3].map((i) => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : ativos.length === 0 && inativos.length === 0 ? (
        <div className="border rounded-lg p-10 text-center">
          <Stethoscope className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Nenhum médico cadastrado. Adicione o primeiro!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ativos.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Ativos ({ativos.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {ativos.map((m: any) => <MedCard key={m.id} m={m} />)}
              </div>
            </div>
          )}
          {inativos.length > 0 && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                Inativos ({inativos.length})
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {inativos.map((m: any) => <MedCard key={m.id} m={m} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Médico" : "Novo Médico"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Nome <span className="text-destructive">*</span></Label>
              <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                placeholder="Nome completo" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>CRM</Label>
                <Input value={form.crm} onChange={(e) => setForm((f) => ({ ...f, crm: e.target.value }))}
                  placeholder="000000-SP" />
              </div>
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))}
                  placeholder="(11) 99999-9999" />
              </div>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Especialidade</Label>
                <button type="button" className="text-xs text-primary underline"
                  onClick={() => setAddEspOpen((v) => !v)}>
                  {addEspOpen ? "Cancelar" : "+ Nova"}
                </button>
              </div>
              {addEspOpen ? (
                <div className="flex gap-2">
                  <Input value={novaEsp} onChange={(e) => setNovaEsp(e.target.value)}
                    placeholder="Nome da especialidade" className="flex-1" />
                  <Button type="button" size="sm" disabled={!novaEsp || addEspecialidade.isPending}
                    onClick={() => addEspecialidade.mutate(novaEsp)}>
                    {addEspecialidade.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "OK"}
                  </Button>
                </div>
              ) : (
                <Select value={form.especialidadeId} onValueChange={(v) => setForm((f) => ({ ...f, especialidadeId: v }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                  <SelectContent>
                    {espsArr.map((e: any) => (
                      <SelectItem key={e.id} value={e.id}>{e.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>E-mail</Label>
              <Input type="email" value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="medico@clinica.com" />
            </div>
            {editing && (
              <div className="flex items-center gap-2">
                <Switch checked={form.ativo} onCheckedChange={(v) => setForm((f) => ({ ...f, ativo: v }))} />
                <Label>Ativo</Label>
              </div>
            )}
            <div className="flex gap-2 justify-end pt-1">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
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
