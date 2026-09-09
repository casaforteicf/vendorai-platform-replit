import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Loader2, RefreshCw, ShieldCheck, Unplug } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FINANCE_INTEGRATION_CATALOG } from "@/lib/financeIntegrationCatalog";

type IntegrationStatus = "connected" | "partial" | "error" | "expired" | "disabled" | "not_configured";

type FinanceIntegration = {
  id: string;
  providerKey: string;
  name: string;
  category: string;
  authType: string;
  apiVersion?: string | null;
  capabilities: string[];
  webhookSupport: boolean;
  defaultDirection: "in" | "out" | "bidirectional";
  connectionId?: string | null;
  status: IntegrationStatus;
  syncDirection: "in" | "out" | "bidirectional";
  authenticationHealthPercent: number;
  syncHealthPercent: number;
  webhookHealthPercent: number;
  dataConsistencyPercent: number;
  overallHealthPercent: number;
  lastHealthCheckAt?: string | null;
  lastSyncAt?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
};

type IntegrationResponse = {
  integrations: FinanceIntegration[];
  summary: {
    coveragePercent: number;
    healthyPercent: number;
    errorPercent: number;
    configuredPercent: number;
  };
};

const statusLabel: Record<IntegrationStatus, string> = {
  connected: "Saudável",
  partial: "Parcial",
  error: "Erro",
  expired: "Token expirado",
  disabled: "Desativada",
  not_configured: "Não configurada",
};

function badgeVariant(status: IntegrationStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "connected") return "default";
  if (status === "error" || status === "expired") return "destructive";
  if (status === "partial") return "secondary";
  return "outline";
}

function pct(value: number | null | undefined) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? `${n.toFixed(1)}%` : "0,0%";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Ainda não verificada";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "Data indisponível";
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default function FinanceIntegrationsPanel({ tenantId }: { tenantId: string }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const headers = { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };

  const { data, isLoading, isError, refetch } = useQuery<IntegrationResponse>({
    queryKey: ["finance-integrations", tenantId],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/finance-integrations`, { headers });
      if (!response.ok) throw new Error("Não foi possível carregar o Integration Registry.");
      return response.json();
    },
    refetchInterval: 5 * 60 * 1000,
  });

  const testAll = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/finance-integrations/health-check`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao testar integrações.");
      return body;
    },
    onSuccess: async (body) => {
      await qc.invalidateQueries({ queryKey: ["finance-integrations", tenantId] });
      toast({ title: "Integrações verificadas", description: `Saúde média: ${pct(body?.summary?.averageHealthPercent ?? 0)}` });
    },
    onError: (error: Error) => toast({ title: "Falha no health check", description: error.message, variant: "destructive" }),
  });

  async function testOne(providerKey: string) {
    setTestingProvider(providerKey);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/finance-integrations/${encodeURIComponent(providerKey)}/health-check`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao testar integração.");
      await qc.invalidateQueries({ queryKey: ["finance-integrations", tenantId] });
      toast({ title: `${body.providerKey} verificada`, description: `Saúde geral: ${pct(body.overallHealthPercent)}` });
    } catch (error) {
      toast({ title: "Falha no health check", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setTestingProvider(null);
    }
  }

  const groups = useMemo(() => {
    const rows = data?.integrations ?? [];
    return Array.from(new Set(rows.map((item) => item.category))).map((category) => ({
      category,
      integrations: rows.filter((item) => item.category === category),
    }));
  }, [data]);

  if (isLoading) {
    return <Card><CardContent className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Carregando Integration Registry...</CardContent></Card>;
  }

  if (isError) {
    return <Card><CardContent className="py-10 text-center space-y-3"><AlertTriangle className="h-6 w-6 mx-auto text-destructive"/><p className="text-sm">Não foi possível carregar as integrações reais.</p><Button variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2"/>Tentar novamente</Button></CardContent></Card>;
  }

  const summary = data?.summary;

  return <div className="space-y-4">
    <Card>
      <CardContent className="p-4 md:p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-sm text-muted-foreground">Integration Registry em tempo real</p>
            <p className="text-3xl font-bold">{pct(summary?.coveragePercent)}</p>
            <p className="text-xs text-muted-foreground mt-1">Cobertura configurada do catálogo oficial</p>
          </div>
          <Button variant="outline" onClick={() => testAll.mutate()} disabled={testAll.isPending}>
            {testAll.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <RefreshCw className="h-4 w-4 mr-2"/>}
            Testar todas
          </Button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryStat icon={ShieldCheck} label="Saudáveis" value={pct(summary?.healthyPercent)} />
          <SummaryStat icon={AlertTriangle} label="Com erro" value={pct(summary?.errorPercent)} />
          <SummaryStat icon={Activity} label="Configuradas" value={pct(summary?.configuredPercent)} />
          <SummaryStat icon={Clock3} label="Ciclo automático" value="6h" />
        </div>
      </CardContent>
    </Card>

    {groups.map(({ category, integrations }) => <Card key={category}>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{category}</CardTitle></CardHeader>
      <CardContent>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {integrations.map((item) => {
            const fallback = FINANCE_INTEGRATION_CATALOG.find((catalog) => catalog.id === item.providerKey);
            const capabilities = item.capabilities?.length ? item.capabilities : fallback?.capabilities ?? [];
            const testing = testingProvider === item.providerKey;
            return <div key={item.id} className="rounded-lg border p-4 space-y-3 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0"><p className="font-medium truncate">{item.name}</p><p className="text-[11px] text-muted-foreground truncate">{item.providerKey}</p></div>
                <Badge variant={badgeVariant(item.status)} className="shrink-0">{statusLabel[item.status]}</Badge>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <HealthLine label="Saúde" value={item.overallHealthPercent}/>
                <HealthLine label="Autenticação" value={item.authenticationHealthPercent}/>
                <HealthLine label="Sincronização" value={item.syncHealthPercent}/>
                <HealthLine label="Consistência" value={item.dataConsistencyPercent}/>
              </div>

              <div className="text-[11px] text-muted-foreground space-y-1">
                <p>{capabilities.join(" · ") || "Capacidades ainda não catalogadas"}</p>
                <p>{item.authType} · {item.syncDirection}</p>
                <p>Última verificação: {formatDate(item.lastHealthCheckAt)}</p>
                {item.lastSyncAt && <p>Última sincronização: {formatDate(item.lastSyncAt)}</p>}
                {item.lastErrorMessage && <p className="text-destructive break-words">{item.lastErrorCode ? `${item.lastErrorCode}: ` : ""}{item.lastErrorMessage}</p>}
              </div>

              <Button size="sm" variant="outline" className="w-full" disabled={testing || testAll.isPending} onClick={() => testOne(item.providerKey)}>
                {testing ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin"/> : item.status === "not_configured" ? <Unplug className="h-3.5 w-3.5 mr-2"/> : <CheckCircle2 className="h-3.5 w-3.5 mr-2"/>}
                Testar integração
              </Button>
            </div>;
          })}
        </div>
      </CardContent>
    </Card>)}

    {!groups.length && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma integração ativa foi encontrada no Registry.</CardContent></Card>}
  </div>;
}

function HealthLine({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md bg-muted/50 p-2"><p className="text-[10px] text-muted-foreground">{label}</p><p className="font-semibold">{pct(value)}</p></div>;
}

function SummaryStat({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-3.5 w-3.5"/><span className="text-[11px]">{label}</span></div><p className="text-lg font-bold mt-1">{value}</p></div>;
}
