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
};

const STORAGE_KEY = "vendorai_launch_attribution_v1";

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

export function captureLaunchAttribution(): LaunchAttribution {
  if (typeof window === "undefined") return {};

  try {
    const existingRaw = window.sessionStorage.getItem(STORAGE_KEY);
    if (existingRaw) return JSON.parse(existingRaw) as LaunchAttribution;
  } catch {
    // Storage indisponível: segue best-effort sem bloquear o site.
  }

  const current = parseUrl(window.location.href);
  const referrer = parseUrl(document.referrer || undefined);
  const source = hasPaidOrCampaignSignal(current)
    ? current
    : hasPaidOrCampaignSignal(referrer)
      ? referrer
      : current;

  const value: LaunchAttribution = {
    ...source,
    referrer: document.referrer || undefined,
  };

  // Só persiste first-touch quando existe um sinal real de aquisição. Acesso
  // orgânico continua funcionando, mas não cria uma falsa atribuição de mídia.
  if (hasPaidOrCampaignSignal(value)) {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value));
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
    if (stored) return JSON.parse(stored) as LaunchAttribution;
  } catch {
    // Best-effort.
  }
  return captureLaunchAttribution();
}
