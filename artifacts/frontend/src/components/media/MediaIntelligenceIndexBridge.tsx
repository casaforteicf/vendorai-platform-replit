import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BrainCircuit, CheckCircle2, ChevronDown, ChevronUp, Loader2, RefreshCw, ScanSearch, Sparkles } from "lucide-react";
import {
  analyseMediaAsset,
  existingMediaIntelligence,
  type MediaIntelligenceAsset,
  type MediaIntelligenceIndex,
} from "@/lib/media-intelligence";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const AUTO_INDEX_KEY = "vendorai_media_intelligence_auto_index_v1";

type CachedUser = { tenantId?: string | null };
type CachedOverride = { id?: string | null };

type LibraryAsset = MediaIntelligenceAsset & {
  originalFilename?: string | null;
  source?: string | null;
  metadata?: Record<string, unknown> | null;
};

function currentTenantId(): string {
  try {
    const overrideRaw = localStorage.getItem(OVERRIDE_KEY);
    if (overrideRaw) {
      const override = JSON.parse(overrideRaw) as CachedOverride;
      if (override?.id) return override.id;
    }
  } catch {
    // Ignora override inválido.
  }
  try {
    const userRaw = localStorage.getItem(USER_CACHE_KEY);
    if (!userRaw) return "";
    const user = JSON.parse(userRaw) as CachedUser;
    return user?.tenantId ?? "";
  } catch {
    return "";
  }
}

function authHeaders(json = false): Record<string, string> {
  return {
    Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function isVisualAsset(asset: LibraryAsset) {
  return asset.type === "image" || asset.type === "video";
}

function ensureHost(): HTMLElement | null {
  if (window.location.pathname !== "/midias") return null;
  const main = document.querySelector<HTMLElement>("main");
  if (!main) return null;
  let host = main.querySelector<HTMLElement>("[data-media-intelligence-index-host]");
  if (host) return host;
  host = document.createElement("div");
  host.dataset.mediaIntelligenceIndexHost = "true";
  host.className = "mt-6";
  // O índice é apoio da biblioteca, não a primeira etapa da tela.
  main.append(host);
  return host;
}

function indexLabel(index: MediaIntelligenceIndex | null) {
  if (!index) return "Pendente";
  if (index.status === "limited") return "Indexação limitada";
  return `Qualidade ${index.quality.score}/100`;
}

function zoneLabel(value: string) {
  if (value === "left") return "esquerda";
  if (value === "right") return "direita";
  if (value === "top") return "topo";
  if (value === "bottom") return "base";
  return "centro";
}

export function MediaIntelligenceIndexBridge() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [tenantId, setTenantId] = useState(() => currentTenantId());
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [assets, setAssets] = useState<LibraryAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [currentAssetId, setCurrentAssetId] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [lastError, setLastError] = useState<string | null>(null);
  const [autoIndex, setAutoIndex] = useState(() => localStorage.getItem(AUTO_INDEX_KEY) !== "off");
  const [expanded, setExpanded] = useState(false);
  const failedSessionIds = useRef(new Set<string>());
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    const sync = () => {
      setPathname(window.location.pathname);
      const next = currentTenantId();
      if (next) setTenantId(next);
      setHost(ensureHost());
    };
    sync();
    window.addEventListener("popstate", sync);
    const observer = new MutationObserver(() => setHost(ensureHost()));
    observer.observe(document.body, { childList: true, subtree: true });
    const timer = window.setInterval(sync, 1200);
    return () => {
      mounted.current = false;
      window.removeEventListener("popstate", sync);
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, []);

  const loadAssets = async () => {
    if (!tenantId || pathname !== "/midias") return;
    setLoading(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/assets?limit=150`, {
        headers: authHeaders(),
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({})) as { assets?: LibraryAsset[]; error?: string };
      if (!response.ok) throw new Error(body.error || "Não foi possível ler a Biblioteca de Mídias.");
      if (mounted.current) {
        setAssets(Array.isArray(body.assets) ? body.assets : []);
        setLastError(null);
      }
    } catch (error) {
      if (mounted.current) setLastError(error instanceof Error ? error.message : "Falha ao carregar mídias.");
    } finally {
      if (mounted.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (pathname !== "/midias" || !tenantId) {
      setAssets([]);
      return;
    }
    void loadAssets();
    const refresh = () => void loadAssets();
    window.addEventListener("vendorai-media-library-changed", refresh);
    const timer = window.setInterval(refresh, 7000);
    return () => {
      window.removeEventListener("vendorai-media-library-changed", refresh);
      window.clearInterval(timer);
    };
  }, [pathname, tenantId]);

  const visualAssets = useMemo(() => assets.filter(isVisualAsset), [assets]);
  const indexedAssets = useMemo(
    () => visualAssets.filter((asset) => Boolean(existingMediaIntelligence(asset.metadata))),
    [visualAssets],
  );
  const limitedAssets = useMemo(
    () => indexedAssets.filter((asset) => existingMediaIntelligence(asset.metadata)?.status === "limited"),
    [indexedAssets],
  );
  const pendingAssets = useMemo(
    () => visualAssets.filter((asset) => !existingMediaIntelligence(asset.metadata) && !failedSessionIds.current.has(asset.id)),
    [visualAssets],
  );
  const highQualityAssets = useMemo(
    () => indexedAssets.filter((asset) => (existingMediaIntelligence(asset.metadata)?.quality.score ?? 0) >= 88),
    [indexedAssets],
  );

  async function persistIndex(asset: LibraryAsset, index: MediaIntelligenceIndex) {
    const existing = asset.metadata ?? {};
    const primary = index.subjects.primary;
    const metadata: Record<string, unknown> = {
      mediaIntelligence: index,
      mediaIntelligenceSearch: index.searchTags.join(" "),
    };
    if (!Array.isArray(existing.subjects) && index.subjects.boxes.length) metadata.subjects = index.subjects.boxes;
    if (!existing.focalBox && primary) metadata.focalBox = primary;

    const response = await fetch(`/api/tenants/${tenantId}/media/assets/${asset.id}`, {
      method: "PATCH",
      headers: authHeaders(true),
      body: JSON.stringify({ metadata }),
    });
    const body = await response.json().catch(() => ({})) as { asset?: LibraryAsset; error?: string };
    if (!response.ok) throw new Error(body.error || "Não foi possível salvar o índice desta mídia.");
    if (body.asset && mounted.current) {
      setAssets((current) => current.map((item) => item.id === asset.id ? body.asset! : item));
    }
  }

  async function indexAssets(queue: LibraryAsset[]) {
    if (!tenantId || running || queue.length === 0) return;
    setRunning(true);
    setProgress({ done: 0, total: queue.length });
    setLastError(null);
    let done = 0;
    try {
      for (const asset of queue) {
        if (!mounted.current) break;
        setCurrentAssetId(asset.id);
        try {
          const index = await analyseMediaAsset(asset);
          await persistIndex(asset, index);
        } catch (error) {
          failedSessionIds.current.add(asset.id);
          setLastError(error instanceof Error ? error.message : "Falha ao indexar uma mídia.");
        }
        done += 1;
        if (mounted.current) setProgress({ done, total: queue.length });
        await new Promise((resolve) => window.setTimeout(resolve, 120));
      }
    } finally {
      if (mounted.current) {
        setCurrentAssetId(null);
        setRunning(false);
      }
      window.dispatchEvent(new CustomEvent("vendorai-media-library-changed"));
    }
  }

  useEffect(() => {
    if (!autoIndex || running || pathname !== "/midias" || pendingAssets.length === 0) return;
    const timer = window.setTimeout(() => {
      void indexAssets(pendingAssets.slice(0, 4));
    }, 850);
    return () => window.clearTimeout(timer);
  }, [autoIndex, running, pathname, pendingAssets.map((asset) => asset.id).join("|")]);

  function toggleAutoIndex() {
    setAutoIndex((current) => {
      const next = !current;
      localStorage.setItem(AUTO_INDEX_KEY, next ? "on" : "off");
      return next;
    });
  }

  async function reindexAll() {
    if (running) return;
    failedSessionIds.current.clear();
    await indexAssets(visualAssets);
  }

  const newestIndexed = useMemo(() => {
    return indexedAssets
      .map((asset) => ({ asset, index: existingMediaIntelligence(asset.metadata) }))
      .filter((entry): entry is { asset: LibraryAsset; index: MediaIntelligenceIndex } => Boolean(entry.index))
      .sort((a, b) => b.index.analyzedAt.localeCompare(a.index.analyzedAt))
      .slice(0, 3);
  }, [indexedAssets]);

  if (pathname !== "/midias" || !host) return null;

  return createPortal(
    <section className="overflow-hidden rounded-2xl border border-violet-500/20 bg-background shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        aria-expanded={expanded}
      >
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Inteligência da Biblioteca</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {indexedAssets.length}/{visualAssets.length} mídias indexadas · {Math.max(0, visualAssets.length - indexedAssets.length)} pendentes
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {autoIndex && <span className="hidden rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-700 sm:inline dark:text-emerald-300">Automática</span>}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {running && progress.total > 0 && (
        <div className="border-t px-4 py-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="flex min-w-0 items-center gap-2 text-foreground">
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-violet-500" />
              <span className="truncate">Analisando {assets.find((asset) => asset.id === currentAssetId)?.originalFilename || "mídia"}</span>
            </span>
            <span className="shrink-0 font-semibold text-violet-600 dark:text-violet-300">{progress.done}/{progress.total}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-violet-500 transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {expanded && (
        <div className="space-y-4 border-t p-4">
          <div>
            <div className="flex items-center gap-2 text-violet-600 dark:text-violet-300">
              <BrainCircuit className="h-4 w-4" />
              <span className="text-xs font-semibold uppercase tracking-[0.14em]">Media Intelligence Index</span>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-relaxed text-muted-foreground">
              A IA analisa foco, áreas livres, orientação, paleta e qualidade para reutilizar cada mídia com mais consistência em campanhas, layouts e produção.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleAutoIndex}
              className={`inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-medium ${autoIndex ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "border-border bg-background text-muted-foreground"}`}
            >
              {autoIndex ? <CheckCircle2 className="h-3.5 w-3.5" /> : <ScanSearch className="h-3.5 w-3.5" />}
              Indexação {autoIndex ? "automática" : "pausada"}
            </button>
            <button
              type="button"
              disabled={running || pendingAssets.length === 0}
              onClick={() => void indexAssets(pendingAssets)}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Indexar pendentes
            </button>
            <button
              type="button"
              disabled={running || visualAssets.length === 0}
              onClick={() => void reindexAll()}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${running ? "animate-spin" : ""}`} />
              Reindexar
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
            {[
              ["Visuais", visualAssets.length],
              ["Indexadas", indexedAssets.length],
              ["Pendentes", Math.max(0, visualAssets.length - indexedAssets.length)],
              ["Alta qualidade", highQualityAssets.length],
              ["Limitadas", limitedAssets.length],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl border border-border/70 bg-muted/20 px-3 py-2.5">
                <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-lg font-semibold text-foreground">{value}</p>
              </div>
            ))}
          </div>

          {lastError && (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">{lastError}</p>
          )}

          {newestIndexed.length > 0 && (
            <div className="grid gap-2 lg:grid-cols-3">
              {newestIndexed.map(({ asset, index }) => (
                <div key={asset.id} className="rounded-xl border border-border/70 bg-muted/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-xs font-semibold text-foreground">{asset.originalFilename || `Mídia ${asset.id.slice(0, 8)}`}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${index.status === "ready" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>{indexLabel(index)}</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    {index.dimensions.orientation} · espaço livre {zoneLabel(index.composition.whitespaceSide)} · foco {zoneLabel(index.composition.subjectSide)}
                    {index.subjects.labels.length ? ` · ${index.subjects.labels.slice(0, 3).join(", ")}` : ""}
                  </p>
                  {index.palette.dominant.length > 0 && (
                    <div className="mt-2 flex gap-1.5" aria-label="Paleta dominante">
                      {index.palette.dominant.slice(0, 5).map((color) => <span key={color} title={color} className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: color }} />)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {loading && assets.length === 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lendo índice da Biblioteca...</div>
          )}
        </div>
      )}
    </section>,
    host,
  );
}
