import { useEffect, useRef, useState } from "react";

const RECOVERY_KEY_PREFIX = "vendorai_frontend_recovered_bundle";
const RECOVERY_AT_KEY = "vendorai_stale_asset_recovery_at";
const RECOVERY_WINDOW_MS = 30_000;
const STUCK_SPINNER_MS = 12_000;
const VERSION_CHECK_MS = 60_000;
const UPDATE_DISMISS_PREFIX = "vendorai_update_dismissed";
const REFRESH_PROTECTION_SELECTOR = '[data-vendorai-refresh-protected="true"]';

const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk|Unable to preload CSS|Expected a JavaScript-or-Wasm module script|module script.*MIME|MIME type.*text\/html|disallowed MIME type|server responded with a MIME type of ["']?text\/html|Cannot read properties of undefined \(reading ["'][A-Za-z0-9_$]+["']\)/i;

function isFrontendRefreshProtected() {
  if (typeof document === "undefined") return false;
  return document.querySelector(REFRESH_PROTECTION_SELECTOR) !== null;
}

function currentEntryAsset() {
  const entryScript = Array.from(document.scripts).find((script) =>
    script.type === "module" && /\/assets\/index-[^/]+\.js(?:$|\?)/.test(script.src),
  );
  if (!entryScript?.src) return "";
  try {
    return new URL(entryScript.src, window.location.origin).pathname;
  } catch {
    return entryScript.src;
  }
}

function currentBundleRecoveryKey() {
  return `${RECOVERY_KEY_PREFIX}:${currentEntryAsset() || "bootstrap"}`;
}

async function clearObsoleteFrontendState() {
  const cleanup = async () => {
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(registrations.map((registration) => registration.unregister()));
      }
    } catch {
      // Recovery is best-effort. Never block the CRM because cleanup failed.
    }

    try {
      if ("caches" in window) {
        const cacheNames = await caches.keys();
        await Promise.allSettled(cacheNames.map((cacheName) => caches.delete(cacheName)));
      }
    } catch {
      // Same principle: cleanup must stay fail-open.
    }
  };

  // Android WebViews can leave Service Worker/Cache APIs pending indefinitely.
  // Recovery must always proceed to navigation instead of freezing the app.
  await Promise.race([
    cleanup(),
    new Promise<void>((resolve) => window.setTimeout(resolve, 1_500)),
  ]);
}
function wasRecoveredRecently() {
  try {
    const lastRecoveryAt = Number(sessionStorage.getItem(RECOVERY_AT_KEY) || "0");
    return Date.now() - lastRecoveryAt < RECOVERY_WINDOW_MS;
  } catch {
    return false;
  }
}

function canAutoRecoverCurrentBundle() {
  try {
    return sessionStorage.getItem(currentBundleRecoveryKey()) !== "1" && !wasRecoveredRecently();
  } catch {
    return !wasRecoveredRecently();
  }
}

function navigateToLatestVersion(timestamp = Date.now()) {
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("__vendorai_refresh", String(timestamp));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

async function recoverFrontendOnce(reason: string) {
  const recoveryKey = currentBundleRecoveryKey();
  if (!canAutoRecoverCurrentBundle()) return false;

  const now = Date.now();
  try {
    sessionStorage.setItem(recoveryKey, "1");
    sessionStorage.setItem(RECOVERY_AT_KEY, String(now));
  } catch {
    // sessionStorage indisponível não deve impedir a tentativa de recuperação.
  }
  console.warn(`[VendorAI] Recuperando frontend após ${reason}.`);
  await clearObsoleteFrontendState();
  navigateToLatestVersion(now);
  return true;
}

async function latestEntryAsset() {
  try {
    const url = new URL("/index.html", window.location.origin);
    url.searchParams.set("__vendorai_version_check", String(Date.now()));
    const response = await fetch(url.toString(), {
      cache: "no-store",
      credentials: "same-origin",
      headers: { Accept: "text/html" },
    });
    if (!response.ok) return "";
    const html = await response.text();
    const match = html.match(/<script[^>]+type=["']module["'][^>]+src=["']([^"']*\/assets\/index-[^"']+\.js[^"']*)["']/i)
      ?? html.match(/<script[^>]+src=["']([^"']*\/assets\/index-[^"']+\.js[^"']*)["'][^>]+type=["']module["']/i);
    if (!match?.[1]) return "";
    return new URL(match[1], window.location.origin).pathname;
  } catch {
    return "";
  }
}

async function findAvailableDeployment() {
  const current = currentEntryAsset();
  if (!current) return "";
  const latest = await latestEntryAsset();
  if (!latest || latest === current) return "";

  try {
    if (sessionStorage.getItem(`${UPDATE_DISMISS_PREFIX}:${latest}`) === "1") return "";
  } catch {
    // sessionStorage indisponível não deve interromper a detecção.
  }

  return latest;
}

function isFullScreenRouteSpinnerVisible() {
  const spinner = document.querySelector(
    ".min-h-screen.w-full.flex.items-center.justify-center.bg-background > .animate-spin",
  );
  if (!(spinner instanceof HTMLElement)) return false;
  const style = window.getComputedStyle(spinner);
  return style.display !== "none" && style.visibility !== "hidden";
}

function warmCriticalRoutes() {
  void Promise.allSettled([
    import("@/pages/ContentAutopilot"),
    import("@/pages/video/VideoHome"),
    import("@/pages/video/VideoProdutoPage"),
  ]);
}

export function FrontendRecoveryGuard() {
  const [stalled, setStalled] = useState(false);
  const [availableDeployment, setAvailableDeployment] = useState("");
  const spinnerSinceRef = useRef<number | null>(null);

  useEffect(() => {
    void clearObsoleteFrontendState();
    warmCriticalRoutes();

    const checkForAvailableDeployment = () => {
      if (document.visibilityState !== "visible" || isFrontendRefreshProtected()) return;
      void findAvailableDeployment().then((latest) => {
        if (latest) setAvailableDeployment(latest);
      });
    };

    checkForAvailableDeployment();

    const markStalledIfNotRecovered = (reason: string) => {
      void recoverFrontendOnce(reason).then((recovered) => {
        if (!recovered) setStalled(true);
      });
    };

    const onPreloadError = (event: Event) => {
      event.preventDefault();
      markStalledIfNotRecovered("falha de preload");
    };

    const onWindowError = (event: ErrorEvent) => {
      const message = event.error instanceof Error ? event.error.message : event.message;
      if (!CHUNK_ERROR_PATTERN.test(message ?? "")) return;
      event.preventDefault();
      markStalledIfNotRecovered("chunk, lazy module ou MIME desatualizado");
    };

    const onResourceError = (event: Event) => {
      const target = event.target;
      const assetUrl =
        target instanceof HTMLScriptElement
          ? target.src
          : target instanceof HTMLLinkElement
            ? target.href
            : "";
      if (!assetUrl.includes("/assets/")) return;
      markStalledIfNotRecovered("asset do frontend indisponível");
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
      if (!CHUNK_ERROR_PATTERN.test(message)) return;
      event.preventDefault();
      markStalledIfNotRecovered("import dinâmico ou lazy module");
    };

    const onVisibilityOrFocus = () => {
      checkForAvailableDeployment();
    };

    window.addEventListener("vite:preloadError", onPreloadError);
    window.addEventListener("error", onWindowError);
    window.addEventListener("error", onResourceError, true);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    window.addEventListener("focus", onVisibilityOrFocus);
    document.addEventListener("visibilitychange", onVisibilityOrFocus);

    const versionInterval = window.setInterval(() => {
      checkForAvailableDeployment();
    }, VERSION_CHECK_MS);

    const interval = window.setInterval(() => {
      if (!isFullScreenRouteSpinnerVisible()) {
        spinnerSinceRef.current = null;
        return;
      }

      if (spinnerSinceRef.current === null) {
        spinnerSinceRef.current = Date.now();
        return;
      }

      if (Date.now() - spinnerSinceRef.current < STUCK_SPINNER_MS) return;
      spinnerSinceRef.current = Date.now();
      markStalledIfNotRecovered("carregamento global travado");
    }, 1_000);

    return () => {
      window.removeEventListener("vite:preloadError", onPreloadError);
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("error", onResourceError, true);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.removeEventListener("focus", onVisibilityOrFocus);
      document.removeEventListener("visibilitychange", onVisibilityOrFocus);
      window.clearInterval(versionInterval);
      window.clearInterval(interval);
    };
  }, []);

  if (!stalled && !availableDeployment) return null;

  if (!stalled) {
    return (
      <div className="fixed bottom-4 right-4 z-[9999] w-[min(92vw,380px)] rounded-2xl border bg-card p-4 shadow-xl">
        <p className="text-sm font-semibold">Nova versão disponível</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          A atualização foi publicada sem interromper seu trabalho. Você pode continuar normalmente e atualizar quando for conveniente.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground"
            onClick={async () => {
              const now = Date.now();
              await clearObsoleteFrontendState();
              navigateToLatestVersion(now);
            }}
          >
            Atualizar agora
          </button>
          <button
            type="button"
            className="rounded-md border px-3 py-2 text-xs font-medium"
            onClick={() => {
              try {
                sessionStorage.setItem(`${UPDATE_DISMISS_PREFIX}:${availableDeployment}`, "1");
              } catch {
                // O aviso pode ser dispensado mesmo sem sessionStorage.
              }
              setAvailableDeployment("");
            }}
          >
            Continuar trabalhando
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-background/95 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-xl">
        <h2 className="text-lg font-semibold">A versão aberta não conseguiu carregar esta tela</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O VendorAI interrompeu o carregamento infinito. Você pode buscar a versão atual do sistema ou voltar ao painel sem ficar preso no spinner.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={async () => {
              const now = Date.now();
              try {
                sessionStorage.removeItem(currentBundleRecoveryKey());
                sessionStorage.setItem(RECOVERY_AT_KEY, String(now));
              } catch {
                // Continua mesmo sem sessionStorage.
              }
              await clearObsoleteFrontendState();
              navigateToLatestVersion(now);
            }}
          >
            Carregar versão atual
          </button>
          <button
            type="button"
            className="rounded-md border px-4 py-2 text-sm font-medium"
            onClick={() => {
              window.location.href = "/dashboard";
            }}
          >
            Voltar ao painel
          </button>
        </div>
      </div>
    </div>
  );
}
