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
import { Plus, Wrench, Loader2, MapPin } from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("vendorai_token");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

const STATUS_FLOW = [
  "orcamento_pendente", "orcamento_enviado", "aprovado", "agendado", "em_andamento", "concluido",
] as const;

const STATUS_LABELS: Record<string, string> = {
  orcamento_pendente: "Orçamento pendente",
  orcamento_enviado: "Orçamento enviado",
  aprovado: "Aprovado",
  agendado: "Agendado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
  cancelado: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  orcamento_pendente: "bg-slate-50 text-slate-600 border-slate-200",
  orcamento_enviado: "bg-blue-50 text-blue-700 border-blue-200",
  aprovado: "bg-emerald-50 text-emerald-700 border-emerald-200",
  agendado: "bg-violet-50 text-violet-700 border-violet-200",
  em_andamento: "bg-amber-50 text-amber-700 border-amber-200",
  concluido: "bg-green-50 text-green-700 border-green-200",
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

// ── Dialog de nova ordem ──────────────────────────────────────────────────────

function NovaOrdemDialog({ tenantId, open, onOpenChange }: { tenantId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [clienteSearch, setClienteSearch] = useState("");
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [tipoServicoId, setTipoServicoId] = useState("");
  const [enderecoAtendimento, setEnderecoAtendimento] = useState("");
  const [observacoes, setObservacoes] = useState("");

  const { data: leads = [] } = useQuery<any[]>({
    queryKey: ["leads-search", tenantId, clienteSearch],
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/leads?limit=10&search=${encodeURIComponent(clienteSearch)}`, { headers: authHeaders() })
        .then((r) => r.json()).then((d) => Array.isArray(d) ? d : d.leads ?? []),
    enabled: !!tenantId && clienteSearch.length >= 2,
  });

  const { data: tipos = [] } = useQuery<any[]>({
    queryKey: ["servicos-tipos", tenantId],
    queryFn: () => fetch(`/api/tenants/${tenantId}/servicos/tipos`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId && open,
  });

  const create = useMutation({
    mutationFn: (payload: any) =>
      fetch(`/api/tenants/${tenantId}/servicos/ordens`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["servicos-ordens", tenantId] });
      toast({ title: "Ordem de serviço criada!" });
      onOpenChange(false);
      setClienteSearch(""); setSelectedLead(null); setTipoServicoId(""); setEnderecoAtendimento(""); setObservacoes("");
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedLead || !tipoServicoId || !enderecoAtendimento) {
      toast({ title: "Cliente, tipo de serviço e endereço são obrigatórios", variant: "destructive" });
      return;
    }
    create.mutate({
      clienteId: selectedLead.id,
      tipoServicoId,
      enderecoAtendimento,
      observacoes: observacoes || undefined,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nova Ordem de Serviço</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5 relative">
            <Label>Cliente <span className="text-destructive">*</span></Label>
            <Input
              value={selectedLead ? selectedLead.nome : clienteSearch}
              onChange={(e) => { setSelectedLead(null); setClienteSearch(e.target.value); }}
              placeholder="Buscar por nome ou telefone..."
            />
            {!selectedLead && clienteSearch.length >= 2 && Array.isArray(leads) && leads.length > 0 && (
              <div className="absolute z-10 top-full left-0 right-0 bg-popover border rounded-md shadow-md mt-1 max-h-40 overflow-y-auto">
                {leads.map((l: any) => (
                  <button
                    key={l.id}
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                    onClick={() => { setSelectedLead(l); setClienteSearch(""); }}
                  >
                    {l.nome} {l.telefone ? `· ${l.telefone}` : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Tipo de serviço <span className="text-destructive">*</span></Label>
            <Select value={tipoServicoId} onValueChange={setTipoServicoId}>
              <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
              <SelectContent>
                {tipos.map((t: any) => <SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Endereço de atendimento <span className="text-destructive">*</span></Label>
            <Textarea value={enderecoAtendimento} onChange={(e) => setEnderecoAtendimento(e.target.value)} rows={2} placeholder="Rua, número, bairro, cidade" />
          </div>
          <div className="space-y-1.5">
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} rows={2} />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Criar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Página ─────────────────────────────────────────────────────────────────

export default function ServicosOrdens() {
  const { user } = useAuth();
  const tenantId = user?.tenantId ?? "";
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const QK = ["servicos-ordens", tenantId];

  const { data: ordens = [], isLoading } = useQuery<any[]>({
    queryKey: QK,
    queryFn: () =>
      fetch(`/api/tenants/${tenantId}/servicos/ordens`, { headers: authHeaders() }).then((r) => r.json()),
    enabled: !!tenantId,
  });

  const advanceStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      fetch(`/api/tenants/${tenantId}/servicos/ordens/${id}/status`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status }),
      }).then(async (r) => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Erro");
        return r.json();
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
    onError: (e: any) => toast({ title: "Erro ao atualizar status", description: e.message, variant: "destructive" }),
  });

  const cancel = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/tenants/${tenantId}/servicos/ordens/${id}/status`, {
        method: "PATCH",
        headers: authHeaders(),
        body: JSON.stringify({ status: "cancelado" }),
      }).then((r) => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: QK }),
  });

  const filtered = Array.isArray(ordens)
    ? statusFilter === "all" ? ordens : ordens.filter((o: any) => o.status === statusFilter)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Wrench className="h-5 w-5" /> Ordens de Serviço
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {Array.isArray(ordens) ? ordens.length : 0} ordem(ns) no total
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([k, label]) => (
                <SelectItem key={k} value={k}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nova Ordem
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">Nenhuma ordem de serviço encontrada.</p>
          ) : (
            <div className="divide-y">
              {filtered.map((o: any) => {
                const next = nextStatus(o.status);
                return (
                  <div key={o.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{o.cliente?.nome ?? "Cliente"}</span>
                          <Badge variant="outline" className={`text-xs ${STATUS_COLORS[o.status] ?? ""}`}>
                            {STATUS_LABELS[o.status] ?? o.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{o.tipoServico?.nome ?? "—"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {o.enderecoAtendimento}
                        </p>
                        {o.prestador && (
                          <p className="text-xs text-muted-foreground mt-0.5">Prestador: {o.prestador.nome}</p>
                        )}
                        <p className="text-xs mt-1">
                          {o.valorOrcado != null ? `Orçado: ${fmt(o.valorOrcado)}` : "Sem orçamento ainda"}
                          {o.valorFinal != null && ` · Final: ${fmt(o.valorFinal)}`}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {next && o.status !== "cancelado" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => advanceStatus.mutate({ id: o.id, status: next })}
                            disabled={advanceStatus.isPending}
                          >
                            Avançar → {STATUS_LABELS[next]}
                          </Button>
                        )}
                        {o.status !== "concluido" && o.status !== "cancelado" && (
                          <Button size="sm" variant="ghost" className="text-destructive" onClick={() => cancel.mutate(o.id)}>
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

      <NovaOrdemDialog tenantId={tenantId} open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
