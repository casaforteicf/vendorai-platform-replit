import { and, eq } from "drizzle-orm";
import { db, socialConnectionsTable } from "@workspace/db";
import { decrypt, encrypt } from "../lib/crypto.js";
import { getSketchfabMe, refreshSketchfabAccessToken, type SketchfabOAuthTokens } from "../lib/arqdor/sketchfab.js";

const PROVIDER = "sketchfab";

function decryptMaybe(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return decrypt(value); } catch { return value; }
}

export async function getSketchfabConnection(tenantId: string) {
  const [row] = await db.select().from(socialConnectionsTable)
    .where(and(eq(socialConnectionsTable.tenantId, tenantId), eq(socialConnectionsTable.provider, PROVIDER)))
    .limit(1);
  return row ?? null;
}

export async function saveSketchfabConnection(tenantId: string, tokens: SketchfabOAuthTokens) {
  if (!tokens.access_token) throw new Error("sketchfab_missing_access_token");
  const profile = await getSketchfabMe(tokens.access_token);
  const now = new Date();
  const expiresAt = tokens.expires_in ? new Date(now.getTime() + Number(tokens.expires_in) * 1000) : null;
  const existing = await getSketchfabConnection(tenantId);
  const values = {
    externalAccountId: profile.uid ?? null,
    accountName: profile.displayName ?? profile.username ?? "Sketchfab",
    accessToken: encrypt(tokens.access_token),
    refreshToken: tokens.refresh_token ? encrypt(tokens.refresh_token) : existing?.refreshToken ?? null,
    tokenExpiresAt: expiresAt,
    scopes: tokens.scope ? tokens.scope.split(/\s+/).filter(Boolean) : [],
    status: "active",
    metadata: { tokenEncrypted: true, username: profile.username ?? null },
    connectedAt: existing?.connectedAt ?? now,
    updatedAt: now,
    disconnectedAt: null,
  };

  if (existing) {
    const [updated] = await db.update(socialConnectionsTable)
      .set(values)
      .where(eq(socialConnectionsTable.id, existing.id))
      .returning();
    return updated;
  }

  const [created] = await db.insert(socialConnectionsTable)
    .values({ tenantId, provider: PROVIDER, ...values })
    .returning();
  return created;
}

export async function getValidSketchfabAccessToken(tenantId: string): Promise<string> {
  const connection = await getSketchfabConnection(tenantId);
  if (!connection || connection.disconnectedAt || connection.status !== "active") {
    throw new Error("sketchfab_not_connected");
  }

  const accessToken = decryptMaybe(connection.accessToken);
  if (!accessToken) throw new Error("sketchfab_not_connected");

  const refreshSkewMs = 5 * 60 * 1000;
  if (!connection.tokenExpiresAt || connection.tokenExpiresAt.getTime() > Date.now() + refreshSkewMs) {
    return accessToken;
  }

  const refreshToken = decryptMaybe(connection.refreshToken);
  if (!refreshToken) throw new Error("sketchfab_reconnect_required");
  const refreshed = await refreshSketchfabAccessToken(refreshToken);
  const saved = await saveSketchfabConnection(tenantId, {
    ...refreshed,
    refresh_token: refreshed.refresh_token || refreshToken,
  });
  const next = decryptMaybe(saved?.accessToken);
  if (!next) throw new Error("sketchfab_refresh_failed");
  return next;
}

export async function disconnectSketchfab(tenantId: string) {
  const row = await getSketchfabConnection(tenantId);
  if (!row) return;
  await db.update(socialConnectionsTable).set({
    status: "disconnected",
    disconnectedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(socialConnectionsTable.id, row.id));
}
