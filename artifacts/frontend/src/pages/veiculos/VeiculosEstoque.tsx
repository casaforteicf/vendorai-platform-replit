import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, Car, Loader2, ShieldCheck, ShieldAlert, Gauge } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const COMBUSTIVEIS = [
  { value: "flex", label: "Flex" }, { value: "gasolina", label: "Gasolina" },
  { value: "diesel", label: "Diesel" }, { value: "eletrico", label: "Elétrico" },
  { value: "hibrido", label: "Híbrido" }, { value: "gnv", label: "GNV" },
] as const;
const CAMBIOS = [
  { value: "manual", label: "Manual" }, { value: "automatico", label: "Automático" }, { value: "cvt", label: "CVT" },
] as const;

const STATUS_LABELS: Record<string, string> = {
  disponivel: "Disponível", reservado: "Reservado", vendido: "Vendido", inativo: "Inativo",
};
const STATUS_COLORS: Record<string, string> = {
  disponivel: "bg-emerald-50 text-emerald-700 border-emerald-200",
  reservado: "bg-amber-50 text-amber-700 border-amber-200",
  vendido: "bg-blue-50 text-blue-700 border-blue-200",
  inativo: "bg-slate-50 text-slate-500 border-slate-200",
};

function fmt(v: number | string | null) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const EMPTY_FORM = {
  marca: "", modelo: "", anoFabricacao: "", anoModelo: "", cor: "", km: "",
  combustivel: "flex" as string, cambio: "manual" as string, valor: "", valorPromocional: "", descricao: "",
};

function VistoriaDialog({ tenantId, veiculo, open, onOpenChange }: { tenantId: string; veiculo: any; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [laudoUrl, setLaudoUrl] = useState("");

  const confirmar = useMutation({
    mutationFn: () =>
      fetch(`/api/tenants/${tenantId}/veiculos/estoque/${veiculo.id}/vistoria`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ vistoriaLaudoUrl: laudoUrl }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["veiculos-estoque", tenantId] });
      toast({ title: "Vistoria confirmada! O anúncio já pode ficar disponível." });
      onOpenChange(false);
      setLaudoUrl("");
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Confirmar Vistoria</DialogTitle></DialogHeader>
        <div className="space-y-4 mt-2">
          <p className="text-sm text-muted-foreground">
            Mitigação de risco de procedência: o anúncio só fica disponível depois da vistoria confirmada, com laudo anexado.
          </p>
          <div className="space-y-1.5">
            <Label>Link do laudo de vistoria <span className="text-destructive">*</span></Label>
            <Input value={laudoUrl} onChange={(e) => setLaudoUrl(e.target.value)} placeholder="URL do laudo/foto" />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={() => laudoUrl && confirmar.mutate()} disabled={!laudoUrl || confirmar.isPending}>
              {confirmar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Confirmar vistoria
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function VeiculosEstoque() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();

  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [vistoriaTarget, setVistoriaTarget] = useState<any>(null);

  const QK = ["veiculos-estoque", tenantId, statusFilter];

  const { data: veiculos = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/veiculos/estoque?status=${statusFilter === "all" ? "" : statusFilter}`, { headers: authHeaders() })
        .then((r) => r.json()),
    enabled: !!tenantId,
  });

  const save = useMutation({
    mutationFn: (payload: any) => {
      const url = editing
        ? `/api/tenants/${tenantId}/veiculos/estoque/${editing.id}`
        : `/api/tenants/${tenantId}/veiculos/estoque`;
      return fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["veiculos-estoque", tenantId] });
      toast({ title: editing ? "Veículo atualizado!" : "Veículo cadastrado! Confirme a vistoria pra deixar disponível." });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const publicar = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/tenants/${tenantId}/veiculos/estoque/${id}`, {
        method: "PUT", headers: authHeaders(), body: JSON.stringify({ status: "disponivel" }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["veiculos-estoque", tenantId] }),
    onError: (e: any) => toast({ title: "Não foi possível publicar", description: e.message, variant: "destructive" }),
  });

  function openCreate() { setEditing(null); setForm({ ...EMPTY_FORM }); setDialogOpen(true); }
  function openEdit(v: any) {
    setEditing(v);
    setForm({
      marca: v.marca ?? "", modelo: v.modelo ?? "",
      anoFabricacao: v.anoFabricacao != null ? String(v.anoFabricacao) : "",
      anoModelo: v.anoModelo != null ? String(v.anoModelo) : "",
      cor: v.cor ?? "", km: v.km != null ? String(v.km) : "",
      combustivel: v.combustivel ?? "flex", cambio: v.cambio ?? "manual",
      valor: v.valor != null ? String(v.valor) : "", valorPromocional: v.valorPromocional != null ? String(v.valorPromocional) : "",
      descricao: v.descricao ?? "",
    });
    setDialogOpen(true);
  }
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.marca || !form.modelo || !form.valor) {
      toast({ title: "Marca, modelo e valor são obrigatórios", variant: "destructive" });
      return;
    }
    save.mutate({
      ...form,
      anoFabricacao: form.anoFabricacao ? Number(form.anoFabricacao) : undefined,
      anoModelo: form.anoModelo ? Number(form.anoModelo) : undefined,
      km: form.km ? Number(form.km) : undefined,
      valorPromocional: form.valorPromocional || undefined,
    });
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Car className="h-5 w-5" /> Estoque
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{Array.isArray(veiculos) ? veiculos.length : 0} veículo(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Novo Veículo
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-44 w-full" />)}
        </div>
      ) : veiculos.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nenhum veículo cadastrado ainda.</CardContent></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {veiculos.map((v: any) => (
            <Card key={v.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium text-sm leading-tight">{v.marca} {v.modelo}</h3>
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => openEdit(v)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline" className={`text-xs ${STATUS_COLORS[v.status] ?? ""}`}>
                    {STATUS_LABELS[v.status] ?? v.status}
                  </Badge>
                  {v.vistoriaRealizada ? (
                    <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700 border-emerald-200">
                      <ShieldCheck className="h-3 w-3 mr-1" /> vistoriado
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-xs bg-red-50 text-red-700 border-red-200">
                      <ShieldAlert className="h-3 w-3 mr-1" /> sem vistoria
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {v.anoFabricacao ?? "?"}/{v.anoModelo ?? "?"} · {v.cor ?? "—"} ·{" "}
                  {COMBUSTIVEIS.find((c) => c.value === v.combustivel)?.label ?? v.combustivel ?? "—"}
                </p>
                {v.km != null && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Gauge className="h-3 w-3" /> {v.km.toLocaleString("pt-BR")} km
                  </p>
                )}
                <p className="font-semibold text-sm">
                  {v.valorPromocional ? (
                    <>
                      <span className="line-through text-muted-foreground mr-1 font-normal">{fmt(v.valor)}</span>
                      <span className="text-emerald-700">{fmt(v.valorPromocional)}</span>
                    </>
                  ) : fmt(v.valor)}
                </p>
                {!v.vistoriaRealizada && v.status !== "vendido" && (
                  <Button size="sm" variant="outline" className="w-full text-xs h-7 mt-1" onClick={() => setVistoriaTarget(v)}>
                    Confirmar vistoria
                  </Button>
                )}
                {v.vistoriaRealizada && v.status === "inativo" && (
                  <Button size="sm" className="w-full text-xs h-7 mt-1" onClick={() => publicar.mutate(v.id)} disabled={publicar.isPending}>
                    Publicar anúncio
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Veículo" : "Novo Veículo"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Marca <span className="text-destructive">*</span></Label>
                <Input value={form.marca} onChange={(e) => setForm((f) => ({ ...f, marca: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Modelo <span className="text-destructive">*</span></Label>
                <Input value={form.modelo} onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ano fabricação</Label>
                <Input type="number" value={form.anoFabricacao} onChange={(e) => setForm((f) => ({ ...f, anoFabricacao: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Ano modelo</Label>
                <Input type="number" value={form.anoModelo} onChange={(e) => setForm((f) => ({ ...f, anoModelo: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cor</Label>
                <Input value={form.cor} onChange={(e) => setForm((f) => ({ ...f, cor: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>KM</Label>
                <Input type="number" min={0} value={form.km} onChange={(e) => setForm((f) => ({ ...f, km: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Combustível</Label>
                <Select value={form.combustivel} onValueChange={(v) => setForm((f) => ({ ...f, combustivel: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{COMBUSTIVEIS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Câmbio</Label>
                <Select value={form.cambio} onValueChange={(v) => setForm((f) => ({ ...f, cambio: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CAMBIOS.map((c) => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor (R$) <span className="text-destructive">*</span></Label>
                <Input type="number" min={0} step={0.01} value={form.valor} onChange={(e) => setForm((f) => ({ ...f, valor: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Valor promocional</Label>
                <Input type="number" min={0} step={0.01} value={form.valorPromocional} onChange={(e) => setForm((f) => ({ ...f, valorPromocional: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Descrição</Label>
              <Textarea value={form.descricao} onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))} rows={2} />
            </div>
            {!editing && (
              <p className="text-xs text-muted-foreground">
                O anúncio nasce inativo — confirme a vistoria depois de cadastrar pra poder publicar.
              </p>
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

      {vistoriaTarget && (
        <VistoriaDialog
          tenantId={tenantId}
          veiculo={vistoriaTarget}
          open={!!vistoriaTarget}
          onOpenChange={(v) => !v && setVistoriaTarget(null)}
        />
      )}
    </div>
  );
}
