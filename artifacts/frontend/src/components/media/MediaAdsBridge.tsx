import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Image as ImageIcon, Library, X } from "lucide-react";
import { MediaAssetPicker, mediaAssetUrl, type MediaPickerAsset } from "./MediaAssetPicker";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const STORAGE_KEY = "vendorai_ads_media_asset_v1";
const ACTIVE_BRIEFING_KEY = "vendorai_active_marketing_briefing_v1";

type CachedUser = { tenantId?: string | null };
type CachedOverride = { id?: string | null };
type GoogleFormat = "search" | "performance_max";

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

function readInitialGoogleFormat(): GoogleFormat {
  try {
    const raw = sessionStorage.getItem(ACTIVE_BRIEFING_KEY);
    if (!raw) return "search";
    const briefing = JSON.parse(raw) as { marketingContext?: { googleFormat?: string } };
    return briefing.marketingContext?.googleFormat === "performance_max" ? "performance_max" : "search";
  } catch {
    return "search";
  }
}

function absolutePublicMediaUrl(asset: MediaPickerAsset): string {
  return new URL(mediaAssetUrl(asset.storageUrl), window.location.origin).toString();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function findAdsDialog(): HTMLElement | null {
  const dialogs = Array.from(document.querySelectorAll<HTMLElement>("[role='dialog']"));
  return dialogs.find((dialog) => dialog.textContent?.includes("Nova campanha")) ?? null;
}

function hideLegacyPmaxPlaceholder() {
  document.querySelectorAll<HTMLElement>("[role='option']").forEach((option) => {
    if (option.textContent?.includes("Performance Max completa") && option.textContent?.includes("implantação")) {
      option.style.display = "none";
      option.setAttribute("aria-hidden", "true");
    }
  });
}

export function MediaAdsBridge() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [asset, setAsset] = useState<MediaPickerAsset | null>(readStoredAsset);
  const [googleFormat, setGoogleFormat] = useState<GoogleFormat>(readInitialGoogleFormat);
  const [dialogPortal, setDialogPortal] = useState<HTMLElement | null>(null);
  const assetRef = useRef<MediaPickerAsset | null>(asset);
  const googleFormatRef = useRef<GoogleFormat>(googleFormat);
  const tenantId = currentTenantId();
  const onAds = pathname === "/ads" || pathname.startsWith("/ads/");

  useEffect(() => {
    assetRef.current = asset;
    if (asset) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(asset));
    else sessionStorage.removeItem(STORAGE_KEY);
  }, [asset]);

  useEffect(() => {
    googleFormatRef.current = googleFormat;
  }, [googleFormat]);

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
    if (!onAds) {
      setDialogPortal(null);
      return;
    }

    const syncDialog = () => {
      const nextDialog = findAdsDialog();
      setDialogPortal((current) => current === nextDialog ? current : nextDialog);
      hideLegacyPmaxPlaceholder();
    };

    syncDialog();
    const observer = new MutationObserver(syncDialog);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [onAds]);

  useEffect(() => {
    const previousFetch = window.fetch.bind(window);

    const mediaAwareFetch: typeof window.fetch = async (input, init = {}) => {
      try {
        const requestUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(requestUrl, window.location.origin);
        const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        const selected = assetRef.current;
        const isCampaignCreate = /^\/api\/tenants\/[^/]+\/ads\/campaigns\/?$/.test(url.pathname);

        if (method === "POST" && isCampaignCreate && typeof init.body === "string") {
          const body = JSON.parse(init.body) as Record<string, unknown>;
          const segmentacao = asRecord(body["segmentacao"]);
          const marketingContext = asRecord(segmentacao["marketingContext"]);
          const storedFormat = marketingContext["googleFormat"];
          const effectiveGoogleFormat: GoogleFormat = storedFormat === "performance_max"
            ? "performance_max"
            : storedFormat === "search"
              ? "search"
              : googleFormatRef.current;
          const isGoogleRsa = body["plataforma"] === "google" && body["tipoAnuncio"] === "rsa_pmax";
          const isPmax = isGoogleRsa && effectiveGoogleFormat === "performance_max";
          let changed = false;

          if (isGoogleRsa) {
            body["segmentacao"] = {
              ...segmentacao,
              marketingContext: {
                ...marketingContext,
                googleFormat: effectiveGoogleFormat,
              },
            };
            changed = true;
          }

          if (isPmax && (body["destinoClique"] === "whatsapp" || body["destinoClique"] === "formulario_lead")) {
            body["destinoClique"] = body["itemTipo"] === "landing_page" ? "landing_page" : "produto";
            changed = true;
          }

          if (selected && (body["tipoAnuncio"] === "imagem" || isPmax)) {
            body["imagemEscolhidaUrl"] = absolutePublicMediaUrl(selected);
            const nextSegmentacao = asRecord(body["segmentacao"]);
            body["segmentacao"] = {
              ...nextSegmentacao,
              mediaSource: {
                assetId: selected.id,
                source: "media_library",
                originalFilename: selected.originalFilename ?? null,
              },
            };
            changed = true;
          }

          if (changed) {
            const response = await previousFetch(input, { ...init, body: JSON.stringify(body) });
            if (response.ok && selected && (body["tipoAnuncio"] === "imagem" || isPmax)) {
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

  const campaignControls = (
    <div className="mt-4 border-t pt-4 space-y-4" data-vendorai-ads-google-format="true">
      <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
        <div>
          <p className="text-sm font-semibold">Formato Google</p>
          <p className="text-xs text-muted-foreground">Escolha a estratégia que a IA vai preparar quando a plataforma for Google.</p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1">
          <button
            type="button"
            onClick={() => setGoogleFormat("search")}
            className={`rounded-lg px-2 py-2 text-xs font-medium transition ${googleFormat === "search" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Google Search
          </button>
          <button
            type="button"
            onClick={() => setGoogleFormat("performance_max")}
            className={`rounded-lg px-2 py-2 text-xs font-medium transition ${googleFormat === "performance_max" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
          >
            Performance Max
          </button>
        </div>
        {googleFormat === "performance_max" ? (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Performance Max combina títulos, descrições, imagem e logo do tenant em múltiplos canais Google. A estrutura nasce pausada e só entra em gasto dentro das autorizações e do orçamento aprovado.
          </p>
        ) : (
          <p className="text-xs leading-relaxed text-muted-foreground">
            Search cria anúncios responsivos de texto voltados para pesquisas com intenção comercial.
          </p>
        )}
      </div>

      <div className="rounded-xl border p-3">
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
              {asset?.originalFilename || "Opcional: escolha na Central de Mídias"}
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
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          A imagem escolhida é usada em Meta Imagem e em Performance Max. Se PMax não receber imagem, o VendorAI gera uma antes do Design QA.
        </p>
      </div>
    </div>
  );

  return (
    <>
      {dialogPortal ? createPortal(campaignControls, dialogPortal) : null}

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
