const STORAGE_KEY = "vendorai_partner_attribution_v1";
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type PartnerAttribution = {
  code: string;
  source: string;
  sessionId: string;
  capturedAt: number;
  landingPath: string;
  utmSource?: string | null;
  utmMedium?: string | null;
  utmCampaign?: string | null;
};

function normalizeCode(value: string | null | undefined) {
  return (value ?? "").trim().toUpperCase().replace(/\s+/g, "");
}

function newSessionId() {
  try {
    if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // Fallback below.
  }
  return `ref-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function safeWrite(attribution: PartnerAttribution) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Storage may be unavailable in privacy-restricted contexts.
  }
}

function safeRead(): PartnerAttribution | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PartnerAttribution>;
    if (!parsed?.code || !parsed?.capturedAt || Date.now() - parsed.capturedAt > MAX_AGE_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    const normalized: PartnerAttribution = {
      code: normalizeCode(parsed.code),
      source: parsed.source || "ref",
      sessionId: parsed.sessionId || newSessionId(),
      capturedAt: parsed.capturedAt,
      landingPath: parsed.landingPath || "/",
      utmSource: parsed.utmSource ?? null,
      utmMedium: parsed.utmMedium ?? null,
      utmCampaign: parsed.utmCampaign ?? null,
    };
    if (!parsed.sessionId) safeWrite(normalized);
    return normalized;
  } catch {
    return null;
  }
}

export function getPartnerAttribution() {
  return safeRead();
}

export function clearPartnerAttribution() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable in privacy-restricted contexts.
  }
}

async function trackReferralClick(attribution: PartnerAttribution) {
  try {
    await fetch(`/api/partners/referrals/${encodeURIComponent(attribution.code)}/click`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        sessionId: attribution.sessionId,
        source: attribution.source,
        landingPath: attribution.landingPath,
        utmSource: attribution.utmSource ?? null,
        utmMedium: attribution.utmMedium ?? null,
        utmCampaign: attribution.utmCampaign ?? null,
      }),
    });
  } catch {
    // Attribution must never block navigation or checkout.
  }
}

export function capturePartnerAttributionFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    const aliases = ["ref", "coupon", "couponCode", "cupom", "cupomCodigo", "referralCode"];
    let code = "";
    let source = "";

    for (const key of aliases) {
      const candidate = normalizeCode(params.get(key));
      if (candidate) {
        code = candidate;
        source = key;
        break;
      }
    }

    if (!code) return safeRead();

    const previous = safeRead();
    const attribution: PartnerAttribution = {
      code,
      source,
      sessionId: previous?.code === code ? previous.sessionId : newSessionId(),
      capturedAt: Date.now(),
      landingPath: `${window.location.pathname}${window.location.search}`,
      utmSource: params.get("utm_source"),
      utmMedium: params.get("utm_medium"),
      utmCampaign: params.get("utm_campaign"),
    };

    safeWrite(attribution);
    void trackReferralClick(attribution);
    return attribution;
  } catch {
    return null;
  }
}

function isPracaOrderPost(input: RequestInfo | URL, init?: RequestInit) {
  const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "POST") return false;
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  return /\/api\/tenants\/[^/]+\/praca-orders(?:\?|$)/.test(url);
}

function hasReferral(body: Record<string, unknown>) {
  return Boolean(body.ref || body.couponCode || body.cupomCodigo || body.referralCode);
}

function installCheckoutFetchBridge() {
  const marker = "__vendoraiPartnerAttributionFetchBridge";
  const scope = window as typeof window & Record<string, unknown>;
  if (scope[marker]) return;
  scope[marker] = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const attribution = safeRead();
    if (!attribution || !isPracaOrderPost(input, init) || !init?.body || typeof init.body !== "string") {
      return originalFetch(input, init);
    }

    try {
      const body = JSON.parse(init.body) as Record<string, unknown>;
      if (body && typeof body === "object" && !Array.isArray(body) && !hasReferral(body)) {
        body.ref = attribution.code;
        body.origemAtribuicao = attribution.source;
        body.attributionMetadata = {
          ...((body.attributionMetadata && typeof body.attributionMetadata === "object" && !Array.isArray(body.attributionMetadata))
            ? body.attributionMetadata as Record<string, unknown>
            : {}),
          referralSessionId: attribution.sessionId,
          landingPath: attribution.landingPath,
          utmSource: attribution.utmSource ?? undefined,
          utmMedium: attribution.utmMedium ?? undefined,
          utmCampaign: attribution.utmCampaign ?? undefined,
        };
        return originalFetch(input, { ...init, body: JSON.stringify(body) });
      }
    } catch {
      // Non-JSON requests pass through untouched.
    }

    return originalFetch(input, init);
  };
}

capturePartnerAttributionFromUrl();
installCheckoutFetchBridge();
