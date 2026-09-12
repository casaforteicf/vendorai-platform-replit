export type MediaTargetFormat = "9:16" | "4:5" | "1:1" | "16:9";
export type MediaRetrievalZone = "left" | "right" | "top" | "bottom" | "center";
export type MediaRetrievalPreference = "image" | "video" | "either";

export type MediaRetrievalAsset = {
  id: string;
  type: string;
  role?: string | null;
  source?: string | null;
  originalFilename?: string | null;
  original_filename?: string | null;
  metadata?: Record<string, unknown> | null;
};

export type MediaRetrievalScene = {
  visual?: string | null;
  fala?: string | null;
  speech?: string | null;
  headline?: string | null;
  supportingText?: string | null;
  cta?: string | null;
};

export type MediaRetrievalContext = {
  channel?: string | null;
  targetFormat?: MediaTargetFormat | null;
  textZone?: MediaRetrievalZone | "auto" | null;
  preferType?: MediaRetrievalPreference | null;
  queryContext?: string | null;
  usedAssetIds?: Iterable<string> | null;
  allowGenerated?: boolean;
  minimumQuality?: number | null;
};

export type MediaRetrievalSubscores = {
  semantic: number;
  quality: number;
  format: number;
  composition: number;
  crop: number;
  authenticity: number;
  typeFit: number;
};

export type MediaRetrievalCandidate = {
  assetId: string;
  score: number;
  confidence: "high" | "medium" | "low";
  targetFormat: MediaTargetFormat | null;
  reasons: string[];
  subscores: MediaRetrievalSubscores;
  diagnostics: {
    source: string;
    orientation: string;
    qualityScore: number | null;
    whitespaceSide: MediaRetrievalZone | null;
    subjectLabels: string[];
    hasIntelligenceIndex: boolean;
    intelligenceStatus: string | null;
    cropSafe: boolean | null;
  };
};

export type MediaRetrievalPlanItem = {
  sceneIndex: number;
  assetId: string | null;
  score: number | null;
  reasons: string[];
};

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, value));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function normalized(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

const STOP_WORDS = new Set([
  "para", "como", "com", "uma", "umas", "uns", "das", "dos", "por", "que", "seu", "sua", "seus", "suas",
  "de", "do", "da", "em", "no", "na", "nos", "nas", "mais", "menos", "video", "cena", "imagem", "foto",
  "the", "and", "with", "from", "this", "that", "your", "scene", "video", "image", "photo",
]);

function tokenSet(value: string): string[] {
  return Array.from(new Set(
    normalized(value)
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3 && !STOP_WORDS.has(token)),
  ));
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function assetLabel(asset: MediaRetrievalAsset): string {
  return asset.originalFilename ?? asset.original_filename ?? asset.id;
}

function mediaIntelligence(asset: MediaRetrievalAsset): Record<string, unknown> {
  return asRecord(asRecord(asset.metadata).mediaIntelligence);
}

function intelligenceDimensions(asset: MediaRetrievalAsset): Record<string, unknown> {
  return asRecord(mediaIntelligence(asset).dimensions);
}

function intelligenceComposition(asset: MediaRetrievalAsset): Record<string, unknown> {
  return asRecord(mediaIntelligence(asset).composition);
}

function intelligenceQuality(asset: MediaRetrievalAsset): Record<string, unknown> {
  return asRecord(mediaIntelligence(asset).quality);
}

function intelligenceSubjects(asset: MediaRetrievalAsset): Record<string, unknown> {
  return asRecord(mediaIntelligence(asset).subjects);
}

function intelligenceCrops(asset: MediaRetrievalAsset): Record<string, unknown>[] {
  const raw = mediaIntelligence(asset).crops;
  return Array.isArray(raw) ? raw.map(asRecord) : [];
}

function contextLabel(metadata: Record<string, unknown>): string {
  const context = asRecord(metadata.context);
  return String(context.label ?? "");
}

function searchableText(asset: MediaRetrievalAsset): string {
  const metadata = asRecord(asset.metadata);
  const intelligence = mediaIntelligence(asset);
  const subjects = intelligenceSubjects(asset);
  const values: unknown[] = [
    assetLabel(asset),
    asset.role,
    asset.source,
    metadata.title,
    metadata.description,
    metadata.alt,
    metadata.category,
    metadata.tags,
    metadata.keywords,
    metadata.productName,
    metadata.product,
    metadata.campaignName,
    metadata.folderPath,
    metadata.aiRole,
    contextLabel(metadata),
    intelligence.searchTags,
    subjects.labels,
  ];
  return values
    .flatMap((value) => Array.isArray(value) ? value : [value])
    .map((value) => String(value ?? ""))
    .join(" ");
}

function semanticScore(queryTokens: string[], asset: MediaRetrievalAsset): number {
  if (!queryTokens.length) return 55;
  const haystack = normalized(searchableText(asset));
  const assetTokens = new Set(tokenSet(haystack));
  let points = 0;
  for (const token of queryTokens) {
    if (assetTokens.has(token)) points += 1;
    else if (haystack.includes(token)) points += 0.65;
  }
  return clamp((points / queryTokens.length) * 100);
}

function qualityScore(asset: MediaRetrievalAsset): number {
  const raw = numberOrNull(intelligenceQuality(asset).score);
  return raw === null ? 55 : clamp(raw);
}

function orientationOf(asset: MediaRetrievalAsset): string {
  const dimensions = intelligenceDimensions(asset);
  const explicit = normalized(dimensions.orientation);
  if (["portrait", "landscape", "square"].includes(explicit)) return explicit;
  const width = numberOrNull(dimensions.width ?? asRecord(asset.metadata).width);
  const height = numberOrNull(dimensions.height ?? asRecord(asset.metadata).height);
  if (!width || !height) return "unknown";
  const ratio = width / height;
  if (Math.abs(ratio - 1) <= 0.08) return "square";
  return ratio > 1 ? "landscape" : "portrait";
}

export function targetFormatForChannel(channel: string | null | undefined): MediaTargetFormat | null {
  const value = normalized(channel);
  if (!value) return null;
  if (value.includes("youtube") || value.includes("landing") || value.includes("site") || value.includes("website")) return "16:9";
  if (value.includes("story") || value.includes("reel") || value.includes("tiktok") || value.includes("short") || value.includes("whatsapp")) return "9:16";
  if (value.includes("feed") || value.includes("instagram") || value.includes("facebook") || value.includes("linkedin")) return "4:5";
  return null;
}

function formatScore(asset: MediaRetrievalAsset, target: MediaTargetFormat | null): number {
  if (!target) return 60;
  const orientation = orientationOf(asset);
  if (orientation === "unknown") return 55;
  if (target === "1:1") return orientation === "square" ? 100 : 76;
  const wantsPortrait = target === "9:16" || target === "4:5";
  if (wantsPortrait) {
    if (orientation === "portrait") return 100;
    if (orientation === "square") return 76;
    return 38;
  }
  if (orientation === "landscape") return 100;
  if (orientation === "square") return 74;
  return 36;
}

function whitespaceSide(asset: MediaRetrievalAsset): MediaRetrievalZone | null {
  const value = normalized(intelligenceComposition(asset).whitespaceSide);
  return ["left", "right", "top", "bottom", "center"].includes(value)
    ? value as MediaRetrievalZone
    : null;
}

function activityGrid(asset: MediaRetrievalAsset): number[] {
  const raw = intelligenceComposition(asset).activityGrid;
  if (!Array.isArray(raw)) return [];
  return raw.slice(0, 9).map((value) => clamp(Number(value) || 0));
}

function compositionScore(asset: MediaRetrievalAsset, textZone: MediaRetrievalZone | "auto" | null | undefined): number {
  const white = whitespaceSide(asset);
  const grid = activityGrid(asset);
  if (textZone && textZone !== "auto") {
    if (!white) return 55;
    if (white === textZone) return 100;
    const opposites: Record<MediaRetrievalZone, MediaRetrievalZone> = {
      left: "right",
      right: "left",
      top: "bottom",
      bottom: "top",
      center: "center",
    };
    if (opposites[textZone] === white) return 35;
    if (white === "center" || textZone === "center") return 58;
    return 70;
  }
  if (grid.length !== 9) return white ? 68 : 55;
  const min = Math.min(...grid);
  const avg = grid.reduce((sum, value) => sum + value, 0) / grid.length;
  const whitespaceAdvantage = clamp(avg - min, 0, 55);
  return clamp(58 + whitespaceAdvantage * 0.76);
}

function cropScore(asset: MediaRetrievalAsset, target: MediaTargetFormat | null): { score: number; safe: boolean | null } {
  if (!target) return { score: 60, safe: null };
  const crop = intelligenceCrops(asset).find((item) => String(item.format ?? "") === target);
  if (!crop) return { score: 50, safe: null };
  const safe = typeof crop.subjectSafe === "boolean" ? crop.subjectSafe : null;
  if (safe === true) return { score: 100, safe };
  if (safe === false) return { score: 42, safe };
  return { score: 72, safe };
}

function authenticityScore(asset: MediaRetrievalAsset, allowGenerated: boolean): number {
  const source = normalized(asset.source);
  if (source === "upload" || source === "imported") return 100;
  if (source === "external") return 76;
  if (source === "generated") return allowGenerated ? 45 : 18;
  return 64;
}

function typeFitScore(asset: MediaRetrievalAsset, preference: MediaRetrievalPreference | null | undefined): number {
  if (!preference || preference === "either") return 80;
  return asset.type === preference ? 100 : 58;
}

function subjectLabels(asset: MediaRetrievalAsset): string[] {
  return stringArray(intelligenceSubjects(asset).labels).slice(0, 8);
}

function confidenceFor(asset: MediaRetrievalAsset, semantic: number): MediaRetrievalCandidate["confidence"] {
  const intelligence = mediaIntelligence(asset);
  const hasIndex = Object.keys(intelligence).length > 0;
  const status = normalized(intelligence.status);
  if (hasIndex && status === "ready" && semantic >= 55) return "high";
  if (hasIndex || semantic >= 40) return "medium";
  return "low";
}

function reasonList(input: {
  asset: MediaRetrievalAsset;
  semantic: number;
  quality: number;
  target: MediaTargetFormat | null;
  format: number;
  composition: number;
  cropSafe: boolean | null;
  authenticity: number;
}): string[] {
  const reasons: string[] = [];
  if (input.semantic >= 70) reasons.push(`forte aderência ao contexto (${Math.round(input.semantic)}%)`);
  else if (input.semantic >= 45) reasons.push(`boa aderência ao contexto (${Math.round(input.semantic)}%)`);
  if (input.quality >= 80) reasons.push(`qualidade visual ${Math.round(input.quality)}/100`);
  if (input.target && input.format >= 90) reasons.push(`formato favorável para ${input.target}`);
  const white = whitespaceSide(input.asset);
  if (white && input.composition >= 72) reasons.push(`espaço livre ${white === "left" ? "à esquerda" : white === "right" ? "à direita" : white === "top" ? "no topo" : white === "bottom" ? "na base" : "no centro"}`);
  if (input.target && input.cropSafe === true) reasons.push(`crop ${input.target} preserva o assunto`);
  if (input.authenticity >= 95) reasons.push("mídia real do tenant");
  if (!reasons.length) reasons.push("melhor equilíbrio disponível entre contexto e composição");
  return reasons.slice(0, 4);
}

export function rankMediaForScene(
  scene: MediaRetrievalScene,
  assets: MediaRetrievalAsset[],
  context: MediaRetrievalContext = {},
): MediaRetrievalCandidate[] {
  const target = context.targetFormat ?? targetFormatForChannel(context.channel);
  const used = new Set(context.usedAssetIds ? Array.from(context.usedAssetIds) : []);
  const queryTokens = tokenSet([
    scene.visual,
    scene.fala,
    scene.speech,
    scene.headline,
    scene.supportingText,
    scene.cta,
    context.queryContext,
  ].filter(Boolean).join(" "));
  const allowGenerated = context.allowGenerated === true;
  const minimumQuality = context.minimumQuality === null || context.minimumQuality === undefined
    ? null
    : clamp(Number(context.minimumQuality) || 0);

  return assets
    .filter((asset) => (asset.type === "image" || asset.type === "video") && !used.has(asset.id))
    .map((asset) => {
      const semantic = semanticScore(queryTokens, asset);
      const quality = qualityScore(asset);
      const format = formatScore(asset, target);
      const composition = compositionScore(asset, context.textZone);
      const crop = cropScore(asset, target);
      const authenticity = authenticityScore(asset, allowGenerated);
      const typeFit = typeFitScore(asset, context.preferType);
      let score = semantic * 0.34
        + quality * 0.16
        + format * 0.14
        + composition * 0.12
        + crop.score * 0.08
        + authenticity * 0.12
        + typeFit * 0.04;
      if (minimumQuality !== null && quality < minimumQuality) score -= (minimumQuality - quality) * 0.45;
      if (!allowGenerated && normalized(asset.source) === "generated") score = Math.min(score, 62);
      const intelligence = mediaIntelligence(asset);
      const rounded = Math.round(clamp(score));
      return {
        assetId: asset.id,
        score: rounded,
        confidence: confidenceFor(asset, semantic),
        targetFormat: target,
        reasons: reasonList({ asset, semantic, quality, target, format, composition, cropSafe: crop.safe, authenticity }),
        subscores: {
          semantic: Math.round(semantic),
          quality: Math.round(quality),
          format: Math.round(format),
          composition: Math.round(composition),
          crop: Math.round(crop.score),
          authenticity: Math.round(authenticity),
          typeFit: Math.round(typeFit),
        },
        diagnostics: {
          source: String(asset.source ?? "unknown"),
          orientation: orientationOf(asset),
          qualityScore: numberOrNull(intelligenceQuality(asset).score),
          whitespaceSide: whitespaceSide(asset),
          subjectLabels: subjectLabels(asset),
          hasIntelligenceIndex: Object.keys(intelligence).length > 0,
          intelligenceStatus: Object.keys(intelligence).length ? String(intelligence.status ?? "unknown") : null,
          cropSafe: crop.safe,
        },
      } satisfies MediaRetrievalCandidate;
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.diagnostics.source !== b.diagnostics.source) {
        const real = (source: string) => source === "upload" || source === "imported" ? 1 : 0;
        return real(b.diagnostics.source) - real(a.diagnostics.source);
      }
      return a.assetId.localeCompare(b.assetId);
    });
}

export function selectBestMediaForScene(
  scene: MediaRetrievalScene,
  assets: MediaRetrievalAsset[],
  context: MediaRetrievalContext = {},
): MediaRetrievalCandidate | null {
  return rankMediaForScene(scene, assets, context)[0] ?? null;
}

export function buildMediaRetrievalPlan(
  scenes: MediaRetrievalScene[],
  assets: MediaRetrievalAsset[],
  context: Omit<MediaRetrievalContext, "usedAssetIds"> = {},
): MediaRetrievalPlanItem[] {
  const used = new Set<string>();
  return scenes.map((scene, sceneIndex) => {
    const best = selectBestMediaForScene(scene, assets, { ...context, usedAssetIds: used });
    if (!best) return { sceneIndex, assetId: null, score: null, reasons: [] };
    used.add(best.assetId);
    return { sceneIndex, assetId: best.assetId, score: best.score, reasons: best.reasons };
  });
}
