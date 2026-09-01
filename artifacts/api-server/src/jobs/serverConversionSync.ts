import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Logger } from "pino";
import {
  adCampaignEventsTable,
  adCampaignsTable,
  db,
  leadsTable,
  tenantsTable,
} from "@workspace/db";
import {
  getMetaAdsConnectionByTenantId,
  refreshMetaAdsToken,
  META_GRAPH_BASE,
} from "../services/meta-ads-oauth.js";

const META_EVENT_LOOKBACK_DAYS = 7;
const MAX_EVENTS_PER_RUN = 100;

const META_EVENT_NAMES: Record<string, string> = {
  lead_attributed: "Lead",
  trial_started: "StartTrial",
  trial_activated: "TrialActivated",
  sale_closed: "Purchase",
};

function enabled(): boolean {
  return process.env["MARKETING_SERVER_CONVERSIONS_ENABLED"] === "true";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashEmail(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized ? sha256(normalized) : null;
}

function hashPhone(phone?: string | null): string | null {
  const normalized = phone?.replace(/\D/g, "");
  return normalized ? sha256(normalized) : null;
}

function hasAdDataConsent(metadata: Record<string, unknown>, attribution: Record<string, unknown>): boolean {
  // O evento pode carregar o snapshot do opt-in e o lead mantém a evidência
  // completa (granted/capturedAt/textVersion). Basta uma evidência explícita
  // positiva; ausência nunca é interpretada como consentimento.
  if (metadata["adDataConsent"] === true) return true;
  const consent = asRecord(attribution["adDataConsent"]);
  return consent["granted"] === true;
}

function eventTimeSeconds(eventCreatedAt: Date, metadata: Record<string, unknown>): number {
  const candidate = text(metadata["closedAt"]) || text(metadata["activatedAt"]);
  if (candidate) {
    const millis = Date.parse(candidate);
    if (Number.isFinite(millis)) return Math.floor(millis / 1000);
  }
  return Math.floor(eventCreatedAt.getTime() / 1000);
}

function buildFbc(
  metadata: Record<string, unknown>,
  attribution: Record<string, unknown>,
  fallbackTime: Date,
): string | null {
  const fbclid = text(metadata["fbclid"]) || text(attribution["fbclid"]);
  if (!fbclid) return null;
  const capturedAt = text(attribution["capturedAt"]);
  const parsed = capturedAt ? Date.parse(capturedAt) : Number.NaN;
  const millis = Number.isFinite(parsed) ? parsed : fallbackTime.getTime();
  return `fb.1.${Math.floor(millis)}.${fbclid}`;
}

async function getActiveMetaToken(tenantId: string): Promise<string | null> {
  let conn = await getMetaAdsConnectionByTenantId(tenantId);
  if (!conn || conn.status !== "active" || !conn.accessToken) return null;

  const expiresAt = conn.tokenExpiresAt ? new Date(conn.tokenExpiresAt).getTime() : 0;
  if (expiresAt && expiresAt < Date.now() + 3 * 24 * 60 * 60 * 1000) {
    await refreshMetaAdsToken(conn.id);
    conn = await getMetaAdsConnectionByTenantId(tenantId);
  }
  return conn?.status === "active" ? conn.accessToken ?? null : null;
}

async function markMetaResult(
  eventId: string,
  currentMetadata: Record<string, unknown>,
  patch: Record<string, unknown>,
): Promise<void> {
  await db
    .update(adCampaignEventsTable)
    .set({ metadata: { ...currentMetadata, ...patch } })
    .where(eq(adCampaignEventsTable.id, eventId));
}

/**
 * Envia conversões first-party para Meta CAPI somente quando:
 * 1) a feature flag global está explicitamente ligada; e
 * 2) o titular concedeu opt-in específico para medição/otimização de anúncios.
 *
 * event_id usa o ID estável do evento no VendorAI; se houver retry após uma
 * resposta já processada, a Meta consegue deduplicar o mesmo evento.
 */
export async function runServerConversionSync(log: Logger): Promise<void> {
  if (!enabled()) return;

  const since = new Date(Date.now() - META_EVENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const events = await db
    .select({
      id: adCampaignEventsTable.id,
      tenantId: adCampaignEventsTable.tenantId,
      campaignId: adCampaignEventsTable.campaignId,
      eventType: adCampaignEventsTable.eventType,
      metadata: adCampaignEventsTable.metadata,
      createdAt: adCampaignEventsTable.createdAt,
    })
    .from(adCampaignEventsTable)
    .innerJoin(adCampaignsTable, eq(adCampaignsTable.id, adCampaignEventsTable.campaignId))
    .where(and(
      eq(adCampaignsTable.plataforma, "meta"),
      inArray(adCampaignEventsTable.eventType, Object.keys(META_EVENT_NAMES)),
      gte(adCampaignEventsTable.createdAt, since),
    ))
    .orderBy(desc(adCampaignEventsTable.createdAt))
    .limit(MAX_EVENTS_PER_RUN);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const event of events) {
    const metadata = asRecord(event.metadata);
    if (text(metadata["metaCapiSentAt"])) {
      skipped++;
      continue;
    }

    try {
      const leadId = text(metadata["leadId"]);
      const [lead] = leadId
        ? await db
            .select({
              id: leadsTable.id,
              email: leadsTable.email,
              telefone: leadsTable.telefone,
              discoveryData: leadsTable.discoveryData,
            })
            .from(leadsTable)
            .where(and(eq(leadsTable.id, leadId), eq(leadsTable.tenantId, event.tenantId)))
            .limit(1)
        : [];

      const discovery = asRecord(lead?.discoveryData);
      const attribution = asRecord(discovery["attribution"]);

      if (!hasAdDataConsent(metadata, attribution)) {
        if (metadata["metaCapiSkippedReason"] !== "ad_data_consent_not_granted") {
          await markMetaResult(event.id, metadata, {
            metaCapiSkippedReason: "ad_data_consent_not_granted",
            metaCapiLastEvaluatedAt: new Date().toISOString(),
          }).catch(() => {});
        }
        skipped++;
        continue;
      }

      const [tenant] = await db
        .select({ metaPixelId: tenantsTable.metaPixelId })
        .from(tenantsTable)
        .where(eq(tenantsTable.id, event.tenantId))
        .limit(1);
      const pixelId = tenant?.metaPixelId?.trim();
      if (!pixelId) {
        skipped++;
        continue;
      }

      const accessToken = await getActiveMetaToken(event.tenantId);
      if (!accessToken) {
        skipped++;
        continue;
      }

      const emailHash = hashEmail(lead?.email);
      const phoneHash = hashPhone(lead?.telefone);
      const fbc = buildFbc(metadata, attribution, event.createdAt);

      const userData: Record<string, unknown> = {
        external_id: [sha256(lead?.id ?? `${event.tenantId}:${event.id}`)],
      };
      if (emailHash) userData["em"] = [emailHash];
      if (phoneHash) userData["ph"] = [phoneHash];
      if (fbc) userData["fbc"] = fbc;

      const customData: Record<string, unknown> = {};
      if (event.eventType === "sale_closed") {
        customData["currency"] = text(metadata["currency"]) || "BRL";
        customData["value"] = Number(metadata["value"] ?? 0);
        const dealId = text(metadata["dealId"]);
        if (dealId) customData["order_id"] = dealId;
      }
      if (event.eventType === "trial_activated") {
        customData["activation_definition"] = text(metadata["activationDefinition"]);
      }

      const eventSourceUrl = text(attribution["pageUrl"]);
      const payload = {
        data: [{
          event_name: META_EVENT_NAMES[event.eventType],
          event_time: eventTimeSeconds(event.createdAt, metadata),
          event_id: `vendorai:${event.id}`,
          action_source: event.eventType === "lead_attributed" || event.eventType === "trial_started"
            ? "website"
            : "system_generated",
          ...(eventSourceUrl ? { event_source_url: eventSourceUrl } : {}),
          user_data: userData,
          ...(Object.keys(customData).length ? { custom_data: customData } : {}),
        }],
      };

      const url = new URL(`${META_GRAPH_BASE}/${pixelId}/events`);
      url.searchParams.set("access_token", accessToken);
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`Meta CAPI ${response.status}: ${responseText.slice(0, 300)}`);
      }

      await markMetaResult(event.id, metadata, {
        metaCapiSentAt: new Date().toISOString(),
        metaCapiEventId: `vendorai:${event.id}`,
        metaCapiSkippedReason: null,
        metaCapiLastError: null,
      });
      sent++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      const attempts = Number(metadata["metaCapiAttempts"] ?? 0) + 1;
      await markMetaResult(event.id, metadata, {
        metaCapiAttempts: attempts,
        metaCapiLastAttemptAt: new Date().toISOString(),
        metaCapiLastError: message.slice(0, 500),
      }).catch(() => {});
      log.warn({ eventId: event.id, eventType: event.eventType, campaignId: event.campaignId, err: message }, "server-conversions/meta: event failed");
    }
  }

  if (sent > 0 || failed > 0) {
    log.info({ sent, skipped, failed }, "server-conversions/meta: sync complete");
  }
}
