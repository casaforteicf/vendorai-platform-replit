import { and, eq, isNull, ne } from "drizzle-orm";
import { db, googleAdsConnectionsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

const GOOGLE_ADS_CLIENT_ID = process.env["GOOGLE_ADS_CLIENT_ID"];
const GOOGLE_ADS_CLIENT_SECRET = process.env["GOOGLE_ADS_CLIENT_SECRET"];
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env["GOOGLE_ADS_DEVELOPER_TOKEN"];

function getRedirectUri(): string {
  const configured = process.env["GOOGLE_ADS_REDIRECT_URI"]?.trim();
  if (configured) return configured;

  if (process.env["NODE_ENV"] === "production") {
    return "https://appvendorai.com/api/auth/google-ads/callback";
  }

  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  if (domain) return `https://${domain}/api/auth/google-ads/callback`;
  return "http://localhost:3000/api/auth/google-ads/callback";
}

const GOOGLE_OAUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_BASE = "https://oauth2.googleapis.com/token";
const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v25";
const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
const GOOGLE_DATA_MANAGER_SCOPE = "https://www.googleapis.com/auth/datamanager";
const GOOGLE_COMBINED_SCOPES = `${GOOGLE_ADS_SCOPE} ${GOOGLE_DATA_MANAGER_SCOPE}`;

export function buildGoogleAdsOAuthUrl(_tenantId: string, state: string): string {
  const redirectUri = getRedirectUri();
  const params = new URLSearchParams({
    client_id: GOOGLE_ADS_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    scope: GOOGLE_COMBINED_SCOPES,
    state,
    response_type: "code",
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
  });
  return `${GOOGLE_OAUTH_BASE}?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    code,
    client_id: GOOGLE_ADS_CLIENT_ID ?? "",
    client_secret: GOOGLE_ADS_CLIENT_SECRET ?? "",
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
    logger.error({ status: res.status, body: text }, "Falha ao trocar code por token Google Ads/Data Manager");
    throw new Error(`Token exchange failed: ${res.status}`);
  }
  return res.json() as Promise<GoogleTokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: GOOGLE_ADS_CLIENT_ID ?? "",
    client_secret: GOOGLE_ADS_CLIENT_SECRET ?? "",
    grant_type: "refresh_token",
  });

  const res = await fetch(GOOGLE_TOKEN_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text }, "Falha ao renovar access token Google Ads/Data Manager");
    throw new Error(`Token refresh failed: ${res.status}`);
  }
  return res.json() as Promise<GoogleTokenResponse>;
}

export interface AccessibleCustomer {
  customerId: string;
}

export async function listAccessibleCustomers(accessToken: string): Promise<AccessibleCustomer[]> {
  const res = await fetch(`${GOOGLE_ADS_API_BASE}/customers:listAccessibleCustomers`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error(`Falha ao listar contas Google Ads acessíveis: status=${res.status} body=${text.slice(0, 500)}`);
    throw new Error(`List accessible customers failed: ${res.status}`);
  }
  const data = (await res.json()) as { resourceNames?: string[] };
  return (data.resourceNames ?? []).map((resourceName) => ({
    customerId: resourceName.split("/")[1] ?? resourceName,
  }));
}

export interface GoogleAdsCustomerInfo {
  customerId: string;
  descriptiveName: string | null;
  currencyCode: string | null;
  timeZone: string | null;
}

export async function fetchCustomerInfo(
  customerId: string,
  accessToken: string,
  loginCustomerId?: string,
): Promise<GoogleAdsCustomerInfo> {
  const query = "SELECT customer.descriptive_name, customer.currency_code, customer.time_zone FROM customer LIMIT 1";

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    "Content-Type": "application/json",
  };
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId;

  const res = await fetch(`${GOOGLE_ADS_API_BASE}/customers/${customerId}/googleAds:search`, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text, customerId }, "Falha ao buscar dados da conta Google Ads");
    throw new Error(`Customer info fetch failed: ${res.status}`);
  }

  const data = (await res.json()) as {
    results?: Array<{
      customer?: { descriptiveName?: string; currencyCode?: string; timeZone?: string };
    }>;
  };
  const customer = data.results?.[0]?.customer;

  return {
    customerId,
    descriptiveName: customer?.descriptiveName ?? null,
    currencyCode: customer?.currencyCode ?? null,
    timeZone: customer?.timeZone ?? null,
  };
}

export async function saveGoogleAdsPendingConnection(
  tenantId: string,
  refreshToken: string,
  accessToken: string,
  expiresIn?: number,
): Promise<string> {
  const now = new Date();
  const expiresAt = expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null;

  const [existing] = await db
    .select()
    .from(googleAdsConnectionsTable)
    .where(eq(googleAdsConnectionsTable.tenantId, tenantId));

  if (existing) {
    await db
      .update(googleAdsConnectionsTable)
      .set({
        refreshToken,
        accessToken,
        tokenExpiresAt: expiresAt,
        customerId: null,
        descriptiveName: null,
        currencyCode: null,
        timeZone: null,
        status: "pending_account_selection",
        disconnectedAt: null,
        updatedAt: now,
      })
      .where(eq(googleAdsConnectionsTable.id, existing.id));

    logger.info({ tenantId }, "Google Ads/Data Manager connection (pending) atualizada");
    return existing.id;
  }

  const [inserted] = await db
    .insert(googleAdsConnectionsTable)
    .values({
      tenantId,
      refreshToken,
      accessToken,
      tokenExpiresAt: expiresAt,
      status: "pending_account_selection",
      connectedAt: now,
      updatedAt: now,
    })
    .returning();

  logger.info({ tenantId, id: inserted.id }, "Google Ads/Data Manager connection (pending) criada");
  return inserted.id;
}

async function assertCustomerNotOwnedByAnotherTenant(customerId: string, tenantId: string): Promise<void> {
  const [owner] = await db
    .select({ tenantId: googleAdsConnectionsTable.tenantId })
    .from(googleAdsConnectionsTable)
    .where(
      and(
        eq(googleAdsConnectionsTable.customerId, customerId),
        ne(googleAdsConnectionsTable.tenantId, tenantId),
        eq(googleAdsConnectionsTable.status, "active"),
        isNull(googleAdsConnectionsTable.disconnectedAt),
      ),
    )
    .limit(1);
  if (owner) {
    throw new Error("Esta conta Google Ads já está conectada a outro tenant");
  }
}

export async function selectGoogleAdsAccount(tenantId: string, customerId: string): Promise<void> {
  const conn = await getGoogleAdsConnectionByTenantId(tenantId);
  if (!conn || !conn.accessToken) {
    throw new Error("Conexão Google Ads pendente não encontrada");
  }

  await assertCustomerNotOwnedByAnotherTenant(customerId, tenantId);
  const info = await fetchCustomerInfo(customerId, conn.accessToken);

  await db
    .update(googleAdsConnectionsTable)
    .set({
      customerId: info.customerId,
      descriptiveName: info.descriptiveName,
      currencyCode: info.currencyCode,
      timeZone: info.timeZone,
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(googleAdsConnectionsTable.id, conn.id));

  logger.info({ tenantId, customerId }, "Conta Google Ads/Data Manager selecionada e conexão ativada");
}

export async function getGoogleAdsConnectionByTenantId(tenantId: string) {
  const [conn] = await db
    .select()
    .from(googleAdsConnectionsTable)
    .where(eq(googleAdsConnectionsTable.tenantId, tenantId));
  return conn ?? null;
}

export async function refreshGoogleAdsToken(connectionId: string): Promise<void> {
  const [conn] = await db
    .select()
    .from(googleAdsConnectionsTable)
    .where(eq(googleAdsConnectionsTable.id, connectionId));

  if (!conn || !conn.refreshToken) {
    throw new Error("Connection not found or missing refresh token");
  }

  const refreshed = await refreshAccessToken(conn.refreshToken);
  const now = new Date();
  const expiresAt = refreshed.expires_in ? new Date(now.getTime() + refreshed.expires_in * 1000) : null;

  await db
    .update(googleAdsConnectionsTable)
    .set({
      accessToken: refreshed.access_token,
      tokenExpiresAt: expiresAt,
      updatedAt: now,
    })
    .where(eq(googleAdsConnectionsTable.id, connectionId));

  logger.info({ connectionId }, "Google Ads/Data Manager access token renovado");
}

export async function disconnectGoogleAds(tenantId: string): Promise<void> {
  const conn = await getGoogleAdsConnectionByTenantId(tenantId);
  if (!conn) {
    logger.warn({ tenantId }, "No Google Ads connection to disconnect");
    return;
  }

  await db
    .update(googleAdsConnectionsTable)
    .set({
      status: "disconnected",
      disconnectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(googleAdsConnectionsTable.id, conn.id));

  logger.info({ tenantId, connectionId: conn.id }, "Google Ads/Data Manager desconectado");
}
