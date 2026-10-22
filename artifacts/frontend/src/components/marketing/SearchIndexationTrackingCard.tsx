import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, Loader2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";

type IndexationStatus = "indexed" | "discovered" | "crawled" | "unknown" | "not_indexed" | "error";

type IndexationUrl = {
  url: string;
  status: IndexationStatus;
  verdict: string | null;
  coverageState: string | null;
  indexingState: string | null;
  robotsTxtState: string | null;
  pageFetchState: string | null;
  lastCrawlTime: string | null;
};

type IndexationSnapshot = {
  checkedAt: string;
  cached: boolean;
  total: number;
  indexed: number;
  discovered: number;
  crawled: number;
  unknown: number;
  other: number;
  urls: IndexationUrl[];
};

type InsightsResponse = {
  indexation?: IndexationSnapshot | null;
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

function compactUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.pathname === "/" ? "/" : parsed.pathname;
  } catch {
    return value;
  }
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function labelFor(status: IndexationStatus) {
  if (status === "indexed") return "Indexada";
  if (status === "discovered") return "Descoberta";
  if (status === "crawled") return "Rastreada";
  if (status === "unknown") return "Desconhecida";
  if (status === "error") return "Erro na leitura";
  return "Não indexada";
}

function statusWeight(status: IndexationStatus) {
  if (status === "unknown") return 0;
  if (status === "crawled") return 1;
  if (status === "discovered") return 2;
  if (status === "not_indexed") return 3;
  if (status === "error") return 4;
  return 5;
}

export function SearchIndexationTrackingCard() {
  const [tenantId] = useState(() => currentTenantId());
  const [data, setData] = useState<IndexationSnapshot | null>(null);
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
      const response = await fetch(`/api/tenants/${tenantId}/search-console-insights?days=28`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível consultar a indexação do Google agora.");
      const payload = await response.json() as InsightsResponse;
      setData(payload.indexation ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao consultar indexação.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(
    () => [...(data?.urls ?? [])].sort((a, b) => statusWeight(a.status) - statusWeight(b.status)),
    [data],
  );

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Monitor de indexação do Google">
      <div className="flex flex-col gap-3 border-b px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold"><Search className="h-4 w-4 text-primary" />Indexação Google</div>
          <p className="mt-1 text-xs text-muted-foreground">URL Inspection API · descoberta, rastreamento e indexação das páginas prioritárias.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Atualizar
        </Button>
      </div>

      <div className="space-y-4 p-4">
        {loading && !data ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Consultando o Google…</div>
        ) : data ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Monitoradas</p><p className="mt-1 text-xl font-semibold">{data.total}</p></div>
              <div className="rounded-lg border p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" />Indexadas</div><p className="mt-1 text-xl font-semibold">{data.indexed}</p></div>
              <div className="rounded-lg border p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Search className="h-3.5 w-3.5" />Descobertas</div><p className="mt-1 text-xl font-semibold">{data.discovered}</p></div>
              <div className="rounded-lg border p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Clock3 className="h-3.5 w-3.5" />Rastreadas</div><p className="mt-1 text-xl font-semibold">{data.crawled}</p></div>
              <div className="rounded-lg border p-3"><div className="flex items-center gap-1.5 text-xs text-muted-foreground"><AlertCircle className="h-3.5 w-3.5" />Desconhecidas</div><p className="mt-1 text-xl font-semibold">{data.unknown}</p></div>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-3 border-b bg-muted/30 px-3 py-2 text-[11px] font-medium text-muted-foreground sm:grid-cols-[minmax(0,1fr)_150px_130px]">
                <span>Página</span><span>Status</span><span className="hidden sm:block">Último crawl</span>
              </div>
              {rows.map((item) => (
                <div key={item.url} className="grid grid-cols-[minmax(0,1fr)_120px] gap-3 border-b px-3 py-2.5 text-xs last:border-b-0 sm:grid-cols-[minmax(0,1fr)_150px_130px]">
                  <div className="min-w-0">
                    <p className="truncate font-medium" title={item.url}>{compactUrl(item.url)}</p>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground" title={item.coverageState ?? undefined}>{item.coverageState ?? "Sem cobertura informada"}</p>
                  </div>
                  <div className="self-center font-medium">{labelFor(item.status)}</div>
                  <div className="hidden self-center text-[11px] text-muted-foreground sm:block">{formatDateTime(item.lastCrawlTime)}</div>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-muted-foreground">Atualizado {formatDateTime(data.checkedAt)}{data.cached ? " · cache protegido" : " · leitura nova do Google"}. O cache dura até 4 horas para preservar a cota da URL Inspection API.</p>
          </>
        ) : (
          <p className="py-3 text-sm text-muted-foreground">A conexão está ativa, mas ainda não há leitura de indexação disponível.</p>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </section>
  );
}
