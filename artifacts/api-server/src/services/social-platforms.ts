import { and, eq } from "drizzle-orm";
import { db, socialConnectionsTable, socialPublicationsTable } from "@workspace/db";
import type { OAuthProvider } from "../lib/oauth-state.js";

export type SocialProvider = Extract<OAuthProvider, "youtube" | "linkedin" | "tiktok">;
export type SocialIdentityRole = "brand" | "personal" | "operational";

type ProviderConfig = {
  clientId?: string;
  clientSecret?: string;
  authorizeUrl: string;
  tokenUrl: string;
  scopes: string[];
};

export const SOCIAL_PROVIDER_CONFIG: Record<SocialProvider, ProviderConfig> = {
  youtube: {
    clientId: process.env["YOUTUBE_CLIENT_ID"] || process.env["GOOGLE_ADS_CLIENT_ID"],
    clientSecret: process.env["YOUTUBE_CLIENT_SECRET"] || process.env["GOOGLE_ADS_CLIENT_SECRET"],
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/youtube.force-ssl",
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ],
  },
  linkedin: {
    clientId: process.env["LINKEDIN_CLIENT_ID"],
    clientSecret: process.env["LINKEDIN_CLIENT_SECRET"],
    authorizeUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: (process.env["LINKEDIN_SCOPES"] || "openid profile email w_member_social").split(/\s+/),
  },
  tiktok: {
    clientId: process.env["TIKTOK_CLIENT_KEY"],
    clientSecret: process.env["TIKTOK_CLIENT_SECRET"],
    authorizeUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: (process.env["TIKTOK_SCOPES"] || "user.info.basic,video.list,video.upload,video.publish").split(","),
  },
};

function apiUrl(): string {
  return (process.env["PUBLIC_API_URL"] || process.env["APP_URL"] || "http://localhost:3000").replace(/\/$/, "");
}

function defaultIdentityRole(provider: SocialProvider): SocialIdentityRole {
  // LinkedIn OpenID and TikTok Login identify a person/account used for OAuth by default.
  // A tenant must explicitly mark a connection as a brand before it can be treated as public company identity.
  return provider === "youtube" ? "operational" : "personal";
}

function identityRoleFromMetadata(provider: SocialProvider, metadata?: Record<string, unknown> | null): SocialIdentityRole {
  const value = metadata?.["identityRole"];
  return value === "brand" || value === "personal" || value === "operational"
    ? value
    : defaultIdentityRole(provider);
}

export function socialRedirectUri(provider: SocialProvider): string {
  const override = process.env[`${provider.toUpperCase()}_REDIRECT_URI`];
  return override || `${apiUrl()}/api/auth/${provider}/callback`;
}

export function providerAvailability(provider: SocialProvider) {
  const config = SOCIAL_PROVIDER_CONFIG[provider];
  const configured = Boolean(config.clientId && config.clientSecret);
  return {
    configured,
    capabilities: {
      oauth: configured,
      publish: true,
      metrics: true,
      comments: provider !== "tiktok",
      reply: provider === "youtube" || provider === "linkedin",
      directMessages: false,
      ads: provider === "linkedin" || provider === "tiktok",
    },
    approvalRequired: provider === "linkedin" || provider === "tiktok",
  };
}

export function buildSocialOAuthUrl(provider: SocialProvider, state: string): string {
  const config = SOCIAL_PROVIDER_CONFIG[provider];
  if (!config.clientId || !config.clientSecret) throw new Error(`${provider}_not_configured`);
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: socialRedirectUri(provider),
    response_type: "code",
    state,
  });
  if (provider === "tiktok") {
    params.set("client_key", config.clientId);
    params.delete("client_id");
    params.set("scope", config.scopes.join(","));
  } else {
    params.set("scope", config.scopes.join(" "));
  }
  if (provider === "youtube") {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  }
  return `${config.authorizeUrl}?${params}`;
}

type TokenResult = { access_token: string; refresh_token?: string; expires_in?: number; scope?: string };

export async function exchangeSocialCode(provider: SocialProvider, code: string): Promise<TokenResult> {
  const config = SOCIAL_PROVIDER_CONFIG[provider];
  if (!config.clientId || !config.clientSecret) throw new Error(`${provider}_not_configured`);
  const body = new URLSearchParams({
    code,
    grant_type: "authorization_code",
    redirect_uri: socialRedirectUri(provider),
    client_secret: config.clientSecret,
  });
  body.set(provider === "tiktok" ? "client_key" : "client_id", config.clientId);
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`${provider}_token_exchange_${response.status}`);
  return response.json() as Promise<TokenResult>;
}

async function accountIdentity(provider: SocialProvider, token: string) {
  const request = provider === "youtube"
    ? ["https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true", { Authorization: `Bearer ${token}` }]
    : provider === "linkedin"
      ? ["https://api.linkedin.com/v2/userinfo", { Authorization: `Bearer ${token}` }]
      : ["https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url", { Authorization: `Bearer ${token}` }];
  const response = await fetch(request[0] as string, { headers: request[1] as Record<string, string> });
  if (!response.ok) throw new Error(`${provider}_identity_${response.status}`);
  const data = await response.json() as any;
  if (provider === "youtube") return { id: data.items?.[0]?.id, name: data.items?.[0]?.snippet?.title, metadata: data.items?.[0] || {} };
  if (provider === "linkedin") return { id: data.sub, name: data.name, metadata: data };
  return { id: data.data?.user?.open_id, name: data.data?.user?.display_name, metadata: data.data?.user || {} };
}

export async function saveSocialConnection(tenantId: string, provider: SocialProvider, tokens: TokenResult) {
  const identity = await accountIdentity(provider, tokens.access_token);
  const now = new Date();
  const [existing] = await db.select().from(socialConnectionsTable)
    .where(and(eq(socialConnectionsTable.tenantId, tenantId), eq(socialConnectionsTable.provider, provider))).limit(1);
  const identityRole = identityRoleFromMetadata(provider, existing?.metadata);
  const values = {
    externalAccountId: identity.id || null,
    accountName: identity.name || null,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token || null,
    tokenExpiresAt: tokens.expires_in ? new Date(now.getTime() + tokens.expires_in * 1000) : null,
    scopes: (tokens.scope ? tokens.scope.split(/[ ,]+/) : SOCIAL_PROVIDER_CONFIG[provider].scopes),
    status: "active",
    metadata: { ...identity.metadata, identityRole },
    disconnectedAt: null,
    updatedAt: now,
  };
  if (existing) {
    await db.update(socialConnectionsTable).set(values).where(eq(socialConnectionsTable.id, existing.id));
    return existing.id;
  }
  const [created] = await db.insert(socialConnectionsTable).values({ tenantId, provider, ...values }).returning();
  return created.id;
}

export async function listSocialConnections(tenantId: string) {
  const rows = await db.select().from(socialConnectionsTable).where(eq(socialConnectionsTable.tenantId, tenantId));
  return (["youtube", "linkedin", "tiktok"] as SocialProvider[]).map((provider) => {
    const row = rows.find((item) => item.provider === provider && item.status === "active" && !item.disconnectedAt);
    const expired = Boolean(row?.tokenExpiresAt && row.tokenExpiresAt.getTime() <= Date.now());
    return {
      provider,
      connected: Boolean(row) && !expired,
      attention: Boolean(row) && expired,
      reason: expired ? "token_expired" : null,
      tokenExpiresAt: row?.tokenExpiresAt ?? null,
      accountId: row?.externalAccountId,
      accountName: row?.accountName,
      identityRole: row ? identityRoleFromMetadata(provider, row.metadata) : defaultIdentityRole(provider),
      connectedAt: row?.connectedAt,
      ...providerAvailability(provider),
    };
  });
}

export async function setSocialConnectionIdentityRole(tenantId: string, provider: SocialProvider, identityRole: SocialIdentityRole) {
  const [row] = await db.select().from(socialConnectionsTable).where(and(
    eq(socialConnectionsTable.tenantId, tenantId),
    eq(socialConnectionsTable.provider, provider),
    eq(socialConnectionsTable.status, "active"),
  )).limit(1);
  if (!row || row.disconnectedAt) return null;
  const [updated] = await db.update(socialConnectionsTable).set({
    metadata: { ...(row.metadata || {}), identityRole },
    updatedAt: new Date(),
  }).where(eq(socialConnectionsTable.id, row.id)).returning();
  return updated || null;
}

export async function disconnectSocial(tenantId: string, provider: SocialProvider) {
  await db.update(socialConnectionsTable).set({ status: "disconnected", disconnectedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(socialConnectionsTable.tenantId, tenantId), eq(socialConnectionsTable.provider, provider)));
}

export async function getActiveSocialConnection(tenantId: string, provider: SocialProvider) {
  const [row] = await db.select().from(socialConnectionsTable).where(and(
    eq(socialConnectionsTable.tenantId, tenantId), eq(socialConnectionsTable.provider, provider), eq(socialConnectionsTable.status, "active"),
  )).limit(1);
  return row;
}

export async function createSocialPublication(tenantId: string, provider: SocialProvider, input: { text?: string; mediaUrl?: string; contentType?: string; metadata?: Record<string, unknown> }) {
  const connection = await getActiveSocialConnection(tenantId, provider);
  if (!connection) throw new Error("connection_not_found");
  // Publication is queued deliberately: provider workers can retry without tying
  // long media uploads to a serverless HTTP request.
  const [created] = await db.insert(socialPublicationsTable).values({
    tenantId, provider, connectionId: connection.id, text: input.text, mediaUrl: input.mediaUrl,
    contentType: input.contentType || "post", status: "queued", metadata: input.metadata || {},
  }).returning();
  return created;
}

export async function listSocialComments(tenantId: string, provider: SocialProvider, externalPostId: string) {
  const connection = await getActiveSocialConnection(tenantId, provider);
  if (!connection) throw new Error("connection_not_found");
  if (provider === "tiktok") throw new Error("capability_not_available");
  const url = provider === "youtube"
    ? `https://www.googleapis.com/youtube/v3/commentThreads?part=snippet,replies&videoId=${encodeURIComponent(externalPostId)}&maxResults=100&order=time`
    : `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(externalPostId)}/comments?count=100`;
  const response = await fetch(url, { headers: {
    Authorization: `Bearer ${connection.accessToken}`,
    ...(provider === "linkedin" ? { "LinkedIn-Version": process.env["LINKEDIN_API_VERSION"] || "202607", "X-Restli-Protocol-Version": "2.0.0" } : {}),
  }});
  if (!response.ok) throw new Error(`${provider}_comments_${response.status}`);
  return response.json();
}

export async function replyToSocialComment(tenantId: string, provider: SocialProvider, commentId: string, text: string) {
  const connection = await getActiveSocialConnection(tenantId, provider);
  if (!connection) throw new Error("connection_not_found");
  if (provider === "tiktok") throw new Error("capability_not_available");
  const response = provider === "youtube"
    ? await fetch("https://www.googleapis.com/youtube/v3/comments?part=snippet", {
        method: "POST", headers: { Authorization: `Bearer ${connection.accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ snippet: { parentId: commentId, textOriginal: text } }),
      })
    : await fetch(`https://api.linkedin.com/rest/socialActions/${encodeURIComponent(commentId)}/comments`, {
        method: "POST", headers: { Authorization: `Bearer ${connection.accessToken}`, "Content-Type": "application/json",
          "LinkedIn-Version": process.env["LINKEDIN_API_VERSION"] || "202607", "X-Restli-Protocol-Version": "2.0.0" },
        body: JSON.stringify({ actor: `urn:li:person:${connection.externalAccountId}`, message: { text } }),
      });
  if (!response.ok) throw new Error(`${provider}_reply_${response.status}`);
  return response.status === 204 ? { success: true } : response.json();
}
