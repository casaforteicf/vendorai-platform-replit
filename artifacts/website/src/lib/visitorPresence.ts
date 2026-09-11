import { getBehaviorSessionId, getLaunchAttribution } from "./launchAttribution";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const PRESENCE_INTERVAL_MS = 30_000;
const VISITOR_KEY = "vendorai_public_visitor_id_v1";
const NAVIGATION_EVENT = "vendorai:navigation";
const HISTORY_PATCH_MARKER = "__vendoraiHistoryNavigationPatched";

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

function ensureNavigationEvents() {
  const w = window as typeof window & { [HISTORY_PATCH_MARKER]?: boolean };
  if (w[HISTORY_PATCH_MARKER]) return;

  const notify = () => window.dispatchEvent(new Event(NAVIGATION_EVENT));
  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = (...args) => {
    originalPushState(...args);
    notify();
  };
  window.history.replaceState = (...args) => {
    originalReplaceState(...args);
    notify();
  };

  w[HISTORY_PATCH_MARKER] = true;
}

/**
 * Mantém presença first-party e mede tempo por rota em sites SPA. O visitorId é
 * first-party: reconhece retorno no mesmo navegador sem criar fingerprint.
 * Mudanças de rota são capturadas por eventos de history/popstate, sem polling.
 */
export function installSiteVisitorPresence() {
  if (typeof window === "undefined") return () => {};

  ensureNavigationEvents();

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
    queueMicrotask(() => {
      if (!stopped) {
        sendEvent("page_view", activePath, pageStartedAt, { spaRouteChange: true, title: document.title.slice(0, 160) });
      }
    });
  };

  const presenceInterval = window.setInterval(() => {
    if (document.visibilityState === "visible") flushActivePage("heartbeat");
  }, PRESENCE_INTERVAL_MS);

  const onNavigation = () => syncRoute();
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

  window.addEventListener(NAVIGATION_EVENT, onNavigation);
  window.addEventListener("popstate", onPopState);
  window.addEventListener("pagehide", onPageHide);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    flushActivePage("unmount");
    stopped = true;
    window.clearInterval(presenceInterval);
    window.removeEventListener(NAVIGATION_EVENT, onNavigation);
    window.removeEventListener("popstate", onPopState);
    window.removeEventListener("pagehide", onPageHide);
    document.removeEventListener("visibilitychange", onVisibility);
  };
}
