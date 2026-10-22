import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Gauge, Link2, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";

type IndexationSnapshot = {
  total: number;
  indexed: number;
  discovered: number;
  crawled: number;
  unknown: number;
  other: number;
};

type SearchConsoleInsights = {
  summary?: { clicks: number; impressions: number; ctr: number; position: number };
  indexation?: IndexationSnapshot | null;
};

type BacklinkResponse = {
  summary: {
    total: number;
    byStatus: {
      identified: number;
      contacted: number;
      negotiating: number;
      won: number;
      lost: number;
    };
  };
};

function parseStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function decodeTokenTenantId(): string | null {
  try {
    const token = localStorage.getItem("vendorai_token");
    const payload = token?.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
    const parsed = JSON.parse(atob(padded)) as { tenantId?: string; tenant_id?: string };
    return parsed.tenantId || parsed.tenant_id || null;
  } catch {
    return null;
  }
}

function currentTenantId() {
  const override = parseStorage<{ id?: string; preview?: boolean }>(OVERRIDE_KEY);
  if (override?.id && !override.preview) return override.id;
  const user = parseStorage<{ tenantId?: string | null }>(USER_CACHE_KEY);
  return user?.tenantId || decodeTokenTenantId();
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("vendorai_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function SeoCommandCenterCard() {
  const [tenantId] = useState(() => currentTenantId());
  const [insights, setInsights] = useState<SearchConsoleInsights | null>(null);
  const [backlinks, setBacklinks] = useState<BacklinkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) {
      setLoading(false);
      setError("Não foi possível identificar o tenant atual.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [insightsResponse, backlinksResponse] = await Promise.all([
        fetch(`/api/tenants/${tenantId}/search-console-insights?days=28`, { headers: authHeaders() }),
        fetch(`/api/tenants/${tenantId}/seo/backlinks`, { headers: authHeaders() }),
      ]);

      if (!insightsResponse.ok) throw new Error("Não foi possível carregar a leitura do Search Console.");
      if (!backlinksResponse.ok) throw new Error("Não foi possível carregar Autoridade & Backlinks.");

      setInsights(await insightsResponse.json() as SearchConsoleInsights);
      setBacklinks(await backlinksResponse.json() as BacklinkResponse);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao calcular o SEO Command Center.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const model = useMemo(() => {
    const indexation = insights?.indexation;
    const backlinkSummary = backlinks?.summary;
    if (!indexation || !backlinkSummary) return null;

    const total = Math.max(indexation.total, 1);
    const indexationScore = (indexation.indexed / total) * 100;
    const discoveryScore = ((indexation.indexed + indexation.discovered + indexation.crawled) / total) * 100;
    const publishedLinks = backlinkSummary.byStatus.won ?? 0;
    const activeLinks = publishedLinks + (backlinkSummary.byStatus.negotiating ?? 0) + (backlinkSummary.byStatus.contacted ?? 0);
    const authorityScore = Math.min(100, publishedLinks * 18 + activeLinks * 5);
    const demandScore = Math.min(100, Math.log10(Math.max((insights?.summary?.impressions ?? 0), 1) + 1) * 28);
    const score = clampScore(indexationScore * 0.45 + discoveryScore * 0.2 + authorityScore * 0.25 + demandScore * 0.1);

    let bottleneck = "Consolidar autoridade e ampliar demanda orgânica.";
    let action = "Buscar backlinks relevantes para páginas comerciais prioritárias.";
    if (indexation.unknown > 0) {
      bottleneck = `${indexation.unknown} página(s) prioritária(s) ainda são desconhecidas pelo Google.`;
      action = "Reforçar descoberta: links internos, menções externas e recrawl das prioridades desconhecidas.";
    } else if (indexation.discovered + indexation.crawled > indexation.indexed) {
      bottleneck = "O Google já descobriu páginas, mas a indexação ainda está atrasada.";
      action = "Priorizar autoridade e sinais externos nas páginas descobertas/rastreadas ainda não indexadas.";
    } else if (publishedLinks < 3) {
      bottleneck = "A base técnica está saudável, mas a autoridade externa ainda é baixa.";
      action = "Conquistar links reais de diretórios, parceiros, mídia e ecossistema de software.";
    }

    return { score, indexationScore: clampScore(indexationScore), discoveryScore: clampScore(discoveryScore), authorityScore: clampScore(authorityScore), demandScore: clampScore(demandScore), bottleneck, action, publishedLinks };
  }, [backlinks, insights]);

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="SEO Command Center">
      <div className="flex flex-col gap-3 border-b px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold"><Gauge className="h-4 w-4 text-primary" />SEO Command Center</div>
          <p className="mt-1 text-xs text-muted-foreground">Cruza indexação, descoberta, demanda orgânica e autoridade para mostrar o gargalo real e a próxima ação.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Atualizar
        </Button>
      </div>

      <div className="space-y-4 p-4">
        {loading && !model ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Calculando saúde SEO…</div>
        ) : model ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">SEO Score</p><p className="mt-1 text-2xl font-semibold">{model.score}/100</p></div>
              <div className="rounded-lg border p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" />Indexação</div><p className="mt-1 text-xl font-semibold">{model.indexationScore}</p></div>
              <div className="rounded-lg border p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Search className="h-3.5 w-3.5" />Descoberta</div><p className="mt-1 text-xl font-semibold">{model.discoveryScore}</p></div>
              <div className="rounded-lg border p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Link2 className="h-3.5 w-3.5" />Autoridade</div><p className="mt-1 text-xl font-semibold">{model.authorityScore}</p><p className="text-[11px] text-muted-foreground">{model.publishedLinks} link(s) publicados</p></div>
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Demanda orgânica</p><p className="mt-1 text-xl font-semibold">{model.demandScore}</p></div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-xs font-medium"><AlertTriangle className="h-3.5 w-3.5 text-amber-600" />Gargalo atual</div>
                <p className="mt-2 text-sm text-muted-foreground">{model.bottleneck}</p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="flex items-center gap-2 text-xs font-medium"><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />Próxima ação recomendada</div>
                <p className="mt-2 text-sm text-muted-foreground">{model.action}</p>
              </div>
            </div>
          </>
        ) : null}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </section>
  );
}
