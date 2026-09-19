export type ConceptMaterialCategory =
  | "floor"
  | "interior_wall"
  | "exterior_wall"
  | "roof"
  | "stair"
  | "wood"
  | "stone"
  | "metal"
  | "fabric"
  | "glass";

export type ConceptMaterialPattern =
  | "solid"
  | "tile"
  | "wood"
  | "stone"
  | "concrete"
  | "metal"
  | "fabric";

export type ConceptMaterialRef = {
  id: string;
  name: string;
  category: ConceptMaterialCategory;
  manufacturer?: string;
  finish?: string;
  color: string;
  secondaryColor?: string;
  edgeColor?: string;
  gloss?: number;
  pattern: ConceptMaterialPattern;
  libraryMaterialId?: string;
};

export type ConceptMaterialScheme = {
  floor: ConceptMaterialRef;
  floorByLevel: Record<string, ConceptMaterialRef>;
  interiorWall: ConceptMaterialRef;
  exteriorWall: ConceptMaterialRef;
  roof: ConceptMaterialRef;
  stair: ConceptMaterialRef;
};

export const CONCEPT_MATERIAL_LIBRARY: ConceptMaterialRef[] = [
  {
    id: "mat-floor-porcelain-light",
    name: "Porcelanato 90×90 claro",
    category: "floor",
    manufacturer: "Genérico",
    finish: "Acetinado",
    color: "#ddd9d1",
    secondaryColor: "#c8c3ba",
    edgeColor: "#a8a29e",
    gloss: 0.28,
    pattern: "tile",
  },
  {
    id: "mat-floor-concrete",
    name: "Cimento queimado claro",
    category: "floor",
    manufacturer: "Genérico",
    finish: "Acetinado",
    color: "#c8c6c0",
    secondaryColor: "#b4b1aa",
    edgeColor: "#8f8b84",
    gloss: 0.12,
    pattern: "concrete",
  },
  {
    id: "mat-floor-wood",
    name: "Madeira natural clara",
    category: "floor",
    manufacturer: "Genérico",
    finish: "Fosco",
    color: "#c9a878",
    secondaryColor: "#9f7b4e",
    edgeColor: "#785a38",
    gloss: 0.08,
    pattern: "wood",
  },
  {
    id: "mat-wall-white",
    name: "Pintura branco quente",
    category: "interior_wall",
    manufacturer: "Genérico",
    finish: "Fosco",
    color: "#eeeae1",
    secondaryColor: "#d8d2c7",
    edgeColor: "#a8a29e",
    gloss: 0.03,
    pattern: "solid",
  },
  {
    id: "mat-wall-greige",
    name: "Pintura greige",
    category: "interior_wall",
    manufacturer: "Genérico",
    finish: "Fosco",
    color: "#d6cec2",
    secondaryColor: "#bfb4a5",
    edgeColor: "#91867a",
    gloss: 0.03,
    pattern: "solid",
  },
  {
    id: "mat-exterior-white",
    name: "Reboco pintado claro",
    category: "exterior_wall",
    manufacturer: "Genérico",
    finish: "Fosco",
    color: "#e7e3db",
    secondaryColor: "#cbc5ba",
    edgeColor: "#999188",
    gloss: 0.02,
    pattern: "solid",
  },
  {
    id: "mat-exterior-concrete",
    name: "Concreto aparente",
    category: "exterior_wall",
    manufacturer: "Genérico",
    finish: "Natural",
    color: "#aaa9a5",
    secondaryColor: "#8f8f8c",
    edgeColor: "#6f706f",
    gloss: 0.04,
    pattern: "concrete",
  },
  {
    id: "mat-exterior-stone",
    name: "Pedra natural bege",
    category: "exterior_wall",
    manufacturer: "Genérico",
    finish: "Natural",
    color: "#b7a78d",
    secondaryColor: "#8f8069",
    edgeColor: "#665b4c",
    gloss: 0.02,
    pattern: "stone",
  },
  {
    id: "mat-roof-graphite",
    name: "Cobertura grafite",
    category: "roof",
    manufacturer: "Genérico",
    finish: "Fosco",
    color: "#55504e",
    secondaryColor: "#373331",
    edgeColor: "#272421",
    gloss: 0.05,
    pattern: "tile",
  },
  {
    id: "mat-roof-clay",
    name: "Telha cerâmica natural",
    category: "roof",
    manufacturer: "Genérico",
    finish: "Natural",
    color: "#9a5d43",
    secondaryColor: "#70402f",
    edgeColor: "#4d2e24",
    gloss: 0.04,
    pattern: "tile",
  },
  {
    id: "mat-stair-wood",
    name: "Degrau madeira natural",
    category: "stair",
    manufacturer: "Genérico",
    finish: "Fosco",
    color: "#b69469",
    secondaryColor: "#876744",
    edgeColor: "#5f4934",
    gloss: 0.08,
    pattern: "wood",
  },
  {
    id: "mat-stair-stone",
    name: "Degrau pedra clara",
    category: "stair",
    manufacturer: "Genérico",
    finish: "Acetinado",
    color: "#c8c1b5",
    secondaryColor: "#aaa195",
    edgeColor: "#756d64",
    gloss: 0.16,
    pattern: "stone",
  },
  {
    id: "mat-wood-freijo",
    name: "MDF Freijó Natural",
    category: "wood",
    manufacturer: "Genérico",
    finish: "Madeirado",
    color: "#ba8f5d",
    secondaryColor: "#815d37",
    edgeColor: "#5f4228",
    gloss: 0.08,
    pattern: "wood",
  },
  {
    id: "mat-stone-quartz-white",
    name: "Quartzo Branco",
    category: "stone",
    manufacturer: "Genérico",
    finish: "Polido",
    color: "#eeeae2",
    secondaryColor: "#cfcac1",
    edgeColor: "#a8a39c",
    gloss: 0.48,
    pattern: "stone",
  },
  {
    id: "mat-metal-black",
    name: "Metal preto fosco",
    category: "metal",
    manufacturer: "Genérico",
    finish: "Fosco",
    color: "#282828",
    secondaryColor: "#111111",
    edgeColor: "#050505",
    gloss: 0.12,
    pattern: "metal",
  },
  {
    id: "mat-fabric-linen",
    name: "Linho bege",
    category: "fabric",
    manufacturer: "Genérico",
    finish: "Natural",
    color: "#cdbfae",
    secondaryColor: "#aa9b89",
    edgeColor: "#7c7064",
    gloss: 0.02,
    pattern: "fabric",
  },
];

function materialById(id: string, fallbackId: string) {
  return CONCEPT_MATERIAL_LIBRARY.find((item) => item.id === id)
    ?? CONCEPT_MATERIAL_LIBRARY.find((item) => item.id === fallbackId)!;
}

export function defaultConceptMaterialScheme(): ConceptMaterialScheme {
  return {
    floor: materialById("mat-floor-porcelain-light", "mat-floor-porcelain-light"),
    floorByLevel: {},
    interiorWall: materialById("mat-wall-white", "mat-wall-white"),
    exteriorWall: materialById("mat-exterior-white", "mat-exterior-white"),
    roof: materialById("mat-roof-graphite", "mat-roof-graphite"),
    stair: materialById("mat-stair-wood", "mat-stair-wood"),
  };
}

const VALID_PATTERNS = new Set<ConceptMaterialPattern>([
  "solid", "tile", "wood", "stone", "concrete", "metal", "fabric",
]);

function cleanText(value: string | undefined) {
  const cleaned = value?.trim();
  return cleaned ? cleaned : undefined;
}

function validHexColor(value: string | undefined, fallback: string) {
  if (value && /^#[0-9a-f]{6}$/i.test(value)) return value.toLowerCase();
  return fallback;
}

export function normalizeConceptMaterialRef(
  source: Partial<ConceptMaterialRef> | undefined,
  fallback: ConceptMaterialRef,
): ConceptMaterialRef {
  return {
    id: cleanText(source?.id) ?? fallback.id,
    name: cleanText(source?.name) ?? fallback.name,
    category: source?.category ?? fallback.category,
    manufacturer: cleanText(source?.manufacturer) ?? fallback.manufacturer,
    finish: cleanText(source?.finish) ?? fallback.finish,
    color: validHexColor(source?.color, fallback.color),
    secondaryColor: source?.secondaryColor
      ? validHexColor(source.secondaryColor, fallback.secondaryColor ?? fallback.color)
      : fallback.secondaryColor,
    edgeColor: source?.edgeColor
      ? validHexColor(source.edgeColor, fallback.edgeColor ?? fallback.color)
      : fallback.edgeColor,
    gloss: Math.max(0, Math.min(1, typeof source?.gloss === "number" && Number.isFinite(source.gloss) ? source.gloss : fallback.gloss ?? 0)),
    pattern: source?.pattern && VALID_PATTERNS.has(source.pattern) ? source.pattern : fallback.pattern,
    libraryMaterialId: cleanText(source?.libraryMaterialId),
  };
}

export function normalizeConceptMaterialScheme(
  source: Partial<ConceptMaterialScheme> | undefined,
): ConceptMaterialScheme {
  const defaults = defaultConceptMaterialScheme();
  const floorByLevel = Object.fromEntries(
    Object.entries(source?.floorByLevel ?? {})
      .filter(([key]) => /^\d+$/.test(key))
      .map(([key, value]) => [
        key,
        normalizeConceptMaterialRef(value, defaults.floor),
      ]),
  );

  return {
    floor: normalizeConceptMaterialRef(source?.floor, defaults.floor),
    floorByLevel,
    interiorWall: normalizeConceptMaterialRef(source?.interiorWall, defaults.interiorWall),
    exteriorWall: normalizeConceptMaterialRef(source?.exteriorWall, defaults.exteriorWall),
    roof: normalizeConceptMaterialRef(source?.roof, defaults.roof),
    stair: normalizeConceptMaterialRef(source?.stair, defaults.stair),
  };
}

export function conceptFloorMaterial(scheme: ConceptMaterialScheme, floor: number) {
  return scheme.floorByLevel[String(floor)] ?? scheme.floor;
}

export function materialOptionsFor(
  target: "floor" | "interiorWall" | "exteriorWall" | "roof" | "stair",
) {
  const categories: Record<typeof target, ConceptMaterialCategory[]> = {
    floor: ["floor", "wood", "stone"],
    interiorWall: ["interior_wall", "wood", "stone"],
    exteriorWall: ["exterior_wall", "stone", "wood"],
    roof: ["roof", "metal"],
    stair: ["stair", "wood", "stone"],
  };
  return CONCEPT_MATERIAL_LIBRARY.filter((material) => categories[target].includes(material.category));
}

export function materialFromLibrary(
  materialId: string,
  fallback: ConceptMaterialRef,
) {
  return CONCEPT_MATERIAL_LIBRARY.find((material) => material.id === materialId) ?? fallback;
}

export function materialPrompt(material: ConceptMaterialRef) {
  return [
    material.name,
    material.manufacturer ? `manufacturer ${material.manufacturer}` : null,
    material.finish ? `${material.finish} finish` : null,
    `base color ${material.color}`,
    `pattern ${material.pattern}`,
  ].filter(Boolean).join(", ");
}

export function uniqueSchemeMaterials(scheme: ConceptMaterialScheme) {
  const all = [
    scheme.floor,
    ...Object.values(scheme.floorByLevel),
    scheme.interiorWall,
    scheme.exteriorWall,
    scheme.roof,
    scheme.stair,
  ];
  return all.filter((material, index) =>
    all.findIndex((candidate) => candidate.id === material.id) === index
  );
}
