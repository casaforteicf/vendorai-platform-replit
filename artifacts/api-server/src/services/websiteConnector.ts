import { and, desc, eq } from "drizzle-orm";
import {
  contentAutopilotConfigTable,
  db,
  generatedSitesTable,
  tenantDomainsTable,
  tenantsTable,
} from "@workspace/db";

export type WebsitePlatform =
  | "vendorai"
  | "wordpress"
  | "wix"
  | "webflow"
  | "shopify"
  | "generic";

export type WebsiteConnectionStatus =
  | "connected_native"
  | "detected_needs_auth"
  | "not_configured";

export type WebsiteConnectionSource =
  | "autopilot_config"
  | "tenant_profile"
  | "tenant_domain"
  | "vendorai_subdomain"
  | "none";

export interface WebsiteConnectionSummary {
  siteUrl: string | null;
  hostname: string | null;
  source: WebsiteConnectionSource;
  platform: WebsitePlatform | null;
  platformLabel: string;
  status: WebsiteConnectionStatus;
  canPublish: boolean;
  publicationMode: "native" | "cms_required" | "not_configured";
  needsCmsConnection: boolean;
  nativeSiteSlug: string | null;
  replacedPlatformDefault: boolean;
  message: string;
}

const PLATFORM_ROOT_HOSTS = new Set([
  "appvendorai.com",
  "www.appvendorai.com",
  "app.appvendorai.com",
]);

export function normalizeWebsiteUrl(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || !url.hostname.includes(".")) {
      return null;
    }
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function hostnameOf(siteUrl: string | null): string | null {
  if (!siteUrl) return null;
  try {
    return new URL(siteUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isPlatformRoot(siteUrl: string | null): boolean {
  const hostname = hostnameOf(siteUrl);
  return hostname ? PLATFORM_ROOT_HOSTS.has(hostname) : false;
}

export function detectWebsitePlatform(siteUrl: string, isNative = false): WebsitePlatform {
  if (isNative) return "vendorai";
  const hostname = hostnameOf(siteUrl) ?? "";

  if (hostname === "wordpress.com" || hostname.endsWith(".wordpress.com")) return "wordpress";
  if (hostname === "wix.com" || hostname.endsWith(".wixsite.com")) return "wix";
  if (hostname === "webflow.io" || hostname.endsWith(".webflow.io")) return "webflow";
  if (hostname === "myshopify.com" || hostname.endsWith(".myshopify.com")) return "shopify";
  return "generic";
}

function platformLabel(platform: WebsitePlatform | null): string {
  switch (platform) {
    case "vendorai": return "Site VendorAI";
    case "wordpress": return "WordPress";
    case "wix": return "Wix / Wix Studio";
    case "webflow": return "Webflow";
    case "shopify": return "Shopify";
    case "generic": return "Site externo";
    default: return "Não configurado";
  }
}

/**
 * Resolve o destino oficial do site/blog do tenant.
 *
 * Ordem de verdade:
 *  1) URL explicitamente configurada no Content Autopilot;
 *  2) site principal do cadastro do tenant;
 *  3) domínio customizado ativo de um site hospedado pelo VendorAI;
 *  4) subdomínio VendorAI do tenant.
 *
 * Exceção importante: um appvendorai.com raiz salvo como default antigo nunca
 * ganha do site real do cliente. Isso corrige tenants que herdaram
 * www.appvendorai.com antes da configuração passar a ser tenant-scoped.
 */
export async function resolveWebsiteConnection(tenantId: string): Promise<WebsiteConnectionSummary> {
  const [configs, tenants, activeDomains, generatedSites] = await Promise.all([
    db
      .select({ siteUrl: contentAutopilotConfigTable.siteUrl })
      .from(contentAutopilotConfigTable)
      .where(eq(contentAutopilotConfigTable.tenantId, tenantId))
      .limit(1),
    db
      .select({
        site: tenantsTable.site,
        slug: tenantsTable.slug,
        subdomainSlug: tenantsTable.subdomainSlug,
      })
      .from(tenantsTable)
      .where(eq(tenantsTable.id, tenantId))
      .limit(1),
    db
      .select({ domain: tenantDomainsTable.domain })
      .from(tenantDomainsTable)
      .where(and(eq(tenantDomainsTable.tenantId, tenantId), eq(tenantDomainsTable.status, "active")))
      .orderBy(desc(tenantDomainsTable.updatedAt)),
    db
      .select({ siteSlug: generatedSitesTable.siteSlug, published: generatedSitesTable.published })
      .from(generatedSitesTable)
      .where(eq(generatedSitesTable.tenantId, tenantId))
      .orderBy(desc(generatedSitesTable.updatedAt)),
  ]);

  const configSite = normalizeWebsiteUrl(configs[0]?.siteUrl);
  const tenantSite = normalizeWebsiteUrl(tenants[0]?.site);
  const activeDomain = activeDomains[0]?.domain
    ? normalizeWebsiteUrl(`https://${activeDomains[0].domain}`)
    : null;
  const subdomainSite = tenants[0]?.subdomainSlug
    ? normalizeWebsiteUrl(`https://${tenants[0].subdomainSlug}.appvendorai.com`)
    : null;

  const replacedPlatformDefault = Boolean(
    configSite &&
    isPlatformRoot(configSite) &&
    tenantSite &&
    !isPlatformRoot(tenantSite) &&
    hostnameOf(configSite) !== hostnameOf(tenantSite),
  );

  let siteUrl: string | null = null;
  let source: WebsiteConnectionSource = "none";

  if (configSite && !replacedPlatformDefault) {
    siteUrl = configSite;
    source = "autopilot_config";
  } else if (tenantSite) {
    siteUrl = tenantSite;
    source = "tenant_profile";
  } else if (activeDomain) {
    siteUrl = activeDomain;
    source = "tenant_domain";
  } else if (subdomainSite) {
    siteUrl = subdomainSite;
    source = "vendorai_subdomain";
  }

  if (!siteUrl) {
    return {
      siteUrl: null,
      hostname: null,
      source,
      platform: null,
      platformLabel: platformLabel(null),
      status: "not_configured",
      canPublish: false,
      publicationMode: "not_configured",
      needsCmsConnection: false,
      nativeSiteSlug: null,
      replacedPlatformDefault,
      message: "Defina o site principal do cliente para o Content Autopilot analisar e publicar no destino correto.",
    };
  }

  const hostname = hostnameOf(siteUrl);
  const normalizedActiveDomains = new Set(
    activeDomains.map((row) => row.domain.trim().toLowerCase()).filter(Boolean),
  );
  const generatedSiteSlugs = new Set(
    generatedSites.map((row) => row.siteSlug).filter((slug): slug is string => Boolean(slug)),
  );

  const nativeSubdomainSlug = hostname?.endsWith(".appvendorai.com")
    ? hostname.slice(0, -".appvendorai.com".length)
    : null;
  const isNativeSubdomain = Boolean(
    nativeSubdomainSlug &&
    !nativeSubdomainSlug.includes(".") &&
    !PLATFORM_ROOT_HOSTS.has(hostname ?? "") &&
    (nativeSubdomainSlug === tenants[0]?.subdomainSlug || generatedSiteSlugs.has(nativeSubdomainSlug)),
  );
  const isNativeCustomDomain = Boolean(hostname && normalizedActiveDomains.has(hostname));
  const isNative = isNativeSubdomain || isNativeCustomDomain;

  const nativeSiteSlug = isNativeSubdomain
    ? nativeSubdomainSlug
    : generatedSites.find((row) => row.published && row.siteSlug)?.siteSlug
      ?? tenants[0]?.subdomainSlug
      ?? generatedSites.find((row) => row.siteSlug)?.siteSlug
      ?? null;

  const platform = detectWebsitePlatform(siteUrl, isNative);

  if (isNative) {
    return {
      siteUrl,
      hostname,
      source,
      platform,
      platformLabel: platformLabel(platform),
      status: "connected_native",
      canPublish: true,
      publicationMode: "native",
      needsCmsConnection: false,
      nativeSiteSlug,
      replacedPlatformDefault,
      message: "Site do tenant conectado ao publicador nativo. Rascunhos e publicações podem ser enviados diretamente.",
    };
  }

  return {
    siteUrl,
    hostname,
    source,
    platform,
    platformLabel: platformLabel(platform),
    status: "detected_needs_auth",
    canPublish: false,
    publicationMode: "cms_required",
    needsCmsConnection: true,
    nativeSiteSlug: null,
    replacedPlatformDefault,
    message: "Site do cliente identificado. A publicação automática fica bloqueada até o CMS deste site ser autenticado no VendorAI.",
  };
}
