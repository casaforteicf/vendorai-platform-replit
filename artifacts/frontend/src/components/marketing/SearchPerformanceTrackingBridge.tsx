import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BarChart3, CheckCircle2, Eye, Link2, Loader2, MousePointerClick, RefreshCw, Search, Target, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const MOUNT_ID = "vendorai-search-performance-tracking";
const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";

type ConnectionStatus = {
  connected: boolean;
  verified?: boolean;
  siteUrl?: string | null;
  sitemapSubmittedAt?: string | null;
};

type Metric = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

type InsightData = {
  generatedAt: string;
  period: { days: number; startDate: string; endDate: string };
  summary: Metric;
  comparison: {
    clicksPct: number | null;
    impressionsPct: number | null;
    ctrPoints: number;
    positionImprovement: number;
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

function formatNumber(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(value || 0);
}

function formatPercent(value: number) {
  return `${((value || 0) * 100).toFixed(1).replace(".", ",")}%`;
}

function formatPosition(value: number) {
  return value ? value.toFixed(1).replace(".", ",") : "—";
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function delta(value: number | null, suffix = "%") {
  if (value === null) return "novo período";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1).replace(".", ",")}${suffix}`;
}

function isTrackingRoute() {
  if (window.location.pathname !== "/content") return false;
  const params = new URLSearchParams(window.location.search);
  const requestedTab = params.get("tab") ?? "visao-geral";
  return requestedTab === "rastreamento" || (requestedTab === "campanhas" && params.get("view") === "visitantes");
}

function findTrackingHeader(): HTMLElement | null {
  if (!isTrackingRoute()) return null;
  const headings = Array.from(document.querySelectorAll("h1"));
  const h1 = headings.find((node) => node.textContent?.replace(/\s+/g, " ").trim() === "Marketing") as HTMLElement | undefined;
  return h1?.parentElement ?? null;
}

function ensureMount(): HTMLElement | null {
  const existing = document.getElementById(MOUNT_ID);
  const header = findTrackingHeader();
  if (!header?.parentElement) {
    existing?.remove();
    return null;
  }
  if (existing) return existing;
  const mount = document.createElement("div");
  mount.id = MOUNT_ID;
  mount.dataset.vendoraiSearchPerformance = "true";
  header.insertAdjacentElement("afterend", mount);
  return mount;
}

async function fetchConnectionStatus(tenantId: string): Promise<ConnectionStatus> {
  const response = await fetch(`/api/tenants/${tenantId}/search-console-connection`, { headers: authHeaders() });
  if (!response.ok) throw new Error("Não foi possível consultar a conexão com o Google Search Console.");
  return response.json() as Promise<ConnectionStatus>;
}

async function requestSitemapSync(tenantId: string) {
  const response = await fetch(`/api/tenants/${tenantId}/search-console-connection/verify`, {
    method: "POST",
    headers: authHeaders(),
  });
  const result = await response.json().catch(() => ({})) as { verified?: boolean; error?: string; message?: string };

  if (!response.ok) {
    if (result.error === "SEARCH_CONSOLE_API_DISABLED") {
      throw new Error("A API do Google Search Console está desativada no projeto Google Cloud conectado. Ative a API e tente novamente.");
    }
    if (response.status >= 500) {
      throw new Error("O Google Search Console não concluiu a validação. Se o erro persistir, confirme se a Search Console API está ativada no projeto Google Cloud conectado e tente novamente.");
    }
    throw new Error(result.message || "Não foi possível verificar a propriedade e enviar o sitemap ao Google agora.");
  }

  if (!result.verified) throw new Error("O Google ainda não confirmou a propriedade. Tente novamente em alguns instantes.");
}

function PerformanceCard() {
  const [tenantId, setTenantId] = useState(() => currentTenantId());
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [data, setData] = useState<InsightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (resolvedTenantId = tenantId, autoRepairSitemap = true) => {
    if (!resolvedTenantId) {
      setLoading(false);
      setError("Não foi possível identificar o tenant atual.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      let status = await fetchConnectionStatus(resolvedTenantId);

      if (autoRepairSitemap && status.connected && (!status.verified || !status.sitemapSubmittedAt)) {
        try {
          await requestSitemapSync(resolvedTenantId);
          status = await fetchConnectionStatus(resolvedTenantId);
        } catch (repairError) {
          setError(repairError instanceof Error ? repairError.message : "Verificação ou sitemap pendente no Google.");
        }
      }

      setConnection(status);
      if (!status.connected || !status.verified) {
        setData(null);
        return;
      }
      const insightsResponse = await fetch(`/api/tenants/${resolvedTenantId}/search-console-insights?days=28`, { headers: authHeaders() });
      if (!insightsResponse.ok) throw new Error("Não foi possível carregar a performance orgânica agora.");
      setData(await insightsResponse.json() as InsightData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao carregar performance orgânica.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    const resolved = currentTenantId();
    setTenantId(resolved);
    void load(resolved);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const connect = async () => {
    setActionLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/auth/search-console?returnTo=${encodeURIComponent("/content?tab=rastreamento")}`, { headers: authHeaders() });
      if (!response.ok) throw new Error("Não foi possível iniciar a conexão com o Google.");
      const result = await response.json() as { url?: string };
      if (!result.url) throw new Error("O Google não retornou a autorização.");
      window.location.assign(result.url);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao conectar Google Search Console.");
      setActionLoading(false);
    }
  };

  const verify = async () => {
    if (!tenantId) return;
    setActionLoading(true);
    setError(null);
    try {
      await requestSitemapSync(tenantId);
      await load(tenantId, false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Falha ao validar Search Console.");
    } finally {
      setActionLoading(false);
    }
  };

  const summary = data?.summary;
  const comparison = data?.comparison;

  return (
    <section className="rounded-xl border bg-card shadow-sm" aria-label="Performance orgânica dos últimos 28 dias">
      <div className="flex flex-col gap-3 border-b px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold"><BarChart3 className="h-4 w-4 text-primary" />Performance · últimos 28 dias</div>
          <p className="mt-1 text-xs text-muted-foreground">
            Google Search Console · API{data?.period.endDate ? ` · dados até ${formatDate(data.period.endDate)}` : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading || actionLoading}>
          <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Atualizar
        </Button>
      </div>

      <div className="p-4">
        {loading && !connection ? (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando performance orgânica…</div>
        ) : !connection?.connected ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium">Conecte o Google Search Console deste tenant.</p>
              <p className="mt-1 text-xs text-muted-foreground">Depois de autorizado, o VendorAI traz cliques, impressões, CTR e posição média para o Rastreamento.</p>
            </div>
            <Button onClick={connect} disabled={actionLoading}><Link2 className="mr-2 h-4 w-4" />Conectar Google</Button>
          </div>
        ) : !connection.verified ? (
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-medium">Google conectado. Falta validar a propriedade.</p>
              <p className="mt-1 text-xs text-muted-foreground">O VendorAI tenta validar automaticamente; ao confirmar, também envia o sitemap da propriedade.</p>
            </div>
            <Button onClick={verify} disabled={actionLoading}>{actionLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Verificar e enviar sitemap</Button>
          </div>
        ) : summary && comparison ? (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><MousePointerClick className="h-3.5 w-3.5" />Cliques</div><p className="mt-1 text-xl font-semibold">{formatNumber(summary.clicks)}</p><p className="mt-1 text-[11px] text-muted-foreground">{delta(comparison.clicksPct)} vs. período anterior</p></div>
            <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Eye className="h-3.5 w-3.5" />Impressões</div><p className="mt-1 text-xl font-semibold">{formatNumber(summary.impressions)}</p><p className="mt-1 text-[11px] text-muted-foreground">{delta(comparison.impressionsPct)} vs. período anterior</p></div>
            <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Target className="h-3.5 w-3.5" />CTR</div><p className="mt-1 text-xl font-semibold">{formatPercent(summary.ctr)}</p><p className="mt-1 text-[11px] text-muted-foreground">{delta(comparison.ctrPoints, " p.p.")}</p></div>
            <div className="rounded-lg border p-3"><div className="flex items-center gap-2 text-xs text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" />Posição média</div><p className="mt-1 text-xl font-semibold">{formatPosition(summary.position)}</p><p className="mt-1 text-[11px] text-muted-foreground">{comparison.positionImprovement > 0 ? "+" : ""}{comparison.positionImprovement.toFixed(1).replace(".", ",")} posições</p></div>
          </div>
        ) : (
          <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Search className="h-4 w-4" />Ainda não há dados orgânicos para este período.</div>
        )}

        {connection?.verified && connection.sitemapSubmittedAt && (
          <p className="mt-3 text-[11px] text-muted-foreground">Sitemap confirmado no fluxo do Google · {formatDate(connection.sitemapSubmittedAt)}</p>
        )}

        {connection?.verified && !connection.sitemapSubmittedAt && (
          <div className="mt-3 flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-medium">Sitemap ainda não confirmado.</p>
              <p className="mt-1 text-[11px] text-muted-foreground">O VendorAI tenta corrigir isso automaticamente. Se continuar pendente, use o reenvio manual.</p>
            </div>
            <Button size="sm" variant="outline" onClick={verify} disabled={actionLoading || loading}>
              {actionLoading ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
              Reenviar sitemap
            </Button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </div>
    </section>
  );
}

export function SearchPerformanceTrackingBridge() {
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setMount(ensureMount()));
    };
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", sync);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("popstate", sync);
      document.getElementById(MOUNT_ID)?.remove();
    };
  }, []);

  return mount ? createPortal(<PerformanceCard />, mount) : null;
}
