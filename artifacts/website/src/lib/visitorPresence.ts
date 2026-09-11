import { getBehaviorSessionId, getLaunchAttribution } from "./launchAttribution";

const API_BASE = import.meta.env.VITE_API_URL || "/api";
const PRESENCE_INTERVAL_MS = 30_000;

function presencePayload(startedAt: number) {
  const attribution = getLaunchAttribution();
  return JSON.stringify({
    anonymousSessionId: getBehaviorSessionId(),
    eventType: "engagement",
    pageUrl: window.location.href,
    path: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || undefined,
    landingPageSlug: attribution.landingPageSlug,
    utmCampaign: attribution.utmCampaign,
    engagedMs: Math.max(0, Date.now() - startedAt),
    metadata: {
      surface: "site",
      heartbeat: true,
      hostname: window.location.hostname,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || null,
      language: navigator.language || null,
      utmSource: attribution.utmSource ?? null,
      utmMedium: attribution.utmMedium ?? null,
      utmCampaign: attribution.utmCampaign ?? null,
    },
  });
}

function sendPresence(startedAt: number) {
  if (document.visibilityState !== "visible") return;
  void fetch(`${API_BASE}/site/behavior-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: presencePayload(startedAt),
    keepalive: true,
  }).catch(() => {});
}

/**
 * Mantém a presença first-party do visitante público atualizada sem coletar IP
 * no navegador e sem abrir um endpoint novo. O servidor continua responsável
 * por qualquer enriquecimento geográfico permitido pela infraestrutura.
 */
export function installSiteVisitorPresence() {
  if (typeof window === "undefined") return () => {};
  const startedAt = Date.now();
  const interval = window.setInterval(() => sendPresence(startedAt), PRESENCE_INTERVAL_MS);
  const onVisible = () => {
    if (document.visibilityState === "visible") sendPresence(startedAt);
  };
  document.addEventListener("visibilitychange", onVisible);

  return () => {
    window.clearInterval(interval);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
