import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Eye,
  Flame,
  Globe2,
  Link2,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Search,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type ConnectionStatus = {
  connected: boolean;
  verified?: boolean;
  siteUrl?: string | null;
  sitemapSubmittedAt?: string | null;
  connectedAt?: string | null;
};

type Metric = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type RankedQuery = Metric & { query: string };
type RankedPage = Metric & { page: string; path: string };

type InsightData = {
  generatedAt: string;
  period: {
    days: number;
    startDate: string;
    endDate: string;
  };
  connection: {
    siteUrl: string;
    connectedAt: string | null;
    sitemapSubmittedAt: string | null;
  };
  summary: Metric;
  previous: Metric;
  comparison: {
    clicksPct: number | null;
    impressionsPct: number | null;
    ctrPoints: number;
    positionImprovement: number;
  };
  topQueries: RankedQuery[];
  topPages: RankedPage[];
  opportunities: Array<{
    type: "ctr" | "ranking" | "page";
    priority: "high" | "medium";
    label: string;
    detail: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  }>;
  visitorIntelligence: null | {
    sessions: number;
    conversions: number;
    identifiedLeads: number;
    hotOpportunities: number;
    conversionRate: number;
    truncated: boolean;
    topSessions: Array<{
      sessionId: string;
      leadId: string | null;
      currentPath: string | null;
      city: string | null;
      region: string | null;
      intentScore: number;
      intentLabel: string;
      conversions: number;
      lastSeenAt: string | null;
    }>;
  };
};

function authHeaders() {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value || 0);
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(1).replace(".", ",")}%`;
}

function signed(value: number | null, suffix = "%") {
  if (value === null) return "novo período";
  const signal = value > 0 ? "+" : "";
  return `${signal}${value.toFixed(1).replace(".", ",")}${suffix}`;
}

function metricTone(value: number | null) {
  if (value === null || value === 0) return "text-muted-foreground";
  return value > 0 ? "text-emerald-600" : "text-red-600";
}

export default function SearchConsoleInsightsPanel({ tenantId }: { tenantId: string }) {
  const [, setLocation] = useLocation();
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [data, setData] = useState<InsightData | null>(null);
  const [days, setDays] = useState(28);
  const [loadingConnection, setLoadingConnection] = useState(true);
  const [loadingInsights, setLoadingInsights] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadConnection = useCallback(async () => {
    if (!tenantId) return null;
    setLoadingConnection(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/search-console-connection`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível consultar a conexão do Google Search Console.");
      const result = await response.json() as ConnectionStatus;
      setConnection(result);
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar a conexão.");
      return null;
    } finally {
      setLoadingConnection(false);
    }
  }, [tenantId]);

  const loadInsights = useCallback(async (selectedDays = days) => {
    if (!tenantId) return;
    setLoadingInsights(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/search-console-insights?days=${selectedDays}`, { headers: authHeaders() });
      if (response.status === 409) {
        setData(null);
        await loadConnection();
        return;
      }
      if (!response.ok) throw new Error("Não foi possível carregar os dados orgânicos do Google.");
      const result = await response.json() as InsightData;
      setData(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar Search Console.");
    } finally {
      setLoadingInsights(false);
    }
  }, [days, loadConnection, tenantId]);

  useEffect(() => {
    void loadConnection().then((status) => {
      if (status?.connected && status.verified) void loadInsights(days);
    });
  }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const returnTo = "/content?tab=resultados";
      const response = await fetch(`/api/auth/search-console?returnTo=${encodeURIComponent(returnTo)}`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível iniciar a conexão com o Google.");
      const result = await response.json() as { url?: string };
      if (!result.url) throw new Error("O Google não retornou uma URL de autorização.");
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao conectar Google Search Console.");
      setActionLoading(false);
    }
  };

  const verify = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/search-console-connection/verify`, {
        method: "POST",
        headers: authHeaders(),
      });
      if (!response.ok) throw new Error("Não foi possível verificar a propriedade agora.");
      const result = await response.json() as { verified?: boolean };
      const status = await loadConnection();
      if (result.verified || status?.verified) await loadInsights(days);
      else setError("A meta tag ainda não foi confirmada pelo Google. Tente verificar novamente em alguns instantes.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao verificar Search Console.");
    } finally {
      setActionLoading(false);
    }
  };

  const changePeriod = (nextDays: number) => {
    setDays(nextDays);
    void loadInsights(nextDays);
  };

  if (loadingConnection) {
    return <Card><CardContent className="py-8 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando Google Search Console…</CardContent></Card>;
  }

  if (!connection?.connected) {
    return (
      <Card className="border-primary/20">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4 text-primary" />Google Search Console</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Conecte a conta Google deste tenant para trazer cliques, impressões, termos pesquisados e páginas orgânicas para dentro do Marketing e cruzar com Visitor Intelligence/CRM.</p>
          <Button onClick={connect} disabled={actionLoading}><Link2 className="h-4 w-4 mr-2" />Conectar Google</Button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  if (!connection.verified) {
    return (
      <Card className="border-amber-300 bg-amber-50/40 dark:bg-amber-950/10">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" />Google conectado — falta validar o site</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">A conta já foi autorizada. O VendorAI publicou a identificação necessária; confirme a propriedade para liberar os dados de busca.</p>
          {connection.siteUrl && <p className="text-xs font-mono rounded-md border bg-background px-3 py-2 break-all">{connection.siteUrl}</p>}
          <div className="flex flex-wrap gap-2">
            <Button onClick={verify} disabled={actionLoading}>{actionLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}Verificar agora</Button>
            <Button variant="outline" onClick={connect} disabled={actionLoading}>Reconectar Google</Button>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>
    );
  }

  const summary = data?.summary;
  const comparison = data?.comparison;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Search className="h-4 w-4 text-primary" />Google Search Console</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">SEO e demanda orgânica do tenant, conectados ao Visitor Intelligence e CRM.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {[28, 90].map((period) => <Button key={period} size="sm" variant={days === period ? "default" : "outline"} onClick={() => changePeriod(period)}>{period} dias</Button>)}
              <Button size="sm" variant="outline" onClick={() => loadInsights(days)} disabled={loadingInsights}><RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loadingInsights ? "animate-spin" : ""}`} />Atualizar</Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}
          {loadingInsights && !data ? <div className="py-8 flex items-center justify-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando desempenho orgânico…</div> : null}

          {summary && comparison ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><MousePointerClick className="h-3.5 w-3.5" />Cliques</div><p className="mt-2 text-2xl font-semibold">{formatNumber(summary.clicks)}</p><p className={`mt-1 text-xs ${metricTone(comparison.clicksPct)}`}>{signed(comparison.clicksPct)} vs. período anterior</p></div>
              <div className="rounded-lg border p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Eye className="h-3.5 w-3.5" />Impressões</div><p className="mt-2 text-2xl font-semibold">{formatNumber(summary.impressions)}</p><p className={`mt-1 text-xs ${metricTone(comparison.impressionsPct)}`}>{signed(comparison.impressionsPct)} vs. período anterior</p></div>
              <div className="rounded-lg border p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Target className="h-3.5 w-3.5" />CTR</div><p className="mt-2 text-2xl font-semibold">{formatPercent(summary.ctr)}</p><p className={`mt-1 text-xs ${metricTone(comparison.ctrPoints)}`}>{signed(comparison.ctrPoints, " p.p.")} vs. período anterior</p></div>
              <div className="rounded-lg border p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" />Posição média</div><p className="mt-2 text-2xl font-semibold">{summary.position ? summary.position.toFixed(1).replace(".", ",") : "—"}</p><p className={`mt-1 text-xs ${metricTone(comparison.positionImprovement)}`}>{comparison.positionImprovement > 0 ? "+" : ""}{comparison.positionImprovement.toFixed(1).replace(".", ",")} posições</p></div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {data?.visitorIntelligence ? (
        <Card className="border-primary/20">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><Globe2 className="h-4 w-4 text-primary" />Da busca ao lead: Visitor Intelligence + CRM</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Sessões Google orgânico</p><p className="mt-1 text-xl font-semibold">{formatNumber(data.visitorIntelligence.sessions)}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Leads identificados</p><p className="mt-1 text-xl font-semibold">{formatNumber(data.visitorIntelligence.identifiedLeads)}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Conversões</p><p className="mt-1 text-xl font-semibold">{formatNumber(data.visitorIntelligence.conversions)}</p><p className="text-xs text-muted-foreground">{data.visitorIntelligence.conversionRate.toFixed(1).replace(".", ",")}% das sessões</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Oportunidades quentes</p><p className="mt-1 text-xl font-semibold flex items-center gap-1.5"><Flame className="h-4 w-4 text-orange-600" />{formatNumber(data.visitorIntelligence.hotOpportunities)}</p></div>
            </div>

            {data.visitorIntelligence.topSessions.length > 0 && (
              <div className="rounded-lg border overflow-hidden">
                <div className="border-b px-3 py-2 text-xs font-medium">Sessões orgânicas com maior intenção</div>
                <div className="divide-y">
                  {data.visitorIntelligence.topSessions.map((session) => (
                    <div key={session.sessionId} className="flex flex-col gap-2 px-3 py-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2"><Badge variant="outline">{session.intentScore}/100 · {session.intentLabel}</Badge>{session.leadId && <Badge className="bg-emerald-600"><Users className="h-3 w-3 mr-1" />Lead</Badge>}</div>
                        <p className="mt-1 truncate text-sm font-medium">{session.currentPath || "/"}</p>
                        <p className="text-xs text-muted-foreground">{[session.city, session.region].filter(Boolean).join(" / ") || "Localização não disponível"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => setLocation(`/visitor-intelligence?session=${encodeURIComponent(session.sessionId)}`)}>Abrir sessão</Button>
                        {session.leadId && <Button size="sm" onClick={() => setLocation(`/leads/${session.leadId}`)}>Abrir CRM</Button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {data && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Buscas que trazem clientes</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.topQueries.length === 0 && <p className="text-sm text-muted-foreground">Ainda não há consultas disponíveis neste período.</p>}
              {data.topQueries.slice(0, 8).map((item, index) => (
                <div key={`${item.query}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b py-2 last:border-0">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{item.query || "(consulta não disponível)"}</p><p className="text-xs text-muted-foreground">posição {item.position.toFixed(1).replace(".", ",")} · CTR {formatPercent(item.ctr)}</p></div>
                  <div className="text-right"><p className="text-sm font-semibold">{formatNumber(item.clicks)} cliques</p><p className="text-xs text-muted-foreground">{formatNumber(item.impressions)} imp.</p></div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Páginas com tráfego orgânico</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {data.topPages.length === 0 && <p className="text-sm text-muted-foreground">Ainda não há páginas disponíveis neste período.</p>}
              {data.topPages.slice(0, 8).map((item, index) => (
                <div key={`${item.page}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b py-2 last:border-0">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{item.path}</p><p className="text-xs text-muted-foreground">posição {item.position.toFixed(1).replace(".", ",")} · CTR {formatPercent(item.ctr)}</p></div>
                  <div className="text-right"><p className="text-sm font-semibold">{formatNumber(item.clicks)} cliques</p><p className="text-xs text-muted-foreground">{formatNumber(item.impressions)} imp.</p></div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {data?.opportunities?.length ? (
        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" />Oportunidades detectadas</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {data.opportunities.map((item, index) => (
              <div key={`${item.type}-${item.label}-${index}`} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3"><div className="min-w-0"><div className="flex items-center gap-2"><Badge variant={item.priority === "high" ? "default" : "outline"}>{item.priority === "high" ? "Alta prioridade" : "Oportunidade"}</Badge><span className="truncate text-sm font-semibold">{item.label}</span></div><p className="mt-2 text-sm text-muted-foreground">{item.detail}</p></div><div className="hidden shrink-0 text-right text-xs text-muted-foreground md:block"><p>{formatNumber(item.impressions)} imp.</p><p>{formatNumber(item.clicks)} cliques</p></div></div>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      {data && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Período: {data.period.startDate} a {data.period.endDate}</span>
          <a className="inline-flex items-center gap-1 hover:text-foreground" href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Abrir Search Console <ExternalLink className="h-3 w-3" /></a>
        </div>
      )}
    </div>
  );
}
