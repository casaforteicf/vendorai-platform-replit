import * as React from "react";
import AppLegacy from "./AppLegacy";
import AppRuntimeShell from "@/pages/app-runtime/AppRuntimeShell";
import "./dev-agent-mobile.css";

const DevAgentOverlay = React.lazy(() => import("@/components/admin/DevAgentOverlay"));

class DevAgentIsolationBoundary extends React.Component<
  { children: React.ReactNode; onError?: () => void },
  { failed: boolean }
> {
  constructor(props: { children: React.ReactNode; onError?: () => void }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Dev IA isolado após erro de runtime:", error);
    this.props.onError?.();
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

function isCachedSuperAdmin() {
  if (typeof window === "undefined") return false;
  try {
    const raw = window.localStorage.getItem("vendorai_user_cache");
    if (!raw) return false;
    const user = JSON.parse(raw) as { platformRole?: string | null };
    return user?.platformRole === "super_admin";
  } catch {
    return false;
  }
}

export default function App() {
  const appId = typeof window !== "undefined" ? runtimeAppId(window.location.pathname) : null;
  const [devRequested, setDevRequested] = React.useState(false);
  const [devFailed, setDevFailed] = React.useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(isCachedSuperAdmin);

  React.useEffect(() => {
    const syncRole = () => setIsSuperAdmin(isCachedSuperAdmin());
    window.addEventListener("storage", syncRole);
    window.addEventListener("focus", syncRole);
    return () => {
      window.removeEventListener("storage", syncRole);
      window.removeEventListener("focus", syncRole);
    };
  }, []);

  React.useEffect(() => {
    if (!devRequested || devFailed) return;
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const button = document.querySelector<HTMLButtonElement>('button[aria-label="Abrir Dev IA"]');
      if (button) {
        window.clearInterval(timer);
        button.click();
      } else if (attempts >= 30) {
        window.clearInterval(timer);
      }
    }, 100);
    return () => window.clearInterval(timer);
  }, [devRequested, devFailed]);

  if (appId) return <AppRuntimeShell appId={appId} />;

  const openDevAgent = () => {
    setDevFailed(false);
    setDevRequested(true);
  };

  return (
    <>
      <AppLegacy />

      {isSuperAdmin && !devRequested && (
        <button
          type="button"
          onClick={openDevAgent}
          className="fixed bottom-24 right-5 z-[90] rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl"
          aria-label="Carregar Dev IA"
        >
          Dev IA
        </button>
      )}

      {isSuperAdmin && devFailed && (
        <button
          type="button"
          onClick={openDevAgent}
          className="fixed bottom-24 right-5 z-[90] rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl"
          aria-label="Tentar Dev IA novamente"
        >
          Tentar Dev IA
        </button>
      )}

      {isSuperAdmin && devRequested && !devFailed && (
        <DevAgentIsolationBoundary
          onError={() => {
            setDevFailed(true);
            setDevRequested(false);
          }}
        >
          <React.Suspense fallback={null}>
            <DevAgentOverlay />
          </React.Suspense>
        </DevAgentIsolationBoundary>
      )}
    </>
  );
}
