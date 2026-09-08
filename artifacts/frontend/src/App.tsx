import * as React from "react";
import AppLegacy from "./AppLegacy";
import AppRuntimeShell from "@/pages/app-runtime/AppRuntimeShell";
import "./dev-agent-mobile.css";
import "./video-studio-modern.css";

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

function createUuidV4() {
  const bytes = new Uint8Array(16);
  try {
    if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
      crypto.getRandomValues(bytes);
    } else {
      for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
    }
  } catch {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10, 16).join("")}`;
}

function ensureMobileDomCompatibility() {
  if (typeof window === "undefined" || typeof Element === "undefined") return;
  const proto = Element.prototype as Element & { scrollIntoView?: (options?: ScrollIntoViewOptions | boolean) => void };
  if (typeof proto.scrollIntoView !== "function") {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: () => undefined,
    });
  }
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID !== "function") {
      Object.defineProperty(crypto, "randomUUID", {
        configurable: true,
        writable: true,
        value: () => createUuidV4(),
      });
    }
  } catch {
    // O Dev IA ainda sanitiza IDs antigos abaixo.
  }
}

function sanitizeDevAgentHistory() {
  if (typeof window === "undefined") return;
  const messageKey = "vendorai_dev_ia_messages_v1";
  const requestKey = "vendorai_dev_ia_requests_v1";
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  try {
    const raw = window.localStorage.getItem(messageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        window.localStorage.removeItem(messageKey);
      } else {
        const cleaned = parsed.filter((item) => {
          if (!item || (item.role !== "user" && item.role !== "assistant")) return false;
          return typeof item.content === "string" && item.content.trim().length > 0;
        });
        window.localStorage.setItem(messageKey, JSON.stringify(cleaned.slice(-100)));
      }
    }
  } catch {
    try {
      window.localStorage.removeItem(messageKey);
    } catch {
      // Histórico inválido nunca pode impedir o Dev IA de abrir.
    }
  }

  try {
    const raw = window.localStorage.getItem(requestKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        window.localStorage.removeItem(requestKey);
      } else {
        const cleaned = parsed
          .filter((item) => item && typeof item === "object")
          .map((item) => ({
            ...item,
            id: typeof item.id === "string" && uuidPattern.test(item.id) ? item.id : createUuidV4(),
          }))
          .slice(0, 100);
        window.localStorage.setItem(requestKey, JSON.stringify(cleaned));
      }
    }
  } catch {
    try {
      window.localStorage.removeItem(requestKey);
    } catch {
      // Histórico inválido nunca pode impedir o Dev IA de abrir.
    }
  }
}

type StoredDevRequest = {
  id?: string;
  status?: string;
  targetRevision?: string;
  executionSummary?: string;
  [key: string]: unknown;
};

async function reconcilePendingDevRequests() {
  if (typeof window === "undefined") return;
  const requestKey = "vendorai_dev_ia_requests_v1";

  let requests: StoredDevRequest[] = [];
  try {
    const raw = window.localStorage.getItem(requestKey);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return;
    requests = parsed;
  } catch {
    return;
  }

  const pending = requests
    .filter((item) => item?.status === "deploy_pending" && typeof item?.targetRevision === "string" && item.targetRevision.trim())
    .slice(0, 10);
  if (pending.length === 0) return;

  let token: string | null = null;
  try { token = window.localStorage.getItem("vendorai_token"); } catch { token = null; }
  if (!token) return;

  const validated = new Map<string, { revision: string; runtime?: string }>();

  for (const item of pending) {
    try {
      const response = await fetch("/api/support/dev/validate-production", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ expectedRevision: item.targetRevision }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.state !== "validated") continue;
      validated.set(String(item.id ?? item.targetRevision), {
        revision: String(data?.observedRevision ?? item.targetRevision),
        runtime: typeof data?.runtime === "string" ? data.runtime : undefined,
      });
    } catch {
      // Reconciliação é best-effort e nunca pode impedir o painel de abrir.
    }
  }

  if (validated.size === 0) return;

  const next = requests.map((item) => {
    const evidence = validated.get(String(item.id ?? item.targetRevision));
    if (!evidence) return item;
    const runtimeLabel = evidence.runtime === "vercel" ? "Vercel" : evidence.runtime === "railway" ? "Railway" : "produção";
    const validationText = `Produção validada automaticamente em ${runtimeLabel} no SHA ${evidence.revision.slice(0, 9)}.`;
    return {
      ...item,
      status: "concluido",
      executionSummary: `${typeof item.executionSummary === "string" ? item.executionSummary : ""}\n${validationText}`.trim(),
    };
  });

  try {
    window.localStorage.setItem(requestKey, JSON.stringify(next.slice(0, 100)));
  } catch {
    // Persistência auxiliar não pode impedir o uso do sistema.
  }
}

export default function App() {
  const appId = typeof window !== "undefined" ? runtimeAppId(window.location.pathname) : null;
  const [devRequested, setDevRequested] = React.useState(false);
  const [devFailed, setDevFailed] = React.useState(false);
  const [devLoading, setDevLoading] = React.useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = React.useState(isCachedSuperAdmin);

  React.useEffect(() => {
    const syncVideoStudioScope = () => {
      const active = window.location.pathname.startsWith("/content-studio/video");
      document.body.classList.toggle("vendorai-video-studio", active);
    };
    syncVideoStudioScope();
    const timer = window.setInterval(syncVideoStudioScope, 250);
    window.addEventListener("popstate", syncVideoStudioScope);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("popstate", syncVideoStudioScope);
      document.body.classList.remove("vendorai-video-studio");
    };
  }, []);

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

  const openDevAgent = async () => {
    if (devLoading) return;
    setDevLoading(true);
    ensureMobileDomCompatibility();
    sanitizeDevAgentHistory();
    await reconcilePendingDevRequests();
    setDevFailed(false);
    setDevRequested(true);
    setDevLoading(false);
  };

  return (
    <>
      <AppLegacy />

      {isSuperAdmin && !devRequested && (
        <button
          type="button"
          onClick={() => void openDevAgent()}
          disabled={devLoading}
          className="fixed bottom-24 right-5 z-[90] rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl disabled:opacity-70"
          aria-label="Carregar Dev IA"
        >
          {devLoading ? "Validando..." : "Dev IA"}
        </button>
      )}

      {isSuperAdmin && devFailed && (
        <button
          type="button"
          onClick={() => void openDevAgent()}
          disabled={devLoading}
          className="fixed bottom-24 right-5 z-[90] rounded-full bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-2xl disabled:opacity-70"
          aria-label="Tentar Dev IA novamente"
        >
          {devLoading ? "Validando..." : "Tentar Dev IA"}
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
