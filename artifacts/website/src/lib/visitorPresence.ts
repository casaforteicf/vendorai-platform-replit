import { getBehaviorSessionId, getLaunchAttribution } from "./launchAttribution";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const PRESENCE_INTERVAL_MS = 30_000;
const ROUTE_CHECK_INTERVAL_MS = 750;
const VISITOR_KEY = "vendorai_public_visitor_id_v1";

function stableVisitorId() {
  try {
    const existing = window.localStorage.getItem(VISITOR_KEY);
    if (existing) return existing;
    const created = typeof crypto?.randomUUID === "function"
      ? crypto.randomUUID()
      : `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
    window.localStorage.setItem(VISITOR_KEY, created);
    return created;
  } catch {
    return `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  }
}

function currentPath() {
  return `${window.location.pathname}${window.location.search}`;
}

function eventPayload(
  eventType: "engagement" | "page_view",
  path: string,
  startedAt: number,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  const attribution = getLaunchAttribution();
  return JSON.stringify({
    anonymousSessionId: getBehaviorSessionId(),
    eventType,
    pageUrl: window.location.href,
    path,
    referrer: document.referrer || undefined,
    landingPageSlug: attribution.landingPageSlug,
    utmCampaign: attribution.utmCampaign,
    engagedMs: eventType === "engagement" ? Math.max(0, Date.now() - startedAt) : undefined,
    metadata: {
      surface: "site",
      visitorId: stableVisitorId(),
      hostname: window.location.hostname,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      language: navigator.language || null,
      utmSource: attribution.utmSource ?? null,
      utmMedium: attribution.utmMedium ?? null,
      utmCampaign: attribution.utmCampaign ?? null,
      ...metadata,
    },
  });
}

function sendEvent(
  eventType: "engagement" | "page_view",
  path: string,
  startedAt: number,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  void fetch(`${API_BASE}/site/behavior-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: eventPayload(eventType, path, startedAt, metadata),
    keepalive: true,
  }).catch(() => {});
}

/**
 * Mantém presença first-party e mede tempo por rota em sites SPA. O visitorId é
 * first-party: reconhece retorno no mesmo navegador sem criar fingerprint.
 * Quando a rota muda, fecha o tempo da página anterior e abre uma nova page_view.
 */
export function installSiteVisitorPresence() {
  if (typeof window === "undefined") return () => {};

  let activePath = currentPath();
  let pageStartedAt = Date.now();
  let stopped = false;

  const flushActivePage = (reason: string) => {
    if (stopped) return;
    const elapsed = Math.max(0, Date.now() - pageStartedAt);
    if (elapsed < 500) return;
    sendEvent("engagement", activePath, pageStartedAt, { heartbeat: reason === "heartbeat", engagementReason: reason });
  };

  const syncRoute = () => {
    if (stopped) return;
    const nextPath = currentPath();
    if (nextPath === activePath) return;
    flushActivePage("route_change");
    activePath = nextPath;
    pageStartedAt = Date.now();
    sendEvent("page_view", activePath, pageStartedAt, { spaRouteChange: true, title: document.title.slice(0, 160) });
  };

  // Presence heartbeat: mantém online e também atualiza o tempo da página atual.
  const presenceInterval = window.setInterval(() => {
    syncRoute();
    if (document.visibilityState === "visible") flushActivePage("heartbeat");
  }, PRESENCE_INTERVAL_MS);

  // React/Wouter muda history sem necessariamente disparar popstate; polling leve
  // evita monkey-patch global em history e captura a rota em menos de 1 segundo.
  const routeInterval = window.setInterval(syncRoute, ROUTE_CHECK_INTERVAL_MS);
  const onPopState = () => syncRoute();
  const onVisibility = () => {
    if (document.visibilityState === "hidden") {
      flushActivePage("hidden");
      return;
    }
    syncRoute();
    pageStartedAt = Date.now();
  };
  const onPageHide = () => flushActivePage("pagehide");

  window.addEventListener("popstate", onPopState);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibility);

  // launchAttribution já envia a primeira page_view; aqui só mantemos presença.
  flushActivePage("heartbeat");

  return () => {
    flushActivePage("unmount");
    stopped = true;
    window.clearInterval(presenceInterval);
    window.clearInterval(routeInterval);
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
