export type OpeningType = "door" | "window";
export type OpeningStyle = "hinged" | "sliding" | "fixed" | "tilt_turn";
export type OpeningSwing = "left" | "right";
export type OpeningFrameMaterial = "pvc" | "aluminum" | "wood" | "steel" | "other";
export type OpeningGlassType = "clear" | "tempered" | "laminated" | "insulated" | "frosted" | "none" | "other";

export type OpeningParameters = {
  width?: number;
  height?: number;
  sillHeight?: number;
  openingStyle?: OpeningStyle;
  swing?: OpeningSwing;
  presetId?: string;
  manufacturer?: string;
  productLine?: string;
  profile?: string;
  frameMaterial?: OpeningFrameMaterial;
  frameColor?: string;
  glassType?: OpeningGlassType;
  glassThicknessMm?: number;
  leafCount?: number;
  unitCost?: number;
  components?: string;
};

export type NormalizedOpeningParameters = {
  width: number;
  height: number;
  sillHeight: number;
  openingStyle: OpeningStyle;
  swing: OpeningSwing;
  presetId?: string;
  manufacturer?: string;
  productLine?: string;
  profile?: string;
  frameMaterial?: OpeningFrameMaterial;
  frameColor?: string;
  glassType?: OpeningGlassType;
  glassThicknessMm?: number;
  leafCount: number;
  unitCost?: number;
  components?: string;
};

export type OpeningPreset = {
  id: string;
  label: string;
  type: OpeningType;
  width: number;
  height: number;
  sillHeight: number;
  openingStyle: OpeningStyle;
  swing?: OpeningSwing;
  manufacturer?: string;
  productLine?: string;
  profile?: string;
  frameMaterial?: OpeningFrameMaterial;
  frameColor?: string;
  glassType?: OpeningGlassType;
  glassThicknessMm?: number;
  leafCount?: number;
  unitCost?: number;
  components?: string;
};

export const OPENING_WALL_HEIGHT = 2.8;
export const OPENING_MIN_WIDTH = 0.5;
export const OPENING_MAX_WIDTH = 4;
export const OPENING_MIN_HEIGHT = 0.5;

export const OPENING_STYLE_OPTIONS: Record<
  OpeningType,
  Array<{ value: OpeningStyle; label: string }>
> = {
  door: [
    { value: "hinged", label: "Abrir" },
    { value: "sliding", label: "Correr" },
    { value: "fixed", label: "Fixa" },
  ],
  window: [
    { value: "hinged", label: "Abrir" },
    { value: "sliding", label: "Correr" },
    { value: "fixed", label: "Fixa" },
    { value: "tilt_turn", label: "Oscilobatente" },
  ],
};

export const OPENING_FRAME_MATERIAL_OPTIONS: Array<{
  value: OpeningFrameMaterial;
  label: string;
}> = [
  { value: "pvc", label: "PVC" },
  { value: "aluminum", label: "Alumínio" },
  { value: "wood", label: "Madeira" },
  { value: "steel", label: "Aço" },
  { value: "other", label: "Outro" },
];

export const OPENING_GLASS_TYPE_OPTIONS: Array<{
  value: OpeningGlassType;
  label: string;
}> = [
  { value: "clear", label: "Comum / incolor" },
  { value: "tempered", label: "Temperado" },
  { value: "laminated", label: "Laminado" },
  { value: "insulated", label: "Duplo / insulado" },
  { value: "frosted", label: "Fosco" },
  { value: "none", label: "Sem vidro" },
  { value: "other", label: "Outro" },
];

export const OPENING_PRESETS: OpeningPreset[] = [
  {
    id: "door-080-hinged",
    label: "Porta 0,80 × 2,10 · abrir",
    type: "door",
    width: 0.8,
    height: 2.1,
    sillHeight: 0,
    openingStyle: "hinged",
    swing: "left",
    frameMaterial: "wood",
    frameColor: "Madeira natural",
    glassType: "none",
    leafCount: 1,
    components: "Marco, folha, dobradiças, fechadura",
  },
  {
    id: "door-090-hinged",
    label: "Porta 0,90 × 2,10 · abrir",
    type: "door",
    width: 0.9,
    height: 2.1,
    sillHeight: 0,
    openingStyle: "hinged",
    swing: "left",
    frameMaterial: "wood",
    frameColor: "Madeira natural",
    glassType: "none",
    leafCount: 1,
    components: "Marco, folha, dobradiças, fechadura",
  },
  {
    id: "door-120-sliding",
    label: "Porta 1,20 × 2,10 · correr",
    type: "door",
    width: 1.2,
    height: 2.1,
    sillHeight: 0,
    openingStyle: "sliding",
    frameMaterial: "aluminum",
    frameColor: "Preto",
    glassType: "tempered",
    glassThicknessMm: 8,
    leafCount: 2,
    components: "Marco, folhas, trilho, roldanas, fecho",
  },
  {
    id: "door-180-sliding",
    label: "Porta 1,80 × 2,10 · correr",
    type: "door",
    width: 1.8,
    height: 2.1,
    sillHeight: 0,
    openingStyle: "sliding",
    frameMaterial: "pvc",
    frameColor: "Branco",
    glassType: "tempered",
    glassThicknessMm: 8,
    leafCount: 2,
    components: "Marco, folhas, trilho, roldanas, fecho",
  },
  {
    id: "window-060-fixed",
    label: "Janela 0,60 × 0,60 · fixa",
    type: "window",
    width: 0.6,
    height: 0.6,
    sillHeight: 1.5,
    openingStyle: "fixed",
    frameMaterial: "pvc",
    frameColor: "Branco",
    glassType: "tempered",
    glassThicknessMm: 6,
    leafCount: 1,
    components: "Marco, vidro, baguetes de fixação",
  },
  {
    id: "window-080-tilt-turn",
    label: "Janela 0,80 × 1,20 · oscilobatente",
    type: "window",
    width: 0.8,
    height: 1.2,
    sillHeight: 0.9,
    openingStyle: "tilt_turn",
    frameMaterial: "pvc",
    frameColor: "Branco",
    glassType: "insulated",
    glassThicknessMm: 20,
    leafCount: 1,
    components: "Marco, folha, ferragem oscilobatente, vidro",
  },
  {
    id: "window-100-hinged",
    label: "Janela 1,00 × 1,20 · abrir",
    type: "window",
    width: 1,
    height: 1.2,
    sillHeight: 0.9,
    openingStyle: "hinged",
    frameMaterial: "aluminum",
    frameColor: "Preto",
    glassType: "tempered",
    glassThicknessMm: 6,
    leafCount: 2,
    components: "Marco, folhas, dobradiças, fechos, vidro",
  },
  {
    id: "window-120-sliding",
    label: "Janela 1,20 × 1,20 · correr",
    type: "window",
    width: 1.2,
    height: 1.2,
    sillHeight: 0.9,
    openingStyle: "sliding",
    frameMaterial: "pvc",
    frameColor: "Branco",
    glassType: "tempered",
    glassThicknessMm: 6,
    leafCount: 2,
    components: "Marco, folhas, trilhos, roldanas, fecho, vidro",
  },
  {
    id: "window-150-sliding",
    label: "Janela 1,50 × 1,20 · correr",
    type: "window",
    width: 1.5,
    height: 1.2,
    sillHeight: 0.9,
    openingStyle: "sliding",
    frameMaterial: "pvc",
    frameColor: "Branco",
    glassType: "tempered",
    glassThicknessMm: 6,
    leafCount: 2,
    components: "Marco, folhas, trilhos, roldanas, fecho, vidro",
  },
];

const FRAME_MATERIAL_VALUES = new Set<OpeningFrameMaterial>(
  OPENING_FRAME_MATERIAL_OPTIONS.map((item) => item.value),
);
const GLASS_TYPE_VALUES = new Set<OpeningGlassType>(
  OPENING_GLASS_TYPE_OPTIONS.map((item) => item.value),
);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalFinite(value: number | undefined, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return clamp(value, min, max);
}

function cleanText(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

export function defaultOpeningParameters(type: OpeningType): NormalizedOpeningParameters {
  return type === "door"
    ? {
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
        openingStyle: "hinged",
        swing: "left",
        leafCount: 1,
      }
    : {
        width: 1.2,
        height: 1.2,
        sillHeight: 0.9,
        openingStyle: "sliding",
        swing: "left",
        leafCount: 2,
      };
}

export function normalizeOpeningParameters(
  type: OpeningType,
  source: OpeningParameters = {},
): NormalizedOpeningParameters {
  const defaults = defaultOpeningParameters(type);
  const allowedStyles = OPENING_STYLE_OPTIONS[type].map((item) => item.value);
  const candidateStyle = source.openingStyle ?? defaults.openingStyle;
  const openingStyle = allowedStyles.includes(candidateStyle)
    ? candidateStyle
    : defaults.openingStyle;

  const sillHeight = type === "door"
    ? 0
    : clamp(
        finiteOr(source.sillHeight, defaults.sillHeight),
        0,
        OPENING_WALL_HEIGHT - OPENING_MIN_HEIGHT,
      );
  const maxHeight = Math.max(OPENING_MIN_HEIGHT, OPENING_WALL_HEIGHT - sillHeight);
  const leafCount = Math.round(clamp(
    finiteOr(source.leafCount, openingStyle === "sliding" ? 2 : 1),
    1,
    12,
  ));

  return {
    width: clamp(
      finiteOr(source.width, defaults.width),
      OPENING_MIN_WIDTH,
      OPENING_MAX_WIDTH,
    ),
    height: clamp(
      finiteOr(source.height, defaults.height),
      OPENING_MIN_HEIGHT,
      maxHeight,
    ),
    sillHeight,
    openingStyle,
    swing: source.swing === "right" ? "right" : "left",
    presetId: cleanText(source.presetId),
    manufacturer: cleanText(source.manufacturer),
    productLine: cleanText(source.productLine),
    profile: cleanText(source.profile),
    frameMaterial: source.frameMaterial && FRAME_MATERIAL_VALUES.has(source.frameMaterial)
      ? source.frameMaterial
      : undefined,
    frameColor: cleanText(source.frameColor),
    glassType: source.glassType && GLASS_TYPE_VALUES.has(source.glassType)
      ? source.glassType
      : undefined,
    glassThicknessMm: optionalFinite(source.glassThicknessMm, 1, 80),
    leafCount,
    unitCost: optionalFinite(source.unitCost, 0, 10000000),
    components: cleanText(source.components),
  };
}

export function clampOpeningWidthForWall(width: number, wallLength: number) {
  const safeLength = Number.isFinite(wallLength) ? Math.max(OPENING_MIN_WIDTH, wallLength) : OPENING_MAX_WIDTH;
  const maxWidth = Math.min(
    OPENING_MAX_WIDTH,
    Math.max(OPENING_MIN_WIDTH, safeLength - 0.1),
  );
  return clamp(width, OPENING_MIN_WIDTH, maxWidth);
}

export function clampOpeningOffset(
  offset: number,
  width: number,
  wallLength: number,
  edgeClearance = 0.05,
) {
  if (!Number.isFinite(wallLength) || wallLength <= 0.001) return 0.5;
  const halfRatio = (Math.max(OPENING_MIN_WIDTH, width) / 2 + edgeClearance) / wallLength;
  if (halfRatio >= 0.5) return 0.5;
  const safeOffset = Number.isFinite(offset) ? offset : 0.5;
  return clamp(safeOffset, halfRatio, 1 - halfRatio);
}

export function openingStyleSupportsSwing(style: OpeningStyle) {
  return style === "hinged" || style === "tilt_turn";
}

export function parametersFromOpeningPreset(preset: OpeningPreset): OpeningParameters {
  return {
    width: preset.width,
    height: preset.height,
    sillHeight: preset.sillHeight,
    openingStyle: preset.openingStyle,
    swing: preset.swing ?? "left",
    presetId: preset.id,
    manufacturer: preset.manufacturer,
    productLine: preset.productLine,
    profile: preset.profile,
    frameMaterial: preset.frameMaterial,
    frameColor: preset.frameColor,
    glassType: preset.glassType,
    glassThicknessMm: preset.glassThicknessMm,
    leafCount: preset.leafCount,
    unitCost: preset.unitCost,
    components: preset.components,
  };
}
