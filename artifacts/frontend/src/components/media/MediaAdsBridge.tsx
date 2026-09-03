import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Library, X } from "lucide-react";
import { MediaAssetPicker, mediaAssetUrl, type MediaPickerAsset } from "./MediaAssetPicker";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const STORAGE_KEY = "vendorai_ads_media_asset_v1";

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

function readStoredAsset(): MediaPickerAsset | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const asset = JSON.parse(raw) as MediaPickerAsset;
    return asset?.id && asset?.type === "image" && asset?.storageUrl ? asset : null;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function absolutePublicMediaUrl(asset: MediaPickerAsset): string {
  return new URL(mediaAssetUrl(asset.storageUrl), window.location.origin).toString();
}

export function MediaAdsBridge() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [asset, setAsset] = useState<MediaPickerAsset | null>(readStoredAsset);
  const assetRef = useRef<MediaPickerAsset | null>(asset);
  const tenantId = currentTenantId();
  const onAds = pathname === "/ads" || pathname.startsWith("/ads/");

  useEffect(() => {
    assetRef.current = asset;
    if (asset) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(asset));
    else sessionStorage.removeItem(STORAGE_KEY);
  }, [asset]);

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
        const selected = assetRef.current;
        const isCampaignCreate = /^\/api\/tenants\/[^/]+\/ads\/campaigns\/?$/.test(url.pathname);

        if (selected && method === "POST" && isCampaignCreate && typeof init.body === "string") {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          if (body["tipoAnuncio"] === "imagem") {
            body["imagemEscolhidaUrl"] = absolutePublicMediaUrl(selected);
            body["segmentacao"] = {
              ...((body["segmentacao"] && typeof body["segmentacao"] === "object" && !Array.isArray(body["segmentacao"])) ? body["segmentacao"] as Record<string, unknown> : {}),
              mediaSource: {
                assetId: selected.id,
                source: "media_library",
                originalFilename: selected.originalFilename ?? null,
              },
            };
            const response = await previousFetch(input, { ...init, body: JSON.stringify(body) });
            if (response.ok) {
              window.setTimeout(() => setAsset(null), 0);
            }
            return response;
          }
        }
      } catch {
        // Se não for um request compatível, preserva o comportamento original.
      }
      return previousFetch(input, init);
    };

    window.fetch = mediaAwareFetch;
    return () => {
      if (window.fetch === mediaAwareFetch) window.fetch = previousFetch;
    };
  }, []);

  if (!onAds || !tenantId) return null;

  return (
    <>
      <div className="fixed bottom-5 right-5 z-[80] w-[min(360px,calc(100vw-2rem))] rounded-2xl border bg-background/95 p-3 shadow-xl backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
            {asset ? (
              <img src={mediaAssetUrl(asset.storageUrl)} alt={asset.originalFilename || "Mídia escolhida"} className="h-full w-full object-cover" />
            ) : (
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">Imagem do anúncio</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {asset?.originalFilename || "Use uma imagem existente da Central de Mídias"}
            </p>
          </div>
          {asset && (
            <button type="button" onClick={() => setAsset(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" title="Remover imagem da Biblioteca">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="mt-3 flex h-9 w-full items-center justify-center gap-2 rounded-xl border bg-background text-xs font-medium hover:bg-muted"
        >
          <Library className="h-4 w-4" />
          {asset ? "Trocar imagem da Biblioteca" : "Escolher da Biblioteca"}
        </button>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          Aplicada somente em campanhas Meta do tipo Imagem. Search e Shopping permanecem inalterados.
        </p>
      </div>

      <MediaAssetPicker
        tenantId={tenantId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allowedTypes={["image"]}
        maxSelection={1}
        title="Escolher imagem para o anúncio"
        confirmLabel="Usar no anúncio"
        onConfirm={(assets) => setAsset(assets[0] ?? null)}
      />
    </>
  );
}
