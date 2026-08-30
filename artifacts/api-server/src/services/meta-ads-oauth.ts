// OAuth com a API de Marketing da Meta (Facebook Ads) — mesmo desenho de
// lifecycle do google-ads-oauth.ts (pending_account_selection -> active
// -> disconnected), adaptado às diferenças reais do fluxo da Meta:
//
// - Login via facebook.com/dialog/oauth (não accounts.google.com), com
//   escopo ads_management (Marketing API) — diferente do escopo usado
//   pro Instagram/WhatsApp (mensageria), mesmo que seja o mesmo Meta App.
// - Sem refresh_token separado: token de usuário de curta duração vira
//   "long-lived" (~60 dias) numa troca única (fb_exchange_token). Renovar
//   depois disso exige repetir a troca usando o token ainda válido — se
//   expirar de vez, só reconectando (não tem refresh_token permanente
//   como o Google).
// - IMPORTANTE: o escopo ads_management exige Advanced Access aprovado
//   pela Meta via App Review antes de funcionar pra contas de anúncio
//   fora da lista de admins/testers do Meta App — é um bloqueio real de
//   aprovação externa, igual ao Developer Token do Google Ads.
import { and, eq } from "drizzle-orm";
import { db, metaAdsConnectionsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

// Reaproveita o mesmo Meta App já usado pro Instagram/WhatsApp por padrão
// (um único Meta App pode pedir múltiplos escopos), com override dedicado
// se um dia fizer sentido separar em app próprio.
const dedicatedMetaAppId = process.env["META_ADS_APP_ID"]?.trim();
const hasValidDedicatedMetaApp = Boolean(dedicatedMetaAppId && /^\d+$/.test(dedicatedMetaAppId));
const instagramAppId = process.env["INSTAGRAM_APP_ID"]?.trim();

const META_ADS_APP_ID = hasValidDedicatedMetaApp ? dedicatedMetaAppId : instagramAppId;
const META_ADS_APP_SECRET = hasValidDedicatedMetaApp
  ? process.env["META_ADS_APP_SECRET"]?.trim()
  : process.env["INSTAGRAM_APP_SECRET"]?.trim();

function assertMetaAdsAppConfigured(): void {
  if (!META_ADS_APP_ID || !/^\d+$/.test(META_ADS_APP_ID) || !META_ADS_APP_SECRET) {
    throw new Error(
      "Meta Ads não configurado: informe META_ADS_APP_ID/META_ADS_APP_SECRET válidos ou mantenha INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET válidos como fallback.",
    );
  }
}

const META_ADS_CALLBACK_PATH = "/api/auth/meta-ads/callback";
const PRODUCTION_META_ADS_REDIRECT_URI =
  `https://vendorai-platform-replit-production.up.railway.app${META_ADS_CALLBACK_PATH}`;

function isValidMetaAdsRedirectUri(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname === META_ADS_CALLBACK_PATH && !url.search && !url.hash;
  } catch {
    return false;
  }
}

export function getMetaAdsRedirectUri(): string {
  const configured = process.env["META_ADS_REDIRECT_URI"]?.trim();
  if (configured && isValidMetaAdsRedirectUri(configured)) return configured;

  if (configured) {
    logger.warn(
      { configuredRedirectUri: configured, expectedPath: META_ADS_CALLBACK_PATH },
      "META_ADS_REDIRECT_URI inválida; usando callback seguro do backend",
    );
  }

  if (process.env["NODE_ENV"] === "production") return PRODUCTION_META_ADS_REDIRECT_URI;

  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  if (domain) return `https://${domain}${META_ADS_CALLBACK_PATH}`;
  return `http://localhost:3000${META_ADS_CALLBACK_PATH}`;
}

const META_GRAPH_VERSION = "v26.0";
const META_OAUTH_BASE = "https://www.facebook.com/v26.0/dialog/oauth";
const META_TOKEN_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`;
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
// Escopos mínimos para listar e gerenciar contas/campanhas de anúncios.
// Permissões de Instagram e Páginas pertencem aos respectivos fluxos e não
// devem ser misturadas ao OAuth do Meta Ads.
const META_ADS_SCOPE = "ads_management,ads_read,business_management";

export function buildMetaAdsOAuthUrl(state: string, exactRedirectUri?: string): string {
  assertMetaAdsAppConfigured();
  const redirectUri = exactRedirectUri ?? getMetaAdsRedirectUri();
  const params = new URLSearchParams({
    client_id: META_ADS_APP_ID ?? "",
    redirect_uri: redirectUri,
    scope: META_ADS_SCOPE,
    state,
    response_type: "code",
  });
  return `${META_OAUTH_BASE}?${params.toString()}`;
}

interface MetaTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

export async function exchangeCodeForToken(
  code: string,
  exactRedirectUri?: string,
): Promise<MetaTokenResponse> {
  assertMetaAdsAppConfigured();
  const redirectUri = exactRedirectUri ?? getMetaAdsRedirectUri();
  logger.info({ redirectUri }, "Trocando código OAuth do Meta Ads por token");
  const url = new URL(META_TOKEN_BASE);
  url.searchParams.set("client_id", META_ADS_APP_ID ?? "");
  url.searchParams.set("client_secret", META_ADS_APP_SECRET ?? "");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("code", code);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text }, "Falha ao trocar code por token Meta Ads");
    throw new Error(`Token exchange failed: ${res.status}`);
  }
  return res.json() as Promise<MetaTokenResponse>;
}

// Curto -> longa duração (~60 dias). Também usado pra "renovar": passar um
// token de longa duração ainda válido devolve um novo com prazo estendido.
export async function exchangeForLongLivedToken(shortToken: string): Promise<MetaTokenResponse> {
  assertMetaAdsAppConfigured();
  const url = new URL(META_TOKEN_BASE);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", META_ADS_APP_ID ?? "");
  url.searchParams.set("client_secret", META_ADS_APP_SECRET ?? "");
  url.searchParams.set("fb_exchange_token", shortToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text }, "Falha ao converter pra long-lived token Meta Ads");
    throw new Error(`Long-lived token exchange failed: ${res.status}`);
  }
  return res.json() as Promise<MetaTokenResponse>;
}

export interface AccessibleAdAccount {
  adAccountId: string; // "act_1234567890"
  name: string;
  currency: string;
  businessId: string | null;
}

interface AdAccountsApiResponse {
  data: Array<{ id: string; name: string; currency: string; business?: { id: string } }>;
}

export interface AccessibleInstagramIdentity {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramUserId: string;
  instagramUsername: string | null;
}

interface PagesApiResponse {
  data: Array<{
    id: string;
    name: string;
    access_token?: string;
    instagram_business_account?: { id: string; username?: string };
  }>;
}

export function normalizeMetaAdAccountId(adAccountId: string): string {
  const normalized = adAccountId.trim();
  if (!normalized) throw new Error("Ad account ID ausente");
  return normalized.startsWith("act_") ? normalized : `act_${normalized}`;
}

export async function listAccessibleInstagramIdentities(accessToken: string): Promise<AccessibleInstagramIdentity[]> {
  const url = new URL(`${META_GRAPH_BASE}/me/accounts`);
  url.searchParams.set("fields", "id,name,access_token,instagram_business_account{id,username}");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text }, "Falha ao listar Páginas/Instagram acessíveis pela conexão Meta Ads");
    throw new Error(`Failed to list Meta Pages/Instagram identities: ${res.status}`);
  }

  const payload = (await res.json()) as PagesApiResponse;
  return payload.data.flatMap((page) => {
    const ig = page.instagram_business_account;
    if (!ig?.id || !page.access_token) return [];
    return [{
      pageId: page.id,
      pageName: page.name,
      pageAccessToken: page.access_token,
      instagramUserId: ig.id,
      instagramUsername: ig.username ?? null,
    }];
  });
}

export async function listAccessibleAdAccounts(accessToken: string): Promise<AccessibleAdAccount[]> {
  const url = new URL(`${META_GRAPH_BASE}/me/adaccounts`);
  url.searchParams.set("fields", "id,name,currency,business");
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url.toString());
  if (!res.ok) {
    const text = await res.text();
    logger.error({ status: res.status, body: text }, "Falha ao listar Ad Accounts da Meta");
    throw new Error(`Failed to list ad accounts: ${res.status}`);
  }
  const data = (await res.json()) as AdAccountsApiResponse;
  return data.data.map((a) => ({
    adAccountId: a.id, // já vem como "act_..." da API
    name: a.name,
    currency: a.currency,
    businessId: a.business?.id ?? null,
  }));
}

export async function saveMetaAdsPendingConnection(
  tenantId: string,
  token: MetaTokenResponse
): Promise<void> {
  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;
  const existing = await getMetaAdsConnectionByTenantId(tenantId);
  const values = {
    accessToken: token.access_token,
    tokenExpiresAt: expiresAt,
    status: "pending_account_selection",
    updatedAt: new Date(),
    disconnectedAt: null,
  };
  if (existing) {
    await db.update(metaAdsConnectionsTable).set(values).where(eq(metaAdsConnectionsTable.id, existing.id));
  } else {
    await db.insert(metaAdsConnectionsTable).values({ tenantId, ...values });
  }
}

export async function selectMetaAdsAccount(tenantId: string, account: AccessibleAdAccount): Promise<void> {
  const conn = await getMetaAdsConnectionByTenantId(tenantId);
  if (!conn) throw new Error("Conexão Meta Ads pendente não encontrada");

  // Mesmo tipo de checagem de propriedade do Google Ads/Instagram — uma
  // Ad Account não pode ficar vinculada a 2 tenants ao mesmo tempo.
  const [owner] = await db
    .select({ tenantId: metaAdsConnectionsTable.tenantId })
    .from(metaAdsConnectionsTable)
    .where(and(eq(metaAdsConnectionsTable.adAccountId, account.adAccountId)));
  if (owner && owner.tenantId !== tenantId) {
    throw new Error("Esta conta de anúncios já está conectada a outro tenant");
  }

  await db
    .update(metaAdsConnectionsTable)
    .set({
      adAccountId: account.adAccountId,
      adAccountName: account.name,
      currency: account.currency,
      businessId: account.businessId,
      status: "active",
      updatedAt: new Date(),
    })
    .where(eq(metaAdsConnectionsTable.id, conn.id));

  logger.info({ tenantId, adAccountId: account.adAccountId }, "Conta Meta Ads selecionada e conexão ativada");
}

export async function getMetaAdsConnectionByTenantId(tenantId: string) {
  const [conn] = await db.select().from(metaAdsConnectionsTable).where(eq(metaAdsConnectionsTable.tenantId, tenantId));
  return conn ?? null;
}

export async function refreshMetaAdsToken(connectionId: string): Promise<void> {
  const [conn] = await db.select().from(metaAdsConnectionsTable).where(eq(metaAdsConnectionsTable.id, connectionId));
  if (!conn || !conn.accessToken) throw new Error("Connection not found or missing access token");

  const refreshed = await exchangeForLongLivedToken(conn.accessToken);
  const expiresAt = refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null;

  await db
    .update(metaAdsConnectionsTable)
    .set({ accessToken: refreshed.access_token, tokenExpiresAt: expiresAt, updatedAt: new Date() })
    .where(eq(metaAdsConnectionsTable.id, connectionId));

  logger.info({ connectionId }, "Meta Ads access token renovado");
}

export async function disconnectMetaAds(tenantId: string): Promise<void> {
  const conn = await getMetaAdsConnectionByTenantId(tenantId);
  if (!conn) {
    logger.warn({ tenantId }, "No Meta Ads connection to disconnect");
    return;
  }
  await db
    .update(metaAdsConnectionsTable)
    .set({ status: "disconnected", disconnectedAt: new Date(), updatedAt: new Date() })
    .where(eq(metaAdsConnectionsTable.id, conn.id));
  logger.info({ tenantId, connectionId: conn.id }, "Meta Ads desconectado");
}
