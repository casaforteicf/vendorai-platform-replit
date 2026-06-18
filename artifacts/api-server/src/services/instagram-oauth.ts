import { eq } from "drizzle-orm";
import { db, instagramConnectionsTable, agentConfigsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

const INSTAGRAM_APP_ID = process.env["INSTAGRAM_APP_ID"];
const INSTAGRAM_APP_SECRET = process.env["INSTAGRAM_APP_SECRET"];

function getRedirectUri(): string {
  const configured = process.env["INSTAGRAM_REDIRECT_URI"];
  if (configured) return configured;
  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  if (domain) return `https://${domain}/api/auth/instagram/callback`;
  return "http://localhost:3000/api/auth/instagram/callback";
}

const META_OAUTH_BASE = "https://www.facebook.com/v18.0/dialog/oauth";
const META_TOKEN_BASE = "https://graph.facebook.com/v18.0/oauth/access_token";
const META_LONG_LIVED_BASE = "https://graph.facebook.com/v18.0/oauth/access_token";
const META_ACCOUNTS_BASE = "https://graph.facebook.com/v18.0/me/accounts";
const META_PAGE_BASE = "https://graph.facebook.com/v18.0";

export function buildInstagramOAuthUrl(tenantId: string, state: string): string {
  const redirectUri = getRedirectUri();
  const params = new URLSearchParams({
    client_id: INSTAGRAM_APP_ID ?? "",
    redirect_uri: redirectUri,
    scope: "instagram_basic,instagram_manage_messages,pages_messaging,pages_read_engagement",
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

interface PageAccount {
  access_token: string;
  category: string;
  name: string;
  id: string;
  instagram_business_account?: { id: string };
}

interface AccountsResponse {
  data: PageAccount[];
}

interface InstagramAccountInfo {
  id: string;
  username: string;
  name?: string;
}

export async function exchangeShortCodeForToken(code: string): Promise<LongLivedTokenResponse> {
  const redirectUri = getRedirectUri();
  logger.info({ redirectUri }, "Trocando short code por token");

  const url = new URL(META_TOKEN_BASE);
  url.searchParams.set("client_id", INSTAGRAM_APP_ID ?? "");
  url.searchParams.set("client_secret", INSTAGRAM_APP_SECRET ?? "");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "Falha na troca de code por token");
    throw new Error(`Meta token exchange failed: ${res.status} ${body}`);
  }

  const short = (await res.json()) as TokenExchangeResponse;
  logger.info("Short-lived token recebido");

  return exchangeForLongLivedToken(short.access_token);
}

async function exchangeForLongLivedToken(shortToken: string): Promise<LongLivedTokenResponse> {
  const url = new URL(META_LONG_LIVED_BASE);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", INSTAGRAM_APP_ID ?? "");
  url.searchParams.set("client_secret", INSTAGRAM_APP_SECRET ?? "");
  url.searchParams.set("fb_exchange_token", shortToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "Falha ao converter para long-lived token");
    throw new Error(`Long-lived token exchange failed: ${res.status} ${body}`);
  }

  const data = (await res.json()) as LongLivedTokenResponse;
  logger.info({ expiresIn: data.expires_in }, "Long-lived token obtido");
  return data;
}

export async function fetchUserPages(token: string): Promise<PageAccount[]> {
  const url = new URL(META_ACCOUNTS_BASE);
  url.searchParams.set("access_token", token);
  url.searchParams.set("fields", "name,instagram_business_account{id}");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "Falha ao buscar páginas do usuário");
    throw new Error(`Failed to fetch user pages: ${res.status}`);
  }

  const data = (await res.json()) as AccountsResponse;
  logger.info({ count: data.data.length }, "Páginas do usuário recuperadas");
  return data.data;
}

export async function fetchInstagramAccountInfo(pageId: string, pageToken: string): Promise<InstagramAccountInfo> {
  const url = new URL(`${META_PAGE_BASE}/${pageId}`);
  url.searchParams.set("access_token", pageToken);
  url.searchParams.set("fields", "instagram_business_account{username,id}");

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "Falha ao buscar info da conta Instagram");
    throw new Error(`Failed to fetch Instagram account info: ${res.status}`);
  }

  const data = await res.json() as { instagram_business_account?: { id: string; username: string } };
  const ig = data.instagram_business_account;
  if (!ig) {
    throw new Error("Página não tem conta Instagram Business vinculada");
  }

  logger.info({ username: ig.username }, "Conta Instagram identificada");
  return { id: ig.id, username: ig.username };
}

export async function refreshInstagramToken(connectionId: string): Promise<void> {
  const [conn] = await db
    .select()
    .from(instagramConnectionsTable)
    .where(eq(instagramConnectionsTable.id, connectionId))
    .limit(1);

  if (!conn) {
    throw new Error("Conexão Instagram não encontrada");
  }

  const pageToken = conn.pageAccessToken;
  if (!pageToken) {
    throw new Error("Token de página ausente");
  }

  logger.info({ connectionId }, "Renovando token do Instagram");

  const url = new URL(META_LONG_LIVED_BASE);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", INSTAGRAM_APP_ID ?? "");
  url.searchParams.set("client_secret", INSTAGRAM_APP_SECRET ?? "");
  url.searchParams.set("fb_exchange_token", pageToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "Falha ao renovar token");
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data = (await res.json()) as LongLivedTokenResponse;
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : null;

  await db
    .update(instagramConnectionsTable)
    .set({
      pageAccessToken: data.access_token,
      tokenExpiresAt: expiresAt,
      updatedAt: new Date(),
    })
    .where(eq(instagramConnectionsTable.id, connectionId));

  logger.info({ connectionId, expiresAt }, "Token renovado com sucesso");
}

export async function disconnectInstagram(tenantId: string): Promise<void> {
  logger.info({ tenantId }, "Desconectando Instagram");

  await db
    .update(instagramConnectionsTable)
    .set({ disconnectedAt: new Date(), updatedAt: new Date() })
    .where(eq(instagramConnectionsTable.tenantId, tenantId));

  await db
    .update(agentConfigsTable)
    .set({
      instagramPageAccessToken: null,
      instagramPageId: null,
      instagramUsername: null,
      updatedAt: new Date(),
    })
    .where(eq(agentConfigsTable.tenantId, tenantId));

  logger.info({ tenantId }, "Instagram desconectado");
}

export async function getInstagramConnectionByTenantId(tenantId: string) {
  const [conn] = await db
    .select()
    .from(instagramConnectionsTable)
    .where(eq(instagramConnectionsTable.tenantId, tenantId))
    .limit(1);
  return conn ?? null;
}

export async function saveInstagramConnection(
  tenantId: string,
  page: PageAccount,
  igInfo: InstagramAccountInfo,
  longLivedToken: LongLivedTokenResponse
): Promise<void> {
  const expiresAt = longLivedToken.expires_in
    ? new Date(Date.now() + longLivedToken.expires_in * 1000)
    : null;

  logger.info({ tenantId, username: igInfo.username }, "Salvando conexão Instagram");

  const existing = await getInstagramConnectionByTenantId(tenantId);

  if (existing) {
    await db
      .update(instagramConnectionsTable)
      .set({
        accountId: igInfo.id,
        pageId: page.id,
        username: igInfo.username,
        pageAccessToken: longLivedToken.access_token,
        tokenExpiresAt: expiresAt,
        updatedAt: new Date(),
        disconnectedAt: null,
      })
      .where(eq(instagramConnectionsTable.id, existing.id));
  } else {
    await db.insert(instagramConnectionsTable).values({
      tenantId,
      accountId: igInfo.id,
      pageId: page.id,
      username: igInfo.username,
      pageAccessToken: longLivedToken.access_token,
      tokenExpiresAt: expiresAt,
    });
  }

  await db
    .update(agentConfigsTable)
    .set({
      instagramPageAccessToken: longLivedToken.access_token,
      instagramPageId: page.id,
      instagramUsername: igInfo.username,
      updatedAt: new Date(),
    })
    .where(eq(agentConfigsTable.tenantId, tenantId));

  logger.info({ tenantId, username: igInfo.username }, "Conexão Instagram salva");
}
