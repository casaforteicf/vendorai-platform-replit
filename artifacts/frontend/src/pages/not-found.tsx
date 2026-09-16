import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { SidebarLayout } from "@/components/layout/SidebarLayout";
import MediaLibraryV2 from "@/pages/MediaLibraryV2";
import MediaLibrarySourceGuide from "@/components/media/MediaLibrarySourceGuide";
import ProductCatalogKnowledgeLibrary from "@/components/media/ProductCatalogKnowledgeLibrary";
import ProductCatalogSelectionBridge from "@/components/media/ProductCatalogSelectionBridge";
import ProductCatalogAiAssistBridge from "@/components/media/ProductCatalogAiAssistBridge";
import ProjectKnowledgeLibrary from "@/components/media/ProjectKnowledgeLibrary";
import InternalProductsKnowledgeLibrary from "@/components/media/InternalProductsKnowledgeLibrary";
import Conversations from "@/pages/Conversations";
import Analytics from "@/pages/Analytics";
import GrowthLabConnected from "@/pages/GrowthLabConnected";
import VideoAvatarCapturePage from "@/pages/video/VideoAvatarCapturePage";
import VideoAvatarCaptureTenantGate from "@/pages/video/VideoAvatarCaptureTenantGate";
import VideoAvatarCaptureViewportGuard from "@/pages/video/VideoAvatarCaptureViewportGuard";
import VideoAvatarVideoScriptGuide from "@/pages/video/VideoAvatarVideoScriptGuide";

const POST_LOGIN_PATH_KEY = "vendorai_post_login_path";

export default function NotFound() {
  const { token, isLoading } = useAuth();
  const normalizedPath = window.location.pathname.replace(/\/+$/, "") || "/";
  const isMediaCenter = normalizedPath === "/midias" || normalizedPath === "/midias/informacoes";
  const isConversations = normalizedPath === "/conversas";
  const isAiMetrics = normalizedPath === "/metricas-ia";
  const isGrowthLab = normalizedPath === "/growth-lab";
  const isDubleCapture = normalizedPath === "/content-studio/video/avatar/captura";
  const isProtectedAlias = isMediaCenter || isConversations || isAiMetrics || isGrowthLab || isDubleCapture;

  useEffect(() => {
    if (isProtectedAlias && !isLoading && !token) {
      if (isDubleCapture) {
        const returnPath = `${window.location.pathname}${window.location.search}`;
        sessionStorage.setItem(POST_LOGIN_PATH_KEY, returnPath);
      }
      window.location.assign("/login");
    }
  }, [isProtectedAlias, isDubleCapture, isLoading, token]);

  if (isProtectedAlias) {
    if (isLoading || !token) return null;

    if (isDubleCapture) {
      return (
        <VideoAvatarCaptureTenantGate>
          <VideoAvatarCapturePage />
          <VideoAvatarCaptureViewportGuard />
          <VideoAvatarVideoScriptGuide />
        </VideoAvatarCaptureTenantGate>
      );
    }

    return (
      <SidebarLayout>
        {isMediaCenter ? (
          <>
            <MediaLibrarySourceGuide />
            <ProductCatalogAiAssistBridge />
            <div id="biblioteca-midias">
              <MediaLibraryV2 />
              <ProductCatalogKnowledgeLibrary />
              <ProductCatalogSelectionBridge />
              <ProjectKnowledgeLibrary />
              <InternalProductsKnowledgeLibrary />
            </div>
          </>
        ) : isConversations ? <Conversations /> : isAiMetrics ? <Analytics /> : <GrowthLabConnected />}
      </SidebarLayout>
    );
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex mb-4 gap-2">
            <AlertCircle className="h-8 w-8 text-red-500" />
            <h1 className="text-2xl font-bold text-gray-900">404 Page Not Found</h1>
          </div>

          <p className="mt-4 text-sm text-gray-600">
            Did you forget to add the page to the router?
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
