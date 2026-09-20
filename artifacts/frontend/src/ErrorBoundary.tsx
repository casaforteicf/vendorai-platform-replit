import * as React from "react";

const CHUNK_ERROR_PATTERN =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk|Unable to preload CSS|Expected a JavaScript-or-Wasm module script|module script.*MIME|MIME type.*text\/html|disallowed MIME type|server responded with a MIME type of ["']?text\/html/i;
const STALE_LAZY_MODULE_PATTERN =
  /Cannot read properties of undefined \(reading ["']default["']\)/i;
const STALE_MINIFIED_RUNTIME_PATTERN =
  /^[A-Za-z_$][\w$]* is not a function$/;

const RELOAD_FLAG_PREFIX = "vendorai_error_boundary_recovered_bundle";

function currentBundleReloadKey() {
  const entryScript = Array.from(document.scripts).find((script) =>
    script.type === "module" && /\/assets\/index-[^/]+\.js(?:$|\?)/.test(script.src),
  );
  return `${RELOAD_FLAG_PREFIX}:${entryScript?.src || "bootstrap"}`;
}

function bundleRecoveryWasTried() {
  try {
    return sessionStorage.getItem(currentBundleReloadKey()) === "1";
  } catch {
    return false;
  }
}

function markBundleRecoveryTried() {
  try {
    sessionStorage.setItem(currentBundleReloadKey(), "1");
  } catch {
    // sessionStorage pode estar indisponível em alguns navegadores embutidos.
  }
}

async function clearObsoleteFrontendState() {
  const cleanup = async () => {
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
  };

  // Alguns WebViews Android podem deixar APIs de SW/Cache penduradas.
  // A recuperação nunca pode ficar presa na tela "Carregando a versão atual".
  await Promise.race([
    cleanup(),
    new Promise<void>((resolve) => window.setTimeout(resolve, 1_500)),
  ]);
}
function isKnownStaleAssetError(error: Error) {
  return (
    CHUNK_ERROR_PATTERN.test(error.message) ||
    STALE_LAZY_MODULE_PATTERN.test(error.message) ||
    STALE_MINIFIED_RUNTIME_PATTERN.test(error.message.trim())
  );
}

async function carregarVersaoAtual(force = false, targetPath?: string) {
  const now = Date.now();
  try {
    // O bloqueio precisa ser por bundle, não por uma janela global de tempo.
    // Em produção podem ocorrer vários deploys em sequência; um timestamp global
    // fazia a segunda troca de versão cair na tela manual mesmo sendo outro bundle.
    if (force) sessionStorage.removeItem(currentBundleReloadKey());
  } catch {
    // sessionStorage indisponível não deve bloquear a recuperação.
  }

  await clearObsoleteFrontendState();

  try {
    const url = targetPath
      ? new URL(targetPath, window.location.origin)
      : new URL(window.location.href);
    url.searchParams.set("__vendorai_refresh", String(now));
    window.location.replace(url.toString());
  } catch {
    if (targetPath) {
      window.location.href = targetPath;
      return;
    }
    window.location.reload();
  }
}

// Um deploy pode trocar os hashes dos chunks enquanto a sessão continua aberta.
// Também há WebViews mobile que reportam esse mesmo cenário com mensagens genéricas.
// Por isso fazemos uma única tentativa automática por bundle. Se o mesmo bundle
// falhar novamente, mostramos uma recuperação manual e um caminho seguro ao painel.
function tentarRecuperarDeVersaoAntiga(error: Error): boolean {
  const knownStaleAssetError = isKnownStaleAssetError(error);

  if (bundleRecoveryWasTried()) return false;

  // Erros conhecidos de asset antigo sempre recuperam. Para mensagens genéricas,
  // permitimos a mesma tentativa única: um ErrorBoundary de topo já perdeu o estado
  // da tela, então um reload controlado é preferível a expor uma falha transitória.
  if (!knownStaleAssetError && !error.message) return false;

  markBundleRecoveryTried();
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
      const staleAssetFailure = isKnownStaleAssetError(this.state.error);
      const currentPath = typeof window !== "undefined" ? window.location.pathname : "";

      return (
        <div style={{ padding: 24, fontFamily: "sans-serif", background: "#f8fafc", color: "#334155", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ maxWidth: 520, width: "100%", background: "white", border: "1px solid #e2e8f0", borderRadius: 16, padding: 24, boxShadow: "0 10px 30px rgba(15,23,42,.08)" }}>
            <h1 style={{ color: "#0f172a", fontSize: 18, margin: 0 }}>Não foi possível carregar esta tela</h1>
            <p style={{ marginTop: 10, fontSize: 14, lineHeight: 1.5 }}>
              {staleAssetFailure
                ? "Uma parte do aplicativo ficou incompatível com a versão publicada. O VendorAI pode buscar a versão atual ou voltar ao painel sem prender você nesta tela."
                : "O VendorAI interrompeu o erro em vez de deixar a tela carregando indefinidamente."}
            </p>
            <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                type="button"
                style={{ border: 0, borderRadius: 8, padding: "10px 14px", fontWeight: 600, cursor: "pointer", background: "#D9673E", color: "white" }}
                onClick={() => {
                  this.setState({ reloading: true });
                  void carregarVersaoAtual(true);
                }}
              >
                Carregar versão atual
              </button>
              {currentPath !== "/dashboard" && (
                <button
                  type="button"
                  style={{ border: "1px solid #cbd5e1", borderRadius: 8, padding: "10px 14px", fontWeight: 600, cursor: "pointer", background: "white", color: "#334155" }}
                  onClick={() => {
                    this.setState({ reloading: true });
                    void carregarVersaoAtual(true, "/dashboard");
                  }}
                >
                  Voltar ao painel
                </button>
              )}
            </div>
            <details style={{ marginTop: 16, fontSize: 12, color: "#64748b" }}>
              <summary>Detalhes técnicos</summary>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {currentPath ? `Rota: ${currentPath}\n` : ""}{this.state.error.message}
              </p>
            </details>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
