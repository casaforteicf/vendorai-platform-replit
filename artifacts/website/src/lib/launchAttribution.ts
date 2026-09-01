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

const STORAGE_KEY = "vendorai_launch_attribution_v1";
const CONSENT_STORAGE_KEY = "vendorai_ad_data_consent_v1";
export const AD_DATA_CONSENT_TEXT_VERSION = "ad-data-measurement-v1-2026-09-01";
const FETCH_BRIDGE_MARKER = "__vendoraiPublicConsentBridgeInstalled";

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

  // Só persiste first-touch quando existe um sinal real de aquisição. Acesso
  // orgânico continua funcionando, mas não cria uma falsa atribuição de mídia.
  if (hasPaidOrCampaignSignal(value)) {
    try {
      // Consentimento não faz parte do first-touch: é sempre lido do estado
      // atual, para que uma escolha posterior não fique congelada na atribuição.
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
 * Ponte central para os formulários públicos do site. Ela só toca requests JSON
 * para os endpoints de conversão conhecidos e acrescenta a escolha atual de
 * consentimento quando o formulário ainda não enviou esse campo.
 *
 * Isso evita duplicar a mesma regra em cada LP vertical e preserva os payloads
 * existentes. Ausência de escolha continua sendo ausência/false no backend.
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
      return originalFetch(input, { ...init, body: JSON.stringify(body) });
    } catch {
      return originalFetch(input, init);
    }
  };

  w[FETCH_BRIDGE_MARKER] = true;
}