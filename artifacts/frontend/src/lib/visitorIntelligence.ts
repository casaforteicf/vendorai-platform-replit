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
const VISITOR_KEY = "vendorai_visitor_id_v1";
const ALERTS_KEY = "vendorai_visitor_online_alerts_v1";
const ALERT_SEEN_KEY = "vendorai_visitor_alert_seen_v1";
const API_BASE = import.meta.env.PROD ? "/api" : (import.meta.env.VITE_API_URL || "/api");
const VISITOR_DASHBOARD_URL = "/content?tab=campanhas&view=visitantes";

function visitorDashboardUrl(sessionId: string) {
  return `${VISITOR_DASHBOARD_URL}&session=${encodeURIComponent(sessionId)}`;
}

function randomId(prefix: string) {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function authToken() {
  try {
    return window.localStorage.getItem("vendorai_token");
  } catch {
    return null;
  }
}

function telemetrySurface(): { surface: "app" | "mobile"; mobilePlatform: string | null } {
  try {
    const marker = window.localStorage.getItem("vendorai_surface");
    const mobilePlatform = window.localStorage.getItem("vendorai_mobile_platform");
    if (marker === "mobile") return { surface: "mobile", mobilePlatform };
  } catch {
    // Sem storage, o navegador autenticado continua classificado como app web.
  }
  return { surface: "app", mobilePlatform: null };
}

function sessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = randomId("s");
    window.sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return randomId("s");
  }
}

function visitorId(): string {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const created = randomId("v");
    window.localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return randomId("v");
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

export function getVisitorAlertsEnabled() {
  try {
    const saved = window.localStorage.getItem(ALERTS_KEY);
    return saved === null ? true : saved === "true";
  } catch {
    return true;
  }
}

export function setVisitorAlertsEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(ALERTS_KEY, String(enabled));
  } catch {
    // Preferência local opcional.
  }
  window.dispatchEvent(new CustomEvent("vendorai:visitor-alert-preference", { detail: { enabled } }));
}

export function getVisitorBrowserNotificationState(): NotificationPermission | "unsupported" {
  if (typeof Notification === "undefined") return "unsupported";
  return Notification.permission;
}

export async function requestVisitorBrowserNotifications() {
  if (typeof Notification === "undefined") return "unsupported" as const;
  return Notification.requestPermission();
}

export async function sendVisitorTelemetry(
  eventType: VisitorTelemetryEventType,
  metadata: Record<string, string | number | boolean | null> = {},
  locationOverride?: { path?: string; pageUrl?: string },
) {
  if (typeof window === "undefined") return;
  const token = authToken();
  if (!token) return;

  const attr = attribution();
  const surface = telemetrySurface();
  const body = JSON.stringify({
    anonymousSessionId: sessionId(),
    eventType,
    pageUrl: locationOverride?.pageUrl ?? window.location.href,
    path: locationOverride?.path ?? `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || undefined,
    utmCampaign: attr.utmCampaign || undefined,
    metadata: {
      surface: surface.surface,
      visitorId: visitorId(),
      mobilePlatform: surface.mobilePlatform,
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

type AlertSession = {
  sessionId: string;
  surface: "site" | "app" | "mobile" | "unknown";
  online: boolean;
  identified: boolean;
  hotOpportunity: boolean;
  currentPath: string | null;
  lastSeenAt: string | null;
  sourceLabel?: string | null;
  source?: string | null;
  medium?: string | null;
  intent: { score: number };
  geo: { city: string | null; region: string | null; country: string | null };
};

type AlertResponse = { sessions?: AlertSession[] };

function loadSeenSessions() {
  try {
    const raw = window.sessionStorage.getItem(ALERT_SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set<string>(Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function saveSeenSessions(seen: Set<string>) {
  try {
    const values = Array.from(seen).slice(-250);
    window.sessionStorage.setItem(ALERT_SEEN_KEY, JSON.stringify(values));
  } catch {
    // Sem sessionStorage, o dedupe continua em memória.
  }
}

function alertLocation(session: AlertSession) {
  return [session.geo.city, session.geo.region].filter(Boolean).join(" / ") || "localização não disponível";
}

function alertSource(session: AlertSession) {
  return session.sourceLabel
    || [session.source, session.medium].filter(Boolean).join(" / ")
    || "acesso direto";
}

function showInAppVisitorAlert(session: AlertSession) {
  const containerId = "vendorai-visitor-alert-container";
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement("div");
    container.id = containerId;
    Object.assign(container.style, {
      position: "fixed",
      right: "18px",
      top: "18px",
      zIndex: "2147483000",
      display: "flex",
      flexDirection: "column",
      gap: "10px",
      width: "min(390px, calc(100vw - 36px))",
      pointerEvents: "none",
    });
    document.body.appendChild(container);
  }

  const card = document.createElement("button");
  card.type = "button";
  card.setAttribute("aria-label", "Abrir Visitor Intelligence");
  card.style.cssText = [
    "pointer-events:auto",
    "width:100%",
    "text-align:left",
    "border:1px solid rgba(99,102,241,.28)",
    "border-radius:14px",
    "background:rgba(15,23,42,.96)",
    "color:white",
    "padding:14px 15px",
    "box-shadow:0 18px 45px rgba(15,23,42,.28)",
    "cursor:pointer",
    "font:inherit",
  ].join(";");

  const title = session.identified ? "Lead identificado está online" : "Novo visitante online";
  const hot = session.hotOpportunity ? " · 🔥 oportunidade quente" : "";
  card.innerHTML = `
    <div style="font-size:13px;font-weight:700;margin-bottom:5px">${title}${hot}</div>
    <div style="font-size:12px;opacity:.86;line-height:1.45">${alertLocation(session)} · ${alertSource(session)}</div>
    <div style="font-size:11px;opacity:.72;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${session.currentPath || "/"} · intenção ${session.intent?.score ?? 0}/100</div>
    <div style="font-size:11px;color:#a5b4fc;margin-top:7px">Clique para acompanhar ao vivo →</div>
  `;
  card.onclick = () => {
    window.location.assign(visitorDashboardUrl(session.sessionId));
  };
  container.appendChild(card);

  window.setTimeout(() => {
    card.remove();
    if (container && !container.childElementCount) container.remove();
  }, 10_000);
}

function showBrowserVisitorAlert(session: AlertSession) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  if (document.visibilityState === "visible") return;
  const notification = new Notification(session.identified ? "Lead identificado online" : "Novo visitante online", {
    body: `${alertLocation(session)} · ${alertSource(session)} · ${session.currentPath || "/"}`,
    tag: `vendorai-visitor-${session.sessionId}`,
  });
  notification.onclick = () => {
    window.focus();
    window.location.assign(visitorDashboardUrl(session.sessionId));
    notification.close();
  };
}

function installVisitorOnlineAlerts() {
  const seen = loadSeenSessions();
  let stopped = false;
  let running = false;

  const poll = async () => {
    if (stopped || running || !getVisitorAlertsEnabled()) return;
    const token = authToken();
    if (!token) return;
    running = true;
    try {
      const response = await fetch(`${API_BASE}/visitor-intelligence?minutes=5&onlineWindowSeconds=90`, {
        credentials: "include",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) return;
      const data = await response.json() as AlertResponse;
      const now = Date.now();
      const onlineSite = (data.sessions ?? []).filter((session) => session.surface === "site" && session.online);
      const fresh = onlineSite
        .filter((session) => !seen.has(session.sessionId))
        .filter((session) => !session.lastSeenAt || now - new Date(session.lastSeenAt).getTime() <= 75_000)
        .slice(0, 3);

      for (const session of onlineSite) seen.add(session.sessionId);
      saveSeenSessions(seen);

      for (const session of fresh) {
        showInAppVisitorAlert(session);
        showBrowserVisitorAlert(session);
        window.dispatchEvent(new CustomEvent("vendorai:visitor-online", { detail: session }));
      }
    } catch {
      // Alertas nunca podem interferir no uso do app.
    } finally {
      running = false;
    }
  };

  const initialTimer = window.setTimeout(() => void poll(), 4_000);
  const interval = window.setInterval(() => void poll(), 15_000);
  const preferenceListener = () => void poll();
  window.addEventListener("vendorai:visitor-alert-preference", preferenceListener);

  return () => {
    stopped = true;
    window.clearTimeout(initialTimer);
    window.clearInterval(interval);
    window.removeEventListener("vendorai:visitor-alert-preference", preferenceListener);
  };
}

function isBenignResizeObserverMessage(message: string) {
  return /ResizeObserver loop (?:limit exceeded|completed with undelivered notifications)/i.test(message);
}

function installRuntimeErrorTelemetry() {
  if (typeof window === "undefined") return () => {};

  const sendRuntimeError = (message: string, source: string) => {
    const cleanMessage = message.replace(/\s+/g, " ").trim().slice(0, 300) || "Erro desconhecido";
    void sendVisitorTelemetry("error", {
      kind: "runtime_error",
      message: cleanMessage,
      source,
      deviceCategory: window.innerWidth < 768 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop",
    }, { path: window.location.pathname || "/", pageUrl: window.location.href });
  };

  const onError = (event: ErrorEvent) => {
    const message = event.message || event.error?.name || "Erro de execução";
    if (isBenignResizeObserverMessage(message)) return;
    sendRuntimeError(message, "window.error");
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason instanceof Error
      ? `${reason.name}: ${reason.message}`
      : typeof reason === "string"
        ? reason
        : "Promise rejeitada sem tratamento";
    sendRuntimeError(message, "unhandledrejection");
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

function installPerformanceTelemetry() {
  if (typeof window === "undefined" || typeof PerformanceObserver === "undefined") return () => {};

  let lcp = 0;
  let cls = 0;
  let maxInteraction = 0;
  let fcp = 0;
  let ttfb = 0;
  let reported = false;
  const observers: PerformanceObserver[] = [];
  const apiTimings: Array<{ endpoint: string; durationMs: number; transferSize: number; encodedBodySize: number; routePath: string; pageUrl: string; initiatorType: string }> = [];
  const initialPath = window.location.pathname || "/";
  const initialPageUrl = window.location.href;
  let lcpPath = initialPath;
  let lcpPageUrl = initialPageUrl;
  let clsPath = initialPath;
  let clsPageUrl = initialPageUrl;
  let inpPath = initialPath;
  let inpPageUrl = initialPageUrl;

  try {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation) ttfb = Math.max(0, navigation.responseStart - navigation.requestStart);
  } catch {
    // Métricas opcionais nunca podem afetar o app.
  }

  const observe = (type: string, handler: (entry: PerformanceEntry) => void) => {
    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) handler(entry);
      });
      observer.observe({ type, buffered: true } as PerformanceObserverInit);
      observers.push(observer);
    } catch {
      // Browser sem suporte a este tipo de entry.
    }
  };

  observe("paint", (entry) => {
    if (entry.name === "first-contentful-paint") fcp = entry.startTime;
  });

  observe("largest-contentful-paint", (entry) => {
    if (entry.startTime >= lcp) {
      lcp = entry.startTime;
      lcpPath = window.location.pathname || "/";
      lcpPageUrl = window.location.href;
    }
  });

  observe("layout-shift", (entry) => {
    const shift = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
    if (!shift.hadRecentInput) {
      cls += shift.value ?? 0;
      clsPath = window.location.pathname || "/";
      clsPageUrl = window.location.href;
    }
  });

  observe("event", (entry) => {
    const duration = entry.duration || 0;
    if (duration >= maxInteraction) {
      maxInteraction = duration;
      inpPath = window.location.pathname || "/";
      inpPageUrl = window.location.href;
    }
  });

  observe("resource", (entry) => {
    const resource = entry as PerformanceResourceTiming;
    if (!resource.name || resource.duration <= 0) return;
    try {
      const url = new URL(resource.name, window.location.origin);
      if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return;
      if (url.pathname.startsWith("/api/visitor-intelligence")) return;
      apiTimings.push({
        endpoint: url.pathname,
        durationMs: resource.duration,
        transferSize: Math.max(0, resource.transferSize || 0),
        encodedBodySize: Math.max(0, resource.encodedBodySize || 0),
        routePath: window.location.pathname || "/",
        pageUrl: window.location.href,
        initiatorType: resource.initiatorType || "fetch",
      });
      if (apiTimings.length > 80) apiTimings.splice(0, apiTimings.length - 80);
    } catch {
      // Resource timing inválido não deve afetar a aplicação.
    }
  });

  const deviceCategory = window.innerWidth < 768 ? "mobile" : window.innerWidth < 1024 ? "tablet" : "desktop";

  const ratingFor = (metric: "LCP" | "CLS" | "FCP" | "TTFB" | "INP", value: number) => {
    const thresholds = {
      LCP: [2500, 4000],
      CLS: [0.1, 0.25],
      FCP: [1800, 3000],
      TTFB: [800, 1800],
      INP: [200, 500],
    } as const;
    const [good, poor] = thresholds[metric];
    if (value <= good) return "good";
    if (value <= poor) return "needs-improvement";
    return "poor";
  };

  const reportVital = (
    metric: "LCP" | "CLS" | "FCP" | "TTFB" | "INP",
    value: number,
    location: { path: string; pageUrl: string },
  ) => {
    if (!Number.isFinite(value) || value <= 0) return;
    void sendVisitorTelemetry("engagement", {
      kind: "web_vital",
      metric,
      value: metric === "CLS" ? Number(value.toFixed(4)) : Math.round(value),
      rating: ratingFor(metric, value),
      deviceCategory,
    }, location);
  };

  const report = () => {
    if (reported) return;
    reported = true;
    reportVital("LCP", lcp, { path: lcpPath, pageUrl: lcpPageUrl });
    reportVital("CLS", cls, { path: clsPath, pageUrl: clsPageUrl });
    reportVital("FCP", fcp, { path: initialPath, pageUrl: initialPageUrl });
    reportVital("TTFB", ttfb, { path: initialPath, pageUrl: initialPageUrl });
    reportVital("INP", maxInteraction, { path: inpPath, pageUrl: inpPageUrl });

    const slowestApiCalls = [...apiTimings]
      .sort((a, b) => b.durationMs - a.durationMs)
      .slice(0, 8);
    for (const timing of slowestApiCalls) {
      void sendVisitorTelemetry("engagement", {
        kind: "api_timing",
        endpoint: timing.endpoint,
        durationMs: Math.round(timing.durationMs),
        transferSize: Math.round(timing.transferSize),
        encodedBodySize: Math.round(timing.encodedBodySize),
        initiatorType: timing.initiatorType,
        deviceCategory,
      }, { path: timing.routePath, pageUrl: timing.pageUrl });
    }
  };

  const onVisibility = () => {
    if (document.visibilityState === "hidden") report();
  };

  window.addEventListener("pagehide", report, { once: true });
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    report();
    for (const observer of observers) observer.disconnect();
    window.removeEventListener("pagehide", report);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}

export function installVisitorTelemetry() {
  if (typeof window === "undefined") return () => {};
  let lastPath = `${window.location.pathname}${window.location.search}`;
  let stopped = false;

  void sendVisitorTelemetry("session_start");
  void sendVisitorTelemetry("screen_view");
  const stopAlerts = installVisitorOnlineAlerts();
  const stopPerformance = installPerformanceTelemetry();
  const stopRuntimeErrors = installRuntimeErrorTelemetry();

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
    stopAlerts();
    stopPerformance();
    stopRuntimeErrors();
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", visibility);
  };
}
