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
import { Plus, CalendarCheck, Loader2 } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const STATUS_LABELS: Record<string, string> = {
  agendada: "Agendada", confirmada: "Confirmada", realizada: "Realizada", cancelada: "Cancelada",
};
const STATUS_COLORS: Record<string, string> = {
  agendada: "bg-violet-50 text-violet-700 border-violet-200",
  confirmada: "bg-blue-50 text-blue-700 border-blue-200",
  realizada: "bg-emerald-50 text-emerald-700 border-emerald-200",
  cancelada: "bg-red-50 text-red-700 border-red-200",
};

function fmtDate(d: string) {
  return new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function NovaVisitaDialog({ tenantId, open, onOpenChange }: { tenantId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [propriedadeId, setPropriedadeId] = useState("");
  const [clienteSearch, setClienteSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [dataHora, setDataHora] = useState("");

  const { data: propriedades = [] } = useQuery<any[]>({
    queryKey: ["imoveis-propriedades-todas", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/imoveis/propriedades?status=disponivel`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId && open,
  });

  const { data: leads = [] } = useQuery<any[]>({
    queryKey: ["leads-search", tenantId, clienteSearch],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/leads?limit=10&search=${encodeURIComponent(clienteSearch)}`, { headers: authHeaders() })
        .then((r) => r.json()).then((d) => Array.isArray(d) ? d : d.leads ?? []),
    enabled: !!tenantId && clienteSearch.length >= 2,
  });

  const create = useMutation({
    mutationFn: (payload: any) =>
      fetch(`/api/tenants/${tenantId}/imoveis/visitas`, {
        method: "POST", headers: authHeaders(), body: JSON.stringify(payload),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["imoveis-visitas", tenantId] });
      toast({ title: "Visita agendada!" });
      onOpenChange(false);
      setPropriedadeId(""); setSelectedLead(null); setClienteSearch(""); setDataHora("");
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!propriedadeId || !selectedLead || !dataHora) {
      toast({ title: "Propriedade, cliente e data/hora são obrigatórios", variant: "destructive" });
      return;
    }
    create.mutate({ propriedadeId, clienteId: selectedLead.id, dataHora: new Date(dataHora).toISOString() });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Nova Visita</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Propriedade <span className="text-destructive">*</span></Label>
            <Select value={propriedadeId} onValueChange={setPropriedadeId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {propriedades.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.titulo}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
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
            <Label>Data e hora <span className="text-destructive">*</span></Label>
            <Input type="datetime-local" value={dataHora} onChange={(e) => setDataHora(e.target.value)} />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Agendar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function ImoveisVisitas() {
  const { toast } = useToast();
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const QK = ["imoveis-visitas", tenantId];

  const { data: visitas = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () => fetch(`/api/tenants/${tenantId}/imoveis/visitas`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/tenants/${tenantId}/imoveis/visitas/${id}`, {
        method: "PATCH", headers: authHeaders(), body: JSON.stringify({ status }),
      }).then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Falha ao atualizar visita"); return r.json(); }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    onError: (e: Error) => toast({ title: "Erro ao atualizar visita", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarCheck className="h-5 w-5" /> Visitas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {Array.isArray(visitas) ? visitas.length : 0} visita(s) agendada(s)
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" /> Nova Visita
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
          ) : visitas.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">Nenhuma visita agendada.</p>
          ) : (
            <div className="divide-y">
              {visitas.map((v: any) => (
                <div key={v.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{v.propriedade?.titulo ?? "Propriedade"}</span>
                      <Badge variant="outline" className={`text-xs ${STATUS_COLORS[v.status] ?? ""}`}>
                        {STATUS_LABELS[v.status] ?? v.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {v.cliente?.nome ?? "Cliente"} · {fmtDate(v.dataHora)}
                      {v.corretor && ` · Corretor: ${v.corretor.name}`}
                    </p>
                  </div>
                  {(v.status === "agendada" || v.status === "confirmada") && (
                    <div className="flex gap-1.5 shrink-0">
                      {v.status === "agendada" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: v.id, status: "confirmada" })}>
                          Confirmar
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: v.id, status: "realizada" })}>
                        Realizada
                      </Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => updateStatus.mutate({ id: v.id, status: "cancelada" })}>
                        Cancelar
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <NovaVisitaDialog tenantId={tenantId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
