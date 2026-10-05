import { google } from "googleapis";
import { and, eq, isNull } from "drizzle-orm";
import { db, socialConnectionsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";

export type EmailProvider = "google" | "microsoft";

const GOOGLE_PROVIDER = "email_google";
const MICROSOFT_PROVIDER = "email_microsoft";

function frontendOrigin() {
  return (process.env["FRONTEND_APP_URL"] || (process.env["NODE_ENV"] === "production" ? "https://app.appvendorai.com" : "http://localhost:3000")).replace(/\/$/, "");
}

function apiOrigin() {
  if (process.env["EMAIL_OAUTH_API_ORIGIN"]?.trim()) return process.env["EMAIL_OAUTH_API_ORIGIN"]!.replace(/\/$/, "");
  if (process.env["NODE_ENV"] === "production") return "https://app.appvendorai.com";
  const domain = (process.env["REPLIT_DOMAINS"] || "").split(",")[0]?.trim();
  return domain ? `https://${domain}` : `http://localhost:${process.env["PORT"] || 5000}`;
}

function callbackUrl(provider: EmailProvider) {
  return `${apiOrigin()}/api/auth/email/${provider}/callback`;
}

function googleClient() {
  const clientId = process.env["GOOGLE_CLIENT_ID"];
  const clientSecret = process.env["GOOGLE_CLIENT_SECRET"];
  if (!clientId || !clientSecret) throw new Error("google_email_not_configured");
  return new google.auth.OAuth2(clientId, clientSecret, callbackUrl("google"));
}

export function emailProviderAvailability(provider: EmailProvider) {
  if (provider === "google") {
    return { configured: Boolean(process.env["GOOGLE_CLIENT_ID"] && process.env["GOOGLE_CLIENT_SECRET"]) };
  }
  return { configured: Boolean(process.env["MICROSOFT_CLIENT_ID"] && process.env["MICROSOFT_CLIENT_SECRET"]) };
}

export function buildEmailOAuthUrl(provider: EmailProvider, state: string) {
  if (provider === "google") {
    return googleClient().generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      state,
    });
  }
  const clientId = process.env["MICROSOFT_CLIENT_ID"];
  if (!clientId || !process.env["MICROSOFT_CLIENT_SECRET"]) throw new Error("microsoft_email_not_configured");
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: callbackUrl("microsoft"),
    response_mode: "query",
    scope: "offline_access openid profile email User.Read Mail.Read Mail.Send",
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
}

async function upsertConnection(input: {
  tenantId: string;
  provider: EmailProvider;
  email: string;
  accountName?: string | null;
  externalAccountId?: string | null;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scopes?: string[];
}) {
  const providerKey = input.provider === "google" ? GOOGLE_PROVIDER : MICROSOFT_PROVIDER;
  const existing = await db.select().from(socialConnectionsTable).where(and(
    eq(socialConnectionsTable.tenantId, input.tenantId),
    eq(socialConnectionsTable.provider, providerKey),
  )).limit(1).then((r) => r[0] ?? null);
  const values = {
    externalAccountId: input.externalAccountId ?? input.email,
    accountName: input.accountName ?? input.email,
    accessToken: input.accessToken,
    refreshToken: input.refreshToken ?? existing?.refreshToken ?? null,
    tokenExpiresAt: input.expiresAt ?? null,
    scopes: input.scopes ?? [],
    status: "active",
    disconnectedAt: null,
    metadata: { email: input.email, channel: "email", provider: input.provider, identityRole: "operational" },
    updatedAt: new Date(),
  };
  if (existing) {
    return db.update(socialConnectionsTable).set(values).where(eq(socialConnectionsTable.id, existing.id)).returning().then((r) => r[0]);
  }
  return db.insert(socialConnectionsTable).values({
    tenantId: input.tenantId,
    provider: providerKey,
    ...values,
  }).returning().then((r) => r[0]);
}

export async function exchangeEmailCode(provider: EmailProvider, code: string, tenantId: string) {
  if (provider === "google") {
    const oauth = googleClient();
    const { tokens } = await oauth.getToken(code);
    oauth.setCredentials(tokens);
    const oauth2 = google.oauth2({ version: "v2", auth: oauth });
    const me = await oauth2.userinfo.get();
    const email = me.data.email?.trim();
    if (!email || !tokens.access_token) throw new Error("google_email_identity_failed");
    return upsertConnection({
      tenantId,
      provider,
      email,
      accountName: me.data.name,
      externalAccountId: me.data.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scopes: tokens.scope?.split(" ") ?? [],
    });
  }

  const clientId = process.env["MICROSOFT_CLIENT_ID"];
  const clientSecret = process.env["MICROSOFT_CLIENT_SECRET"];
  if (!clientId || !clientSecret) throw new Error("microsoft_email_not_configured");
  const tokenRes = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: callbackUrl("microsoft"),
      scope: "offline_access openid profile email User.Read Mail.Read Mail.Send",
    }),
  });
  const tokens = await tokenRes.json() as Record<string, any>;
  if (!tokenRes.ok || !tokens.access_token) throw new Error("microsoft_email_token_failed");
  const meRes = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName", {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  const me = await meRes.json() as Record<string, any>;
  if (!meRes.ok) throw new Error("microsoft_email_identity_failed");
  const email = String(me.mail || me.userPrincipalName || "").trim();
  if (!email) throw new Error("microsoft_email_identity_failed");
  return upsertConnection({
    tenantId,
    provider,
    email,
    accountName: me.displayName,
    externalAccountId: me.id,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : null,
    scopes: String(tokens.scope || "").split(" ").filter(Boolean),
  });
}

export async function listEmailConnections(tenantId: string) {
  const rows = await db.select().from(socialConnectionsTable).where(and(
    eq(socialConnectionsTable.tenantId, tenantId),
    isNull(socialConnectionsTable.disconnectedAt),
  ));
  return rows.filter((row) => row.provider === GOOGLE_PROVIDER || row.provider === MICROSOFT_PROVIDER).map((row) => ({
    id: row.id,
    provider: row.provider === GOOGLE_PROVIDER ? "google" : "microsoft",
    email: typeof row.metadata?.["email"] === "string" ? row.metadata["email"] : row.accountName,
    accountName: row.accountName,
    status: row.status,
    connectedAt: row.connectedAt,
    updatedAt: row.updatedAt,
  }));
}

export async function disconnectEmail(tenantId: string, provider: EmailProvider) {
  const providerKey = provider === "google" ? GOOGLE_PROVIDER : MICROSOFT_PROVIDER;
  await db.update(socialConnectionsTable).set({ status: "disconnected", disconnectedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(socialConnectionsTable.tenantId, tenantId), eq(socialConnectionsTable.provider, providerKey)));
}

async function getConnection(tenantId: string, preferred?: EmailProvider) {
  const rows = await db.select().from(socialConnectionsTable).where(and(
    eq(socialConnectionsTable.tenantId, tenantId),
    isNull(socialConnectionsTable.disconnectedAt),
  ));
  const filtered = rows.filter((row) => row.status === "active" && (row.provider === GOOGLE_PROVIDER || row.provider === MICROSOFT_PROVIDER));
  if (preferred) {
    const key = preferred === "google" ? GOOGLE_PROVIDER : MICROSOFT_PROVIDER;
    return filtered.find((row) => row.provider === key) ?? null;
  }
  return filtered[0] ?? null;
}

async function refreshedAccessToken(connection: typeof socialConnectionsTable.$inferSelect) {
  const expiresSoon = !connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() < Date.now() + 60_000;
  if (!expiresSoon) return connection.accessToken;
  if (!connection.refreshToken) return connection.accessToken;

  if (connection.provider === GOOGLE_PROVIDER) {
    const oauth = googleClient();
    oauth.setCredentials({ refresh_token: connection.refreshToken });
    const refreshed = await oauth.refreshAccessToken();
    const accessToken = refreshed.credentials.access_token;
    if (!accessToken) throw new Error("google_email_refresh_failed");
    await db.update(socialConnectionsTable).set({
      accessToken,
      tokenExpiresAt: refreshed.credentials.expiry_date ? new Date(refreshed.credentials.expiry_date) : connection.tokenExpiresAt,
      updatedAt: new Date(),
    }).where(eq(socialConnectionsTable.id, connection.id));
    return accessToken;
  }

  const clientId = process.env["MICROSOFT_CLIENT_ID"];
  const clientSecret = process.env["MICROSOFT_CLIENT_SECRET"];
  if (!clientId || !clientSecret) throw new Error("microsoft_email_not_configured");
  const response = await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refreshToken,
      grant_type: "refresh_token",
      scope: "offline_access openid profile email User.Read Mail.Read Mail.Send",
    }),
  });
  const tokens = await response.json() as Record<string, any>;
  if (!response.ok || !tokens.access_token) throw new Error("microsoft_email_refresh_failed");
  await db.update(socialConnectionsTable).set({
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || connection.refreshToken,
    tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + Number(tokens.expires_in) * 1000) : connection.tokenExpiresAt,
    updatedAt: new Date(),
  }).where(eq(socialConnectionsTable.id, connection.id));
  return String(tokens.access_token);
}

function gmailRaw(to: string, subject: string, text: string) {
  const body = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    text,
  ].join("\r\n");
  return Buffer.from(body, "utf8").toString("base64url");
}

export async function sendConnectedEmail(input: {
  tenantId: string;
  to: string;
  subject: string;
  text: string;
  preferredProvider?: EmailProvider;
}): Promise<{ sent: boolean; provider?: EmailProvider; externalId?: string }> {
  const connection = await getConnection(input.tenantId, input.preferredProvider);
  if (!connection) return { sent: false };
  const accessToken = await refreshedAccessToken(connection);

  if (connection.provider === GOOGLE_PROVIDER) {
    const oauth = googleClient();
    oauth.setCredentials({ access_token: accessToken, refresh_token: connection.refreshToken ?? undefined });
    const gmail = google.gmail({ version: "v1", auth: oauth });
    const result = await gmail.users.messages.send({ userId: "me", requestBody: { raw: gmailRaw(input.to, input.subject, input.text) } });
    return { sent: true, provider: "google", externalId: result.data.id ?? undefined };
  }

  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: "Text", content: input.text },
        toRecipients: [{ emailAddress: { address: input.to } }],
      },
      saveToSentItems: true,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    logger.error({ detail, tenantId: input.tenantId }, "email microsoft send failed");
    throw new Error(`microsoft_email_send_failed:${response.status}`);
  }
  return { sent: true, provider: "microsoft" };
}

export function emailIntegrationRedirect() {
  return `${frontendOrigin()}/configuracoes`;
}
