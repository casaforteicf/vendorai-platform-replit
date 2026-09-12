import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bot, Loader2, RefreshCw, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type IntelligenceAlert = {
  type: "growth" | "drop" | "new_query" | "page_loss";
  severity: "info" | "warning" | "high";
  title: string;
  detail: string;
};

type IntelligenceResponse = {
  available: boolean;
  alerts: IntelligenceAlert[];
  searchConsole: {
    available: boolean;
    matchedPages?: number;
    citationsOnMatchedPages?: number;
    impressionsOnMatchedPages?: number;
    clicksOnMatchedPages?: number;
    matches?: Array<{ pageUrl: string; citations: number; clicks: number; impressions: number; ctr: number; position: number }>;
  };
  aiTraffic: {
    available: boolean;
    sessions: number;
    conversions: number;
    identifiedLeads?: number;
    sources: Array<{ source: string; sessions: number; conversions: number }>;
    pages: Array<{ page: string; sessions: number; conversions: number }>;
  };
};

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` };
}

export default function AiVisibilityIntelligencePanel({ tenantId }: { tenantId: string }) {
  const [data, setData] = useState<IntelligenceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/ai-visibility/intelligence`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível cruzar os dados de IA, Google e visitantes.");
      setData(await response.json() as IntelligenceResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar inteligência unificada.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => { void load(); }, [load]);

  if (!loading && data && !data.available) return null;

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4 text-primary" />Inteligência unificada</CardTitle>
            <p className="mt-1 text-xs text-muted-foreground">Cruza citações em IA com Search Console e Visitor Intelligence para transformar visibilidade em oportunidade comercial.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Recalcular
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</div>}
        {loading && !data ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cruzando IA, busca e comportamento…</div>
        ) : data ? (
          <>
            {data.alerts.length > 0 && (
              <div className="grid gap-2 lg:grid-cols-2">
                {data.alerts.map((alert) => (
                  <div key={`${alert.type}-${alert.title}`} className={`rounded-lg border p-3 ${alert.severity === "high" ? "border-destructive/40 bg-destructive/5" : ""}`}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle className={`mt-0.5 h-4 w-4 shrink-0 ${alert.severity === "high" ? "text-destructive" : "text-primary"}`} />
                      <div><p className="text-sm font-medium">{alert.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{alert.detail}</p></div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              <div className="rounded-lg border p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Search className="h-3.5 w-3.5" />Páginas IA + Google</div><p className="mt-1 text-xl font-semibold">{data.searchConsole.available ? (data.searchConsole.matchedPages ?? 0) : "—"}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Impressões Google</p><p className="mt-1 text-xl font-semibold">{data.searchConsole.available ? (data.searchConsole.impressionsOnMatchedPages ?? 0).toLocaleString("pt-BR") : "—"}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Cliques Google</p><p className="mt-1 text-xl font-semibold">{data.searchConsole.available ? (data.searchConsole.clicksOnMatchedPages ?? 0).toLocaleString("pt-BR") : "—"}</p></div>
              <div className="rounded-lg border p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Users className="h-3.5 w-3.5" />Visitas de IA</div><p className="mt-1 text-xl font-semibold">{data.aiTraffic.available ? data.aiTraffic.sessions.toLocaleString("pt-BR") : "—"}</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Leads identificados</p><p className="mt-1 text-xl font-semibold">{data.aiTraffic.available ? (data.aiTraffic.identifiedLeads ?? 0).toLocaleString("pt-BR") : "—"}</p></div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">Páginas citadas que também performam no Google</p>{!data.searchConsole.available && <Badge variant="outline">Search Console indisponível</Badge>}</div>
                <div className="mt-3 space-y-2">
                  {(data.searchConsole.matches ?? []).slice(0, 6).map((item) => (
                    <div key={item.pageUrl} className="grid grid-cols-[1fr_auto] gap-3 text-sm">
                      <div className="min-w-0"><p className="truncate">{item.pageUrl}</p><p className="text-xs text-muted-foreground">{item.citations} citações · posição {item.position.toFixed(1)}</p></div>
                      <div className="text-right"><p className="font-medium">{item.impressions.toLocaleString("pt-BR")}</p><p className="text-xs text-muted-foreground">impressões</p></div>
                    </div>
                  ))}
                  {data.searchConsole.available && !(data.searchConsole.matches ?? []).length && <p className="text-xs text-muted-foreground">Ainda não há sobreposição entre as páginas mais citadas em IA e as páginas líderes do Search Console.</p>}
                </div>
              </div>

              <div className="rounded-lg border p-4">
                <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">Tráfego identificável vindo de assistentes</p>{data.aiTraffic.available && <Badge variant="secondary">{data.aiTraffic.conversions} conversões</Badge>}</div>
                <div className="mt-3 space-y-2">
                  {data.aiTraffic.sources.map((source) => (
                    <div key={source.source} className="flex items-center justify-between gap-3 text-sm"><span>{source.source}</span><span className="font-medium">{source.sessions} visitas · {source.conversions} conv.</span></div>
                  ))}
                  {data.aiTraffic.available && data.aiTraffic.sources.length === 0 && <p className="text-xs text-muted-foreground">Nenhum referral identificável de ChatGPT, Perplexity, Copilot, Gemini ou Claude nos últimos 28 dias.</p>}
                  {!data.aiTraffic.available && <p className="text-xs text-muted-foreground">Visitor Intelligence não está disponível para este tenant.</p>}
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">Somente referrals que permitem identificar o assistente são classificados como tráfego de IA; busca Bing comum não é contada como IA.</p>
              </div>
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
