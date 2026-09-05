import * as React from "react";
import AppLegacy from "./AppLegacy";
import AppRuntimeShell from "@/pages/app-runtime/AppRuntimeShell";
import "./dev-agent-mobile.css";

const DevAgentOverlay = React.lazy(() => import("@/components/admin/DevAgentOverlay"));

class DevAgentIsolationBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Dev IA isolado após erro de runtime:", error);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

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
      <DevAgentIsolationBoundary>
        <React.Suspense fallback={null}>
          <DevAgentOverlay />
        </React.Suspense>
      </DevAgentIsolationBoundary>
    </>
  );
}
