import { useLocation } from "wouter";
import { MediaAdsBridge } from "../media/MediaAdsBridge";
import { MediaSitesBridge } from "../media/MediaSitesBridge";
import { MediaCatalogBridge } from "../media/MediaCatalogBridge";
import { MediaContentStudioBridge } from "../media/MediaContentStudioBridge";
import { MediaContextLibrary } from "../media/MediaContextLibrary";
import { MediaMarketingContentBridge } from "../media/MediaMarketingContentBridge";
import { MediaConversationsBridge } from "../media/MediaConversationsBridge";
import { MediaAiBaseBridge } from "../media/MediaAiBaseBridge";
import { MediaAiBaseWorkspaceNav } from "../media/MediaAiBaseWorkspaceNav";
import { MediaDeleteSelectionBridge } from "../media/MediaDeleteSelectionBridge";
import { MediaLibraryWorkflowBridge } from "../media/MediaLibraryWorkflowBridge";
import { MediaIntelligenceIndexBridge } from "../media/MediaIntelligenceIndexBridge";
import { ContentGeneratorQueueUxBridge } from "../marketing/ContentGeneratorQueueUxBridge";
import { ContentContextSourcesBridge } from "../marketing/ContentContextSourcesBridge";
import { ContentApprovalClarityBridge } from "../marketing/ContentApprovalClarityBridge";
import { ContentProductionClarityBridge } from "../marketing/ContentProductionClarityBridge";
import { MarketingOverviewBridge } from "../marketing/MarketingOverviewBridge";
import { CampaignWorkspaceClarityBridge } from "../marketing/CampaignWorkspaceClarityBridge";
import { PlanningReviewBridge } from "../marketing/PlanningReviewBridge";
import { ContentPlanVisualCompletionBridge } from "../marketing/ContentPlanVisualCompletionBridge";
import { MediaPlanProductionCompatibilityBridge } from "../marketing/MediaPlanProductionCompatibilityBridge";
import { MediaPlanProjectKindCompatibilityBridge } from "../marketing/MediaPlanProjectKindCompatibilityBridge";
import { MediaPlanAutoProductionBridge } from "../marketing/QuotaSafeMediaPlanAutoProductionBridge";
import { MediaPlanFailedRetryBridge } from "../marketing/MediaPlanFailedRetryBridge";
import { MediaPlanBatchControl } from "../marketing/MediaPlanBatchControl";
import { MediaPlanPublicationModeControl } from "../marketing/MediaPlanPublicationModeControl";
import { MediaPlanLandingPageStrategy } from "../marketing/MediaPlanLandingPageStrategy";
import { MediaPlanPreparationActionsBridge } from "../marketing/MediaPlanPreparationActionsBridge";
import { MediaPlanLifecycleSummary } from "../marketing/MediaPlanLifecycleSummary";
import { CheckoutConversionFunnel } from "../marketing/CheckoutConversionFunnel";
import { AcquisitionInvestmentIntelligence } from "../marketing/AcquisitionInvestmentIntelligence";
import { AcquisitionMasterOrchestrator } from "../marketing/AcquisitionMasterOrchestrator";
import { MediaPlanPerformanceCommandCenter } from "../marketing/MediaPlanPerformanceCommandCenter";
import { MediaPlanBudgetExecutionBridge } from "../marketing/MediaPlanBudgetExecutionBridge";
import { MarketingAutonomyControl } from "../marketing/MarketingAutonomyControl";
import { MarketingAutonomyAudit } from "../marketing/MarketingAutonomyAudit";
import { CampaignAbTestControl } from "../marketing/CampaignAbTestControl";
import { CampaignAbWinnerApprovalBridge } from "../marketing/CampaignAbWinnerApprovalBridge";
import { MediaPlanProductionRuntimeBridge } from "../marketing/MediaPlanProductionRuntimeBridge";
import { AdsCreativePreviewBridge } from "../marketing/AdsCreativePreviewBridge";
import { SearchPerformanceTrackingBridge } from "../marketing/SearchPerformanceTrackingBridge";
import { SeoAuthorityTrackingBridge } from "../marketing/SeoAuthorityTrackingBridge";

export default function WorkspaceEnhancements() {
  const [location] = useLocation();
  const pathname = location.split("?")[0] || "/";
  const params = new URLSearchParams(window.location.search);
  const contentTab = params.get("tab") ?? "visao-geral";
  const contentView = params.get("view") ?? "";

  const isContent = pathname === "/content";
  const isProductionQueue = isContent && (contentTab === "conteudos" || contentTab === "gerador");
  const isMarketing = isContent || pathname.startsWith("/marketing");
  const isMediaLibrary = pathname.startsWith("/midias");
  const isAds = pathname.startsWith("/ads");
  const isSite = pathname.startsWith("/site") || (isContent && contentView === "lp");
  const isCatalog = pathname.startsWith("/catalog");
  const isConversations = pathname.startsWith("/convers");
  const isVideoStudio = pathname.startsWith("/content-studio/video");

  // A fila de geração já possui seu próprio runtime e controles. Não montamos
  // os bridges legados nesta tela porque eles fazem polling, observam/mutam DOM
  // e alguns repetem as mesmas consultas de plano, calendário, projetos e mídia.
  if (isProductionQueue) return null;

  return (
    <>
      {isAds && <MediaAdsBridge />}
      {isSite && <MediaSitesBridge />}
      {isCatalog && <MediaCatalogBridge />}
      {isVideoStudio && <MediaContentStudioBridge />}
      {isMediaLibrary && <MediaContextLibrary />}
      {isContent && <MediaMarketingContentBridge />}
      {isConversations && <MediaConversationsBridge />}

      {isMediaLibrary && (
        <>
          <MediaAiBaseBridge />
          <MediaLibraryWorkflowBridge />
          <MediaIntelligenceIndexBridge />
          <MediaAiBaseWorkspaceNav />
          <MediaDeleteSelectionBridge />
        </>
      )}

      {isMarketing && (
        <>
          <ContentGeneratorQueueUxBridge />
          <ContentContextSourcesBridge />
          <ContentApprovalClarityBridge />
          <ContentProductionClarityBridge />
          <MarketingOverviewBridge />
          <CampaignWorkspaceClarityBridge />
          <PlanningReviewBridge />
          <ContentPlanVisualCompletionBridge />
          <MediaPlanProductionCompatibilityBridge />
          <MediaPlanProjectKindCompatibilityBridge />
          <MediaPlanAutoProductionBridge />
          <MediaPlanFailedRetryBridge />
          <MediaPlanBatchControl />
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
        </>
      )}

      {isAds && <AdsCreativePreviewBridge />}
      {isContent && contentTab === "rastreamento" && (
        <>
          <SearchPerformanceTrackingBridge />
          <SeoAuthorityTrackingBridge />
        </>
      )}
    </>
  );
}
