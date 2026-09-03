export const AUDIO_RIGHTS_STATUSES = new Set(["pending", "cleared", "restricted"] as const);
export const AUDIO_RIGHTS_ORIGINS = new Set([
  "tenant_owned",
  "licensed",
  "generated",
  "public_domain",
  "unknown",
] as const);

export type AudioRightsStatus = "pending" | "cleared" | "restricted";
export type AudioRightsOrigin = "tenant_owned" | "licensed" | "generated" | "public_domain" | "unknown";

export interface MediaAudioRights {
  status: AudioRightsStatus;
  origin: AudioRightsOrigin;
  commercialUse: boolean;
  paidAds: boolean;
  territories: string[];
  expiresAt: string | null;
  attributionRequired: boolean;
  attributionText: string | null;
  licenseReference: string | null;
  evidenceAssetId: string | null;
  updatedAt: string | null;
  updatedByUserId: string | null;
}

export interface MediaAudioUsageAssessment {
  expired: boolean;
  organicAllowed: boolean;
  paidAdsAllowed: boolean;
  reasons: string[];
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function text(value: unknown, maxLength = 1000): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLength);
}

function booleanValue(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function territories(value: unknown): string[] {
  if (!Array.isArray(value)) return ["*"];
  const normalized = value
    .map((item) => text(item, 20)?.toUpperCase())
    .filter((item): item is string => Boolean(item));
  const unique = Array.from(new Set(normalized)).slice(0, 50);
  return unique.length ? unique : ["*"];
}

function isoDateOrNull(value: unknown): string | null {
  const raw = text(value, 80);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function normalizeMediaAudioRights(value: unknown): MediaAudioRights {
  const input = record(value);
  const statusRaw = text(input["status"], 30) as AudioRightsStatus | null;
  const originRaw = text(input["origin"], 30) as AudioRightsOrigin | null;
  return {
    status: statusRaw && AUDIO_RIGHTS_STATUSES.has(statusRaw) ? statusRaw : "pending",
    origin: originRaw && AUDIO_RIGHTS_ORIGINS.has(originRaw) ? originRaw : "unknown",
    commercialUse: booleanValue(input["commercialUse"]),
    paidAds: booleanValue(input["paidAds"]),
    territories: territories(input["territories"]),
    expiresAt: isoDateOrNull(input["expiresAt"]),
    attributionRequired: booleanValue(input["attributionRequired"]),
    attributionText: text(input["attributionText"], 1000),
    licenseReference: text(input["licenseReference"], 1000),
    evidenceAssetId: text(input["evidenceAssetId"], 100),
    updatedAt: isoDateOrNull(input["updatedAt"]),
    updatedByUserId: text(input["updatedByUserId"], 100),
  };
}

export function validateMediaAudioRightsInput(value: unknown): string[] {
  const input = record(value);
  const errors: string[] = [];
  const status = text(input["status"], 30);
  const origin = text(input["origin"], 30);

  if (!status || !AUDIO_RIGHTS_STATUSES.has(status as AudioRightsStatus)) {
    errors.push("status deve ser pending, cleared ou restricted");
  }
  if (!origin || !AUDIO_RIGHTS_ORIGINS.has(origin as AudioRightsOrigin)) {
    errors.push("origin deve ser tenant_owned, licensed, generated, public_domain ou unknown");
  }
  if (typeof input["commercialUse"] !== "boolean") errors.push("commercialUse deve ser boolean");
  if (typeof input["paidAds"] !== "boolean") errors.push("paidAds deve ser boolean");
  if (!Array.isArray(input["territories"]) || input["territories"].length === 0) {
    errors.push("territories deve conter ao menos um território ou *");
  }
  if (input["expiresAt"] !== null && input["expiresAt"] !== undefined && !isoDateOrNull(input["expiresAt"])) {
    errors.push("expiresAt deve ser uma data válida ou null");
  }
  if (input["attributionRequired"] !== undefined && typeof input["attributionRequired"] !== "boolean") {
    errors.push("attributionRequired deve ser boolean");
  }
  return errors;
}

export function assessMediaAudioUsage(rightsValue: unknown, now = new Date()): MediaAudioUsageAssessment {
  const rights = normalizeMediaAudioRights(rightsValue);
  const expired = Boolean(rights.expiresAt && new Date(rights.expiresAt).getTime() <= now.getTime());
  const reasons: string[] = [];

  if (rights.status !== "cleared") reasons.push("rights_not_cleared");
  if (expired) reasons.push("rights_expired");
  if (!rights.commercialUse) reasons.push("commercial_use_not_allowed");
  if (!rights.paidAds) reasons.push("paid_ads_not_allowed");
  if (rights.attributionRequired && !rights.attributionText) reasons.push("attribution_text_missing");

  const organicAllowed = rights.status === "cleared" && !expired && rights.commercialUse;
  const paidAdsAllowed = organicAllowed && rights.paidAds;

  return { expired, organicAllowed, paidAdsAllowed, reasons };
}
