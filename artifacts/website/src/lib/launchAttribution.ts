export type LaunchAttribution = {
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
  gclid?: string;
  fbclid?: string;
  pageUrl?: string;
  referrer?: string;
  landingPageSlug?: string;
  adDataConsent?: boolean;
};

export type AdDataConsentState = {
  granted: boolean;
  capturedAt: string;
  textVersion: string;
};

type BehaviorEventType = "page_view" | "cta_click" | "form_start" | "form_submit" | "engagement";

type BehaviorEventDetails = {
  engagedMs?: number;
  scrollDepth?: number;
  metadata?: Record<string, string | number | boolean | null>;
  pathOverride?: string;
  pageUrlOverride?: string;
};

const STORAGE_KEY = "vendorai_launch_attribution_v1";
const CONSENT_STORAGE_KEY = "vendorai_ad_data_consent_v1";
const BEHAVIOR_SESSION_KEY = "vendorai_behavior_session_v1";
const VISITOR_KEY = "vendorai_public_visitor_id_v1";
export const AD_DATA_CONSENT_TEXT_VERSION = "ad-data-measurement-v1-2026-09-01";
const FETCH_BRIDGE_MARKER = "__vendoraiPublicConsentBridgeInstalled";
const BEHAVIOR_TRACKING_MARKER = "__vendoraiBehaviorTrackingInstalled";
const API_BASE = import.meta.env.VITE_API_URL || "/api";

function randomId(prefix: string) {
  return typeof crypto?.randomUUID === "function"
    ? crypto.randomUUID()
    : `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

function parseUrl(raw: string | undefined): LaunchAttribution {
  if (!raw) return {};
  try {
    const url = new URL(raw, window.location.origin);
    const lpMatch = url.pathname.match(/^\/lp\/([^/?#]+)/);
    return {
      utmSource: url.searchParams.get("utm_source") ?? undefined,
      utmMedium: url.searchParams.get("utm_medium") ?? undefined,
      utmCampaign: url.searchParams.get("utm_campaign") ?? undefined,
      utmContent: url.searchParams.get("utm_content") ?? undefined,
      utmTerm: url.searchParams.get("utm_term") ?? undefined,
      gclid: url.searchParams.get("gclid") ?? undefined,
      fbclid: url.searchParams.get("fbclid") ?? undefined,
      pageUrl: url.toString(),
      landingPageSlug:
        lpMatch?.[1] ??
        (url.hostname.endsWith(".appvendorai.com")
          ? url.hostname.slice(0, -".appvendorai.com".length)
          : undefined),
    };
  } catch {
    return {};
  }
}

function hasPaidOrCampaignSignal(value: LaunchAttribution): boolean {
  return Boolean(
    value.utmSource ||
    value.utmMedium ||
    value.utmCampaign ||
    value.utmContent ||
    value.utmTerm ||
    value.gclid ||
    value.fbclid,
  );
}

export function getAdDataConsentState(): AdDataConsentState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AdDataConsentState>;
    if (typeof parsed.granted !== "boolean" || typeof parsed.capturedAt !== "string") return null;
    return {
      granted: parsed.granted,
      capturedAt: parsed.capturedAt,
      textVersion: typeof parsed.textVersion === "string" ? parsed.textVersion : AD_DATA_CONSENT_TEXT_VERSION,
    };
  } catch {
    return null;
  }
}

export function setAdDataConsent(granted: boolean): AdDataConsentState {
  const state: AdDataConsentState = {
    granted,
    capturedAt: new Date().toISOString(),
    textVersion: AD_DATA_CONSENT_TEXT_VERSION,
  };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Storage indisponível: a escolha continua válida apenas nesta interação.
    }
  }
  return state;
}

export function captureLaunchAttribution(): LaunchAttribution {
  if (typeof window === "undefined") return {};

  let stored: LaunchAttribution | null = null;
  try {
    const existingRaw = window.sessionStorage.getItem(STORAGE_KEY);
    if (existingRaw) stored = JSON.parse(existingRaw) as LaunchAttribution;
  } catch {
    // Storage indisponível: segue best-effort sem bloquear o site.
  }

  if (stored) {
    const consent = getAdDataConsentState();
    return { ...stored, ...(consent ? { adDataConsent: consent.granted } : {}) };
  }

  const current = parseUrl(window.location.href);
  const referrer = parseUrl(document.referrer || undefined);
  const source = hasPaidOrCampaignSignal(current)
    ? current
    : hasPaidOrCampaignSignal(referrer)
      ? referrer
      : current;

  const consent = getAdDataConsentState();
  const value: LaunchAttribution = {
    ...source,
    referrer: document.referrer || undefined,
    ...(consent ? { adDataConsent: consent.granted } : {}),
  };

  if (hasPaidOrCampaignSignal(value)) {
    try {
      const { adDataConsent: _consent, ...firstTouch } = value;
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(firstTouch));
    } catch {
      // Best-effort.
    }
  }

  return value;
}

export function getLaunchAttribution(): LaunchAttribution {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const consent = getAdDataConsentState();
      return {
        ...(JSON.parse(stored) as LaunchAttribution),
        ...(consent ? { adDataConsent: consent.granted } : {}),
      };
    }
  } catch {
    // Best-effort.
  }
  return captureLaunchAttribution();
}

export function getBehaviorSessionId(): string {
  if (typeof window === "undefined") return "server-session";
  try {
    const existing = window.sessionStorage.getItem(BEHAVIOR_SESSION_KEY);
    if (existing) return existing;
    const created = randomId("s");
    window.sessionStorage.setItem(BEHAVIOR_SESSION_KEY, created);
    return created;
  } catch {
    return randomId("s");
  }
}

/**
 * Identificador first-party pseudônimo e persistente. Não contém PII e serve
 * apenas para reconhecer a mesma pessoa entre sessões antes de ela se identificar.
 */
export function getPublicVisitorId(): string {
  if (typeof window === "undefined") return "server-visitor";
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

function sendBehaviorEvent(eventType: BehaviorEventType, details: BehaviorEventDetails = {}): void {
  if (typeof window === "undefined") return;
  const attribution = getLaunchAttribution();
  const path = details.pathOverride ?? `${window.location.pathname}${window.location.search}`;
  const pageUrl = details.pageUrlOverride ?? window.location.href;
  const body = JSON.stringify({
    anonymousSessionId: getBehaviorSessionId(),
    eventType,
    pageUrl,
    path,
    referrer: document.referrer || undefined,
    landingPageSlug: attribution.landingPageSlug,
    utmCampaign: attribution.utmCampaign,
    engagedMs: details.engagedMs,
    scrollDepth: details.scrollDepth,
    metadata: {
      surface: "site",
      visitorId: getPublicVisitorId(),
      utmSource: attribution.utmSource ?? null,
      utmMedium: attribution.utmMedium ?? null,
      utmCampaign: attribution.utmCampaign ?? null,
      utmContent: attribution.utmContent ?? null,
      utmTerm: attribution.utmTerm ?? null,
      hasAdDataConsent: attribution.adDataConsent === true,
      ...(details.metadata ?? {}),
    },
  });

  const url = `${API_BASE}/site/behavior-event`;
  if (eventType === "engagement" && typeof navigator.sendBeacon === "function") {
    try {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    } catch {
      // fallback para fetch keepalive
    }
  }

  void fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {});
}

function elementLabel(element: Element): string {
  const explicit = element.getAttribute("data-track-cta") || element.getAttribute("aria-label");
  const textContent = element.textContent?.replace(/\s+/g, " ").trim().slice(0, 120);
  return explicit?.slice(0, 120) || textContent || element.tagName.toLowerCase();
}

/**
 * Coleta first-party comercial do site. Registra páginas, tempo por rota, CTA,
 * início/abandono de formulário e recorrência sem capturar conteúdo digitado.
 */
export function installFirstPartyBehaviorTracking(): void {
  if (typeof window === "undefined") return;
  const w = window as typeof window & { [BEHAVIOR_TRACKING_MARKER]?: boolean };
  if (w[BEHAVIOR_TRACKING_MARKER]) return;
  w[BEHAVIOR_TRACKING_MARKER] = true;

  let activePath = `${window.location.pathname}${window.location.search}`;
  let activeUrl = window.location.href;
  let pageStartedAt = Date.now();
  let maxScrollDepth = 0;
  let lastFlushAt = 0;
  const startedForms = new WeakSet<HTMLFormElement>();

  const updateScroll = () => {
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const depth = Math.max(0, Math.min(100, Math.round((window.scrollY / scrollable) * 100)));
    if (depth > maxScrollDepth) maxScrollDepth = depth;
  };

  const sendPageView = () => {
    sendBehaviorEvent("page_view", {
      pathOverride: activePath,
      pageUrlOverride: activeUrl,
      metadata: { title: document.title.slice(0, 160) },
    });
  };

  const flushEngagement = (reason: string) => {
    const now = Date.now();
    const engagedMs = Math.max(0, now - pageStartedAt);
    if (engagedMs < 750 || now - lastFlushAt < 500) return;
    updateScroll();
    sendBehaviorEvent("engagement", {
      pathOverride: activePath,
      pageUrlOverride: activeUrl,
      engagedMs,
      scrollDepth: maxScrollDepth,
      metadata: {
        title: document.title.slice(0, 160),
        pagePath: activePath,
        flushReason: reason,
      },
    });
    lastFlushAt = now;
    pageStartedAt = now;
    maxScrollDepth = 0;
  };

  const syncRoute = () => {
    const nextPath = `${window.location.pathname}${window.location.search}`;
    if (nextPath === activePath) return;
    flushEngagement("route_change");
    activePath = nextPath;
    activeUrl = window.location.href;
    pageStartedAt = Date.now();
    maxScrollDepth = 0;
    sendPageView();
  };

  sendPageView();
  window.addEventListener("scroll", updateScroll, { passive: true });

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);
  window.history.pushState = ((...args: Parameters<History["pushState"]>) => {
    flushEngagement("route_change");
    originalPushState(...args);
    activePath = `${window.location.pathname}${window.location.search}`;
    activeUrl = window.location.href;
    pageStartedAt = Date.now();
    maxScrollDepth = 0;
    queueMicrotask(sendPageView);
  }) as History["pushState"];
  window.history.replaceState = ((...args: Parameters<History["replaceState"]>) => {
    const before = `${window.location.pathname}${window.location.search}`;
    originalReplaceState(...args);
    const after = `${window.location.pathname}${window.location.search}`;
    if (after !== before) {
      flushEngagement("route_change");
      activePath = after;
      activeUrl = window.location.href;
      pageStartedAt = Date.now();
      maxScrollDepth = 0;
      queueMicrotask(sendPageView);
    }
  }) as History["replaceState"];
  window.addEventListener("popstate", syncRoute);

  document.addEventListener("click", (event) => {
    const target = event.target instanceof Element
      ? event.target.closest("button, a, [role='button'], [data-track-cta]")
      : null;
    if (!target) return;

    const href = target instanceof HTMLAnchorElement ? target.href.slice(0, 500) : null;
    sendBehaviorEvent("cta_click", {
      metadata: {
        label: elementLabel(target),
        href,
        tag: target.tagName.toLowerCase(),
        elementId: target.id ? target.id.slice(0, 120) : null,
        trackKey: target.getAttribute("data-track-cta")?.slice(0, 120) ?? null,
      },
    });
  }, { capture: true });

  document.addEventListener("focusin", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    const form = target.closest("form");
    if (!form || startedForms.has(form)) return;
    startedForms.add(form);
    sendBehaviorEvent("form_start", {
      metadata: { formId: form.id || form.getAttribute("data-testid") || "anonymous-form" },
    });
  }, { capture: true });

  document.addEventListener("submit", (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;
    sendBehaviorEvent("form_submit", {
      metadata: { formId: form?.id || form?.getAttribute("data-testid") || "anonymous-form" },
    });
  }, { capture: true });

  window.addEventListener("pagehide", () => flushEngagement("pagehide"));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushEngagement("hidden");
    } else {
      pageStartedAt = Date.now();
    }
  });
}

function isPublicConversionEndpoint(input: RequestInfo | URL): boolean {
  try {
    const raw = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    const url = new URL(raw, window.location.origin);
    return (
      url.pathname.endsWith("/site/contato") ||
      url.pathname.endsWith("/auth/trial-signup") ||
      /\/public\/[^/]+\/intake$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}

/**
 * Ponte central para formulários públicos: injeta consentimento atual e o ID da
 * sessão comportamental. O ID não contém PII e permite vincular a navegação
 * anônima ao lead somente depois que o próprio visitante envia o formulário.
 */
export function installPublicFormConsentBridge(): void {
  if (typeof window === "undefined") return;
  const w = window as typeof window & { [FETCH_BRIDGE_MARKER]?: boolean };
  if (w[FETCH_BRIDGE_MARKER]) return;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    if (!isPublicConversionEndpoint(input) || !init?.body || typeof init.body !== "string") {
      return originalFetch(input, init);
    }

    const contentType = new Headers(init.headers).get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("application/json")) {
      return originalFetch(input, init);
    }

    try {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      if (typeof body["adDataConsent"] !== "boolean") {
        const consent = getAdDataConsentState();
        if (consent) body["adDataConsent"] = consent.granted;
      }
      if (typeof body["behaviorSessionId"] !== "string") {
        body["behaviorSessionId"] = getBehaviorSessionId();
      }
      return originalFetch(input, { ...init, body: JSON.stringify(body) });
    } catch {
      return originalFetch(input, init);
    }
  };

  w[FETCH_BRIDGE_MARKER] = true;
}
