import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle2, Clock3, Database, FileClock, Loader2, RefreshCw, Save, Search, ShieldCheck, Unplug } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FINANCE_INTEGRATION_CATALOG } from "@/lib/financeIntegrationCatalog";
import FinanceContractsPanel from "@/components/finance/FinanceContractsPanel";

type IntegrationStatus = "connected" | "partial" | "error" | "expired" | "disabled" | "not_configured";
type SyncDirection = "in" | "out" | "bidirectional";
type SourceAuthority = "vendorai" | "integration" | "bank" | "manual";
type ConflictPolicy = "reject_and_review" | "vendorai_wins" | "source_wins" | "latest_wins";

type FinanceIntegration = {
  id: string;
  providerKey: string;
  name: string;
  category: string;
  authType: string;
  apiVersion?: string | null;
  capabilities: string[];
  webhookSupport: boolean;
  defaultDirection: SyncDirection;
  connectionId?: string | null;
  status: IntegrationStatus;
  syncDirection: SyncDirection;
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

type AuthorityRow = {
  id: string;
  objectType: string;
  authority: SourceAuthority;
  integrationId?: string | null;
  syncDirection: SyncDirection;
  conflictPolicy: ConflictPolicy;
  providerKey?: string | null;
  providerName?: string | null;
  updatedAt?: string | null;
};

type SyncLog = {
  id: string;
  direction: SyncDirection;
  objectType?: string | null;
  status: string;
  recordsProcessed: number;
  recordsFailed: number;
  latencyMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  correlationId?: string | null;
  createdAt: string;
};

const statusLabel: Record<IntegrationStatus, string> = {
  connected: "Saudável",
  partial: "Parcial",
  error: "Erro",
  expired: "Token expirado",
  disabled: "Desativada",
  not_configured: "Não configurada",
};

const OBJECT_TYPES = [
  ["customers", "Clientes"],
  ["products", "Produtos"],
  ["orders", "Pedidos"],
  ["inventory", "Estoque"],
  ["invoices", "Notas fiscais"],
  ["receivables", "Contas a receber"],
  ["payables", "Contas a pagar"],
  ["payments", "Pagamentos"],
  ["suppliers", "Fornecedores"],
] as const;

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

function authorityLabel(value: SourceAuthority) {
  if (value === "vendorai") return "VendorAI";
  if (value === "integration") return "Integração externa";
  if (value === "bank") return "Banco/Open Finance";
  return "Manual";
}

export default function FinanceIntegrationsPanel({ tenantId }: { tenantId: string }) {
  const { token } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<IntegrationStatus | "all">("all");
  const [authorityForm, setAuthorityForm] = useState<{
    objectType: string;
    authority: SourceAuthority;
    providerKey: string;
    syncDirection: SyncDirection;
    conflictPolicy: ConflictPolicy;
  }>({ objectType: "customers", authority: "vendorai", providerKey: "", syncDirection: "bidirectional", conflictPolicy: "reject_and_review" });

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

  const { data: authorities = [] } = useQuery<AuthorityRow[]>({
    queryKey: ["finance-integrations", tenantId, "source-authority"],
    enabled: Boolean(tenantId),
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/finance-integrations/source-authority`, { headers });
      if (!response.ok) throw new Error("Não foi possível carregar as fontes oficiais.");
      return response.json();
    },
  });

  const { data: logs = [], isLoading: logsLoading } = useQuery<SyncLog[]>({
    queryKey: ["finance-integrations", tenantId, selectedProvider, "logs"],
    enabled: Boolean(tenantId && selectedProvider),
    queryFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/finance-integrations/${encodeURIComponent(selectedProvider || "")}/logs?limit=25`, { headers });
      if (!response.ok) throw new Error("Não foi possível carregar os logs desta integração.");
      return response.json();
    },
  });

  const testAll = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/tenants/${tenantId}/finance-integrations/health-check`, { method: "POST", headers, body: JSON.stringify({}) });
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

  const saveAuthority = useMutation({
    mutationFn: async () => {
      if (authorityForm.authority === "integration" && !authorityForm.providerKey) throw new Error("Selecione o provedor que será a fonte oficial.");
      const response = await fetch(`/api/tenants/${tenantId}/finance-integrations/source-authority`, {
        method: "PUT",
        headers,
        body: JSON.stringify({
          objectType: authorityForm.objectType,
          authority: authorityForm.authority,
          providerKey: authorityForm.authority === "integration" ? authorityForm.providerKey : null,
          syncDirection: authorityForm.syncDirection,
          conflictPolicy: authorityForm.conflictPolicy,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Não foi possível salvar a fonte oficial.");
      return body;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["finance-integrations", tenantId, "source-authority"] });
      toast({ title: "Fonte oficial atualizada", description: "A regra de autoridade e conflito foi salva para este objeto." });
    },
    onError: (error: Error) => toast({ title: "Falha ao salvar fonte oficial", description: error.message, variant: "destructive" }),
  });

  async function testOne(providerKey: string) {
    setTestingProvider(providerKey);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/finance-integrations/${encodeURIComponent(providerKey)}/health-check`, { method: "POST", headers, body: JSON.stringify({}) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Falha ao testar integração.");
      await qc.invalidateQueries({ queryKey: ["finance-integrations", tenantId] });
      await qc.invalidateQueries({ queryKey: ["finance-integrations", tenantId, providerKey, "logs"] });
      toast({ title: `${body.providerKey} verificada`, description: `Saúde geral: ${pct(body.overallHealthPercent)}` });
    } catch (error) {
      toast({ title: "Falha no health check", description: error instanceof Error ? error.message : "Erro desconhecido", variant: "destructive" });
    } finally {
      setTestingProvider(null);
    }
  }

  const groups = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const rows = (data?.integrations ?? []).filter((item) => {
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const haystack = `${item.name} ${item.providerKey} ${item.category} ${(item.capabilities || []).join(" ")}`.toLowerCase();
      return matchesStatus && (!normalizedSearch || haystack.includes(normalizedSearch));
    });
    return Array.from(new Set(rows.map((item) => item.category))).map((category) => ({ category, integrations: rows.filter((item) => item.category === category) }));
  }, [data, search, statusFilter]);

  const configuredProviders = useMemo(() => (data?.integrations ?? []).filter((item) => item.status !== "not_configured" && item.status !== "disabled"), [data]);

  if (isLoading) return <Card><CardContent className="py-12 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin"/>Carregando Integration Registry...</CardContent></Card>;
  if (isError) return <Card><CardContent className="py-10 text-center space-y-3"><AlertTriangle className="h-6 w-6 mx-auto text-destructive"/><p className="text-sm">Não foi possível carregar as integrações reais.</p><Button variant="outline" onClick={() => refetch()}><RefreshCw className="h-4 w-4 mr-2"/>Tentar novamente</Button></CardContent></Card>;

  const summary = data?.summary;

  return <div className="space-y-4">
    <FinanceContractsPanel tenantId={tenantId} />

    <Card>
      <CardContent className="p-4 md:p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div><p className="text-sm text-muted-foreground">Integration Registry em tempo real</p><p className="text-3xl font-bold">{pct(summary?.coveragePercent)}</p><p className="text-xs text-muted-foreground mt-1">Cobertura configurada do catálogo oficial</p></div>
          <Button variant="outline" onClick={() => testAll.mutate()} disabled={testAll.isPending}>{testAll.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <RefreshCw className="h-4 w-4 mr-2"/>}Testar todas</Button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SummaryStat icon={ShieldCheck} label="Saudáveis" value={pct(summary?.healthyPercent)} />
          <SummaryStat icon={AlertTriangle} label="Com erro" value={pct(summary?.errorPercent)} />
          <SummaryStat icon={Activity} label="Configuradas" value={pct(summary?.configuredPercent)} />
          <SummaryStat icon={Clock3} label="Ciclo automático" value="6h" />
        </div>
        <div className="grid md:grid-cols-[1fr_220px] gap-2">
          <div className="relative"><Search className="h-4 w-4 absolute left-3 top-3 text-muted-foreground"/><Input className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar integração, categoria ou capacidade..."/></div>
          <select className="h-10 rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as IntegrationStatus | "all")}>
            <option value="all">Todos os status</option><option value="connected">Saudáveis</option><option value="partial">Parciais</option><option value="error">Com erro</option><option value="expired">Token expirado</option><option value="not_configured">Não configuradas</option><option value="disabled">Desativadas</option>
          </select>
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Database className="h-4 w-4"/>Fonte oficial dos dados</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">Defina qual sistema tem autoridade sobre cada objeto. Integrações externas não sobrescrevem o VendorAI sem uma regra explícita.</p>
        <div className="grid md:grid-cols-2 xl:grid-cols-5 gap-3 items-end">
          <div><Label className="text-xs">Objeto</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={authorityForm.objectType} onChange={(e) => setAuthorityForm((v) => ({ ...v, objectType: e.target.value }))}>{OBJECT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div><Label className="text-xs">Fonte oficial</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={authorityForm.authority} onChange={(e) => setAuthorityForm((v) => ({ ...v, authority: e.target.value as SourceAuthority }))}><option value="vendorai">VendorAI</option><option value="integration">Integração externa</option><option value="bank">Banco/Open Finance</option><option value="manual">Manual</option></select></div>
          <div><Label className="text-xs">Provedor</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm disabled:opacity-50" disabled={authorityForm.authority !== "integration"} value={authorityForm.providerKey} onChange={(e) => setAuthorityForm((v) => ({ ...v, providerKey: e.target.value }))}><option value="">Selecione</option>{configuredProviders.map((item) => <option key={item.providerKey} value={item.providerKey}>{item.name}</option>)}</select></div>
          <div><Label className="text-xs">Direção</Label><select className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={authorityForm.syncDirection} onChange={(e) => setAuthorityForm((v) => ({ ...v, syncDirection: e.target.value as SyncDirection }))}><option value="bidirectional">Bidirecional</option><option value="in">Entrada</option><option value="out">Saída</option></select></div>
          <Button onClick={() => saveAuthority.mutate()} disabled={saveAuthority.isPending}>{saveAuthority.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin"/> : <Save className="h-4 w-4 mr-2"/>}Salvar regra</Button>
        </div>
        <div><Label className="text-xs">Política de conflito</Label><select className="mt-1 h-10 w-full md:w-72 rounded-md border bg-background px-3 text-sm" value={authorityForm.conflictPolicy} onChange={(e) => setAuthorityForm((v) => ({ ...v, conflictPolicy: e.target.value as ConflictPolicy }))}><option value="reject_and_review">Bloquear e revisar</option><option value="vendorai_wins">VendorAI prevalece</option><option value="source_wins">Fonte oficial prevalece</option><option value="latest_wins">Dado mais recente prevalece</option></select></div>
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-2">
          {authorities.map((row) => <div key={row.id} className="rounded-lg border p-3 text-xs"><div className="flex items-center justify-between gap-2"><strong>{OBJECT_TYPES.find(([value]) => value === row.objectType)?.[1] || row.objectType}</strong><Badge variant="outline">{authorityLabel(row.authority)}</Badge></div><p className="text-muted-foreground mt-2">{row.providerName || "Sem provedor externo"} · {row.syncDirection}</p><p className="text-muted-foreground">Conflito: {row.conflictPolicy}</p></div>)}
          {!authorities.length && <p className="text-xs text-muted-foreground">Nenhuma regra específica configurada; prevalecem os padrões seguros do sistema.</p>}
        </div>
      </CardContent>
    </Card>

    {groups.map(({ category, integrations }) => <Card key={category}>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{category}</CardTitle></CardHeader>
      <CardContent><div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">{integrations.map((item) => {
        const fallback = FINANCE_INTEGRATION_CATALOG.find((catalog) => catalog.id === item.providerKey);
        const capabilities = item.capabilities?.length ? item.capabilities : fallback?.capabilities ?? [];
        const testing = testingProvider === item.providerKey;
        return <div key={item.id} className="rounded-lg border p-4 space-y-3 min-w-0">
          <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="font-medium truncate">{item.name}</p><p className="text-[11px] text-muted-foreground truncate">{item.providerKey}</p></div><Badge variant={badgeVariant(item.status)} className="shrink-0">{statusLabel[item.status]}</Badge></div>
          <div className="grid grid-cols-2 gap-2 text-xs"><HealthLine label="Saúde" value={item.overallHealthPercent}/><HealthLine label="Autenticação" value={item.authenticationHealthPercent}/><HealthLine label="Sincronização" value={item.syncHealthPercent}/><HealthLine label="Consistência" value={item.dataConsistencyPercent}/></div>
          <div className="text-[11px] text-muted-foreground space-y-1"><p>{capabilities.join(" · ") || "Capacidades ainda não catalogadas"}</p><p>{item.authType} · {item.syncDirection}</p><p>Última verificação: {formatDate(item.lastHealthCheckAt)}</p>{item.lastSyncAt && <p>Última sincronização: {formatDate(item.lastSyncAt)}</p>}{item.lastErrorMessage && <p className="text-destructive break-words">{item.lastErrorCode ? `${item.lastErrorCode}: ` : ""}{item.lastErrorMessage}</p>}</div>
          <div className="grid grid-cols-2 gap-2"><Button size="sm" variant="outline" disabled={testing || testAll.isPending} onClick={() => testOne(item.providerKey)}>{testing ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin"/> : item.status === "not_configured" ? <Unplug className="h-3.5 w-3.5 mr-2"/> : <CheckCircle2 className="h-3.5 w-3.5 mr-2"/>}Testar</Button><Button size="sm" variant={selectedProvider === item.providerKey ? "secondary" : "outline"} onClick={() => setSelectedProvider(selectedProvider === item.providerKey ? null : item.providerKey)}><FileClock className="h-3.5 w-3.5 mr-2"/>Logs</Button></div>
        </div>;
      })}</div></CardContent>
    </Card>)}

    {selectedProvider && <Card>
      <CardHeader className="flex-row items-center justify-between gap-3"><div><CardTitle className="text-sm">Logs · {data?.integrations.find((item) => item.providerKey === selectedProvider)?.name || selectedProvider}</CardTitle><p className="text-xs text-muted-foreground mt-1">Últimas 25 execuções registradas, sem exposição de credenciais.</p></div><Button size="sm" variant="ghost" onClick={() => setSelectedProvider(null)}>Fechar</Button></CardHeader>
      <CardContent>{logsLoading ? <div className="py-8 flex justify-center"><Loader2 className="h-4 w-4 animate-spin"/></div> : <div className="space-y-2">{logs.map((log) => <div key={log.id} className="rounded-lg border p-3 text-xs grid md:grid-cols-[1fr_auto] gap-2"><div><div className="flex items-center gap-2 flex-wrap"><Badge variant={log.status === "success" ? "default" : log.status === "error" ? "destructive" : "secondary"}>{log.status}</Badge><span>{log.objectType || "health_check"}</span><span className="text-muted-foreground">{log.direction}</span></div><p className="text-muted-foreground mt-2">{formatDate(log.createdAt)} · processados {log.recordsProcessed} · falhas {log.recordsFailed}{log.latencyMs != null ? ` · ${log.latencyMs} ms` : ""}</p>{log.errorMessage && <p className="text-destructive mt-1">{log.errorCode ? `${log.errorCode}: ` : ""}{log.errorMessage}</p>}</div>{log.correlationId && <span className="text-[10px] text-muted-foreground break-all">{log.correlationId}</span>}</div>)}{!logs.length && <p className="text-sm text-muted-foreground text-center py-8">Ainda não existem logs para esta integração.</p>}</div>}</CardContent>
    </Card>}

    {!groups.length && <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhuma integração corresponde aos filtros atuais.</CardContent></Card>}
  </div>;
}

function HealthLine({ label, value }: { label: string; value: number }) {
  return <div className="rounded-md bg-muted/50 p-2"><p className="text-[10px] text-muted-foreground">{label}</p><p className="font-semibold">{pct(value)}</p></div>;
}

function SummaryStat({ icon: Icon, label, value }: { icon: typeof Activity; label: string; value: string }) {
  return <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-muted-foreground"><Icon className="h-3.5 w-3.5"/><span className="text-[11px]">{label}</span></div><p className="text-lg font-bold mt-1">{value}</p></div>;
}
