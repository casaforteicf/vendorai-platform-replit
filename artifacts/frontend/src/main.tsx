import { createRoot } from "react-dom/client";
import { useLayoutEffect } from "react";
import App from "./App";
import SubdomainSite from "./SubdomainSite";
import { ErrorBoundary } from "./ErrorBoundary";
import { FrontendRecoveryGuard } from "./components/FrontendRecoveryGuard";
import { BudgetImportAutofill } from "./components/BudgetImportAutofill";
import { GrowthLabMenuInjector } from "./components/GrowthLabMenuInjector";
import { MediaMenuInjector } from "./components/media/MediaMenuInjector";
import { MediaAdsBridge } from "./components/media/MediaAdsBridge";
import { MediaSitesBridge } from "./components/media/MediaSitesBridge";
import { MediaCatalogBridge } from "./components/media/MediaCatalogBridge";
import { MediaContentStudioBridge } from "./components/media/MediaContentStudioBridge";
import { MediaMarketingContentBridge } from "./components/media/MediaMarketingContentBridge";
import { MediaConversationsBridge } from "./components/media/MediaConversationsBridge";
import { MediaAiBaseBridge } from "./components/media/MediaAiBaseBridge";
import { MediaAiBaseWorkspaceNav } from "./components/media/MediaAiBaseWorkspaceNav";
import { MediaDeleteSelectionBridge } from "./components/media/MediaDeleteSelectionBridge";
import { MediaLibraryWorkflowBridge } from "./components/media/MediaLibraryWorkflowBridge";
import { MediaIntelligenceIndexBridge } from "./components/media/MediaIntelligenceIndexBridge";
import { ContentGeneratorQueueUxBridge } from "./components/marketing/ContentGeneratorQueueUxBridge";
import { ContentPlanVisualCompletionBridge } from "./components/marketing/ContentPlanVisualCompletionBridge";
import { MediaPlanProductionCompatibilityBridge } from "./components/marketing/MediaPlanProductionCompatibilityBridge";
import { MediaPlanProjectKindCompatibilityBridge } from "./components/marketing/MediaPlanProjectKindCompatibilityBridge";
import { MediaPlanAutoProductionBridge } from "./components/marketing/MediaPlanAutoProductionBridge";
import { MediaPlanFailedRetryBridge } from "./components/marketing/MediaPlanFailedRetryBridge";
import { MediaPlanPublicationModeControl } from "./components/marketing/MediaPlanPublicationModeControl";
import { MediaPlanLandingPageStrategy } from "./components/marketing/MediaPlanLandingPageStrategy";
import { MediaPlanPreparationActionsBridge } from "./components/marketing/MediaPlanPreparationActionsBridge";
import { MediaPlanLifecycleSummary } from "./components/marketing/MediaPlanLifecycleSummary";
import { CheckoutConversionFunnel } from "./components/marketing/CheckoutConversionFunnel";
import { AcquisitionInvestmentIntelligence } from "./components/marketing/AcquisitionInvestmentIntelligence";
import { AcquisitionMasterOrchestrator } from "./components/marketing/AcquisitionMasterOrchestrator";
import { MediaPlanPerformanceCommandCenter } from "./components/marketing/MediaPlanPerformanceCommandCenter";
import { MediaPlanBudgetExecutionBridge } from "./components/marketing/MediaPlanBudgetExecutionBridge";
import { MarketingAutonomyControl } from "./components/marketing/MarketingAutonomyControl";
import { MarketingAutonomyAudit } from "./components/marketing/MarketingAutonomyAudit";
import { CampaignAbTestControl } from "./components/marketing/CampaignAbTestControl";
import { CampaignAbWinnerApprovalBridge } from "./components/marketing/CampaignAbWinnerApprovalBridge";
import { MediaPlanProductionRuntimeBridge } from "./components/marketing/MediaPlanProductionRuntimeBridge";
import { AdsCreativePreviewBridge } from "./components/marketing/AdsCreativePreviewBridge";
import { SearchPerformanceTrackingBridge } from "./components/marketing/SearchPerformanceTrackingBridge";
import { SeoAuthorityTrackingBridge } from "./components/marketing/SeoAuthorityTrackingBridge";
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

setupApiClient();
installVisitorTelemetry();

document.documentElement.dataset.vendoraiBuild = "asset-versioning-20260910";

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
  useLayoutEffect(() => {
    const canonicalize = () => {
      if (window.location.pathname !== "/marketing/plano-de-midia") return;
      const params = new URLSearchParams(window.location.search);
      params.set("tab", "planejamento");
      const target = `/content?${params.toString()}`;
      window.history.replaceState(window.history.state, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));
    };

    canonicalize();
    window.addEventListener("popstate", canonicalize);
    const timer = window.setInterval(canonicalize, 250);
    return () => {
      window.removeEventListener("popstate", canonicalize);
      window.clearInterval(timer);
    };
  }, []);

  return null;
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
          <GrowthLabMenuInjector />
          <UnifiedAssistantLauncher />
          <JarvisVoiceReplayControl />
          <JarvisResponseHealthNotice />
          <BudgetImportAutofill />
          <MediaMenuInjector />
          <MediaAdsBridge />
          <MediaSitesBridge />
          <MediaCatalogBridge />
          <MediaContentStudioBridge />
          <MediaMarketingContentBridge />
          <MediaConversationsBridge />
          <MediaAiBaseBridge />
          <MediaLibraryWorkflowBridge />
          <MediaIntelligenceIndexBridge />
          <MediaAiBaseWorkspaceNav />
          <MediaDeleteSelectionBridge />
          <ContentGeneratorQueueUxBridge />
          <ContentPlanVisualCompletionBridge />
          <MediaPlanProductionCompatibilityBridge />
          <MediaPlanProjectKindCompatibilityBridge />
          <MediaPlanAutoProductionBridge />
          <MediaPlanFailedRetryBridge />
          <MediaPlanLandingPageStrategy />
          <MediaPlanPublicationModeControl />
          <MediaPlanPreparationActionsBridge />
          <MediaPlanLifecycleSummary />
          <CheckoutConversionFunnel />
          <AcquisitionInvestmentIntelligence />
          <AcquisitionMasterOrchestrator />
          <MediaPlanPerformanceCommandCenter />
          <MediaPlanBudgetExecutionBridge />
          <MarketingAutonomyControl />
          <MarketingAutonomyAudit />
          <CampaignAbTestControl />
          <CampaignAbWinnerApprovalBridge />
          <MediaPlanProductionRuntimeBridge />
          <AdsCreativePreviewBridge />
          <SearchPerformanceTrackingBridge />
          <SeoAuthorityTrackingBridge />
        </>
      )}
    </I18nProvider>
  </ErrorBoundary>,
);