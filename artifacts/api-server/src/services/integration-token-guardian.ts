import type { Logger } from "pino";
import { and, eq, isNull, lte } from "drizzle-orm";
import {
  db,
  googleAdsConnectionsTable,
  searchConsoleConnectionsTable,
  instagramConnectionsTable,
  metaAdsConnectionsTable,
  socialConnectionsTable,
} from "@workspace/db";
import { refreshGoogleAdsToken } from "./google-ads-oauth.js";
import { refreshSearchConsoleToken } from "./search-console-oauth.js";
import { refreshInstagramToken } from "./instagram-oauth.js";
import { refreshMetaAdsToken } from "./meta-ads-oauth.js";
import { resolveValidSocialConnection } from "./social-token-runtime.js";
import type { SocialProvider } from "./social-platforms.js";

const CHECK_INTERVAL_MS = Number(process.env["INTEGRATION_TOKEN_GUARD_INTERVAL_MS"] ?? 30 * 60 * 1000);
const REFRESH_AHEAD_MS = Number(process.env["INTEGRATION_TOKEN_GUARD_REFRESH_AHEAD_MS"] ?? 72 * 60 * 60 * 1000);

let timer: NodeJS.Timeout | null = null;
let running = false;

type RefreshResult = {
  provider: string;
  connectionId: string;
  tenantId: string;
  ok: boolean;
  error?: string;
};

async function safeRefresh(input: {
  provider: string;
  connectionId: string;
  tenantId: string;
  run: () => Promise<void>;
  log: Logger;
}): Promise<RefreshResult> {
  try {
    await input.run();
    input.log.info(
      { provider: input.provider, connectionId: input.connectionId, tenantId: input.tenantId },
      "integration-token-guardian: token renovado",
    );
    return { provider: input.provider, connectionId: input.connectionId, tenantId: input.tenantId, ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    input.log.warn(
      { error, provider: input.provider, connectionId: input.connectionId, tenantId: input.tenantId },
      "integration-token-guardian: falha ao renovar token",
    );
    return { provider: input.provider, connectionId: input.connectionId, tenantId: input.tenantId, ok: false, error: message };
  }
}

export async function runIntegrationTokenGuardian(log: Logger): Promise<RefreshResult[]> {
  if (running) {
    log.warn("integration-token-guardian: execução ignorada porque o ciclo anterior ainda está ativo");
    return [];
  }
  running = true;

  try {
    const refreshBefore = new Date(Date.now() + REFRESH_AHEAD_MS);

    const [googleAds, searchConsole, instagram, metaAds, social] = await Promise.all([
      db.select({
        id: googleAdsConnectionsTable.id,
        tenantId: googleAdsConnectionsTable.tenantId,
        refreshToken: googleAdsConnectionsTable.refreshToken,
      }).from(googleAdsConnectionsTable).where(and(
        eq(googleAdsConnectionsTable.status, "active"),
        isNull(googleAdsConnectionsTable.disconnectedAt),
        lte(googleAdsConnectionsTable.tokenExpiresAt, refreshBefore),
      )),
      db.select({
        id: searchConsoleConnectionsTable.id,
        tenantId: searchConsoleConnectionsTable.tenantId,
        refreshToken: searchConsoleConnectionsTable.refreshToken,
      }).from(searchConsoleConnectionsTable).where(and(
        isNull(searchConsoleConnectionsTable.disconnectedAt),
        lte(searchConsoleConnectionsTable.tokenExpiresAt, refreshBefore),
      )),
      db.select({
        id: instagramConnectionsTable.id,
        tenantId: instagramConnectionsTable.tenantId,
      }).from(instagramConnectionsTable).where(and(
        isNull(instagramConnectionsTable.disconnectedAt),
        lte(instagramConnectionsTable.tokenExpiresAt, refreshBefore),
      )),
      db.select({
        id: metaAdsConnectionsTable.id,
        tenantId: metaAdsConnectionsTable.tenantId,
      }).from(metaAdsConnectionsTable).where(and(
        eq(metaAdsConnectionsTable.status, "active"),
        isNull(metaAdsConnectionsTable.disconnectedAt),
        lte(metaAdsConnectionsTable.tokenExpiresAt, refreshBefore),
      )),
      db.select({
        id: socialConnectionsTable.id,
        tenantId: socialConnectionsTable.tenantId,
        provider: socialConnectionsTable.provider,
        refreshToken: socialConnectionsTable.refreshToken,
      }).from(socialConnectionsTable).where(and(
        eq(socialConnectionsTable.status, "active"),
        isNull(socialConnectionsTable.disconnectedAt),
        lte(socialConnectionsTable.tokenExpiresAt, refreshBefore),
      )),
    ]);

    const tasks: Array<Promise<RefreshResult>> = [];

    for (const row of googleAds) {
      if (!row.refreshToken) continue;
      tasks.push(safeRefresh({
        provider: "google_ads",
        connectionId: row.id,
        tenantId: row.tenantId,
        run: () => refreshGoogleAdsToken(row.id),
        log,
      }));
    }

    for (const row of searchConsole) {
      if (!row.refreshToken) continue;
      tasks.push(safeRefresh({
        provider: "search_console",
        connectionId: row.id,
        tenantId: row.tenantId,
        run: () => refreshSearchConsoleToken(row.id),
        log,
      }));
    }

    for (const row of instagram) {
      tasks.push(safeRefresh({
        provider: "instagram",
        connectionId: row.id,
        tenantId: row.tenantId,
        run: () => refreshInstagramToken(row.id),
        log,
      }));
    }

    for (const row of metaAds) {
      tasks.push(safeRefresh({
        provider: "meta_ads",
        connectionId: row.id,
        tenantId: row.tenantId,
        run: () => refreshMetaAdsToken(row.id),
        log,
      }));
    }

    for (const row of social) {
      const provider = row.provider as SocialProvider;
      if (!["youtube", "linkedin", "tiktok"].includes(provider)) continue;
      if (!row.refreshToken) continue;
      tasks.push(safeRefresh({
        provider,
        connectionId: row.id,
        tenantId: row.tenantId,
        run: async () => { await resolveValidSocialConnection(row.tenantId, provider, row.id); },
        log,
      }));
    }

    const results = await Promise.all(tasks);
    const failed = results.filter((item) => !item.ok);
    log.info(
      { checked: tasks.length, refreshed: results.length - failed.length, failed: failed.length },
      "integration-token-guardian: ciclo concluído",
    );
    return results;
  } finally {
    running = false;
  }
}

export function startIntegrationTokenGuardian(log: Logger): void {
  if (timer || process.env["NODE_ENV"] === "test") return;
  void runIntegrationTokenGuardian(log).catch((error) => {
    log.error({ error }, "integration-token-guardian: falha no ciclo inicial");
  });
  timer = setInterval(() => {
    void runIntegrationTokenGuardian(log).catch((error) => {
      log.error({ error }, "integration-token-guardian: falha no ciclo periódico");
    });
  }, Math.max(60_000, CHECK_INTERVAL_MS));
  timer.unref?.();
  log.info({ intervalMs: CHECK_INTERVAL_MS, refreshAheadMs: REFRESH_AHEAD_MS }, "integration-token-guardian: iniciado");
}
