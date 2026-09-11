import { getBehaviorSessionId, getLaunchAttribution } from "./launchAttribution";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const INSTALL_MARKER = "__vendoraiWebVitalsInstalled";

type MetricPayload = {
  name: string;
  value: number;
  delta: number;
  id: string;
  rating: "good" | "needs-improvement" | "poor";
  navigationType: string;
};

function deviceCategory(): "mobile" | "tablet" | "desktop" {
  const width = window.innerWidth;
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

function connectionType(): string | null {
  const connection = (navigator as Navigator & {
    connection?: { effectiveType?: string };
  }).connection;
  return connection?.effectiveType ?? null;
}

function report(metric: MetricPayload): void {
  const attribution = getLaunchAttribution();
  const body = JSON.stringify({
    anonymousSessionId: getBehaviorSessionId(),
    eventType: "engagement",
    pageUrl: window.location.href,
    path: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || undefined,
    landingPageSlug: attribution.landingPageSlug,
    utmCampaign: attribution.utmCampaign,
    metadata: {
      kind: "web_vital",
      metric: metric.name,
      value: Number(metric.value.toFixed(metric.name === "CLS" ? 4 : 1)),
      delta: Number(metric.delta.toFixed(metric.name === "CLS" ? 4 : 1)),
      metricId: metric.id,
      rating: metric.rating,
      navigationType: metric.navigationType,
      deviceCategory: deviceCategory(),
      effectiveConnectionType: connectionType(),
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
    },
  });

  void fetch(`${API_BASE}/site/behavior-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function installWebVitalsRUM(): void {
  if (typeof window === "undefined") return;
  const w = window as typeof window & { [INSTALL_MARKER]?: boolean };
  if (w[INSTALL_MARKER]) return;
  w[INSTALL_MARKER] = true;

  const start = () => {
    void import("web-vitals")
      .then(({ onCLS, onFCP, onINP, onLCP, onTTFB }) => {
        const handler = (metric: MetricPayload) => report(metric);
        onCLS(handler);
        onFCP(handler);
        onINP(handler);
        onLCP(handler);
        onTTFB(handler);
      })
      .catch(() => {});
  };

  if (document.readyState === "complete") {
    window.setTimeout(start, 0);
    return;
  }

  window.addEventListener("load", () => {
    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    };
    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(start, { timeout: 2000 });
    } else {
      window.setTimeout(start, 500);
    }
  }, { once: true });
}
