import { and, eq, isNull, ne } from "drizzle-orm";
import { db, instagramConnectionsTable, agentConfigsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

const INSTAGRAM_APP_ID = process.env["INSTAGRAM_APP_ID"]?.trim();
const INSTAGRAM_APP_SECRET = process.env["INSTAGRAM_APP_SECRET"]?.trim();

function assertInstagramAppConfigured(): void {
  if (!INSTAGRAM_APP_ID || !/^\d+$/.test(INSTAGRAM_APP_ID) || !INSTAGRAM_APP_SECRET) {
    throw new Error("Instagram não configurado: verifique INSTAGRAM_APP_ID e INSTAGRAM_APP_SECRET.");
  }
}
const INSTAGRAM_CALLBACK_PATH = "/api/auth/instagram/callback";
const PRODUCTION_HOSTS = new Set(["appvendorai.com", "www.appvendorai.com", "app.appvendorai.com"]);

export function getInstagramRedirectUri(host?: string): string {
  // A URL cadastrada no provedor deve ser a fonte principal. Em ambientes com
  // proxy (Vercel -> Railway), o Host recebido pelo backend pode ser o interno.
  const configured = process.env["INSTAGRAM_REDIRECT_URI"]?.trim();
  if (configured) return configured;

  if (process.env["NODE_ENV"] === "production") {
    return `https://app.appvendorai.com${INSTAGRAM_CALLBACK_PATH}`;
  }

  const normalizedHost = host?.split(":")[0]?.toLowerCase();
  if (normalizedHost && PRODUCTION_HOSTS.has(normalizedHost)) {
    return `https://app.appvendorai.com${INSTAGRAM_CALLBACK_PATH}`;
  }

  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  if (domain) return `https://${domain}${INSTAGRAM_CALLBACK_PATH}`;
  return `http://localhost:${process.env["PORT"] ?? 3000}${INSTAGRAM_CALLBACK_PATH}`;
}

const META_OAUTH_BASE = "https://www.instagram.com/oauth/authorize";
const META_TOKEN_BASE = "https://api.instagram.com/oauth/access_token";
const META_GRAPH_VERSION = "v26.0";
// A troca de token do Instagram usa o endpoint próprio /access_token,
// sem prefixo de versão. A versão v26 continua nas chamadas de dados.
const META_LONG_LIVED_BASE = "https://graph.instagram.com/access_token";
const META_ACCOUNTS_BASE = "https://graph.facebook.com/v18.0/me/accounts";
const META_PAGE_BASE = "https://graph.facebook.com/v18.0";

export function buildInstagramOAuthUrl(
  tenantId: string,
  state: string,
  host?: string,
  exactRedirectUri?: string,
): string {
  assertInstagramAppConfigured();
  const redirectUri = exactRedirectUri ?? getInstagramRedirectUri(host);
  const params = new URLSearchParams({
    client_id: INSTAGRAM_APP_ID ?? "",
    redirect_uri: redirectUri,
    scope: "instagram_business_basic,instagram_business_manage_messages,instagram_business_content_publish,instagram_business_manage_insights",
    state,
    response_type: "code",
    enable_fb_login: "0",
    force_authentication: "1",
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

export async function fetchDirectInstagramAccountInfo(token: string): Promise<InstagramAccountInfo> {
  const url = new URL(`https://graph.instagram.com/${META_GRAPH_VERSION}/me`);
  url.searchParams.set("fields", "id,username,name");
  url.searchParams.set("access_token", token);
  const response = await fetch(url);
  if (!response.ok) {
    const body = await response.text();
    logger.error({ status: response.status, body }, "Falha ao buscar perfil Instagram Business");
    throw new Error(`Failed to fetch Instagram profile: ${response.status}`);
  }
  return response.json() as Promise<InstagramAccountInfo>;
}

export async function saveDirectInstagramConnection(
  tenantId: string,
  account: InstagramAccountInfo,
  token: LongLivedTokenResponse,
): Promise<void> {
  const [owner] = await db.select({ tenantId: instagramConnectionsTable.tenantId })
    .from(instagramConnectionsTable)
    .where(and(
      eq(instagramConnectionsTable.accountId, account.id),
      ne(instagramConnectionsTable.tenantId, tenantId),
      isNull(instagramConnectionsTable.disconnectedAt),
    )).limit(1);
  if (owner) throw new Error("Esta conta do Instagram ja esta conectada a outro tenant");

  const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;
  const existing = await getInstagramConnectionByTenantId(tenantId);
  const values = {
    accountId: account.id,
    pageId: account.id,
    username: account.username,
    pageAccessToken: token.access_token,
    tokenExpiresAt: expiresAt,
    updatedAt: new Date(),
    disconnectedAt: null,
  };
  if (existing) await db.update(instagramConnectionsTable).set(values)
    .where(eq(instagramConnectionsTable.id, existing.id));
  else await db.insert(instagramConnectionsTable).values({ tenantId, ...values });

  await db
    .insert(agentConfigsTable)
    .values({
      tenantId,
      instagramPageAccessToken: token.access_token,
      instagramPageId: account.id,
      instagramUsername: account.username,
    })
    .onConflictDoUpdate({
      target: agentConfigsTable.tenantId,
      set: {
        instagramPageAccessToken: token.access_token,
        instagramPageId: account.id,
        instagramUsername: account.username,
        updatedAt: new Date(),
      },
    });

  await subscribeDirectInstagramWebhooks(account.id, token.access_token);
}

async function subscribeDirectInstagramWebhooks(accountId: string, token: string): Promise<void> {
  try {
    const url = new URL(`https://graph.instagram.com/${accountId}/subscribed_apps`);
    // messages = DMs; comments = comentários em posts/reels (inclui anúncios que usam
    // post orgânico como criativo) -- achado real: só "messages" estava inscrito,
    // comentário nunca chegava na Conversas mesmo com o webhook já pronto pra tratar.
    url.searchParams.set("subscribed_fields", "messages,comments");
    url.searchParams.set("access_token", token);
    const response = await fetch(url, { method: "POST" });
    if (!response.ok) logger.warn({ accountId, status: response.status }, "Falha ao assinar webhook Instagram");
  } catch (err) {
    logger.warn({ err, accountId }, "Erro ao assinar webhook Instagram");
  }
}

export async function exchangeShortCodeForToken(
  code: string,
  host?: string,
  exactRedirectUri?: string,
): Promise<LongLivedTokenResponse> {
  const redirectUri = exactRedirectUri ?? getInstagramRedirectUri(host);
  logger.info({ redirectUri }, "Trocando short code por token");

  const body = new URLSearchParams({
    client_id: INSTAGRAM_APP_ID ?? "",
    client_secret: INSTAGRAM_APP_SECRET ?? "",
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code,
  });
  const res = await fetch(META_TOKEN_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "Falha na troca de code por token");
    throw new Error(`Instagram short token exchange failed: ${res.status} ${body}`);
  }

  const short = (await res.json()) as TokenExchangeResponse;
  logger.info("Short-lived token recebido");

  return exchangeForLongLivedToken(short.access_token);
}

async function exchangeForLongLivedToken(shortToken: string): Promise<LongLivedTokenResponse> {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: INSTAGRAM_APP_SECRET ?? "",
    access_token: shortToken,
  });

  async function requestExchange(method: "GET" | "POST") {
    const url = new URL(META_LONG_LIVED_BASE);
    const init: RequestInit = { method };
    if (method === "GET") {
      for (const [key, value] of params.entries()) url.searchParams.set(key, value);
    } else {
      init.headers = { "Content-Type": "application/x-www-form-urlencoded" };
      init.body = params.toString();
    }

    const response = await fetch(url.toString(), init);
    const body = await response.text();
    return { response, body };
  }

  const primary = await requestExchange("GET");
  if (primary.response.ok) {
    const data = JSON.parse(primary.body) as LongLivedTokenResponse;
    logger.info({ expiresIn: data.expires_in }, "Long-lived token obtido");
    return data;
  }

  const shouldRetryWithPost =
    primary.response.status === 400 &&
    primary.body.includes("Unsupported request - method type: get");

  if (shouldRetryWithPost) {
    logger.warn(
      { status: primary.response.status },
      "Meta rejeitou GET no long-lived token; tentando compatibilidade via POST",
    );
    const fallback = await requestExchange("POST");
    if (fallback.response.ok) {
      const data = JSON.parse(fallback.body) as LongLivedTokenResponse;
      logger.info({ expiresIn: data.expires_in, method: "POST" }, "Long-lived token obtido");
      return data;
    }

    logger.error(
      {
        getStatus: primary.response.status,
        getBody: primary.body,
        postStatus: fallback.response.status,
        postBody: fallback.body,
      },
      "Falha ao converter para long-lived token via GET e POST",
    );
    throw new Error(
      `Instagram long-lived token exchange failed: GET ${primary.response.status} ${primary.body}; POST ${fallback.response.status} ${fallback.body}`,
    );
  }

  logger.error(
    { status: primary.response.status, body: primary.body },
    "Falha ao converter para long-lived token",
  );
  throw new Error(
    `Instagram long-lived token exchange failed: ${primary.response.status} ${primary.body}`,
  );
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

  const url = new URL("https://graph.instagram.com/refresh_access_token");
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", pageToken);

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

  const [owner] = await db
    .select({ tenantId: instagramConnectionsTable.tenantId })
    .from(instagramConnectionsTable)
    .where(and(
      eq(instagramConnectionsTable.pageId, page.id),
      ne(instagramConnectionsTable.tenantId, tenantId),
      isNull(instagramConnectionsTable.disconnectedAt),
    ))
    .limit(1);
  if (owner) {
    throw new Error("Esta pagina do Instagram ja esta conectada a outro tenant");
  }

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

  // Inscreve o app nos webhooks da página (best-effort) — passo final para receber DMs.
  await subscribePageToWebhooks(page.id, longLivedToken.access_token);

  logger.info({ tenantId, username: igInfo.username }, "Conexão Instagram salva");
}

// Inscreve o app nos webhooks da página do Facebook vinculada ao Instagram Business,
// assinando "messages" (DMs) e "comments" (comentário em post/reels/anúncio -- achado
// real: só "messages" estava inscrito, comentário nunca chegava mesmo com o handler
// do webhook já pronto). Best-effort: falha não impede a conexão.
async function subscribePageToWebhooks(pageId: string, pageAccessToken: string): Promise<void> {
  try {
    const url = new URL(`${META_PAGE_BASE}/${pageId}/subscribed_apps`);
    url.searchParams.set("subscribed_fields", "messages,comments");
    const res = await fetch(url.toString(), {
      method: "POST",
      headers: { Authorization: `Bearer ${pageAccessToken}` },
    });
    if (!res.ok) {
      const body = await res.text();
      logger.warn({ pageId, status: res.status, body }, "Falha ao inscrever app nos webhooks da página");
      return;
    }
    logger.info({ pageId }, "App inscrito nos webhooks da página (Instagram DMs + comentários)");
  } catch (err) {
    logger.warn({ err, pageId }, "Erro ao inscrever app nos webhooks da página");
  }
}
