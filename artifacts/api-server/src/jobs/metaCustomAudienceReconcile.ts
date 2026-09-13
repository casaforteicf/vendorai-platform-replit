import type { Logger } from "pino";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  syncMetaCustomAudience,
  type MetaCustomAudienceKey,
} from "../services/meta-custom-audiences.js";

const SUPPORTED_KEYS = new Set<MetaCustomAudienceKey>([
  "meta_engaged_30d",
  "meta_hot_intent_30d",
  "instagram_dm_30d",
  "instagram_comments_30d",
]);

const RECONCILE_EVERY_MS = 24 * 60 * 60 * 1000;
const START_DELAY_MS = 10 * 60 * 1000;

type AudienceDueRow = {
  tenant_id: string;
  audience_key: string;
};

export async function runMetaCustomAudienceReconcile(log: Logger): Promise<void> {
  const result = await db.execute(sql`
    SELECT tenant_id, audience_key
      FROM meta_custom_audiences
     WHERE external_audience_id IS NOT NULL
       AND (
         last_synced_at IS NULL
         OR last_synced_at < NOW() - INTERVAL '20 hours'
         OR status = 'error'
       )
     ORDER BY COALESCE(last_synced_at, TIMESTAMPTZ '1970-01-01') ASC
     LIMIT 200
  `);

  const due = (result.rows ?? []) as AudienceDueRow[];
  if (due.length === 0) {
    log.info("scheduler/meta-custom-audiences: nothing due");
    return;
  }

  let reconciled = 0;
  let failed = 0;

  for (const row of due) {
    if (!SUPPORTED_KEYS.has(row.audience_key as MetaCustomAudienceKey)) continue;

    try {
      await syncMetaCustomAudience(row.tenant_id, row.audience_key as MetaCustomAudienceKey);
      reconciled += 1;
    } catch (err) {
      failed += 1;
      log.warn(
        { err, tenantId: row.tenant_id, audienceKey: row.audience_key },
        "scheduler/meta-custom-audiences: reconcile failed (non-fatal)",
      );
    }
  }

  log.info(
    { due: due.length, reconciled, failed, campaignActivated: false, spendActivated: false },
    "scheduler/meta-custom-audiences: reconcile complete",
  );
}

export function startMetaCustomAudienceReconcileScheduler(log: Logger): void {
  const run = () => {
    void runMetaCustomAudienceReconcile(log).catch((err) => {
      log.error({ err }, "scheduler/meta-custom-audiences: unhandled error");
    });
  };

  setTimeout(run, START_DELAY_MS).unref();
  setInterval(run, RECONCILE_EVERY_MS).unref();
  log.info("scheduler/meta-custom-audiences: enabled (daily; existing audiences only)");
}
