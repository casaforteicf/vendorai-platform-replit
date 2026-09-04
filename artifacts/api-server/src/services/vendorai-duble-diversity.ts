import { createHash, randomInt } from "crypto";
import { pool } from "@workspace/db";
import {
  createVendorAiDubleStyleReference,
  getDubleStyleCatalog,
  getVendorAiDubleStyleProfile,
  type DubleStyleSelection,
  type DubleStyleSelectionInput,
} from "./vendorai-duble-style.js";

type JsonRecord = Record<string, unknown>;
type Dimension = "scenario" | "outfit" | "framing" | "pose" | "lighting";
type DiversityMode = "automatic" | "hybrid" | "manual";

type CatalogItem = { id: string; label: string };
type Catalog = {
  market: { code: DubleStyleSelection["market"] };
  scenarios: CatalogItem[];
  outfits: CatalogItem[];
  framings: CatalogItem[];
  poses: CatalogItem[];
  lighting: CatalogItem[];
};

type IntelligentSelection = {
  enabled?: boolean;
  key?: string;
  label?: string;
  scenarios?: CatalogItem[];
  outfits?: CatalogItem[];
};

type StyleProfile = {
  market?: { code?: DubleStyleSelection["market"] };
  favorite?: DubleStyleSelection | null;
  recent?: DubleStyleSelection[];
  intelligentSelection?: IntelligentSelection | null;
};

export type DiversityAssessment = {
  engineVersion: 2;
  enabled: boolean;
  optimized: boolean;
  mode: DiversityMode;
  score: number;
  objectiveScore: number;
  segmentRelevance: number;
  closestRecentSimilarity: number;
  comparedHistoryCount: number;
  candidateCount: number;
  combinationHash: string;
  weights: Record<Dimension, number>;
};

type DiverseReference = Awaited<ReturnType<typeof createVendorAiDubleStyleReference>> & {
  diversity: DiversityAssessment;
};

const DIMENSIONS: Dimension[] = ["scenario", "outfit", "framing", "pose", "lighting"];
const WEIGHTS: Record<Dimension, number> = {
  scenario: 0.30,
  outfit: 0.25,
  framing: 0.15,
  pose: 0.15,
  lighting: 0.15,
};
const CANDIDATE_COUNT = 160;
const HISTORY_LIMIT = 16;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function explicitValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() && value !== "auto" ? value.trim() : null;
}

function randomItem<T>(items: T[]): T {
  return items[randomInt(0, items.length)]!;
}

function preferredSample(all: string[], preferred: string[], bias = 0.7): string {
  const validPreferred = preferred.filter((id) => all.includes(id));
  if (validPreferred.length && Math.random() < bias) return randomItem(validPreferred);
  return randomItem(all);
}

function exactMode(input: DubleStyleSelectionInput, favoriteUsed: boolean): DiversityMode {
  if (favoriteUsed) return "manual";
  const explicitCount = DIMENSIONS.filter((key) => Boolean(explicitValue(input[key]))).length;
  if (explicitCount === 0) return "automatic";
  if (explicitCount === DIMENSIONS.length) return "manual";
  return "hybrid";
}

function similarity(left: DubleStyleSelection, right: DubleStyleSelection): number {
  return DIMENSIONS.reduce((sum, key) => sum + (left[key] === right[key] ? WEIGHTS[key] : 0), 0);
}

function assessNovelty(selection: DubleStyleSelection, recent: DubleStyleSelection[]) {
  let closest = 0;
  recent.slice(0, HISTORY_LIMIT).forEach((item, index) => {
    const recencyFactor = Math.max(0.60, 1 - index * 0.035);
    closest = Math.max(closest, similarity(selection, item) * recencyFactor);
  });
  return {
    closest,
    novelty: Math.max(0, Math.min(100, Math.round((1 - closest) * 100))),
  };
}

function segmentRelevance(
  selection: DubleStyleSelection,
  fixed: Partial<Record<Dimension, boolean>>,
  preferredScenarios: string[],
  preferredOutfits: string[],
): number {
  const scenarioRelevant = fixed.scenario || preferredScenarios.length === 0 || preferredScenarios.includes(selection.scenario);
  const outfitRelevant = fixed.outfit || preferredOutfits.length === 0 || preferredOutfits.includes(selection.outfit);
  return (scenarioRelevant ? 50 : 0) + (outfitRelevant ? 50 : 0);
}

function combinationHash(selection: DubleStyleSelection): string {
  return createHash("sha256")
    .update(`${selection.market}|${selection.scenario}|${selection.outfit}|${selection.framing}|${selection.pose}|${selection.lighting}`)
    .digest("hex")
    .slice(0, 16);
}

function makeCandidate(input: {
  market: DubleStyleSelection["market"];
  requested: DubleStyleSelectionInput;
  catalog: Catalog;
  preferredScenarios: string[];
  preferredOutfits: string[];
}): DubleStyleSelection {
  const { market, requested, catalog, preferredScenarios, preferredOutfits } = input;
  const explicitScenario = explicitValue(requested.scenario);
  const explicitOutfit = explicitValue(requested.outfit);
  const explicitFraming = explicitValue(requested.framing);
  const explicitPose = explicitValue(requested.pose);
  const explicitLighting = explicitValue(requested.lighting);
  const scenarioIds = catalog.scenarios.map((item) => item.id);
  const outfitIds = catalog.outfits.map((item) => item.id);
  const framingIds = catalog.framings.map((item) => item.id);
  const poseIds = catalog.poses.map((item) => item.id);
  const lightingIds = catalog.lighting.map((item) => item.id);

  return {
    market,
    scenario: explicitScenario ?? preferredSample(scenarioIds, preferredScenarios, 0.72),
    outfit: explicitOutfit ?? preferredSample(outfitIds, preferredOutfits, 0.72),
    framing: explicitFraming ?? randomItem(framingIds),
    pose: explicitPose ?? randomItem(poseIds),
    lighting: explicitLighting ?? randomItem(lightingIds),
  };
}

function selectBestCandidate(input: {
  requested: DubleStyleSelectionInput;
  market: DubleStyleSelection["market"];
  catalog: Catalog;
  recent: DubleStyleSelection[];
  preferredScenarios: string[];
  preferredOutfits: string[];
}): { selection: DubleStyleSelection; candidateCount: number; objectiveScore: number; relevance: number; novelty: number; closest: number } {
  const fixed: Partial<Record<Dimension, boolean>> = Object.fromEntries(
    DIMENSIONS.map((key) => [key, Boolean(explicitValue(input.requested[key]))]),
  ) as Partial<Record<Dimension, boolean>>;
  let best: ReturnType<typeof scoreCandidate> | null = null;

  for (let index = 0; index < CANDIDATE_COUNT; index += 1) {
    const selection = makeCandidate({
      market: input.market,
      requested: input.requested,
      catalog: input.catalog,
      preferredScenarios: input.preferredScenarios,
      preferredOutfits: input.preferredOutfits,
    });
    const scored = scoreCandidate(selection, input.recent, fixed, input.preferredScenarios, input.preferredOutfits);
    if (!best || scored.objectiveScore > best.objectiveScore || (scored.objectiveScore === best.objectiveScore && scored.novelty > best.novelty)) {
      best = scored;
    }
  }

  if (!best) throw new Error("Diversity Engine não encontrou uma combinação válida");
  return { ...best, candidateCount: CANDIDATE_COUNT };
}

function scoreCandidate(
  selection: DubleStyleSelection,
  recent: DubleStyleSelection[],
  fixed: Partial<Record<Dimension, boolean>>,
  preferredScenarios: string[],
  preferredOutfits: string[],
) {
  const { novelty, closest } = assessNovelty(selection, recent);
  const relevance = segmentRelevance(selection, fixed, preferredScenarios, preferredOutfits);
  const objectiveScore = Math.round(novelty * 0.72 + relevance * 0.28);
  return { selection, objectiveScore, relevance, novelty, closest };
}

async function persistDiversity(params: {
  tenantId: string;
  identityId: string;
  assetId: string;
  assessment: DiversityAssessment;
}) {
  const payload = JSON.stringify({ diversity: params.assessment });
  await pool.query(
    `UPDATE media_assets
        SET metadata = COALESCE(metadata, '{}'::jsonb) || $3::jsonb
      WHERE tenant_id = $1 AND id = $2`,
    [params.tenantId, params.assetId, payload],
  );

  const identityResult = await pool.query(
    `SELECT metadata FROM media_identities WHERE tenant_id = $1 AND id = $2 LIMIT 1`,
    [params.tenantId, params.identityId],
  );
  if (!identityResult.rowCount) return;
  const metadata = asRecord(identityResult.rows[0]?.metadata);
  const dubleStyle = asRecord(metadata["dubleStyle"]);
  const history = Array.isArray(dubleStyle["history"]) ? dubleStyle["history"] : [];
  const nextHistory = history.map((entry) => {
    const record = asRecord(entry);
    return record["assetId"] === params.assetId ? { ...record, diversity: params.assessment } : entry;
  });
  const nextMetadata = {
    ...metadata,
    dubleStyle: {
      ...dubleStyle,
      lastDiversity: params.assessment,
      history: nextHistory,
    },
  };
  await pool.query(
    `UPDATE media_identities SET metadata = $3::jsonb, updated_at = NOW()
      WHERE tenant_id = $1 AND id = $2`,
    [params.tenantId, params.identityId, JSON.stringify(nextMetadata)],
  );
}

export async function createVendorAiDiverseStyleReference(params: {
  tenantId: string;
  userId?: string | null;
  identityId: string;
  style?: DubleStyleSelectionInput;
  title?: string;
}): Promise<DiverseReference> {
  const requested = params.style ?? {};
  const profile = await getVendorAiDubleStyleProfile({ tenantId: params.tenantId, identityId: params.identityId }) as StyleProfile;
  const catalog = getDubleStyleCatalog(requested.market ?? profile.market?.code) as Catalog;
  const recent = Array.isArray(profile.recent) ? profile.recent.slice(0, HISTORY_LIMIT) : [];
  const intelligent = profile.intelligentSelection ?? {};
  const preferredScenarios = Array.isArray(intelligent.scenarios) ? intelligent.scenarios.map((item) => item.id) : [];
  const preferredOutfits = Array.isArray(intelligent.outfits) ? intelligent.outfits.map((item) => item.id) : [];
  const favoriteUsed = requested.useFavorite === true && Boolean(profile.favorite);
  const mode = exactMode(requested, favoriteUsed);
  const antiRepeat = requested.antiRepeat !== false;
  const market = requested.market ?? profile.favorite?.market ?? profile.market?.code ?? catalog.market.code;

  let finalStyle: DubleStyleSelectionInput = requested;
  let candidateCount = 0;
  let objectiveScore = 0;

  if (favoriteUsed && profile.favorite) {
    finalStyle = { ...profile.favorite, antiRepeat: false };
  } else if (antiRepeat && mode !== "manual") {
    const best = selectBestCandidate({
      requested,
      market,
      catalog,
      recent,
      preferredScenarios,
      preferredOutfits,
    });
    finalStyle = { ...best.selection, antiRepeat: false };
    candidateCount = best.candidateCount;
    objectiveScore = best.objectiveScore;
  }

  const reference = await createVendorAiDubleStyleReference({
    ...params,
    style: finalStyle,
  });
  const fixed: Partial<Record<Dimension, boolean>> = Object.fromEntries(
    DIMENSIONS.map((key) => [key, Boolean(explicitValue(requested[key])) || favoriteUsed]),
  ) as Partial<Record<Dimension, boolean>>;
  const novelty = assessNovelty(reference.selection, recent);
  const relevance = segmentRelevance(reference.selection, fixed, preferredScenarios, preferredOutfits);
  const assessment: DiversityAssessment = {
    engineVersion: 2,
    enabled: antiRepeat,
    optimized: antiRepeat && mode !== "manual",
    mode,
    score: novelty.novelty,
    objectiveScore: objectiveScore || Math.round(novelty.novelty * 0.72 + relevance * 0.28),
    segmentRelevance: relevance,
    closestRecentSimilarity: Math.round(novelty.closest * 100),
    comparedHistoryCount: Math.min(recent.length, HISTORY_LIMIT),
    candidateCount,
    combinationHash: combinationHash(reference.selection),
    weights: WEIGHTS,
  };

  await persistDiversity({
    tenantId: params.tenantId,
    identityId: params.identityId,
    assetId: reference.assetId,
    assessment,
  });

  return { ...reference, diversity: assessment };
}
