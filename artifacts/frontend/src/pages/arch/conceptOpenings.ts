export type OpeningType = "door" | "window";
export type OpeningStyle = "hinged" | "sliding" | "fixed" | "tilt_turn";
export type OpeningSwing = "left" | "right";

export type OpeningParameters = {
  width?: number;
  height?: number;
  sillHeight?: number;
  openingStyle?: OpeningStyle;
  swing?: OpeningSwing;
  presetId?: string;
};

export type NormalizedOpeningParameters = {
  width: number;
  height: number;
  sillHeight: number;
  openingStyle: OpeningStyle;
  swing: OpeningSwing;
  presetId?: string;
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

export const OPENING_PRESETS: OpeningPreset[] = [
  { id: "door-080-hinged", label: "Porta 0,80 × 2,10 · abrir", type: "door", width: 0.8, height: 2.1, sillHeight: 0, openingStyle: "hinged", swing: "left" },
  { id: "door-090-hinged", label: "Porta 0,90 × 2,10 · abrir", type: "door", width: 0.9, height: 2.1, sillHeight: 0, openingStyle: "hinged", swing: "left" },
  { id: "door-120-sliding", label: "Porta 1,20 × 2,10 · correr", type: "door", width: 1.2, height: 2.1, sillHeight: 0, openingStyle: "sliding", swing: "left" },
  { id: "door-180-sliding", label: "Porta 1,80 × 2,10 · correr", type: "door", width: 1.8, height: 2.1, sillHeight: 0, openingStyle: "sliding", swing: "left" },
  { id: "window-060-fixed", label: "Janela 0,60 × 0,60 · fixa", type: "window", width: 0.6, height: 0.6, sillHeight: 1.5, openingStyle: "fixed", swing: "left" },
  { id: "window-080-tilt-turn", label: "Janela 0,80 × 1,20 · oscilobatente", type: "window", width: 0.8, height: 1.2, sillHeight: 0.9, openingStyle: "tilt_turn", swing: "left" },
  { id: "window-100-hinged", label: "Janela 1,00 × 1,20 · abrir", type: "window", width: 1, height: 1.2, sillHeight: 0.9, openingStyle: "hinged", swing: "left" },
  { id: "window-120-sliding", label: "Janela 1,20 × 1,20 · correr", type: "window", width: 1.2, height: 1.2, sillHeight: 0.9, openingStyle: "sliding", swing: "left" },
  { id: "window-150-sliding", label: "Janela 1,50 × 1,20 · correr", type: "window", width: 1.5, height: 1.2, sillHeight: 0.9, openingStyle: "sliding", swing: "left" },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function defaultOpeningParameters(type: OpeningType): NormalizedOpeningParameters {
  return type === "door"
    ? {
        width: 0.9,
        height: 2.1,
        sillHeight: 0,
        openingStyle: "hinged",
        swing: "left",
      }
    : {
        width: 1.2,
        height: 1.2,
        sillHeight: 0.9,
        openingStyle: "sliding",
        swing: "left",
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
    presetId: source.presetId || undefined,
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
  };
}
