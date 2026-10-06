import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray } from "drizzle-orm";
import type { Logger } from "pino";
import {
  adCampaignEventsTable,
  adCampaignsTable,
  db,
  leadsTable,
} from "@workspace/db";
import {
  getGoogleAdsConnectionByTenantId,
  refreshGoogleAdsToken,
} from "../services/google-ads-oauth.js";

const DATA_MANAGER_ENDPOINT = "https://datamanager.googleapis.com/v1/events:ingest";
const LOOKBACK_DAYS = 7;
const MAX_EVENTS_PER_RUN = 100;

const ELIGIBLE_EVENT_TYPES = [
  "lead_attributed",
  "trial_activated",
  "sale_closed",
] as const;

function enabled(): boolean {
  return process.env["GOOGLE_DATA_MANAGER_CONVERSIONS_ENABLED"] === "true";
}

function validateOnly(): boolean {
  return process.env["GOOGLE_DATA_MANAGER_VALIDATE_ONLY"] !== "false";
}

function allowedTenantIds(): Set<string> {
  return new Set(
    (process.env["GOOGLE_DATA_MANAGER_TENANT_IDS"] ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
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

function normalizeEmail(value?: string | null): string | null {
  if (!value) return null;
  const raw = value.replace(/\s+/g, "").toLowerCase();
  const [localRaw, domainRaw] = raw.split("@");
  if (!localRaw || !domainRaw) return null;

  let local = localRaw;
  if (domainRaw === "gmail.com" || domainRaw === "googlemail.com") {
    local = local.split("+")[0]!.replace(/\./g, "");
  }
  return `${local}@${domainRaw}`;
}

function normalizePhoneE164(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("+")) {
    const digits = trimmed.slice(1).replace(/\D/g, "");
    return digits ? `+${digits}` : null;
  }
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  // Formulários VendorAI são brasileiros por padrão. Números nacionais com
  // DDD (10/11 dígitos) recebem +55. Valores já com DDI permanecem intactos.
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return `+${digits}`;
}

function consentGranted(attribution: Record<string, unknown>): boolean {
  const consent = asRecord(attribution["adDataConsent"]);
  return consent["granted"] === true;
}

function conversionActionIdForEvent(
  eventType: string,
  connection: {
    dataManagerLeadConversionActionId?: string | null;
    dataManagerTrialConversionActionId?: string | null;
    dataManagerSaleConversionActionId?: string | null;
  },
): string | null {
  if (eventType === "lead_attributed") return connection.dataManagerLeadConversionActionId ?? null;
  if (eventType === "trial_activated") return connection.dataManagerTrialConversionActionId ?? null;
  if (eventType === "sale_closed") return connection.dataManagerSaleConversionActionId ?? null;
  return null;
}

async function validAccessToken(tenantId: string): Promise<{ accessToken: string; customerId: string } | null> {
  let connection = await getGoogleAdsConnectionByTenantId(tenantId);
  if (!connection || connection.status !== "active" || !connection.customerId || !connection.accessToken) {
    return null;
  }

  const expiresAt = connection.tokenExpiresAt ? new Date(connection.tokenExpiresAt).getTime() : 0;
  if (expiresAt && expiresAt < Date.now() + 2 * 60 * 1000) {
    await refreshGoogleAdsToken(connection.id);
    connection = await getGoogleAdsConnectionByTenantId(tenantId);
  }

  if (!connection?.accessToken || !connection.customerId || connection.status !== "active") return null;
  return { accessToken: connection.accessToken, customerId: connection.customerId };
}

async function patchEventMetadata(
  eventId: string,
  current: Record<string, unknown>,
  patch: Record<string, unknown>,
): Promise<void> {
  await db
    .update(adCampaignEventsTable)
    .set({ metadata: { ...current, ...patch } })
    .where(eq(adCampaignEventsTable.id, eventId));
}

export async function runGoogleDataManagerConversionSync(log: Logger): Promise<void> {
  if (!enabled()) return;

  const allowlist = allowedTenantIds();
  if (allowlist.size === 0) {
    log.warn("server-conversions/google-data-manager: feature flag ativa, mas nenhum tenant está na allowlist; nenhum evento será validado/enviado");
    return;
  }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
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
      eq(adCampaignsTable.plataforma, "google"),
      inArray(adCampaignEventsTable.tenantId, [...allowlist]),
      inArray(adCampaignEventsTable.eventType, [...ELIGIBLE_EVENT_TYPES]),
      gte(adCampaignEventsTable.createdAt, since),
    ))
    .orderBy(desc(adCampaignEventsTable.createdAt))
    .limit(MAX_EVENTS_PER_RUN);

  let validatedOrSent = 0;
  let skipped = 0;
  let failed = 0;
  const isValidateOnly = validateOnly();

  for (const event of events) {
    const metadata = asRecord(event.metadata);
    if (!allowlist.has(event.tenantId)) {
      skipped++;
      continue;
    }
    const completedKey = isValidateOnly ? "googleDataManagerValidatedAt" : "googleDataManagerSentAt";
    if (text(metadata[completedKey])) {
      skipped++;
      continue;
    }

    try {
      const connection = await getGoogleAdsConnectionByTenantId(event.tenantId);
      if (!connection || connection.status !== "active" || !connection.customerId) {
        skipped++;
        continue;
      }

      const conversionActionId = conversionActionIdForEvent(event.eventType, connection);
      if (!conversionActionId) {
        skipped++;
        continue;
      }

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
      if (!consentGranted(attribution)) {
        await patchEventMetadata(event.id, metadata, {
          googleDataManagerSkippedReason: "ad_data_consent_not_granted",
          googleDataManagerLastEvaluatedAt: new Date().toISOString(),
        }).catch(() => {});
        skipped++;
        continue;
      }

      const gclid = text(attribution["gclid"]) || text(metadata["gclid"]);
      const normalizedEmail = normalizeEmail(lead?.email);
      const normalizedPhone = normalizePhoneE164(lead?.telefone);
      const userIdentifiers: Array<Record<string, string>> = [];
      if (normalizedEmail) userIdentifiers.push({ emailAddress: sha256(normalizedEmail) });
      if (normalizedPhone) userIdentifiers.push({ phoneNumber: sha256(normalizedPhone) });

      if (!gclid && userIdentifiers.length === 0) {
        await patchEventMetadata(event.id, metadata, {
          googleDataManagerSkippedReason: "no_match_identifier",
          googleDataManagerLastEvaluatedAt: new Date().toISOString(),
        }).catch(() => {});
        skipped++;
        continue;
      }

      const auth = await validAccessToken(event.tenantId);
      if (!auth) {
        skipped++;
        continue;
      }

      const eventTimestamp = (
        text(metadata["closedAt"]) ||
        text(metadata["activatedAt"]) ||
        event.createdAt.toISOString()
      );
      const value = event.eventType === "sale_closed" ? Number(metadata["value"] ?? 0) : null;
      const eventPayload: Record<string, unknown> = {
        transactionId: `vendorai-${event.id}`,
        eventTimestamp,
        eventSource: event.eventType === "lead_attributed" ? "WEB" : "OTHER",
        ...(gclid ? { adIdentifiers: { gclid } } : {}),
        ...(userIdentifiers.length ? { userData: { userIdentifiers } } : {}),
      };
      if (value !== null && Number.isFinite(value)) {
        eventPayload["conversionValue"] = value;
        eventPayload["currency"] = text(metadata["currency"]) || "BRL";
      }

      const requestBody = {
        destinations: [{
          operatingAccount: {
            accountType: "GOOGLE_ADS",
            accountId: auth.customerId,
          },
          productDestinationId: conversionActionId,
        }],
        events: [eventPayload],
        consent: {
          adUserData: "CONSENT_GRANTED",
          // O opt-in atual autoriza medição/otimização, não personalização de
          // anúncios. Mantemos personalização negada até existir consentimento
          // específico para essa finalidade.
          adPersonalization: "CONSENT_DENIED",
        },
        encoding: "HEX",
        validateOnly: isValidateOnly,
      };

      const response = await fetch(DATA_MANAGER_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${auth.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });
      const responseText = await response.text();
      if (!response.ok) {
        throw new Error(`Google Data Manager ${response.status}: ${responseText.slice(0, 500)}`);
      }

      let requestId: string | null = null;
      try {
        const parsed = JSON.parse(responseText) as { requestId?: string };
        requestId = parsed.requestId ?? null;
      } catch {
        // Resposta 2xx sem JSON ainda conta como sucesso da chamada.
      }

      await patchEventMetadata(event.id, metadata, {
        [completedKey]: new Date().toISOString(),
        googleDataManagerRequestId: requestId,
        googleDataManagerConversionActionId: conversionActionId,
        googleDataManagerValidateOnly: isValidateOnly,
        googleDataManagerSkippedReason: null,
        googleDataManagerLastError: null,
      });
      validatedOrSent++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      const attempts = Number(metadata["googleDataManagerAttempts"] ?? 0) + 1;
      await patchEventMetadata(event.id, metadata, {
        googleDataManagerAttempts: attempts,
        googleDataManagerLastAttemptAt: new Date().toISOString(),
        googleDataManagerLastError: message.slice(0, 600),
      }).catch(() => {});
      log.warn({ eventId: event.id, eventType: event.eventType, campaignId: event.campaignId, err: message }, "server-conversions/google-data-manager: event failed");
    }
  }

  if (validatedOrSent > 0 || failed > 0) {
    log.info({ validatedOrSent, skipped, failed, validateOnly: isValidateOnly, allowlistedTenants: allowlist.size }, "server-conversions/google-data-manager: sync complete");
  }
}
