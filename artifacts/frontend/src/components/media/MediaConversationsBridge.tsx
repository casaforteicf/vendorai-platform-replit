import { useEffect, useRef, useState } from "react";
import { FileAudio, FileText, Image as ImageIcon, Library, Video, X } from "lucide-react";
import { MediaAssetPicker, mediaAssetUrl, type MediaPickerAsset } from "./MediaAssetPicker";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const STORAGE_KEY = "vendorai_conversation_media_asset_v1";

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
    // Ignora cache inválido.
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
    return asset?.id && asset?.type ? asset : null;
  } catch {
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

function AssetIcon({ type }: { type: MediaPickerAsset["type"] }) {
  if (type === "image") return <ImageIcon className="h-5 w-5" />;
  if (type === "video") return <Video className="h-5 w-5" />;
  if (type === "audio") return <FileAudio className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

export function MediaConversationsBridge() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [asset, setAsset] = useState<MediaPickerAsset | null>(() => readStoredAsset());
  const assetRef = useRef(asset);
  const tenantId = currentTenantId();
  const onConversations = pathname === "/conversations" || pathname.startsWith("/conversations/");

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
        const isMessageCreate = /\/api\/messages\/?$/.test(url.pathname);

        if (selected && method === "POST" && isMessageCreate && typeof init.body === "string") {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          const bodyTenantId = typeof body["tenantId"] === "string" ? body["tenantId"] : "";

          // Upload manual já anexado pela tela continua tendo prioridade.
          if (bodyTenantId === tenantId && !body["midia"]) {
            body["midia"] = { mediaAssetId: selected.id };
            if (!String(body["conteudo"] ?? "").trim()) {
              body["conteudo"] = selected.originalFilename || "Mídia";
            }

            const response = await previousFetch(input, { ...init, body: JSON.stringify(body) });
            if (response.ok) window.setTimeout(() => setAsset(null), 0);
            return response;
          }
        }
      } catch {
        // Qualquer chamada que não siga o contrato continua sem alteração.
      }
      return previousFetch(input, init);
    };

    window.fetch = mediaAwareFetch;
    return () => {
      if (window.fetch === mediaAwareFetch) window.fetch = previousFetch;
    };
  }, [tenantId]);

  if (!onConversations || !tenantId) return null;

  return (
    <>
      <div className="fixed bottom-5 right-5 z-[80] w-[min(360px,calc(100vw-2rem))] rounded-2xl border bg-background/95 p-3 shadow-xl backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-muted text-muted-foreground">
            {asset?.type === "image" ? (
              <img src={mediaAssetUrl(asset.storageUrl)} alt={asset.originalFilename || "Mídia"} className="h-full w-full object-cover" />
            ) : asset ? (
              <AssetIcon type={asset.type} />
            ) : (
              <Library className="h-5 w-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">Anexo da Biblioteca</p>
            <p className="truncate text-xs text-muted-foreground">
              {asset ? asset.originalFilename || `Mídia ${asset.type}` : "Imagem, vídeo, áudio ou documento"}
            </p>
          </div>
          {asset && (
            <button type="button" onClick={() => setAsset(null)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted" title="Remover mídia">
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
          {asset ? "Trocar mídia da Biblioteca" : "Escolher da Biblioteca"}
        </button>
        <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
          A mídia escolhida será usada no próximo envio. O anexo por upload da conversa continua disponível e, se usado, tem prioridade.
        </p>
      </div>

      <MediaAssetPicker
        tenantId={tenantId}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        allowedTypes={["image", "video", "audio", "document"]}
        maxSelection={1}
        title="Escolher mídia para a conversa"
        confirmLabel="Usar na conversa"
        onConfirm={(selected) => setAsset(selected[0] ?? null)}
      />
    </>
  );
}
