import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Library, Palette, X } from "lucide-react";
import { MediaAssetPicker, mediaAssetUrl, type MediaPickerAsset } from "./MediaAssetPicker";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const STORAGE_KEY = "vendorai_marketing_media_assets_v1";

type CachedUser = { tenantId?: string | null };
type CachedOverride = { id?: string | null };
type UsageMode = "post_material" | "style_reference";
type StoredSelection = { assets: MediaPickerAsset[]; mode: UsageMode };

function currentTenantId(): string {
  try {
    const overrideRaw = localStorage.getItem(OVERRIDE_KEY);
    if (overrideRaw) {
      const override = JSON.parse(overrideRaw) as CachedOverride;
      if (override?.id) return override.id;
    }
  } catch {
    // Ignora cache inválido e tenta o usuário normal.
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

function readStoredSelection(): StoredSelection {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return { assets: [], mode: "post_material" };
    const parsed = JSON.parse(raw) as Partial<StoredSelection>;
    const assets = Array.isArray(parsed.assets)
      ? parsed.assets.filter((asset): asset is MediaPickerAsset => !!asset?.id && asset.type === "image" && !!asset.storageUrl).slice(0, 10)
      : [];
    const mode = parsed.mode === "style_reference" ? "style_reference" : "post_material";
    return { assets, mode };
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return { assets: [], mode: "post_material" };
  }
}

function mergeUnique(current: unknown, selected: MediaPickerAsset[]): string[] {
  const existing = Array.isArray(current) ? current.filter((value): value is string => typeof value === "string" && value.length > 0) : [];
  const urls = selected.map((asset) => mediaAssetUrl(asset.storageUrl));
  return Array.from(new Set([...existing, ...urls])).slice(0, 10);
}

export function MediaMarketingContentBridge() {
  const initial = readStoredSelection();
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [assets, setAssets] = useState<MediaPickerAsset[]>(initial.assets);
  const [mode, setMode] = useState<UsageMode>(initial.mode);
  const assetsRef = useRef(assets);
  const modeRef = useRef(mode);
  const tenantId = currentTenantId();
  const onContent = pathname === "/content" || pathname.startsWith("/content/");

  useEffect(() => {
    assetsRef.current = assets;
    modeRef.current = mode;
    if (assets.length > 0) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ assets, mode }));
    else sessionStorage.removeItem(STORAGE_KEY);
  }, [assets, mode]);

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
    if (!onContent) setMobilePanelOpen(false);
  }, [onContent]);

  useEffect(() => {
    const previousFetch = window.fetch.bind(window);

    const mediaAwareFetch: typeof window.fetch = async (input, init = {}) => {
      try {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(requestUrl, window.location.origin);
        const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        const selected = assetsRef.current;
        const isGenerate = /^\/api\/tenants\/[^/]+\/content\/generate\/?$/.test(url.pathname);

        if (selected.length > 0 && method === "POST" && isGenerate && typeof init.body === "string") {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          if (modeRef.current === "style_reference") {
            body["imageUrls"] = mergeUnique(body["imageUrls"], selected);
          } else {
            body["postMaterialUrls"] = mergeUnique(body["postMaterialUrls"], selected);
          }

          const response = await previousFetch(input, { ...init, body: JSON.stringify(body) });
          if (response.ok) window.setTimeout(() => setAssets([]), 0);
          return response;
        }
      } catch {
        // Em qualquer request não compatível, mantém o comportamento original.
      }
      return previousFetch(input, init);
    };

    window.fetch = mediaAwareFetch;
    return () => {
      if (window.fetch === mediaAwareFetch) window.fetch = previousFetch;
    };
  }, []);

  if (!onContent || !tenantId) return null;

  const openPicker = () => {
    setMobilePanelOpen(false);
    setPickerOpen(true);
  };

  const renderPanelContent = (mobile = false) => (
    <>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
          {assets[0] ? (
            <img src={mediaAssetUrl(assets[0].storageUrl)} alt={assets[0].originalFilename || "Mídia escolhida"} className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold">Mídias do conteúdo</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {assets.length > 0 ? `${assets.length} imagem(ns) escolhida(s) da Central de Mídias` : "Reutilize imagens já aprovadas antes de gerar o conteúdo"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {assets.length > 0 && (
            <button type="button" onClick={() => setAssets([])} className="rounded-lg px-2 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground" title="Limpar seleção">
              Limpar
            </button>
          )}
          {mobile && (
            <button type="button" onClick={() => setMobilePanelOpen(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Fechar mídias do conteúdo">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => setMode("post_material")}
          className={`rounded-lg px-2 py-2 text-[11px] font-medium transition-colors ${mode === "post_material" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          Material do post
        </button>
        <button
          type="button"
          onClick={() => setMode("style_reference")}
          className={`flex items-center justify-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium transition-colors ${mode === "style_reference" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
        >
          <Palette className="h-3 w-3" /> Referência visual
        </button>
      </div>

      <button
        type="button"
        onClick={openPicker}
        className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border bg-background text-xs font-medium hover:bg-muted"
      >
        <Library className="h-4 w-4" />
        {assets.length > 0 ? "Trocar seleção da Biblioteca" : "Escolher da Biblioteca"}
      </button>
      <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
        “Material do post” entra na peça final. “Referência visual” orienta a geração. Upload e geração por IA existentes continuam disponíveis normalmente.
      </p>
    </>
  );

  return (
    <>
      {/* Desktop: mantém o painel auxiliar flutuante. */}
      <div className="fixed bottom-5 right-5 z-[80] hidden w-[min(380px,calc(100vw-2rem))] rounded-2xl border bg-background/95 p-3 shadow-xl backdrop-blur md:block">
        {renderPanelContent()}
      </div>

      {/* Mobile: o painel grande não fica mais aberto por cima do formulário. */}
      <button
        type="button"
        onClick={() => setMobilePanelOpen(true)}
        className="fixed bottom-4 left-4 z-[70] inline-flex h-11 items-center gap-2 rounded-full border bg-background/95 px-4 text-xs font-semibold shadow-lg backdrop-blur md:hidden"
        aria-label="Abrir mídias do conteúdo"
      >
        <Library className="h-4 w-4" />
        Mídias
        {assets.length > 0 && (
          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
            {assets.length}
          </span>
        )}
      </button>

      {mobilePanelOpen && (
        <div className="fixed inset-0 z-[90] md:hidden" role="dialog" aria-modal="true" aria-label="Mídias do conteúdo">
          <button
            type="button"
            className="absolute inset-0 bg-black/35"
            onClick={() => setMobilePanelOpen(false)}
            aria-label="Fechar mídias do conteúdo"
          />
          <div className="absolute inset-x-3 bottom-3 max-h-[min(78dvh,560px)] overflow-y-auto rounded-2xl border bg-background p-4 shadow-2xl">
            {renderPanelContent(true)}
          </div>
        </div>
      )}

      <MediaAssetPicker
        tenantId={tenantId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allowedTypes={["image"]}
        maxSelection={10}
        title="Escolher imagens para o conteúdo"
        confirmLabel="Usar no Marketing"
        onConfirm={setAssets}
      />
    </>
  );
}
