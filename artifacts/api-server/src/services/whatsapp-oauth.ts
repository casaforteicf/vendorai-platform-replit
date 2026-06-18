import { eq } from "drizzle-orm";
import { db, whatsappConnectionsTable, agentConfigsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

const WHATSAPP_APP_ID = process.env["WHATSAPP_APP_ID"] ?? process.env["INSTAGRAM_APP_ID"];
const WHATSAPP_APP_SECRET = process.env["WHATSAPP_APP_SECRET"] ?? process.env["INSTAGRAM_APP_SECRET"];

function getRedirectUri(): string {
  const configured = process.env["WHATSAPP_REDIRECT_URI"];
  if (configured) return configured;
  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  if (domain) return `https://${domain}/api/auth/whatsapp/callback`;
  return "http://localhost:3000/api/auth/whatsapp/callback";
}

const META_OAUTH_BASE = "https://www.facebook.com/v18.0/dialog/oauth";
const META_TOKEN_BASE = "https://graph.facebook.com/v18.0/oauth/access_token";
const META_LONG_LIVED_BASE = "https://graph.facebook.com/v18.0/oauth/access_token";
const META_WABA_BASE = "https://graph.facebook.com/v18.0";

export function buildWhatsappOAuthUrl(tenantId: string, state: string): string {
  const redirectUri = getRedirectUri();
  const params = new URLSearchParams({
    client_id: WHATSAPP_APP_ID ?? "",
    redirect_uri: redirectUri,
    scope: "whatsapp_business_management,business_management",
    state,
    response_type: "code",
  });
  return `${META_OAUTH_BASE}?${params.toString()}`;
}

interface TokenExchangeResponse {
  access_token: string;
}

interface LongLivedTokenResponse {
  access_token: string;
  expires_in?: number;
}

interface WabaAccount {
  id: string;
  name: string;
}

interface PhoneNumber {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating?: string;
}

export async function exchangeShortCodeForToken(code: string): Promise<TokenExchangeResponse> {
  const url = new URL(META_TOKEN_BASE);
  url.searchParams.set("client_id", WHATSAPP_APP_ID ?? "");
  url.searchParams.set("client_secret", WHATSAPP_APP_SECRET ?? "");
  url.searchParams.set("redirect_uri", getRedirectUri());
  url.searchParams.set("code", code);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "Falha ao trocar code por token WhatsApp");
    throw new Error(`Token exchange failed: ${res.status}`);
  }
  return res.json() as Promise<TokenExchangeResponse>;
}

export async function exchangeForLongLivedToken(shortToken: string): Promise<LongLivedTokenResponse> {
  const url = new URL(META_LONG_LIVED_BASE);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", WHATSAPP_APP_ID ?? "");
  url.searchParams.set("client_secret", WHATSAPP_APP_SECRET ?? "");
  url.searchParams.set("fb_exchange_token", shortToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "Falha ao converter para long-lived token WhatsApp");
    throw new Error(`Long-lived token exchange failed: ${res.status}`);
  }
  return res.json() as Promise<LongLivedTokenResponse>;
}

export async function fetchWabaAccounts(accessToken: string): Promise<WabaAccount[]> {
  const url = `${META_WABA_BASE}/me/businesses?access_token=${accessToken}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "Falha ao buscar WABA accounts");
    throw new Error(`WABA fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as { data: WabaAccount[] };
  return data.data ?? [];
}

export async function fetchPhoneNumbers(wabaId: string, accessToken: string): Promise<PhoneNumber[]> {
  const url = `${META_WABA_BASE}/${wabaId}/phone_numbers?access_token=${accessToken}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "Falha ao buscar phone numbers");
    throw new Error(`Phone numbers fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as { data: PhoneNumber[] };
  return data.data ?? [];
}

export async function saveWhatsappConnection(
  tenantId: string,
  wabaId: string,
  phoneNumber: PhoneNumber,
  longLivedToken: string,
  expiresIn?: number
): Promise<string> {
  const now = new Date();
  const expiresAt = expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null;

  const [existing] = await db
    .select()
    .from(whatsappConnectionsTable)
    .where(eq(whatsappConnectionsTable.tenantId, tenantId));

  if (existing) {
    await db
      .update(whatsappConnectionsTable)
      .set({
        wabaId,
        phoneNumberId: phoneNumber.id,
        businessName: phoneNumber.verified_name,
        displayPhoneNumber: phoneNumber.display_phone_number,
        accessToken: longLivedToken,
        tokenExpiresAt: expiresAt,
        status: "active",
        disconnectedAt: null,
        updatedAt: now,
      })
      .where(eq(whatsappConnectionsTable.id, existing.id));

    logger.info({ tenantId, wabaId }, "WhatsApp connection updated");
    return existing.id;
  }

  const [inserted] = await db
    .insert(whatsappConnectionsTable)
    .values({
      tenantId,
      wabaId,
      phoneNumberId: phoneNumber.id,
      businessName: phoneNumber.verified_name,
      displayPhoneNumber: phoneNumber.display_phone_number,
      accessToken: longLivedToken,
      tokenExpiresAt: expiresAt,
      status: "active",
      connectedAt: now,
      updatedAt: now,
    })
    .returning();

  logger.info({ tenantId, wabaId, id: inserted.id }, "WhatsApp connection created");
  return inserted.id;
}

export async function getWhatsappConnectionByTenantId(tenantId: string) {
  const [conn] = await db
    .select()
    .from(whatsappConnectionsTable)
    .where(eq(whatsappConnectionsTable.tenantId, tenantId));
  return conn ?? null;
}

export async function refreshWhatsappToken(connectionId: string): Promise<void> {
  const [conn] = await db
    .select()
    .from(whatsappConnectionsTable)
    .where(eq(whatsappConnectionsTable.id, connectionId));

  if (!conn || !conn.accessToken) {
    throw new Error("Connection not found or missing token");
  }

  const refreshed = await exchangeForLongLivedToken(conn.accessToken);
  const now = new Date();
  const expiresAt = refreshed.expires_in ? new Date(now.getTime() + refreshed.expires_in * 1000) : null;

  await db
    .update(whatsappConnectionsTable)
    .set({
      accessToken: refreshed.access_token,
      tokenExpiresAt: expiresAt,
      updatedAt: now,
    })
    .where(eq(whatsappConnectionsTable.id, connectionId));

  logger.info({ connectionId }, "WhatsApp token refreshed");
}

export async function disconnectWhatsapp(tenantId: string): Promise<void> {
  const conn = await getWhatsappConnectionByTenantId(tenantId);
  if (!conn) {
    logger.warn({ tenantId }, "No WhatsApp connection to disconnect");
    return;
  }

  await db
    .update(whatsappConnectionsTable)
    .set({
      status: "disconnected",
      disconnectedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(whatsappConnectionsTable.id, conn.id));

  logger.info({ tenantId, connectionId: conn.id }, "WhatsApp disconnected");
}
