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
import { Plus, Package, Loader2, ArrowRight } from "lucide-react";

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

function fmt(v: number | string | null) {
  if (v == null) return "—";
  return Number(v).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
function nextStatus(atual: string): string | null {
  const idx = STATUS_FLOW.indexOf(atual as any);
  if (idx === -1 || idx === STATUS_FLOW.length - 1) return null;
  return STATUS_FLOW[idx + 1];
}

function NovaCargaDialog({ tenantId, open, onOpenChange }: { tenantId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [clienteSearch, setClienteSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [enderecoColeta, setEnderecoColeta] = useState("");
  const [enderecoEntrega, setEnderecoEntrega] = useState("");
  const [tipoCarga, setTipoCarga] = useState("");
  const [pesoKg, setPesoKg] = useState("");
  const [valorCotado, setValorCotado] = useState("");

  const { data: leads = [] } = useQuery<any[]>({
    queryKey: ["leads-search", tenantId, clienteSearch],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/leads?limit=10&search=${encodeURIComponent(clienteSearch)}`, { headers: authHeaders() })
        .then((r) => r.json()).then((d) => Array.isArray(d) ? d : d.leads ?? []),
    enabled: !!tenantId && clienteSearch.length >= 2,
  });

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
      setClienteSearch(""); setSelectedLead(null); setEnderecoColeta(""); setEnderecoEntrega("");
      setTipoCarga(""); setPesoKg(""); setValorCotado("");
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
      tipoCarga: tipoCarga || undefined, pesoKg: pesoKg || undefined, valorCotado: valorCotado || undefined,
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
            <Label>Endereço de coleta <span className="text-destructive">*</span></Label>
            <Textarea value={enderecoColeta} onChange={(e) => setEnderecoColeta(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label>Endereço de entrega <span className="text-destructive">*</span></Label>
            <Textarea value={enderecoEntrega} onChange={(e) => setEnderecoEntrega(e.target.value)} rows={2} />
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
              <Label>Valor cotado (R$)</Label>
              <Input type="number" min={0} step={0.01} value={valorCotado} onChange={(e) => setValorCotado(e.target.value)} placeholder="deixe vazio se ainda não cotou" />
            </div>
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

export default function FretesCargas() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

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
                return (
                  <div key={c.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{c.cliente?.nome ?? "Cliente"}</span>
                          <Badge variant="outline" className={`text-xs ${STATUS_COLORS[c.status] ?? ""}`}>
                            {STATUS_LABELS[c.status] ?? c.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          {c.enderecoColeta} <ArrowRight className="h-3 w-3 shrink-0" /> {c.enderecoEntrega}
                        </p>
                        {c.veiculo && <p className="text-xs text-muted-foreground mt-0.5">Veículo: {c.veiculo.placa}</p>}
                        <p className="text-xs mt-1">{c.valorCotado != null ? fmt(c.valorCotado) : "Sem cotação ainda"}</p>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {next && c.status !== "cancelado" && (
                          <Button size="sm" variant="outline" onClick={() => advanceStatus.mutate({ id: c.id, status: next })} disabled={advanceStatus.isPending}>
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
    </div>
  );
}
