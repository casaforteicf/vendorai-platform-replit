import AppLegacy from "./AppLegacy";
import AppRuntimeShell from "@/pages/app-runtime/AppRuntimeShell";
import DevAgentOverlay from "@/components/admin/DevAgentOverlay";
import "./dev-agent-mobile.css";

function runtimeAppId(pathname: string): string | null {
  const match = pathname.match(/^\/apps\/([^/?#]+)\/?$/);
  if (!match?.[1]) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

export default function App() {
  const appId = typeof window !== "undefined" ? runtimeAppId(window.location.pathname) : null;
  if (appId) return <AppRuntimeShell appId={appId} />;
  return (
    <>
      <AppLegacy />
      <DevAgentOverlay />
    </>
  );
}
