import { google } from "googleapis";
import { and, eq, isNull } from "drizzle-orm";
import { db, socialConnectionsTable, leadsTable, conversationsTable, messagesTable, notificationsTable } from "@workspace/db";
import { logger } from "../lib/logger.js";
import { fetchWebmailMessages, getWebmailConnection, sendWebmailEmail, webmailConfigFromConnection } from "./webmail-email.js";
import { tryIngestColdProspectEmailReply } from "./prospect-conversation-intelligence.js";

export type EmailProvider = "google" | "microsoft" | "webmail";

const GOOGLE_PROVIDER = "email_google";
const MICROSOFT_PROVIDER = "email_microsoft";
const WEBMAIL_PROVIDER = "email_webmail";

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
  const providerKey = input.provider === "google" ? GOOGLE_PROVIDER : input.provider === "microsoft" ? MICROSOFT_PROVIDER : WEBMAIL_PROVIDER;
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
  return rows.filter((row) => row.provider === GOOGLE_PROVIDER || row.provider === MICROSOFT_PROVIDER || row.provider === WEBMAIL_PROVIDER).map((row) => ({
    id: row.id,
    provider: row.provider === GOOGLE_PROVIDER ? "google" : row.provider === MICROSOFT_PROVIDER ? "microsoft" : "webmail",
    email: typeof row.metadata?.["email"] === "string" ? row.metadata["email"] : row.accountName,
    accountName: row.accountName,
    signature: typeof row.metadata?.["signature"] === "string" ? row.metadata["signature"] : "",
    ...(row.provider === WEBMAIL_PROVIDER ? {
      username: typeof row.metadata?.["username"] === "string" ? row.metadata["username"] : "",
      imapHost: typeof row.metadata?.["imapHost"] === "string" ? row.metadata["imapHost"] : "",
      imapPort: Number(row.metadata?.["imapPort"] ?? 993),
      imapSecure: row.metadata?.["imapSecure"] !== false,
      smtpHost: typeof row.metadata?.["smtpHost"] === "string" ? row.metadata["smtpHost"] : "",
      smtpPort: Number(row.metadata?.["smtpPort"] ?? 465),
      smtpSecure: row.metadata?.["smtpSecure"] !== false,
      smtpStartTls: row.metadata?.["smtpStartTls"] === true,
    } : {}),
    status: row.status,
    connectedAt: row.connectedAt,
    updatedAt: row.updatedAt,
  }));
}

export async function updateEmailSettings(
  tenantId: string,
  provider: EmailProvider,
  settings: { signature?: string },
) {
  const providerKey = provider === "google" ? GOOGLE_PROVIDER : provider === "microsoft" ? MICROSOFT_PROVIDER : WEBMAIL_PROVIDER;
  const [connection] = await db.select().from(socialConnectionsTable).where(and(
    eq(socialConnectionsTable.tenantId, tenantId),
    eq(socialConnectionsTable.provider, providerKey),
    isNull(socialConnectionsTable.disconnectedAt),
  )).limit(1);
  if (!connection) return null;
  const metadata = {
    ...(connection.metadata ?? {}),
    ...(settings.signature !== undefined ? { signature: settings.signature.trim() } : {}),
  };
  return db.update(socialConnectionsTable).set({ metadata, updatedAt: new Date() })
    .where(eq(socialConnectionsTable.id, connection.id))
    .returning()
    .then((rows) => rows[0] ?? null);
}

export async function disconnectEmail(tenantId: string, provider: EmailProvider) {
  const providerKey = provider === "google" ? GOOGLE_PROVIDER : provider === "microsoft" ? MICROSOFT_PROVIDER : WEBMAIL_PROVIDER;
  await db.update(socialConnectionsTable).set({ status: "disconnected", disconnectedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(socialConnectionsTable.tenantId, tenantId), eq(socialConnectionsTable.provider, providerKey)));
}

async function getConnection(tenantId: string, preferred?: EmailProvider) {
  const rows = await db.select().from(socialConnectionsTable).where(and(
    eq(socialConnectionsTable.tenantId, tenantId),
    isNull(socialConnectionsTable.disconnectedAt),
  ));
  const filtered = rows.filter((row) => row.status === "active" && (row.provider === GOOGLE_PROVIDER || row.provider === MICROSOFT_PROVIDER || row.provider === WEBMAIL_PROVIDER));
  if (preferred) {
    const key = preferred === "google" ? GOOGLE_PROVIDER : preferred === "microsoft" ? MICROSOFT_PROVIDER : WEBMAIL_PROVIDER;
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

function gmailRaw(input: {
  to: string;
  subject: string;
  text: string;
  cc?: string[];
  bcc?: string[];
  attachment?: { filename: string; mimeType: string; content: Buffer };
}) {
  const subject = `=?UTF-8?B?${Buffer.from(input.subject, "utf8").toString("base64")}?=`;
  const headers = [
    `To: ${input.to}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    ...(input.bcc?.length ? [`Bcc: ${input.bcc.join(", ")}`] : []),
    `Subject: ${subject}`,
    "MIME-Version: 1.0",
  ];
  if (!input.attachment) {
    const body = [...headers, "Content-Type: text/plain; charset=UTF-8", "", input.text].join("\r\n");
    return Buffer.from(body, "utf8").toString("base64url");
  }

  const boundary = `vendorai_${crypto.randomUUID().replace(/-/g, "")}`;
  const base64 = input.attachment.content.toString("base64").replace(/(.{76})/g, "$1\r\n");
  const body = [
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.text,
    `--${boundary}`,
    `Content-Type: ${input.attachment.mimeType}; name="${input.attachment.filename.replace(/"/g, "")}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${input.attachment.filename.replace(/"/g, "")}"`,
    "",
    base64,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  return Buffer.from(body, "utf8").toString("base64url");
}

export async function sendConnectedEmail(input: {
  tenantId: string;
  to: string;
  subject: string;
  text: string;
  cc?: string[];
  bcc?: string[];
  attachment?: { filename: string; mimeType: string; content: Buffer };
  preferredProvider?: EmailProvider;
}): Promise<{ sent: boolean; provider?: EmailProvider; externalId?: string }> {
  const connection = await getConnection(input.tenantId, input.preferredProvider);
  if (!connection) return { sent: false };
  if (connection.provider === WEBMAIL_PROVIDER) {
    const config = webmailConfigFromConnection(connection);
    const result = await sendWebmailEmail(config, {
      to: input.to,
      subject: input.subject,
      text: input.text,
      cc: input.cc,
      bcc: input.bcc,
      attachment: input.attachment,
    });
    return { sent: true, provider: "webmail", externalId: result.externalId };
  }

  const accessToken = await refreshedAccessToken(connection);
  const signature = typeof connection.metadata?.["signature"] === "string" ? connection.metadata["signature"].trim() : "";
  const text = signature ? `${input.text}\n\n${signature}` : input.text;

  if (connection.provider === GOOGLE_PROVIDER) {
    const oauth = googleClient();
    oauth.setCredentials({ access_token: accessToken, refresh_token: connection.refreshToken ?? undefined });
    const gmail = google.gmail({ version: "v1", auth: oauth });
    const result = await gmail.users.messages.send({
      userId: "me",
      requestBody: {
        raw: gmailRaw({
          to: input.to,
          subject: input.subject,
          text,
          cc: input.cc,
          bcc: input.bcc,
          attachment: input.attachment,
        }),
      },
    });
    return { sent: true, provider: "google", externalId: result.data.id ?? undefined };
  }

  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        subject: input.subject,
        body: { contentType: "Text", content: text },
        toRecipients: [{ emailAddress: { address: input.to } }],
        ccRecipients: (input.cc ?? []).map((address) => ({ emailAddress: { address } })),
        bccRecipients: (input.bcc ?? []).map((address) => ({ emailAddress: { address } })),
        attachments: input.attachment ? [{
          "@odata.type": "#microsoft.graph.fileAttachment",
          name: input.attachment.filename,
          contentType: input.attachment.mimeType,
          contentBytes: input.attachment.content.toString("base64"),
        }] : undefined,
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


function headerValue(headers: Array<{ name?: string | null; value?: string | null }> | undefined, name: string) {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function extractAddress(raw: string) {
  const match = raw.match(/<([^>]+)>/);
  return (match?.[1] || raw).trim().toLowerCase();
}

function decodeGmailBody(payload: any): string {
  const direct = payload?.body?.data;
  if (direct) return Buffer.from(String(direct), "base64url").toString("utf8");
  for (const part of payload?.parts ?? []) {
    if (part?.mimeType === "text/plain" && part?.body?.data) {
      return Buffer.from(String(part.body.data), "base64url").toString("utf8");
    }
  }
  for (const part of payload?.parts ?? []) {
    const nested = decodeGmailBody(part);
    if (nested) return nested;
  }
  return "";
}

async function persistInboundEmail(input: {
  tenantId: string;
  externalId: string;
  from: string;
  subject: string;
  text: string;
  receivedAt?: Date;
  threadId?: string | null;
  log: typeof logger;
}) {
  const [existingMessage] = await db.select({ id: messagesTable.id }).from(messagesTable).where(and(
    eq(messagesTable.tenantId, input.tenantId),
    eq(messagesTable.externalId, input.externalId),
  )).limit(1);
  if (existingMessage) return { status: "duplicate" as const };

  const [lead] = await db.select().from(leadsTable).where(and(
    eq(leadsTable.tenantId, input.tenantId),
    eq(leadsTable.email, input.from),
  )).limit(1);
  if (!lead) {
    const coldProspect = await tryIngestColdProspectEmailReply({
      tenantId: input.tenantId,
      email: input.from,
      subject: input.subject,
      text: input.text,
      externalId: input.externalId,
    });
    if (coldProspect.handled) {
      return {
        status: "prospect" as const,
        prospectId: coldProspect.prospectId,
        email: input.from,
        externalId: input.externalId,
        subject: input.subject,
      };
    }

    const notificationTitle = `[email:${input.externalId}] ${input.subject || "E-mail sem assunto"}`;
    const [existingNotification] = await db.select({ id: notificationsTable.id }).from(notificationsTable).where(and(
      eq(notificationsTable.tenantId, input.tenantId),
      eq(notificationsTable.category, "email_unmatched"),
      eq(notificationsTable.title, notificationTitle),
    )).limit(1);
    if (!existingNotification) {
      await db.insert(notificationsTable).values({
        tenantId: input.tenantId,
        title: notificationTitle,
        message: `De: ${input.from}\n\n${input.text || "(e-mail sem corpo de texto)"}`,
        type: "info",
        category: "email_unmatched",
      });
    }
    return { status: "unmatched" as const, email: input.from, externalId: input.externalId, subject: input.subject };
  }

  let [conversation] = await db.select().from(conversationsTable).where(and(
    eq(conversationsTable.tenantId, input.tenantId),
    eq(conversationsTable.leadId, lead.id),
    eq(conversationsTable.channel, "email"),
  )).limit(1);

  if (!conversation) {
    [conversation] = await db.insert(conversationsTable).values({
      tenantId: input.tenantId,
      leadId: lead.id,
      channel: "email",
      status: "open",
      naoLidas: 1,
      lastInboundAt: input.receivedAt ?? new Date(),
      ultimaMensagemEm: input.receivedAt ?? new Date(),
      metadata: { lastEmailSubject: input.subject, externalThreadId: input.threadId ?? null },
    }).returning();
  } else {
    await db.update(conversationsTable).set({
      naoLidas: (conversation.naoLidas ?? 0) + 1,
      lastInboundAt: input.receivedAt ?? new Date(),
      ultimaMensagemEm: input.receivedAt ?? new Date(),
      updatedAt: new Date(),
      metadata: { ...(conversation.metadata ?? {}), lastEmailSubject: input.subject, externalThreadId: input.threadId ?? conversation.metadata?.["externalThreadId"] ?? null },
    }).where(eq(conversationsTable.id, conversation.id));
  }

  const content = input.subject ? `Assunto: ${input.subject}\n\n${input.text}` : input.text;
  const [message] = await db.insert(messagesTable).values({
    tenantId: input.tenantId,
    conversationId: conversation.id,
    leadId: lead.id,
    direcao: "entrada",
    canal: "email",
    conteudo: content || "(e-mail sem corpo de texto)",
    enviadoPor: "lead",
    status: "entregue",
    externalId: input.externalId,
    createdAt: input.receivedAt ?? new Date(),
  }).returning();

  return {
    status: "imported" as const,
    leadId: lead.id,
    messageId: message.id,
    mensagem: content || "(e-mail sem corpo de texto)",
    subject: input.subject,
    externalId: input.externalId,
  };
}

export async function syncConnectedEmailInbox(tenantId: string, preferredProvider?: EmailProvider) {
  const connection = await getConnection(tenantId, preferredProvider);
  if (!connection) throw new Error("email_connection_not_found");
  const results: Array<Record<string, unknown>> = [];

  if (connection.provider === WEBMAIL_PROVIDER) {
    const config = webmailConfigFromConnection(connection);
    const messages = await fetchWebmailMessages(config, 50);
    for (const item of messages) {
      if (!item.from) continue;
      results.push(await persistInboundEmail({
        tenantId,
        externalId: `webmail:${connection.id}:${item.messageId || item.uid}`,
        from: item.from,
        subject: item.subject,
        text: item.text,
        receivedAt: item.receivedAt,
        threadId: item.threadId,
        log: logger,
      }));
    }
  } else if (connection.provider === GOOGLE_PROVIDER) {
    const accessToken = await refreshedAccessToken(connection);
    const oauth = googleClient();
    oauth.setCredentials({ access_token: accessToken, refresh_token: connection.refreshToken ?? undefined });
    const gmail = google.gmail({ version: "v1", auth: oauth });
    const list = await gmail.users.messages.list({ userId: "me", maxResults: 50, q: "newer_than:7d" });
    for (const item of list.data.messages ?? []) {
      if (!item.id) continue;
      const full = await gmail.users.messages.get({ userId: "me", id: item.id, format: "full" });
      const headers = full.data.payload?.headers;
      const from = extractAddress(headerValue(headers, "From"));
      const subject = headerValue(headers, "Subject");
      if (!from) continue;
      const receivedAt = full.data.internalDate ? new Date(Number(full.data.internalDate)) : new Date();
      results.push(await persistInboundEmail({
        tenantId,
        externalId: `gmail:${item.id}`,
        from,
        subject,
        text: decodeGmailBody(full.data.payload),
        receivedAt,
        threadId: full.data.threadId ?? null,
        log: logger,
      }));
    }
  } else {
    const accessToken = await refreshedAccessToken(connection);
    const response = await fetch("https://graph.microsoft.com/v1.0/me/messages?$top=50&$orderby=receivedDateTime%20desc&$select=id,conversationId,subject,body,from,receivedDateTime", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await response.json() as { value?: Array<any> };
    if (!response.ok) throw new Error(`microsoft_email_sync_failed:${response.status}`);
    for (const item of data.value ?? []) {
      const from = String(item?.from?.emailAddress?.address || "").trim().toLowerCase();
      if (!from || !item?.id) continue;
      const text = String(item?.body?.content || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      results.push(await persistInboundEmail({
        tenantId,
        externalId: `microsoft:${item.id}`,
        from,
        subject: String(item.subject || ""),
        text,
        receivedAt: item.receivedDateTime ? new Date(item.receivedDateTime) : new Date(),
        threadId: item.conversationId ? String(item.conversationId) : null,
        log: logger,
      }));
    }
  }

  return {
    provider: connection.provider === GOOGLE_PROVIDER ? "google" : connection.provider === MICROSOFT_PROVIDER ? "microsoft" : "webmail",
    imported: results.filter((item) => item.status === "imported").length,
    duplicates: results.filter((item) => item.status === "duplicate").length,
    prospects: results.filter((item) => item.status === "prospect").length,
    unmatched: results.filter((item) => item.status === "unmatched").length,
    results,
  };
}
