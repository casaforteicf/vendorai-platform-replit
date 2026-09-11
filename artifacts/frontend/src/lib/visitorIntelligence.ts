export type VisitorTelemetryEventType =
  | "session_start"
  | "heartbeat"
  | "page_view"
  | "screen_view"
  | "cta_click"
  | "form_start"
  | "form_submit"
  | "feature_use"
  | "search"
  | "login"
  | "signup"
  | "conversion"
  | "engagement"
  | "error";

const SESSION_KEY = "vendorai_visitor_session_v1";
const API_BASE = import.meta.env.PROD ? "/api" : (import.meta.env.VITE_API_URL || "/api");

function authToken() {
  try {
    return window.localStorage.getItem("vendorai_token");
  } catch {
    return null;
  }
}

function sessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }
}

function deviceType() {
  const ua = navigator.userAgent.toLowerCase();
  if (/ipad|tablet/.test(ua)) return "tablet";
  if (/mobi|android|iphone/.test(ua)) return "mobile";
  return "desktop";
}

function browser() {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari";
  return "Other";
}

function os() {
  const ua = navigator.userAgent;
  if (/Windows NT/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Other";
}

function attribution() {
  const query = new URLSearchParams(window.location.search);
  return {
    utmSource: query.get("utm_source"),
    utmMedium: query.get("utm_medium"),
    utmCampaign: query.get("utm_campaign"),
  };
}

export async function sendVisitorTelemetry(
  eventType: VisitorTelemetryEventType,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  if (typeof window === "undefined") return;
  const token = authToken();
  if (!token) return;

  const attr = attribution();
  const body = JSON.stringify({
    anonymousSessionId: sessionId(),
    eventType,
    pageUrl: window.location.href,
    path: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || undefined,
    utmCampaign: attr.utmCampaign || undefined,
    metadata: {
      surface: "app",
      hostname: window.location.hostname,
      deviceType: deviceType(),
      browser: browser(),
      os: os(),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      utmSource: attr.utmSource,
      utmMedium: attr.utmMedium,
      utmCampaign: attr.utmCampaign,
      ...metadata,
    },
  });

  try {
    await fetch(`${API_BASE}/visitor-intelligence/event`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      credentials: "include",
      keepalive: true,
      body,
    });
  } catch {
    // Telemetria nunca deve bloquear a experiência do usuário.
  }
}

export function installVisitorTelemetry() {
  if (typeof window === "undefined") return () => {};
  let lastPath = `${window.location.pathname}${window.location.search}`;
  let stopped = false;

  void sendVisitorTelemetry("session_start");
  void sendVisitorTelemetry("screen_view");

  const interval = window.setInterval(() => {
    if (stopped || document.visibilityState !== "visible") return;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (currentPath !== lastPath) {
      lastPath = currentPath;
      void sendVisitorTelemetry("screen_view");
    }
    void sendVisitorTelemetry("heartbeat");
  }, 30_000);

  const visibility = () => {
    if (document.visibilityState === "visible") void sendVisitorTelemetry("heartbeat");
  };
  document.addEventListener("visibilitychange", visibility);

  return () => {
    stopped = true;
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", visibility);
  };
}
