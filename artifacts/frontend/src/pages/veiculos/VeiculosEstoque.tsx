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
import { Plus, Pencil, Car, Loader2, ShieldCheck, ShieldAlert, Gauge, ImagePlus, Film, Search, CheckCircle2, AlertTriangle } from "lucide-react";

function resolveMediaUrl(url: string) {
  return url.startsWith("/objects/") ? `/api/storage${url}` : url;
}

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

interface FotoDetalhe { url: string; legenda: string }
const EMPTY_FORM = {
  placa: "", chassi: "", renavam: "", marca: "", modelo: "", versao: "", anoFabricacao: "", anoModelo: "", cor: "", km: "",
  combustivel: "flex" as string, cambio: "manual" as string, valor: "", valorPromocional: "", descricao: "",
  motor: "", potenciaHp: "", codigoFipe: "", vendeNoPracaAi: false,
  fotos: [] as string[],
  fotosDetalhes: [] as FotoDetalhe[],
  videos: [] as string[],
};

async function uploadFile(file: File): Promise<string> {
  const token = localStorage.getItem("vendorai_token");
  const requestRes = await fetch("/api/storage/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  const payload = await requestRes.json().catch(() => ({})) as { uploadURL?: string; objectPath?: string; error?: string };
  if (!requestRes.ok || !payload.uploadURL || !payload.objectPath) {
    throw new Error(payload.error || `Falha ao preparar upload (HTTP ${requestRes.status})`);
  }
  const uploadRes = await fetch(payload.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
  if (!uploadRes.ok) throw new Error(`Falha ao enviar arquivo (HTTP ${uploadRes.status})`);
  return payload.objectPath;
}

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
  const [uploadingFotos, setUploadingFotos] = useState(false);
  const [uploadingDetalhe, setUploadingDetalhe] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResult, setLookupResult] = useState<any>(null);

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

  const lookup = useMutation({
    mutationFn: () => fetch("/api/vehicles/lookup", {
      method: "POST", headers: authHeaders(), body: JSON.stringify({ query: lookupQuery }),
    }).then(async (r) => {
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error ?? "Erro ao buscar veículo");
      return body;
    }),
    onSuccess: (result) => setLookupResult(result),
    onError: (error: Error) => { setLookupResult(null); toast({ title: "Busca não concluída", description: error.message, variant: "destructive" }); },
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
      placa: v.placa ?? "", chassi: v.chassi ?? "", renavam: v.renavam ?? "",
      marca: v.marca ?? "", modelo: v.modelo ?? "",
      versao: v.versao ?? "",
      anoFabricacao: v.anoFabricacao != null ? String(v.anoFabricacao) : "",
      anoModelo: v.anoModelo != null ? String(v.anoModelo) : "",
      cor: v.cor ?? "", km: v.km != null ? String(v.km) : "",
      combustivel: v.combustivel ?? "flex", cambio: v.cambio ?? "manual",
      valor: v.valor != null ? String(v.valor) : "", valorPromocional: v.valorPromocional != null ? String(v.valorPromocional) : "",
      descricao: v.descricao ?? "",
      motor: v.motor ?? "", potenciaHp: v.potenciaHp != null ? String(v.potenciaHp) : "", codigoFipe: v.codigoFipe ?? "",
      vendeNoPracaAi: !!v.vendeNoPracaAi,
      fotos: v.fotos ?? [],
      fotosDetalhes: v.fotosDetalhes ?? [],
      videos: v.videos ?? [],
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
      potenciaHp: form.potenciaHp ? Number(form.potenciaHp) : undefined,
      valorPromocional: form.valorPromocional || undefined,
      fotos: form.fotos,
      fotosDetalhes: form.fotosDetalhes,
      videos: form.videos,
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

      <Card className="border-primary/20">
        <CardContent className="p-5 space-y-4">
          <div>
            <h2 className="font-semibold flex items-center gap-2"><Search className="h-4 w-4 text-primary" /> Buscar veículo</h2>
            <p className="text-sm text-muted-foreground">Informe uma placa ou chassi. O tipo é identificado automaticamente.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input value={lookupQuery} onChange={(e) => setLookupQuery(e.target.value.toUpperCase())} onKeyDown={(e) => e.key === "Enter" && lookupQuery && lookup.mutate()} placeholder="Placa ou chassi" className="font-mono" />
            <Button onClick={() => lookup.mutate()} disabled={!lookupQuery.trim() || lookup.isPending}>
              {lookup.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />} Buscar veículo
            </Button>
          </div>
          {lookupResult?.success === false && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Veículo não encontrado.</div>
          )}
          {lookupResult?.vehicle && (() => {
            const v = lookupResult.vehicle;
            return <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div><p className="font-bold text-lg">{v.fullName ?? [v.brand, v.model].filter(Boolean).join(" ")}</p><p className="text-sm text-muted-foreground">{v.manufactureYear ?? "—"}/{v.modelYear ?? "—"} · Fonte: {v.source}</p></div>
                <Badge variant="outline">Confiança {Math.round(v.confidence * 100)}%</Badge>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                {[['Marca', v.brand], ['Modelo', v.model], ['Versão', v.version], ['Motor', v.engine], ['Câmbio', v.transmission], ['Combustível', v.fuel], ['Cor', v.color], ['FIPE', v.fipeCode]].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="font-medium">{value ?? "Não informado"}</p></div>)}
              </div>
              {v.possibleVersions?.length > 1 && <div className="rounded-lg bg-amber-50 border border-amber-200 p-3"><p className="text-sm flex gap-2"><AlertTriangle className="h-4 w-4" /> Existem várias versões possíveis. Selecione uma:</p><div className="flex flex-wrap gap-2 mt-2">{v.possibleVersions.map((version: string) => <Button key={version} size="sm" variant={v.version === version ? "default" : "outline"} onClick={() => setLookupResult((r: any) => ({ ...r, vehicle: { ...r.vehicle, version, fullName: [r.vehicle.brand, r.vehicle.model, version].filter(Boolean).join(' ') } }))}>{version}</Button>)}</div></div>}
              <div className="flex flex-wrap gap-2">{v.confidenceReasons?.map((reason: string) => <span key={reason} className="inline-flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3 w-3" /> {reason.replaceAll('_', ' ')}</span>)}</div>
              <Button onClick={() => {
                setEditing(null);
                setForm({ ...EMPTY_FORM, placa: v.plate ?? "", chassi: v.chassis ?? "", renavam: v.renavam ?? "", marca: v.brand ?? "", modelo: v.model ?? "", versao: v.version ?? "", anoFabricacao: v.manufactureYear ? String(v.manufactureYear) : "", anoModelo: v.modelYear ? String(v.modelYear) : "", cor: v.color ?? "", combustivel: String(v.fuel ?? "flex").toLowerCase(), cambio: String(v.transmission ?? "manual").toLowerCase().startsWith('auto') ? 'automatico' : String(v.transmission ?? "manual").toLowerCase(), motor: v.engine ?? "", potenciaHp: v.powerHp ? String(v.powerHp) : "", codigoFipe: v.fipeCode ?? "" });
                setDialogOpen(true);
              }}>Usar este veículo</Button>
            </div>;
          })()}
        </CardContent>
      </Card>

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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Placa</Label><Input value={form.placa} onChange={(e) => setForm((f) => ({ ...f, placa: e.target.value.toUpperCase() }))} /></div>
              <div className="space-y-1.5"><Label>Chassi</Label><Input value={form.chassi} onChange={(e) => setForm((f) => ({ ...f, chassi: e.target.value.toUpperCase() }))} /></div>
              <div className="space-y-1.5"><Label>RENAVAM</Label><Input value={form.renavam} onChange={(e) => setForm((f) => ({ ...f, renavam: e.target.value }))} /></div>
            </div>
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
            <div className="space-y-1.5"><Label>Versão</Label><Input value={form.versao} onChange={(e) => setForm((f) => ({ ...f, versao: e.target.value }))} /></div>
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
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Motor</Label><Input value={form.motor} onChange={(e) => setForm((f) => ({ ...f, motor: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Potência (cv)</Label><Input type="number" value={form.potenciaHp} onChange={(e) => setForm((f) => ({ ...f, potenciaHp: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>Código FIPE</Label><Input value={form.codigoFipe} onChange={(e) => setForm((f) => ({ ...f, codigoFipe: e.target.value }))} /></div>
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

            <div className="flex items-center gap-2 rounded-lg border p-3">
              <Switch checked={form.vendeNoPracaAi} onCheckedChange={(v) => setForm((f) => ({ ...f, vendeNoPracaAi: v }))} />
              <div>
                <Label>Publicar no Praça.ai</Label>
                <p className="text-xs text-muted-foreground">O veículo só aparece após a vistoria e quando estiver disponível.</p>
              </div>
            </div>

            {/* Fotos gerais */}
            <div className="space-y-2">
              <Label>Fotos</Label>
              {form.fotos.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {form.fotos.map((url, i) => (
                    <div key={i} className="relative aspect-square rounded-md overflow-hidden border">
                      <img src={resolveMediaUrl(url)} className="w-full h-full object-cover" />
                      <button type="button" onClick={() => setForm((f) => ({ ...f, fotos: f.fotos.filter((_, idx) => idx !== i) }))}
                        className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full h-5 w-5 text-xs leading-none">×</button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center justify-center gap-2 border border-dashed rounded-md py-2.5 text-sm text-muted-foreground cursor-pointer hover:bg-muted/40">
                {uploadingFotos ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                Adicionar foto
                <input type="file" accept="image/*" multiple hidden disabled={uploadingFotos} onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (!files.length) return;
                  setUploadingFotos(true);
                  try {
                    const urls = await Promise.all(files.map(uploadFile));
                    setForm((f) => ({ ...f, fotos: [...f.fotos, ...urls] }));
                  } catch (err: any) {
                    toast({ title: "Erro ao enviar foto", description: err.message, variant: "destructive" });
                  } finally {
                    setUploadingFotos(false);
                    e.target.value = "";
                  }
                }} />
              </label>
            </div>

            {/* Fotos de detalhe — com legenda (motor, interior, painel etc) */}
            <div className="space-y-2">
              <Label>Fotos de detalhe</Label>
              <p className="text-xs text-muted-foreground">Motor, interior, painel, avarias — o que ajuda o cliente a confiar no anúncio.</p>
              {form.fotosDetalhes.length > 0 && (
                <div className="space-y-2">
                  {form.fotosDetalhes.map((fd, i) => (
                    <div key={i} className="flex items-center gap-2 border rounded-md p-1.5">
                      <img src={resolveMediaUrl(fd.url)} className="h-12 w-12 object-cover rounded shrink-0" />
                      <Input placeholder="Legenda (ex: Motor)" value={fd.legenda}
                        onChange={(e) => setForm((f) => ({ ...f, fotosDetalhes: f.fotosDetalhes.map((x, idx) => idx === i ? { ...x, legenda: e.target.value } : x) }))}
                        className="h-8 text-xs" />
                      <button type="button" onClick={() => setForm((f) => ({ ...f, fotosDetalhes: f.fotosDetalhes.filter((_, idx) => idx !== i) }))}
                        className="shrink-0 text-destructive text-xs px-1.5">Remover</button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center justify-center gap-2 border border-dashed rounded-md py-2.5 text-sm text-muted-foreground cursor-pointer hover:bg-muted/40">
                {uploadingDetalhe ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                Adicionar foto de detalhe
                <input type="file" accept="image/*" multiple hidden disabled={uploadingDetalhe} onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (!files.length) return;
                  setUploadingDetalhe(true);
                  try {
                    const urls = await Promise.all(files.map(uploadFile));
                    setForm((f) => ({ ...f, fotosDetalhes: [...f.fotosDetalhes, ...urls.map((url) => ({ url, legenda: "" }))] }));
                  } catch (err: any) {
                    toast({ title: "Erro ao enviar foto", description: err.message, variant: "destructive" });
                  } finally {
                    setUploadingDetalhe(false);
                    e.target.value = "";
                  }
                }} />
              </label>
            </div>

            {/* Vídeos */}
            <div className="space-y-2">
              <Label>Vídeos</Label>
              {form.videos.length > 0 && (
                <div className="space-y-1.5">
                  {form.videos.map((url, i) => (
                    <div key={i} className="flex items-center gap-2 border rounded-md p-2 text-xs">
                      <Film className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate flex-1">{url.split("/").pop()}</span>
                      <button type="button" onClick={() => setForm((f) => ({ ...f, videos: f.videos.filter((_, idx) => idx !== i) }))}
                        className="shrink-0 text-destructive px-1.5">Remover</button>
                    </div>
                  ))}
                </div>
              )}
              <label className="flex items-center justify-center gap-2 border border-dashed rounded-md py-2.5 text-sm text-muted-foreground cursor-pointer hover:bg-muted/40">
                {uploadingVideo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                Adicionar vídeo
                <input type="file" accept="video/*" multiple hidden disabled={uploadingVideo} onChange={async (e) => {
                  const files = Array.from(e.target.files ?? []);
                  if (!files.length) return;
                  setUploadingVideo(true);
                  try {
                    const urls = await Promise.all(files.map(uploadFile));
                    setForm((f) => ({ ...f, videos: [...f.videos, ...urls] }));
                  } catch (err: any) {
                    toast({ title: "Erro ao enviar vídeo", description: err.message, variant: "destructive" });
                  } finally {
                    setUploadingVideo(false);
                    e.target.value = "";
                  }
                }} />
              </label>
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
