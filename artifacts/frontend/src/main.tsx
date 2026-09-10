import { createRoot } from "react-dom/client";
import App from "./App";
import SubdomainSite from "./SubdomainSite";
import { ErrorBoundary } from "./ErrorBoundary";
import { FrontendRecoveryGuard } from "./components/FrontendRecoveryGuard";
import { BudgetImportAutofill } from "./components/BudgetImportAutofill";
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
import { ContentGeneratorQueueUxBridge } from "./components/marketing/ContentGeneratorQueueUxBridge";
import { ContentPlanVisualCompletionBridge } from "./components/marketing/ContentPlanVisualCompletionBridge";
import { MediaPlanProductionCompatibilityBridge } from "./components/marketing/MediaPlanProductionCompatibilityBridge";
import { MediaPlanProjectKindCompatibilityBridge } from "./components/marketing/MediaPlanProjectKindCompatibilityBridge";
import { MediaPlanAutoProductionBridge } from "./components/marketing/MediaPlanAutoProductionBridge";
import { MediaPlanFailedRetryBridge } from "./components/marketing/MediaPlanFailedRetryBridge";
import { MediaPlanPublicationModeControl } from "./components/marketing/MediaPlanPublicationModeControl";
import { MediaPlanPreparationActionsBridge } from "./components/marketing/MediaPlanPreparationActionsBridge";
import { MediaPlanLifecycleSummary } from "./components/marketing/MediaPlanLifecycleSummary";
import { CheckoutConversionFunnel } from "./components/marketing/CheckoutConversionFunnel";
import { MediaPlanPerformanceCommandCenter } from "./components/marketing/MediaPlanPerformanceCommandCenter";
import { MediaPlanBudgetExecutionBridge } from "./components/marketing/MediaPlanBudgetExecutionBridge";
import { MarketingAutonomyControl } from "./components/marketing/MarketingAutonomyControl";
import { MarketingAutonomyAudit } from "./components/marketing/MarketingAutonomyAudit";
import { CampaignAbTestControl } from "./components/marketing/CampaignAbTestControl";
import { CampaignAbWinnerApprovalBridge } from "./components/marketing/CampaignAbWinnerApprovalBridge";
import { MediaPlanProductionRuntimeBridge } from "./components/marketing/MediaPlanProductionRuntimeBridge";
import { AdsCreativePreviewBridge } from "./components/marketing/AdsCreativePreviewBridge";
import { VideoRouteThemeSync } from "./components/video/VideoRouteThemeSync";
import { JarvisVoiceReplayControl } from "./components/support/JarvisVoiceReplayControl";
import { JarvisResponseHealthNotice } from "./components/support/JarvisResponseHealthNotice";
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

setupApiClient();

const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
const handoffToken = hashParams.get("vendorai_token");
const handoffDemoExpiresAt = hashParams.get("demo_expires_at");
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

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <I18nProvider>
      {tenantSlugForSite ? (
        <SubdomainSite slug={tenantSlugForSite} />
      ) : (
        <>
          <FrontendRecoveryGuard />
          <VideoRouteThemeSync />
          <App />
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
          <MediaAiBaseWorkspaceNav />
          <MediaDeleteSelectionBridge />
          <ContentGeneratorQueueUxBridge />
          <ContentPlanVisualCompletionBridge />
          <MediaPlanProductionCompatibilityBridge />
          <MediaPlanProjectKindCompatibilityBridge />
          <MediaPlanAutoProductionBridge />
          <MediaPlanFailedRetryBridge />
          <MediaPlanPublicationModeControl />
          <MediaPlanPreparationActionsBridge />
          <MediaPlanLifecycleSummary />
          <CheckoutConversionFunnel />
          <MediaPlanPerformanceCommandCenter />
          <MediaPlanBudgetExecutionBridge />
          <MarketingAutonomyControl />
          <MarketingAutonomyAudit />
          <CampaignAbTestControl />
          <CampaignAbWinnerApprovalBridge />
          <MediaPlanProductionRuntimeBridge />
          <AdsCreativePreviewBridge />
        </>
      )}
    </I18nProvider>
  </ErrorBoundary>,
);