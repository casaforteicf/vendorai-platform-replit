import { createRoot } from "react-dom/client";
import { lazy, Suspense, useEffect, useLayoutEffect, useState } from "react";
import App from "./App";
import { useLocation } from "wouter";
import { ErrorBoundary } from "./ErrorBoundary";
import { FrontendRecoveryGuard } from "./components/FrontendRecoveryGuard";
import "./lib/partnerAttributionBridge";
import { I18nProvider } from "./i18n";
import "./index.css";
import "./ui-standard.css";
import "./sidebar-utilities.css";
import "./compact-page-titles.css";
import "./logo-top-right.css";
import "./site-generator-fix.css";
import "./budget-dialog-policy.css";
import "./mobile-floating-controls.css";
import "./vendorai-ui2.css";
import "./jarvis-mobile.css";
import { setupApiClient } from "./lib/api";
import { installVisitorTelemetry } from "./lib/visitorIntelligence";

function BootstrapFallback() {
  const [stalled, setStalled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setStalled(true), 8_000);
    return () => window.clearTimeout(timer);
  }, []);

  const reloadLatest = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("__vendorai_refresh", String(Date.now()));
    window.location.replace(url.toString());
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#f8fafc",
        color: "#334155",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: 24,
      }}
    >
      <div style={{ width: "100%", maxWidth: 440, textAlign: "center" }}>
        <div
          aria-label="Carregando Vendor.ai"
          style={{
            width: 34,
            height: 34,
            margin: "0 auto 16px",
            borderRadius: "999px",
            border: "3px solid #e2e8f0",
            borderTopColor: "#D9673E",
            animation: "vendorai-bootstrap-spin 0.8s linear infinite",
          }}
        />
        <style>{`@keyframes vendorai-bootstrap-spin { to { transform: rotate(360deg); } }`}</style>
        <div style={{ fontSize: 16, fontWeight: 700 }}>Carregando Vendor.ai…</div>
        <div style={{ marginTop: 6, fontSize: 13, color: "#64748b" }}>
          Preparando a versão atual do sistema.
        </div>

        {stalled ? (
          <div style={{ marginTop: 20 }}>
            <div style={{ fontSize: 13, color: "#475569", marginBottom: 12 }}>
              O aplicativo demorou mais que o esperado para iniciar. Vamos buscar a versão mais recente.
            </div>
            <button
              type="button"
              onClick={reloadLatest}
              style={{
                border: 0,
                borderRadius: 8,
                background: "#D9673E",
                color: "#fff",
                padding: "10px 16px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Carregar versão atual
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const SubdomainSite = lazy(() => import("./SubdomainSite"));
const BudgetImportAutofill = lazy(() => import("./components/BudgetImportAutofill").then((m) => ({ default: m.BudgetImportAutofill })));
const AiBudgetUsageIndicator = lazy(() => import("./components/AiBudgetUsageIndicator").then((m) => ({ default: m.AiBudgetUsageIndicator })));
const GrowthLabMenuInjector = lazy(() => import("./components/GrowthLabMenuInjector").then((m) => ({ default: m.GrowthLabMenuInjector })));
const MediaMenuInjector = lazy(() => import("./components/media/MediaMenuInjector").then((m) => ({ default: m.MediaMenuInjector })));
const VideoRouteThemeSync = lazy(() => import("./components/video/VideoRouteThemeSync").then((m) => ({ default: m.VideoRouteThemeSync })));
const JarvisVoiceReplayControl = lazy(() => import("./components/support/JarvisVoiceReplayControl").then((m) => ({ default: m.JarvisVoiceReplayControl })));
const JarvisResponseHealthNotice = lazy(() => import("./components/support/JarvisResponseHealthNotice").then((m) => ({ default: m.JarvisResponseHealthNotice })));
const UnifiedAssistantLauncher = lazy(() => import("./components/UnifiedAssistantLauncher").then((m) => ({ default: m.UnifiedAssistantLauncher })));
const WorkspaceEnhancements = lazy(() => import("./components/runtime/WorkspaceEnhancements"));

setupApiClient();
installVisitorTelemetry();

function scheduleJarvisRuntimeBridges() {
  const load = () => {
    void Promise.all([
      import("./lib/jarvisArtifactFetchBridge"),
      import("./lib/jarvisExecutiveContextBridge"),
      import("./lib/jarvisVoiceResponseBridge"),
      import("./lib/jarvisVoiceDictationBridge"),
      import("./lib/jarvisUndoBridge"),
      import("./lib/jarvisBargeInBridge"),
      import("./lib/jarvisPageContextBridge"),
      import("./lib/jarvisAutonomyContextBridge"),
      import("./lib/jarvisProactiveVoiceBridge"),
      import("./lib/jarvisCapabilityRuntimeBridge"),
      import("./lib/jarvisResponseHealthBridge"),
      import("./lib/jarvisMobileExperienceBridge"),
      import("./lib/jarvisLauncherVoiceBridge"),
    ]);
  };

  const win = window as typeof window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  };

  if (typeof win.requestIdleCallback === "function") {
    win.requestIdleCallback(load, { timeout: 900 });
  } else {
    window.setTimeout(load, 350);
  }
}

scheduleJarvisRuntimeBridges();

function scheduleDevAgentRuntimeBridges() {
  const load = () => {
    void Promise.all([
      import("./components/admin/devAgentRuntimeJsBridge"),
      import("./components/admin/devAgentRuntimeHttpBridge"),
      import("./components/admin/devAgentVisualContextBridge"),
    ]);
  };

  const win = window as typeof window & {
    requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
  };

  if (typeof win.requestIdleCallback === "function") {
    win.requestIdleCallback(load, { timeout: 1400 });
  } else {
    window.setTimeout(load, 700);
  }
}

scheduleDevAgentRuntimeBridges();

document.documentElement.dataset.vendoraiBuild = "sa-vertical-nav-fix-20260916a";

// O parâmetro é acrescentado somente pelo bootstrap quando detecta um chunk
// obsoleto. Depois que a nova versão conseguiu iniciar, retire-o da URL para
// que o Clear-Site-Data de recuperação não seja reenviado em toda navegação.
const recoveryUrl = new URL(window.location.href);
if (recoveryUrl.searchParams.has("__vendorai_refresh")) {
  recoveryUrl.searchParams.delete("__vendorai_refresh");
  const cleanUrl = `${recoveryUrl.pathname}${recoveryUrl.search}${recoveryUrl.hash}`;
  window.history.replaceState(window.history.state, "", cleanUrl);
}

const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const handoffToken = hashParams.get("vendorai_token");
const handoffDemoExpiresAt = hashParams.get("demo_expires_at");
const onboardingContext = Object.fromEntries(
  Array.from(hashParams.entries())
    .filter(([key]) => key.startsWith("onboarding_"))
    .map(([key, value]) => [key.slice("onboarding_".length), value]),
);

if (Object.keys(onboardingContext).length > 0) {
  try {
    localStorage.setItem("vendorai_onboarding_context_v1", JSON.stringify({
      ...onboardingContext,
      capturedAt: new Date().toISOString(),
    }));
  } catch {
    // O handoff de autenticação continua mesmo se o storage estiver indisponível.
  }
}

if (handoffToken) {
  localStorage.setItem("vendorai_token", handoffToken);
  if (handoffDemoExpiresAt) {
    localStorage.setItem("vendorai_demo_expires_at", handoffDemoExpiresAt);
  }
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

const SUPER_ADMIN_USER_CACHE_KEY = "vendorai_user_cache";
const SUPER_ADMIN_TENANT_OVERRIDE_KEY = "vendorai_sa_tenant_override";
const GUARDED_VERTICAL_ROUTES = [
  {
    matches: (pathname: string) => pathname === "/obras" || pathname.startsWith("/obras/") || pathname === "/insumos" || pathname === "/composicoes",
    vertical: "Construção & Reforma",
    name: "Preview — Construção Civil",
    slug: "construcao",
  },
  {
    matches: (pathname: string) => pathname.startsWith("/varejo/"),
    vertical: "Varejo de Roupas & Acessórios",
    name: "Preview — Varejo de Moda",
    slug: "varejo",
  },
  {
    matches: (pathname: string) => pathname === "/supermercado" || pathname.startsWith("/supermercado/"),
    vertical: "Supermercado",
    name: "Preview — Supermercado",
    slug: "supermercado",
  },
] as const;

function installSuperAdminVerticalNavigationBridge() {
  document.addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;

    const anchor = event.target.closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement)) return;

    const targetUrl = new URL(anchor.href, window.location.origin);
    if (targetUrl.origin !== window.location.origin) return;

    const guarded = GUARDED_VERTICAL_ROUTES.find((entry) => entry.matches(targetUrl.pathname));
    if (!guarded) return;

    let cachedUser: { platformRole?: string | null; tenantId?: string | null } | null = null;
    try {
      const rawUser = localStorage.getItem(SUPER_ADMIN_USER_CACHE_KEY);
      cachedUser = rawUser ? JSON.parse(rawUser) : null;
    } catch {
      return;
    }
    if (cachedUser?.platformRole !== "super_admin") return;

    let currentOverride: { vertical?: string | null; preview?: boolean } | null = null;
    try {
      const rawOverride = localStorage.getItem(SUPER_ADMIN_TENANT_OVERRIDE_KEY);
      currentOverride = rawOverride ? JSON.parse(rawOverride) : null;
    } catch {
      currentOverride = null;
    }

    // Um tenant real selecionado nunca é trocado silenciosamente. O bridge só
    // corrige a navegação do Super Admin puro/preview, que antes caía de volta
    // em /admin/verticais mesmo quando ele clicava explicitamente em Obras,
    // Varejo ou Supermercado.
    if (currentOverride && currentOverride.preview !== true) return;
    if (currentOverride?.vertical === guarded.vertical) return;

    const previewTenantId = cachedUser.tenantId || `__vertical_preview__:sidebar:${guarded.slug}`;
    try {
      localStorage.setItem(SUPER_ADMIN_TENANT_OVERRIDE_KEY, JSON.stringify({
        id: previewTenantId,
        name: guarded.name,
        vertical: guarded.vertical,
        preview: true,
      }));
    } catch {
      return;
    }

    // O AuthProvider lê o override no bootstrap. Recarregar apenas nesta troca
    // de vertical garante que o guard da rota receba o contexto correto antes
    // de decidir qualquer redirecionamento.
    event.preventDefault();
    event.stopImmediatePropagation();
    window.location.assign(`${targetUrl.pathname}${targetUrl.search}${targetUrl.hash}`);
  }, true);
}

installSuperAdminVerticalNavigationBridge();

const hostname = window.location.hostname;
const tenantSiteMatch = hostname.match(/^([a-z0-9-]+)\.appvendorai\.com$/);
const isAppHost = hostname === "app.appvendorai.com"
  || hostname === "homolog.appvendorai.com"
  || hostname === "homolog2.appvendorai.com"
  || /^[a-z0-9-]+\.app\.appvendorai\.com$/.test(hostname);
const tenantSlugForSite = isAppHost ? null : (tenantSiteMatch?.[1] ?? null);

function RouteScopedStyles() {
  const [location] = useLocation();

  useEffect(() => {
    const pathname = location.split("?")[0] || "/";

    if (pathname.startsWith("/content-studio/video")) {
      void import("./video-route-theme.css");
    }

    if (pathname.startsWith("/leads") || pathname.startsWith("/trabalho")) {
      void import("./leads-table-fix.css");
    }

    if (
      pathname.startsWith("/arch") ||
      pathname.startsWith("/tour/arqdor") ||
      pathname.startsWith("/projeto/")
    ) {
      void import("./modules/arqdor/theme/arqdor-theme.css");
    }
  }, [location]);

  return null;
}

function CanonicalMarketingRouteBridge() {
  const [location] = useLocation();

  useLayoutEffect(() => {
    if (!location.startsWith("/marketing/plano-de-midia")) return;

    const params = new URLSearchParams(window.location.search);
    params.set("tab", "planejamento");
    const target = `/content?${params.toString()}`;
    window.history.replaceState(window.history.state, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [location]);

  return null;
}

function DeferredGlobalAuxiliaries() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let timeoutId: number | undefined;
    let idleId: number | undefined;
    const win = window as typeof window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof win.requestIdleCallback === "function") {
      idleId = win.requestIdleCallback(() => setReady(true), { timeout: 1200 });
    } else {
      timeoutId = window.setTimeout(() => setReady(true), 350);
    }

    return () => {
      if (idleId !== undefined && typeof win.cancelIdleCallback === "function") win.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, []);

  if (!ready) return null;

  return (
    <Suspense fallback={null}>
      <AiBudgetUsageIndicator />
      <GrowthLabMenuInjector />
      <UnifiedAssistantLauncher />
      <JarvisVoiceReplayControl />
      <JarvisResponseHealthNotice />
      <BudgetImportAutofill />
      <MediaMenuInjector />
    </Suspense>
  );
}

function VideoRouteThemeGate() {
  const [location] = useLocation();
  if (!location.startsWith("/content-studio/video")) return null;
  return (
    <Suspense fallback={null}>
      <VideoRouteThemeSync />
    </Suspense>
  );
}

function WorkspaceEnhancementsGate() {
  const [location] = useLocation();
  const pathname = location.split("?")[0] || "/";
  const params = new URLSearchParams(window.location.search);
  const contentTab = params.get("tab") ?? "visao-geral";
  const isContentProduction = pathname === "/content" && (contentTab === "conteudos" || contentTab === "gerador");
  const isMediaLibrary = pathname.startsWith("/midias");
  const relevantWorkspace =
    pathname === "/content" ||
    pathname.startsWith("/marketing") ||
    isMediaLibrary ||
    pathname.startsWith("/ads") ||
    pathname.startsWith("/site") ||
    pathname.startsWith("/catalog") ||
    pathname.startsWith("/convers") ||
    pathname.startsWith("/content-studio/video");

  // A geração e a Biblioteca de Mídias já possuem runtime próprio.
  // Em /midias não carregamos o pacote legado de bridges: ele inclui polling,
  // MutationObserver e indexação automática, que podem saturar a thread principal
  // quando há muitas imagens e vídeos e deixar a aba inteira sem resposta.
  if (!relevantWorkspace || isContentProduction || isMediaLibrary) return null;

  return (
    <Suspense fallback={null}>
      <WorkspaceEnhancements />
    </Suspense>
  );
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <I18nProvider>
      <Suspense fallback={<BootstrapFallback />}>
        {tenantSlugForSite ? (
          <SubdomainSite slug={tenantSlugForSite} />
        ) : (
          <>
            <FrontendRecoveryGuard />
            <RouteScopedStyles />
            <VideoRouteThemeGate />
            <CanonicalMarketingRouteBridge />
            <App />
            <DeferredGlobalAuxiliaries />
            <WorkspaceEnhancementsGate />
          </>
        )}
      </Suspense>
    </I18nProvider>
  </ErrorBoundary>,
);