import { useEffect, useRef, useState } from "react";

const RECOVERY_KEY_PREFIX = "vendorai_frontend_recovered_bundle";
const STUCK_SPINNER_MS = 12_000;
const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk|Unable to preload CSS|Expected a JavaScript-or-Wasm module script|module script.*MIME|MIME type.*text\/html|disallowed MIME type|server responded with a MIME type of ["']?text\/html/i;

function currentBundleRecoveryKey() {
  const entryScript = Array.from(document.scripts).find((script) =>
    script.type === "module" && /\/assets\/index-[^/]+\.js(?:$|\?)/.test(script.src),
  );
  return `${RECOVERY_KEY_PREFIX}:${entryScript?.src || "bootstrap"}`;
}

async function clearObsoleteFrontendState() {
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
}

function canAutoRecoverCurrentBundle() {
  return sessionStorage.getItem(currentBundleRecoveryKey()) !== "1";
}

async function recoverFrontendOnce(reason: string) {
  const recoveryKey = currentBundleRecoveryKey();
  if (!canAutoRecoverCurrentBundle()) return false;

  // One automatic reload PER entry bundle, rather than one reload per minute.
  // When a new deploy changes index-<hash>.js, that new bundle gets its own
  // recovery allowance. If the same broken bundle comes back, we stop and show
  // an explicit recovery UI instead of creating a reload loop.
  sessionStorage.setItem(recoveryKey, "1");
  console.warn(`[VendorAI] Recuperando frontend após ${reason}.`);
  await clearObsoleteFrontendState();
  window.location.reload();
  return true;
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
  // Warm the areas that already exposed stale lazy chunks in production.
  // If the current entry bundle references an asset from an older deploy,
  // this also surfaces the failure immediately so recovery can refresh it.
  void Promise.allSettled([
    import("@/pages/ContentAutopilot"),
    import("@/pages/video/VideoHome"),
    import("@/pages/video/VideoProdutoPage"),
  ]);
}

export function FrontendRecoveryGuard() {
  const [stalled, setStalled] = useState(false);
  const spinnerSinceRef = useRef<number | null>(null);

  useEffect(() => {
    // Retire any worker/cache left by versions prior to the CRM disabling PWA.
    void clearObsoleteFrontendState();
    warmCriticalRoutes();

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
      markStalledIfNotRecovered("chunk ou MIME desatualizado");
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
      markStalledIfNotRecovered("import dinâmico");
    };

    window.addEventListener("vite:preloadError", onPreloadError);
    window.addEventListener("error", onWindowError);
    window.addEventListener("error", onResourceError, true);
    window.addEventListener("unhandledrejection", onUnhandledRejection);

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
      window.clearInterval(interval);
    };
  }, []);

  if (!stalled) return null;

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
              sessionStorage.removeItem(currentBundleRecoveryKey());
              await clearObsoleteFrontendState();
              window.location.reload();
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
