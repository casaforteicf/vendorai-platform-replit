import { useEffect, useRef, useState } from "react";

const RECOVERY_KEY = "vendorai_frontend_recovery_at";
const RECOVERY_COOLDOWN_MS = 60_000;
const STUCK_SPINNER_MS = 15_000;
const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk|Unable to preload CSS/i;

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

function canAutoRecover() {
  const lastRecovery = Number(sessionStorage.getItem(RECOVERY_KEY) ?? 0);
  return !Number.isFinite(lastRecovery) || Date.now() - lastRecovery >= RECOVERY_COOLDOWN_MS;
}

async function recoverFrontendOnce(reason: string) {
  if (!canAutoRecover()) return false;

  sessionStorage.setItem(RECOVERY_KEY, String(Date.now()));
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
  // These are the two areas that already showed the stale/lazy-loading failure in production.
  // Warm them while the CRM shell is loading so the first click does not depend on a cold chunk.
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
    void clearObsoleteFrontendState();
    warmCriticalRoutes();

    const onPreloadError = (event: Event) => {
      event.preventDefault();
      void recoverFrontendOnce("falha de preload").then((recovered) => {
        if (!recovered) setStalled(true);
      });
    };

    const onWindowError = (event: ErrorEvent) => {
      const message = event.error instanceof Error ? event.error.message : event.message;
      if (!CHUNK_ERROR_PATTERN.test(message ?? "")) return;
      event.preventDefault();
      void recoverFrontendOnce("chunk desatualizado").then((recovered) => {
        if (!recovered) setStalled(true);
      });
    };

    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const message = event.reason instanceof Error ? event.reason.message : String(event.reason ?? "");
      if (!CHUNK_ERROR_PATTERN.test(message)) return;
      event.preventDefault();
      void recoverFrontendOnce("import dinâmico").then((recovered) => {
        if (!recovered) setStalled(true);
      });
    };

    window.addEventListener("vite:preloadError", onPreloadError);
    window.addEventListener("error", onWindowError);
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
      void recoverFrontendOnce("carregamento travado").then((recovered) => {
        if (!recovered) setStalled(true);
      });
    }, 1_000);

    return () => {
      window.removeEventListener("vite:preloadError", onPreloadError);
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      window.clearInterval(interval);
    };
  }, []);

  if (!stalled) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-background/95 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-xl">
        <h2 className="text-lg font-semibold">Não foi possível concluir o carregamento</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O VendorAI interrompeu o carregamento infinito. Atualize para buscar a versão mais recente do sistema.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={async () => {
              sessionStorage.removeItem(RECOVERY_KEY);
              await clearObsoleteFrontendState();
              window.location.reload();
            }}
          >
            Atualizar agora
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
