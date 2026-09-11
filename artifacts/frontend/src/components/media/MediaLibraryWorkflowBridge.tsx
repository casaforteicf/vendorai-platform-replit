import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CheckSquare, Globe2, Library, Square } from "lucide-react";

const USER_CACHE_KEY = "vendorai_user_cache";
const OVERRIDE_KEY = "vendorai_sa_tenant_override";
const SITE_STORAGE_KEY = "vendorai_sites_media_assets_v1";
const SITE_MODE_KEY = "vendorai_sites_media_mode_v2";

type CachedUser = { tenantId?: string | null };
type CachedOverride = { id?: string | null };

type MediaAsset = {
  id: string;
  type: "image" | "video" | "audio" | "document" | string;
  storageUrl: string;
  originalFilename?: string | null;
  role?: string | null;
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

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem("vendorai_token") ?? ""}` };
}

function mediaUrl(storageUrl: string): string {
  return storageUrl.startsWith("/objects/") ? `/api/storage${storageUrl}` : storageUrl;
}

function pathnameOf(value: string): string {
  try {
    return new URL(value, window.location.origin).pathname;
  } catch {
    return value;
  }
}

function resolveAssetFromArticle(
  article: HTMLElement,
  assets: MediaAsset[],
  alreadyResolved: Set<string>,
): MediaAsset | null {
  const media = article.querySelector<HTMLImageElement | HTMLVideoElement>("img, video");
  const domPath = media?.src ? pathnameOf(media.src) : "";
  if (domPath) {
    const exact = assets.find((asset) => {
      if (alreadyResolved.has(asset.id)) return false;
      const candidates = [asset.storageUrl, mediaUrl(asset.storageUrl)].map(pathnameOf);
      return candidates.includes(domPath);
    });
    if (exact) return exact;
  }

  const filename = article.querySelector<HTMLElement>("p.truncate")?.textContent?.trim() ?? "";
  if (!filename) return null;
  return assets.find(
    (asset) => !alreadyResolved.has(asset.id) && (asset.originalFilename ?? "Mídia sem nome") === filename,
  ) ?? null;
}

function findSelectionToolbar(): HTMLElement | null {
  const spans = Array.from(document.querySelectorAll<HTMLElement>("span"));
  const counter = spans.find((span) => /^\d+\s+selecionada\(s\)$/i.test(span.textContent?.trim() ?? ""));
  const toolbar = counter?.parentElement;
  return toolbar instanceof HTMLElement ? toolbar : null;
}

function findVisibleCounterHost(): HTMLElement | null {
  const paragraphs = Array.from(document.querySelectorAll<HTMLElement>("main p"));
  const counter = paragraphs.find((element) => /^\d+\s+item\(ns\)$/i.test(element.textContent?.trim() ?? ""));
  if (!counter?.parentElement) return null;

  let host = counter.parentElement.querySelector<HTMLElement>("[data-media-select-all-host]");
  if (!host) {
    host = document.createElement("div");
    host.dataset.mediaSelectAllHost = "true";
    host.className = "inline-flex items-center gap-2";
    counter.insertAdjacentElement("beforebegin", host);
  }
  return host;
}

function visibleMediaCards(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>("main article"))
    .filter((article) => Boolean(article.querySelector("button.absolute.right-2.top-2")));
}

function cardSelectionButton(article: HTMLElement): HTMLButtonElement | null {
  return article.querySelector<HTMLButtonElement>("button.absolute.right-2.top-2");
}

function navigateTo(path: string) {
  window.history.pushState(window.history.state, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function parseResponseHeaders(raw: string): Headers {
  const headers = new Headers();
  for (const line of raw.trim().split(/[\r\n]+/)) {
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator <= 0) continue;
    headers.append(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return headers;
}

/**
 * Faz uma requisição same-origin sem passar pela cadeia de wrappers de window.fetch.
 * Usado somente no Plano de Mídia para que o banco visual completo continue disponível
 * como fonte automática, mesmo quando a Base IA estiver configurada para uso manual.
 */
function xhrFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  const requestUrl = new URL(rawUrl, window.location.origin).toString();
  const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));

  return new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, requestUrl, true);
    headers.forEach((value, key) => xhr.setRequestHeader(key, value));
    xhr.onload = () => {
      resolve(new Response(xhr.responseText, {
        status: xhr.status,
        statusText: xhr.statusText,
        headers: parseResponseHeaders(xhr.getAllResponseHeaders()),
      }));
    };
    xhr.onerror = () => reject(new TypeError("Falha de rede ao acessar a Biblioteca de Mídias."));
    xhr.onabort = () => reject(new DOMException("Requisição cancelada", "AbortError"));

    const body = init.body;
    if (typeof body === "string" || body instanceof Blob || body instanceof FormData || body instanceof URLSearchParams) {
      xhr.send(body);
    } else {
      xhr.send(null);
    }
  });
}

/**
 * Unifica a Biblioteca de Mídias em três fluxos:
 * 1) seleção em massa diretamente em /midias;
 * 2) envio da seleção atual para o Gerador de Sites;
 * 3) banco visual automático do Plano de Mídia, sem novo upload/importação.
 */
export function MediaLibraryWorkflowBridge() {
  const [pathname, setPathname] = useState(() => window.location.pathname);
  const [search, setSearch] = useState(() => window.location.search);
  const [tenantId, setTenantId] = useState(() => currentTenantId());
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectionToolbar, setSelectionToolbar] = useState<HTMLElement | null>(null);
  const [selectAllHost, setSelectAllHost] = useState<HTMLElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(0);
  const [selectedVisibleCount, setSelectedVisibleCount] = useState(0);

  useEffect(() => {
    const syncLocation = () => {
      setPathname(window.location.pathname);
      setSearch(window.location.search);
      const nextTenant = currentTenantId();
      if (nextTenant) setTenantId(nextTenant);
    };
    syncLocation();
    window.addEventListener("popstate", syncLocation);
    const timer = window.setInterval(syncLocation, 400);
    return () => {
      window.removeEventListener("popstate", syncLocation);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (pathname !== "/midias" || !tenantId) {
      setAssets([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/tenants/${tenantId}/media/assets?limit=150`, {
          headers: authHeaders(),
          cache: "no-store",
        });
        const body = await response.json().catch(() => ({})) as { assets?: MediaAsset[] };
        if (!cancelled && response.ok) setAssets(Array.isArray(body.assets) ? body.assets : []);
      } catch {
        // A Biblioteca principal continua funcional se o bridge não sincronizar.
      }
    };
    void load();
    const refresh = () => void load();
    window.addEventListener("vendorai-media-library-changed", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("vendorai-media-library-changed", refresh);
    };
  }, [pathname, tenantId]);

  useEffect(() => {
    if (pathname !== "/midias") {
      setSelectionToolbar(null);
      setSelectAllHost(null);
      setSelectedIds([]);
      setVisibleCount(0);
      setSelectedVisibleCount(0);
      return;
    }

    const syncDom = () => {
      const toolbar = findSelectionToolbar();
      setSelectionToolbar((current) => current === toolbar ? current : toolbar);

      const host = findVisibleCounterHost();
      setSelectAllHost((current) => current === host ? current : host);

      const cards = visibleMediaCards();
      const selectedCards = cards.filter((article) => article.classList.contains("border-primary"));
      setVisibleCount((current) => current === cards.length ? current : cards.length);
      setSelectedVisibleCount((current) => current === selectedCards.length ? current : selectedCards.length);

      if (assets.length === 0 || selectedCards.length === 0) {
        setSelectedIds((current) => current.length ? [] : current);
        return;
      }

      const resolved = new Set<string>();
      for (const article of selectedCards) {
        const asset = resolveAssetFromArticle(article, assets, resolved);
        if (asset) resolved.add(asset.id);
      }
      const nextIds = Array.from(resolved).sort();
      setSelectedIds((current) => {
        const previous = [...current].sort();
        return previous.length === nextIds.length && previous.every((id, index) => id === nextIds[index])
          ? current
          : nextIds;
      });
    };

    syncDom();
    const observer = new MutationObserver(syncDom);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class"],
    });
    const timer = window.setInterval(syncDom, 500);
    return () => {
      observer.disconnect();
      window.clearInterval(timer);
    };
  }, [assets, pathname]);

  useEffect(() => {
    const previousFetch = window.fetch.bind(window);
    const fullLibraryPlanFetch: typeof window.fetch = async (input, init = {}) => {
      try {
        const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        const url = new URL(rawUrl, window.location.origin);
        const method = (init.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
        const headers = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
        const params = new URLSearchParams(window.location.search);
        const automaticPlanContext = window.location.pathname === "/content"
          && (params.get("mode") !== "avulso" || params.get("from") === "media-calendar");

        if (automaticPlanContext && method === "GET" && /^\/api\/tenants\/[^/]+\/media\/assets\/?$/.test(url.pathname)) {
          const type = url.searchParams.get("type");
          if (type === "image" || type === "video") return xhrFetch(input, init);
        }

        const isPlanGeneration = automaticPlanContext
          && method === "POST"
          && Boolean(headers.get("x-vendorai-calendar-item-id"))
          && /^\/api\/tenants\/[^/]+\/content\/generate\/?$/.test(url.pathname)
          && typeof init.body === "string";
        if (isPlanGeneration) return xhrFetch(input, init);
      } catch {
        // Qualquer caso fora do fluxo visual automático mantém a cadeia original.
      }
      return previousFetch(input, init);
    };

    window.fetch = fullLibraryPlanFetch;
    return () => {
      if (window.fetch === fullLibraryPlanFetch) window.fetch = previousFetch;
    };
  }, []);

  const selectedAssets = useMemo(
    () => assets.filter((asset) => selectedIds.includes(asset.id)),
    [assets, selectedIds],
  );
  const siteAssets = useMemo(
    () => selectedAssets.filter((asset) => asset.type === "image" || asset.type === "video"),
    [selectedAssets],
  );
  const allVisibleSelected = visibleCount > 0 && selectedVisibleCount === visibleCount;

  const toggleAllVisible = () => {
    const cards = visibleMediaCards();
    const shouldSelect = !allVisibleSelected;
    for (const article of cards) {
      const active = article.classList.contains("border-primary");
      if ((shouldSelect && !active) || (!shouldSelect && active)) cardSelectionButton(article)?.click();
    }
  };

  const useOnSite = () => {
    if (siteAssets.length === 0) {
      window.alert("Selecione ao menos uma foto ou vídeo para usar no site.");
      return;
    }
    try {
      sessionStorage.setItem(SITE_STORAGE_KEY, JSON.stringify(siteAssets.slice(0, 150)));
      localStorage.setItem(SITE_MODE_KEY, "manual");
    } catch {
      window.alert("Não foi possível preparar as mídias selecionadas para o site.");
      return;
    }
    navigateTo("/content-autopilot");
  };

  const selectAllControl = pathname === "/midias" && selectAllHost && visibleCount > 0
    ? createPortal(
      <button
        type="button"
        onClick={toggleAllVisible}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border bg-background px-3 text-xs font-semibold hover:bg-muted"
        title={allVisibleSelected ? "Desmarcar todas as mídias visíveis" : "Selecionar todas as mídias visíveis"}
      >
        {allVisibleSelected ? <CheckSquare className="h-3.5 w-3.5 text-primary" /> : <Square className="h-3.5 w-3.5" />}
        {allVisibleSelected ? "Desmarcar todos" : `Selecionar todos (${visibleCount})`}
      </button>,
      selectAllHost,
    )
    : null;

  const siteControl = pathname === "/midias" && selectionToolbar && selectedAssets.length > 0
    ? createPortal(
      <button
        type="button"
        disabled={siteAssets.length === 0}
        onClick={useOnSite}
        className="action-pill border-primary/30 text-primary disabled:cursor-not-allowed disabled:opacity-40"
        title="Enviar as fotos e vídeos selecionados diretamente para o Gerador de Sites"
      >
        <Globe2 className="h-3.5 w-3.5" /> Usar no site{siteAssets.length > 1 ? ` (${siteAssets.length})` : ""}
      </button>,
      selectionToolbar,
    )
    : null;

  const automaticBankNotice = pathname === "/midias" && selectAllHost
    ? createPortal(
      <span className="hidden items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 2xl:inline-flex" title="O Plano de Mídia e o Gerador de Sites podem reutilizar automaticamente fotos e vídeos desta Biblioteca">
        <Library className="h-3 w-3" /> Banco automático da IA
      </span>,
      selectAllHost,
    )
    : null;

  return <>{selectAllControl}{automaticBankNotice}{siteControl}</>;
}
