import { and, eq, inArray, or } from "drizzle-orm";
import { db, mediaAssetsTable } from "@workspace/db";

type PublishGateAsset = {
  id: string;
  storageUrl: string;
  originalFilename: string | null;
  publishReady: boolean | null;
  score: number | null;
  blockers: string[];
};

export type MediaPublishReadiness = {
  checkedAt: string;
  matchedAssetIds: string[];
  approvedAssetIds: string[];
  blockedAssets: PublishGateAsset[];
};

export class CreativeQualityGateBlockedError extends Error {
  readonly code = "creative_quality_gate_blocked";
  readonly status = 409;

  constructor(readonly blockedAssets: PublishGateAsset[]) {
    const first = blockedAssets[0];
    const score = typeof first?.score === "number" ? ` (${first.score}/100)` : "";
    const detail = first?.blockers?.[0] ? ` ${first.blockers[0]}` : "";
    super(`Creative Quality bloqueou a publicação${score}.${detail}`.trim());
    this.name = "CreativeQualityGateBlockedError";
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
}

function urlVariants(raw: string): string[] {
  const value = raw.trim();
  if (!value) return [];
  const values = new Set<string>([value]);

  try {
    const parsed = new URL(value, "https://vendorai.local");
    const pathname = decodeURIComponent(parsed.pathname);
    values.add(pathname);

    if (pathname.startsWith("/api/storage/")) {
      values.add(pathname.slice("/api/storage".length));
    }
    if (pathname.startsWith("/storage/")) {
      values.add(pathname.slice("/storage".length));
    }
    if (pathname.startsWith("/api/storage")) {
      const storagePath = pathname.slice("/api/storage".length);
      if (storagePath) values.add(storagePath);
    }
    if (pathname.startsWith("/objects/")) {
      values.add(`/api/storage${pathname}`);
      values.add(`/storage${pathname}`);
    }
  } catch {
    // URLs relativas e referências legadas continuam usando o valor bruto.
  }

  return Array.from(values).filter(Boolean);
}

function unique(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((value): value is string => typeof value === "string" && Boolean(value.trim())).map((value) => value.trim())));
}

function gateForAsset(asset: {
  id: string;
  storageUrl: string;
  originalFilename: string | null;
  metadata: unknown;
}): PublishGateAsset {
  const metadata = asRecord(asset.metadata);
  const gate = asRecord(metadata.creativeQualityGate);
  const blockers = asStringArray(gate.blockers);
  const scoreRaw = gate.score ?? metadata.qualityScore;
  const score = Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : null;

  let publishReady: boolean | null = null;
  if (metadata.publishReady === true || metadata.publishReady === false) {
    publishReady = metadata.publishReady;
  } else if (gate.publishReady === true || gate.publishReady === false) {
    publishReady = gate.publishReady;
  }

  return {
    id: asset.id,
    storageUrl: asset.storageUrl,
    originalFilename: asset.originalFilename,
    publishReady,
    score,
    blockers,
  };
}

export async function inspectMediaPublishReadiness(input: {
  tenantId?: string | null;
  mediaUrl?: string | null;
  mediaUrls?: string[] | null;
  mediaAssetId?: string | null;
  mediaAssetIds?: string[] | null;
}): Promise<MediaPublishReadiness> {
  const assetIds = unique([input.mediaAssetId, ...(input.mediaAssetIds ?? [])]);
  const rawUrls = unique([input.mediaUrl, ...(input.mediaUrls ?? [])]);
  const storageCandidates = Array.from(new Set(rawUrls.flatMap(urlVariants)));

  if (assetIds.length === 0 && storageCandidates.length === 0) {
    return {
      checkedAt: new Date().toISOString(),
      matchedAssetIds: [],
      approvedAssetIds: [],
      blockedAssets: [],
    };
  }

  const predicates = [];
  if (assetIds.length) predicates.push(inArray(mediaAssetsTable.id, assetIds));
  if (storageCandidates.length) predicates.push(inArray(mediaAssetsTable.storageUrl, storageCandidates));
  const mediaPredicate = predicates.length === 1 ? predicates[0] : or(...predicates);

  const rows = await db
    .select({
      id: mediaAssetsTable.id,
      storageUrl: mediaAssetsTable.storageUrl,
      originalFilename: mediaAssetsTable.originalFilename,
      metadata: mediaAssetsTable.metadata,
    })
    .from(mediaAssetsTable)
    .where(input.tenantId
      ? and(eq(mediaAssetsTable.tenantId, input.tenantId), mediaPredicate)
      : mediaPredicate);

  const assets = rows.map(gateForAsset);
  const blockedAssets = assets.filter((asset) => asset.publishReady === false);
  const approvedAssetIds = assets.filter((asset) => asset.publishReady === true).map((asset) => asset.id);

  return {
    checkedAt: new Date().toISOString(),
    matchedAssetIds: assets.map((asset) => asset.id),
    approvedAssetIds,
    blockedAssets,
  };
}

export async function assertMediaPublishReady(input: {
  tenantId?: string | null;
  mediaUrl?: string | null;
  mediaUrls?: string[] | null;
  mediaAssetId?: string | null;
  mediaAssetIds?: string[] | null;
}): Promise<MediaPublishReadiness> {
  const result = await inspectMediaPublishReadiness(input);
  if (result.blockedAssets.length > 0) {
    throw new CreativeQualityGateBlockedError(result.blockedAssets);
  }
  return result;
}
