import { and, eq, isNotNull, inArray, isNull, lte, or } from "drizzle-orm";
import {
  agendasTable,
  db,
  googleAdsConnectionsTable,
  searchConsoleConnectionsTable,
  socialConnectionsTable,
} from "@workspace/db";
import type { Logger } from "pino";
import { createOAuth2Client } from "../lib/google-calendar.js";
import { refreshGoogleAdsToken } from "../services/google-ads-oauth.js";
import { refreshSearchConsoleToken } from "../services/search-console-oauth.js";
import { resolveValidSocialConnection } from "../services/social-token-runtime.js";
import type { SocialProvider } from "../services/social-platforms.js";

const REFRESH_AHEAD_MS = 15 * 60 * 1000;

function terminalOAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes("invalid_grant")
    || message.includes("revoked")
    || message.includes("reconnect_required");
}

export async function runTokenGuardian(log: Logger): Promise<void> {
  const cutoff = new Date(Date.now() + REFRESH_AHEAD_MS);
  const summary = { checked: 0, refreshed: 0, reconnectRequired: 0, failed: 0 };

  const calendars = await db.select({
    id: agendasTable.id,
    accessToken: agendasTable.googleAccessToken,
    refreshToken: agendasTable.googleRefreshToken,
    expiresAt: agendasTable.googleTokenExpiresAt,
  }).from(agendasTable).where(and(
    isNotNull(agendasTable.googleRefreshToken),
    or(isNull(agendasTable.googleTokenExpiresAt), lte(agendasTable.googleTokenExpiresAt, cutoff)),
  ));

  for (const agenda of calendars) {
    summary.checked++;
    try {
      const oauth2 = createOAuth2Client();
      oauth2.setCredentials({
        access_token: agenda.accessToken ?? undefined,
        refresh_token: agenda.refreshToken ?? undefined,
        expiry_date: agenda.expiresAt?.getTime(),
      });
      const response = await oauth2.getAccessToken();
      const credentials = oauth2.credentials;
      if (!response.token && !credentials.access_token) throw new Error("calendar_refresh_missing_access_token");
      await db.update(agendasTable).set({
        googleAccessToken: credentials.access_token ?? response.token ?? agenda.accessToken,
        googleTokenExpiresAt: credentials.expiry_date ? new Date(credentials.expiry_date) : agenda.expiresAt,
        updatedAt: new Date(),
      }).where(eq(agendasTable.id, agenda.id));
      summary.refreshed++;
    } catch (error) {
      if (terminalOAuthError(error)) summary.reconnectRequired++; else summary.failed++;
      log.warn({ agendaId: agenda.id, terminal: terminalOAuthError(error) }, "token-guardian/calendar: refresh failed");
    }
  }

  const searchConsole = await db.select({ id: searchConsoleConnectionsTable.id })
    .from(searchConsoleConnectionsTable)
    .where(and(
      inArray(searchConsoleConnectionsTable.status, ["active", "pending_verification"]),
      isNotNull(searchConsoleConnectionsTable.refreshToken),
      or(isNull(searchConsoleConnectionsTable.tokenExpiresAt), lte(searchConsoleConnectionsTable.tokenExpiresAt, cutoff)),
    ));

  for (const connection of searchConsole) {
    summary.checked++;
    try {
      await refreshSearchConsoleToken(connection.id);
      summary.refreshed++;
    } catch (error) {
      if (terminalOAuthError(error)) summary.reconnectRequired++; else summary.failed++;
      log.warn({ connectionId: connection.id, terminal: terminalOAuthError(error) }, "token-guardian/search-console: refresh failed");
    }
  }

  const googleAds = await db.select({ id: googleAdsConnectionsTable.id })
    .from(googleAdsConnectionsTable)
    .where(and(
      inArray(googleAdsConnectionsTable.status, ["active", "pending_account_selection"]),
      isNotNull(googleAdsConnectionsTable.refreshToken),
      or(isNull(googleAdsConnectionsTable.tokenExpiresAt), lte(googleAdsConnectionsTable.tokenExpiresAt, cutoff)),
    ));

  for (const connection of googleAds) {
    summary.checked++;
    try {
      await refreshGoogleAdsToken(connection.id);
      summary.refreshed++;
    } catch (error) {
      if (terminalOAuthError(error)) summary.reconnectRequired++; else summary.failed++;
      log.warn({ connectionId: connection.id, terminal: terminalOAuthError(error) }, "token-guardian/google-ads: refresh failed");
    }
  }

  const social = await db.select({
    id: socialConnectionsTable.id,
    tenantId: socialConnectionsTable.tenantId,
    provider: socialConnectionsTable.provider,
  }).from(socialConnectionsTable).where(and(
    eq(socialConnectionsTable.status, "active"),
    inArray(socialConnectionsTable.provider, ["youtube", "tiktok", "linkedin"]),
    isNotNull(socialConnectionsTable.refreshToken),
    or(isNull(socialConnectionsTable.tokenExpiresAt), lte(socialConnectionsTable.tokenExpiresAt, cutoff)),
  ));

  for (const connection of social) {
    summary.checked++;
    try {
      await resolveValidSocialConnection(
        connection.tenantId,
        connection.provider as SocialProvider,
        connection.id,
      );
      summary.refreshed++;
    } catch (error) {
      if (terminalOAuthError(error)) summary.reconnectRequired++; else summary.failed++;
      log.warn({
        connectionId: connection.id,
        provider: connection.provider,
        terminal: terminalOAuthError(error),
      }, "token-guardian/social: refresh failed");
    }
  }

  log.info(summary, "token-guardian: cycle complete");
}

[executed on device: vmi3624448 (5bc1259f-2bcf-417a-b2e2-7864f48f2673)]