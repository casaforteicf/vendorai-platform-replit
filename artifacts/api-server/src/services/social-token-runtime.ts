import { and, eq } from "drizzle-orm";
import { db, socialConnectionsTable } from "@workspace/db";
import type { SocialProvider } from "./social-platforms.js";

const EXPIRY_SKEW_MS = 5 * 60 * 1000;

type SocialConnection = typeof socialConnectionsTable.$inferSelect;

type RefreshResult = {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number;
};

function tokenStillValid(connection: SocialConnection) {
  if (!connection.tokenExpiresAt) return true;
  return connection.tokenExpiresAt.getTime() - Date.now() > EXPIRY_SKEW_MS;
}

async function parseTokenResponse(response: Response, label: string): Promise<any> {
  const raw = await response.text();
  if (!response.ok) throw new Error(`${label}_${response.status}: ${raw.slice(0, 500)}`);
  try { return JSON.parse(raw); } catch { throw new Error(`${label}_invalid_response`); }
}

async function refreshYouTube(refreshToken: string): Promise<RefreshResult> {
  const clientId = process.env["YOUTUBE_CLIENT_ID"] || process.env["GOOGLE_ADS_CLIENT_ID"];
  const clientSecret = process.env["YOUTUBE_CLIENT_SECRET"] || process.env["GOOGLE_ADS_CLIENT_SECRET"];
  if (!clientId || !clientSecret) throw new Error("youtube_refresh_not_configured");
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const data = await parseTokenResponse(await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }), "youtube_refresh");
  if (!data.access_token) throw new Error("youtube_refresh_missing_access_token");
  return { accessToken: data.access_token, refreshToken, expiresIn: Number(data.expires_in || 3600) };
}

async function refreshTikTok(refreshToken: string): Promise<RefreshResult> {
  const clientKey = process.env["TIKTOK_CLIENT_KEY"];
  const clientSecret = process.env["TIKTOK_CLIENT_SECRET"];
  if (!clientKey || !clientSecret) throw new Error("tiktok_refresh_not_configured");
  const body = new URLSearchParams({
    client_key: clientKey,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const data = await parseTokenResponse(await fetch("https://open.tiktokapis.com/v2/oauth/token/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }), "tiktok_refresh");
  if (!data.access_token) throw new Error("tiktok_refresh_missing_access_token");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: Number(data.expires_in || 86400),
  };
}

async function refreshLinkedIn(refreshToken: string): Promise<RefreshResult> {
  const clientId = process.env["LINKEDIN_CLIENT_ID"];
  const clientSecret = process.env["LINKEDIN_CLIENT_SECRET"];
  if (!clientId || !clientSecret) throw new Error("linkedin_refresh_not_configured");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const data = await parseTokenResponse(await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  }), "linkedin_refresh");
  if (!data.access_token) throw new Error("linkedin_refresh_missing_access_token");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresIn: Number(data.expires_in || 5184000),
  };
}

export async function resolveValidSocialConnection(
  tenantId: string,
  provider: SocialProvider,
  connectionId: string,
  forceRefresh = false,
): Promise<SocialConnection> {
  const [connection] = await db.select().from(socialConnectionsTable).where(and(
    eq(socialConnectionsTable.id, connectionId),
    eq(socialConnectionsTable.tenantId, tenantId),
    eq(socialConnectionsTable.provider, provider),
    eq(socialConnectionsTable.status, "active"),
  )).limit(1);
  if (!connection) throw new Error("connection_not_found");
  if (!forceRefresh && tokenStillValid(connection)) return connection;
  if (!connection.refreshToken) throw new Error(`${provider}_reconnect_required`);

  const refreshed = provider === "youtube"
    ? await refreshYouTube(connection.refreshToken)
    : provider === "tiktok"
      ? await refreshTikTok(connection.refreshToken)
      : await refreshLinkedIn(connection.refreshToken);

  const tokenExpiresAt = refreshed.expiresIn
    ? new Date(Date.now() + refreshed.expiresIn * 1000)
    : connection.tokenExpiresAt;
  const [updated] = await db.update(socialConnectionsTable).set({
    accessToken: refreshed.accessToken,
    refreshToken: refreshed.refreshToken || connection.refreshToken,
    tokenExpiresAt,
    updatedAt: new Date(),
  }).where(and(
    eq(socialConnectionsTable.id, connection.id),
    eq(socialConnectionsTable.tenantId, tenantId),
  )).returning();
  if (!updated) throw new Error("connection_refresh_update_failed");
  return updated;
}
