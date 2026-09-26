import VideoAvatarCapturePage from "@/pages/video/VideoAvatarCapturePage";
import VideoAvatarCaptureTenantGate from "@/pages/video/VideoAvatarCaptureTenantGate";
import VideoAvatarCaptureViewportGuard from "@/pages/video/VideoAvatarCaptureViewportGuard";
import VideoAvatarVideoScriptGuide from "@/pages/video/VideoAvatarVideoScriptGuide";

export default function VideoAvatarCaptureRoute() {
  return (
    <VideoAvatarCaptureTenantGate>
      <VideoAvatarCapturePage />
      <VideoAvatarCaptureViewportGuard />
      <VideoAvatarVideoScriptGuide />
    </VideoAvatarCaptureTenantGate>
  );
}
