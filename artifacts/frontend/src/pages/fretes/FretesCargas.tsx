import { useState, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRequestUploadUrl } from "@workspace/api-client-react";
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
import { Plus, Package, Loader2, ArrowRight, Camera, Phone, X } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const STATUS_FLOW = ["cotacao_pendente", "cotado", "aprovado", "coletado", "em_transito", "entregue"] as const;

const STATUS_LABELS: Record<string, string> = {
  cotacao_pendente: "Cotação pendente", cotado: "Cotado", aprovado: "Aprovado",
  coletado: "Coletado", em_transito: "Em trânsito", entregue: "Entregue", cancelado: "Cancelado",
};
const STATUS_COLORS: Record<string, string> = {
  cotacao_pendente: "bg-slate-50 text-slate-600 border-slate-200",
  cotado: "bg-blue-50 text-blue-700 border-blue-200",
  aprovado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  coletado: "bg-violet-50 text-violet-700 border-violet-200",
  em_transito: "bg-amber-50 text-amber-700 border-amber-200",
  entregue: "bg-green-50 text-green-700 border-green-200",
  cancelado: "bg-red-50 text-red-700 border-red-200",
};
const TIPO_VEICULO_LABELS: Record<string, string> = {
  utilitario: "Utilitário", van: "Van", caminhao_toco: "Caminhão toco",
  caminhao_truck: "Caminhão truck", carreta: "Carreta",
};
const ORIGEM_LABELS: Record<string, string> = {
  direto: "Direto", lojista: "Lojista", cliente_final: "Cliente (Praça.ai)",
};

function fmt(v: number | string | null) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function nextStatus(atual: string): string | null {
  const idx = STATUS_FLOW.indexOf(atual as any);
  if (idx === -1 || idx === STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[idx + 1];
}
// Fotos de prova só fazem sentido nesses dois momentos da jornada.
function photoStepFor(status: string): "fotosColetaUrls" | "fotosEntregaUrls" | null {
  if (status === "coletado") return "fotosColetaUrls";
  if (status === "entregue") return "fotosEntregaUrls";
  return null;
}

function NovaCargaDialog({ tenantId, open, onOpenChange }: { tenantId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [clienteSearch, setClienteSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [enderecoColeta, setEnderecoColeta] = useState("");
  const [enderecoEntrega, setEnderecoEntrega] = useState("");
  const [contatoColetaNome, setContatoColetaNome] = useState("");
  const [contatoColetaTelefone, setContatoColetaTelefone] = useState("");
  const [contatoEntregaNome, setContatoEntregaNome] = useState("");
  const [contatoEntregaTelefone, setContatoEntregaTelefone] = useState("");
  const [tipoVeiculoDesejado, setTipoVeiculoDesejado] = useState("");
  const [tipoCarga, setTipoCarga] = useState("");
  const [pesoKg, setPesoKg] = useState("");
  const [valorDeclarado, setValorDeclarado] = useState("");
  const [valorCotado, setValorCotado] = useState("");
  const [instrucoesEspeciais, setInstrucoesEspeciais] = useState("");

  const { data: leads = [] } = useQuery<any[]>({
    queryKey: ["leads-search", tenantId, clienteSearch],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/leads?limit=10&search=${encodeURIComponent(clienteSearch)}`, { headers: authHeaders() })
        .then((r) => r.json()).then((d) => Array.isArray(d) ? d : d.leads ?? []),
    enabled: !!tenantId && clienteSearch.length >= 2,
  });

  function resetForm() {
    setClienteSearch(""); setSelectedLead(null); setEnderecoColeta(""); setEnderecoEntrega("");
    setContatoColetaNome(""); setContatoColetaTelefone(""); setContatoEntregaNome(""); setContatoEntregaTelefone("");
    setTipoVeiculoDesejado(""); setTipoCarga(""); setPesoKg(""); setValorDeclarado(""); setValorCotado(""); setInstrucoesEspeciais("");
  }

  const create = useMutation({
    mutationFn: (payload: any) =>
      fetch(`/api/tenants/${tenantId}/fretes/cargas`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(payload),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fretes-cargas", tenantId] });
      toast({ title: "Carga registrada!" });
      onOpenChange(false);
      resetForm();
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLead || !enderecoColeta || !enderecoEntrega) {
      toast({ title: "Cliente, coleta e entrega são obrigatórios", variant: "destructive" });
      return;
    }
    create.mutate({
      clienteId: selectedLead.id, enderecoColeta, enderecoEntrega,
      contatoColetaNome: contatoColetaNome || undefined,
      contatoColetaTelefone: contatoColetaTelefone || undefined,
      contatoEntregaNome: contatoEntregaNome || undefined,
      contatoEntregaTelefone: contatoEntregaTelefone || undefined,
      tipoVeiculoDesejado: tipoVeiculoDesejado || undefined,
      tipoCarga: tipoCarga || undefined, pesoKg: pesoKg || undefined,
      valorDeclarado: valorDeclarado || undefined, valorCotado: valorCotado || undefined,
      instrucoesEspeciais: instrucoesEspeciais || undefined,
      status: valorCotado ? "cotado" : "cotacao_pendente",
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nova Carga</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5 relative">
            <Label>Cliente <span className="text-destructive">*</span></Label>
            <Input
              value={selectedLead ? selectedLead.nome : clienteSearch}
              onChange={(e) => { setSelectedLead(null); setClienteSearch(e.target.value); }}
              placeholder="Buscar por nome ou telefone..."
            />
            {!selectedLead && clienteSearch.length >= 2 && leads.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 bg-popover border rounded-md shadow-md mt-1 max-h-40 overflow-y-auto">
                {leads.map((l: any) => (
                  <button key={l.id} type="button" className="w-full text-left px-3 py-2 text-sm hover:bg-muted" onClick={() => { setSelectedLead(l); setClienteSearch(""); }}>
                    {l.nome} {l.telefone ? `· ${l.telefone}` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de veículo desejado</Label>
            <Select value={tipoVeiculoDesejado} onValueChange={setTipoVeiculoDesejado}>
              <SelectTrigger><SelectValue placeholder="O freteiro atribui o veículo depois" /></SelectTrigger>
              <SelectContent>
                {Object.entries(TIPO_VEICULO_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Endereço de coleta <span className="text-destructive">*</span></Label>
            <Textarea value={enderecoColeta} onChange={(e) => setEnderecoColeta(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Contato na coleta</Label>
              <Input value={contatoColetaNome} onChange={(e) => setContatoColetaNome(e.target.value)} placeholder="Nome" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">&nbsp;</Label>
              <Input value={contatoColetaTelefone} onChange={(e) => setContatoColetaTelefone(e.target.value)} placeholder="Telefone" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Endereço de entrega <span className="text-destructive">*</span></Label>
            <Textarea value={enderecoEntrega} onChange={(e) => setEnderecoEntrega(e.target.value)} rows={2} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Contato na entrega</Label>
              <Input value={contatoEntregaNome} onChange={(e) => setContatoEntregaNome(e.target.value)} placeholder="Nome" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">&nbsp;</Label>
              <Input value={contatoEntregaTelefone} onChange={(e) => setContatoEntregaTelefone(e.target.value)} placeholder="Telefone" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Tipo de carga</Label>
            <Input value={tipoCarga} onChange={(e) => setTipoCarga(e.target.value)} placeholder="ex: móveis, paletes, carga seca" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Peso (kg)</Label>
              <Input type="number" min={0} value={pesoKg} onChange={(e) => setPesoKg(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Valor declarado (R$)</Label>
              <Input type="number" min={0} step={0.01} value={valorDeclarado} onChange={(e) => setValorDeclarado(e.target.value)} placeholder="pra seguro/responsabilidade" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Valor cotado (R$)</Label>
            <Input type="number" min={0} step={0.01} value={valorCotado} onChange={(e) => setValorCotado(e.target.value)} placeholder="deixe vazio se ainda não cotou" />
          </div>
          <div className="space-y-1.5">
            <Label>Instruções especiais</Label>
            <Textarea value={instrucoesEspeciais} onChange={(e) => setInstrucoesEspeciais(e.target.value)} rows={2} placeholder="ex: carga frágil, precisa de ajudante, acesso restrito..." />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Registrar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Upload de foto de prova (coleta ou entrega) — abre junto com o avanço de
// status pros dois momentos em que isso importa de verdade.
function PhotoProofDialog({
  tenantId, cargaId, field, open, onOpenChange, onDone,
}: {
  tenantId: string; cargaId: string; field: "fotosColetaUrls" | "fotosEntregaUrls";
  open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void;
}) {
  const { toast } = useToast();
  const requestUploadUrl = useRequestUploadUrl();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urls, setUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      fetch(`/api/tenants/${tenantId}/fretes/cargas/${cargaId}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ [field]: urls }),
      }).then((r) => r.json()),
    onSuccess: () => { onDone(); onOpenChange(false); setUrls([]); },
  });

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const result = await new Promise<{ uploadURL: string; objectPath: string }>((resolve, reject) => {
          requestUploadUrl.mutate(
            { data: { name: file.name, size: file.size, contentType: file.type } },
            { onSuccess: resolve, onError: reject },
          );
        });
        const uploadRes = await fetch(result.uploadURL, { method: "PUT", body: file, headers: { "Content-Type": file.type } });
        if (!uploadRes.ok) throw new Error("Falha no upload");
        setUrls((prev) => [...prev, result.objectPath]);
      }
    } catch {
      toast({ title: "Erro no upload. Tente novamente.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }

  const label = field === "fotosColetaUrls" ? "coleta" : "entrega";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Foto de prova da {label}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">Registra o estado da carga na {label} — protege lojista e freteiro em caso de disputa.</p>
          <div className="flex flex-wrap gap-2">
            {urls.map((u, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border">
                <img src={`/api/storage/objects${u.replace("/objects", "")}`} className="w-full h-full object-cover" />
                <button type="button" onClick={() => setUrls((prev) => prev.filter((_, idx) => idx !== i))} className="absolute top-0 right-0 bg-black/60 text-white rounded-bl-md p-0.5">
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center text-muted-foreground hover:bg-muted/50"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => { onDone(); onOpenChange(false); }}>Pular</Button>
            <Button type="button" onClick={() => save.mutate()} disabled={save.isPending || uploading}>
              {save.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Salvar e avançar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function FretesCargas() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [photoDialog, setPhotoDialog] = useState<{ cargaId: string; field: "fotosColetaUrls" | "fotosEntregaUrls"; nextStatus: string } | null>(null);

  const QK = ["fretes-cargas", tenantId];

  const { data: cargas = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () => fetch(`/api/tenants/${tenantId}/fretes/cargas`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const advanceStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/tenants/${tenantId}/fretes/cargas/${id}/status`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/tenants/${tenantId}/fretes/cargas/${id}/status`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status: "cancelado" }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  function handleAdvance(cargaId: string, next: string) {
    const photoField = photoStepFor(next);
    if (photoField) {
      setPhotoDialog({ cargaId, field: photoField, nextStatus: next });
    } else {
      advanceStatus.mutate({ id: cargaId, status: next });
    }
  }

  const filtered = Array.isArray(cargas)
    ? statusFilter === "all" ? cargas : cargas.filter((c: any) => c.status === statusFilter)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Package className="h-5 w-5" /> Cargas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{Array.isArray(cargas) ? cargas.length : 0} carga(s)</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nova Carga
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">Nenhuma carga encontrada.</p>
          ) : (
            <div className="divide-y">
              {filtered.map((c: any) => {
                const next = nextStatus(c.status);
                const totalFotos = (c.fotosColetaUrls?.length ?? 0) + (c.fotosEntregaUrls?.length ?? 0);
                return (
                  <div key={c.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{c.cliente?.nome ?? "Cliente"}</span>
                          <Badge variant="outline" className={`text-xs ${STATUS_COLORS[c.status] ?? ""}`}>
                            {STATUS_LABELS[c.status] ?? c.status}
                          </Badge>
                          {c.origem && c.origem !== "direto" && (
                            <Badge variant="outline" className="text-xs bg-cyan-50 text-cyan-700 border-cyan-200">
                              {ORIGEM_LABELS[c.origem] ?? c.origem}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          {c.enderecoColeta} <ArrowRight className="h-3 w-3 shrink-0" /> {c.enderecoEntrega}
                        </p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {c.veiculo ? (
                            <p className="text-xs text-muted-foreground">Veículo: {c.veiculo.placa}</p>
                          ) : c.tipoVeiculoDesejado ? (
                            <p className="text-xs text-muted-foreground">Precisa: {TIPO_VEICULO_LABELS[c.tipoVeiculoDesejado] ?? c.tipoVeiculoDesejado}</p>
                          ) : null}
                          {totalFotos > 0 && (
                            <span className="text-xs text-muted-foreground flex items-center gap-1">
                              <Camera className="h-3 w-3" /> {totalFotos} foto(s)
                            </span>
                          )}
                        </div>
                        <p className="text-xs mt-1">{c.valorCotado != null ? fmt(c.valorCotado) : "Sem cotação ainda"}</p>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {c.cliente?.telefone && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={`tel:${c.cliente.telefone}`}><Phone className="h-3.5 w-3.5 mr-1.5" /> Ligar</a>
                          </Button>
                        )}
                        {next && c.status !== "cancelado" && (
                          <Button size="sm" variant="outline" onClick={() => handleAdvance(c.id, next)} disabled={advanceStatus.isPending}>
                            Avançar → {STATUS_LABELS[next]}
                          </Button>
                        )}
                        {c.status !== "entregue" && c.status !== "cancelado" && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancel.mutate(c.id)}>
                            Cancelar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <NovaCargaDialog tenantId={tenantId} open={dialogOpen} onOpenChange={setDialogOpen} />

      {photoDialog && (
        <PhotoProofDialog
          tenantId={tenantId}
          cargaId={photoDialog.cargaId}
          field={photoDialog.field}
          open={!!photoDialog}
          onOpenChange={(v) => { if (!v) setPhotoDialog(null); }}
          onDone={() => {
            advanceStatus.mutate({ id: photoDialog.cargaId, status: photoDialog.nextStatus });
            setPhotoDialog(null);
          }}
        />
      )}
    </div>
  );
}
