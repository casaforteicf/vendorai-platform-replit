import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, HardHat, Loader2, Wrench, LibraryBig } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const ESPECIALIDADES = [
  { value: "pedreiro", label: "Pedreiro" },
  { value: "eletricista", label: "Eletricista" },
  { value: "encanador", label: "Encanador" },
  { value: "geral", label: "Geral" },
] as const;

const CATEGORIAS = ["Casa e construção", "Manutenção e assistência", "Automotivo", "Saúde e beleza", "Serviços profissionais", "Eventos e lazer", "Logística", "Imóveis", "Viagens e hotelaria", "Outros"];

const ESP_COLORS: Record<string, string> = {
  pedreiro: "bg-amber-50 text-amber-700 border-amber-200",
  eletricista: "bg-yellow-50 text-yellow-700 border-yellow-200",
  encanador: "bg-blue-50 text-blue-700 border-blue-200",
  geral: "bg-slate-50 text-slate-600 border-slate-200",
};

function fmt(v: number | string | null) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ── Prestadores ──────────────────────────────────────────────────────────────

const EMPTY_PRESTADOR = {
  nome: "", email: "", telefone: "", especialidade: "geral" as string,
  raioAtendimentoKm: 15, comissaoBase: "60", ativo: true,
};

function PrestadoresTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_PRESTADOR });

  const QK = ["servicos-prestadores", tenantId];

  const { data: prestadores = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/servicos/prestadores`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: (payload: any) => {
      const url = editing
        ? `/api/tenants/${tenantId}/servicos/prestadores/${editing.id}`
        : `/api/tenants/${tenantId}/servicos/prestadores`;
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
      toast({ title: editing ? "Prestador atualizado!" : "Prestador cadastrado!" });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const toggleAtivo = useMutation({
    mutationFn: ({ id, ativo }: { id: string; ativo: boolean }) =>
      fetch(`/api/tenants/${tenantId}/servicos/prestadores/${id}`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ ativo }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_PRESTADOR });
    setDialogOpen(true);
  }
  function openEdit(p: any) {
    setEditing(p);
    setForm({
      nome: p.nome ?? "", email: p.email ?? "", telefone: p.telefone ?? "",
      especialidade: p.especialidade ?? "geral",
      raioAtendimentoKm: p.raioAtendimentoKm ?? 15,
      comissaoBase: p.comissaoBase != null ? String(p.comissaoBase) : "60",
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
    save.mutate({
      ...form,
      raioAtendimentoKm: Number(form.raioAtendimentoKm),
      comissaoBase: form.comissaoBase,
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Novo Prestador
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : prestadores.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">Nenhum prestador cadastrado ainda.</p>
          ) : (
            <div className="divide-y">
              {prestadores.map((p: any) => (
                <div key={p.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{p.nome}</span>
                      <Badge variant="outline" className={`text-xs ${ESP_COLORS[p.especialidade] ?? ""}`}>
                        {ESPECIALIDADES.find((e) => e.value === p.especialidade)?.label ?? p.especialidade}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {p.telefone || "sem telefone"} · raio {p.raioAtendimentoKm}km · comissão {p.comissaoBase}%
                    </p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <Switch checked={p.ativo !== false} onCheckedChange={(v) => toggleAtivo.mutate({ id: p.id, ativo: v })} />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}>
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
            <DialogTitle>{editing ? "Editar Prestador" : "Novo Prestador"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Nome <span className="text-destructive">*</span></Label>
              <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="ex: João Pedreiro" />
            </div>
            <div className="space-y-1.5">
              <Label>Especialidade</Label>
              <Select value={form.especialidade} onValueChange={(v) => setForm((f) => ({ ...f, especialidade: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESPECIALIDADES.map((e) => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Telefone</Label>
                <Input value={form.telefone} onChange={(e) => setForm((f) => ({ ...f, telefone: e.target.value }))} placeholder="(00) 00000-0000" />
              </div>
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Raio de atendimento (km)</Label>
                <Input type="number" min={1} value={form.raioAtendimentoKm} onChange={(e) => setForm((f) => ({ ...f, raioAtendimentoKm: Number(e.target.value) }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Comissão (%)</Label>
                <Input type="number" min={0} max={100} step={0.1} value={form.comissaoBase} onChange={(e) => setForm((f) => ({ ...f, comissaoBase: e.target.value }))} />
              </div>
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
                {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Tipos de Serviço ─────────────────────────────────────────────────────────

const EMPTY_TIPO = {
  nome: "", descricao: "", categoria: "Casa e construção", especialidade: "geral" as string,
  precoBase: "", requerVisitaTecnica: true, ativo: true, vendeNoPracaAi: false,
};

function TiposTab({ tenantId }: { tenantId: string }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_TIPO });

  const QK = ["servicos-tipos", tenantId];

  const { data: tipos = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/servicos/tipos`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: (payload: any) => {
      const url = editing
        ? `/api/tenants/${tenantId}/servicos/tipos/${editing.id}`
        : `/api/tenants/${tenantId}/servicos/tipos`;
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
      toast({ title: editing ? "Tipo atualizado!" : "Tipo criado!" });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const importarCatalogo = useMutation({
    mutationFn: () => fetch(`/api/tenants/${tenantId}/servicos/importar-catalogo`, { method: "POST", headers: authHeaders() }).then(async (r) => {
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro ao importar catálogo");
      return r.json();
    }),
    onSuccess: (result: any) => {
      qc.invalidateQueries({ queryKey: QK });
      toast({ title: "Catálogo de serviços atualizado", description: `${result.adicionados} serviço(s) adicionado(s). Revise preços e publique no Praça.ai quando estiver pronto.` });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_TIPO });
    setDialogOpen(true);
  }
  function openEdit(t: any) {
    setEditing(t);
    setForm({
      nome: t.nome ?? "", descricao: t.descricao ?? "", categoria: t.categoria ?? "Outros", especialidade: t.especialidade ?? "geral",
      precoBase: t.precoBase != null ? String(t.precoBase) : "",
      requerVisitaTecnica: t.requerVisitaTecnica !== false, ativo: t.ativo !== false, vendeNoPracaAi: !!t.vendeNoPracaAi,
    });
    setDialogOpen(true);
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.nome) {
      toast({ title: "Nome é obrigatório", variant: "destructive" });
      return;
    }
    save.mutate({ ...form, precoBase: form.precoBase !== "" ? form.precoBase : null });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2 flex-wrap">
        <Button variant="outline" onClick={() => importarCatalogo.mutate()} disabled={importarCatalogo.isPending}>
          {importarCatalogo.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <LibraryBig className="h-4 w-4 mr-2" />} Adicionar catálogo completo
        </Button>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Novo Tipo de Serviço
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : tipos.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">Nenhum tipo de serviço cadastrado.</p>
          ) : (
            <div className="divide-y">
              {tipos.map((t: any) => (
                <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{t.nome}</span>
                      <Badge variant="secondary" className="text-xs">{t.categoria ?? "Outros"}</Badge>
                      <Badge variant="outline" className={`text-xs ${ESP_COLORS[t.especialidade] ?? ""}`}>
                        {ESPECIALIDADES.find((e) => e.value === t.especialidade)?.label ?? t.especialidade}
                      </Badge>
                      {t.requerVisitaTecnica && (
                        <Badge variant="outline" className="text-xs bg-orange-50 text-orange-700 border-orange-200">
                          requer visita
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {t.precoBase != null ? fmt(t.precoBase) : "preço definido na visita"}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Tipo de Serviço" : "Novo Tipo de Serviço"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="space-y-1.5">
              <Label>Nome <span className="text-destructive">*</span></Label>
              <Input value={form.nome} onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))} placeholder="ex: Instalação de tomada" />
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} rows={2} />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={form.categoria} onValueChange={(v) => setForm((f) => ({ ...f, categoria: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIAS.map((categoria) => <SelectItem key={categoria} value={categoria}>{categoria}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Especialidade</Label>
              <Input value={form.especialidade} onChange={(e) => setForm((f) => ({ ...f, especialidade: e.target.value }))} placeholder="ex: eletricista residencial" />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.requerVisitaTecnica} onCheckedChange={(v) => setForm((f) => ({ ...f, requerVisitaTecnica: v }))} />
              <Label>Requer visita técnica pra orçar</Label>
            </div>
            {!form.requerVisitaTecnica && (
              <div className="space-y-1.5">
                <Label>Preço fixo (R$)</Label>
                <Input type="number" min={0} step={0.01} value={form.precoBase} onChange={(e) => setForm((f) => ({ ...f, precoBase: e.target.value }))} />
              </div>
            )}
            <div className="flex items-center gap-2 rounded-lg border p-3">
              <Switch checked={form.vendeNoPracaAi} onCheckedChange={(v) => setForm((f) => ({ ...f, vendeNoPracaAi: v }))} />
              <div><Label>Publicar no Praça.ai</Label><p className="text-xs text-muted-foreground">O serviço ficará disponível para busca e solicitação pelos clientes.</p></div>
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

// ── Página ─────────────────────────────────────────────────────────────────

export default function ServicosCadastros() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <HardHat className="h-5 w-5" /> Cadastros — Serviços
        </h1>
        <p className="text-sm text-muted-foreground mt-1">Prestadores e tipos de serviço oferecidos</p>
      </div>

      <Tabs defaultValue="prestadores">
        <TabsList>
          <TabsTrigger value="prestadores">Prestadores</TabsTrigger>
          <TabsTrigger value="tipos">Tipos de Serviço</TabsTrigger>
        </TabsList>
        <TabsContent value="prestadores" className="mt-4">
          <PrestadoresTab tenantId={tenantId} />
        </TabsContent>
        <TabsContent value="tipos" className="mt-4">
          <TiposTab tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
