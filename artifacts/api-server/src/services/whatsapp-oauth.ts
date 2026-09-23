import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { db, whatsappConnectionsTable, agentConfigsTable, usersTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

const dedicatedWhatsappAppId = process.env["WHATSAPP_APP_ID"]?.trim();
const metaAdsAppId = process.env["META_ADS_APP_ID"]?.trim();
const instagramAppId = process.env["INSTAGRAM_APP_ID"]?.trim();

const WHATSAPP_APP_ID = dedicatedWhatsappAppId || metaAdsAppId || instagramAppId;
const WHATSAPP_APP_SECRET = dedicatedWhatsappAppId
  ? process.env["WHATSAPP_APP_SECRET"]?.trim()
  : metaAdsAppId
    ? process.env["META_ADS_APP_SECRET"]?.trim()
    : process.env["INSTAGRAM_APP_SECRET"]?.trim();
const WHATSAPP_EMBEDDED_CONFIG_ID = process.env["WHATSAPP_EMBEDDED_CONFIG_ID"]?.trim();

function assertWhatsappAppConfigured(): void {
  if (!WHATSAPP_APP_ID || !/^\d+$/.test(WHATSAPP_APP_ID) || !WHATSAPP_APP_SECRET) {
    throw new Error(
      "WhatsApp oficial não configurado: informe WHATSAPP_APP_ID/WHATSAPP_APP_SECRET ou credenciais válidas do mesmo Meta App.",
    );
  }
}

function getRedirectUri(): string {
  const configured = process.env["WHATSAPP_REDIRECT_URI"]?.trim();
  if (configured) return configured;

  // Railway ainda pode carregar REPLIT_DOMAINS legado. Em produção, a URL
  // pública canônica precisa prevalecer para corresponder exatamente ao Meta.
  if (process.env["NODE_ENV"] === "production") {
    return "https://app.appvendorai.com/api/auth/whatsapp/callback";
  }

  const domain = (process.env["REPLIT_DOMAINS"] ?? "").split(",")[0]?.trim();
  if (domain) return `https://${domain}/api/auth/whatsapp/callback`;
  return "http://localhost:3000/api/auth/whatsapp/callback";
}

const META_GRAPH_VERSION = "v26.0";
const META_OAUTH_BASE = `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`;
const META_TOKEN_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`;
const META_LONG_LIVED_BASE = META_TOKEN_BASE;
const META_WABA_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export function buildWhatsappOAuthUrl(tenantId: string, state: string): string {
  assertWhatsappAppConfigured();
  const redirectUri = getRedirectUri();
  const params = new URLSearchParams({
    client_id: WHATSAPP_APP_ID ?? "",
    redirect_uri: redirectUri,
    scope: "whatsapp_business_management,business_management",
    state,
    response_type: "code",
  });
  if (WHATSAPP_EMBEDDED_CONFIG_ID) {
    params.set("config_id", WHATSAPP_EMBEDDED_CONFIG_ID);
    params.set("override_default_response_type", "true");
  }
  return `${META_OAUTH_BASE}?${params.toString()}`;
}

interface TokenExchangeResponse {
  access_token: string;
}

interface LongLivedTokenResponse {
  access_token: string;
  expires_in?: number;
}

export interface WabaAccount {
  id: string;
  name: string;
}

interface MetaBusiness {
  id: string;
  name?: string;
}

export interface PhoneNumber {
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
  const url = new URL(`${META_WABA_BASE}/me/businesses`);
  url.searchParams.set("fields", "id,name");
  url.searchParams.set("access_token", accessToken);
  const res = await fetch(url.toString());
  if (!res.ok) {
    const body = await res.text();
    logger.error({ status: res.status, body }, "Falha ao buscar empresas Meta do usuario");
    throw new Error(`Meta businesses fetch failed: ${res.status}`);
  }
  const data = (await res.json()) as { data?: MetaBusiness[] };
  const businesses = data.data ?? [];
  const wabas = new Map<string, WabaAccount>();

  // /me/businesses devolve portfolios empresariais, nao contas WhatsApp.
  // Para cada portfolio, buscamos as WABAs proprias e as compartilhadas com ele.
  for (const business of businesses) {
    for (const edge of ["owned_whatsapp_business_accounts", "client_whatsapp_business_accounts"] as const) {
      const edgeUrl = new URL(`${META_WABA_BASE}/${business.id}/${edge}`);
      edgeUrl.searchParams.set("fields", "id,name");
      edgeUrl.searchParams.set("access_token", accessToken);
      const edgeRes = await fetch(edgeUrl.toString());
      if (!edgeRes.ok) {
        const body = await edgeRes.text();
        logger.warn(
          { businessId: business.id, edge, status: edgeRes.status, body },
          "Nao foi possivel consultar uma das listas de WABA",
        );
        continue;
      }
      const edgeData = (await edgeRes.json()) as { data?: WabaAccount[] };
      for (const waba of edgeData.data ?? []) wabas.set(waba.id, waba);
    }
  }

  return [...wabas.values()];
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

export async function findWhatsappPhoneNumber(
  wabas: WabaAccount[],
  accessToken: string,
): Promise<{ waba: WabaAccount; phone: PhoneNumber } | null> {
  let successfulLookups = 0;
  for (const waba of wabas) {
    try {
      const phones = await fetchPhoneNumbers(waba.id, accessToken);
      successfulLookups += 1;
      if (phones[0]) return { waba, phone: phones[0] };
    } catch (err) {
      logger.warn({ err, wabaId: waba.id }, "Nao foi possivel consultar os telefones desta WABA");
    }
  }
  if (wabas.length > 0 && successfulLookups === 0) {
    throw new Error("Nao foi possivel consultar os numeros das contas WhatsApp autorizadas");
  }
  return null;
}

export async function findAllWhatsappPhoneNumbers(wabas: WabaAccount[], accessToken: string): Promise<Array<{ waba: WabaAccount; phone: PhoneNumber }>> {
  const selections: Array<{ waba: WabaAccount; phone: PhoneNumber }> = [];
  for (const waba of wabas) {
    try { for (const phone of await fetchPhoneNumbers(waba.id, accessToken)) selections.push({ waba, phone }); }
    catch (err) { logger.warn({ err, wabaId: waba.id }, "Nao foi possivel consultar os telefones desta WABA"); }
  }
  return selections;
}

async function enableCallingForPhoneNumber(phoneNumberId: string, accessToken: string): Promise<void> {
  try {
    const res = await fetch(`${META_WABA_BASE}/${phoneNumberId}/settings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        calling: {
          status: "ENABLED",
          callback_permission_status: "ENABLED",
          call_icon_visibility: "DEFAULT",
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.warn(
        { phoneNumberId, status: res.status, body: body.slice(0, 500) },
        "WhatsApp Calling não pôde ser habilitado automaticamente; conexão de mensagens segue ativa",
      );
      return;
    }

    logger.info({ phoneNumberId }, "WhatsApp Calling habilitado para o número");
  } catch (err) {
    logger.warn(
      { err, phoneNumberId },
      "Erro ao habilitar WhatsApp Calling; conexão de mensagens segue ativa",
    );
  }
}

export async function saveWhatsappConnection(
  tenantId: string,
  wabaId: string,
  phoneNumber: PhoneNumber,
  longLivedToken: string,
  expiresIn?: number,
  assignedUserId?: string | null
): Promise<string> {
  const now = new Date();
  const expiresAt = expiresIn ? new Date(now.getTime() + expiresIn * 1000) : null;

  const [owner] = await db
    .select({ tenantId: whatsappConnectionsTable.tenantId })
    .from(whatsappConnectionsTable)
    .where(and(
      eq(whatsappConnectionsTable.phoneNumberId, phoneNumber.id),
      ne(whatsappConnectionsTable.tenantId, tenantId),
      eq(whatsappConnectionsTable.status, "active"),
      isNull(whatsappConnectionsTable.disconnectedAt),
    ))
    .limit(1);
  if (owner) {
    throw new Error("Este numero do WhatsApp ja esta conectado a outro tenant");
  }

  const [existing] = await db
    .select()
    .from(whatsappConnectionsTable)
    .where(and(eq(whatsappConnectionsTable.tenantId, tenantId), eq(whatsappConnectionsTable.phoneNumberId, phoneNumber.id)));

  let connectionId: string;

  if (existing) {
    await db
      .update(whatsappConnectionsTable)
      .set({
        provider: "meta",
        assignedUserId: assignedUserId ?? existing.assignedUserId,
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
    connectionId = existing.id;
  } else {
    const [inserted] = await db
      .insert(whatsappConnectionsTable)
      .values({
        tenantId,
        provider: "meta",
        assignedUserId: assignedUserId ?? null,
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
    connectionId = inserted.id;
  }

  // Propaga credenciais para agent_configs — onde o pipeline de envio (omnichannel)
  // e o webhook de entrada (meta/whatsapp) buscam as credenciais. Sem isso a conexão
  // OAuth fica "morta": não envia nem recebe mensagens.
  await db
    .update(agentConfigsTable)
    .set({
      metaPhoneNumberId: phoneNumber.id,
      metaAccessToken: longLivedToken,
      metaWabaId: wabaId,
      metaVerifyToken: process.env["WHATSAPP_VERIFY_TOKEN"] ?? null,
      updatedAt: now,
    })
    .where(eq(agentConfigsTable.tenantId, tenantId));

  // Inscreve o app nos webhooks da WABA (best-effort) — passo final para receber mensagens.
  await subscribeWabaToWebhooks(wabaId, longLivedToken);

  // Calling também é best-effort: números inelegíveis continuam conectados
  // normalmente para mensagens e podem ser habilitados depois pela Meta.
  await enableCallingForPhoneNumber(phoneNumber.id, longLivedToken);

  return connectionId;
}

// Inscreve o app instalado nos webhooks da WhatsApp Business Account.
// Best-effort: falha aqui não deve impedir a conexão (pode ser configurado no painel Meta).
async function subscribeWabaToWebhooks(wabaId: string, accessToken: string): Promise<void> {
  try {
    const res = await fetch(`${META_WABA_BASE}/${wabaId}/subscribed_apps`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      const body = await res.text();
      logger.warn({ wabaId, status: res.status, body }, "Falha ao inscrever app nos webhooks da WABA");
      return;
    }
    logger.info({ wabaId }, "App inscrito nos webhooks da WABA");
  } catch (err) {
    logger.warn({ err, wabaId }, "Erro ao inscrever app nos webhooks da WABA");
  }
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

  // Propaga o token renovado para agent_configs — onde o pipeline de envio realmente lê.
  // Sem isso, após o refresh o envio continuaria usando o token antigo (que vai expirar/revogar).
  await db
    .update(agentConfigsTable)
    .set({
      metaAccessToken: refreshed.access_token,
      updatedAt: now,
    })
    .where(eq(agentConfigsTable.tenantId, conn.tenantId));

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

  // Limpa as credenciais propagadas para agent_configs (simetria com saveWhatsappConnection),
  // senão o pipeline de envio continuaria tentando usar um token revogado.
  await db
    .update(agentConfigsTable)
    .set({
      metaPhoneNumberId: null,
      metaAccessToken: null,
      metaWabaId: null,
      metaVerifyToken: null,
      updatedAt: new Date(),
    })
    .where(eq(agentConfigsTable.tenantId, tenantId));

  logger.info({ tenantId, connectionId: conn.id }, "WhatsApp disconnected");
}

export async function listWhatsappConnections(tenantId: string) {
  return db.select().from(whatsappConnectionsTable)
    .where(eq(whatsappConnectionsTable.tenantId, tenantId))
    .orderBy(asc(whatsappConnectionsTable.connectedAt));
}

export async function updateWhatsappConnectionRouting(
  tenantId: string,
  connectionId: string,
  input: { assignedUserId?: string | null; isDefault?: boolean; label?: string | null },
) {
  if (input.assignedUserId) {
    const [user] = await db.select({ id: usersTable.id }).from(usersTable).where(and(eq(usersTable.id, input.assignedUserId), eq(usersTable.tenantId, tenantId))).limit(1);
    if (!user) throw new Error("Assigned user does not belong to this tenant");
  }
  if (input.isDefault) {
    await db.update(whatsappConnectionsTable)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(whatsappConnectionsTable.tenantId, tenantId));
  }
  const [updated] = await db.update(whatsappConnectionsTable)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(whatsappConnectionsTable.id, connectionId), eq(whatsappConnectionsTable.tenantId, tenantId)))
    .returning();
  return updated ?? null;
}