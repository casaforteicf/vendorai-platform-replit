import { and, eq, inArray } from "drizzle-orm";
import { db, mediaAssetsTable } from "@workspace/db";
import { assessMediaAudioUsage, normalizeMediaAudioRights } from "./media-rights.js";

type UsageKind = "organic" | "paid_ads";
type JsonRecord = Record<string, unknown>;

export class MediaRightsEnforcementError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 422,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "MediaRightsEnforcementError";
  }
}

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function storageUrlCandidates(rawUrl: string): string[] {
  const candidates = new Set<string>();
  const add = (value: string | null | undefined) => {
    if (!value) return;
    const trimmed = value.trim();
    if (trimmed) candidates.add(trimmed);
  };

  add(rawUrl);
  try {
    const parsed = new URL(rawUrl, "https://vendorai.local");
    add(parsed.pathname);
    const prefixes = ["/api/storage/objects/", "/storage/objects/"];
    for (const prefix of prefixes) {
      if (parsed.pathname.startsWith(prefix)) add(`/objects/${decodeURIComponent(parsed.pathname.slice(prefix.length))}`);
    }
  } catch {
    // Mantém a URL original quando não for parseável.
  }
  return Array.from(candidates);
}

async function findMediaAssetByUrl(tenantId: string, mediaUrl: string) {
  const candidates = storageUrlCandidates(mediaUrl);
  if (!candidates.length) return null;
  const [asset] = await db
    .select()
    .from(mediaAssetsTable)
    .where(and(eq(mediaAssetsTable.tenantId, tenantId), inArray(mediaAssetsTable.storageUrl, candidates)))
    .limit(1);
  return asset ?? null;
}

async function findMusicAsset(tenantId: string, musicAssetId: string) {
  const [asset] = await db
    .select()
    .from(mediaAssetsTable)
    .where(and(eq(mediaAssetsTable.tenantId, tenantId), eq(mediaAssetsTable.id, musicAssetId)))
    .limit(1);
  return asset ?? null;
}

export async function assertMediaAudioRightsForUsage(params: {
  tenantId: string;
  mediaUrl: string;
  usage: UsageKind;
}): Promise<void> {
  const mediaAsset = await findMediaAssetByUrl(params.tenantId, params.mediaUrl);
  if (!mediaAsset) return;

  const mediaMetadata = asRecord(mediaAsset.metadata);
  const musicAssetId = nonEmptyString(mediaMetadata["musicAssetId"]);
  const rightsSnapshot = asRecord(mediaMetadata["musicRightsSnapshot"]);
  if (!musicAssetId && Object.keys(rightsSnapshot).length === 0) return;

  const musicAsset = musicAssetId ? await findMusicAsset(params.tenantId, musicAssetId) : null;
  const musicMetadata = asRecord(musicAsset?.metadata);
  const currentRights = asRecord(musicMetadata["rights"]);
  const rights = normalizeMediaAudioRights(Object.keys(currentRights).length ? currentRights : rightsSnapshot);
  const assessment = assessMediaAudioUsage(rights);
  const allowed = params.usage === "paid_ads" ? assessment.paidAdsAllowed : assessment.organicAllowed;
  if (allowed) return;

  throw new MediaRightsEnforcementError(
    params.usage === "paid_ads"
      ? "Esta mídia usa uma trilha sem direitos válidos para mídia paga/anúncios. Atualize a licença da trilha antes de patrocinar."
      : "Esta mídia usa uma trilha sem direitos válidos para publicação comercial. Atualize a licença da trilha antes de publicar.",
    params.usage === "paid_ads" ? "MEDIA_AUDIO_PAID_ADS_RIGHTS_REQUIRED" : "MEDIA_AUDIO_ORGANIC_RIGHTS_REQUIRED",
    422,
    { mediaAssetId: mediaAsset.id, musicAssetId, rights, assessment },
  );
}
