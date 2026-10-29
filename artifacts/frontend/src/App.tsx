import * as React from "react";
import "./dev-agent-mobile.css";
import "./video-studio-modern.css";

const AppLegacy = React.lazy(() => import("./AppLegacy"));
const AtlasPage = React.lazy(() => import("./pages/AtlasPage"));
const AppRuntimeShell = React.lazy(() => import("@/pages/app-runtime/AppRuntimeShell"));
const DevAgentOverlay = React.lazy(() => import("@/components/admin/DevAgentOverlay"));

const GET_FETCH_TIMEOUT_MS = 15_000;

function installGetFetchTimeout() {
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  const existing = window.fetch as typeof window.fetch & { __vendoraiGetTimeout?: boolean };
  if (existing.__vendoraiGetTimeout) return;

  const nativeFetch = window.fetch.bind(window);
  const guardedFetch: typeof window.fetch = async (input, init) => {
    const requestMethod = (
      init?.method
      ?? (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
      ?? "GET"
    ).toUpperCase();

    if (requestMethod !== "GET" || init?.signal) {
      return nativeFetch(input, init);
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), GET_FETCH_TIMEOUT_MS);
    try {
      return await nativeFetch(input, { ...init, signal: controller.signal });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        console.warn("VendorAI: GET encerrado por timeout", typeof input === "string" ? input : input.toString());
        return new Response(null, {
          status: 504,
          statusText: "VendorAI request timeout",
          headers: { "X-VendorAI-Timeout": "true" },
        });
      }
      throw error;
    } finally {
      window.clearTimeout(timeout);
    }
  };

  (guardedFetch as typeof guardedFetch & { __vendoraiGetTimeout?: boolean }).__vendoraiGetTimeout = true;
  window.fetch = guardedFetch;
}

installGetFetchTimeout();

class DevAgentIsolationBoundary extends React.Component<
  { children: React.ReactNode; onError?: () => void },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode; onError?: () => void }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Dev IA isolado após erro de runtime:", error);
    this.props.onError?.();
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

function AppShellFallback() {
  const [slow, setSlow] = React.useState(false);

  React.useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 8_000);
    return () => window.clearTimeout(timer);
  }, []);

  const reloadLatest = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("__vendorai_refresh", String(Date.now()));
    window.location.replace(url.toString());
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f8fa] px-6 text-slate-800">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#D9673E]" />
        <div className="mt-4 text-base font-semibold">Carregando o sistema…</div>
        {slow ? (
          <>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Esta versão demorou mais que o esperado. Você pode buscar a versão mais recente sem perder sua sessão.
            </p>
            <button
              type="button"
              onClick={reloadLatest}
              className="mt-5 rounded-lg bg-[#D9673E] px-4 py-2.5 text-sm font-semibold text-white"
            >
              Carregar versão atual
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

function runtimeAppId(pathname: string): string | null {
  const match = pathname.match(/^\/apps\/([^/?#]+)\/?$/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function isCachedSuperAdmin() {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem("vendorai_user_cache");
    if (!raw) return false;
    const user = JSON.parse(raw) as { platformRole?: string | null };
    return user?.platformRole === "super_admin";
  } catch {
    return false;
  }
}

function createUuidV4() {
  const bytes = new Uint8Array(16);
  try {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
  } catch {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function ensureMobileDomCompatibility() {
  if (typeof window === "undefined" || typeof Element === "undefined") return;
  const proto = Element.prototype as Element & { scrollIntoView?: (options?: ScrollIntoViewOptions | boolean) => void };
  if (typeof proto.scrollIntoView !== "function") {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: () => undefined,
    });
  }
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID !== "function") {
      Object.defineProperty(crypto, "randomUUID", {
        configurable: true,
        writable: true,
        value: () => createUuidV4(),
      });
    }
  } catch {
    // O Dev IA ainda sanitiza IDs antigos abaixo.
  }
}

function sanitizeDevAgentHistory() {
  if (typeof window === "undefined") return;
  const messageKey = "vendorai_dev_ia_messages_v1";
  const requestKey = "vendorai_dev_ia_requests_v1";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  try {
    const raw = window.localStorage.getItem(messageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        window.localStorage.removeItem(messageKey);
      } else {
        const cleaned = parsed.filter((item) => {
          if (!item || (item.role !== "user" && item.role !== "assistant")) return false;
          return typeof item.content === "string" && item.content.trim().length > 0;
        });
        window.localStorage.setItem(messageKey, JSON.stringify(cleaned.slice(-100)));
      }
    }
  } catch {
    try {
      window.localStorage.removeItem(messageKey);
    } catch {
      // Histórico inválido nunca pode impedir o Dev IA de abrir.
    }
  }

  try {
    const raw = window.localStorage.getItem(requestKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        window.localStorage.removeItem(requestKey);
      } else {
        const cleaned = parsed
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            ...item,
            id: typeof item.id === "string" && uuidPattern.test(item.id) ? item.id : createUuidV4(),
          }))
          .slice(0, 100);
        window.localStorage.setItem(requestKey, JSON.stringify(cleaned));
      }
    }
  } catch {
    try {
      window.localStorage.removeItem(requestKey);
    } catch {
      // Histórico inválido nunca pode impedir o uso do sistema.
    }
  }
}

type StoredDevRequest = {
  id?: string;
  status?: string;
  targetRevision?: string;
  executionSummary?: string;
  [key: string]: unknown;
};

async function reconcilePendingDevRequests() {
  if (typeof window === "undefined") return;
  const requestKey = "vendorai_dev_ia_requests_v1";

  let requests: StoredDevRequest[] = [];
  try {
    const raw = window.localStorage.getItem(requestKey);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return;
    requests = parsed;
  } catch {
    return;
  }

  const pending = requests
    .filter((item) => item?.status === "deploy_pending" && typeof item?.targetRevision === "string" && item.targetRevision.trim())
    .slice(0, 10);
  if (pending.length === 0) return;

  let token: string | null = null;
  try { token = window.localStorage.getItem("vendorai_token"); } catch { token = null; }
  if (!token) return;

  const validated = new Map<string, { revision: string; runtime?: string }>();

  for (const item of pending) {
    try {
      const response = await fetch("/api/support/dev/validate-production", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ expectedRevision: item.targetRevision }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.state !== "validated") continue;
      validated.set(String(item.id ?? item.targetRevision), {
        revision: String(data?.observedRevision ?? item.targetRevision),
        runtime: typeof data?.runtime === "string" ? data.runtime : undefined,
      });
    } catch {
      // Reconciliação é best-effort e nunca pode impedir o painel de abrir.
    }
  }

  if (validated.size === 0) return;

  const next = requests.map((item) => {
    const evidence = validated.get(String(item.id ?? item.targetRevision));
    if (!evidence) return item;
    const runtimeLabel = evidence.runtime === "vercel" ? "Vercel" : evidence.runtime === "railway" ? "Railway" : "produção";
    const validationText = `Produção validada automaticamente em ${runtimeLabel} no SHA ${evidence.revision.slice(0, 9)}.`;
    return {
      ...item,
      status: "concluido",
      executionSummary: `${typeof item.executionSummary === "string" ? item.executionSummary : ""}\n${validationText}`.trim(),
    };
  });

  try {
    window.localStorage.setItem(requestKey, JSON.stringify(next.slice(0, 100)));
  } catch {
    // Persistência auxiliar não pode impedir o uso do sistema.
  }
}

export default function App() {
  const appId = typeof window !== "undefined" ? runtimeAppId(window.location.pathname) : null;
  const [devRequested, setDevRequested] = React.useState(false);
  const [devFailed, setDevFailed] = React.useState(false);
  const [devLoading, setDevLoading] = React.useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(isCachedSuperAdmin);
  const [currentPath, setCurrentPath] = React.useState(() => typeof window !== "undefined" ? window.location.pathname : "");
  const [imagePreview, setImagePreview] = React.useState<{ src: string; alt: string } | null>(null);
  const showDevLauncher = isSuperAdmin && currentPath.startsWith("/admin/");
  const catalogPreviewEnabled = currentPath.startsWith("/catalogo");

  React.useEffect(() => {
    const syncVideoStudioScope = () => {
      const active = window.location.pathname.startsWith("/content-studio/video");
      document.body.classList.toggle("vendorai-video-studio", active);
    };
    syncVideoStudioScope();
    const timer = window.setInterval(syncVideoStudioScope, 250);
    window.addEventListener("popstate", syncVideoStudioScope);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("popstate", syncVideoStudioScope);
      document.body.classList.remove("vendorai-video-studio");
    };
  }, []);

  React.useEffect(() => {
    const syncRole = () => setIsSuperAdmin(isCachedSuperAdmin());
    window.addEventListener("storage", syncRole);
    window.addEventListener("focus", syncRole);
    return () => {
      window.removeEventListener("storage", syncRole);
      window.removeEventListener("focus", syncRole);
    };
  }, []);

  React.useEffect(() => {
    const syncPath = () => setCurrentPath(window.location.pathname);
    syncPath();
    const timer = window.setInterval(syncPath, 250);
    window.addEventListener("popstate", syncPath);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("popstate", syncPath);
    };
  }, []);

  React.useEffect(() => {
    const handleCatalogImageClick = (event: MouseEvent) => {
      if (!window.location.pathname.startsWith("/catalogo")) return;
      if (!(event.target instanceof Element)) return;
      const image = event.target.closest("img");
      if (!(image instanceof HTMLImageElement)) return;
      if (image.dataset.noPreview === "true") return;
      if (!image.closest('[role="dialog"]')) return;
      const src = image.currentSrc || image.src;
      if (!src) return;
      event.preventDefault();
      event.stopPropagation();
      setImagePreview({ src, alt: image.alt || "Imagem do produto" });
    };

    document.addEventListener("click", handleCatalogImageClick);
    return () => document.removeEventListener("click", handleCatalogImageClick);
  }, []);

  React.useEffect(() => {
    if (!imagePreview) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setImagePreview(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [imagePreview]);

  React.useEffect(() => {
    if (!catalogPreviewEnabled && imagePreview) setImagePreview(null);
  }, [catalogPreviewEnabled, imagePreview]);

  React.useEffect(() => {
    if (!showDevLauncher && devRequested) setDevRequested(false);
  }, [showDevLauncher, devRequested]);

  React.useEffect(() => {
    if (!devRequested || devFailed) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const button = document.querySelector<HTMLButtonElement>('button[aria-label="Abrir Dev IA"]');
      if (button) {
        window.clearInterval(timer);
        button.click();
      } else if (attempts >= 30) {
        window.clearInterval(timer);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [devRequested, devFailed]);

  if (currentPath === "/atlas" || currentPath === "/atlas/") {
    return <React.Suspense fallback={<AppShellFallback />}><AtlasPage /></React.Suspense>;
  }

  if (appId) {
    return (
      <React.Suspense fallback={null}>
        <AppRuntimeShell appId={appId} />
      </React.Suspense>
    );
  }

  const openDevAgent = async () => {
    if (devLoading) return;
    setDevLoading(true);
    ensureMobileDomCompatibility();
    sanitizeDevAgentHistory();
    await reconcilePendingDevRequests();
    setDevFailed(false);
    setDevRequested(true);
    setDevLoading(false);
  };

  return (
    <>
      <React.Suspense fallback={<AppShellFallback />}>
        <AppLegacy />
      </React.Suspense>

      {catalogPreviewEnabled && (
        <style>{`[role="dialog"] img:not([data-no-preview="true"]) { cursor: zoom-in; }`}</style>
      )}

      {imagePreview && (
        <div
          className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Visualização ampliada da imagem"
          onClick={() => setImagePreview(null)}
        >
          <button
            type="button"
            className="absolute right-5 top-5 flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-2xl text-white hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white"
            aria-label="Fechar visualização"
            onClick={() => setImagePreview(null)}
          >
            ×
          </button>
          <div className="flex max-h-[92vh] max-w-[94vw] flex-col items-center gap-3" onClick={(event) => event.stopPropagation()}>
            <img
              src={imagePreview.src}
              alt={imagePreview.alt}
              data-no-preview="true"
              className="max-h-[84vh] max-w-[94vw] rounded-lg object-contain shadow-2xl"
            />
            <p className="max-w-[80vw] truncate rounded-full bg-black/55 px-4 py-2 text-sm text-white">
              {imagePreview.alt}
            </p>
          </div>
        </div>
      )}

      {showDevLauncher && !devRequested && (
        <button
          type="button"
          onClick={() => void openDevAgent()}
          disabled={devLoading}
          className="fixed bottom-24 right-5 z-[90] rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl disabled:opacity-70"
          aria-label="Carregar Dev IA"
        >
          {devLoading ? "Validando..." : "Dev IA"}
        </button>
      )}

      {showDevLauncher && devFailed && (
        <button
          type="button"
          onClick={() => void openDevAgent()}
          disabled={devLoading}
          className="fixed bottom-24 right-5 z-[90] rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl disabled:opacity-70"
          aria-label="Tentar Dev IA novamente"
        >
          {devLoading ? "Validando..." : "Tentar Dev IA"}
        </button>
      )}

      {showDevLauncher && devRequested && !devFailed && (
        <DevAgentIsolationBoundary
          onError={() => {
            setDevFailed(true);
            setDevRequested(false);
          }}
        >
          <React.Suspense fallback={null}>
            <DevAgentOverlay />
          </React.Suspense>
        </DevAgentIsolationBoundary>
      )}
    </>
  );
}