export type ConceptObjectCategory =
  | "estar"
  | "dormitorio"
  | "jantar"
  | "cozinha"
  | "banheiro"
  | "armazenamento"
  | "trabalho"
  | "decoracao"
  | "eletro";

export type ConceptObjectSymbol =
  | "sofa"
  | "chair"
  | "table"
  | "bed"
  | "wardrobe"
  | "counter"
  | "island"
  | "toilet"
  | "sink"
  | "desk"
  | "appliance"
  | "plant"
  | "generic";

export type ConceptObjectPreset = {
  id: string;
  name: string;
  category: ConceptObjectCategory;
  symbol: ConceptObjectSymbol;
  width: number;
  depth: number;
  height: number;
  material?: string;
  color?: string;
};

export type ConceptObject = {
  id: string;
  presetId?: string;
  name: string;
  category: ConceptObjectCategory;
  symbol: ConceptObjectSymbol;
  floor: number;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  rotationDeg: number;
  locked?: boolean;
  material?: string;
  finish?: string;
  color?: string;
  componentId?: string;
  manufacturerId?: string;
  catalogProductId?: string;
};

export const CONCEPT_OBJECT_CATEGORIES: Array<{ value: ConceptObjectCategory; label: string }> = [
  { value: "estar", label: "Estar" },
  { value: "dormitorio", label: "Dormitório" },
  { value: "jantar", label: "Jantar" },
  { value: "cozinha", label: "Cozinha" },
  { value: "banheiro", label: "Banheiro" },
  { value: "armazenamento", label: "Armazenamento" },
  { value: "trabalho", label: "Trabalho" },
  { value: "decoracao", label: "Decoração" },
  { value: "eletro", label: "Eletros" },
];

export const CONCEPT_OBJECT_PRESETS: ConceptObjectPreset[] = [
  { id: "sofa-3", name: "Sofá 3 lugares", category: "estar", symbol: "sofa", width: 2.2, depth: 0.9, height: 0.85, material: "tecido", color: "neutro" },
  { id: "sofa-2", name: "Sofá 2 lugares", category: "estar", symbol: "sofa", width: 1.7, depth: 0.88, height: 0.85, material: "tecido", color: "neutro" },
  { id: "armchair", name: "Poltrona", category: "estar", symbol: "chair", width: 0.82, depth: 0.82, height: 0.88, material: "tecido" },
  { id: "coffee-table", name: "Mesa de centro", category: "estar", symbol: "table", width: 1.1, depth: 0.6, height: 0.4, material: "madeira" },
  { id: "tv-rack", name: "Rack / painel baixo", category: "armazenamento", symbol: "wardrobe", width: 1.8, depth: 0.42, height: 0.62, material: "madeira" },
  { id: "dining-4", name: "Mesa jantar 4 lugares", category: "jantar", symbol: "table", width: 1.4, depth: 0.9, height: 0.76, material: "madeira" },
  { id: "dining-6", name: "Mesa jantar 6 lugares", category: "jantar", symbol: "table", width: 1.8, depth: 0.95, height: 0.76, material: "madeira" },
  { id: "dining-chair", name: "Cadeira", category: "jantar", symbol: "chair", width: 0.48, depth: 0.52, height: 0.88, material: "madeira/tecido" },
  { id: "bed-single", name: "Cama solteiro", category: "dormitorio", symbol: "bed", width: 0.96, depth: 2.03, height: 0.55 },
  { id: "bed-double", name: "Cama casal", category: "dormitorio", symbol: "bed", width: 1.38, depth: 1.88, height: 0.58 },
  { id: "bed-queen", name: "Cama queen", category: "dormitorio", symbol: "bed", width: 1.58, depth: 1.98, height: 0.62 },
  { id: "nightstand", name: "Criado-mudo", category: "dormitorio", symbol: "wardrobe", width: 0.5, depth: 0.42, height: 0.55 },
  { id: "wardrobe", name: "Roupeiro", category: "armazenamento", symbol: "wardrobe", width: 2.2, depth: 0.62, height: 2.35, material: "MDF" },
  { id: "kitchen-counter", name: "Bancada cozinha", category: "cozinha", symbol: "counter", width: 2.4, depth: 0.62, height: 0.92, material: "pedra/MDF" },
  { id: "kitchen-island", name: "Ilha de cozinha", category: "cozinha", symbol: "island", width: 1.8, depth: 0.9, height: 0.92, material: "pedra/MDF" },
  { id: "fridge", name: "Geladeira", category: "eletro", symbol: "appliance", width: 0.78, depth: 0.75, height: 1.86 },
  { id: "stove", name: "Fogão / cooktop", category: "eletro", symbol: "appliance", width: 0.6, depth: 0.62, height: 0.9 },
  { id: "toilet", name: "Vaso sanitário", category: "banheiro", symbol: "toilet", width: 0.38, depth: 0.68, height: 0.78 },
  { id: "bath-sink", name: "Lavatório", category: "banheiro", symbol: "sink", width: 0.7, depth: 0.5, height: 0.9 },
  { id: "desk", name: "Mesa de trabalho", category: "trabalho", symbol: "desk", width: 1.4, depth: 0.65, height: 0.76, material: "madeira" },
  { id: "plant", name: "Planta decorativa", category: "decoracao", symbol: "plant", width: 0.55, depth: 0.55, height: 1.1 },
];

const CATEGORIES = new Set(CONCEPT_OBJECT_CATEGORIES.map((item) => item.value));
const SYMBOLS = new Set<ConceptObjectSymbol>([
  "sofa", "chair", "table", "bed", "wardrobe", "counter", "island", "toilet", "sink", "desk", "appliance", "plant", "generic",
]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function finiteOr(value: number | undefined, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function normalizeObjectRotation(value: number | undefined) {
  const normalized = ((finiteOr(value, 0) % 360) + 360) % 360;
  return Math.round(normalized * 10) / 10;
}

export function normalizeConceptObject(
  source: ConceptObject,
  lotWidth: number,
  lotDepth: number,
): ConceptObject {
  const width = clamp(finiteOr(source.width, 0.6), 0.15, Math.max(0.15, lotWidth));
  const depth = clamp(finiteOr(source.depth, 0.6), 0.15, Math.max(0.15, lotDepth));
  const height = clamp(finiteOr(source.height, 0.8), 0.05, 5);
  const rotationDeg = normalizeObjectRotation(source.rotationDeg);
  const radians = (rotationDeg * Math.PI) / 180;
  const bboxWidth = Math.abs(width * Math.cos(radians)) + Math.abs(depth * Math.sin(radians));
  const bboxDepth = Math.abs(width * Math.sin(radians)) + Math.abs(depth * Math.cos(radians));

  return {
    ...source,
    name: source.name?.trim() || "Objeto",
    category: CATEGORIES.has(source.category) ? source.category : "decoracao",
    symbol: SYMBOLS.has(source.symbol) ? source.symbol : "generic",
    floor: Math.max(0, Math.round(finiteOr(source.floor, 0))),
    width,
    depth,
    height,
    rotationDeg,
    x: clamp(finiteOr(source.x, 0), bboxWidth / 2, Math.max(bboxWidth / 2, lotWidth - bboxWidth / 2)),
    y: clamp(finiteOr(source.y, 0), bboxDepth / 2, Math.max(bboxDepth / 2, lotDepth - bboxDepth / 2)),
  };
}

export function createConceptObjectFromPreset(
  preset: ConceptObjectPreset,
  floor: number,
  x: number,
  y: number,
  id: string,
): ConceptObject {
  return {
    id,
    presetId: preset.id,
    name: preset.name,
    category: preset.category,
    symbol: preset.symbol,
    floor,
    x,
    y,
    width: preset.width,
    depth: preset.depth,
    height: preset.height,
    rotationDeg: 0,
    material: preset.material,
    color: preset.color,
  };
}

export function conceptObjectCorners(object: ConceptObject) {
  const halfW = object.width / 2;
  const halfD = object.depth / 2;
  const radians = (normalizeObjectRotation(object.rotationDeg) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const local = [
    { x: -halfW, y: -halfD },
    { x: halfW, y: -halfD },
    { x: halfW, y: halfD },
    { x: -halfW, y: halfD },
  ];
  return local.map((point) => ({
    x: object.x + point.x * cos - point.y * sin,
    y: object.y + point.x * sin + point.y * cos,
  }));
}

export function objectPresetById(presetId: string | undefined) {
  return CONCEPT_OBJECT_PRESETS.find((preset) => preset.id === presetId) ?? null;
}

export function objectCategoryLabel(category: ConceptObjectCategory) {
  return CONCEPT_OBJECT_CATEGORIES.find((item) => item.value === category)?.label ?? category;
}
