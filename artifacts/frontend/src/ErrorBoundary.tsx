import * as React from "react";

const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk|Unable to preload CSS|Expected a JavaScript-or-Wasm module script|module script.*MIME|MIME type.*text\/html|disallowed MIME type|server responded with a MIME type of ["']?text\/html/i;
const STALE_LAZY_MODULE_PATTERN =
  /Cannot read properties of undefined \(reading ["']default["']\)/i;

const RELOAD_FLAG_PREFIX = "vendorai_error_boundary_recovered_bundle";
const RECOVERY_AT_KEY = "vendorai_stale_asset_recovery_at";
const RECOVERY_WINDOW_MS = 30_000;

function currentBundleReloadKey() {
  const entryScript = Array.from(document.scripts).find((script) =>
    script.type === "module" && /\/assets\/index-[^/]+\.js(?:$|\?)/.test(script.src),
  );
  return `${RELOAD_FLAG_PREFIX}:${entryScript?.src || "bootstrap"}`;
}

async function clearObsoleteFrontendState() {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.allSettled(registrations.map((registration) => registration.unregister()));
    }
  } catch {
    // Recuperação best-effort: a limpeza não pode impedir o reload.
  }

  try {
    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.allSettled(cacheNames.map((cacheName) => caches.delete(cacheName)));
    }
  } catch {
    // Mesmo princípio para Cache Storage.
  }
}

function wasRecoveredRecently() {
  try {
    const lastRecoveryAt = Number(sessionStorage.getItem(RECOVERY_AT_KEY) || "0");
    return Date.now() - lastRecoveryAt < RECOVERY_WINDOW_MS;
  } catch {
    return false;
  }
}

async function carregarVersaoAtual(force = false) {
  const now = Date.now();
  try {
    if (!force && wasRecoveredRecently()) return;
    sessionStorage.setItem(RECOVERY_AT_KEY, String(now));
    sessionStorage.removeItem(currentBundleReloadKey());
  } catch {
    // sessionStorage indisponível não deve bloquear a recuperação.
  }

  await clearObsoleteFrontendState();

  try {
    const url = new URL(window.location.href);
    url.searchParams.set("__vendorai_refresh", String(now));
    window.location.replace(url.toString());
  } catch {
    window.location.reload();
  }
}

// A sessão pode permanecer aberta enquanto um novo deploy troca os hashes dos
// chunks. Recuperamos automaticamente uma única vez numa janela curta. Se a
// versão recém-carregada falhar de novo, paramos e mostramos o erro em vez de
// criar um loop de recarregamento.
function tentarRecuperarDeVersaoAntiga(error: Error): boolean {
  if (!CHUNK_ERROR_PATTERN.test(error.message) && !STALE_LAZY_MODULE_PATTERN.test(error.message)) {
    return false;
  }
  if (wasRecoveredRecently()) return false;
  void carregarVersaoAtual(false);
  return true;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; reloading: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null, reloading: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { error, reloading: false };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("ErrorBoundary capturou:", error, info);
    if (tentarRecuperarDeVersaoAntiga(error)) {
      this.setState({ reloading: true });
    }
  }

  render() {
    if (this.state.reloading) {
      return (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", fontFamily: "sans-serif", color: "#666" }}>
          Carregando a versão atual do VendorAI...
        </div>
      );
    }
    if (this.state.error) {
      return (
        <div style={{ padding: 24, fontFamily: "sans-serif", background: "#f8fafc", color: "#334155", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 520, width: "100%", background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24, boxShadow: "0 10px 30px rgba(15,23,42,.08)" }}>
            <h1 style={{ color: "#0f172a", fontSize: 18, margin: 0 }}>Não foi possível carregar esta tela</h1>
            <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5 }}>
              O VendorAI interrompeu o erro em vez de deixar a tela carregando indefinidamente.
            </p>
            <button
              type="button"
              style={{ marginTop: 16, border: 0, borderRadius: 8, padding: "10px 14px", fontWeight: 600, cursor: "pointer", background: "#D9673E", color: "white" }}
              onClick={() => {
                this.setState({ reloading: true });
                void carregarVersaoAtual(true);
              }}
            >
              Carregar versão atual
            </button>
            <details style={{ marginTop: 16, fontSize: 12, color: "#64748b" }}>
              <summary>Detalhes técnicos</summary>
              <p style={{ whiteSpace: "pre-wrap" }}>{this.state.error.message}</p>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
