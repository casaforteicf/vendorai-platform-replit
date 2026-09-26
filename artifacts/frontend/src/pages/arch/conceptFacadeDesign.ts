export type FacadeMaterialId =
  | "paint-offwhite"
  | "paint-greige"
  | "concrete-light"
  | "concrete-dark"
  | "wood-natural"
  | "wood-dark"
  | "stone-sand"
  | "stone-graphite"
  | "brick-light"
  | "metal-black";

export type FacadeSurfaceKey =
  | "main"
  | "accent"
  | "garage"
  | "entrance"
  | "paving"
  | "frames";

export type FacadeVolumeKind =
  | "box"
  | "portal"
  | "canopy"
  | "panel"
  | "slats"
  | "pergola"
  | "planter"
  | "frame"
  | "garage"
  | "balcony"
  | "wall"
  | "gate";

export type FacadeMaterialDefinition = {
  id: FacadeMaterialId;
  name: string;
  category: "Pintura" | "Concreto" | "Madeira" | "Pedra" | "Tijolo" | "Metal";
  baseColor: string;
  shadeColor: string;
  lineColor: string;
  texture: "solid" | "wood" | "stone" | "brick" | "slats";
};

export type FacadeVolume = {
  id: string;
  kind: FacadeVolumeKind;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  depth: number;
  materialId: FacadeMaterialId;
  opacity?: number;
  locked?: boolean;
};

export type ParametricRoofConfig = {
  waters: 1 | 2 | 4;
  pitchDegrees: number;
  overhang: number;
  ridgeDirection: "auto" | "x" | "y";
  parapetHeight: number;
  gutter: boolean;
};

export type FacadeDesignState = {
  surfaceMaterials: Record<FacadeSurfaceKey, FacadeMaterialId>;
  volumes: FacadeVolume[];
  lighting: "day" | "sunset" | "night";
  showLandscaping: boolean;
  roofConfig?: ParametricRoofConfig;
};

export const FACADE_MATERIALS: FacadeMaterialDefinition[] = [
  {
    id: "paint-offwhite",
    name: "Pintura off-white",
    category: "Pintura",
    baseColor: "#f1efe9",
    shadeColor: "#d9d5cc",
    lineColor: "#c6c1b8",
    texture: "solid",
  },
  {
    id: "paint-greige",
    name: "Pintura greige",
    category: "Pintura",
    baseColor: "#cbc5ba",
    shadeColor: "#ada69a",
    lineColor: "#999286",
    texture: "solid",
  },
  {
    id: "concrete-light",
    name: "Concreto claro",
    category: "Concreto",
    baseColor: "#c8ccd0",
    shadeColor: "#aeb4ba",
    lineColor: "#939aa1",
    texture: "solid",
  },
  {
    id: "concrete-dark",
    name: "Concreto grafite",
    category: "Concreto",
    baseColor: "#626970",
    shadeColor: "#4b5258",
    lineColor: "#3d4348",
    texture: "solid",
  },
  {
    id: "wood-natural",
    name: "Madeira natural",
    category: "Madeira",
    baseColor: "#a97751",
    shadeColor: "#825a3e",
    lineColor: "#704a32",
    texture: "wood",
  },
  {
    id: "wood-dark",
    name: "Madeira escura",
    category: "Madeira",
    baseColor: "#684a37",
    shadeColor: "#4d372a",
    lineColor: "#3d2b21",
    texture: "wood",
  },
  {
    id: "stone-sand",
    name: "Pedra areia",
    category: "Pedra",
    baseColor: "#c3b7a4",
    shadeColor: "#a99b87",
    lineColor: "#91826f",
    texture: "stone",
  },
  {
    id: "stone-graphite",
    name: "Pedra grafite",
    category: "Pedra",
    baseColor: "#74716c",
    shadeColor: "#5d5a56",
    lineColor: "#4c4946",
    texture: "stone",
  },
  {
    id: "brick-light",
    name: "Tijolo claro",
    category: "Tijolo",
    baseColor: "#b7866e",
    shadeColor: "#976f5c",
    lineColor: "#805d4e",
    texture: "brick",
  },
  {
    id: "metal-black",
    name: "Metal preto",
    category: "Metal",
    baseColor: "#252a2e",
    shadeColor: "#161a1d",
    lineColor: "#0f1214",
    texture: "slats",
  },
];

export const DEFAULT_FACADE_DESIGN: FacadeDesignState = {
  surfaceMaterials: {
    main: "paint-offwhite",
    accent: "wood-natural",
    garage: "metal-black",
    entrance: "wood-natural",
    paving: "concrete-light",
    frames: "metal-black",
  },
  volumes: [],
  lighting: "day",
  showLandscaping: true,
  roofConfig: {
    waters: 2,
    pitchDegrees: 20,
    overhang: 0.45,
    ridgeDirection: "auto",
    parapetHeight: 0.9,
    gutter: true,
  },
};

export const FACADE_VOLUME_PRESETS: Array<{
  kind: FacadeVolumeKind;
  label: string;
  defaultMaterial: FacadeMaterialId;
  width: number;
  height: number;
  depth: number;
}> = [
  { kind: "box", label: "Volume", defaultMaterial: "paint-greige", width: 28, height: 42, depth: 0.8 },
  { kind: "portal", label: "Pórtico", defaultMaterial: "concrete-dark", width: 24, height: 70, depth: 0.9 },
  { kind: "canopy", label: "Marquise", defaultMaterial: "concrete-light", width: 32, height: 8, depth: 1.2 },
  { kind: "panel", label: "Painel", defaultMaterial: "stone-sand", width: 18, height: 66, depth: 0.25 },
  { kind: "slats", label: "Ripado", defaultMaterial: "wood-natural", width: 18, height: 62, depth: 0.18 },
  { kind: "pergola", label: "Pergolado", defaultMaterial: "wood-dark", width: 35, height: 18, depth: 1.8 },
  { kind: "planter", label: "Jardineira", defaultMaterial: "concrete-light", width: 22, height: 12, depth: 0.5 },
  { kind: "frame", label: "Moldura", defaultMaterial: "concrete-dark", width: 32, height: 54, depth: 0.35 },
  { kind: "garage", label: "Volume garagem", defaultMaterial: "paint-greige", width: 42, height: 44, depth: 1.2 },
  { kind: "balcony", label: "Sacada", defaultMaterial: "concrete-light", width: 34, height: 22, depth: 1.1 },
  { kind: "wall", label: "Muro frontal", defaultMaterial: "stone-graphite", width: 46, height: 24, depth: 0.25 },
  { kind: "gate", label: "Portão", defaultMaterial: "metal-black", width: 38, height: 34, depth: 0.18 },
];

export function getFacadeMaterial(id: FacadeMaterialId | undefined) {
  return FACADE_MATERIALS.find((material) => material.id === id) ?? FACADE_MATERIALS[0];
}

export function normalizeFacadeDesign(value?: Partial<FacadeDesignState> | null): FacadeDesignState {
  return {
    surfaceMaterials: {
      ...DEFAULT_FACADE_DESIGN.surfaceMaterials,
      ...(value?.surfaceMaterials ?? {}),
    },
    volumes: Array.isArray(value?.volumes)
      ? value!.volumes.map((volume) => ({
          ...volume,
          x: Math.max(0, Math.min(100, Number(volume.x) || 0)),
          y: Math.max(0, Math.min(100, Number(volume.y) || 0)),
          width: Math.max(4, Math.min(100, Number(volume.width) || 20)),
          height: Math.max(4, Math.min(100, Number(volume.height) || 20)),
          depth: Math.max(0, Math.min(3, Number(volume.depth) || 0)),
        }))
      : [],
    lighting: value?.lighting ?? DEFAULT_FACADE_DESIGN.lighting,
    showLandscaping: value?.showLandscaping ?? DEFAULT_FACADE_DESIGN.showLandscaping,
    roofConfig: {
      waters: [1, 2, 4].includes(Number(value?.roofConfig?.waters))
        ? Number(value?.roofConfig?.waters) as 1 | 2 | 4
        : DEFAULT_FACADE_DESIGN.roofConfig!.waters,
      pitchDegrees: Math.max(3, Math.min(55, Number(value?.roofConfig?.pitchDegrees) || DEFAULT_FACADE_DESIGN.roofConfig!.pitchDegrees)),
      overhang: Math.max(0, Math.min(1.5, Number(value?.roofConfig?.overhang) || DEFAULT_FACADE_DESIGN.roofConfig!.overhang)),
      ridgeDirection: ["auto", "x", "y"].includes(String(value?.roofConfig?.ridgeDirection))
        ? value!.roofConfig!.ridgeDirection
        : DEFAULT_FACADE_DESIGN.roofConfig!.ridgeDirection,
      parapetHeight: Math.max(0.2, Math.min(1.6, Number(value?.roofConfig?.parapetHeight) || DEFAULT_FACADE_DESIGN.roofConfig!.parapetHeight)),
      gutter: value?.roofConfig?.gutter ?? DEFAULT_FACADE_DESIGN.roofConfig!.gutter,
    },
  };
}

export function createFacadeVolume(
  kind: FacadeVolumeKind,
  index: number,
): FacadeVolume {
  const preset = FACADE_VOLUME_PRESETS.find((item) => item.kind === kind) ?? FACADE_VOLUME_PRESETS[0];
  return {
    id: `facade-volume-${Date.now()}-${index}`,
    kind: preset.kind,
    label: `${preset.label} ${index + 1}`,
    x: 36 + (index % 3) * 8,
    y: kind === "canopy" || kind === "pergola" ? 36 : 24,
    width: preset.width,
    height: preset.height,
    depth: preset.depth,
    materialId: preset.defaultMaterial,
    opacity: 1,
  };
}
