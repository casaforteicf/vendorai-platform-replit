import { eq, and } from "drizzle-orm";
import { db, searchConsoleConnectionsTable, tenantsTable, tenantDomainsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

// Reaproveita as mesmas credenciais OAuth do Google Ads (mesmo projeto no
// Google Cloud Console) — só precisa de escopo adicional. Se um dia isso
// precisar de um client OAuth dedicado, GOOGLE_SEARCH_CONSOLE_CLIENT_ID/
// SECRET tomam precedência quando configurados.
const CLIENT_ID = process.env["GOOGLE_SEARCH_CONSOLE_CLIENT_ID"] ?? process.env["GOOGLE_ADS_CLIENT_ID"];
const CLIENT_SECRET = process.env["GOOGLE_SEARCH_CONSOLE_CLIENT_SECRET"] ?? process.env["GOOGLE_ADS_CLIENT_SECRET"];

function getRedirectUri(): string {
  const configured = process.env["GOOGLE_SEARCH_CONSOLE_REDIRECT_URI"]?.trim();
  if (configured) return configured;

  if (process.env["NODE_ENV"] === "production") {
    return "https://appvendorai.com/api/auth/search-console/callback";
  }

  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  if (domain) return `https://${domain}/api/auth/search-console/callback`;
  return "http://localhost:3000/api/auth/search-console/callback";
}

const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_BASE = "https://oauth2.googleapis.com/token";
const SITE_VERIFICATION_API = "https://www.googleapis.com/siteVerification/v1";
const SEARCH_CONSOLE_API = "https://www.googleapis.com/webmasters/v3";
const PLATFORM_TENANT_SLUG = (process.env["VENDORAI_PUBLIC_TENANT_SLUG"] ?? "vendorai").trim().toLowerCase();
const PLATFORM_PUBLIC_SITE_URL = (process.env["VENDORAI_PUBLIC_SITE_URL"] ?? "https://appvendorai.com/").trim();
// siteVerification é necessário pra verificar a propriedade automaticamente
// via meta tag quando a conta ainda não possui uma propriedade verificada.
// webmasters é o escopo da API de Search Console em si.
const SCOPES = [
  "https://www.googleapis.com/auth/siteverification",
  "https://www.googleapis.com/auth/webmasters",
].join(" ");

function normalizeMetaVerificationToken(token: string | null | undefined): string | null {
  const trimmed = token?.trim();
  if (!trimmed) return null;

  // A Site Verification API pode devolver o método META como a tag HTML
  // completa. O middleware público já monta a tag, então persistimos apenas
  // o valor do atributo content. Também corrige conexões antigas.
  if (/^<meta\b/i.test(trimmed) && /google-site-verification/i.test(trimmed)) {
    const contentMatch = trimmed.match(/\bcontent\s*=\s*(["'])(.*?)\1/i);
    const content = contentMatch?.[2]?.trim();
    return content || null;
  }

  return trimmed;
}

export function buildSearchConsoleOAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: CLIENT_ID ?? "",
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    state,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
  });
  return `${GOOGLE_OAUTH_BASE}?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

type SearchConsoleSiteEntry = {
  siteUrl?: string;
  permissionLevel?: string;
};

function normalizePublicUrl(value: string): string {
  const url = new URL(value);
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url.toString();
}

function domainPropertyFor(siteUrl: string): string | null {
  try {
    const host = new URL(siteUrl).hostname.replace(/^www\./i, "").toLowerCase();
    return host ? `sc-domain:${host}` : null;
  } catch {
    return null;
  }
}

async function listAccessibleSearchConsoleSites(accessToken: string): Promise<SearchConsoleSiteEntry[]> {
  const response = await fetch(`${SEARCH_CONSOLE_API}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    const text = await response.text();
    logger.warn({ status: response.status, body: text }, "Falha ao listar propriedades acessíveis no Search Console");
    return [];
  }
  const body = await response.json() as { siteEntry?: SearchConsoleSiteEntry[] };
  return Array.isArray(body.siteEntry) ? body.siteEntry : [];
}

async function ensureUrlPrefixFromExistingOwnership(
  accessToken: string,
  siteUrl: string,
  tenantId: string,
): Promise<boolean> {
  const entries = await listAccessibleSearchConsoleSites(accessToken);
  const normalizedSiteUrl = normalizePublicUrl(siteUrl);
  const domainProperty = domainPropertyFor(siteUrl);
  const usable = (entry: SearchConsoleSiteEntry) => entry.permissionLevel !== "siteUnverifiedUser";

  const exact = entries.find((entry) => entry.siteUrl === normalizedSiteUrl && usable(entry));
  if (exact) return true;

  const inheritedDomain = domainProperty
    ? entries.find((entry) => entry.siteUrl === domainProperty && usable(entry))
    : undefined;
  if (!inheritedDomain) return false;

  // O usuário já possui o domínio no Search Console. Criamos/garantimos a
  // propriedade URL-prefix usada pelo VendorAI; a propriedade de domínio
  // concede a verificação automaticamente para este prefixo.
  const addResponse = await fetch(`${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(normalizedSiteUrl)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!addResponse.ok) {
    const text = await addResponse.text();
    logger.warn({ status: addResponse.status, body: text, tenantId, siteUrl: normalizedSiteUrl }, "Falha ao criar propriedade URL-prefix a partir de domínio já verificado");
    return false;
  }

  logger.info({ tenantId, siteUrl: normalizedSiteUrl, domainProperty }, "Search Console reconheceu propriedade já verificada");
  return true;
}

async function submitSitemap(accessToken: string, siteUrl: string, tenantId: string): Promise<boolean> {
  const normalizedSiteUrl = normalizePublicUrl(siteUrl);
  const sitemapUrl = `${normalizedSiteUrl.replace(/\/$/, "")}/sitemap.xml`;
  const submitRes = await fetch(
    `${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(normalizedSiteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
    { method: "PUT", headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!submitRes.ok) {
    const text = await submitRes.text();
    logger.warn({ status: submitRes.status, body: text, tenantId, siteUrl: normalizedSiteUrl }, "Falha ao submeter sitemap ao Search Console");
    return false;
  }
  return true;
}

async function requestVerificationMetaToken(accessToken: string, siteUrl: string, tenantId: string): Promise<string> {
  const normalizedSiteUrl = normalizePublicUrl(siteUrl);
  const tokenRes = await fetch(`${SITE_VERIFICATION_API}/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      site: { type: "SITE", identifier: normalizedSiteUrl },
      verificationMethod: "META",
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    logger.error({ status: tokenRes.status, body: text, tenantId, siteUrl: normalizedSiteUrl }, "Falha ao obter token de verificação do Search Console");
    throw new Error(`Site verification token request failed: ${tokenRes.status}`);
  }
  const tokenData = await tokenRes.json() as { token?: string };
  const verificationMetaToken = normalizeMetaVerificationToken(tokenData.token);
  if (!verificationMetaToken) {
    logger.error({ tenantId, siteUrl: normalizedSiteUrl }, "Google retornou token META vazio ou inválido para Search Console");
    throw new Error("Site verification token inválido");
  }
  return verificationMetaToken;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: CLIENT_ID ?? "",
    client_secret: CLIENT_SECRET ?? "",
    redirect_uri: getRedirectUri(),
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text }, "Falha ao trocar code por token Search Console");
    throw new Error(`Token exchange failed: ${res.status}`);
  }
  return res.json() as Promise<GoogleTokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: CLIENT_ID ?? "",
    client_secret: CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
  });
  const res = await fetch(GOOGLE_TOKEN_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text }, "Falha ao renovar access token Search Console");
    throw new Error(`Token refresh failed: ${res.status}`);
  }
  return res.json() as Promise<GoogleTokenResponse>;
}

// Resolve a URL pública real do tenant (domínio próprio ativo, domínio oficial
// da plataforma quando aplicável, ou subdomínio padrão).
export async function resolveTenantPublicUrl(tenantId: string): Promise<string | null> {
  const [tenant] = await db
    .select({ subdomainSlug: tenantsTable.subdomainSlug, slug: tenantsTable.slug })
    .from(tenantsTable)
    .where(eq(tenantsTable.id, tenantId));
  if (!tenant) return null;

  const [activeDomain] = await db
    .select({ domain: tenantDomainsTable.domain })
    .from(tenantDomainsTable)
    .where(and(eq(tenantDomainsTable.tenantId, tenantId), eq(tenantDomainsTable.status, "active")))
    .limit(1);

  const activeHost = activeDomain?.domain
    ?.trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "");
  if (activeHost) return `https://${activeHost}/`;

  const tenantSlug = (tenant.slug ?? "").trim().toLowerCase();
  const tenantSubdomain = (tenant.subdomainSlug ?? "").trim().toLowerCase();
  if (tenantSlug === PLATFORM_TENANT_SLUG || tenantSubdomain === PLATFORM_TENANT_SLUG) {
    return normalizePublicUrl(PLATFORM_PUBLIC_SITE_URL);
  }

  if (tenant.subdomainSlug) {
    return `https://${tenant.subdomainSlug}.appvendorai.com/`;
  }

  return null;
}

export async function getSearchConsoleConnectionByTenantId(tenantId: string) {
  const [conn] = await db
    .select()
    .from(searchConsoleConnectionsTable)
    .where(eq(searchConsoleConnectionsTable.tenantId, tenantId));
  return conn ?? null;
}

// Cria/atualiza a conexão. Se a conta já possui a propriedade (inclusive
// via sc-domain), o VendorAI reconhece essa posse e ativa sem pedir uma
// segunda verificação por meta tag.
export async function saveSearchConsolePendingConnection(
  tenantId: string,
  refreshToken: string,
  accessToken: string,
  expiresIn?: number,
): Promise<string> {
  const resolvedSiteUrl = await resolveTenantPublicUrl(tenantId);
  if (!resolvedSiteUrl) throw new Error("Tenant não encontrado ao salvar conexão Search Console");
  const siteUrl = normalizePublicUrl(resolvedSiteUrl);

  const now = new Date();
  const expiresAt = expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null;
  const alreadyOwned = await ensureUrlPrefixFromExistingOwnership(accessToken, siteUrl, tenantId);
  const verificationMetaToken = alreadyOwned ? null : await requestVerificationMetaToken(accessToken, siteUrl, tenantId);
  const sitemapSubmitted = alreadyOwned ? await submitSitemap(accessToken, siteUrl, tenantId) : false;

  const [existing] = await db
    .select()
    .from(searchConsoleConnectionsTable)
    .where(eq(searchConsoleConnectionsTable.tenantId, tenantId));

  const nextValues = {
    siteUrl,
    refreshToken,
    accessToken,
    tokenExpiresAt: expiresAt,
    verified: alreadyOwned,
    verificationMetaToken,
    status: alreadyOwned ? "active" : "pending_verification",
    sitemapSubmittedAt: alreadyOwned && sitemapSubmitted ? now : null,
    disconnectedAt: null,
    updatedAt: now,
  };

  if (existing) {
    await db
      .update(searchConsoleConnectionsTable)
      .set(nextValues)
      .where(eq(searchConsoleConnectionsTable.id, existing.id));
    logger.info({ tenantId, siteUrl, alreadyOwned }, "Search Console connection atualizada");
    return existing.id;
  }

  const [inserted] = await db
    .insert(searchConsoleConnectionsTable)
    .values({
      tenantId,
      ...nextValues,
      connectedAt: now,
    })
    .returning();
  logger.info({ tenantId, id: inserted.id, siteUrl, alreadyOwned }, "Search Console connection criada");
  return inserted.id;
}

// Chamada explicitamente pelo usuário quando a propriedade ainda aparece
// pendente. Antes de recorrer à meta tag, o fluxo recalcula o domínio real e
// verifica se a conta já possui esse domínio/propriedade no Search Console.
export async function verifyAndActivateSearchConsole(tenantId: string): Promise<{ verified: boolean }> {
  let conn = await getSearchConsoleConnectionByTenantId(tenantId);
  if (!conn || !conn.refreshToken || !conn.siteUrl) {
    throw new Error("Conexão Search Console pendente não encontrada");
  }

  const tokenExpiresAtMs = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : null;
  const tokenExpiredOrNearExpiry = !conn.accessToken || (tokenExpiresAtMs !== null && tokenExpiresAtMs <= Date.now() + 60_000);

  if (tokenExpiredOrNearExpiry) {
    await refreshSearchConsoleToken(conn.id);
    const refreshedConn = await getSearchConsoleConnectionByTenantId(tenantId);
    if (!refreshedConn?.accessToken) {
      throw new Error("Não foi possível renovar o token do Search Console");
    }
    conn = refreshedConn;
  }

  const resolvedSiteUrl = await resolveTenantPublicUrl(tenantId);
  if (!resolvedSiteUrl) throw new Error("Não foi possível resolver o domínio público do tenant");
  const canonicalSiteUrl = normalizePublicUrl(resolvedSiteUrl);

  if (conn.siteUrl !== canonicalSiteUrl) {
    await db
      .update(searchConsoleConnectionsTable)
      .set({
        siteUrl: canonicalSiteUrl,
        verified: false,
        verificationMetaToken: null,
        status: "pending_verification",
        sitemapSubmittedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(searchConsoleConnectionsTable.id, conn.id));
    const updatedConn = await getSearchConsoleConnectionByTenantId(tenantId);
    if (!updatedConn?.accessToken) throw new Error("Falha ao atualizar o domínio do Search Console");
    conn = updatedConn;
  }

  const alreadyOwned = await ensureUrlPrefixFromExistingOwnership(conn.accessToken!, canonicalSiteUrl, tenantId);
  if (alreadyOwned) {
    const sitemapSubmitted = await submitSitemap(conn.accessToken!, canonicalSiteUrl, tenantId);
    await db
      .update(searchConsoleConnectionsTable)
      .set({
        siteUrl: canonicalSiteUrl,
        verified: true,
        verificationMetaToken: null,
        status: "active",
        sitemapSubmittedAt: sitemapSubmitted ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(searchConsoleConnectionsTable.id, conn.id));

    logger.info({ tenantId, siteUrl: canonicalSiteUrl, sitemapSubmitted }, "Search Console ativado por propriedade já verificada");
    return { verified: true };
  }

  if (!conn.verificationMetaToken) {
    const verificationMetaToken = await requestVerificationMetaToken(conn.accessToken!, canonicalSiteUrl, tenantId);
    await db
      .update(searchConsoleConnectionsTable)
      .set({ verificationMetaToken, siteUrl: canonicalSiteUrl, updatedAt: new Date() })
      .where(eq(searchConsoleConnectionsTable.id, conn.id));
    const updatedConn = await getSearchConsoleConnectionByTenantId(tenantId);
    if (updatedConn) conn = updatedConn;
  }

  const verifyRequest = (accessToken: string) => fetch(`${SITE_VERIFICATION_API}/webResource?verificationMethod=META`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ site: { type: "SITE", identifier: canonicalSiteUrl } }),
  });

  let verifyRes = await verifyRequest(conn.accessToken!);

  // O access token do Google expira. Se o tenant verificar depois, renovamos
  // automaticamente em vez de informar incorretamente que ainda está propagando.
  if (verifyRes.status === 401) {
    await refreshSearchConsoleToken(conn.id);
    const refreshedConn = await getSearchConsoleConnectionByTenantId(tenantId);
    if (!refreshedConn?.accessToken) {
      throw new Error("Não foi possível renovar o token do Search Console");
    }
    conn = refreshedConn;
    verifyRes = await verifyRequest(refreshedConn.accessToken);
  }

  if (!verifyRes.ok) {
    const text = await verifyRes.text();
    logger.warn({ status: verifyRes.status, body: text, tenantId, siteUrl: canonicalSiteUrl }, "Verificação Search Console ainda não passou");
    if (verifyRes.status === 401 || verifyRes.status === 403) {
      throw new Error(`Falha de autorização da Site Verification API: ${verifyRes.status}`);
    }
    return { verified: false };
  }

  // Adiciona a propriedade ao Search Console (idempotente — repetir não
  // dá erro se já existir) e submete o sitemap logo em seguida.
  await fetch(`${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(canonicalSiteUrl)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${conn.accessToken}` },
  });

  const sitemapSubmitted = await submitSitemap(conn.accessToken!, canonicalSiteUrl, tenantId);

  await db
    .update(searchConsoleConnectionsTable)
    .set({
      siteUrl: canonicalSiteUrl,
      verified: true,
      verificationMetaToken: null,
      status: "active",
      sitemapSubmittedAt: sitemapSubmitted ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(searchConsoleConnectionsTable.id, conn.id));

  logger.info({ tenantId, siteUrl: canonicalSiteUrl, sitemapSubmitted }, "Search Console verificado e ativado");
  return { verified: true };
}

export async function refreshSearchConsoleToken(connectionId: string): Promise<void> {
  const [conn] = await db
    .select()
    .from(searchConsoleConnectionsTable)
    .where(eq(searchConsoleConnectionsTable.id, connectionId));
  if (!conn || !conn.refreshToken) {
    throw new Error("Connection not found or missing refresh token");
  }
  const refreshed = await refreshAccessToken(conn.refreshToken);
  const now = new Date();
  const expiresAt = refreshed.expires_in ? new Date(now.getTime() + refreshed.expires_in * 1000) : null;
  await db
    .update(searchConsoleConnectionsTable)
    .set({ accessToken: refreshed.access_token, tokenExpiresAt: expiresAt, updatedAt: now })
    .where(eq(searchConsoleConnectionsTable.id, connectionId));
  logger.info({ connectionId }, "Search Console access token renovado");
}

export async function disconnectSearchConsole(tenantId: string): Promise<void> {
  const conn = await getSearchConsoleConnectionByTenantId(tenantId);
  if (!conn) {
    logger.warn({ tenantId }, "No Search Console connection to disconnect");
    return;
  }
  await db
    .update(searchConsoleConnectionsTable)
    .set({ status: "disconnected", disconnectedAt: new Date(), updatedAt: new Date() })
    .where(eq(searchConsoleConnectionsTable.id, conn.id));
  logger.info({ tenantId, connectionId: conn.id }, "Search Console desconectado");
}

// Exportado pro middleware de subdomínio poder injetar a meta tag de
// verificação junto com as outras tags de marketing, quando o tenant tiver
// uma verificação pendente.
export async function getPendingVerificationMetaToken(tenantId: string): Promise<string | null> {
  const conn = await getSearchConsoleConnectionByTenantId(tenantId);
  if (!conn || conn.verified || conn.status === "disconnected") return null;
  return normalizeMetaVerificationToken(conn.verificationMetaToken);
}
