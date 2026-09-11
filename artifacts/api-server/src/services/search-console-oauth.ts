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
// siteVerification é necessário pra verificar a propriedade automaticamente
// via meta tag (sem isso o usuário teria que verificar manualmente no
// próprio Search Console, fora do produto). webmasters é o escopo da API
// de Search Console em si (adicionar site, submeter sitemap).
const SCOPES = [
  "https://www.googleapis.com/auth/siteverification",
  "https://www.googleapis.com/auth/webmasters",
].join(" ");

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

// Resolve a URL pública real do tenant (domínio próprio ativo, senão
// subdomínio padrão) — mesma lógica usada no middleware de sitemap.xml.
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

// Cria/atualiza a conexão logo após o callback OAuth e já pede à Site
// Verification API um token de meta tag pra essa propriedade — precisamos
// dele ANTES de conseguir injetar a meta tag no HTML do site.
export async function saveSearchConsolePendingConnection(
  tenantId: string,
  refreshToken: string,
  accessToken: string,
  expiresIn?: number,
): Promise<string> {
  const siteUrl = await resolveTenantPublicUrl(tenantId);
  if (!siteUrl) throw new Error("Tenant não encontrado ao salvar conexão Search Console");

  const now = new Date();
  const expiresAt = expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null;

  const tokenRes = await fetch(`${SITE_VERIFICATION_API}/token`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      site: { type: "SITE", identifier: siteUrl },
      verificationMethod: "META",
    }),
  });
  if (!tokenRes.ok) {
    const text = await tokenRes.text();
    logger.error({ status: tokenRes.status, body: text, tenantId }, "Falha ao obter token de verificação do Search Console");
    throw new Error(`Site verification token request failed: ${tokenRes.status}`);
  }
  const tokenData = (await tokenRes.json()) as { token?: string };
  const verificationMetaToken = tokenData.token ?? null;

  const [existing] = await db
    .select()
    .from(searchConsoleConnectionsTable)
    .where(eq(searchConsoleConnectionsTable.tenantId, tenantId));

  if (existing) {
    await db
      .update(searchConsoleConnectionsTable)
      .set({
        siteUrl,
        refreshToken,
        accessToken,
        tokenExpiresAt: expiresAt,
        verified: false,
        verificationMetaToken,
        status: "pending_verification",
        disconnectedAt: null,
        updatedAt: now,
      })
      .where(eq(searchConsoleConnectionsTable.id, existing.id));
    logger.info({ tenantId }, "Search Console connection (pending) atualizada");
    return existing.id;
  }

  const [inserted] = await db
    .insert(searchConsoleConnectionsTable)
    .values({
      tenantId,
      siteUrl,
      refreshToken,
      accessToken,
      tokenExpiresAt: expiresAt,
      status: "pending_verification",
      verificationMetaToken,
      connectedAt: now,
      updatedAt: now,
    })
    .returning();
  logger.info({ tenantId, id: inserted.id }, "Search Console connection (pending) criada");
  return inserted.id;
}

// Chamada explicitamente pelo usuário DEPOIS que a meta tag já está
// publicada no site (o injectTenantMarketingTags cuida de colocá-la lá,
// mas a Site Verification API só confirma quando de fato busca a página).
// Uma vez verificado, adiciona a propriedade no Search Console e já
// submete o sitemap.
export async function verifyAndActivateSearchConsole(tenantId: string): Promise<{ verified: boolean }> {
  const conn = await getSearchConsoleConnectionByTenantId(tenantId);
  if (!conn || !conn.accessToken || !conn.siteUrl) {
    throw new Error("Conexão Search Console pendente não encontrada");
  }

  const verifyRes = await fetch(`${SITE_VERIFICATION_API}/webResource?verificationMethod=META`, {
    method: "POST",
    headers: { Authorization: `Bearer ${conn.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ site: { type: "SITE", identifier: conn.siteUrl } }),
  });

  if (!verifyRes.ok) {
    const text = await verifyRes.text();
    logger.warn({ status: verifyRes.status, body: text, tenantId }, "Verificação Search Console ainda não passou");
    return { verified: false };
  }

  // Adiciona a propriedade ao Search Console (idempotente — repetir não
  // dá erro se já existir) e submete o sitemap logo em seguida.
  await fetch(`${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(conn.siteUrl)}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${conn.accessToken}` },
  });

  const sitemapUrl = `${conn.siteUrl.replace(/\/$/, "")}/sitemap.xml`;
  const submitRes = await fetch(
    `${SEARCH_CONSOLE_API}/sites/${encodeURIComponent(conn.siteUrl)}/sitemaps/${encodeURIComponent(sitemapUrl)}`,
    { method: "PUT", headers: { Authorization: `Bearer ${conn.accessToken}` } },
  );
  const sitemapSubmitted = submitRes.ok;
  if (!sitemapSubmitted) {
    const text = await submitRes.text();
    logger.warn({ status: submitRes.status, body: text, tenantId }, "Falha ao submeter sitemap ao Search Console");
  }

  await db
    .update(searchConsoleConnectionsTable)
    .set({
      verified: true,
      status: "active",
      sitemapSubmittedAt: sitemapSubmitted ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(searchConsoleConnectionsTable.id, conn.id));

  logger.info({ tenantId, sitemapSubmitted }, "Search Console verificado e ativado");
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
  return conn.verificationMetaToken ?? null;
}
