import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Library, X } from "lucide-react";
import { MediaAssetPicker, mediaAssetUrl, type MediaPickerAsset } from "./MediaAssetPicker";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const STORAGE_KEY = "vendorai_content_studio_media_assets_v1";

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
      ? parsed.filter((asset) => asset?.id && asset.type === "image" && asset.storageUrl).slice(0, 8)
      : [];
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return [];
  }
}

export function MediaContentStudioBridge() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [assets, setAssets] = useState<MediaPickerAsset[]>(readStoredAssets);
  const assetsRef = useRef<MediaPickerAsset[]>(assets);
  const tenantId = currentTenantId();
  const onContentStudio = pathname === "/content-studio";

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
        const isProductVideo = /^\/api\/tenants\/[^/]+\/content-studio\/product-video\/?$/.test(url.pathname);

        if (selected.length && method === "POST" && isProductVideo && init.body instanceof FormData) {
          const form = new FormData();
          init.body.forEach((value, key) => form.append(key, value));
          form.set("imageAssetIds", JSON.stringify(selected.map((asset) => asset.id)));

          const response = await previousFetch(input, { ...init, body: form });
          if (response.ok) window.setTimeout(() => setAssets([]), 0);
          return response;
        }
      } catch {
        // Requests não compatíveis seguem sem alteração.
      }
      return previousFetch(input, init);
    };

    window.fetch = mediaAwareFetch;
    return () => {
      if (window.fetch === mediaAwareFetch) window.fetch = previousFetch;
    };
  }, []);

  if (!onContentStudio || !tenantId) return null;

  return (
    <>
      <div className="fixed bottom-5 right-5 z-[80] w-[min(390px,calc(100vw-2rem))] rounded-2xl border border-white/10 bg-[#171126]/95 p-3 text-[#e8e4f8] shadow-xl backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/5">
            {assets[0] ? (
              <img src={mediaAssetUrl(assets[0].storageUrl)} alt={assets[0].originalFilename || "Foto selecionada"} className="h-full w-full object-cover" />
            ) : (
              <Library className="h-5 w-5 text-gray-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">Fotos do vídeo de produto</p>
            <p className="mt-0.5 text-xs text-gray-400">
              {assets.length ? `${assets.length} foto(s) da Biblioteca serão usadas no próximo storyboard` : "Escolha fotos já existentes na Central de Mídias"}
            </p>
          </div>
          {assets.length > 0 && (
            <button type="button" onClick={() => setAssets([])} className="rounded-lg p-1.5 text-gray-400 hover:bg-white/10" title="Limpar fotos da Biblioteca">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {assets.length > 1 && (
          <div className="mt-3 flex gap-1.5 overflow-hidden">
            {assets.slice(0, 8).map((asset) => (
              <img key={asset.id} src={mediaAssetUrl(asset.storageUrl)} alt="" className="h-9 w-9 rounded-lg border border-white/10 object-cover" />
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 text-xs font-medium hover:bg-white/10"
        >
          <ImageIcon className="h-4 w-4" />
          {assets.length ? "Alterar fotos da Biblioteca" : "Escolher da Biblioteca"}
        </button>
        <p className="mt-2 text-[10px] leading-relaxed text-gray-500">
          Pode combinar com o upload atual. O VendorAI usa no máximo 8 fotos no total e valida isso no servidor.
        </p>
      </div>

      <MediaAssetPicker
        tenantId={tenantId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allowedTypes={["image"]}
        maxSelection={8}
        title="Escolher fotos para o vídeo de produto"
        confirmLabel="Usar no Content Studio"
        onConfirm={setAssets}
      />
    </>
  );
}
