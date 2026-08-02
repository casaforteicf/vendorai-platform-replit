const ROOT_DOMAIN = "appvendorai.com";
const MAIN_HOSTNAMES = new Set([ROOT_DOMAIN, `www.${ROOT_DOMAIN}`, "localhost", "127.0.0.1"]);

/**
 * Returns the subdomain slug when the app is accessed via a tenant's public
 * site (e.g. "wolmann-design" from "wolmann-design.appvendorai.com"), or
 * null when accessed from the platform's own hostnames — including the CRM
 * ("app.appvendorai.com" and "<slug>.app.appvendorai.com", which are never
 * a tenant's public site even though the second one has a slug in it).
 *
 * The backend resolves the full tenant object via its subdomain middleware,
 * so this hook is only needed for UI-level decisions (e.g. hiding the
 * tenant-switcher, pre-selecting a tenant, branding overrides).
 */
export function useTenantFromHost(): string | null {
  const host = window.location.hostname;

  if (MAIN_HOSTNAMES.has(host)) return null;
  if (host === `app.${ROOT_DOMAIN}` || host.endsWith(`.app.${ROOT_DOMAIN}`)) return null;

  if (host.endsWith(`.${ROOT_DOMAIN}`)) {
    const slug = host.slice(0, host.length - ROOT_DOMAIN.length - 1);
    return slug || null;
  }

  // Custom domain — return the full hostname so callers can distinguish it
  return host;
}
