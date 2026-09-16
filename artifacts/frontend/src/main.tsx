import { createRoot } from "react-dom/client";
import { lazy, Suspense, useLayoutEffect } from "react";
import { useLocation } from "wouter";
import App from "./App";
import SubdomainSite from "./SubdomainSite";
import { ErrorBoundary } from "./ErrorBoundary";
import { FrontendRecoveryGuard } from "./components/FrontendRecoveryGuard";
import { BudgetImportAutofill } from "./components/BudgetImportAutofill";
import { AiBudgetUsageIndicator } from "./components/AiBudgetUsageIndicator";
import { GrowthLabMenuInjector } from "./components/GrowthLabMenuInjector";
import { MediaMenuInjector } from "./components/media/MediaMenuInjector";
import { VideoRouteThemeSync } from "./components/video/VideoRouteThemeSync";
import { JarvisVoiceReplayControl } from "./components/support/JarvisVoiceReplayControl";
import { JarvisResponseHealthNotice } from "./components/support/JarvisResponseHealthNotice";
import { UnifiedAssistantLauncher } from "./components/UnifiedAssistantLauncher";
import "./components/admin/devAgentRuntimeJsBridge";
import "./components/admin/devAgentRuntimeHttpBridge";
import "./components/admin/devAgentVisualContextBridge";
import "./lib/jarvisArtifactFetchBridge";
import "./lib/jarvisExecutiveContextBridge";
import "./lib/jarvisVoiceResponseBridge";
import "./lib/jarvisVoiceDictationBridge";
import "./lib/jarvisUndoBridge";
import "./lib/jarvisBargeInBridge";
import "./lib/jarvisPageContextBridge";
import "./lib/jarvisAutonomyContextBridge";
import "./lib/jarvisProactiveVoiceBridge";
import "./lib/jarvisCapabilityRuntimeBridge";
import "./lib/jarvisResponseHealthBridge";
import "./lib/jarvisMobileExperienceBridge";
import "./lib/jarvisLauncherVoiceBridge";
import "./lib/partnerAttributionBridge";
import { I18nProvider } from "./i18n";
import "./index.css";
import "./ui-standard.css";
import "./sidebar-utilities.css";
import "./compact-page-titles.css";
import "./logo-top-right.css";
import "./site-generator-fix.css";
import "./video-route-theme.css";
import "./budget-dialog-policy.css";
import "./leads-table-fix.css";
import "./mobile-floating-controls.css";
import "./jarvis-mobile.css";
import "./modules/arqdor/theme/arqdor-theme.css";
import { setupApiClient } from "./lib/api";
import { installVisitorTelemetry } from "./lib/visitorIntelligence";

const WorkspaceEnhancements = lazy(() => import("./components/runtime/WorkspaceEnhancements"));

setupApiClient();
installVisitorTelemetry();

document.documentElement.dataset.vendoraiBuild = "media-production-isolation-20260916";

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

const hostname = window.location.hostname;
const tenantSiteMatch = hostname.match(/^([a-z0-9-]+)\.appvendorai\.com$/);
const isAppHost = hostname === "app.appvendorai.com" || /^[a-z0-9-]+\.app\.appvendorai\.com$/.test(hostname);
const tenantSlugForSite = isAppHost ? null : (tenantSiteMatch?.[1] ?? null);

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

function WorkspaceEnhancementsGate() {
  const [location] = useLocation();
  const pathname = location.split("?")[0] || "/";
  const params = new URLSearchParams(window.location.search);
  const contentTab = params.get("tab") ?? "visao-geral";
  const isContentProduction = pathname === "/content" && (contentTab === "conteudos" || contentTab === "gerador");
  const relevantWorkspace =
    pathname === "/content" ||
    pathname.startsWith("/marketing") ||
    pathname.startsWith("/midias") ||
    pathname.startsWith("/ads") ||
    pathname.startsWith("/site") ||
    pathname.startsWith("/catalog") ||
    pathname.startsWith("/convers") ||
    pathname.startsWith("/content-studio/video");

  // A tela de geração tem runtime próprio. Não carregamos o pacote legado de
  // bridges nessa rota, evitando polling duplicado, observadores de DOM e
  // consultas repetidas exatamente enquanto as peças estão sendo produzidas.
  if (!relevantWorkspace || isContentProduction) return null;

  return (
    <Suspense fallback={null}>
      <WorkspaceEnhancements />
    </Suspense>
  );
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <I18nProvider>
      {tenantSlugForSite ? (
        <SubdomainSite slug={tenantSlugForSite} />
      ) : (
        <>
          <FrontendRecoveryGuard />
          <VideoRouteThemeSync />
          <CanonicalMarketingRouteBridge />
          <App />
          <AiBudgetUsageIndicator />
          <GrowthLabMenuInjector />
          <UnifiedAssistantLauncher />
          <JarvisVoiceReplayControl />
          <JarvisResponseHealthNotice />
          <BudgetImportAutofill />
          <MediaMenuInjector />
          <WorkspaceEnhancementsGate />
        </>
      )}
    </I18nProvider>
  </ErrorBoundary>,
);
