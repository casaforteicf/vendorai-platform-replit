import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Library, Video, X } from "lucide-react";
import { MediaAssetPicker, mediaAssetUrl, type MediaPickerAsset } from "./MediaAssetPicker";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const STORAGE_KEY = "vendorai_sites_media_assets_v1";

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
      ? parsed.filter((asset) => asset?.id && (asset.type === "image" || asset.type === "video") && asset.storageUrl).slice(0, 20)
      : [];
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

function absolutePublicMediaUrl(asset: MediaPickerAsset): string {
  return new URL(mediaAssetUrl(asset.storageUrl), window.location.origin).toString();
}

function mergeUnique(existing: unknown, additions: string[]): string[] {
  const current = Array.isArray(existing) ? existing.map(String).filter(Boolean) : [];
  return [...new Set([...current, ...additions])];
}

export function MediaSitesBridge() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assets, setAssets] = useState<MediaPickerAsset[]>(readStoredAssets);
  const assetsRef = useRef<MediaPickerAsset[]>(assets);
  const tenantId = currentTenantId();
  const onSites = pathname === "/content-autopilot" || pathname.startsWith("/content-autopilot/");

  useEffect(() => {
    assetsRef.current = assets;
    if (assets.length) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(assets));
    else sessionStorage.removeItem(STORAGE_KEY);
  }, [assets]);

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
    const previousFetch = window.fetch.bind(window);

    const mediaAwareFetch: typeof window.fetch = async (input, init = {}) => {
      try {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(requestUrl, window.location.origin);
        const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        const selected = assetsRef.current;
        const isSiteGenerate = /^\/api\/tenants\/[^/]+\/site-generator\/generate\/?$/.test(url.pathname);

        if (selected.length && method === "POST" && isSiteGenerate && typeof init.body === "string") {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          const selectedImages = selected.filter((asset) => asset.type === "image").map(absolutePublicMediaUrl);
          const selectedVideos = selected.filter((asset) => asset.type === "video").map(absolutePublicMediaUrl);
          body["images"] = mergeUnique(body["images"], selectedImages);
          body["videos"] = mergeUnique(body["videos"], selectedVideos);

          const response = await previousFetch(input, { ...init, body: JSON.stringify(body) });
          if (response.ok) window.setTimeout(() => setAssets([]), 0);
          return response;
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
  }, []);

  if (!onSites || !tenantId) return null;

  const imageCount = assets.filter((asset) => asset.type === "image").length;
  const videoCount = assets.filter((asset) => asset.type === "video").length;

  return (
    <>
      <div className="fixed bottom-5 right-5 z-[80] w-[min(380px,calc(100vw-2rem))] rounded-2xl border bg-background/95 p-3 shadow-xl backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
            <Library className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">Mídias para este site</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {assets.length ? `${assets.length} mídia(s) da Biblioteca serão usadas na próxima geração` : "Reutilize fotos e vídeos da Central de Mídias"}
            </p>
          </div>
          {assets.length > 0 && (
            <button type="button" onClick={() => setAssets([])} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" title="Limpar mídias da Biblioteca">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {assets.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
            {imageCount > 0 && <span className="flex items-center gap-1 rounded-full border px-2 py-1"><ImageIcon className="h-3 w-3" />{imageCount} foto(s)</span>}
            {videoCount > 0 && <span className="flex items-center gap-1 rounded-full border px-2 py-1"><Video className="h-3 w-3" />{videoCount} vídeo(s)</span>}
          </div>
        )}

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border bg-background text-xs font-medium hover:bg-muted"
        >
          <Library className="h-4 w-4" />
          {assets.length ? "Alterar mídias da Biblioteca" : "Escolher da Biblioteca"}
        </button>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          As mídias escolhidas são adicionadas às fotos e vídeos já anexados no Gerador de Sites, sem duplicar upload.
        </p>
      </div>

      <MediaAssetPicker
        tenantId={tenantId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allowedTypes={["image", "video"]}
        maxSelection={20}
        title="Escolher mídias para o site"
        confirmLabel="Usar no site"
        onConfirm={(selected) => setAssets(selected)}
      />
    </>
  );
}
