import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronDown, Image as ImageIcon, Library, SlidersHorizontal, Video, X } from "lucide-react";
import { MediaAssetPicker, mediaAssetUrl, type MediaPickerAsset } from "./MediaAssetPicker";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const STORAGE_KEY = "vendorai_sites_media_assets_v1";
const MODE_KEY = "vendorai_sites_media_mode_v2";

type CachedUser = { tenantId?: string | null };
type CachedOverride = { id?: string | null };

function currentTenantId(): string {
  try {
    const overrideRaw = localStorage.getItem(OVERRIDE_KEY);
    if (overrideRaw) {
      const override = JSON.parse(overrideRaw) as CachedOverride;
      if (override?.id) return override.id;
    }
  } catch {
    // Ignora cache inválido e tenta a sessão normal.
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

function readStoredAssets(): MediaPickerAsset[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MediaPickerAsset[];
    return Array.isArray(parsed)
      ? parsed.filter((asset) => asset?.id && (asset.type === "image" || asset.type === "video") && asset.storageUrl).slice(0, 150)
      : [];
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

function readAutoMode(): boolean {
  try {
    return localStorage.getItem(MODE_KEY) !== "manual";
  } catch {
    return true;
  }
}

function absolutePublicMediaUrl(asset: MediaPickerAsset): string {
  return new URL(mediaAssetUrl(asset.storageUrl), window.location.origin).toString();
}

function mergeUnique(existing: unknown, additions: string[]): string[] {
  const current = Array.isArray(existing) ? existing.map(String).filter(Boolean) : [];
  return [...new Set([...current, ...additions])];
}

function normalizeText(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function contextTokens(body: Record<string, unknown>): string[] {
  const stop = new Set(["para", "como", "com", "uma", "das", "dos", "por", "que", "seu", "sua", "site", "pagina", "landing", "http", "https", "www"]);
  const contextOnly = Object.fromEntries(Object.entries(body).filter(([key]) => key !== "images" && key !== "videos"));
  let serialized = "";
  try { serialized = JSON.stringify(contextOnly); } catch { serialized = ""; }
  return Array.from(new Set(
    normalizeText(serialized)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 4 && !stop.has(word)),
  )).slice(0, 80);
}

function assetIsBlocked(asset: MediaPickerAsset): boolean {
  return asset.metadata?.aiUsage === "blocked";
}

function selectRelevantAssets(assets: MediaPickerAsset[], body: Record<string, unknown>): MediaPickerAsset[] {
  const eligible = assets.filter((asset) => !assetIsBlocked(asset) && (asset.type === "image" || asset.type === "video"));
  const tokens = contextTokens(body);
  const ranked = eligible
    .map((asset, index) => {
      let metadata = "";
      try { metadata = JSON.stringify(asset.metadata ?? {}); } catch { metadata = ""; }
      const haystack = normalizeText(`${asset.originalFilename ?? ""} ${asset.role ?? ""} ${asset.source ?? ""} ${metadata}`);
      const score = tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 2 : 0), 0);
      return { asset, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const images = ranked.filter((entry) => entry.asset.type === "image").slice(0, 12).map((entry) => entry.asset);
  const videos = ranked.filter((entry) => entry.asset.type === "video").slice(0, 3).map((entry) => entry.asset);
  return [...images, ...videos];
}

function goToMediaLibrary() {
  window.history.pushState(window.history.state, "", "/midias");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function MediaSitesBridge() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [manualAssets, setManualAssets] = useState<MediaPickerAsset[]>(readStoredAssets);
  const [libraryAssets, setLibraryAssets] = useState<MediaPickerAsset[]>([]);
  const [autoMode, setAutoMode] = useState(readAutoMode);
  const [loadingLibrary, setLoadingLibrary] = useState(false);
  const [expanded, setExpanded] = useState(() => typeof window !== "undefined" && window.innerWidth > 900);
  const manualAssetsRef = useRef<MediaPickerAsset[]>(manualAssets);
  const libraryAssetsRef = useRef<MediaPickerAsset[]>(libraryAssets);
  const autoModeRef = useRef(autoMode);
  const tenantId = currentTenantId();
  const onSites = pathname === "/content-autopilot" || pathname.startsWith("/content-autopilot/");

  useEffect(() => {
    manualAssetsRef.current = manualAssets;
    if (manualAssets.length) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(manualAssets));
    else sessionStorage.removeItem(STORAGE_KEY);
  }, [manualAssets]);

  useEffect(() => {
    libraryAssetsRef.current = libraryAssets;
  }, [libraryAssets]);

  useEffect(() => {
    autoModeRef.current = autoMode;
    try { localStorage.setItem(MODE_KEY, autoMode ? "auto" : "manual"); } catch {}
  }, [autoMode]);

  useEffect(() => {
    const updatePath = () => setPathname(window.location.pathname);
    window.addEventListener("popstate", updatePath);
    const timer = window.setInterval(updatePath, 400);
    return () => {
      window.removeEventListener("popstate", updatePath);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth > 900) setExpanded(true);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const loadLibrary = useCallback(async () => {
    if (!tenantId || !onSites) return;
    setLoadingLibrary(true);
    try {
      const response = await fetch(`/api/tenants/${tenantId}/media/assets?limit=150`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}` },
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({})) as { assets?: MediaPickerAsset[] };
      if (!response.ok) return;
      const next = Array.isArray(body.assets)
        ? body.assets.filter((asset) => !assetIsBlocked(asset) && (asset.type === "image" || asset.type === "video") && Boolean(asset.storageUrl)).slice(0, 150)
        : [];
      setLibraryAssets(next);
    } finally {
      setLoadingLibrary(false);
    }
  }, [onSites, tenantId]);

  useEffect(() => {
    void loadLibrary();
    if (!onSites) return;
    const refresh = () => void loadLibrary();
    window.addEventListener("vendorai-media-library-changed", refresh);
    return () => window.removeEventListener("vendorai-media-library-changed", refresh);
  }, [loadLibrary, onSites]);

  useEffect(() => {
    const previousFetch = window.fetch.bind(window);
    const mediaAwareFetch: typeof window.fetch = async (input, init = {}) => {
      try {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(requestUrl, window.location.origin);
        const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        const isSiteGenerate = /^\/api\/tenants\/[^/]+\/site-generator\/generate\/?$/.test(url.pathname);
        if (method === "POST" && isSiteGenerate && typeof init.body === "string") {
          let available = autoModeRef.current ? libraryAssetsRef.current : manualAssetsRef.current;
          if (autoModeRef.current && available.length === 0 && tenantId) {
            const mediaResponse = await previousFetch(`/api/tenants/${tenantId}/media/assets?limit=150`, {
              headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}` },
              cache: "no-store",
            });
            const mediaBody = await mediaResponse.json().catch(() => ({})) as { assets?: MediaPickerAsset[] };
            if (mediaResponse.ok && Array.isArray(mediaBody.assets)) {
              available = mediaBody.assets.filter((asset) => !assetIsBlocked(asset) && (asset.type === "image" || asset.type === "video") && Boolean(asset.storageUrl)).slice(0, 150);
              libraryAssetsRef.current = available;
              window.setTimeout(() => setLibraryAssets(available), 0);
            }
          }
          if (available.length > 0) {
            const body = JSON.parse(init.body) as Record<string, unknown>;
            const chosen = autoModeRef.current ? selectRelevantAssets(available, body) : available;
            const selectedImages = chosen.filter((asset) => asset.type === "image").map(absolutePublicMediaUrl);
            const selectedVideos = chosen.filter((asset) => asset.type === "video").map(absolutePublicMediaUrl);
            body["images"] = mergeUnique(body["images"], selectedImages);
            body["videos"] = mergeUnique(body["videos"], selectedVideos);
            return previousFetch(input, { ...init, body: JSON.stringify(body) });
          }
        }
      } catch {
        // Requisições não compatíveis seguem sem alteração.
      }
      return previousFetch(input, init);
    };
    window.fetch = mediaAwareFetch;
    return () => {
      if (window.fetch === mediaAwareFetch) window.fetch = previousFetch;
    };
  }, [tenantId]);

  if (!onSites || !tenantId) return null;

  const effectiveAssets = autoMode ? libraryAssets : manualAssets;
  const imageCount = effectiveAssets.filter((asset) => asset.type === "image").length;
  const videoCount = effectiveAssets.filter((asset) => asset.type === "video").length;

  return (
    <>
      <style>{`
        @media (max-width: 900px) {
          body:has(.vendor-sites-media-bridge) { overflow-x: hidden; }
          body:has(.vendor-sites-media-bridge) .mx-auto.max-w-7xl.space-y-6.p-4 { padding: 16px !important; gap: 16px !important; }
          body:has(.vendor-sites-media-bridge) .mx-auto.max-w-7xl.space-y-6.p-4 > div:first-child { gap: 12px !important; }
          body:has(.vendor-sites-media-bridge) .mx-auto.max-w-7xl.space-y-6.p-4 h1 { font-size: 1.72rem !important; line-height: 1.12 !important; letter-spacing: -.025em; }
          body:has(.vendor-sites-media-bridge) [role="tablist"] { display:flex !important; width:100% !important; overflow-x:auto !important; justify-content:flex-start !important; scrollbar-width:none; padding:4px !important; scroll-padding-inline:12px; }
          body:has(.vendor-sites-media-bridge) [role="tablist"]::-webkit-scrollbar { display:none; }
          body:has(.vendor-sites-media-bridge) [role="tab"] { flex:0 0 auto !important; white-space:nowrap !important; min-height:40px; scroll-margin-inline:12px; }
          body:has(.vendor-sites-media-bridge) .grid.gap-4.sm\\:grid-cols-2.xl\\:grid-cols-4 { display:flex !important; gap:8px !important; overflow-x:auto !important; scrollbar-width:none; }
          body:has(.vendor-sites-media-bridge) .grid.gap-4.sm\\:grid-cols-2.xl\\:grid-cols-4::-webkit-scrollbar { display:none; }
          body:has(.vendor-sites-media-bridge) .grid.gap-4.sm\\:grid-cols-2.xl\\:grid-cols-4 > * { flex:0 0 154px !important; min-width:154px !important; }
          body:has(.vendor-sites-media-bridge) .grid.gap-4.sm\\:grid-cols-2.xl\\:grid-cols-4 [class*="p-5"] { padding:14px !important; }
          body:has(.vendor-sites-media-bridge) .grid.gap-4.sm\\:grid-cols-2.xl\\:grid-cols-4 [class*="text-3xl"] { font-size:1.55rem !important; margin-top:5px !important; }
          body:has(.vendor-sites-media-bridge) .grid.gap-4.lg\\:grid-cols-3 { gap:12px !important; }
          body:has(.vendor-sites-media-bridge) .grid.gap-3.sm\\:grid-cols-2.xl\\:grid-cols-4 { display:grid !important; grid-template-columns:1fr 1fr !important; gap:8px !important; }
          body:has(.vendor-sites-media-bridge) .grid.gap-3.sm\\:grid-cols-2.xl\\:grid-cols-4 > div { padding:12px !important; min-height:0 !important; }
          body:has(.vendor-sites-media-bridge) [data-radix-collection-item] { font-size:13px; }
          body:has(.vendor-sites-media-bridge) [class*="rounded-xl"][class*="border"] { box-shadow:none; }
          body:has(.vendor-sites-media-bridge) .vendor-site-settings-bridge,
          body:has(.vendor-sites-media-bridge) .vendor-site-settings-bridge * { min-width:0 !important; box-sizing:border-box; }
          body:has(.vendor-sites-media-bridge) .vendor-site-settings-bridge input,
          body:has(.vendor-sites-media-bridge) .vendor-site-settings-bridge select,
          body:has(.vendor-sites-media-bridge) .vendor-site-settings-bridge textarea { width:100% !important; max-width:100% !important; }
          body:has(.vendor-sites-media-bridge) .vendor-site-settings-bridge .font-mono { white-space:normal !important; overflow-wrap:anywhere !important; word-break:break-word !important; }
          body:has(.vendor-sites-media-bridge) .vendor-site-settings-bridge .flex.items-center.gap-3 { flex-wrap:wrap !important; }
          body:has(.vendor-sites-media-bridge) { padding-bottom:84px; }
        }
      `}</style>

      {!expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="vendor-sites-media-bridge fixed bottom-5 left-4 z-[80] inline-flex h-12 items-center gap-2 rounded-full border bg-background/95 px-4 text-sm font-semibold shadow-xl backdrop-blur md:left-auto md:right-5 max-[900px]:w-12 max-[900px]:justify-center max-[900px]:px-0"
          aria-label="Abrir mídias para este site"
        >
          <Library className="h-4 w-4" />
          <span className="max-[900px]:hidden">Mídias · {autoMode ? "auto" : effectiveAssets.length}</span>
        </button>
      ) : (
        <div className="vendor-sites-media-bridge fixed bottom-5 right-5 z-[80] w-[min(400px,calc(100vw-2rem))] rounded-2xl border bg-background/95 p-3 shadow-xl backdrop-blur max-[900px]:bottom-4 max-[900px]:left-4 max-[900px]:right-4 max-[900px]:w-auto">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
              <Library className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-semibold">Banco de mídias do site</p>
                {autoMode && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Automático</span>}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {autoMode
                  ? loadingLibrary
                    ? "Carregando a Biblioteca..."
                    : `${effectiveAssets.length} mídia(s) no banco. A IA escolhe automaticamente as mais adequadas para cada site.`
                  : effectiveAssets.length
                    ? `${effectiveAssets.length} mídia(s) escolhidas manualmente para a próxima geração.`
                    : "Selecione fotos e vídeos específicos da Biblioteca."}
              </p>
            </div>
            <button type="button" onClick={() => setExpanded(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted max-[900px]:inline-flex hidden" title="Recolher">
              <ChevronDown className="h-4 w-4" />
            </button>
            {!autoMode && manualAssets.length > 0 && (
              <button type="button" onClick={() => setManualAssets([])} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" title="Limpar seleção manual">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {effectiveAssets.length > 0 && (
            <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
              {imageCount > 0 && <span className="flex items-center gap-1 rounded-full border px-2 py-1"><ImageIcon className="h-3 w-3" />{imageCount} foto(s)</span>}
              {videoCount > 0 && <span className="flex items-center gap-1 rounded-full border px-2 py-1"><Video className="h-3 w-3" />{videoCount} vídeo(s)</span>}
            </div>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setAutoMode((current) => !current)}
              className={`flex h-10 items-center justify-center gap-2 rounded-xl border text-xs font-medium ${autoMode ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-background hover:bg-muted"}`}
            >
              {autoMode ? <CheckCircle2 className="h-4 w-4" /> : <SlidersHorizontal className="h-4 w-4" />}
              {autoMode ? "Automático ativo" : "Seleção manual"}
            </button>
            <button type="button" onClick={goToMediaLibrary} className="flex h-10 items-center justify-center gap-2 rounded-xl border bg-background text-xs font-medium hover:bg-muted">
              <Library className="h-4 w-4" /> Abrir Biblioteca
            </button>
          </div>

          {!autoMode && (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="mt-2 flex h-10 w-full items-center justify-center gap-2 rounded-xl border bg-background text-xs font-medium hover:bg-muted"
            >
              <Library className="h-4 w-4" />
              {manualAssets.length ? "Alterar mídias selecionadas" : "Escolher da Biblioteca"}
            </button>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground max-[900px]:hidden">
            No automático, toda a Biblioteca fica disponível como banco. A IA seleciona as referências relevantes para o briefing; mídias marcadas como bloqueadas continuam fora do uso automático.
          </p>
        </div>
      )}

      <MediaAssetPicker
        tenantId={tenantId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allowedTypes={["image", "video"]}
        maxSelection={150}
        title="Escolher mídias para o site"
        confirmLabel="Usar seleção no site"
        onConfirm={(selected) => setManualAssets(selected)}
      />
    </>
  );
}
