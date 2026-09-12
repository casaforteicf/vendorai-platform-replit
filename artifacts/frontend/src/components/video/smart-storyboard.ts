import { graphicDirection, type GraphicDesignPlan, type GraphicDirectionId } from "@workspace/vendor-brain/graphic-design-director";
import { assetLabel, assetUrl, type ProfessionalMediaAsset } from "./professional-video";

export const DESIGN_PLAN_KEY = "vendorai_graphic_design_plan_v1";
export const SMART_STORYBOARD_MANIFEST_KEY = "vendorai_smart_storyboard_manifest_v1";
export const CREATIVE_FONT_KEY = "vendorai:creative-font-family";

export type SmartCrop = {
  x: number;
  y: number;
  focalX: number;
  focalY: number;
  safe: boolean | null;
  source: "indexed-crop" | "focal-point" | "center";
};

export type MediaAutocompositionItem = {
  sceneIndex: number;
  assetId: string;
  assetType: "image" | "video";
  score: number;
  reasons: string[];
  crop: SmartCrop;
  whitespaceSide: "left" | "right" | "top" | "bottom" | "center" | null;
  qualityScore: number | null;
  intelligenceStatus: string | null;
};

export type MediaAutocompositionSnapshot = {
  version: 1;
  generatedAt: string;
  targetFormat: GraphicDesignPlan["format"];
  scenes: MediaAutocompositionItem[];
};

export type StoredSmartDesignPlan = {
  tenantId: string;
  approvedAt: string;
  source: "graphic-design-director";
  brief: {
    product: string;
    headline: string;
    supportingText: string;
    cta: string;
    channel: string;
    directionId: GraphicDirectionId;
    brandColor: string;
  };
  plan: GraphicDesignPlan;
  mediaAutocomposition?: MediaAutocompositionSnapshot;
  [key: string]: unknown;
};

export type SmartStoryboardManifestScene = {
  sceneIndex: number;
  projectId: string;
  assetId: string;
  assetType: "image" | "video";
  mediaScore: number;
  headline: string;
  crop: SmartCrop;
};

export type SmartStoryboardManifest = {
  version: 1;
  tenantId: string;
  createdAt: string;
  directionName: string;
  designScore: number;
  targetFormat: GraphicDesignPlan["format"];
  scenes: SmartStoryboardManifestScene[];
};

type CanvasLayer = {
  id: string;
  type: "text" | "image";
  name: string;
  text: string;
  start: number;
  end: number;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  color: string;
  background: string;
  opacity: number;
  scale: number;
  rotation: number;
  easing: "ease-in-out";
  textAlign: "left" | "center" | "right";
  enterAnimation: "fade" | "pop" | "slide-up";
  exitAnimation: "fade";
  animationDuration: number;
  contentKind?: string;
  url?: string;
  assetId?: string;
  fontFamily?: string;
  fontWeight?: number;
  designRole?: "media" | "brand" | "headline" | "supporting" | "cta";
  locked?: boolean;
  borderRadius?: number;
  shadowPreset?: "none" | "soft" | "strong" | "glow";
  maskShape?: "none" | "rounded" | "circle";
  imageFit?: "contain" | "cover";
  imagePositionX?: number;
  imagePositionY?: number;
  imageZoom?: number;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function parseSmartDesign(raw: string | null, tenantId: string): StoredSmartDesignPlan | null {
  if (!raw || !tenantId) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSmartDesignPlan;
    if (parsed?.tenantId !== tenantId || parsed.source !== "graphic-design-director" || !parsed.plan?.approved) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function parseStoryboardManifest(raw: string | null, tenantId: string): SmartStoryboardManifest | null {
  if (!raw || !tenantId) return null;
  try {
    const parsed = JSON.parse(raw) as SmartStoryboardManifest;
    if (parsed?.version !== 1 || parsed.tenantId !== tenantId || !Array.isArray(parsed.scenes) || !parsed.scenes.length) return null;
    return parsed;
  } catch {
    return null;
  }
}

function videoDuration(asset: ProfessionalMediaAsset): number {
  const metadata = asRecord(asset.metadata);
  for (const key of ["durationSeconds", "duration_seconds", "duration", "videoDuration", "video_duration"]) {
    const parsed = Number(metadata[key]);
    if (Number.isFinite(parsed) && parsed > 0) return Math.max(5, Math.min(20, parsed));
  }
  return 8;
}

function targetRatio(format: GraphicDesignPlan["format"]): number {
  if (format === "16:9") return 16 / 9;
  if (format === "4:5") return 4 / 5;
  if (format === "1:1") return 1;
  return 9 / 16;
}

function imagePlacement(asset: ProfessionalMediaAsset, format: GraphicDesignPlan["format"], crop: SmartCrop) {
  const metadata = asRecord(asset.metadata);
  const intelligence = asRecord(metadata.mediaIntelligence);
  const dimensions = asRecord(intelligence.dimensions);
  const width = Number(dimensions.width ?? metadata.width ?? 0);
  const height = Number(dimensions.height ?? metadata.height ?? 0);
  const sourceRatio = width > 0 && height > 0 ? width / height : null;
  const desiredRatio = targetRatio(format);
  if (!sourceRatio) return { x: 0, y: 0, width: 100, imagePositionX: crop.x, imagePositionY: crop.y };
  if (sourceRatio >= desiredRatio) {
    const widthPct = Math.max(100, (sourceRatio / desiredRatio) * 100);
    const overflow = Math.max(0, widthPct - 100);
    return { x: -(overflow * crop.x / 100), y: 0, width: widthPct, imagePositionX: 50, imagePositionY: crop.y };
  }
  const heightPct = (desiredRatio / sourceRatio) * 100;
  const overflowY = Math.max(0, heightPct - 100);
  return { x: 0, y: -(overflowY * crop.y / 100), width: 100, imagePositionX: crop.x, imagePositionY: 50 };
}

function makeId(prefix: string, sceneIndex: number) {
  return `${prefix}-storyboard-${sceneIndex}-${Date.now().toString(36)}`;
}

function buildLayers(stored: StoredSmartDesignPlan, sceneIndex: number, asset: ProfessionalMediaAsset, crop: SmartCrop, logoUrl: string): CanvasLayer[] {
  const scene = stored.plan.scenes[sceneIndex];
  if (!scene) return [];
  const direction = graphicDirection(stored.plan.directionId);
  const duration = asset.type === "video" ? videoDuration(asset) : 8;
  const base = {
    start: 0,
    end: duration,
    opacity: 1,
    scale: 1,
    rotation: 0,
    easing: "ease-in-out" as const,
    exitAnimation: "fade" as const,
    animationDuration: 0.3,
  };
  const layers: CanvasLayer[] = [];

  if (asset.type === "image") {
    const placement = imagePlacement(asset, stored.plan.format, crop);
    layers.push({
      ...base,
      id: makeId("media", sceneIndex),
      type: "image",
      name: `Mídia inteligente · ${assetLabel(asset)}`,
      text: "",
      x: placement.x,
      y: placement.y,
      width: placement.width,
      fontSize: 18,
      color: "#ffffff",
      background: "transparent",
      textAlign: "center",
      enterAnimation: "fade",
      contentKind: "image",
      url: assetUrl(asset),
      assetId: asset.id,
      designRole: "media",
      locked: true,
      borderRadius: 0,
      shadowPreset: "none",
      maskShape: "none",
      imageFit: "cover",
      imagePositionX: placement.imagePositionX,
      imagePositionY: placement.imagePositionY,
      imageZoom: 1,
    });
  }

  if (logoUrl) {
    layers.push({
      ...base,
      id: makeId("brand", sceneIndex),
      type: "image",
      name: "Marca · logo",
      text: "",
      x: scene.layout.logo.x,
      y: scene.layout.logo.y,
      width: Math.min(24, scene.layout.logo.width),
      fontSize: 18,
      color: direction.textColor,
      background: "transparent",
      textAlign: scene.layout.logo.align,
      enterAnimation: "fade",
      contentKind: "image",
      url: logoUrl,
      designRole: "brand",
      imageFit: "contain",
    });
  }

  layers.push({
    ...base,
    id: makeId("headline", sceneIndex),
    type: "text",
    name: `Cena ${sceneIndex + 1} · Headline`,
    text: scene.headline,
    x: scene.layout.headline.x,
    y: scene.layout.headline.y,
    width: scene.layout.headline.width,
    fontSize: stored.plan.format === "9:16" ? 54 : 48,
    color: direction.textColor,
    background: "transparent",
    textAlign: scene.layout.headline.align,
    enterAnimation: "slide-up",
    contentKind: "text",
    fontFamily: scene.headlineFont,
    fontWeight: scene.headlineWeight,
    designRole: "headline",
  });

  if (scene.supportingText.trim()) {
    layers.push({
      ...base,
      id: makeId("supporting", sceneIndex),
      type: "text",
      name: `Cena ${sceneIndex + 1} · Apoio`,
      text: scene.supportingText,
      x: scene.layout.supporting.x,
      y: scene.layout.supporting.y,
      width: scene.layout.supporting.width,
      fontSize: stored.plan.format === "9:16" ? 29 : 25,
      color: direction.mutedTextColor,
      background: "transparent",
      textAlign: scene.layout.supporting.align,
      enterAnimation: "fade",
      contentKind: "text",
      fontFamily: scene.bodyFont,
      fontWeight: 500,
      designRole: "supporting",
    });
  }

  if (scene.cta.trim()) {
    layers.push({
      ...base,
      id: makeId("cta", sceneIndex),
      type: "text",
      name: `Cena ${sceneIndex + 1} · CTA`,
      text: scene.cta,
      x: scene.layout.cta.x,
      y: scene.layout.cta.y,
      width: scene.layout.cta.width,
      fontSize: stored.plan.format === "9:16" ? 27 : 24,
      color: direction.ctaColor,
      background: direction.ctaBackground,
      textAlign: scene.layout.cta.align,
      enterAnimation: "pop",
      contentKind: "text",
      fontFamily: scene.bodyFont,
      fontWeight: 700,
      designRole: "cta",
      borderRadius: Math.max(8, stored.plan.borderRadius * 0.6),
      shadowPreset: "soft",
    });
  }
  return layers;
}

export function buildSmartSceneProject(input: {
  stored: StoredSmartDesignPlan;
  sceneIndex: number;
  asset: ProfessionalMediaAsset;
  media: MediaAutocompositionItem;
  logoUrl: string;
}) {
  const { stored, sceneIndex, asset, media, logoUrl } = input;
  const scene = stored.plan.scenes[sceneIndex];
  if (!scene) throw new Error(`Cena ${sceneIndex + 1} não existe na direção aprovada`);
  const sourceUrl = assetUrl(asset);
  if (!sourceUrl) throw new Error(`Mídia da cena ${sceneIndex + 1} não possui URL`);
  const duration = asset.type === "video" ? videoDuration(asset) : 8;
  const layers = buildLayers(stored, sceneIndex, asset, media.crop, logoUrl);
  const clips = asset.type === "video" ? [{
    id: `clip-storyboard-${sceneIndex}-${Date.now().toString(36)}`,
    name: assetLabel(asset),
    url: sourceUrl,
    assetId: asset.id,
    sourceDuration: duration,
    trimIn: 0,
    trimOut: duration,
    transitionOut: "cut",
    transitionDuration: 0.3,
    motion: "none",
    beatLocked: false,
  }] : [];
  const titleSeed = stored.brief.product || scene.headline || stored.plan.directionName;
  return {
    title: `${titleSeed.slice(0, 58)} · Cena ${sceneIndex + 1} · Storyboard`,
    context: {
      channel: stored.brief.channel,
      ratio: stored.plan.format,
      quality: "1080p",
      sourceAssetId: asset.id,
      clips,
      layers,
      sfx: [],
      audio: {
        mode: "none",
        volume: 0.22,
        originalVolume: 1,
        start: 0,
        end: duration,
        ducking: { enabled: true, reduction: 62, thresholdPct: 5, attackMs: 120, releaseMs: 480 },
        fadeIn: 0.5,
        fadeOut: 1,
        smartLoop: true,
        loudnessTarget: -14,
      },
      graphicDesign: {
        source: "smart_storyboard_scene",
        parentSource: stored.source,
        approvedAt: stored.approvedAt,
        directionId: stored.plan.directionId,
        directionName: stored.plan.directionName,
        designScore: stored.plan.overallScore,
        safeAreaPct: stored.plan.safeAreaPct,
        palette: stored.plan.palette,
        typography: stored.plan.typography,
        brandColor: stored.brief.brandColor,
        sceneIndex,
        sceneCount: stored.plan.scenes.length,
        headline: scene.headline,
        professionalReady: stored.plan.approved,
        mediaSelection: {
          assetId: asset.id,
          assetType: asset.type,
          score: media.score,
          reasons: media.reasons,
          qualityScore: media.qualityScore,
          whitespaceSide: media.whitespaceSide,
          crop: media.crop,
          targetFormat: stored.plan.format,
        },
        smartCrop: true,
        storyboardScene: true,
        autocomposedAt: new Date().toISOString(),
      },
    },
    layerCount: layers.length,
  };
}
