import { useEffect, useRef, useState } from "react";
import { Image as ImageIcon, Images, Library, Video, X } from "lucide-react";
import { MediaAssetPicker, mediaAssetUrl, type MediaPickerAsset } from "./MediaAssetPicker";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const STORAGE_KEY = "vendorai_catalog_media_selection_v1";

type CachedUser = { tenantId?: string | null };
type CachedOverride = { id?: string | null };
type Target = "cover" | "gallery" | "video";
type SelectionState = { target: Target; assets: MediaPickerAsset[] };

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

function readStoredSelection(): SelectionState | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SelectionState;
    if (!["cover", "gallery", "video"].includes(parsed?.target)) return null;
    if (!Array.isArray(parsed?.assets) || !parsed.assets.length) return null;
    return parsed;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function absolutePublicMediaUrl(asset: MediaPickerAsset): string {
  return new URL(mediaAssetUrl(asset.storageUrl), window.location.origin).toString();
}

function mergeGallery(existing: unknown, additions: string[]): string[] {
  const current = Array.isArray(existing) ? existing.map(String).filter(Boolean) : [];
  return [...new Set([...current, ...additions])];
}

export function MediaCatalogBridge() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [target, setTarget] = useState<Target>("cover");
  const [selection, setSelection] = useState<SelectionState | null>(readStoredSelection);
  const selectionRef = useRef<SelectionState | null>(selection);
  const tenantId = currentTenantId();
  const onCatalog = pathname === "/catalogo" || pathname.startsWith("/catalogo/");

  useEffect(() => {
    selectionRef.current = selection;
    if (selection) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(selection));
    else sessionStorage.removeItem(STORAGE_KEY);
  }, [selection]);

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
        const selected = selectionRef.current;
        const isCreate = url.pathname === "/api/produtos-catalogo" && method === "POST";
        const isUpdate = /^\/api\/produtos-catalogo\/[^/]+\/?$/.test(url.pathname) && method === "PATCH";

        if (selected && (isCreate || isUpdate) && typeof init.body === "string") {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          const urls = selected.assets.map(absolutePublicMediaUrl);

          if (selected.target === "cover" && urls[0]) body["imagemUrl"] = urls[0];
          if (selected.target === "gallery") body["imagens"] = mergeGallery(body["imagens"], urls);
          if (selected.target === "video" && urls[0]) body["videoUrl"] = urls[0];

          const response = await previousFetch(input, { ...init, body: JSON.stringify(body) });
          if (response.ok) window.setTimeout(() => setSelection(null), 0);
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

  if (!onCatalog || !tenantId) return null;

  const activeAsset = selection?.assets[0];
  const activeLabel = selection?.target === "cover"
    ? "Capa do produto"
    : selection?.target === "gallery"
      ? "Galeria do produto"
      : selection?.target === "video"
        ? "Vídeo do produto"
        : "Nenhuma mídia selecionada";

  function openPicker(nextTarget: Target) {
    setTarget(nextTarget);
    setPickerOpen(true);
  }

  return (
    <>
      <div className="fixed bottom-5 right-5 z-[80] w-[min(390px,calc(100vw-2rem))] rounded-2xl border bg-background/95 p-3 shadow-xl backdrop-blur">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted">
            {activeAsset?.type === "image" ? (
              <img src={mediaAssetUrl(activeAsset.storageUrl)} alt={activeAsset.originalFilename || "Mídia selecionada"} className="h-full w-full object-cover" />
            ) : activeAsset?.type === "video" ? (
              <Video className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Library className="h-5 w-5 text-muted-foreground" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">Mídia do produto</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {selection ? `${activeLabel} · ${selection.assets.length} selecionada(s)` : "Use uma mídia já tratada ou gerada no Media Hub"}
            </p>
          </div>
          {selection && (
            <button type="button" onClick={() => setSelection(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" title="Limpar seleção">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button type="button" onClick={() => openPicker("cover")} className="flex h-9 items-center justify-center gap-1.5 rounded-xl border bg-background text-[11px] font-medium hover:bg-muted">
            <ImageIcon className="h-3.5 w-3.5" /> Capa
          </button>
          <button type="button" onClick={() => openPicker("gallery")} className="flex h-9 items-center justify-center gap-1.5 rounded-xl border bg-background text-[11px] font-medium hover:bg-muted">
            <Images className="h-3.5 w-3.5" /> Galeria
          </button>
          <button type="button" onClick={() => openPicker("video")} className="flex h-9 items-center justify-center gap-1.5 rounded-xl border bg-background text-[11px] font-medium hover:bg-muted">
            <Video className="h-3.5 w-3.5" /> Vídeo
          </button>
        </div>

        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          A seleção entra no cadastro real ao salvar o produto. Upload, URL manual e geração por IA existentes continuam funcionando.
        </p>
      </div>

      <MediaAssetPicker
        tenantId={tenantId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allowedTypes={target === "video" ? ["video"] : ["image"]}
        maxSelection={target === "gallery" ? 12 : 1}
        title={target === "cover" ? "Escolher capa do produto" : target === "gallery" ? "Escolher fotos da galeria" : "Escolher vídeo do produto"}
        confirmLabel="Usar no produto"
        onConfirm={(assets) => setSelection({ target, assets })}
      />
    </>
  );
}
