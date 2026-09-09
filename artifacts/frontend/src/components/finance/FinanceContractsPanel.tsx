import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, FileSignature, Loader2, RefreshCw, ShieldCheck, TriangleAlert } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type FinanceContract = {
  id: string;
  dealId?: string | null;
  dealTitle?: string | null;
  plan?: string | null;
  contractType?: string | null;
  status: string;
  pdfUrl?: string | null;
  signedAt?: string | null;
  effectiveAt?: string | null;
  expiresAt?: string | null;
  renewalType?: "none" | "manual" | "automatic" | null;
  renewalNoticeDays?: number | null;
  nextAdjustmentAt?: string | null;
  adjustmentIndex?: string | null;
  probChurn?: number | null;
  healthPercent: number;
  daysToExpiry?: number | null;
  renewalDue: boolean;
  atRisk: boolean;
};

type Response = {
  contracts: FinanceContract[];
  summary: {
    activePercent: number;
    lifecycleCoveragePercent: number;
    automaticRenewalPercent: number;
    atRiskPercent: number;
    renewalDuePercent: number;
    averageHealthPercent: number;
  };
};

const pct = (value: number | null | undefined) => `${Number(value ?? 0).toFixed(1)}%`;
const dateOnly = (value?: string | null) => value ? new Date(value).toISOString().slice(0, 10) : "";
const dateLabel = (value?: string | null) => value ? new Date(value).toLocaleDateString("pt-BR") : "Não definido";

export default function FinanceContractsPanel({ tenantId }: { tenantId: string }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<FinanceContract | null>(null);
  const [query, setQuery] = useState("");
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const { data, isLoading, refetch } = useQuery<Response>({
    queryKey: ["finance-contracts", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/finance-contracts`, { headers });
      if (!response.ok) throw new Error("Falha ao carregar contratos.");
      return response.json();
    },
  });

  const saveLifecycle = useMutation({
    mutationFn: async (payload: { id: string; body: Record<string, unknown> }) => {
      const response = await fetch(`/api/tenants/${tenantId}/finance-contracts/${payload.id}/lifecycle`, { method: "PUT", headers, body: JSON.stringify(payload.body) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao atualizar contrato.");
      return body;
    },
    onSuccess: async () => {
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["finance-contracts", tenantId] });
      toast({ title: "Ciclo de vida atualizado" });
    },
    onError: (error: Error) => toast({ title: "Não foi possível salvar", description: error.message, variant: "destructive" }),
  });

  const renew = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/tenants/${tenantId}/finance-contracts/${id}/renew`, { method: "POST", headers, body: JSON.stringify({ months: 12 }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao gerar renovação.");
      return body;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["finance-contracts", tenantId] });
      toast({ title: "Renovação gerada", description: "O contrato anterior foi preservado e um novo ciclo foi criado." });
    },
    onError: (error: Error) => toast({ title: "Renovação não gerada", description: error.message, variant: "destructive" }),
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data?.contracts ?? [];
    return (data?.contracts ?? []).filter((item) => [item.dealTitle, item.contractType, item.plan, item.status].filter(Boolean).some((value) => String(value).toLowerCase().includes(q)));
  }, [data, query]);

  if (isLoading) return <Card><CardContent className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Carregando contratos...</CardContent></Card>;

  const summary = data?.summary;
  return <div className="space-y-4">
    <Card>
      <CardContent className="p-4 md:p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div><p className="text-sm text-muted-foreground">Contratos, recorrência e renovação</p><p className="text-3xl font-bold">{pct(summary?.averageHealthPercent)}</p><p className="text-xs text-muted-foreground mt-1">Saúde média contratual</p></div>
          <Button variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2"/>Atualizar</Button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          <Stat icon={FileSignature} label="Ativos" value={pct(summary?.activePercent)} />
          <Stat icon={ShieldCheck} label="Ciclo estruturado" value={pct(summary?.lifecycleCoveragePercent)} />
          <Stat icon={CalendarClock} label="Renovação automática" value={pct(summary?.automaticRenewalPercent)} />
          <Stat icon={TriangleAlert} label="Em risco" value={pct(summary?.atRiskPercent)} />
          <Stat icon={CalendarClock} label="Na janela de renovação" value={pct(summary?.renewalDuePercent)} />
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">Carteira de contratos</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <Input placeholder="Buscar contrato, plano ou status" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="grid lg:grid-cols-2 gap-3">
          {rows.map((contract) => <div key={contract.id} className="rounded-lg border p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0"><p className="font-semibold truncate">{contract.dealTitle || contract.contractType || "Contrato"}</p><p className="text-xs text-muted-foreground">{contract.plan || contract.contractType || "Sem plano informado"}</p></div>
              <Badge variant={contract.atRisk ? "destructive" : "secondary"}>{pct(contract.healthPercent)}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <Info label="Status" value={contract.status} />
              <Info label="Vencimento" value={dateLabel(contract.expiresAt)} />
              <Info label="Renovação" value={contract.renewalType === "automatic" ? "Automática" : contract.renewalType === "manual" ? "Manual" : "Sem regra"} />
              <Info label="Aviso" value={`${contract.renewalNoticeDays ?? 0} dias`} />
            </div>
            {contract.daysToExpiry !== null && contract.daysToExpiry !== undefined && <p className="text-xs text-muted-foreground">{contract.daysToExpiry < 0 ? `Vencido há ${Math.abs(contract.daysToExpiry)} dia(s)` : `Vence em ${contract.daysToExpiry} dia(s)`}</p>}
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => setEditing(contract)}>Gerenciar ciclo</Button>
              {contract.renewalDue && contract.renewalType !== "none" && <Button size="sm" onClick={() => renew.mutate(contract.id)} disabled={renew.isPending}>Gerar renovação 12 meses</Button>}
            </div>
          </div>)}
        </div>
        {!rows.length && <p className="text-sm text-muted-foreground text-center py-8">Nenhum contrato encontrado.</p>}
      </CardContent>
    </Card>

    <Dialog open={Boolean(editing)} onOpenChange={(open) => !open && setEditing(null)}>
      <DialogContent>
        <DialogHeader><DialogTitle>Gerenciar ciclo do contrato</DialogTitle></DialogHeader>
        {editing && <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const iso = (name: string) => { const value = String(form.get(name) || ""); return value ? new Date(`${value}T12:00:00`).toISOString() : null; };
          saveLifecycle.mutate({ id: editing.id, body: {
            effectiveAt: iso("effectiveAt"),
            expiresAt: iso("expiresAt"),
            renewalType: String(form.get("renewalType") || "none"),
            renewalNoticeDays: Number(form.get("renewalNoticeDays") || 0),
            nextAdjustmentAt: iso("nextAdjustmentAt"),
            adjustmentIndex: String(form.get("adjustmentIndex") || "") || null,
          }});
        }}>
          <div className="grid grid-cols-2 gap-3"><div><Label>Início</Label><Input name="effectiveAt" type="date" defaultValue={dateOnly(editing.effectiveAt)} /></div><div><Label>Vencimento</Label><Input name="expiresAt" type="date" defaultValue={dateOnly(editing.expiresAt)} /></div></div>
          <div><Label>Renovação</Label><select name="renewalType" defaultValue={editing.renewalType || "none"} className="w-full h-10 rounded-md border bg-background px-3"><option value="none">Sem renovação</option><option value="manual">Manual</option><option value="automatic">Automática</option></select></div>
          <div><Label>Aviso antes do vencimento (dias)</Label><Input name="renewalNoticeDays" type="number" min="0" max="365" defaultValue={editing.renewalNoticeDays ?? 30} /></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Próximo reajuste</Label><Input name="nextAdjustmentAt" type="date" defaultValue={dateOnly(editing.nextAdjustmentAt)} /></div><div><Label>Índice/regra de reajuste</Label><Input name="adjustmentIndex" defaultValue={editing.adjustmentIndex || ""} placeholder="IPCA, IGP-M, 8%..." /></div></div>
          <Button className="w-full" type="submit" disabled={saveLifecycle.isPending}>{saveLifecycle.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin"/>}Salvar ciclo de vida</Button>
        </form>}
      </DialogContent>
    </Dialog>
  </div>;
}

function Stat({ icon: Icon, label, value }: { icon: typeof ShieldCheck; label: string; value: string }) { return <div className="rounded-lg border p-3"><Icon className="h-4 w-4 text-muted-foreground"/><p className="text-xs text-muted-foreground mt-2">{label}</p><p className="text-lg font-bold">{value}</p></div>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="rounded-md bg-muted/50 p-2"><p className="text-[10px] text-muted-foreground">{label}</p><p className="font-medium break-words">{value}</p></div>; }
