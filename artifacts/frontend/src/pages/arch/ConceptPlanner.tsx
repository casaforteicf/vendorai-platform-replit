import { flushSync } from "react-dom";
import { conceptReferenceSize } from "./conceptReferenceImage";
import { lazy, useEffect, useMemo, useRef, useState } from "react";
import "./planner5d-reference.css";
import {
  ArrowLeft,
  ArrowRight,
  Bath,
  BedDouble,
  CarFront,
  Check,
  ChefHat,
  Home,
  Layers3,
  Lock,
  Maximize2,
  Plus,
  RotateCcw,
  RotateCw,
  Sparkles,
  Trees,
  Waves,
  ExternalLink,
  FileText,
  Download,
  Printer,
  Send,
  Search,
  LayoutGrid,
  Camera,
  Ruler,
  Share2,
  ChevronDown,
  Heart,
  Clock3,
  Box,
  X,
  FolderOpen,
  Trash2,
  MapPin,
  DoorOpen,
  Sofa,
  Paintbrush,
} from "lucide-react";
import { buildConceptGeometry, generateLayoutVariant, nudgeOpening } from "./conceptGeometry";
import { type ConceptFacadePreferences } from "./ConceptVolumetry";
import type { ConceptPlanObject } from "./ConceptPlan2D";


import type { AIDevelopmentResponse } from "./ConceptFacadeEditor";

import { buildConceptJourney, conceptJourneyContinueLabel, conceptJourneyIndex } from "./conceptJourney";

import { DEFAULT_SITE_PLACEMENT, getBuildingBounds, migrateLegacySitePlacement, normalizeSitePlacement, resolveSiteSetbacks, type SitePlacement } from "./conceptSitePlacement";
import { type ClientBriefAlternative, type ProjectBriefSnapshot } from "./conceptClientBrief";
import type { ConceptModelLevel } from "./ConceptModel3D";
import {
  DEFAULT_FACADE_DESIGN,
  normalizeFacadeDesign,
  type FacadeDesignState,
} from "./conceptFacadeDesign";
import { buildTypologyPlan, buildTypologyRooms, CONCEPT_TYPOLOGIES, DEFAULT_LAYOUT_PREFERENCES, type ConceptTypology, type LayoutPreferences, type LayoutPreferenceKey } from "./conceptTemplates";
import { generateTypologyLayout } from "./conceptTypologyLayout";

import { inspectConceptVisualQuality } from "./conceptVisualQuality";
import { buildConceptKontextSummary, buildConceptRenderBrief, svgElementToPngDataUrl } from "./conceptRender";
import { buildOrthogonalWallTopology, detectClosedSpaces, type ClosedSpace, type WallTopologyEndpointRef } from "./conceptWallNetwork";
import { conceptStepCta, nextConceptStep, normalizeConceptStep, previousConceptStep } from "./conceptNavigation";
import { blockingConceptIssues, canAdvanceConceptLayout } from "./conceptWorkflow";
import { evaluateConceptAcceptance } from "./conceptAcceptance";
import { autoRepairConceptLayout } from "./conceptAutoRepair";
import { buildExplainableFindings } from "./conceptExplainableEvaluation";
import { clampObjectToLot, clampRoomToLot, clampWallToLot, normalizeOpeningDimensions } from "./conceptParametricEditing";

const ConceptPlan2D = lazy(() => import("./ConceptPlan2D"));
const ConceptTypologyPreview = lazy(() => import("./ConceptTypologyPreview"));
const ConceptDerivedFacade = lazy(() => import("./ConceptDerivedFacade"));
const ConceptFacadeEditor = lazy(() => import("./ConceptFacadeEditor"));
const ConceptClientBriefPanel = lazy(() => import("./ConceptClientBriefPanel"));
const ConceptSitePlacementPanel = lazy(() => import("./ConceptSitePlacementPanel"));
const ConceptModel3D = lazy(() => import("./ConceptModel3D"));
const ConceptRenderGalleryActions = lazy(() => import("./ConceptRenderGalleryActions").then((m) => ({ default: m.ConceptRenderGalleryActions })));
const ConceptCatalogPanels = lazy(() => import("./ConceptCatalogPanels"));
const ConceptConstructionLibraryPanel = lazy(() => import("./ConceptConstructionLibraryPanel"));


type RoomKind =
  | "sala"
  | "cozinha"
  | "suite"
  | "quarto"
  | "banheiro"
  | "lavanderia"
  | "garagem"
  | "gourmet"
  | "piscina"
  | "circulacao"
  | "escada"
  | "outro";

type EditorLibraryTab = "site" | "brief" | "placement" | "models" | "build" | "rooms" | "furniture" | "materials" | "outdoor";
type EditorExperienceMode = "guided" | "professional";
type ConceptProjectScope = "house" | "room";
type ConceptStartWizardStage = "kind" | "terrain" | "source";
type ConceptIntakeStage = "kind" | "terrain_choice" | "terrain_editor" | "source" | "complete";

const GUIDED_LIBRARY_FLOW: Array<{ id: EditorLibraryTab; label: string; helper: string }> = [
  { id: "site", label: "Terreno", helper: "Defina lote, frente e implantação." },
  { id: "brief", label: "Necessidades", helper: "Conte como a casa precisa funcionar." },
  { id: "placement", label: "Implantação", helper: "Posicione a casa dentro dos recuos do terreno." },
  { id: "rooms", label: "Ambientes", helper: "Revise e ajuste os cômodos sugeridos." },
  { id: "build", label: "Construir", helper: "Ajuste paredes, portas, janelas e escada." },
  { id: "furniture", label: "Mobiliar", helper: "Posicione móveis e equipamentos reais." },
  { id: "materials", label: "Acabamentos", helper: "Aplique pisos, paredes e materiais." },
  { id: "outdoor", label: "Externo", helper: "Complete jardim, lazer e área externa." },
];

type Room = {
  id: string;
  kind: RoomKind;
  label: string;
  width: number;
  depth: number;
  floor: number;
  x: number;
  y: number;
  locked?: boolean;
  floorMaterialId?: string;
};

type OpeningOverride = {
  x: number;
  y: number;
  type: "door" | "window";
};

type CustomWall = {
  id: string;
  floor: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness?: number;
};

type CustomOpening = {
  id: string;
  wallId: string;
  floor: number;
  type: "door" | "window";
  offset: number;
  width?: number;
  height?: number;
  sillHeight?: number;
  openingStyle?: "hinged" | "sliding" | "fixed" | "tilt_turn";
  swing?: "left" | "right";
  swingSide?: "inside" | "outside";
  leafCount?: number;
  frameProfile?: string;
  glassType?: string;
  manufacturer?: string;
  catalogProductId?: string;
  familyId?: string;
  familyLabel?: string;
};

type SpaceProfile = {
  id: string;
  floor: number;
  label: string;
  kind: string;
  centroid: { x: number; y: number };
  area: number;
  floorMaterialId?: string;
};

type EditorSnapshot = {
  rooms: Room[];
  customWalls: CustomWall[];
  customOpenings: CustomOpening[];
  wallFirstFloors: number[];
  openingOverrides: Record<string, OpeningOverride>;
  objects: ConceptPlanObject[];
  spaceProfiles: SpaceProfile[];
  wallMaterials: Record<string, string>;
  facadePreferences: ConceptFacadePreferences;
  facadeDesign: FacadeDesignState;
  sitePlacement: SitePlacement;
};

type ConceptSaveOverrides = {
  rooms?: Room[];
  customWalls?: CustomWall[];
  customOpenings?: CustomOpening[];
  wallFirstFloors?: number[];
  floors?: number;
  objects?: ConceptPlanObject[];
  spaceProfiles?: SpaceProfile[];
  wallMaterials?: Record<string, string>;
  facadePreferences?: ConceptFacadePreferences;
  facadeDesign?: FacadeDesignState;
  projectBrief?: ProjectBriefSnapshot;
  referencePlan?: ReferencePlan | null;
};

type CustomerProfile = {
  name?: string;
  phone?: string;
  email?: string;
  instagram?: string;
  budgetRange?: string;
  timeframe?: string;
  notes?: string;
};

type RealCatalogProduct = {
  id: string;
  nome: string;
  categoria?: string | null;
  subcategoria?: string | null;
  fornecedor?: string | null;
  precoBase?: string | number | null;
  imagens?: string[] | null;
  textureUrl?: string | null;
  model3dUrl?: string | null;
  projectLibraryEnabled?: boolean;
  especificacoes?: Record<string, unknown> | null;
};

type PolyHavenModel = {
  slug: string;
  name: string;
  description?: string;
  thumbnailUrl?: string | null;
  category?: string;
  tags?: string[];
  source: "Poly Haven";
  license: "CC0";
};

type AutoModelPreview = {
  slug: string;
  name: string;
  thumbnailUrl?: string | null;
};


function getCatalogModel3dUrl(item: RealCatalogProduct) {
  if (typeof item.model3dUrl === "string" && item.model3dUrl.trim()) return item.model3dUrl;
  const specs = item.especificacoes;
  if (!specs || typeof specs !== "object") return undefined;
  const keys = ["model3dUrl", "modelUrl", "glbUrl", "gltfUrl", "glb", "gltf", "modelo3d", "modelo_3d"];
  for (const key of keys) {
    const value = specs[key];
    if (typeof value === "string" && /^https?:\/\//i.test(value) && /\.(glb|gltf)(\?|#|$)/i.test(value)) {
      return value;
    }
  }
  return undefined;
}

function getCatalogTextureUrl(item: RealCatalogProduct) {
  if (typeof item.textureUrl === "string" && item.textureUrl.trim()) return item.textureUrl;
  const specs = item.especificacoes;
  const value = specs && typeof specs === "object" ? specs.textureUrl : null;
  return typeof value === "string" && value.trim() ? value : undefined;
}

function getCatalogPolyHavenSlug(item: RealCatalogProduct) {
  const specs = item.especificacoes;
  if (!specs || typeof specs !== "object") return undefined;
  const value = specs.polyHavenSlug;
  return typeof value === "string" && /^[a-zA-Z0-9_-]+$/.test(value) ? value : undefined;
}

function getCatalogPolyHavenQuery(item: RealCatalogProduct) {
  const specs = item.especificacoes;
  if (!specs || typeof specs !== "object") return undefined;
  const value = specs.polyHavenQuery;
  return typeof value === "string" && value.trim().length >= 2 ? value.trim().slice(0, 100) : undefined;
}

type ConceptMaterialOption = {
  id: string;
  name: string;
  category: string;
  swatch: string;
  source?: string;
  catalogProductId?: string;
};

type ProductMaterialLink = {
  id: string;
  materialId: string;
  surfaceKey: string | null;
  grupo: string | null;
  isDefault: boolean;
  precoAdicional: string | null;
  material: {
    id: string;
    nome: string;
    fabricante: string;
    linha: string;
    categoria: string;
    cor?: string | null;
    acabamento?: string | null;
    primaryImage?: {
      id: string;
      storageUrl: string;
      width?: number | null;
      height?: number | null;
      qualityScore?: string | null;
    } | null;
  } | null;
};

function getCatalogMaterialOption(item: RealCatalogProduct): ConceptMaterialOption | null {
  const specs = item.especificacoes;
  if (!specs || typeof specs !== "object" || specs.assetType !== "material") return null;
  const pbrKey = typeof specs.pbrKey === "string" ? specs.pbrKey.trim() : "";
  const swatch = typeof specs.swatch === "string" ? specs.swatch : "";
  if (!pbrKey || !/^#[0-9a-f]{6}$/i.test(swatch)) return null;
  return {
    id: pbrKey,
    name: item.nome,
    category: item.subcategoria ?? item.categoria ?? "Materiais",
    swatch,
    source: typeof specs.source === "string" ? specs.source : item.fornecedor ?? undefined,
    catalogProductId: item.id,
  };
}

function mergeMaterialOptions(
  fallback: readonly ConceptMaterialOption[],
  catalog: ConceptMaterialOption[],
) {
  const merged = new Map<string, ConceptMaterialOption>();
  for (const material of fallback) merged.set(material.id, material);
  for (const material of catalog) merged.set(material.id, material);
  return [...merged.values()];
}

function catalogDimensions(item: RealCatalogProduct) {
  const specs = item.especificacoes;
  const dims = specs && typeof specs === "object" ? specs.dimensionsM : null;
  if (!dims || typeof dims !== "object") return null;
  const record = dims as Record<string, unknown>;
  const width = Number(record.width);
  const depth = Number(record.depth);
  if (!Number.isFinite(width) || !Number.isFinite(depth) || width <= 0 || depth <= 0) return null;
  return { width, depth };
}

function catalogOpeningDimensions(item: RealCatalogProduct) {
  const specs = item.especificacoes;
  if (!specs || typeof specs !== "object") return {};
  const record = specs as Record<string, unknown>;
  const dims = record.dimensionsM && typeof record.dimensionsM === "object"
    ? record.dimensionsM as Record<string, unknown>
    : record;
  const width = Number(dims.width ?? dims.largura);
  const height = Number(dims.height ?? dims.altura);
  return {
    width: Number.isFinite(width) && width > 0 ? width : undefined,
    height: Number.isFinite(height) && height > 0 ? height : undefined,
    profile: typeof record.profile === "string"
      ? record.profile
      : typeof record.perfil === "string"
        ? record.perfil
        : undefined,
    glass: typeof record.glassType === "string"
      ? record.glassType
      : typeof record.vidro === "string"
        ? record.vidro
        : undefined,
  };
}

function catalogOpeningKind(item: RealCatalogProduct): "door" | "window" | null {
  const text = `${item.nome} ${item.categoria ?? ""} ${item.subcategoria ?? ""}`.toLocaleLowerCase("pt-BR");
  if (/porta|door|pivotante|camar[aã]o|porta de correr/.test(text)) return "door";
  if (/janela|window|maxim[- ]?ar|basculante|veneziana|esquadria/.test(text)) return "window";
  return null;
}

function inferCatalogFurniturePreset(item: RealCatalogProduct): {
  kind: ConceptPlanObject["kind"];
  width: number;
  depth: number;
} | null {
  const text = `${item.nome} ${item.categoria ?? ""} ${item.subcategoria ?? ""}`.toLocaleLowerCase("pt-BR");
  const dims = catalogDimensions(item);
  const sized = (kind: ConceptPlanObject["kind"], width: number, depth: number) => ({
    kind,
    width: dims?.width ?? width,
    depth: dims?.depth ?? depth,
  });

  if (/sofá|sofa|couch|poltrona|armchair|chaise/.test(text)) return sized("sofa", 2.1, 0.9);
  if (/cama|bed|colchão|colchao|mattress/.test(text)) return sized("bed", 1.6, 2.0);
  if (/mesa|table|desk|ilha cozinha|kitchen island/.test(text)) return sized("table", 1.4, 0.8);
  if (/cadeira|chair|banco|bench|banqueta|stool|pufe|pouf|espreguiçadeira|sun lounger/.test(text)) return sized("chair", 0.55, 0.55);
  if (/geladeira|refrigerador|refrigerator|fridge|forno|oven|micro-ondas|microondas|microwave|cooktop|coifa|range hood|lava-louças|lava louças|dishwasher|lavadora|washer|secadora|dryer/.test(text)) return sized("appliance", 0.75, 0.70);
  if (/vaso sanitário|vaso sanitario|bacia sanitária|bacia sanitaria|toilet|cuba|sink|lavatório|lavatorio|washbasin|banheira|bathtub/.test(text)) return sized("sanitary", 0.75, 0.70);
  if (/espreguiçadeira|espreguicadeira|sun lounger|ombrelone|parasol|banco externo|outdoor bench|sofá externo|sofa externo|outdoor sofa|cadeira externa|outdoor chair/.test(text)) return sized("outdoor", 0.90, 0.90);
  if (/armário|armario|cabinet|roupeiro|wardrobe|gabinete|balcão|balcao|rack|torre quente|estante|shelf|bookcase/.test(text)) return sized("cabinet", 1.2, 0.55);
  if (/televis|\btv\b|painel/.test(text)) return sized("tv", 1.6, 0.25);
  if (/planta|plant|vaso|vase|folhagem|foliage|flores|flowers|árvore|arvore|tree|palmeira|palm|arbusto|shrub/.test(text)) return sized("plant", 0.65, 0.65);
  if (/luminária|luminaria|lamp|abajur|table lamp|pendente|pendant|plafon|ceiling light|arandela|wall light|balizador/.test(text)) return sized("lamp", 0.45, 0.45);
  if (/tapete|rug|carpet/.test(text)) return sized("rug", 2.0, 1.5);
  return null;
}

type SavedTourPoint = {
  id: string;
  name: string;
  floor: number;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
};

type ReferencePlan = {
  storagePath: string;
  url: string;
  mimeType: string;
  originalName: string;
  uploadedAt: string;
  kind: "image" | "pdf";
  opacity?: number;
  fitMode?: "lot" | "calibrated";
  nativeWidth?: number | null;
  nativeHeight?: number | null;
  widthMeters?: number;
  depthMeters?: number;
  offsetX?: number;
  offsetY?: number;
  calibrationSource?: "image_aspect_fit" | "lot";
};

type ReferenceTracePreview = {
  summary: string;
  confidence: number;
  canApply: boolean;
  walls: Array<CustomWall & { confidence?: number }>;
  openings: Array<CustomOpening & { confidence?: number }>;
  warnings: string[];
  skippedWalls: number;
  sourceModel: string;
  alignmentScore?: number;
  alignmentCorrection?: {
    scale: number;
    translateX: number;
    translateY: number;
  };
  topologyRepairs?: number;
};

type ProjectSourceFile = {
  id: string;
  storagePath: string;
  url: string;
  originalName: string;
  mimeType: string;
  extension: string;
  kind: "bim" | "cad" | "model3d";
  uploadedAt: string;
  status: "stored_only" | "converted";
  parserStatus: "pending_ifc_parser" | "conversion_required" | "parsed_metadata" | "ready_model3d";
  parsedAt?: string;
  convertedAt?: string;
  conversionEngine?: string;
  model3d?: {
    storagePath: string;
    url: string;
    format: "glb" | "gltf";
  };
  manifest?: Record<string, unknown>;
  ifcMetadata?: {
    schema: string | null;
    projectName: string | null;
    unit: "m" | "mm" | "cm" | "unknown";
    storeys: Array<{ id: string; name: string | null; elevation: number | null }>;
    counts: {
      walls: number;
      doors: number;
      windows: number;
      slabs: number;
      spaces: number;
      roofs: number;
      columns: number;
      beams: number;
      stairs: number;
      furnishings: number;
      totalEntities: number;
    };
    warnings: string[];
  };
};

type ConceptDraftResponse = {
  id: string;
  status?: string;
  archProjetoId?: string | null;
  currentStep: number;
  lot: { width: number; depth: number };
  configuration: {
    floors: number;
    desiredArea: number;
    typology?: ConceptTypology;
    layoutPreferences?: LayoutPreferences;
    wallFirstFloors?: number[];
    showDimensions?: boolean;
    customWalls?: Array<{ id: string; floor: number; x1: number; y1: number; x2: number; y2: number; thickness?: number }>;
    customOpenings?: CustomOpening[];
    spaceProfiles?: SpaceProfile[];
    objects?: ConceptPlanObject[];
    wallMaterials?: Record<string, string>;
    savedTourPoints?: SavedTourPoint[];
    referencePlan?: ReferencePlan;
    sourceFiles?: ProjectSourceFile[];
    sitePlacement?: SitePlacement;
    projectBrief?: ProjectBriefSnapshot;
    projectScope?: ConceptProjectScope;
    startWithTerrain?: boolean;
    startSourceChosen?: boolean;
    intakeStage?: ConceptIntakeStage;
    terrainDefined?: boolean;
    workspaceBounds?: { width: number; depth: number };
    facadeDesign?: FacadeDesignState;
    projectMaster?: {
      version: number;
      frozenAt: string;
      links: {
        archProjetoId: string;
        obraId: string;
        budgetId: string;
        leadId: string | null;
        dealId: string | null;
      };
    };
  };
  rooms: Room[];
  openingOverrides: Record<string, OpeningOverride>;
  customerProfile?: CustomerProfile;
  facadePreferences?: ConceptFacadePreferences;
  facadeDesign?: FacadeDesignState;
  conceptRender?: {
    renderId?: string;
    status?: "idle" | "processing" | "completed" | "error";
    resultImageUrl?: string;
    generatedAt?: string;
    source?: "facade" | "model3d";
    renderView?: "exterior" | "interior";
    history?: Array<{
      renderId: string;
      canRegenerate?: boolean;
      lighting?: string | null;
      versionNumber?: number;
      resultImageUrl: string;
      generatedAt: string;
      source: "facade" | "model3d";
      renderView: "exterior" | "interior";
    }>;
    error?: string;
  };
  selectedVariant: number;
};

const STEPS = ["Terreno", "Casa", "Ambientes", "Posições", "Layout", "Fachada", "Resultado"];
const FLOW_STEPS = ["Lote", "Propostas", "Personalizar", "Resultado"];

const CONCEPT_OBJECT_MATERIALS = [
  { id: "tecido-cinza", name: "Tecido cinza", category: "Tecidos", swatch: "#cbd5e1" },
  { id: "tecido-bege", name: "Tecido bege", category: "Tecidos", swatch: "#e7e5e4" },
  { id: "linho-claro", name: "Linho claro", category: "Tecidos", swatch: "#f5f5f4" },
  { id: "madeira-clara", name: "Madeira clara", category: "Madeiras", swatch: "#d6c2a8" },
  { id: "madeira-escura", name: "Madeira escura", category: "Madeiras", swatch: "#8b6b52" },
  { id: "preto-fosco", name: "Preto fosco", category: "Lacas e metais", swatch: "#334155" },
  { id: "branco-fosco", name: "Branco fosco", category: "Lacas e metais", swatch: "#ffffff" },
  { id: "folhagem-verde", name: "Folhagem verde", category: "Vegetação", swatch: "#86a97a" },
] as const;

const CONCEPT_FLOOR_MATERIALS = [
  { id: "porcelanato-claro", name: "Porcelanato claro", category: "Porcelanatos", swatch: "#e7e5e4" },
  { id: "cimento-queimado", name: "Cimento queimado", category: "Cimentícios", swatch: "#d1d5db" },
  { id: "madeira-carvalho", name: "Carvalho natural", category: "Madeiras", swatch: "#dbc5a5" },
  { id: "madeira-nogueira", name: "Nogueira", category: "Madeiras", swatch: "#9a775d" },
  { id: "pedra-natural", name: "Pedra natural", category: "Pedras", swatch: "#d6d3d1" },
  { id: "ceramica-clara", name: "Cerâmica clara", category: "Cerâmicas", swatch: "#f5f5f4" },
  { id: "vinilico-claro", name: "Vinílico claro", category: "Vinílicos", swatch: "#e5d3b3" },
] as const;

const CONCEPT_WALL_MATERIALS = [
  { id: "pintura-branca", name: "Pintura branca", category: "Pinturas", swatch: "#f8fafc" },
  { id: "pintura-cinza", name: "Pintura cinza", category: "Pinturas", swatch: "#cbd5e1" },
  { id: "cimento-aparente", name: "Cimento aparente", category: "Cimentícios", swatch: "#9ca3af" },
  { id: "madeira-ripada", name: "Madeira ripada", category: "Madeiras", swatch: "#b98a5f" },
  { id: "pedra-cinza", name: "Pedra cinza", category: "Pedras", swatch: "#78716c" },
  { id: "preto-fosco-parede", name: "Preto fosco", category: "Pinturas", swatch: "#1f2937" },
] as const;

const CONCEPT_FURNITURE_LIBRARY: Array<{
  kind: ConceptPlanObject["kind"];
  label: string;
  width: number;
  depth: number;
  category: "Sala" | "Quarto" | "Jantar" | "Cozinha" | "Escritório" | "Decoração" | "Iluminação" | "Exterior" | "Elétrica" | "Hidráulica";
}> = [
  { kind: "sofa", label: "Sofá 3 lugares", width: 2.20, depth: 0.90, category: "Sala" },
  { kind: "sofa", label: "Sofá 2 lugares", width: 1.70, depth: 0.90, category: "Sala" },
  { kind: "chair", label: "Poltrona", width: 0.85, depth: 0.85, category: "Sala" },
  { kind: "table", label: "Mesa centro", width: 1.10, depth: 0.60, category: "Sala" },
  { kind: "tv", label: "TV / painel", width: 1.40, depth: 0.35, category: "Sala" },
  { kind: "tv", label: "Painel grande", width: 2.00, depth: 0.35, category: "Sala" },
  { kind: "bed", label: "Cama casal", width: 1.60, depth: 2.00, category: "Quarto" },
  { kind: "bed", label: "Cama solteiro", width: 0.90, depth: 1.90, category: "Quarto" },
  { kind: "cabinet", label: "Guarda-roupa", width: 1.80, depth: 0.60, category: "Quarto" },
  { kind: "table", label: "Mesa jantar", width: 1.60, depth: 0.90, category: "Jantar" },
  { kind: "chair", label: "Cadeira", width: 0.55, depth: 0.55, category: "Jantar" },
  { kind: "cabinet", label: "Balcão", width: 1.20, depth: 0.60, category: "Cozinha" },
  { kind: "cabinet", label: "Armário", width: 1.80, depth: 0.60, category: "Cozinha" },
  { kind: "appliance", label: "Geladeira", width: 0.78, depth: 0.72, category: "Cozinha" },
  { kind: "appliance", label: "Forno torre", width: 0.60, depth: 0.60, category: "Cozinha" },
  { kind: "appliance", label: "Lava-louças", width: 0.60, depth: 0.60, category: "Cozinha" },
  { kind: "sanitary", label: "Vaso sanitário", width: 0.70, depth: 0.75, category: "Hidráulica" },
  { kind: "sanitary", label: "Cuba / lavatório", width: 0.65, depth: 0.50, category: "Hidráulica" },
  { kind: "table", label: "Mesa escritório", width: 1.20, depth: 0.60, category: "Escritório" },
  { kind: "chair", label: "Cadeira escritório", width: 0.60, depth: 0.60, category: "Escritório" },
  { kind: "plant", label: "Planta em vaso", width: 0.65, depth: 0.65, category: "Decoração" },
  { kind: "plant", label: "Planta grande", width: 0.90, depth: 0.90, category: "Decoração" },
  { kind: "rug", label: "Tapete sala", width: 2.00, depth: 1.50, category: "Decoração" },
  { kind: "rug", label: "Tapete quarto", width: 1.40, depth: 0.90, category: "Decoração" },
  { kind: "lamp", label: "Luminária de piso", width: 0.45, depth: 0.45, category: "Iluminação" },
  { kind: "lamp", label: "Abajur", width: 0.35, depth: 0.35, category: "Iluminação" },
  { kind: "outlet", label: "Tomada", width: 0.40, depth: 0.40, category: "Elétrica" },
  { kind: "switch", label: "Interruptor", width: 0.40, depth: 0.40, category: "Elétrica" },
  { kind: "light_point", label: "Ponto de luz / plafon", width: 0.45, depth: 0.45, category: "Iluminação" },
  { kind: "water_point", label: "Ponto de água", width: 0.40, depth: 0.40, category: "Hidráulica" },
  { kind: "drain_point", label: "Ponto de esgoto", width: 0.40, depth: 0.40, category: "Hidráulica" },
  { kind: "shower_point", label: "Ponto de chuveiro", width: 0.45, depth: 0.45, category: "Hidráulica" },
  { kind: "faucet_point", label: "Ponto de torneira", width: 0.40, depth: 0.40, category: "Hidráulica" },
  { kind: "outdoor", label: "Espreguiçadeira", width: 0.75, depth: 1.90, category: "Exterior" },
  { kind: "outdoor", label: "Sofá externo", width: 1.90, depth: 0.85, category: "Exterior" },
  { kind: "table", label: "Mesa externa", width: 1.40, depth: 0.90, category: "Exterior" },
  { kind: "outdoor", label: "Cadeira externa", width: 0.62, depth: 0.62, category: "Exterior" },
  { kind: "plant", label: "Árvore ornamental", width: 1.40, depth: 1.40, category: "Exterior" },
  { kind: "plant", label: "Arbusto", width: 0.80, depth: 0.80, category: "Exterior" },
  { kind: "lamp", label: "Balizador jardim", width: 0.30, depth: 0.30, category: "Exterior" },
];

const DEFAULT_FACADE: ConceptFacadePreferences = {
  style: "contemporaneo",
  roof: "platibanda",
  primaryMaterial: "pintura",
  accentMaterial: "madeira",
  facadeTone: "claro",
  frameTone: "preto",
  landscaping: "medio",
};

function ConceptTypologyCardVisual({
  item,
  lotWidth,
  lotDepth,
}: {
  item: (typeof CONCEPT_TYPOLOGIES)[number];
  lotWidth: number;
  lotDepth: number;
}) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100">
      <ConceptTypologyPreview typology={item.id} lotWidth={lotWidth} lotDepth={lotDepth} />
      {item.imageUrl && (
        <img
          src={item.imageUrl}
          alt={item.imageAlt ?? `Referência visual de ${item.title}`}
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.02]"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/20 via-transparent to-transparent" />
    </div>
  );
}

const roomDefaults: Record<RoomKind, Omit<Room, "id" | "x" | "y" | "floor">> = {
  sala: { kind: "sala", label: "Sala + jantar", width: 5.5, depth: 4.5 },
  cozinha: { kind: "cozinha", label: "Cozinha", width: 3.5, depth: 3.5 },
  suite: { kind: "suite", label: "Suíte", width: 4, depth: 3.5 },
  quarto: { kind: "quarto", label: "Quarto", width: 3.2, depth: 3 },
  banheiro: { kind: "banheiro", label: "Banheiro", width: 2.4, depth: 1.5 },
  lavanderia: { kind: "lavanderia", label: "Lavanderia", width: 2.5, depth: 2 },
  garagem: { kind: "garagem", label: "Garagem 2 vagas", width: 5.8, depth: 5.5 },
  gourmet: { kind: "gourmet", label: "Gourmet", width: 4, depth: 3.5 },
  piscina: { kind: "piscina", label: "Piscina", width: 6, depth: 3 },
  circulacao: { kind: "circulacao", label: "Circulação", width: 1.2, depth: 5 },
  escada: { kind: "escada", label: "Escada", width: 2.2, depth: 3.8 },
  outro: { kind: "outro", label: "Outro ambiente", width: 3, depth: 3 },
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function finiteNumber(value: unknown, fallback: number, min?: number, max?: number) {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min ?? -Infinity, Math.min(max ?? Infinity, parsed));
}

function normalizeLoadedRooms(input: unknown, floorCount: number): Room[] {
  if (!Array.isArray(input)) return [];
  const validKinds = new Set<RoomKind>([
    "sala", "cozinha", "suite", "quarto", "banheiro", "lavanderia",
    "garagem", "gourmet", "piscina", "circulacao", "escada", "outro",
  ]);
  return normalizeDraftRooms(input.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Partial<Room>;
    const kind = validKinds.has(raw.kind as RoomKind) ? raw.kind as RoomKind : "outro";
    const defaults = roomDefaults[kind];
    return [{
      id: typeof raw.id === "string" && raw.id ? raw.id : `room-loaded-${index}-${uid()}`,
      kind,
      label: typeof raw.label === "string" && raw.label.trim() ? raw.label : defaults.label,
      width: finiteNumber(raw.width, defaults.width, 0.5, 50),
      depth: finiteNumber(raw.depth, defaults.depth, 0.5, 50),
      floor: Math.round(finiteNumber(raw.floor, 0, 0, Math.max(0, floorCount - 1))),
      x: finiteNumber(raw.x, 0, 0, 200),
      y: finiteNumber(raw.y, 0, 0, 200),
      locked: Boolean(raw.locked),
      floorMaterialId: typeof raw.floorMaterialId === "string" ? raw.floorMaterialId : undefined,
    }];
  }));
}

function normalizeLoadedObjects(input: unknown, floorCount: number): ConceptPlanObject[] {
  if (!Array.isArray(input)) return [];
  const validKinds = new Set<ConceptPlanObject["kind"]>([
    "sofa", "bed", "table", "chair", "cabinet", "tv", "plant", "lamp", "rug",
    "appliance", "sanitary", "outdoor",
    "outlet", "switch", "light_point", "water_point", "drain_point", "shower_point", "faucet_point",
  ]);
  return input.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Partial<ConceptPlanObject>;
    const kind = validKinds.has(raw.kind as ConceptPlanObject["kind"]) ? raw.kind as ConceptPlanObject["kind"] : "sofa";
    const width = finiteNumber(
      raw.width,
      kind === "sofa" ? 2.2
        : kind === "bed" ? 1.6
        : kind === "plant" ? 0.65
        : kind === "lamp" || kind === "light_point" || kind === "shower_point" ? 0.45
        : kind === "outlet" || kind === "switch" || kind === "water_point" || kind === "drain_point" || kind === "faucet_point" ? 0.40
        : kind === "rug" ? 2.0
        : 1.2,
      0.3,
      6,
    );
    const depth = finiteNumber(
      raw.depth,
      kind === "sofa" ? 0.9
        : kind === "bed" ? 2.0
        : kind === "plant" ? 0.65
        : kind === "lamp" || kind === "light_point" || kind === "shower_point" ? 0.45
        : kind === "outlet" || kind === "switch" || kind === "water_point" || kind === "drain_point" || kind === "faucet_point" ? 0.40
        : kind === "rug" ? 1.5
        : 0.8,
      0.3,
      6,
    );
    return [{
      id: typeof raw.id === "string" && raw.id ? raw.id : `object-loaded-${index}-${uid()}`,
      kind,
      label: typeof raw.label === "string" && raw.label.trim() ? raw.label : kind,
      floor: Math.round(finiteNumber(raw.floor, 0, 0, Math.max(0, floorCount - 1))),
      x: finiteNumber(raw.x, 1, 0, 100),
      y: finiteNumber(raw.y, 1, 0, 200),
      width,
      depth,
      rotation: Math.round(finiteNumber(raw.rotation, 0, -360, 360)),
      materialId: typeof raw.materialId === "string" ? raw.materialId : undefined,
      catalogProductId: typeof raw.catalogProductId === "string" ? raw.catalogProductId : undefined,
      imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl : undefined,
      supplier: typeof raw.supplier === "string" ? raw.supplier : undefined,
      price: Number.isFinite(Number(raw.price)) ? Number(raw.price) : undefined,
      model3dUrl: typeof raw.model3dUrl === "string" ? raw.model3dUrl : undefined,
    }];
  });
}

function normalizeLoadedWalls(input: unknown, floorCount: number): CustomWall[] {
  if (!Array.isArray(input)) return [];
  return input.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Partial<CustomWall>;
    const wall: CustomWall = {
      id: typeof raw.id === "string" && raw.id ? raw.id : `wall-loaded-${index}-${uid()}`,
      floor: Math.round(finiteNumber(raw.floor, 0, 0, Math.max(0, floorCount - 1))),
      x1: finiteNumber(raw.x1, 0, 0, 200),
      y1: finiteNumber(raw.y1, 0, 0, 200),
      x2: finiteNumber(raw.x2, 1, 0, 200),
      y2: finiteNumber(raw.y2, 0, 0, 200),
      thickness: finiteNumber(raw.thickness, 0.15, 0.05, 1),
    };
    return Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) >= 0.25 ? [wall] : [];
  });
}

function normalizeLoadedOpenings(input: unknown, walls: CustomWall[]): CustomOpening[] {
  if (!Array.isArray(input)) return [];
  const wallIds = new Set(walls.map((wall) => wall.id));
  return input.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Partial<CustomOpening>;
    if (typeof raw.wallId !== "string" || !wallIds.has(raw.wallId)) return [];
    const type = raw.type === "window" ? "window" : "door";
    return [{
      id: typeof raw.id === "string" && raw.id ? raw.id : `opening-loaded-${index}-${uid()}`,
      wallId: raw.wallId,
      floor: Math.round(finiteNumber(raw.floor, 0, 0, 2)),
      type,
      offset: finiteNumber(raw.offset, 0.5, 0.02, 0.98),
      width: finiteNumber(raw.width, type === "door" ? 0.9 : 1.2, 0.5, 4),
      height: finiteNumber(raw.height, type === "door" ? 2.1 : 1.2, 0.5, 2.8),
      sillHeight: type === "door" ? 0 : finiteNumber(raw.sillHeight, 0.9, 0, 2.2),
      openingStyle: ["hinged", "sliding", "fixed", "tilt_turn"].includes(String(raw.openingStyle))
        ? raw.openingStyle
        : type === "door" ? "hinged" : "sliding",
      swing: raw.swing === "right" ? "right" : "left",
      familyId: typeof raw.familyId === "string" ? raw.familyId : undefined,
      familyLabel: typeof raw.familyLabel === "string" ? raw.familyLabel : undefined,
    }];
  });
}

function createRoom(kind: RoomKind, floor = 0): Room {
  const base = roomDefaults[kind];
  return {
    ...base,
    id: uid(),
    floor,
    x: 8,
    y: 8,
  };
}

const SINGLETON_ROOM_KINDS = new Set<RoomKind>(["sala", "cozinha", "garagem", "lavanderia", "gourmet", "piscina"]);

function normalizeDraftRooms(input: Room[] | null | undefined) {
  const singletonKinds = SINGLETON_ROOM_KINDS;
  const seen = new Set<string>();
  const safeInput = Array.isArray(input) ? input : [];
  return safeInput.filter((room) => {
    if (!singletonKinds.has(room.kind)) return true;
    const key = `${room.floor}:${room.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function autoArrange(rooms: Room[], lotWidth: number, lotDepth: number, floor: number) {
  const normalizedRooms = Array.isArray(rooms) ? rooms : [];
  const floorRooms = normalizedRooms.filter((r) => r.floor === floor);
  const others = normalizedRooms.filter((r) => r.floor !== floor);
  const gap = 1;
  const result: Room[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let rowDepth = 0;

  for (const room of floorRooms) {
    if (cursorX + room.width > lotWidth && cursorX > 0) {
      cursorX = 0;
      cursorY += rowDepth + gap;
      rowDepth = 0;
    }

    result.push({
      ...room,
      x: Math.min(cursorX, Math.max(0, lotWidth - room.width)),
      y: Math.min(cursorY, Math.max(0, lotDepth - room.depth)),
    });

    cursorX += room.width + gap;
    rowDepth = Math.max(rowDepth, room.depth);
  }

  return [...others, ...result];
}

function StepPill({ index, current, label }: { index: number; current: number; label: string }) {
  const active = index === current;
  const complete = index < current;
  return (
    <div className="flex items-center gap-2">
      <div
        className={[
          "grid h-7 w-7 place-items-center rounded-full border text-xs font-bold",
          active
            ? "border-orange-500 bg-orange-500 text-white"
            : complete
              ? "border-emerald-500 bg-emerald-500 text-white"
              : "border-border bg-card text-muted-foreground",
        ].join(" ")}
      >
        {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
      </div>
      <span className={active ? "text-sm font-semibold" : "text-sm text-muted-foreground"}>{label}</span>
    </div>
  );
}

type ConceptListItem = {
  id: string;
  title: string | null;
  status: string | null;
  sentToProfessional: boolean;
  customerName: string | null;
  thumbnailUrl: string | null;
  updatedAt: string | null;
};

function conceptUrlParams() {
  if (typeof window === "undefined") return { id: null as string | null, isNew: false };
  const params = new URLSearchParams(window.location.search);
  return { id: params.get("id"), isNew: params.get("novo") === "1" };
}

// Valores internos da fachada ("rustico_contemporaneo", "medio"...) exibidos em português correto.
const FACADE_VALUE_LABELS: Record<string, string> = {
  contemporaneo: "Contemporâneo",
  minimalista: "Minimalista",
  tropical: "Tropical",
  industrial: "Industrial",
  rustico_contemporaneo: "Rústico contemporâneo",
  classico_contemporaneo: "Clássico contemporâneo",
  platibanda: "Platibanda",
  aparente: "Telhado aparente",
  misto: "Misto (platibanda + telhado)",
  pintura: "Pintura",
  madeira: "Madeira",
  pedra: "Pedra",
  concreto: "Concreto aparente",
  claro: "Claro",
  medio: "Médio",
  escuro: "Escuro",
  preto: "Preto",
  branco: "Branco",
  bronze: "Bronze",
  leve: "Leve",
  intenso: "Intenso",
};

function readableFacadeValue(value: unknown) {
  const key = String(value ?? "").trim();
  if (!key) return "—";
  if (FACADE_VALUE_LABELS[key]) return FACADE_VALUE_LABELS[key];
  const text = key.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const WORKSPACE_STEP = 4;
const RESULT_STEP = 6;

export default function ConceptPlanner({ guestMode = false, guestBrand }: {
  /** Cliente final vindo do link público: só o próprio pré-projeto, sem lista nem menu do sistema. */
  guestMode?: boolean;
  guestBrand?: string;
} = {}) {
  const [step, setStep] = useState(WORKSPACE_STEP);
  const [lotWidth, setLotWidth] = useState(12);
  const [lotDepth, setLotDepth] = useState(30);
  const [sitePlacement, setSitePlacement] = useState<SitePlacement>(DEFAULT_SITE_PLACEMENT);
  const [typology, setTypology] = useState<ConceptTypology>("terrea_3q");
  const [layoutPreferences, setLayoutPreferences] = useState<LayoutPreferences>(DEFAULT_LAYOUT_PREFERENCES);
  const [projectBrief, setProjectBrief] = useState<ProjectBriefSnapshot | null>(null);
  const [floors, setFloors] = useState(1);
  const [desiredArea, setDesiredArea] = useState(145);
  const [activeFloor, setActiveFloor] = useState(0);
  const [editorView, setEditorView] = useState<"plan" | "model3d" | "facade" | "render">("plan");
  const [editorExperienceMode, setEditorExperienceMode] = useState<EditorExperienceMode>("guided");

  useEffect(() => {
    // O pré-projeto tem só duas telas: o workspace (2D/3D/Fachada/Render) e o Resultado,
    // onde ficam o resumo, os dados do cliente e o envio ao profissional. Antes, esta
    // trava forçava tudo de volta pro workspace e o Resultado nunca abria.
    if (step !== WORKSPACE_STEP && step !== RESULT_STEP) {
      setStep(WORKSPACE_STEP);
      setEditorView("render");
    }
  }, [step]);

  const [interactionMode, setInteractionMode] = useState<"room" | "space" | "wall" | "opening" | "draw-wall" | "navigate">("navigate");
  const [rooms, setRooms] = useState<Room[]>([]);
  const roomsRef = useRef<Room[]>(rooms);
  const customWallsRef = useRef<CustomWall[]>([]);
  const customOpeningsRef = useRef<CustomOpening[]>([]);
  const wallFirstFloorsRef = useRef<number[]>([]);
  const openingOverridesRef = useRef<Record<string, OpeningOverride>>({});
  const objectsRef = useRef<ConceptPlanObject[]>([]);
  const wallMaterialsRef = useRef<Record<string, string>>({});
  const facadePreferencesRef = useRef<ConceptFacadePreferences>(DEFAULT_FACADE);
  const facadeDesignRef = useRef<FacadeDesignState>(DEFAULT_FACADE_DESIGN);
  const sitePlacementRef = useRef<SitePlacement>(DEFAULT_SITE_PLACEMENT);
  const editStartRef = useRef<EditorSnapshot | null>(null);
  const [roomHistory, setRoomHistory] = useState<EditorSnapshot[]>([]);
  const [roomFuture, setRoomFuture] = useState<EditorSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layoutVariant, setLayoutVariant] = useState(0);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedCustomWallId, setSelectedCustomWallId] = useState<string | null>(null);
  const [selectedClosedSpaceId, setSelectedClosedSpaceId] = useState<string | null>(null);
  const [customWalls, setCustomWalls] = useState<CustomWall[]>([]);
  const [customOpenings, setCustomOpenings] = useState<CustomOpening[]>([]);
  const [wallFirstFloors, setWallFirstFloors] = useState<number[]>([0]);
  const [showDimensions, setShowDimensions] = useState(true);
  const [spaceProfiles, setSpaceProfiles] = useState<SpaceProfile[]>([]);
  const [objects, setObjects] = useState<ConceptPlanObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [selectedProductMaterialLinks, setSelectedProductMaterialLinks] = useState<ProductMaterialLink[]>([]);
  const [selectedProductMaterialsLoading, setSelectedProductMaterialsLoading] = useState(false);
  const [furnishLayoutOptions, setFurnishLayoutOptions] = useState<Array<{
    id: string;
    score: number;
    objects: ConceptPlanObject[];
    doorZones: Array<{ x: number; y: number; width: number; height: number }>;
    windowZones: Array<{ x: number; y: number; width: number; height: number }>;
  }>>([]);
  const [furnishLayoutSpaceId, setFurnishLayoutSpaceId] = useState<string | null>(null);
  const [previewFurnishLayoutId, setPreviewFurnishLayoutId] = useState<string | null>(null);

  const [wallMaterials, setWallMaterials] = useState<Record<string, string>>({});
  const [paintTool, setPaintTool] = useState<null | {
    target: "object" | "wall" | "floor";
    materialId: string;
    name: string;
    swatch: string;
  }>(null);
  const [openingOverrides, setOpeningOverrides] = useState<Record<string, OpeningOverride>>({});
  const [conceptId, setConceptId] = useState<string | null>(null);
  const conceptIdRef = useRef<string | null>(null);
  const dxfImportInputRef = useRef<HTMLInputElement | null>(null);
  const referencePlanInputRef = useRef<HTMLInputElement | null>(null);
  const sourceFileInputRef = useRef<HTMLInputElement | null>(null);
  const projectStartImportInputRef = useRef<HTMLInputElement | null>(null);
  const projectStartReferenceInputRef = useRef<HTMLInputElement | null>(null);
  const navigatingAwayRef = useRef(false);
  const creatingConceptRef = useRef<Promise<string | null> | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "loading" | "saving" | "saved" | "error">("loading");
  const [aiDevelopmentState, setAiDevelopmentState] = useState<"idle" | "running" | "error">("idle");
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile>({});
  const [facadePreferences, setFacadePreferences] = useState<ConceptFacadePreferences>(DEFAULT_FACADE);
  const [facadeDesign, setFacadeDesign] = useState<FacadeDesignState>(DEFAULT_FACADE_DESIGN);
  const [conceptRender, setConceptRender] = useState<ConceptDraftResponse["conceptRender"]>({ status: "idle" });
  const [renderHistoryRevision, setRenderHistoryRevision] = useState(0);
  const [primaryRenderId, setPrimaryRenderId] = useState<string | null>(null);
  const [selectedRenderVersionId, setSelectedRenderVersionId] = useState<string | null>(null);
  const [renderQueued, setRenderQueued] = useState(false);
  const renderSubmittingRef = useRef(false);
  const [renderHistoryLoading, setRenderHistoryLoading] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [archProjetoId, setArchProjetoId] = useState<string | null>(null);
  const [projectMaster, setProjectMaster] = useState<ConceptDraftResponse["configuration"]["projectMaster"] | null>(null);
  const [handoffState, setHandoffState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const [dxfExportState, setDxfExportState] = useState<"idle" | "exporting" | "error">("idle");
  const [ifcExportState, setIfcExportState] = useState<"idle" | "exporting" | "error">("idle");
  const [dxfImportState, setDxfImportState] = useState<"idle" | "importing" | "error" | "success">("idle");
  const [dxfImportMessage, setDxfImportMessage] = useState<string | null>(null);
  const [referencePlan, setReferencePlan] = useState<ReferencePlan | null>(null);
  const [referencePlanState, setReferencePlanState] = useState<"idle" | "uploading" | "error" | "success">("idle");
  const [referencePlanMessage, setReferencePlanMessage] = useState<string | null>(null);
  const [referenceTraceState, setReferenceTraceState] = useState<"idle" | "loading" | "error" | "ready" | "applied">("idle");
  const [referenceDisplayMode, setReferenceDisplayMode] = useState<"reference" | "vector" | "overlay">("overlay");
  const [referenceTracePreview, setReferenceTracePreview] = useState<ReferenceTracePreview | null>(null);
  const resumedReferenceTraceRef = useRef<string | null>(null);
  const referenceTracePromiseRef = useRef<Promise<ReferenceTracePreview> | null>(null);
  const referenceTracePromiseKeyRef = useRef<string | null>(null);
  const [selectedTraceElement, setSelectedTraceElement] = useState<{ kind: "wall" | "opening"; id: string } | null>(null);
  const [sourceFiles, setSourceFiles] = useState<ProjectSourceFile[]>([]);
  const [sourceFileState, setSourceFileState] = useState<"idle" | "uploading" | "error" | "success">("idle");
  const [sourceFileMessage, setSourceFileMessage] = useState<string | null>(null);
  const [parsingIfcId, setParsingIfcId] = useState<string | null>(null);
  const [convertingIfcId, setConvertingIfcId] = useState<string | null>(null);
  const [convertingSketchupId, setConvertingSketchupId] = useState<string | null>(null);
  const wallFirstActive = (Array.isArray(wallFirstFloors) ? wallFirstFloors : []).includes(activeFloor);
  const [modelSearch, setModelSearch] = useState("");
  const [modelCategory, setModelCategory] = useState<"todos" | "terreas" | "sobrados" | "lazer">("todos");
  const [modelGalleryOpen, setModelGalleryOpen] = useState(false);
  const [projectListOpen, setProjectListOpen] = useState(false);
  const [publicLinkOpen, setPublicLinkOpen] = useState(false);
  const [publicLink, setPublicLink] = useState<{
    slug: string; enabled: boolean; canManage: boolean;
    showOnSite?: boolean; siteButtonLabel?: string; siteButtonColor?: string;
  } | null>(null);
  const [publicLinkState, setPublicLinkState] = useState<"idle" | "loading" | "saving" | "error">("idle");
  const [publicLinkCopied, setPublicLinkCopied] = useState<"link" | "code" | null>(null);
  const [renderLightingOverride, setRenderLightingOverride] = useState<"day" | "sunset" | "night" | null>(null);
  const [projectScope, setProjectScope] = useState<ConceptProjectScope | null>(null);
  const [startWithTerrain, setStartWithTerrain] = useState<boolean | null>(null);
  const [terrainDefined, setTerrainDefined] = useState(false);
  const [startSourceChosen, setStartSourceChosen] = useState(false);
  const [startWizardStage, setStartWizardStage] = useState<ConceptStartWizardStage>("kind");
  const [intakeStage, setIntakeStage] = useState<ConceptIntakeStage>("kind");
  const [startChooserDismissed, setStartChooserDismissed] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [projectListError, setProjectListError] = useState<string | null>(null);
  const [projectList, setProjectList] = useState<ConceptListItem[]>([]);
  const [projectListState, setProjectListState] = useState<"idle" | "loading" | "error">("idle");
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [furnitureSearch, setFurnitureSearch] = useState("");
  const [furnitureCategory, setFurnitureCategory] = useState<"Todos" | "Sala" | "Quarto" | "Jantar" | "Cozinha" | "Escritório" | "Decoração" | "Iluminação" | "Exterior">("Todos");
  const [libraryMode, setLibraryMode] = useState<"all" | "favorites" | "recent" | "project">("all");
  const [itemLibrarySection, setItemLibrarySection] = useState<"products" | "materials">("products");
  const [favoriteItemIds, setFavoriteItemIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("arqdor:library:favorites");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  });
  const [recentItemIds, setRecentItemIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = window.localStorage.getItem("arqdor:library:recent");
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
    } catch {
      return [];
    }
  });
  const [savedTourPoints, setSavedTourPoints] = useState<SavedTourPoint[]>([]);
  const [tourShareState, setTourShareState] = useState<"idle" | "sharing" | "copied" | "error">("idle");
  const [realCatalogProducts, setRealCatalogProducts] = useState<RealCatalogProduct[]>([]);
  const [openingProductPickerId, setOpeningProductPickerId] = useState<string | null>(null);
  const [realCatalogLoading, setRealCatalogLoading] = useState(false);
  const [polyHavenModels, setPolyHavenModels] = useState<PolyHavenModel[]>([]);
  const [polyHavenLoading, setPolyHavenLoading] = useState(false);
  const [polyHavenInsertSlug, setPolyHavenInsertSlug] = useState<string | null>(null);
  const [autoModelPreviews, setAutoModelPreviews] = useState<Record<string, AutoModelPreview>>({});
  const [editorLibraryTab, setEditorLibraryTab] = useState<EditorLibraryTab>("site");
  const [libraryOpen, setLibraryOpen] = useState(() => typeof window === "undefined" ? true : window.innerWidth >= 768);
  const [mobileValidationOpen, setMobileValidationOpen] = useState(false);

  useEffect(() => {
    if (projectScope === "room") {
      if (editorView === "facade") setEditorView("model3d");
      if (editorLibraryTab === "site" || editorLibraryTab === "placement" || editorLibraryTab === "outdoor") {
        setEditorLibraryTab(startSourceChosen ? "build" : "brief");
      }
      return;
    }
    if (projectScope === "house" && !terrainDefined && (editorLibraryTab === "site" || editorLibraryTab === "placement")) {
      setEditorLibraryTab(startSourceChosen ? "build" : "brief");
    }
  }, [projectScope, terrainDefined, editorView, editorLibraryTab, startSourceChosen]);

  const closeLibraryOnMobile = () => {
    if (typeof window !== "undefined" && window.innerWidth < 768) setLibraryOpen(false);
  };

  const filteredTypologies = useMemo(() => {
    const query = modelSearch.trim().toLocaleLowerCase("pt-BR");
    return CONCEPT_TYPOLOGIES.filter((item) => {
      const categoryMatch =
        modelCategory === "todos" ||
        (modelCategory === "terreas" && item.id.startsWith("terrea_")) ||
        (modelCategory === "sobrados" && item.id.startsWith("sobrado_")) ||
        (modelCategory === "lazer" && (item.id.includes("lazer") || item.rooms.some((room) => room.kind === "piscina" || room.kind === "gourmet")));

      if (!categoryMatch) return false;
      if (!query) return true;

      return `${item.title} ${item.subtitle} ${item.suggestedArea}`
        .toLocaleLowerCase("pt-BR")
        .includes(query);
    });
  }, [modelCategory, modelSearch]);

  const libraryItemKey = (label: string, category: string) => `param:${category}:${label}`;
  const realLibraryItemKey = (id: string) => `real:${id}`;

  const toggleFavoriteItem = (id: string) => {
    setFavoriteItemIds((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [id, ...current].slice(0, 80);
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem("arqdor:library:favorites", JSON.stringify(next)); } catch {}
      }
      return next;
    });
  };

  const rememberRecentItem = (id: string) => {
    setRecentItemIds((current) => {
      const next = [id, ...current.filter((item) => item !== id)].slice(0, 30);
      if (typeof window !== "undefined") {
        try { window.localStorage.setItem("arqdor:library:recent", JSON.stringify(next)); } catch {}
      }
      return next;
    });
  };

  const filteredFurniture = useMemo(() => {
    const query = furnitureSearch.trim().toLocaleLowerCase("pt-BR");
    return CONCEPT_FURNITURE_LIBRARY.filter((item) => {
      const itemId = libraryItemKey(item.label, item.category);
      const categoryMatch = furnitureCategory === "Todos" || item.category === furnitureCategory;
      const queryMatch = !query || `${item.label} ${item.category}`.toLocaleLowerCase("pt-BR").includes(query);
      const modeMatch = libraryMode === "all"
        || (libraryMode === "favorites" && favoriteItemIds.includes(itemId))
        || (libraryMode === "recent" && recentItemIds.includes(itemId));
      return libraryMode !== "project" && categoryMatch && queryMatch && modeMatch;
    }).sort((a, b) => {
      if (libraryMode !== "recent") return 0;
      const aIndex = recentItemIds.indexOf(libraryItemKey(a.label, a.category));
      const bIndex = recentItemIds.indexOf(libraryItemKey(b.label, b.category));
      return aIndex - bIndex;
    });
  }, [favoriteItemIds, furnitureCategory, furnitureSearch, libraryMode, recentItemIds]);

  useEffect(() => {
    if (editorLibraryTab !== "furniture") return;
    const categoryQuery: Record<typeof furnitureCategory, string> = {
      Todos: "modern furniture",
      Sala: "sofa armchair living room",
      Quarto: "bed wardrobe bedroom",
      Jantar: "dining table chair",
      Cozinha: "kitchen cabinet appliance",
      Escritório: "office desk chair",
      Decoração: "decor vase plant rug",
      Iluminação: "lamp lighting",
      Exterior: "outdoor furniture garden",
    };
    const query = furnitureSearch.trim() || categoryQuery[furnitureCategory];
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setPolyHavenLoading(true);
      fetch(`/api/arch/polyhaven/search?q=${encodeURIComponent(query)}&limit=12`)
        .then(async (response) => response.ok ? response.json() : { items: [] })
        .then((payload) => {
          if (!cancelled) setPolyHavenModels(Array.isArray(payload?.items) ? payload.items : []);
        })
        .catch(() => {
          if (!cancelled) setPolyHavenModels([]);
        })
        .finally(() => {
          if (!cancelled) setPolyHavenLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [editorLibraryTab, furnitureCategory, furnitureSearch]);

  useEffect(() => {
    if (!["furniture", "materials"].includes(editorLibraryTab) || realCatalogProducts.length || realCatalogLoading) return;
    let cancelled = false;
    setRealCatalogLoading(true);
    fetch("/api/arch/catalogo?limit=240")
      .then(async (response) => response.ok ? response.json() : [])
      .then((rows) => {
        if (cancelled) return;
        const products = Array.isArray(rows)
          ? rows.filter((item): item is RealCatalogProduct =>
              Boolean(item && typeof item === "object" && typeof item.nome === "string")
            )
          : [];
        setRealCatalogProducts(products);
      })
      .catch(() => {
        if (!cancelled) setRealCatalogProducts([]);
      })
      .finally(() => {
        if (!cancelled) setRealCatalogLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editorLibraryTab, realCatalogProducts.length, realCatalogLoading]);

  const visibleRealCatalogProducts = useMemo(() => {
    const query = furnitureSearch.trim().toLocaleLowerCase("pt-BR");
    const categoryRegex: Partial<Record<typeof furnitureCategory, RegExp>> = {
      Sala: /sofá|sofa|poltrona|chaise|rack|painel|televis|tv|mesa de centro/,
      Quarto: /cama|colchão|colchao|roupeiro|guarda-roupa|criado|cabeceira/,
      Jantar: /mesa|cadeira|banco|banqueta/,
      Cozinha: /cozinha|balcão|balcao|gabinete|armário|armario|ilha|geladeira|refrigerador|forno|micro-ondas|microondas|cooktop|coifa/,
      Escritório: /escritório|escritorio|office|home office|cadeira/,
      Decoração: /decora|tapete|vaso|planta|folhagem|flores|quadro|espelho/,
      Iluminação: /luminária|luminaria|abajur|pendente|plafon|arandela/,
      Exterior: /extern|outdoor|jardim|garden|espreguiçadeira|paisag|varanda|deck/,
    };
    return realCatalogProducts.filter((item) => {
      if (item.projectLibraryEnabled === false) return false;
      if (!inferCatalogFurniturePreset(item)) return false;
      const text = `${item.nome} ${item.categoria ?? ""} ${item.subcategoria ?? ""} ${item.fornecedor ?? ""}`
        .toLocaleLowerCase("pt-BR");
      const queryMatch = !query || text.includes(query);
      const itemId = realLibraryItemKey(item.id);
      const categoryMatch = furnitureCategory === "Todos" || categoryRegex[furnitureCategory]?.test(text) === true;
      const modeMatch = libraryMode === "all"
        || (libraryMode === "favorites" && favoriteItemIds.includes(itemId))
        || (libraryMode === "recent" && recentItemIds.includes(itemId));
      return queryMatch && categoryMatch && modeMatch;
    }).sort((a, b) => {
      if (libraryMode !== "recent") return 0;
      return recentItemIds.indexOf(realLibraryItemKey(a.id)) - recentItemIds.indexOf(realLibraryItemKey(b.id));
    }).slice(0, 24);
  }, [favoriteItemIds, furnitureCategory, furnitureSearch, libraryMode, realCatalogProducts, recentItemIds]);

  useEffect(() => {
    if (editorLibraryTab !== "furniture") return;

    const queries = [...new Set(
      visibleRealCatalogProducts
        .filter((item) =>
          !item.imagens?.[0]
          && !getCatalogModel3dUrl(item)
          && !getCatalogPolyHavenSlug(item)
          && getCatalogPolyHavenQuery(item)
        )
        .map((item) => getCatalogPolyHavenQuery(item)!)
    )]
      .filter((query) => !autoModelPreviews[query])
      .slice(0, 8);

    if (!queries.length) return;

    let cancelled = false;
    void Promise.all(
      queries.map(async (query) => {
        try {
          const response = await fetch(`/api/arch/polyhaven/search?q=${encodeURIComponent(query)}&limit=1`);
          if (!response.ok) return [query, null] as const;
          const payload = await response.json();
          const first = Array.isArray(payload?.items) ? payload.items[0] : null;
          if (!first || typeof first.slug !== "string") return [query, null] as const;
          return [query, {
            slug: first.slug,
            name: typeof first.name === "string" ? first.name : query,
            thumbnailUrl: typeof first.thumbnailUrl === "string" ? first.thumbnailUrl : null,
          } satisfies AutoModelPreview] as const;
        } catch {
          return [query, null] as const;
        }
      })
    ).then((entries) => {
      if (cancelled) return;
      setAutoModelPreviews((current) => {
        const next = { ...current };
        for (const [query, preview] of entries) {
          if (preview) next[query] = preview;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [autoModelPreviews, editorLibraryTab, visibleRealCatalogProducts]);

  const catalogMaterialOptions = useMemo(
    () => realCatalogProducts
      .map(getCatalogMaterialOption)
      .filter((item): item is ConceptMaterialOption => Boolean(item)),
    [realCatalogProducts],
  );

  const objectMaterialOptions = useMemo(() => {
    const compatible = catalogMaterialOptions.filter((material) =>
      /madeira|mdf|metal|aço|aco|vidro|tecido|linho|boucl|couro|marcenaria/i.test(material.category + " " + material.name)
    );
    return mergeMaterialOptions(CONCEPT_OBJECT_MATERIALS, compatible);
  }, [catalogMaterialOptions]);

  const wallMaterialOptions = useMemo(() => {
    const compatible = catalogMaterialOptions.filter((material) =>
      /pintura|tinta|madeira|ripad|pedra|cimento|ciment|revestimento|mármore|marmore|granito/i.test(material.category + " " + material.name)
    );
    return mergeMaterialOptions(CONCEPT_WALL_MATERIALS, compatible);
  }, [catalogMaterialOptions]);

  const floorMaterialOptions = useMemo(() => {
    const compatible = catalogMaterialOptions.filter((material) =>
      /piso|porcelanato|cerâmica|ceramica|vinílico|vinilico|laminado|madeira|pedra|granito|mármore|marmore|cimento|deck|drenante/i.test(material.category + " " + material.name)
    );
    return mergeMaterialOptions(CONCEPT_FLOOR_MATERIALS, compatible);
  }, [catalogMaterialOptions]);

  useEffect(() => {
    roomsRef.current = Array.isArray(rooms) ? rooms : [];
  }, [rooms]);

  useEffect(() => {
    customWallsRef.current = Array.isArray(customWalls) ? customWalls : [];
  }, [customWalls]);

  useEffect(() => {
    customOpeningsRef.current = Array.isArray(customOpenings) ? customOpenings : [];
  }, [customOpenings]);

  useEffect(() => {
    wallFirstFloorsRef.current = Array.isArray(wallFirstFloors) ? wallFirstFloors : [];
  }, [wallFirstFloors]);

  useEffect(() => {
    objectsRef.current = Array.isArray(objects) ? objects : [];
  }, [objects]);

  useEffect(() => {
    wallMaterialsRef.current = wallMaterials && typeof wallMaterials === "object" ? wallMaterials : {};
  }, [wallMaterials]);

  useEffect(() => {
    openingOverridesRef.current = openingOverrides;
  }, [openingOverrides]);

  useEffect(() => {
    facadePreferencesRef.current = facadePreferences;
  }, [facadePreferences]);

  useEffect(() => {
    facadeDesignRef.current = facadeDesign;
  }, [facadeDesign]);

  useEffect(() => {
    sitePlacementRef.current = sitePlacement;
  }, [sitePlacement]);

  // Etapa 98: qualquer redução do lote mantém toda geometria editável dentro dos limites,
  // sem trocar IDs, relações ou reiniciar o projeto.
  useEffect(() => {
    setRooms((current) => (Array.isArray(current) ? current : []).map((room) =>
      clampRoomToLot(room, lotWidth, lotDepth)
    ));
    setCustomWalls((current) => (Array.isArray(current) ? current : []).map((wall) =>
      clampWallToLot(wall, lotWidth, lotDepth)
    ));
    setObjects((current) => (Array.isArray(current) ? current : []).map((object) =>
      clampObjectToLot(object, lotWidth, lotDepth)
    ));
  }, [lotWidth, lotDepth]);

  useEffect(() => {
    let cancelled = false;

    const loadLatest = async () => {
      try {
        const { id: requestedId } = conceptUrlParams();
        // A rota principal /arch/concept sempre inicia um novo pré-projeto.
        // Projetos existentes só são reabertos quando há um id explícito,
        // normalmente vindo da lista/pasta de projetos.
        if (!requestedId) {
          if (!cancelled) {
            setConceptId(null);
            conceptIdRef.current = null;
            setProjectScope(null);
            setStartWithTerrain(null);
            setTerrainDefined(false);
            setStartSourceChosen(false);
            setStartWizardStage("kind");
            setIntakeStage("kind");
            setStartChooserDismissed(false);
            setSaveState("idle");
          }
          return;
        }
        const response = await fetch(
          `/api/arch/concept-projects/${encodeURIComponent(requestedId)}`,
        );
        if (!response.ok) throw new Error("Falha ao carregar pré-projeto");
        const draft = (await response.json()) as ConceptDraftResponse | null;
        if (cancelled || !draft) {
          if (!cancelled) setSaveState("idle");
          return;
        }

        conceptIdRef.current = draft.id;
        setConceptId(draft.id);
        setArchProjetoId(draft.archProjetoId ?? null);
        setProjectMaster(draft.configuration?.projectMaster ?? null);
        if (draft.archProjetoId) setHandoffState("sent");
        // /arch/concept is now a single workspace: always reopen inside the editor.
        // Legacy wizard steps remain only for migration compatibility and are not restored.
        setStep(4);
        setEditorView("plan");
        const loadedFloors = Math.round(finiteNumber(draft.configuration?.floors, 1, 1, 3));
        const loadedWalls = normalizeLoadedWalls(draft.configuration?.customWalls, loadedFloors);
        const loadedOpenings = normalizeLoadedOpenings(draft.configuration?.customOpenings, loadedWalls);
        const loadedRooms = normalizeLoadedRooms(draft.rooms, loadedFloors);

        setLotWidth(finiteNumber(draft.lot?.width, 12, 5, 100));
        setLotDepth(finiteNumber(draft.lot?.depth, 30, 10, 200));
        setFloors(loadedFloors);
        setActiveFloor((current) => Math.min(Math.max(0, current), loadedFloors - 1));
        setDesiredArea(finiteNumber(draft.configuration?.desiredArea, 145, 20, 2000));
        setTypology(CONCEPT_TYPOLOGIES.some((item) => item.id === draft.configuration?.typology)
          ? draft.configuration?.typology as ConceptTypology
          : "terrea_3q");
        setLayoutPreferences({ ...DEFAULT_LAYOUT_PREFERENCES, ...(draft.configuration?.layoutPreferences ?? {}) });
        setWallFirstFloors(
          Array.isArray(draft.configuration?.wallFirstFloors) && draft.configuration.wallFirstFloors.length
            ? draft.configuration.wallFirstFloors
                .map((floor) => Math.round(finiteNumber(floor, 0, 0, loadedFloors - 1)))
                .filter((floor, index, values) => values.indexOf(floor) === index)
            : loadedRooms.length
              ? []
              : [0],
        );
        setShowDimensions(draft.configuration?.showDimensions ?? true);
        setCustomWalls(loadedWalls);
        setCustomOpenings(loadedOpenings);
        setSpaceProfiles(Array.isArray(draft.configuration?.spaceProfiles) ? draft.configuration.spaceProfiles : []);
        setObjects(normalizeLoadedObjects(draft.configuration?.objects, loadedFloors));
        setWallMaterials(draft.configuration?.wallMaterials && typeof draft.configuration.wallMaterials === "object" ? draft.configuration.wallMaterials : {});
        setSavedTourPoints(Array.isArray(draft.configuration?.savedTourPoints) ? draft.configuration.savedTourPoints : []);
        setReferencePlan(draft.configuration?.referencePlan ?? null);
        setSourceFiles(Array.isArray(draft.configuration?.sourceFiles) ? draft.configuration.sourceFiles : []);
        setSitePlacement(migrateLegacySitePlacement(draft.configuration?.sitePlacement));
        setProjectBrief(draft.configuration?.projectBrief ?? null);
        const loadedScope = draft.configuration?.projectScope;
        const loadedStartWithTerrain = typeof draft.configuration?.startWithTerrain === "boolean"
          ? draft.configuration.startWithTerrain
          : null;
        const loadedStartSourceChosen = Boolean(draft.configuration?.startSourceChosen);
        const savedIntakeStage = draft.configuration?.intakeStage;
        const migratedIntakeStage: ConceptIntakeStage =
          savedIntakeStage === "kind" ||
          savedIntakeStage === "terrain_choice" ||
          savedIntakeStage === "terrain_editor" ||
          savedIntakeStage === "source" ||
          savedIntakeStage === "complete"
            ? savedIntakeStage
            : loadedStartSourceChosen
              ? "complete"
              : loadedScope === "room"
                ? "source"
                : loadedScope === "house" && loadedStartWithTerrain === true
                  ? "terrain_editor"
                  : loadedScope === "house" && loadedStartWithTerrain === false
                    ? "source"
                    : loadedScope === "house"
                      ? "terrain_choice"
                      : "kind";

        setProjectScope(loadedScope === "house" || loadedScope === "room" ? loadedScope : null);
        setStartWithTerrain(loadedStartWithTerrain);
        setTerrainDefined(
          typeof draft.configuration?.terrainDefined === "boolean"
            ? draft.configuration.terrainDefined
            : loadedScope === "house" && loadedStartWithTerrain === true,
        );
        setStartSourceChosen(loadedStartSourceChosen);
        setIntakeStage(migratedIntakeStage);
        setStartWizardStage(
          migratedIntakeStage === "terrain_choice"
            ? "terrain"
            : migratedIntakeStage === "source"
              ? "source"
              : "kind",
        );
        setStartChooserDismissed(
          migratedIntakeStage === "terrain_editor" || migratedIntakeStage === "complete",
        );
        setRooms(loadedRooms);
        setOpeningOverrides(draft.openingOverrides && typeof draft.openingOverrides === "object" ? draft.openingOverrides : {});
        setCustomerProfile(draft.customerProfile ?? {});
        // Rascunhos antigos podem ter só parte dos campos; completar evita quebrar a tela de Resultado.
        setFacadePreferences({ ...DEFAULT_FACADE, ...(draft.facadePreferences ?? {}) });
        setFacadeDesign(normalizeFacadeDesign(draft.configuration?.facadeDesign ?? draft.facadeDesign));
        setConceptRender(draft.conceptRender ?? { status: "idle" });
        setLayoutVariant(draft.selectedVariant ?? 0);
        setSaveState("saved");
      } catch {
        // A falha ao recuperar um rascunho anterior não significa que o novo projeto
        // não pode ser salvo. Evita exibir um falso "Não foi possível salvar" ao abrir.
        if (!cancelled) setSaveState("idle");
      }
    };

    void loadLatest();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveConcept = async (
    stepOverride?: number,
    savedTourPointsOverride?: SavedTourPoint[],
    overrides?: ConceptSaveOverrides,
  ) => {
    if (projectMaster) {
      setSaveState("saved");
      return conceptIdRef.current ?? conceptId;
    }
    setSaveState("saving");
    const nextRooms = overrides?.rooms ?? rooms;
    const nextCustomWalls = overrides?.customWalls ?? customWalls;
    const nextCustomOpenings = overrides?.customOpenings ?? customOpenings;
    const nextWallFirstFloors = overrides?.wallFirstFloors ?? wallFirstFloors;
    const nextFloors = overrides?.floors ?? floors;
    const nextObjects = overrides?.objects ?? objects;
    const nextSpaceProfiles = overrides?.spaceProfiles ?? spaceProfiles;
    const nextWallMaterials = overrides?.wallMaterials ?? wallMaterials;
    const nextFacadePreferences = overrides?.facadePreferences ?? facadePreferences;
    const nextFacadeDesign = overrides?.facadeDesign ?? facadeDesign;
    const nextProjectBrief = overrides?.projectBrief ?? projectBrief;
    const nextReferencePlan = overrides && Object.prototype.hasOwnProperty.call(overrides, "referencePlan")
      ? overrides.referencePlan
      : referencePlan;
    const payload = {
      title: customerProfile.name?.trim() ? `Pré-projeto — ${customerProfile.name.trim()}` : "Meu pré-projeto",
      currentStep: stepOverride ?? step,
      lot: { width: lotWidth, depth: lotDepth },
      configuration: {
        floors: nextFloors,
        desiredArea,
        typology,
        layoutPreferences,
        wallFirstFloors: nextWallFirstFloors,
        showDimensions,
        customWalls: nextCustomWalls,
        customOpenings: nextCustomOpenings,
        spaceProfiles: nextSpaceProfiles,
        objects: nextObjects,
        wallMaterials: nextWallMaterials,
        savedTourPoints: savedTourPointsOverride ?? savedTourPoints,
        referencePlan: nextReferencePlan ?? undefined,
        sourceFiles,
        sitePlacement,
        projectBrief: nextProjectBrief ?? undefined,
        projectScope: projectScope ?? undefined,
        startWithTerrain: startWithTerrain ?? undefined,
        startSourceChosen,
        intakeStage,
        terrainDefined,
        workspaceBounds: { width: lotWidth, depth: lotDepth },
        facadeDesign: nextFacadeDesign,
      },
      rooms: nextRooms,
      openingOverrides,
      customerProfile,
      facadePreferences: nextFacadePreferences,
      facadeDesign: nextFacadeDesign,
      conceptRender,
      selectedVariant: layoutVariant,
    };

    // Dois salvamentos simultâneos num pré-projeto novo criavam dois registros (dois POST).
    // Se já existe uma criação em andamento, espera ela terminar e salva por PATCH.
    if (!conceptIdRef.current && !conceptId && creatingConceptRef.current) {
      await creatingConceptRef.current.catch(() => null);
    }
    const targetId = conceptIdRef.current ?? conceptId;

    const request = (async () => {
      const response = await fetch(
        targetId ? `/api/arch/concept-projects/${targetId}` : "/api/arch/concept-projects",
        {
          method: targetId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw new Error("Falha ao salvar pré-projeto");
      const saved = (await response.json()) as ConceptDraftResponse;
      conceptIdRef.current = saved.id;
      setConceptId(saved.id);
      if (!targetId && typeof window !== "undefined") {
        // O intakeStage é persistido; portanto recarregar com ?id= retoma exatamente a etapa
        // correta do onboarding sem confundir autosave com onboarding concluído.
        window.history.replaceState(null, "", `/arch/concept?id=${encodeURIComponent(saved.id)}`);
      }
      return saved.id;
    })();
    if (!targetId) creatingConceptRef.current = request;

    try {
      const savedId = await request;
      setSaveState("saved");
      return savedId;
    } catch {
      setSaveState("error");
      return null;
    } finally {
      if (creatingConceptRef.current === request) creatingConceptRef.current = null;
    }
  };

  // Salvamento automático: antes o trabalho só era gravado ao tocar no ✓ (sem nenhum
  // retorno visual) ou em algumas ações pontuais — fechar o app no celular perdia a edição.
  const autosaveKey = useMemo(() => JSON.stringify([
    rooms, customWalls, customOpenings, objects, openingOverrides, wallMaterials,
    lotWidth, lotDepth, floors, desiredArea, typology, layoutPreferences, sitePlacement, projectBrief,
    projectScope, startWithTerrain, terrainDefined, startSourceChosen, intakeStage,
    facadePreferences, spaceProfiles, customerProfile, showDimensions, wallFirstFloors,
  ]), [
    rooms, customWalls, customOpenings, objects, openingOverrides, wallMaterials,
    lotWidth, lotDepth, floors, desiredArea, typology, layoutPreferences, sitePlacement, projectBrief,
    projectScope, startWithTerrain, terrainDefined, startSourceChosen, intakeStage,
    facadePreferences, spaceProfiles, customerProfile, showDimensions, wallFirstFloors,
  ]);
  const [lastSavedKey, setLastSavedKey] = useState<string | null>(null);
  const hasUnsavedChanges = lastSavedKey !== null && lastSavedKey !== autosaveKey;

  useEffect(() => {
    if (saveState === "loading" || projectMaster) return;
    if (lastSavedKey === null) {
      setLastSavedKey(autosaveKey);
      return;
    }
    if (autosaveKey === lastSavedKey) return;
    const delay = saveState === "error" ? 15000 : 2500;
    const timer = setTimeout(() => {
      const keyBeingSaved = autosaveKey;
      void saveConcept().then((savedId) => {
        setLastSavedKey(savedId ? keyBeingSaved : "__falha__");
      });
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autosaveKey, lastSavedKey, saveState]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (navigatingAwayRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  const saveStatusLabel = saveState === "saving"
    ? "Salvando…"
    : saveState === "error"
      ? "Erro ao salvar"
      : hasUnsavedChanges
        ? "Alterações não salvas"
        : saveState === "saved"
          ? "Salvo"
          : "";


  const startContactValid =
    (customerProfile.name ?? "").trim().length >= 2 &&
    (
      (customerProfile.phone ?? "").replace(/\D/g, "").length >= 10 ||
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((customerProfile.email ?? "").trim())
    );

  const journeyStages = useMemo(
    () => buildConceptJourney({ scope: projectScope, terrainDefined }),
    [projectScope, terrainDefined],
  );
  const journeyIndex = conceptJourneyIndex({
    step,
    editorView,
    libraryTab: editorLibraryTab,
    scope: projectScope,
    terrainDefined,
  });

  const goToJourneyStage = (index: number) => {
    if (index > journeyIndex && blockingLayoutIssues.length > 0) {
      setMobileValidationOpen(true);
      return;
    }
    const isWide = typeof window !== "undefined" && window.innerWidth >= 768;
    const stage = journeyStages[Math.max(0, Math.min(index, journeyStages.length - 1))];
    if (!stage || stage.id === "send") {
      void saveConcept(RESULT_STEP);
      setStep(RESULT_STEP);
      window.scrollTo({ top: 0 });
      return;
    }

    setStep(WORKSPACE_STEP);

    if (stage.id === "terrain") {
      setEditorView("plan");
      setEditorLibraryTab("site");
      setLibraryOpen(true);
      return;
    }

    if (stage.id === "brief") {
      setEditorView("plan");
      setEditorLibraryTab("brief");
      setLibraryOpen(true);
      return;
    }

    if (stage.id === "plan") {
      setEditorView("plan");
      setEditorLibraryTab(editorExperienceMode === "professional" ? "build" : (projectScope === "room" ? "rooms" : "build"));
      setLibraryOpen(true);
      if (projectScope === "house" && intakeStage === "terrain_editor") {
        setIntakeStage("source");
        setStartWizardStage("source");
        setStartChooserDismissed(false);
      }
      return;
    }

    if (stage.id === "decorate" || stage.id === "adjustments") {
      setEditorView("plan");
      setEditorLibraryTab(stage.id === "decorate" ? "furniture" : "build");
      setLibraryOpen(isWide);
      return;
    }

    if (stage.id === "render") {
      setEditorView("model3d");
      setLibraryOpen(false);
      return;
    }

    // Casa: visual = fachada/3D. Ambiente nunca entra no editor de fachada.
    setEditorView(projectScope === "room" ? "model3d" : "facade");
    setLibraryOpen(false);
  };

  const publicLinkUrl = publicLink ? `${window.location.origin}/projeto/${publicLink.slug}` : "";
  const publicLinkEmbed = publicLink
    ? `<a href="${publicLinkUrl}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 22px;border-radius:12px;background:${publicLink.siteButtonColor ?? "#f97316"};color:#fff;font-weight:600;text-decoration:none;font-family:sans-serif">${(publicLink.siteButtonLabel ?? "Projete sua casa").replace(/[<>&"]/g, "")}</a>`
    : "";

  const loadPublicLink = async () => {
    setPublicLinkState("loading");
    try {
      const response = await fetch("/api/arch/public-link", { cache: "no-store" });
      if (!response.ok) throw new Error();
      setPublicLink(await response.json());
      setPublicLinkState("idle");
    } catch {
      setPublicLinkState("error");
    }
  };

  // Salva sempre a configuração completa: ligar/desligar o link não pode apagar a escolha do
  // botão no site (e vice-versa).
  const savePublicLink = async (patch: { enabled?: boolean; showOnSite?: boolean; siteButtonLabel?: string; siteButtonColor?: string }) => {
    if (!publicLink) return;
    const next = { ...publicLink, ...patch };
    setPublicLinkState("saving");
    try {
      const response = await fetch("/api/arch/public-link", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: next.enabled,
          showOnSite: Boolean(next.showOnSite),
          siteButtonLabel: next.siteButtonLabel ?? "Projete sua casa",
          siteButtonColor: next.siteButtonColor ?? "#f97316",
        }),
      });
      if (!response.ok) throw new Error();
      const saved = await response.json();
      setPublicLink((prev) => (prev ? { ...prev, ...saved } : prev));
      setPublicLinkState("idle");
    } catch {
      setPublicLinkState("error");
    }
  };
  const togglePublicLink = (enabled: boolean) => savePublicLink({ enabled });

  const copyPublicLink = async (kind: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(kind === "link" ? publicLinkUrl : publicLinkEmbed);
      setPublicLinkCopied(kind);
      setTimeout(() => setPublicLinkCopied(null), 2000);
    } catch {
      setPublicLinkCopied(null);
    }
  };

  const loadProjectList = async () => {
    setProjectListState("loading");
    try {
      const response = await fetch("/api/arch/concept-projects", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const rows = (await response.json()) as ConceptListItem[];
      setProjectList(Array.isArray(rows) ? rows : []);
      setProjectListState("idle");
    } catch {
      setProjectListState("error");
    }
  };

  const openProjectList = () => {
    setProjectListOpen(true);
    void loadProjectList();
  };

  const goToConcept = async (target: { id?: string; isNew?: boolean }) => {
    // Grava o que estiver pendente antes de trocar de pré-projeto.
    if (hasUnsavedChanges || saveState === "error") {
      const saved = await saveConcept();
      if (!saved) return;
      setLastSavedKey(autosaveKey);
    }
    navigatingAwayRef.current = true;
    window.location.assign(target.isNew ? "/arch/concept?novo=1" : `/arch/concept?id=${encodeURIComponent(target.id ?? "")}`);
  };

  const deleteConceptFromList = async (item: ConceptListItem) => {
    setDeletingProjectId(item.id);
    setProjectListError(null);
    try {
      const response = await fetch(`/api/arch/concept-projects/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setProjectListError((body as { error?: string }).error ?? "Não foi possível excluir.");
        return;
      }
      if (item.id === (conceptIdRef.current ?? conceptId)) {
        navigatingAwayRef.current = true;
        window.location.assign("/arch/concept?novo=1");
        return;
      }
      setProjectList((prev) => prev.filter((row) => row.id !== item.id));
    } catch {
      setProjectListError("Sem conexão. Tente de novo.");
    } finally {
      setDeletingProjectId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleFacadeDesignChange = (next: FacadeDesignState) => {
    const before = snapshotEditor();
    facadeDesignRef.current = next;
    setFacadeDesign(next);
    pushRoomHistory(before);
    void saveConcept(4, undefined, { facadeDesign: next });
  };

  const handleFacadePreferencesChange = (next: ConceptFacadePreferences) => {
    const before = snapshotEditor();
    facadePreferencesRef.current = next;
    setFacadePreferences(next);
    pushRoomHistory(before);
    void saveConcept(4, undefined, { facadePreferences: next });
  };

  const handleSitePlacementChange = (next: SitePlacement) => {
    const normalized = normalizeSitePlacement(next);
    const before = snapshotEditor();
    sitePlacementRef.current = normalized;
    setSitePlacement(normalized);
    pushRoomHistory(before);
  };

  const applyAiDevelopment = async (result: AIDevelopmentResponse) => {
    const before = snapshotEditor();
    const roomPatchById = new Map(
      (result.layoutSuggestion?.roomPatches ?? []).map((patch) => [patch.id, patch]),
    );

    const nextRooms = safeRooms.map((room) => {
      const patch = roomPatchById.get(room.id);
      if (!patch || room.locked) return room;
      const width = Math.max(0.8, Math.min(lotWidth, Number(patch.width) || room.width));
      const depth = Math.max(0.8, Math.min(lotDepth, Number(patch.depth) || room.depth));
      const x = Math.max(0, Math.min(Math.max(0, lotWidth - width), Number(patch.x) || 0));
      const y = Math.max(0, Math.min(Math.max(0, lotDepth - depth), Number(patch.y) || 0));
      return {
        ...room,
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100,
        width: Math.round(width * 100) / 100,
        depth: Math.round(depth * 100) / 100,
      };
    });

    const existingWallIds = new Set(safeCustomWalls.map((wall) => wall.id));
    const nextWalls = [...safeCustomWalls];
    for (const wall of result.layoutSuggestion?.wallSuggestions ?? []) {
      if (existingWallIds.has(wall.id)) continue;
      nextWalls.push({
        id: wall.id,
        floor: Math.max(0, Math.min(floors - 1, Math.round(wall.floor))),
        x1: Math.max(0, Math.min(lotWidth, wall.x1)),
        y1: Math.max(0, Math.min(lotDepth, wall.y1)),
        x2: Math.max(0, Math.min(lotWidth, wall.x2)),
        y2: Math.max(0, Math.min(lotDepth, wall.y2)),
        thickness: Math.max(0.08, Math.min(0.35, wall.thickness ?? 0.14)),
      });
      existingWallIds.add(wall.id);
    }

    const existingOpeningIds = new Set(safeCustomOpenings.map((opening) => opening.id));
    const nextOpenings = [...safeCustomOpenings];
    for (const opening of result.layoutSuggestion?.openingSuggestions ?? []) {
      if (existingOpeningIds.has(opening.id) || !existingWallIds.has(opening.wallId)) continue;
      nextOpenings.push({
        id: opening.id,
        wallId: opening.wallId,
        floor: Math.max(0, Math.min(floors - 1, Math.round(opening.floor))),
        type: opening.type,
        offset: Math.max(0.08, Math.min(0.92, opening.offset)),
        width: opening.width,
        height: opening.height,
        sillHeight: opening.sillHeight,
        openingStyle: opening.openingStyle,
        swing: opening.swing,
      });
      existingOpeningIds.add(opening.id);
    }

    const nextFacade = result.facadeSuggestion
      ? { ...facadePreferences, ...result.facadeSuggestion }
      : facadePreferences;

    setRooms(nextRooms);
    setCustomWalls(nextWalls);
    setCustomOpenings(nextOpenings);
    setFacadePreferences(nextFacade);
    pushRoomHistory(before);
    setSelectedId(null);
    setSelectedWallId(null);
    setSelectedCustomWallId(null);
    setSelectedOpeningId(null);
    setSelectedClosedSpaceId(null);
    setSelectedObjectId(null);

    await saveConcept(4, undefined, {
      rooms: nextRooms,
      customWalls: nextWalls,
      customOpenings: nextOpenings,
      facadePreferences: nextFacade,
    });
  };

  const runAiDevelopment = async (projectBriefOverride?: ProjectBriefSnapshot) => {
    if (aiDevelopmentState === "running") return;
    setAiDevelopmentState("running");
    try {
      if (projectBriefOverride) setProjectBrief(projectBriefOverride);
      const projectId = await saveConcept(
        4,
        undefined,
        projectBriefOverride ? { projectBrief: projectBriefOverride } : undefined,
      );
      if (!projectId) throw new Error("Não foi possível salvar o pré-projeto antes da análise.");
      const response = await fetch(`/api/arch/concept-projects/${projectId}/develop-with-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "assistido",
          preserveLayout: true,
          style: facadePreferences.style,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((payload as { error?: string }).error ?? "Falha ao desenvolver com IA.");
      await applyAiDevelopment(payload as AIDevelopmentResponse);
      setEditorView("plan");
      setEditorLibraryTab("build");
      setAiDevelopmentState("idle");
    } catch {
      setAiDevelopmentState("error");
      window.setTimeout(() => setAiDevelopmentState("idle"), 3000);
    }
  };

  const sharePublicTour = async () => {
    setTourShareState("sharing");
    const projectId = await saveConcept(4);
    if (!projectId) {
      setTourShareState("error");
      return;
    }

    try {
      const response = await fetch(`/api/arch/concept-projects/${projectId}/share-tour`, {
        method: "POST",
      });
      if (!response.ok) throw new Error("Falha ao criar link público");
      const payload = await response.json() as { path?: string };
      if (!payload.path) throw new Error("Link público inválido");
      const url = new URL(payload.path, window.location.origin).toString();
      await navigator.clipboard?.writeText(url);
      setTourShareState("copied");
      window.setTimeout(() => setTourShareState("idle"), 2200);
    } catch {
      setTourShareState("error");
      window.setTimeout(() => setTourShareState("idle"), 2600);
    }
  };

  // Defensive normalization: older/corrupt persisted drafts can hydrate array state as undefined.
  // Keep the editor usable instead of crashing on .filter/.find.
  const safeRooms = Array.isArray(rooms) ? rooms : [];
  const safeCustomWalls = Array.isArray(customWalls) ? customWalls : [];
  const safeCustomOpenings = Array.isArray(customOpenings) ? customOpenings : [];
  const safeWallFirstFloors = Array.isArray(wallFirstFloors) ? wallFirstFloors : [];
  const safeSpaceProfiles = Array.isArray(spaceProfiles) ? spaceProfiles : [];
  const safeObjects = Array.isArray(objects) ? objects : [];
  const usedProjectProductCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const object of safeObjects) {
      if (!object.catalogProductId) continue;
      counts.set(object.catalogProductId, (counts.get(object.catalogProductId) ?? 0) + 1);
    }
    for (const opening of safeCustomOpenings) {
      if (!opening.catalogProductId) continue;
      counts.set(opening.catalogProductId, (counts.get(opening.catalogProductId) ?? 0) + 1);
    }
    return counts;
  }, [safeCustomOpenings, safeObjects]);
  const usedProjectProducts = useMemo(
    () => realCatalogProducts.filter((item) => usedProjectProductCounts.has(item.id)),
    [realCatalogProducts, usedProjectProductCounts],
  );
  // Etapa 1 é exclusivamente o terreno. Mesmo que um rascunho antigo já tenha
  // planta salva, ela fica oculta até o usuário avançar para Casa/Ajustes.
  const terrainOnly = terrainDefined && editorView === "plan" && editorLibraryTab === "site";
  const referenceImportStage =
    referencePlanState === "uploading"
      ? "uploading"
      : referenceTraceState === "loading"
        ? "analyzing"
        : referenceTraceState === "applied"
          ? "editable"
          : referenceTraceState === "ready"
            ? "review"
            : referenceTraceState === "error"
              ? "error"
              : referencePlan?.kind === "image"
                ? "received"
                : "idle";
  const referenceReviewActive = editorView === "plan" && referencePlan?.kind === "image" && referenceTraceState !== "applied";
  const hideCurrentGeometryForReferenceReview = referenceReviewActive;
  const showReferenceImage = referencePlan?.kind === "image" && referenceDisplayMode !== "vector";
  const showReferenceVector = referenceDisplayMode !== "reference";

  const selected = safeRooms.find((r) => r.id === selectedId) ?? null;
  const selectedObject = safeObjects.find((object) => object.id === selectedObjectId) ?? null;

  useEffect(() => {
    let cancelled = false;
    const productId = selectedObject?.catalogProductId;
    if (!productId) {
      setSelectedProductMaterialLinks([]);
      setSelectedProductMaterialsLoading(false);
      return;
    }

    setSelectedProductMaterialsLoading(true);
    void fetch(`/api/arch/catalogo/${encodeURIComponent(productId)}/materials`, {
      headers: { Authorization: `Bearer ${localStorage.getItem("vendorai_token")}` },
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Falha ao carregar acabamentos do produto.");
        const data = await response.json() as ProductMaterialLink[];
        if (!cancelled) setSelectedProductMaterialLinks(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setSelectedProductMaterialLinks([]);
      })
      .finally(() => {
        if (!cancelled) setSelectedProductMaterialsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedObject?.catalogProductId]);

  const visibleRooms = wallFirstActive
    ? safeRooms.filter((r) => r.floor === activeFloor && (r.kind === "escada" || r.kind === "piscina"))
    : safeRooms.filter((r) => r.floor === activeFloor);
  const currentArea = useMemo(() => {
    const legacyArea = safeRooms
      .filter((room) => room.kind !== "piscina" && !safeWallFirstFloors.includes(room.floor))
      .reduce((sum, room) => sum + room.width * room.depth, 0);
    const wallFirstArea = safeWallFirstFloors.reduce((sum, floor) => {
      const floorWalls = safeCustomWalls
        .filter((wall) => wall.floor === floor)
        .map((wall) => ({
          id: wall.id,
          x1: wall.x1,
          y1: wall.y1,
          x2: wall.x2,
          y2: wall.y2,
        }));
      return sum + detectClosedSpaces(floorWalls, lotWidth, lotDepth)
        .reduce((area, space) => area + space.area, 0);
    }, 0);
    return legacyArea + wallFirstArea;
  }, [safeRooms, safeWallFirstFloors, safeCustomWalls, lotWidth, lotDepth]);

  const applyTypology = (nextTypology: ConceptTypology) => {
    const template = CONCEPT_TYPOLOGIES.find((item) => item.id === nextTypology);
    if (!template) return;

    // Modelos desenhados entram com as posições do projeto (girados para a frente escolhida
    // e dentro dos recuos). Só se não couberem no lote é que voltam ao encaixe automático.
    const placement = normalizeSitePlacement(sitePlacement);
    const drawn = buildTypologyPlan(nextTypology, lotWidth, lotDepth, placement.frontSide, resolveSiteSetbacks(placement));
    // Modelo desenhado que não cabe no lote não é mais "espremido" pelo encaixe automático
    // (que gerava cômodos soltos e erros). O cartão já avisa o lote mínimo.
    if (!drawn && template.rooms.every((room) => typeof room.x === "number")) return;
    let nextRooms = (drawn ?? buildTypologyRooms(nextTypology)) as Room[];
    if (!drawn) {
      for (let floor = 0; floor < template.floors; floor += 1) {
        nextRooms = generateTypologyLayout(
          nextRooms,
          lotWidth,
          lotDepth,
          floor,
          nextTypology,
          layoutVariant,
          layoutPreferences,
        ) as Room[];
      }
    }

    setTypology(nextTypology);
    setFloors(template.floors);
    setDesiredArea(template.suggestedArea);
    setActiveFloor(0);
    setSelectedId(null);
    setWallFirstFloors([]);
    setCustomWalls([]);
    setCustomOpenings([]);
    setSpaceProfiles([]);
    setRooms(nextRooms);
    setInteractionMode("room");
    setEditorView("plan");
    setEditorLibraryTab("build");
    setStep(4);
  };

  const applyClientBrief = (generated: ClientBriefAlternative) => {
    const nextRooms = generated.rooms.map((room) => ({ ...room })) as Room[];

    setTypology(generated.typology);
    setLayoutVariant(generated.variant);
    setLayoutPreferences(generated.layoutPreferences);
    setFloors(generated.floors);
    setDesiredArea(generated.suggestedArea);
    setProjectBrief(generated.projectBrief ?? null);
    setActiveFloor(0);
    setRooms(nextRooms);
    setCustomWalls([]);
    setCustomOpenings([]);
    setOpeningOverrides({});
    setWallFirstFloors([]);
    setSpaceProfiles([]);
    setObjects([]);
    setWallMaterials({});
    setPaintTool(null);
    setSelectedId(null);
    setSelectedObjectId(null);
    setSelectedOpeningId(null);
    setSelectedWallId(null);
    setSelectedCustomWallId(null);
    setSelectedClosedSpaceId(null);
    setInteractionMode("room");
    setEditorView("plan");
    setEditorLibraryTab("placement");
    setLibraryOpen(true);
    setStep(4);
  };

  const moveWholeProjectTo = (origin: { x: number; y: number }) => {
    const bounds = getBuildingBounds(roomsRef.current);
    if (!bounds) return;
    const dx = origin.x - bounds.minX;
    const dy = origin.y - bounds.minY;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;

    setRooms((current) => (Array.isArray(current) ? current : []).map((room) => ({
      ...room,
      x: room.x + dx,
      y: room.y + dy,
    })));
    setCustomWalls((current) => (Array.isArray(current) ? current : []).map((wall) => ({
      ...wall,
      x1: wall.x1 + dx,
      x2: wall.x2 + dx,
      y1: wall.y1 + dy,
      y2: wall.y2 + dy,
    })));
    setObjects((current) => (Array.isArray(current) ? current : []).map((object) => ({
      ...object,
      x: object.x + dx,
      y: object.y + dy,
    })));
    setSpaceProfiles((current) => (Array.isArray(current) ? current : []).map((profile) => ({
      ...profile,
      centroid: { x: profile.centroid.x + dx, y: profile.centroid.y + dy },
    })));
    setOpeningOverrides((current) => Object.fromEntries(
      Object.entries(current).map(([key, value]) => [key, { ...value, x: value.x + dx, y: value.y + dy }]),
    ));
  };

  const startBlankPlan = () => {
    setFloors(1);
    setActiveFloor(0);
    setRooms([]);
    setCustomWalls([]);
    setCustomOpenings([]);
    setSpaceProfiles([]);
    setOpeningOverrides({});
    setWallFirstFloors([0]);
    setSelectedId(null);
    setSelectedWallId(null);
    setSelectedCustomWallId(null);
    setSelectedOpeningId(null);
    setSelectedClosedSpaceId(null);
    setInteractionMode("draw-wall");
    setEditorView("plan");
    setEditorLibraryTab("build");
    setStep(4);
  };

  const toggleLayoutPreference = (key: LayoutPreferenceKey) => {
    setLayoutPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const snapshotEditor = (): EditorSnapshot => ({
    rooms: roomsRef.current.map((room) => ({ ...room })),
    customWalls: customWallsRef.current.map((wall) => ({ ...wall })),
    customOpenings: customOpeningsRef.current.map((opening) => ({ ...opening })),
    wallFirstFloors: [...wallFirstFloorsRef.current],
    openingOverrides: Object.fromEntries(
      Object.entries(openingOverridesRef.current).map(([key, value]) => [key, { ...value }]),
    ),
    objects: objectsRef.current.map((object) => ({ ...object })),
    spaceProfiles: (Array.isArray(spaceProfiles) ? spaceProfiles : []).map((profile) => ({ ...profile, centroid: { ...profile.centroid } })),
    wallMaterials: { ...wallMaterialsRef.current },
    facadePreferences: { ...facadePreferencesRef.current },
    facadeDesign: {
      ...facadeDesignRef.current,
      surfaceMaterials: { ...facadeDesignRef.current.surfaceMaterials },
      volumes: (facadeDesignRef.current.volumes ?? []).map((volume) => ({ ...volume })),
      roofConfig: facadeDesignRef.current.roofConfig ? { ...facadeDesignRef.current.roofConfig } : undefined,
      siteExterior: facadeDesignRef.current.siteExterior
        ? {
            zones: facadeDesignRef.current.siteExterior.zones.map((zone) => ({ ...zone })),
            pedestrianEntry: facadeDesignRef.current.siteExterior.pedestrianEntry ? { ...facadeDesignRef.current.siteExterior.pedestrianEntry } : null,
            vehicleEntry: facadeDesignRef.current.siteExterior.vehicleEntry ? { ...facadeDesignRef.current.siteExterior.vehicleEntry } : null,
          }
        : undefined,
    },
    sitePlacement: { ...sitePlacementRef.current },
  });

  const cloneSnapshot = (snapshot: EditorSnapshot): EditorSnapshot => ({
    rooms: snapshot.rooms.map((room) => ({ ...room })),
    customWalls: snapshot.customWalls.map((wall) => ({ ...wall })),
    customOpenings: snapshot.customOpenings.map((opening) => ({ ...opening })),
    wallFirstFloors: [...snapshot.wallFirstFloors],
    openingOverrides: Object.fromEntries(
      Object.entries(snapshot.openingOverrides).map(([key, value]) => [key, { ...value }]),
    ),
    objects: snapshot.objects.map((object) => ({ ...object })),
    spaceProfiles: snapshot.spaceProfiles.map((profile) => ({ ...profile, centroid: { ...profile.centroid } })),
    wallMaterials: { ...snapshot.wallMaterials },
    facadePreferences: { ...snapshot.facadePreferences },
    facadeDesign: {
      ...snapshot.facadeDesign,
      surfaceMaterials: { ...snapshot.facadeDesign.surfaceMaterials },
      volumes: (snapshot.facadeDesign.volumes ?? []).map((volume) => ({ ...volume })),
      roofConfig: snapshot.facadeDesign.roofConfig ? { ...snapshot.facadeDesign.roofConfig } : undefined,
      siteExterior: snapshot.facadeDesign.siteExterior
        ? {
            zones: snapshot.facadeDesign.siteExterior.zones.map((zone) => ({ ...zone })),
            pedestrianEntry: snapshot.facadeDesign.siteExterior.pedestrianEntry ? { ...snapshot.facadeDesign.siteExterior.pedestrianEntry } : null,
            vehicleEntry: snapshot.facadeDesign.siteExterior.vehicleEntry ? { ...snapshot.facadeDesign.siteExterior.vehicleEntry } : null,
          }
        : undefined,
    },
    sitePlacement: { ...snapshot.sitePlacement },
  });

  const restoreSnapshot = (snapshot: EditorSnapshot) => {
    const cloned = cloneSnapshot(snapshot);
    setRooms(cloned.rooms);
    setCustomWalls(cloned.customWalls);
    setCustomOpenings(cloned.customOpenings);
    setWallFirstFloors(cloned.wallFirstFloors);
    setOpeningOverrides(cloned.openingOverrides);
    setObjects(cloned.objects);
    setSpaceProfiles(cloned.spaceProfiles);
    setWallMaterials(cloned.wallMaterials);
    setFacadePreferences(cloned.facadePreferences);
    setFacadeDesign(cloned.facadeDesign);
    setSitePlacement(cloned.sitePlacement);
    setSelectedId(null);
    setSelectedWallId(null);
    setSelectedCustomWallId(null);
    setSelectedOpeningId(null);
    setSelectedObjectId(null);
  };

  const pushRoomHistory = (before: EditorSnapshot) => {
    setRoomHistory((history) => [...history.slice(-39), cloneSnapshot(before)]);
    setRoomFuture([]);
  };

  const beginRoomEdit = () => {
    if (!editStartRef.current) editStartRef.current = snapshotEditor();
  };

  const endRoomEdit = () => {
    const before = editStartRef.current;
    editStartRef.current = null;
    if (!before) return;
    const after = snapshotEditor();
    if (JSON.stringify(before) !== JSON.stringify(after)) pushRoomHistory(before);
  };

  const undoRooms = () => {
    setRoomHistory((history) => {
      const previous = history[history.length - 1];
      if (!previous) return history;
      setRoomFuture((future) => [snapshotEditor(), ...future].slice(0, 40));
      restoreSnapshot(previous);
      return history.slice(0, -1);
    });
  };

  const redoRooms = () => {
    setRoomFuture((future) => {
      const next = future[0];
      if (!next) return future;
      setRoomHistory((history) => [...history.slice(-39), snapshotEditor()]);
      restoreSnapshot(next);
      return future.slice(1);
    });
  };

  const addRoom = (kind: RoomKind) => {
    if (kind === "escada" && wallFirstActive) {
      const existing = safeRooms.find((room) => room.floor === activeFloor && room.kind === "escada");
      if (existing) {
        setSelectedId(existing.id);
        setInteractionMode("room");
        return;
      }

      const before = snapshotEditor();
      const next = createRoom("escada", activeFloor);
      const targetSpace = [...closedSpaces].sort((a, b) => b.area - a.area)[0];
      const targetX = targetSpace
        ? targetSpace.centroid.x - next.width / 2
        : lotWidth / 2 - next.width / 2;
      const targetY = targetSpace
        ? targetSpace.centroid.y - next.depth / 2
        : lotDepth / 2 - next.depth / 2;

      next.x = Math.max(0, Math.min(lotWidth - next.width, Math.round(targetX * 4) / 4));
      next.y = Math.max(0, Math.min(lotDepth - next.depth, Math.round(targetY * 4) / 4));
      setRooms((prev) => [...(Array.isArray(prev) ? prev : []), next]);
      if (activeFloor < 2) setFloors((value) => Math.max(value, activeFloor + 2));
      setSelectedId(next.id);
      setInteractionMode("room");
      setSelectedClosedSpaceId(null);
      pushRoomHistory(before);
      return;
    }

    if (kind === "piscina" && wallFirstActive) {
      const existing = rooms.find((room) => room.floor === activeFloor && room.kind === "piscina");
      if (existing) {
        setSelectedId(existing.id);
        setInteractionMode("room");
        return;
      }

      const before = snapshotEditor();
      const next = createRoom("piscina", activeFloor);
      next.x = Math.max(0.5, Math.min(lotWidth - next.width - 0.5, (lotWidth - next.width) / 2));
      next.y = Math.max(0.5, lotDepth - next.depth - 0.75);
      setRooms((prev) => [...(Array.isArray(prev) ? prev : []), next]);
      setSelectedId(next.id);
      setInteractionMode("room");
      pushRoomHistory(before);
      return;
    }

    if (SINGLETON_ROOM_KINDS.has(kind)) {
      const existing = rooms.find((room) => room.floor === activeFloor && room.kind === kind);
      if (existing) {
        setSelectedId(existing.id);
        return;
      }
    }
    const next = createRoom(kind, activeFloor);
    setRooms((prev) => autoArrange([...(Array.isArray(prev) ? prev : []), next], lotWidth, lotDepth, activeFloor));
    setSelectedId(next.id);
  };

  const updateSelected = (patch: Partial<Room>) => {
    if (!selectedId) return;
    setRooms((prev) => (Array.isArray(prev) ? prev : []).map((room) => {
      if (room.id !== selectedId) return room;
      const next = { ...room, ...patch };
      const width = Math.max(1, Math.min(lotWidth, next.width));
      const depth = Math.max(1, Math.min(lotDepth, next.depth));
      return {
        ...next,
        width,
        depth,
        x: Math.max(0, Math.min(lotWidth - width, next.x)),
        y: Math.max(0, Math.min(lotDepth - depth, next.y)),
      };
    }));
  };

  const updateRoomById = (roomId: string, patch: Partial<Room>) => {
    setRooms((prev) => (Array.isArray(prev) ? prev : []).map((room) =>
      room.id === roomId ? clampRoomToLot({ ...room, ...patch }, lotWidth, lotDepth) : room
    ));
  };

  const updateOpeningById = (openingId: string, patch: OpeningOverride) => {
    const custom = safeCustomOpenings.find((opening) => opening.id === openingId);
    if (custom) {
      const wall = safeCustomWalls.find((item) => item.id === custom.wallId);
      if (!wall) return;
      const dx = wall.x2 - wall.x1;
      const dy = wall.y2 - wall.y1;
      const wallLength = Math.hypot(dx, dy);
      if (wallLength < 0.001) return;
      const projectedDistance = ((patch.x - wall.x1) * dx + (patch.y - wall.y1) * dy) / wallLength;
      const halfOpening = Math.min(wallLength / 2, Math.max(0.25, (custom.width ?? (custom.type === "door" ? 0.9 : 1.2)) / 2));
      const minDistance = Math.min(halfOpening, wallLength / 2);
      const maxDistance = Math.max(minDistance, wallLength - halfOpening);
      const clampedDistance = Math.max(minDistance, Math.min(maxDistance, projectedDistance));
      const offset = Math.max(0, Math.min(1, clampedDistance / wallLength));
      setCustomOpenings((prev) => (Array.isArray(prev) ? prev : []).map((opening) =>
        opening.id === openingId ? { ...opening, offset, type: patch.type } : opening
      ));
      return;
    }

    setOpeningOverrides((prev) => ({
      ...prev,
      [openingId]: patch,
    }));
  };

  const updateOpeningWidth = (openingId: string, width: number) => {
    const custom = safeCustomOpenings.find((opening) => opening.id === openingId);
    const wall = custom ? safeCustomWalls.find((item) => item.id === custom.wallId) : null;
    if (!custom || !wall) return;
    const wallLength = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    const maximumWidth = Math.max(0.3, wallLength - 0.1);
    const safeWidth = Math.max(0.3, Math.min(4, maximumWidth, Number(width) || 0.5));
    if (Math.abs((custom.width ?? (custom.type === "door" ? 0.9 : 1.2)) - safeWidth) < 0.001) return;
    setCustomOpenings((prev) => (Array.isArray(prev) ? prev : []).map((opening) =>
      opening.id === openingId
        ? constrainOpeningToWall({ ...opening, width: safeWidth }, wallLength)
        : opening
    ));
  };

  const addObjectAt = (
    kind: ConceptPlanObject["kind"],
    label: string,
    width: number,
    depth: number,
    point?: { x: number; y: number },
    metadata?: Partial<Pick<ConceptPlanObject, "catalogProductId" | "imageUrl" | "supplier" | "price" | "model3dUrl" | "textureUrl">>,
  ) => {
    const before = snapshotEditor();
    const x = point
      ? Math.max(0, Math.min(lotWidth - width, point.x - width / 2))
      : Math.max(0, Math.min(lotWidth - width, lotWidth / 2 - width / 2));
    const y = point
      ? Math.max(0, Math.min(lotDepth - depth, point.y - depth / 2))
      : Math.max(0, Math.min(lotDepth - depth, lotDepth / 2 - depth / 2));
    const next: ConceptPlanObject = {
      id: `concept-object-${uid()}`,
      kind,
      label,
      floor: activeFloor,
      width,
      depth,
      x,
      y,
      rotation: 0,
      ...(metadata ?? {}),
    };
    setObjects((prev) => [...(Array.isArray(prev) ? prev : []), next]);
    setSelectedObjectId(next.id);
    setSelectedId(null);
    setSelectedOpeningId(null);
    setSelectedWallId(null);
    setSelectedCustomWallId(null);
    setSelectedClosedSpaceId(null);
    closeLibraryOnMobile();
    pushRoomHistory(before);
  };

  const addObject = (kind: ConceptPlanObject["kind"], label: string, width: number, depth: number) =>
    addObjectAt(kind, label, width, depth);

  const updateObjectById = (objectId: string, patch: Partial<Pick<ConceptPlanObject, "x" | "y" | "width" | "depth" | "rotation" | "materialId" | "materialScale" | "materialRotation" | "model3dUrl" | "materialSelections" | "configuredPrice">>) => {
    setObjects((prev) => (Array.isArray(prev) ? prev : []).map((object) => {
      if (object.id !== objectId) return object;
      const width = Math.max(0.3, Math.min(lotWidth, patch.width ?? object.width));
      const depth = Math.max(0.3, Math.min(lotDepth, patch.depth ?? object.depth));
      const x = Math.max(0, Math.min(lotWidth - width, patch.x ?? object.x));
      const y = Math.max(0, Math.min(lotDepth - depth, patch.y ?? object.y));
      return { ...object, ...patch, width, depth, x, y };
    }));
  };

  const deleteSelectedObject = () => {
    if (!selectedObjectId) return;
    const before = snapshotEditor();
    const nextObjects = safeObjects.filter((object) => object.id !== selectedObjectId);
    objectsRef.current = nextObjects;
    setObjects(nextObjects);
    setSelectedObjectId(null);
    pushRoomHistory(before);
    void saveConcept(4, undefined, { objects: nextObjects });
  };

  const duplicateSelectedObject = () => {
    if (!selectedObject) return;
    const before = snapshotEditor();
    const copy: ConceptPlanObject = {
      ...selectedObject,
      id: `concept-object-${uid()}`,
      x: Math.max(0, Math.min(lotWidth - selectedObject.width, selectedObject.x + 0.5)),
      y: Math.max(0, Math.min(lotDepth - selectedObject.depth, selectedObject.y + 0.5)),
      label: `${selectedObject.label} cópia`,
    };
    setObjects((prev) => [...(Array.isArray(prev) ? prev : []), copy]);
    setSelectedObjectId(copy.id);
    pushRoomHistory(before);
  };

  const rotateObject = (objectId: string) => {
    const before = snapshotEditor();
    const object = safeObjects.find((item) => item.id === objectId);
    if (!object) return;
    updateObjectById(objectId, { rotation: (object.rotation + 90) % 360 });
    setSelectedObjectId(objectId);
    pushRoomHistory(before);
  };

  const duplicateObject = (objectId: string) => {
    const before = snapshotEditor();
    const object = safeObjects.find((item) => item.id === objectId);
    if (!object) return;
    const copy: ConceptPlanObject = {
      ...object,
      id: `concept-object-${uid()}`,
      x: Math.max(0, Math.min(lotWidth - object.width, object.x + 0.5)),
      y: Math.max(0, Math.min(lotDepth - object.depth, object.y + 0.5)),
      label: `${object.label} cópia`,
    };
    setObjects((prev) => [...(Array.isArray(prev) ? prev : []), copy]);
    setSelectedObjectId(copy.id);
    pushRoomHistory(before);
  };

  const deleteObject = (objectId: string) => {
    const before = snapshotEditor();
    const nextObjects = safeObjects.filter((object) => object.id !== objectId);
    objectsRef.current = nextObjects;
    setObjects(nextObjects);
    setSelectedObjectId((current) => current === objectId ? null : current);
    pushRoomHistory(before);
    void saveConcept(4, undefined, { objects: nextObjects });
  };

  useEffect(() => {
    if (!selectedObjectId || (editorView !== "plan" && editorView !== "model3d")) return;
    const handleObjectShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteObject(selectedObjectId);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateObject(selectedObjectId);
        return;
      }
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === "r") {
        event.preventDefault();
        rotateObject(selectedObjectId);
      }
    };
    window.addEventListener("keydown", handleObjectShortcut);
    return () => window.removeEventListener("keydown", handleObjectShortcut);
  }, [editorView, selectedObjectId]);

  const armPaintTool = (
    target: "object" | "wall" | "floor",
    material: { id: string; name: string; swatch: string },
  ) => {
    setPaintTool({ target, materialId: material.id, name: material.name, swatch: material.swatch });
    if (target === "wall") setInteractionMode("wall");
    if (target === "floor") setInteractionMode(wallFirstActive ? "space" : "room");
    setSelectedId(null);
    setSelectedWallId(null);
    setSelectedCustomWallId(null);
    setSelectedClosedSpaceId(null);
    setSelectedObjectId(null);
    setSelectedOpeningId(null);
    closeLibraryOnMobile();
  };

  const applyFloorMaterialToRoom = (roomId: string, materialId: string) => {
    const before = snapshotEditor();
    setRooms((prev) => (Array.isArray(prev) ? prev : []).map((room) =>
      room.id === roomId ? { ...room, floorMaterialId: materialId } : room
    ));
    pushRoomHistory(before);
  };

  const applyFloorMaterialToSpace = (spaceId: string, materialId: string) => {
    const space = closedSpaces.find((item) => item.id === spaceId);
    if (!space) return;
    const before = snapshotEditor();
    const existing = spaceAssignments.get(spaceId);
    if (existing) {
      setSpaceProfiles((prev) => (Array.isArray(prev) ? prev : []).map((profile) =>
        profile.id === existing.id
          ? { ...profile, floorMaterialId: materialId, centroid: space.centroid, area: space.area, floor: activeFloor }
          : profile
      ));
    } else {
      const profile: SpaceProfile = {
        id: `space-profile-${uid()}`,
        floor: activeFloor,
        label: `Espaço ${safeSpaceProfiles.filter((item) => item.floor === activeFloor).length + 1}`,
        kind: "outro",
        centroid: space.centroid,
        area: space.area,
        floorMaterialId: materialId,
      };
      setSpaceProfiles((prev) => [...(Array.isArray(prev) ? prev : []), profile]);
    }
    pushRoomHistory(before);
  };

  const applyWallMaterialToId = (wallId: string, materialId: string) => {
    const before = snapshotEditor();
    setWallMaterials((prev) => ({ ...(prev ?? {}), [wallId]: materialId }));
    pushRoomHistory(before);
  };

  const applyObjectMaterialToId = (objectId: string, materialId: string) => {
    const before = snapshotEditor();
    updateObjectById(objectId, { materialId });
    pushRoomHistory(before);
  };

  const applyProductMaterialSelection = (surfaceKey: string, link: ProductMaterialLink) => {
    if (!selectedObject || !link.material) return;
    const before = snapshotEditor();
    const key = surfaceKey || "__all__";
    const textureUrl = link.material.primaryImage?.storageUrl ?? undefined;
    const nextSelections = {
      ...(selectedObject.materialSelections ?? {}),
      [key]: {
        materialId: link.material.id,
        materialName: link.material.nome,
        ...(textureUrl ? { textureUrl } : {}),
        ...(link.grupo ? { grupo: link.grupo } : {}),
        priceDelta: Number(link.precoAdicional ?? 0) || 0,
      },
    };
    const basePrice = Number(selectedObject.price ?? 0) || 0;
    const extras = Object.values(nextSelections).reduce((sum, selection) => sum + (Number(selection.priceDelta) || 0), 0);
    const nextObjects = safeObjects.map((object) =>
      object.id === selectedObject.id
        ? { ...object, materialSelections: nextSelections, configuredPrice: basePrice + extras }
        : object
    );
    objectsRef.current = nextObjects;
    setObjects(nextObjects);
    pushRoomHistory(before);
    void saveConcept(4, undefined, { objects: nextObjects });
  };

  const clearProductMaterialSelection = (surfaceKey: string) => {
    if (!selectedObject?.materialSelections) return;
    const before = snapshotEditor();
    const key = surfaceKey || "__all__";
    const nextSelections = { ...selectedObject.materialSelections };
    delete nextSelections[key];
    const basePrice = Number(selectedObject.price ?? 0) || 0;
    const extras = Object.values(nextSelections).reduce((sum, selection) => sum + (Number(selection.priceDelta) || 0), 0);
    const nextObjects = safeObjects.map((object) =>
      object.id === selectedObject.id
        ? { ...object, materialSelections: nextSelections, configuredPrice: basePrice + extras }
        : object
    );
    objectsRef.current = nextObjects;
    setObjects(nextObjects);
    pushRoomHistory(before);
    void saveConcept(4, undefined, { objects: nextObjects });
  };

  const setSelectedSurfaceMaterial = (materialId: string) => {
    const before = snapshotEditor();
    if (selected) {
      setRooms((prev) => (Array.isArray(prev) ? prev : []).map((room) =>
        room.id === selected.id ? { ...room, floorMaterialId: materialId } : room
      ));
      pushRoomHistory(before);
      closeLibraryOnMobile();
      return;
    }
    if (selectedClosedSpace) {
      const existing = spaceAssignments.get(selectedClosedSpace.id);
      if (existing) {
        setSpaceProfiles((prev) => (Array.isArray(prev) ? prev : []).map((profile) =>
          profile.id === existing.id
            ? { ...profile, floorMaterialId: materialId, centroid: selectedClosedSpace.centroid, area: selectedClosedSpace.area, floor: activeFloor }
            : profile
        ));
      } else {
        const profile: SpaceProfile = {
          id: `space-profile-${uid()}`,
          floor: activeFloor,
          label: `Espaço ${safeSpaceProfiles.filter((item) => item.floor === activeFloor).length + 1}`,
          kind: "outro",
          centroid: selectedClosedSpace.centroid,
          area: selectedClosedSpace.area,
          floorMaterialId: materialId,
        };
        setSpaceProfiles((prev) => [...(Array.isArray(prev) ? prev : []), profile]);
      }
      closeLibraryOnMobile();
    }
  };

  const organize = (variant = layoutVariant) => {
    setLayoutVariant(variant);
    setRooms((prev) =>
      generateTypologyLayout(
        normalizeDraftRooms(prev),
        lotWidth,
        lotDepth,
        activeFloor,
        typology,
        variant,
        layoutPreferences,
      ),
    );
  };

  const swapPosition = (room: Room, direction: "left" | "right" | "up" | "down") => {
    if (room.locked) return;
    const delta = 0.25;
    const nextX = Math.max(0, Math.min(lotWidth - room.width, room.x + (direction === "right" ? delta : direction === "left" ? -delta : 0)));
    const nextY = Math.max(0, Math.min(lotDepth - room.depth, room.y + (direction === "down" ? delta : direction === "up" ? -delta : 0)));
    updateSelected({ x: nextX, y: nextY });
  };

  const duplicateRoomById = (roomId: string) => {
    const room = safeRooms.find((item) => item.id === roomId);
    if (!room || SINGLETON_ROOM_KINDS.has(room.kind)) return;
    const before = snapshotEditor();
    const copy: Room = {
      ...room,
      id: uid(),
      label: room.label.replace(/\s+\d+$/, "") + " cópia",
      locked: false,
      x: Math.max(0, Math.min(lotWidth - room.width, room.x + 0.5)),
      y: Math.max(0, Math.min(lotDepth - room.depth, room.y + 0.5)),
    };
    setRooms((prev) => [...(Array.isArray(prev) ? prev : []), copy]);
    setSelectedId(copy.id);
    pushRoomHistory(before);
  };

  const deleteRoomById = (roomId: string) => {
    const before = snapshotEditor();
    setRooms((prev) => (Array.isArray(prev) ? prev : []).filter((room) => room.id !== roomId));
    setSelectedId((current) => current === roomId ? null : current);
    pushRoomHistory(before);
  };

  const duplicateSelectedRoom = () => {
    if (selected) duplicateRoomById(selected.id);
  };

  const deleteSelectedRoom = () => {
    if (selected) deleteRoomById(selected.id);
  };

  const openMaterialsForSelection = () => {
    setEditorLibraryTab("materials");
    setLibraryOpen(true);
  };

  const baseGeometry = useMemo(
    () => buildConceptGeometry(rooms, lotWidth, lotDepth, activeFloor, normalizeSitePlacement(sitePlacement).frontSide),
    [rooms, lotWidth, lotDepth, activeFloor, sitePlacement],
  );
  const activateWallFirstFloor = () => {
    if (wallFirstActive) return;
    const before = snapshotEditor();
    const floorRooms = safeRooms.filter((room) => room.floor === activeFloor && room.kind !== "piscina");
    const existingWalls = safeCustomWalls.filter((wall) => wall.floor === activeFloor);
    const otherWalls = safeCustomWalls.filter((wall) => wall.floor !== activeFloor);

    const keyOf = (wall: { x1: number; y1: number; x2: number; y2: number }) => {
      const a = [Math.round(wall.x1 * 100), Math.round(wall.y1 * 100)];
      const b = [Math.round(wall.x2 * 100), Math.round(wall.y2 * 100)];
      const first = a[0] < b[0] || (a[0] === b[0] && a[1] <= b[1]) ? a : b;
      const second = first === a ? b : a;
      return `${first[0]}:${first[1]}:${second[0]}:${second[1]}`;
    };

    const merged = new Map<string, CustomWall>();
    for (const wall of existingWalls) merged.set(keyOf(wall), wall);
    for (const wall of baseGeometry.walls) {
      const key = keyOf(wall);
      if (merged.has(key)) continue;
      merged.set(key, {
        id: `wf-${activeFloor}-${wall.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
        floor: activeFloor,
        x1: wall.x1,
        y1: wall.y1,
        x2: wall.x2,
        y2: wall.y2,
        thickness: wall.exterior ? 0.18 : 0.12,
      });
    }

    const floorWalls = [...merged.values()];
    const wallForOpening = (opening: { x: number; y: number; orientation: "horizontal" | "vertical" }) =>
      floorWalls.find((wall) => {
        const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
        if ((opening.orientation === "horizontal") !== horizontal) return false;
        if (horizontal) {
          return Math.abs(wall.y1 - opening.y) <= 0.08 &&
            opening.x >= Math.min(wall.x1, wall.x2) - 0.05 &&
            opening.x <= Math.max(wall.x1, wall.x2) + 0.05;
        }
        return Math.abs(wall.x1 - opening.x) <= 0.08 &&
          opening.y >= Math.min(wall.y1, wall.y2) - 0.05 &&
          opening.y <= Math.max(wall.y1, wall.y2) + 0.05;
      });

    const existingOpenings = safeCustomOpenings.filter((opening) => opening.floor === activeFloor);
    const otherOpenings = safeCustomOpenings.filter((opening) => opening.floor !== activeFloor);
    const importedOpenings: CustomOpening[] = [];

    for (const opening of baseGeometry.openings) {
      const override = openingOverrides[opening.id];
      const source = override ? { ...opening, ...override } : opening;
      const wall = wallForOpening(source);
      if (!wall) continue;
      const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
      const start = horizontal ? wall.x1 : wall.y1;
      const end = horizontal ? wall.x2 : wall.y2;
      const position = horizontal ? source.x : source.y;
      const denominator = end - start;
      if (Math.abs(denominator) < 0.05) continue;
      const offset = Math.max(0.08, Math.min(0.92, (position - start) / denominator));
      const duplicate = existingOpenings.some((item) =>
        item.wallId === wall.id && Math.abs(item.offset - offset) < 0.08
      );
      if (duplicate) continue;
      importedOpenings.push({
        id: `wf-opening-${activeFloor}-${opening.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
        wallId: wall.id,
        floor: activeFloor,
        type: source.type,
        offset,
        width: source.type === "door" ? 0.90 : 1.20,
        height: source.type === "door" ? 2.10 : 1.20,
        sillHeight: source.type === "door" ? 0 : 0.90,
        openingStyle: source.type === "door" ? "hinged" : "sliding",
        swing: "left",
      });
    }

    const derivedSpaces = detectClosedSpaces(floorWalls, lotWidth, lotDepth);
    const existingProfiles = safeSpaceProfiles.filter((profile) => profile.floor === activeFloor);
    if (!existingProfiles.length && derivedSpaces.length) {
      const seededProfiles: SpaceProfile[] = derivedSpaces.map((space, index) => {
        const containing = floorRooms.find((room) =>
          space.centroid.x >= room.x - 0.05 &&
          space.centroid.x <= room.x + room.width + 0.05 &&
          space.centroid.y >= room.y - 0.05 &&
          space.centroid.y <= room.y + room.depth + 0.05
        );
        const nearest = containing ?? [...floorRooms].sort((a, b) => {
          const da = Math.hypot(
            a.x + a.width / 2 - space.centroid.x,
            a.y + a.depth / 2 - space.centroid.y,
          );
          const db = Math.hypot(
            b.x + b.width / 2 - space.centroid.x,
            b.y + b.depth / 2 - space.centroid.y,
          );
          return da - db;
        })[0];
        return {
          id: `wf-profile-${activeFloor}-${index}-${uid()}`,
          floor: activeFloor,
          label: nearest?.label ?? `Ambiente ${index + 1}`,
          kind: nearest?.kind ?? "outro",
          centroid: space.centroid,
          area: space.area,
        };
      });
      setSpaceProfiles((prev) => [
        ...(Array.isArray(prev) ? prev : []).filter((profile) => profile.floor !== activeFloor),
        ...seededProfiles,
      ]);
    }

    setCustomWalls([...otherWalls, ...floorWalls]);
    setCustomOpenings([...otherOpenings, ...existingOpenings, ...importedOpenings]);
    setWallFirstFloors((prev) => [...new Set([...(Array.isArray(prev) ? prev : []), activeFloor])].sort((a, b) => a - b));
    setSelectedId(null);
    setSelectedWallId(null);
    setSelectedCustomWallId(null);
    setSelectedOpeningId(null);
    setSelectedClosedSpaceId(null);
    setInteractionMode("space");
    pushRoomHistory(before);
  };

  const deactivateWallFirstFloor = () => {
    if (!wallFirstActive) return;
    const before = snapshotEditor();
    setWallFirstFloors((prev) => (Array.isArray(prev) ? prev : []).filter((floor) => floor !== activeFloor));
    setCustomWalls((prev) => (Array.isArray(prev) ? prev : []).filter((wall) =>
      wall.floor !== activeFloor || !wall.id.startsWith(`wf-${activeFloor}-`)
    ));
    setCustomOpenings((prev) => (Array.isArray(prev) ? prev : []).filter((opening) =>
      opening.floor !== activeFloor || !opening.id.startsWith(`wf-opening-${activeFloor}-`)
    ));
    setSelectedId(null);
    setSelectedWallId(null);
    setSelectedCustomWallId(null);
    setSelectedOpeningId(null);
    setSelectedClosedSpaceId(null);
    setInteractionMode("room");
    pushRoomHistory(before);
  };

  const customOpeningMarkers = useMemo(
    () =>
      safeCustomOpenings
        .filter((opening) => opening.floor === activeFloor)
        .flatMap((opening) => {
          const wall = safeCustomWalls.find((item) => item.id === opening.wallId && item.floor === activeFloor);
          if (!wall) return [];
          const offset = Math.max(0.08, Math.min(0.92, opening.offset));
          const x = wall.x1 + (wall.x2 - wall.x1) * offset;
          const y = wall.y1 + (wall.y2 - wall.y1) * offset;
          const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
          return [{
            id: opening.id,
            type: opening.type,
            x,
            y,
            orientation: horizontal ? "horizontal" as const : "vertical" as const,
            roomId: `custom-wall:${wall.id}`,
            width: opening.width,
            height: opening.height,
            sillHeight: opening.sillHeight,
            openingStyle: opening.openingStyle,
            swing: opening.swing,
            swingSide: opening.swingSide,
            leafCount: opening.leafCount,
            frameProfile: opening.frameProfile,
            glassType: opening.glassType,
            manufacturer: opening.manufacturer,
            catalogProductId: opening.catalogProductId,
          }];
        }),
    [safeCustomOpenings, safeCustomWalls, activeFloor],
  );
  const geometry = useMemo(
    () => ({
      ...baseGeometry,
      walls: wallFirstActive ? [] : baseGeometry.walls,
      openings: wallFirstActive
        ? customOpeningMarkers
        : [
            ...baseGeometry.openings.map((opening) => {
              const override = openingOverrides[opening.id];
              return override ? { ...opening, ...override } : opening;
            }),
            ...customOpeningMarkers,
          ],
    }),
    [baseGeometry, openingOverrides, customOpeningMarkers, wallFirstActive],
  );
  const closedSpaces = useMemo(
    () =>
      detectClosedSpaces(
        [
          ...geometry.walls.map((wall) => ({
            id: wall.id,
            x1: wall.x1,
            y1: wall.y1,
            x2: wall.x2,
            y2: wall.y2,
          })),
          ...safeCustomWalls
            .filter((wall) => wall.floor === activeFloor)
            .map((wall) => ({
              id: wall.id,
              x1: wall.x1,
              y1: wall.y1,
              x2: wall.x2,
              y2: wall.y2,
            })),
        ],
        lotWidth,
        lotDepth,
      ),
    [geometry.walls, safeCustomWalls, activeFloor, lotWidth, lotDepth],
  );
  const closedArea = closedSpaces.reduce((sum, space) => sum + space.area, 0);
  const spaceAssignments = useMemo(() => {
    const assignments = new Map<string, SpaceProfile>();
    const usedProfiles = new Set<string>();

    for (const space of closedSpaces) {
      const candidates = safeSpaceProfiles
        .filter((profile) => profile.floor === activeFloor && !usedProfiles.has(profile.id))
        .map((profile) => {
          const distance = Math.hypot(
            profile.centroid.x - space.centroid.x,
            profile.centroid.y - space.centroid.y,
          );
          const areaRatio = Math.abs(profile.area - space.area) / Math.max(1, space.area);
          return { profile, score: distance + areaRatio * 2.5, distance, areaRatio };
        })
        .filter((candidate) => candidate.distance <= 3.5 && candidate.areaRatio <= 0.65)
        .sort((a, b) => a.score - b.score);

      const best = candidates[0]?.profile;
      if (best) {
        assignments.set(space.id, best);
        usedProfiles.add(best.id);
      }
    }

    return assignments;
  }, [closedSpaces, safeSpaceProfiles, activeFloor]);

  const roomFloorMaterials = useMemo(
    () => Object.fromEntries(
      safeRooms
        .filter((room) => room.floor === activeFloor && room.floorMaterialId)
        .map((room) => [room.id, room.floorMaterialId as string]),
    ),
    [safeRooms, activeFloor],
  );

  const spaceFloorMaterials = useMemo(
    () => Object.fromEntries(
      [...spaceAssignments.entries()]
        .filter(([, profile]) => profile.floorMaterialId)
        .map(([spaceId, profile]) => [spaceId, profile.floorMaterialId as string]),
    ),
    [spaceAssignments],
  );

  const modelLevels = useMemo<ConceptModelLevel[]>(() => {
    return Array.from({ length: floors }, (_, floorIndex) => {
      const base = buildConceptGeometry(safeRooms, lotWidth, lotDepth, floorIndex, normalizeSitePlacement(sitePlacement).frontSide);
      const floorGeometry = {
        ...base,
        openings: base.openings.map((opening) => {
          const override = openingOverrides[opening.id];
          return override ? { ...opening, ...override } : opening;
        }),
      };
      const floorWallFirst = safeWallFirstFloors.includes(floorIndex);
      const floorCustomWalls = safeCustomWalls.filter((wall) => wall.floor === floorIndex);
      const legacyWalls = floorWallFirst ? [] : floorGeometry.walls;
      const floorCustomOpeningMarkers = safeCustomOpenings
        .filter((opening) => opening.floor === floorIndex)
        .flatMap((opening) => {
          const wall = floorCustomWalls.find((item) => item.id === opening.wallId);
          if (!wall) return [];
          const offset = Math.max(0.08, Math.min(0.92, opening.offset));
          const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
          return [{
            id: opening.id,
            type: opening.type,
            x: wall.x1 + (wall.x2 - wall.x1) * offset,
            y: wall.y1 + (wall.y2 - wall.y1) * offset,
            orientation: horizontal ? "horizontal" as const : "vertical" as const,
            roomId: `custom-wall:${wall.id}`,
            width: opening.width,
            height: opening.height,
            sillHeight: opening.sillHeight,
            openingStyle: opening.openingStyle,
            swing: opening.swing,
          }];
        });
      const floorClosedSpaces = detectClosedSpaces(
        [
          ...legacyWalls.map((wall) => ({
            id: wall.id,
            x1: wall.x1,
            y1: wall.y1,
            x2: wall.x2,
            y2: wall.y2,
          })),
          ...floorCustomWalls.map((wall) => ({
            id: wall.id,
            x1: wall.x1,
            y1: wall.y1,
            x2: wall.x2,
            y2: wall.y2,
          })),
        ],
        lotWidth,
        lotDepth,
      );

      const labels: Record<string, string> = {};
      const floorMaterials: Record<string, string> = {};
      const usedProfiles = new Set<string>();
      for (const space of floorClosedSpaces) {
        const best = safeSpaceProfiles
          .filter((profile) => profile.floor === floorIndex && !usedProfiles.has(profile.id))
          .map((profile) => {
            const distance = Math.hypot(
              profile.centroid.x - space.centroid.x,
              profile.centroid.y - space.centroid.y,
            );
            const areaRatio = Math.abs(profile.area - space.area) / Math.max(1, space.area);
            return { profile, score: distance + areaRatio * 2.5, distance, areaRatio };
          })
          .filter((candidate) => candidate.distance <= 3.5 && candidate.areaRatio <= 0.65)
          .sort((a, b) => a.score - b.score)[0];

        if (best) {
          labels[space.id] = best.profile.label;
          if (best.profile.floorMaterialId) floorMaterials[space.id] = best.profile.floorMaterialId;
          usedProfiles.add(best.profile.id);
        } else if (!floorWallFirst) {
          const ownerRoom = safeRooms
            .filter((room) => room.floor === floorIndex)
            .find((room) =>
              space.centroid.x >= room.x - 0.15 &&
              space.centroid.x <= room.x + room.width + 0.15 &&
              space.centroid.y >= room.y - 0.15 &&
              space.centroid.y <= room.y + room.depth + 0.15
            );
          if (ownerRoom?.floorMaterialId) floorMaterials[space.id] = ownerRoom.floorMaterialId;
          if (ownerRoom?.label && !labels[space.id]) labels[space.id] = ownerRoom.label;
        }
      }

      return {
        floor: floorIndex,
        walls: legacyWalls,
        customWalls: floorCustomWalls,
        closedSpaces: floorClosedSpaces,
        openings: floorWallFirst
          ? floorCustomOpeningMarkers
          : [...floorGeometry.openings, ...floorCustomOpeningMarkers],
        labels,
        floorMaterials,
        wallMaterials: Object.fromEntries([...legacyWalls, ...floorCustomWalls].map((wall) => [wall.id, wallMaterials[wall.id]]).filter(([, material]) => Boolean(material))),
        stairs: safeRooms
          .filter((room) => room.floor === floorIndex && room.kind === "escada")
          .map((room) => ({
            id: room.id,
            x: room.x,
            y: room.y,
            width: room.width,
            depth: room.depth,
          })),
      };
    });
  }, [floors, safeRooms, lotWidth, lotDepth, openingOverrides, safeCustomWalls, safeCustomOpenings, safeSpaceProfiles, safeWallFirstFloors, wallMaterials, sitePlacement]);

  const selectedClosedSpace = closedSpaces.find((space) => space.id === selectedClosedSpaceId) ?? null;
  const selectedSpaceProfile = selectedClosedSpace ? spaceAssignments.get(selectedClosedSpace.id) ?? null : null;

  const libraryInsertPoint = useMemo(() => {
    if (selectedClosedSpace) return selectedClosedSpace.centroid;
    if (selected) return {
      x: selected.x + selected.width / 2,
      y: selected.y + selected.depth / 2,
    };
    const activeRooms = safeRooms.filter((room) => room.floor === activeFloor && room.kind !== "piscina");
    if (activeRooms.length) {
      const room = activeRooms[0];
      return { x: room.x + room.width / 2, y: room.y + room.depth / 2 };
    }
    return { x: lotWidth / 2, y: lotDepth / 2 };
  }, [activeFloor, lotDepth, lotWidth, safeRooms, selected, selectedClosedSpace]);

  const updateSelectedSpaceProfile = (patch: Partial<Pick<SpaceProfile, "label" | "kind">>) => {
    if (!selectedClosedSpace) return;
    const existing = spaceAssignments.get(selectedClosedSpace.id);
    if (existing) {
      setSpaceProfiles((prev) => (Array.isArray(prev) ? prev : []).map((profile) =>
        profile.id === existing.id
          ? {
              ...profile,
              ...patch,
              centroid: selectedClosedSpace.centroid,
              area: selectedClosedSpace.area,
              floor: activeFloor,
            }
          : profile
      ));
      return;
    }

    const created: SpaceProfile = {
      id: `space-profile-${uid()}`,
      floor: activeFloor,
      label: patch.label ?? "Ambiente",
      kind: patch.kind ?? "outro",
      centroid: selectedClosedSpace.centroid,
      area: selectedClosedSpace.area,
    };
    setSpaceProfiles((prev) => [...(Array.isArray(prev) ? prev : []), created]);
  };
  useEffect(() => {
    if (!selectedClosedSpace || selectedSpaceProfile) return;
    const floorIndex = activeFloor;
    const sequence = safeSpaceProfiles.filter((item) => item.floor === floorIndex).length + 1;
    const created: SpaceProfile = {
      id: `space-profile-${uid()}`,
      floor: floorIndex,
      label: `Ambiente ${sequence}`,
      kind: "outro",
      centroid: selectedClosedSpace.centroid,
      area: selectedClosedSpace.area,
    };
    setSpaceProfiles((prev) => [...(Array.isArray(prev) ? prev : []), created]);
  }, [selectedClosedSpace, selectedSpaceProfile, activeFloor, safeSpaceProfiles]);

  useEffect(() => {
    if (!selectedClosedSpaceId || furnishLayoutSpaceId === selectedClosedSpaceId) return;
    setFurnishLayoutOptions([]);
    setFurnishLayoutSpaceId(null);
    setPreviewFurnishLayoutId(null);
  }, [selectedClosedSpaceId, furnishLayoutSpaceId]);

  const layoutIssues = useMemo(() => inspectConceptVisualQuality({
    rooms: safeRooms, levels: modelLevels, lotWidth, lotDepth,
    wallFirstFloors: safeWallFirstFloors, objects: safeObjects,
    design: facadeDesign, placement: normalizeSitePlacement(sitePlacement),
  }), [safeRooms, modelLevels, lotWidth, lotDepth, safeWallFirstFloors, safeObjects, facadeDesign, sitePlacement]);
  const blockingLayoutIssues = blockingConceptIssues(layoutIssues);

  const architecturalAcceptance = useMemo(() => evaluateConceptAcceptance({
    rooms: safeRooms,
    lotWidth,
    lotDepth,
    floors,
    site: {
      frontSide: normalizeSitePlacement(sitePlacement).frontSide,
      setbackFront: normalizeSitePlacement(sitePlacement).setbackFront,
      northSide: normalizeSitePlacement(sitePlacement).northSide,
    },
  }), [safeRooms, lotWidth, lotDepth, floors, sitePlacement]);

  const architecturalRepair = useMemo(() => autoRepairConceptLayout({
    rooms: safeRooms,
    lotWidth,
    lotDepth,
    floors,
    site: {
      frontSide: normalizeSitePlacement(sitePlacement).frontSide,
      setbackFront: normalizeSitePlacement(sitePlacement).setbackFront,
      northSide: normalizeSitePlacement(sitePlacement).northSide,
    },
    maxPasses: 3,
  }), [safeRooms, lotWidth, lotDepth, floors, sitePlacement]);

  const explainableFindings = useMemo(
    () => buildExplainableFindings(architecturalAcceptance, architecturalRepair),
    [architecturalAcceptance, architecturalRepair],
  );

  const repairArchitecturalLayout = () => {
    if (!safeRooms.length || !architecturalRepair.improved) return;
    const before = snapshotEditor();
    setRooms(architecturalRepair.rooms as Room[]);
    pushRoomHistory(before);
    setSelectedId(null);
    setSelectedOpeningId(null);
    setSelectedWallId(null);
    setSelectedCustomWallId(null);
    setMobileValidationOpen(false);
  };

  const selectedOpening = geometry.openings.find((opening) => opening.id === selectedOpeningId) ?? null;
  const selectedCustomOpening = selectedOpening
    ? safeCustomOpenings.find((opening) => opening.id === selectedOpening.id) ?? null
    : null;
  const selectedWall = geometry.walls.find((wall) => wall.id === selectedWallId) ?? null;

  const addCustomWall = (wall: CustomWall) => {
    const before = snapshotEditor();
    setCustomWalls((prev) => [...(Array.isArray(prev) ? prev : []), wall]);
    pushRoomHistory(before);
    setSelectedCustomWallId(wall.id);
    setSelectedWallId(null);
  };

  const constrainOpeningToWall = (
    opening: CustomOpening,
    wallLength: number,
    preserveFrom: "start" | "end" | "ratio" = "ratio",
    previousWallLength = wallLength,
  ): CustomOpening => {
    const requestedWidth = opening.width ?? (opening.type === "door" ? 0.9 : 1.2);
    const maxWidth = Math.max(0.3, wallLength - 0.1);
    const width = Math.max(0.3, Math.min(requestedWidth, maxWidth));
    const halfRatio = wallLength > 0.001 ? Math.min(0.49, width / 2 / wallLength) : 0.49;
    const minOffset = halfRatio;
    const maxOffset = 1 - halfRatio;

    let offset = opening.offset;
    if (previousWallLength > 0.001 && wallLength > 0.001) {
      if (preserveFrom === "start") {
        offset = (opening.offset * previousWallLength) / wallLength;
      } else if (preserveFrom === "end") {
        const distanceFromEnd = (1 - opening.offset) * previousWallLength;
        offset = 1 - distanceFromEnd / wallLength;
      }
    }

    return {
      ...opening,
      width,
      offset: Math.max(minOffset, Math.min(maxOffset, offset)),
    };
  };

  const reconcileOpeningsForWall = (
    wallId: string,
    previousWall: CustomWall,
    nextWall: CustomWall,
  ) => {
    const previousLength = Math.hypot(previousWall.x2 - previousWall.x1, previousWall.y2 - previousWall.y1);
    const nextLength = Math.hypot(nextWall.x2 - nextWall.x1, nextWall.y2 - nextWall.y1);
    const startChanged = Math.hypot(nextWall.x1 - previousWall.x1, nextWall.y1 - previousWall.y1) > 0.001;
    const endChanged = Math.hypot(nextWall.x2 - previousWall.x2, nextWall.y2 - previousWall.y2) > 0.001;
    const preserveFrom: "start" | "end" | "ratio" =
      startChanged && !endChanged ? "end" : endChanged && !startChanged ? "start" : "ratio";

    setCustomOpenings((prev) => (Array.isArray(prev) ? prev : []).map((opening) =>
      opening.wallId === wallId
        ? constrainOpeningToWall(opening, nextLength, preserveFrom, previousLength)
        : opening
    ));
  };

  const updateCustomWall = (
    wallId: string,
    patch: Partial<{ x1: number; y1: number; x2: number; y2: number; thickness: number }>,
    recordHistory = false,
  ) => {
    const wall = safeCustomWalls.find((item) => item.id === wallId);
    if (!wall) return;
    const nextWall = { ...wall, ...patch };
    const nextLength = Math.hypot(nextWall.x2 - nextWall.x1, nextWall.y2 - nextWall.y1);
    const widestOpening = safeCustomOpenings
      .filter((opening) => opening.wallId === wallId)
      .reduce((max, opening) => Math.max(max, opening.width ?? (opening.type === "door" ? 0.9 : 1.2)), 0);
    const minimumWallLength = widestOpening > 0 ? Math.max(0.5, widestOpening + 0.1) : 0.5;
    if (nextLength < minimumWallLength) return;

    const before = recordHistory ? snapshotEditor() : null;
    setCustomWalls((prev) => (Array.isArray(prev) ? prev : []).map((item) => item.id === wallId ? nextWall : item));
    reconcileOpeningsForWall(wallId, wall, nextWall);
    if (before) pushRoomHistory(before);
  };

  const setCustomWallLength = (wallId: string, rawLength: number) => {
    const wall = safeCustomWalls.find((item) => item.id === wallId);
    if (!wall || !Number.isFinite(rawLength)) return;
    const openingMinimum = safeCustomOpenings
      .filter((opening) => opening.wallId === wallId)
      .reduce((max, opening) => Math.max(max, (opening.width ?? (opening.type === "door" ? 0.9 : 1.2)) + 0.1), 0.5);
    const length = Math.max(openingMinimum, Math.min(Math.hypot(lotWidth, lotDepth), rawLength));
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const currentLength = Math.hypot(dx, dy);
    if (currentLength < 0.001) return;
    const ux = dx / currentLength;
    const uy = dy / currentLength;
    const before = snapshotEditor();
    const target = { x: wall.x1 + ux * length, y: wall.y1 + uy * length };
    if (target.x < 0 || target.x > lotWidth || target.y < 0 || target.y > lotDepth) return;

    updateCustomWall(wallId, { x2: target.x, y2: target.y });
    pushRoomHistory(before);
  };

  const setCustomWallStart = (wallId: string, axis: "x" | "y", value: number) => {
    const wall = safeCustomWalls.find((item) => item.id === wallId);
    if (!wall || !Number.isFinite(value)) return;
    const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
    const before = snapshotEditor();

    if (horizontal) {
      if (axis === "x") {
        const next = Math.max(0, Math.min(lotWidth, value));
        if (Math.abs(wall.x2 - next) < 0.5) return;
        setCustomWalls((prev) => (Array.isArray(prev) ? prev : []).map((item) => item.id === wallId ? { ...item, x1: next } : item));
      } else {
        const next = Math.max(0, Math.min(lotDepth, value));
        setCustomWalls((prev) => (Array.isArray(prev) ? prev : []).map((item) => item.id === wallId ? { ...item, y1: next, y2: next } : item));
      }
    } else {
      if (axis === "x") {
        const next = Math.max(0, Math.min(lotWidth, value));
        setCustomWalls((prev) => (Array.isArray(prev) ? prev : []).map((item) => item.id === wallId ? { ...item, x1: next, x2: next } : item));
      } else {
        const next = Math.max(0, Math.min(lotDepth, value));
        if (Math.abs(wall.y2 - next) < 0.5) return;
        setCustomWalls((prev) => (Array.isArray(prev) ? prev : []).map((item) => item.id === wallId ? { ...item, y1: next } : item));
      }
    }

    pushRoomHistory(before);
  };

  const deleteCustomWall = (wallId: string) => {
    const before = snapshotEditor();
    setCustomWalls((prev) => (Array.isArray(prev) ? prev : []).filter((wall) => wall.id !== wallId));
    setCustomOpenings((prev) => (Array.isArray(prev) ? prev : []).filter((opening) => opening.wallId !== wallId));
    pushRoomHistory(before);
    setSelectedCustomWallId((current) => current === wallId ? null : current);
  };

  const updateCustomWallLength = (wallId: string, requestedLength: number) => {
    const wall = safeCustomWalls.find((item) => item.id === wallId);
    if (!wall) return;
    const length = Math.max(0.5, Math.min(Math.hypot(lotWidth, lotDepth), Number(requestedLength) || 0.5));
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const currentLength = Math.hypot(dx, dy);
    if (currentLength < 0.001) return;
    const before = snapshotEditor();
    const ux = dx / currentLength;
    const uy = dy / currentLength;
    const x2 = Math.max(0, Math.min(lotWidth, wall.x1 + ux * length));
    const y2 = Math.max(0, Math.min(lotDepth, wall.y1 + uy * length));
    updateCustomWall(wall.id, { x2, y2 });
    pushRoomHistory(before);
  };

  const duplicateCustomWall = (wallId: string) => {
    const wall = safeCustomWalls.find((item) => item.id === wallId);
    if (!wall) return;
    const before = snapshotEditor();
    const dx = wall.x2 - wall.x1;
    const dy = wall.y2 - wall.y1;
    const length = Math.max(0.001, Math.hypot(dx, dy));
    const offset = 0.25;
    const ox = (-dy / length) * offset;
    const oy = (dx / length) * offset;
    const copy: CustomWall = {
      ...wall,
      id: `custom-wall-${uid()}`,
      x1: Math.max(0, Math.min(lotWidth, wall.x1 + ox)),
      y1: Math.max(0, Math.min(lotDepth, wall.y1 + oy)),
      x2: Math.max(0, Math.min(lotWidth, wall.x2 + ox)),
      y2: Math.max(0, Math.min(lotDepth, wall.y2 + oy)),
    };
    setCustomWalls((prev) => [...(Array.isArray(prev) ? prev : []), copy]);
    setSelectedCustomWallId(copy.id);
    setSelectedWallId(null);
    pushRoomHistory(before);
  };

  const splitCustomWall = (wallId: string) => {
    const wall = safeCustomWalls.find((item) => item.id === wallId);
    if (!wall) return;
    const length = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (length < 1) return;

    const before = snapshotEditor();
    const midpoint = {
      x: (wall.x1 + wall.x2) / 2,
      y: (wall.y1 + wall.y2) / 2,
    };
    const secondWallId = `custom-wall-${uid()}`;
    const secondWall: CustomWall = {
      ...wall,
      id: secondWallId,
      x1: midpoint.x,
      y1: midpoint.y,
    };

    setCustomWalls((prev) => (Array.isArray(prev) ? prev : []).flatMap((item) => {
      if (item.id !== wallId) return [item];
      return [
        { ...item, x2: midpoint.x, y2: midpoint.y },
        secondWall,
      ];
    }));

    setCustomOpenings((prev) => (Array.isArray(prev) ? prev : []).map((opening) => {
      if (opening.wallId !== wallId) return opening;
      if (opening.offset < 0.5) {
        return { ...opening, offset: Math.max(0.02, Math.min(0.98, opening.offset * 2)) };
      }
      return {
        ...opening,
        wallId: secondWallId,
        offset: Math.max(0.02, Math.min(0.98, (opening.offset - 0.5) * 2)),
      };
    }));

    setSelectedCustomWallId(secondWallId);
    setSelectedWallId(null);
    pushRoomHistory(before);
  };

  const selectedCustomWall = safeCustomWalls.find((wall) => wall.id === selectedCustomWallId) ?? null;

  useEffect(() => {
    if (!selectedCustomWallId || editorView !== "plan") return;
    const handleWallShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable) return;

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteCustomWall(selectedCustomWallId);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateCustomWall(selectedCustomWallId);
      }
    };
    window.addEventListener("keydown", handleWallShortcut);
    return () => window.removeEventListener("keydown", handleWallShortcut);
  }, [editorView, selectedCustomWallId]);

  const visibleLibraryMaterials = useMemo(() => {
    const query = furnitureSearch.trim().toLocaleLowerCase("pt-BR");
    const allMaterials = mergeMaterialOptions(
      [...CONCEPT_OBJECT_MATERIALS, ...CONCEPT_WALL_MATERIALS, ...CONCEPT_FLOOR_MATERIALS],
      catalogMaterialOptions,
    );
    const compatible = selectedObject
      ? objectMaterialOptions
      : selectedCustomWall || selectedWall
        ? wallMaterialOptions
        : selected || selectedClosedSpace
          ? floorMaterialOptions
          : allMaterials;

    return compatible
      .filter((material) => {
        if (!query) return true;
        return `${material.name} ${material.category} ${material.source ?? ""}`
          .toLocaleLowerCase("pt-BR")
          .includes(query);
      })
      .slice(0, 24);
  }, [
    catalogMaterialOptions,
    floorMaterialOptions,
    furnitureSearch,
    objectMaterialOptions,
    selected,
    selectedClosedSpace,
    selectedCustomWall,
    selectedObject,
    selectedWall,
    wallMaterialOptions,
  ]);

  const customWallTopology = useMemo(
    () =>
      buildOrthogonalWallTopology(
        customWalls
          .filter((wall) => wall.floor === activeFloor)
          .map((wall) => ({
            id: wall.id,
            x1: wall.x1,
            y1: wall.y1,
            x2: wall.x2,
            y2: wall.y2,
          })),
      ),
    [customWalls, activeFloor],
  );

  const moveTopologyJunction = (
    refs: WallTopologyEndpointRef[],
    rawPoint: { x: number; y: number },
  ) => {
    if (refs.length < 2) return;
    const before = editStartRef.current ?? snapshotEditor();
    const target = {
      x: Math.max(0, Math.min(lotWidth, Math.round(rawPoint.x * 4) / 4)),
      y: Math.max(0, Math.min(lotDepth, Math.round(rawPoint.y * 4) / 4)),
    };

    const original = Array.isArray(customWallsRef.current) ? customWallsRef.current : [];
    const byId = new Map(original.map((wall) => [wall.id, { ...wall }]));
    const endpointKey = (x: number, y: number) =>
      `${Math.round(x * 1000) / 1000}:${Math.round(y * 1000) / 1000}`;

    const endpointNodes = new Map<string, WallTopologyEndpointRef[]>();
    for (const wall of original.filter((item) => item.floor === activeFloor)) {
      const entries = [
        { key: endpointKey(wall.x1, wall.y1), ref: { wallId: wall.id, endpoint: "start" as const } },
        { key: endpointKey(wall.x2, wall.y2), ref: { wallId: wall.id, endpoint: "end" as const } },
      ];
      for (const entry of entries) {
        endpointNodes.set(entry.key, [...(endpointNodes.get(entry.key) ?? []), entry.ref]);
      }
    }

    const startWall = byId.get(refs[0].wallId);
    if (!startWall) return;
    const startPoint = refs[0].endpoint === "start"
      ? { x: startWall.x1, y: startWall.y1 }
      : { x: startWall.x2, y: startWall.y2 };
    const startKey = endpointKey(startPoint.x, startPoint.y);

    const queue: Array<{ key: string; axis: "x" | "y"; value: number }> = [
      { key: startKey, axis: "x", value: target.x },
      { key: startKey, axis: "y", value: target.y },
    ];
    const visited = new Set<string>();

    while (queue.length) {
      const current = queue.shift()!;
      const visitKey = `${current.key}:${current.axis}`;
      if (visited.has(visitKey)) continue;
      visited.add(visitKey);

      const nodeRefs = endpointNodes.get(current.key) ?? [];
      for (const ref of nodeRefs) {
        const wall = byId.get(ref.wallId);
        if (!wall) continue;
        const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
        const remote = ref.endpoint === "start"
          ? { x: wall.x2, y: wall.y2, endpoint: "end" as const }
          : { x: wall.x1, y: wall.y1, endpoint: "start" as const };
        const remoteKeyBefore = endpointKey(remote.x, remote.y);

        if (current.axis === "x") {
          if (horizontal) {
            if (ref.endpoint === "start") wall.x1 = current.value;
            else wall.x2 = current.value;
          } else {
            wall.x1 = current.value;
            wall.x2 = current.value;
            queue.push({ key: remoteKeyBefore, axis: "x", value: current.value });
          }
        } else if (horizontal) {
          wall.y1 = current.value;
          wall.y2 = current.value;
          queue.push({ key: remoteKeyBefore, axis: "y", value: current.value });
        } else {
          if (ref.endpoint === "start") wall.y1 = current.value;
          else wall.y2 = current.value;
        }
      }
    }

    const next = original.map((wall) => byId.get(wall.id) ?? wall);
    const invalid = next.some((wall) =>
      wall.floor === activeFloor &&
      Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1) < 0.5
    );
    if (invalid) return;

    setCustomWalls(next);
    if (!editStartRef.current) pushRoomHistory(before);
  };

  const addOpeningToCustomWall = (wallId: string, type: "door" | "window") => {
    const wall = safeCustomWalls.find((item) => item.id === wallId);
    if (!wall) return;
    const before = snapshotEditor();
    const wallLength = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    const requestedWidth = type === "door" ? 0.90 : 1.20;
    const openingWidth = Math.max(0.3, Math.min(requestedWidth, wallLength - 0.1));
    const opening: CustomOpening = {
      id: `custom-opening-${uid()}`,
      wallId,
      floor: wall.floor,
      type,
      offset: 0.5,
      width: openingWidth,
      height: type === "door" ? 2.10 : 1.20,
      sillHeight: type === "door" ? 0 : 0.90,
      openingStyle: type === "door" ? "hinged" : "sliding",
      swing: "left",
      swingSide: "inside",
      leafCount: type === "door" ? 1 : 2,
      frameProfile: "",
      glassType: type === "door" ? "" : "Incolor",
    };
    setCustomOpenings((prev) => [...(Array.isArray(prev) ? prev : []), opening]);
    pushRoomHistory(before);
    setInteractionMode("opening");
    setSelectedOpeningId(opening.id);
    setSelectedCustomWallId(null);
  };

  const boundaryWallForSelectedSpace = () => {
    if (!selectedClosedSpace) return null;
    const { x, y, width, height } = selectedClosedSpace.bounds;
    const right = x + width;
    const bottom = y + height;
    const epsilon = 0.08;

    const candidates = safeCustomWalls
      .filter((wall) => wall.floor === activeFloor)
      .filter((wall) => {
        const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
        if (horizontal) {
          const onBoundary = Math.abs(wall.y1 - y) <= epsilon || Math.abs(wall.y1 - bottom) <= epsilon;
          const minX = Math.min(wall.x1, wall.x2);
          const maxX = Math.max(wall.x1, wall.x2);
          return onBoundary && maxX >= x - epsilon && minX <= right + epsilon;
        }
        const onBoundary = Math.abs(wall.x1 - x) <= epsilon || Math.abs(wall.x1 - right) <= epsilon;
        const minY = Math.min(wall.y1, wall.y2);
        const maxY = Math.max(wall.y1, wall.y2);
        return onBoundary && maxY >= y - epsilon && minY <= bottom + epsilon;
      })
      .sort((a, b) =>
        Math.hypot(b.x2 - b.x1, b.y2 - b.y1) - Math.hypot(a.x2 - a.x1, a.y2 - a.y1)
      );

    return candidates[0] ?? null;
  };

  const addOpeningToSelectedSpace = (type: "door" | "window") => {
    const wall = boundaryWallForSelectedSpace();
    if (!wall) {
      setInteractionMode("wall");
      setEditorLibraryTab("build");
      setLibraryOpen(true);
      return;
    }
    addOpeningToCustomWall(wall.id, type);
  };

  const furnishSelectedSpace = () => {
    if (!selectedClosedSpace) return;
    const kind = selectedSpaceProfile?.kind ?? "outro";
    const bounds = selectedClosedSpace.bounds;
    const pad = 0.35;
    const innerX = bounds.x + pad;
    const innerY = bounds.y + pad;
    const innerWidth = Math.max(0.8, bounds.width - pad * 2);
    const innerHeight = Math.max(0.8, bounds.height - pad * 2);
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    const landscape = bounds.width >= bounds.height;

    type FurnishPreset = {
      kind: ConceptPlanObject["kind"];
      label: string;
      width: number;
      depth: number;
      x: number;
      y: number;
      rotation?: number;
      wallAffinity?: "top" | "bottom" | "left" | "right" | "center";
    };

    const place = (
      itemKind: ConceptPlanObject["kind"],
      label: string,
      width: number,
      depth: number,
      x: number,
      y: number,
      rotation = 0,
      wallAffinity: FurnishPreset["wallAffinity"] = "center",
    ): FurnishPreset => ({
      kind: itemKind,
      label,
      width: Math.min(width, innerWidth),
      depth: Math.min(depth, innerHeight),
      x,
      y,
      rotation,
      wallAffinity,
    });

    const boundaryWalls = safeCustomWalls.filter((wall) => {
      if (wall.floor !== activeFloor) return false;
      const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
      if (horizontal) {
        const onBoundary = Math.abs(wall.y1 - bounds.y) <= 0.08 || Math.abs(wall.y1 - (bounds.y + bounds.height)) <= 0.08;
        const minX = Math.min(wall.x1, wall.x2);
        const maxX = Math.max(wall.x1, wall.x2);
        return onBoundary && maxX >= bounds.x - 0.08 && minX <= bounds.x + bounds.width + 0.08;
      }
      const onBoundary = Math.abs(wall.x1 - bounds.x) <= 0.08 || Math.abs(wall.x1 - (bounds.x + bounds.width)) <= 0.08;
      const minY = Math.min(wall.y1, wall.y2);
      const maxY = Math.max(wall.y1, wall.y2);
      return onBoundary && maxY >= bounds.y - 0.08 && minY <= bounds.y + bounds.height + 0.08;
    });

    const doorClearances = safeCustomOpenings
      .filter((opening) => opening.floor === activeFloor && opening.type === "door")
      .flatMap((opening) => {
        const wall = boundaryWalls.find((item) => item.id === opening.wallId);
        if (!wall) return [];
        const offset = Math.max(0.02, Math.min(0.98, opening.offset));
        const px = wall.x1 + (wall.x2 - wall.x1) * offset;
        const py = wall.y1 + (wall.y2 - wall.y1) * offset;
        const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
        const width = Math.max(0.7, opening.width ?? 0.9);
        return [{
          x: horizontal ? px - width / 2 - 0.45 : px - 0.70,
          y: horizontal ? py - 0.70 : py - width / 2 - 0.45,
          width: horizontal ? width + 0.90 : 1.40,
          height: horizontal ? 1.40 : width + 0.90,
        }];
      });

    const windowClearances = safeCustomOpenings
      .filter((opening) => opening.floor === activeFloor && opening.type === "window")
      .flatMap((opening) => {
        const wall = boundaryWalls.find((item) => item.id === opening.wallId);
        if (!wall) return [];
        const offset = Math.max(0.02, Math.min(0.98, opening.offset));
        const px = wall.x1 + (wall.x2 - wall.x1) * offset;
        const py = wall.y1 + (wall.y2 - wall.y1) * offset;
        const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
        const width = Math.max(0.8, opening.width ?? 1.2);
        return [{
          x: horizontal ? px - width / 2 - 0.20 : px - 0.42,
          y: horizontal ? py - 0.42 : py - width / 2 - 0.20,
          width: horizontal ? width + 0.40 : 0.84,
          height: horizontal ? 0.84 : width + 0.40,
        }];
      });

    const wallUsableIntervals = (side: "top" | "bottom" | "left" | "right") => {
      const horizontal = side === "top" || side === "bottom";
      const wallCoord = side === "top" ? bounds.y
        : side === "bottom" ? bounds.y + bounds.height
          : side === "left" ? bounds.x
            : bounds.x + bounds.width;
      const start = horizontal ? bounds.x : bounds.y;
      const end = horizontal ? bounds.x + bounds.width : bounds.y + bounds.height;
      const blocked = safeCustomOpenings
        .filter((opening) => opening.floor === activeFloor)
        .flatMap((opening) => {
          const wall = boundaryWalls.find((item) => item.id === opening.wallId);
          if (!wall) return [];
          const wallHorizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
          if (wallHorizontal !== horizontal) return [];
          const matchesSide = horizontal ? Math.abs(wall.y1 - wallCoord) <= 0.08 : Math.abs(wall.x1 - wallCoord) <= 0.08;
          if (!matchesSide) return [];
          const axisStart = horizontal ? wall.x1 : wall.y1;
          const axisEnd = horizontal ? wall.x2 : wall.y2;
          const center = axisStart + (axisEnd - axisStart) * opening.offset;
          const half = Math.max(0.35, (opening.width ?? (opening.type === "door" ? 0.9 : 1.2)) / 2) + 0.18;
          return [{ start: center - half, end: center + half }];
        })
        .sort((a, b) => a.start - b.start);

      const intervals: Array<{ start: number; end: number }> = [];
      let cursor = start + 0.15;
      for (const block of blocked) {
        const bStart = Math.max(start, block.start);
        const bEnd = Math.min(end, block.end);
        if (bStart - cursor >= 0.55) intervals.push({ start: cursor, end: bStart });
        cursor = Math.max(cursor, bEnd);
      }
      if (end - 0.15 - cursor >= 0.55) intervals.push({ start: cursor, end: end - 0.15 });
      return intervals.sort((a, b) => (b.end - b.start) - (a.end - a.start));
    };

    const bestWallSide = (() => {
      const sides = (["top", "bottom", "left", "right"] as const).map((side) => ({
        side,
        intervals: wallUsableIntervals(side),
      }));
      return sides
        .map((entry) => ({
          ...entry,
          score: entry.intervals[0] ? entry.intervals[0].end - entry.intervals[0].start : 0,
        }))
        .sort((a, b) => b.score - a.score)[0];
    })();

    const overlaps = (
      a: { x: number; y: number; width: number; depth: number },
      b: { x: number; y: number; width: number; depth?: number; height?: number },
      margin = 0.12,
    ) => {
      const bDepth = b.depth ?? b.height ?? 0;
      return !(
        a.x + a.width + margin <= b.x ||
        a.x >= b.x + b.width + margin ||
        a.y + a.depth + margin <= b.y ||
        a.y >= b.y + bDepth + margin
      );
    };

    const preferredSide = bestWallSide?.score > 0.8 ? bestWallSide.side : null;
    const effectiveLandscape = preferredSide === "left" || preferredSide === "right"
      ? false
      : preferredSide === "top" || preferredSide === "bottom"
        ? true
        : landscape;

    let presets: FurnishPreset[] = [];
    if (kind === "sala" || kind === "gourmet") {
      presets = effectiveLandscape
        ? [
            place("sofa", "Sofá 3 lugares", 2.2, 0.9, cx - 1.1, innerY + 0.12, 0, "top"),
            place("table", "Mesa centro", 1.1, 0.6, cx - 0.55, cy - 0.3, 0, "center"),
            place("tv", "TV / painel", 1.6, 0.3, cx - 0.8, bounds.y + bounds.height - 0.60, 0, "bottom"),
            place("chair", "Poltrona", 0.8, 0.8, innerX + 0.12, cy - 0.4, 90, "left"),
          ]
        : [
            place("sofa", "Sofá 3 lugares", 0.9, 2.2, innerX + 0.12, cy - 1.1, 90, "left"),
            place("table", "Mesa centro", 0.6, 1.1, cx - 0.3, cy - 0.55, 90, "center"),
            place("tv", "TV / painel", 0.3, 1.6, bounds.x + bounds.width - 0.60, cy - 0.8, 90, "right"),
            place("chair", "Poltrona", 0.8, 0.8, cx - 0.4, innerY + 0.12, 0, "top"),
          ];
    } else if (kind === "quarto" || kind === "suite") {
      presets = effectiveLandscape
        ? [
            place("bed", "Cama casal", 1.6, 2.0, cx - 0.8, innerY + 0.12, 0, "top"),
            place("cabinet", "Guarda-roupa", Math.min(1.8, innerWidth * 0.55), 0.6, innerX + 0.10, bounds.y + bounds.height - 0.92, 0, "bottom"),
            place("lamp", "Abajur", 0.35, 0.35, Math.max(innerX, cx - 1.18), innerY + 0.18, 0, "top"),
            place("lamp", "Abajur", 0.35, 0.35, Math.min(bounds.x + bounds.width - 0.70, cx + 0.82), innerY + 0.18, 0, "top"),
          ]
        : [
            place("bed", "Cama casal", 2.0, 1.6, innerX + 0.12, cy - 0.8, 90, "left"),
            place("cabinet", "Guarda-roupa", 0.6, Math.min(1.8, innerHeight * 0.55), bounds.x + bounds.width - 0.92, innerY + 0.10, 90, "right"),
            place("lamp", "Abajur", 0.35, 0.35, innerX + 0.18, Math.max(innerY, cy - 1.18), 90, "left"),
            place("lamp", "Abajur", 0.35, 0.35, innerX + 0.18, Math.min(bounds.y + bounds.height - 0.70, cy + 0.82), 90, "left"),
          ];
    } else if (kind === "cozinha") {
      presets = effectiveLandscape
        ? [
            place("cabinet", "Balcão cozinha", Math.min(2.2, innerWidth - 0.2), 0.6, innerX + 0.1, innerY + 0.1, 0, "top"),
            place("cabinet", "Armário cozinha", Math.min(1.8, innerWidth * 0.5), 0.6, innerX + 0.1, bounds.y + bounds.height - 0.92, 0, "bottom"),
            place("table", "Mesa apoio", Math.min(1.2, innerWidth * 0.45), 0.7, cx - Math.min(1.2, innerWidth * 0.45) / 2, cy - 0.35, 0, "center"),
          ]
        : [
            place("cabinet", "Balcão cozinha", 0.6, Math.min(2.2, innerHeight - 0.2), innerX + 0.1, innerY + 0.1, 90, "left"),
            place("cabinet", "Armário cozinha", 0.6, Math.min(1.8, innerHeight * 0.5), bounds.x + bounds.width - 0.92, innerY + 0.1, 90, "right"),
            place("table", "Mesa apoio", 0.7, Math.min(1.2, innerHeight * 0.45), cx - 0.35, cy - Math.min(1.2, innerHeight * 0.45) / 2, 90, "center"),
          ];
    } else if (kind === "banheiro") {
      presets = [
        place("cabinet", "Gabinete banheiro", 0.8, 0.5, innerX + 0.08, innerY + 0.08, 0, "top"),
        place("shower_point", "Chuveiro", 0.45, 0.45, bounds.x + bounds.width - 0.82, innerY + 0.08, 0, "top"),
        place("water_point", "Ponto de água", 0.4, 0.4, innerX + 0.12, bounds.y + bounds.height - 0.78, 0, "bottom"),
      ];
    } else if (kind === "lavanderia") {
      presets = [
        place("cabinet", "Armário lavanderia", Math.min(1.4, innerWidth * 0.55), 0.6, innerX + 0.08, innerY + 0.08, 0, "top"),
        place("water_point", "Ponto máquina", 0.4, 0.4, bounds.x + bounds.width - 0.78, innerY + 0.10, 0, "top"),
        place("drain_point", "Esgoto máquina", 0.4, 0.4, bounds.x + bounds.width - 0.78, innerY + 0.62, 0, "right"),
      ];
    } else if (kind === "garagem") {
      presets = [
        place("cabinet", "Armário garagem", 1.4, 0.55, innerX + 0.08, innerY + 0.08, 0, "top"),
        place("light_point", "Ponto de luz", 0.45, 0.45, cx - 0.225, cy - 0.225, 0, "center"),
      ];
    } else if (kind === "circulacao") {
      presets = [
        place("light_point", "Ponto de luz", 0.45, 0.45, cx - 0.225, cy - 0.225, 0, "center"),
      ];
    } else {
      presets = [
        place("table", "Mesa", Math.min(1.2, innerWidth * 0.55), 0.7, cx - Math.min(1.2, innerWidth * 0.55) / 2, cy - 0.35, 0, "center"),
        place("chair", "Cadeira", 0.55, 0.55, cx - 0.275, Math.min(bounds.y + bounds.height - 0.9, cy + 0.55), 0, "center"),
      ];
    }

    const existingInSpace = safeObjects.filter((object) =>
      object.floor === activeFloor &&
      object.x + object.width / 2 >= bounds.x &&
      object.x + object.width / 2 <= bounds.x + bounds.width &&
      object.y + object.depth / 2 >= bounds.y &&
      object.y + object.depth / 2 <= bounds.y + bounds.height
    );

    const occupiedBase: Array<{ x: number; y: number; width: number; depth: number }> = existingInSpace.map((object) => ({
      x: object.x,
      y: object.y,
      width: object.width,
      depth: object.depth,
    }));

    const offsets = [
      [0, 0],
      [0.35, 0],
      [-0.35, 0],
      [0, 0.35],
      [0, -0.35],
      [0.55, 0.35],
      [-0.55, 0.35],
      [0.55, -0.35],
      [-0.55, -0.35],
    ];

    const transformPreset = (
      item: FurnishPreset,
      mode: "base" | "mirror-x" | "mirror-y" | "mirror-xy",
    ): FurnishPreset => {
      const mirrorX = mode === "mirror-x" || mode === "mirror-xy";
      const mirrorY = mode === "mirror-y" || mode === "mirror-xy";
      const x = mirrorX ? bounds.x + bounds.width - (item.x - bounds.x) - item.width : item.x;
      const y = mirrorY ? bounds.y + bounds.height - (item.y - bounds.y) - item.depth : item.y;
      const affinity = item.wallAffinity === "left" && mirrorX ? "right"
        : item.wallAffinity === "right" && mirrorX ? "left"
          : item.wallAffinity === "top" && mirrorY ? "bottom"
            : item.wallAffinity === "bottom" && mirrorY ? "top"
              : item.wallAffinity;
      return {
        ...item,
        x,
        y,
        wallAffinity: affinity,
        rotation: ((item.rotation ?? 0) + (mirrorX !== mirrorY ? 180 : 0)) % 360,
      };
    };

    const wallAffinityDistance = (item: FurnishPreset, x: number, y: number) => {
      if (!item.wallAffinity || item.wallAffinity === "center") return 0;
      if (item.wallAffinity === "top") return Math.abs(y - bounds.y);
      if (item.wallAffinity === "bottom") return Math.abs(bounds.y + bounds.height - (y + item.depth));
      if (item.wallAffinity === "left") return Math.abs(x - bounds.x);
      return Math.abs(bounds.x + bounds.width - (x + item.width));
    };

    const buildCandidate = (variantPresets: FurnishPreset[]) => {
      const occupied = occupiedBase.map((item) => ({ ...item }));
      const objects: ConceptPlanObject[] = [];
      let score = 0;

      for (const item of variantPresets.filter((preset) => preset.width >= 0.3 && preset.depth >= 0.3)) {
        let best:
          | { x: number; y: number; localScore: number }
          | null = null;

        for (const [ox, oy] of offsets) {
          const x = Math.max(bounds.x + 0.08, Math.min(bounds.x + bounds.width - item.width - 0.08, item.x + ox));
          const y = Math.max(bounds.y + 0.08, Math.min(bounds.y + bounds.height - item.depth - 0.08, item.y + oy));
          const candidate = { x, y, width: item.width, depth: item.depth };
          const hitsDoor = doorClearances.some((clearance) => overlaps(candidate, clearance, 0.05));
          const wallMounted = item.kind === "tv" || item.kind === "cabinet" || item.kind === "bed" || item.kind === "sofa";
          const hitsWindow = wallMounted && windowClearances.some((clearance) => overlaps(candidate, clearance, 0.03));
          const minFurnitureGap =
            item.kind === "chair" || item.kind === "table" ? 0.45 :
            item.kind === "bed" || item.kind === "sofa" ? 0.35 : 0.25;
          const hitsCirculation = occupied.some((other) => overlaps(candidate, other, minFurnitureGap));
          if (hitsCirculation || hitsDoor || hitsWindow) continue;

          const affinityPenalty = wallAffinityDistance(item, x, y) * 8;
          const centerDistance = Math.hypot(x + item.width / 2 - cx, y + item.depth / 2 - cy);
          const circulationBonus = item.wallAffinity === "center" ? Math.max(0, 2.2 - centerDistance) * 2 : 0;
          const wallBonus = item.wallAffinity && item.wallAffinity !== "center" ? Math.max(0, 0.45 - affinityPenalty / 8) * 8 : 0;
          const localScore = 20 + circulationBonus + wallBonus - affinityPenalty;

          if (!best || localScore > best.localScore) best = { x, y, localScore };
        }

        if (!best) {
          score -= 18;
          continue;
        }

        const object: ConceptPlanObject = {
          id: `concept-object-${uid()}`,
          kind: item.kind,
          label: item.label,
          floor: activeFloor,
          width: item.width,
          depth: item.depth,
          x: Math.max(0, Math.min(lotWidth - item.width, best.x)),
          y: Math.max(0, Math.min(lotDepth - item.depth, best.y)),
          rotation: item.rotation ?? 0,
        };
        objects.push(object);
        occupied.push({ x: object.x, y: object.y, width: object.width, depth: object.depth });
        score += best.localScore;
      }

      const coverage = presets.length ? objects.length / presets.length : 0;
      score += coverage * 40;
      const wallUtilization = objects.reduce((sum, object) => {
        const nearWall = Math.min(
          Math.abs(object.x - bounds.x),
          Math.abs(bounds.x + bounds.width - (object.x + object.width)),
          Math.abs(object.y - bounds.y),
          Math.abs(bounds.y + bounds.height - (object.y + object.depth)),
        );
        return sum + (nearWall <= 0.45 ? 4 : 0);
      }, 0);
      score += wallUtilization;

      return { objects, score };
    };

    const variants = (["base", "mirror-x", "mirror-y", "mirror-xy"] as const)
      .map((mode) => buildCandidate(presets.map((item) => transformPreset(item, mode))))
      .sort((a, b) => b.score - a.score);

    const options = variants
      .filter((variant) => variant.objects.length > 0)
      .slice(0, 3)
      .map((variant, index) => ({
        id: `layout-${index + 1}-${uid()}`,
        score: variant.score,
        objects: variant.objects,
        doorZones: doorClearances.map((zone) => ({ ...zone })),
        windowZones: windowClearances.map((zone) => ({ ...zone })),
      }));

    if (!options.length) return;
    setFurnishLayoutOptions(options);
    setFurnishLayoutSpaceId(selectedClosedSpace.id);
    setPreviewFurnishLayoutId(options[0]?.id ?? null);
    setEditorView("plan");
  };

  const applyFurnishLayoutOption = (optionId: string) => {
    const option = furnishLayoutOptions.find((item) => item.id === optionId);
    if (!option || !selectedClosedSpace || furnishLayoutSpaceId !== selectedClosedSpace.id) return;
    const before = snapshotEditor();
    const created = option.objects.map((object) => ({
      ...object,
      id: `concept-object-${uid()}`,
    }));
    setObjects((prev) => [...(Array.isArray(prev) ? prev : []), ...created]);
    setSelectedObjectId(created[0]?.id ?? null);
    setSelectedId(null);
    setSelectedOpeningId(null);
    setSelectedWallId(null);
    setSelectedCustomWallId(null);
    setSelectedClosedSpaceId(null);
    setFurnishLayoutOptions([]);
    setFurnishLayoutSpaceId(null);
    setPreviewFurnishLayoutId(null);
    setEditorView("plan");
    pushRoomHistory(before);
  };

  const cancelFurnishLayoutOptions = () => {
    setFurnishLayoutOptions([]);
    setFurnishLayoutSpaceId(null);
    setPreviewFurnishLayoutId(null);
  };

  const addOpeningPreset = (
    wallId: string,
    preset: Pick<CustomOpening, "type" | "width" | "height" | "sillHeight" | "openingStyle" | "swing"> & Partial<Pick<CustomOpening, "familyId" | "familyLabel">>,
  ) => {
    const wall = safeCustomWalls.find((item) => item.id === wallId);
    if (!wall) return;
    const before = snapshotEditor();
    const opening: CustomOpening = {
      id: `custom-opening-${uid()}`,
      wallId,
      floor: wall.floor,
      type: preset.type,
      offset: 0.5,
      width: preset.width,
      height: preset.height,
      sillHeight: preset.type === "door" ? 0 : preset.sillHeight,
      openingStyle: preset.openingStyle,
      swing: preset.swing ?? "left",
      swingSide: "inside",
      leafCount: preset.type === "door" ? 1 : 2,
      frameProfile: "",
      glassType: preset.type === "door" ? "" : "Incolor",
      familyId: preset.familyId,
      familyLabel: preset.familyLabel,
    };
    setCustomOpenings((prev) => [...(Array.isArray(prev) ? prev : []), opening]);
    pushRoomHistory(before);
    setInteractionMode("opening");
    setSelectedOpeningId(opening.id);
    setSelectedCustomWallId(null);
    closeLibraryOnMobile();
  };

  const updateCustomOpeningParams = (
    openingId: string,
    patch: Partial<Pick<CustomOpening, "width" | "height" | "sillHeight" | "openingStyle" | "swing" | "swingSide" | "leafCount" | "frameProfile" | "glassType" | "manufacturer" | "catalogProductId">>,
  ) => {
    const before = snapshotEditor();
    setCustomOpenings((prev) => (Array.isArray(prev) ? prev : []).map((opening) => {
      if (opening.id !== openingId) return opening;
      const next = { ...opening, ...patch };
      const normalized = {
        ...next,
        ...normalizeOpeningDimensions(next),
      };
      const wall = safeCustomWalls.find((item) => item.id === normalized.wallId);
      if (!wall) return normalized;
      const wallLength = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
      return constrainOpeningToWall(normalized, wallLength);
    }));
    pushRoomHistory(before);
  };

  const setCustomOpeningOffset = (openingId: string, rawPercent: number) => {
    const opening = safeCustomOpenings.find((item) => item.id === openingId);
    const wall = opening ? safeCustomWalls.find((item) => item.id === opening.wallId) : null;
    if (!opening || !wall || !Number.isFinite(rawPercent)) return;
    const wallLength = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (wallLength < 0.001) return;
    const halfOpening = Math.min(wallLength / 2, Math.max(0.25, (opening.width ?? (opening.type === "door" ? 0.9 : 1.2)) / 2));
    const minOffset = halfOpening / wallLength;
    const maxOffset = 1 - minOffset;
    const nextOffset = Math.max(minOffset, Math.min(maxOffset, rawPercent / 100));
    const before = snapshotEditor();
    setCustomOpenings((prev) => (Array.isArray(prev) ? prev : []).map((item) =>
      item.id === openingId ? { ...item, offset: nextOffset } : item
    ));
    pushRoomHistory(before);
  };

  const toggleCustomOpeningSwing = (openingId: string) => {
    const opening = safeCustomOpenings.find((item) => item.id === openingId);
    if (!opening) return;
    updateCustomOpeningParams(openingId, { swing: opening.swing === "right" ? "left" : "right" });
  };

  const toggleCustomOpeningSide = (openingId: string) => {
    const opening = safeCustomOpenings.find((item) => item.id === openingId);
    if (!opening) return;
    updateCustomOpeningParams(openingId, { swingSide: opening.swingSide === "outside" ? "inside" : "outside" });
  };

  const duplicateCustomOpening = (openingId: string) => {
    const opening = safeCustomOpenings.find((item) => item.id === openingId);
    const wall = opening ? safeCustomWalls.find((item) => item.id === opening.wallId) : null;
    if (!opening || !wall) return;
    const wallLength = Math.hypot(wall.x2 - wall.x1, wall.y2 - wall.y1);
    if (wallLength < 0.001) return;
    const before = snapshotEditor();
    const shift = Math.max((opening.width ?? (opening.type === "door" ? 0.9 : 1.2)) / wallLength + 0.04, 0.08);
    const candidate = opening.offset + shift <= 0.92 ? opening.offset + shift : opening.offset - shift;
    const copy: CustomOpening = {
      ...opening,
      id: `custom-opening-${uid()}`,
      offset: Math.max(0.08, Math.min(0.92, candidate)),
    };
    setCustomOpenings((prev) => [...(Array.isArray(prev) ? prev : []), copy]);
    setSelectedOpeningId(copy.id);
    setSelectedCustomWallId(null);
    pushRoomHistory(before);
  };

  const openOpeningProductPicker = (openingId: string) => {
    const opening = safeCustomOpenings.find((item) => item.id === openingId);
    if (!opening) return;
    setOpeningProductPickerId(openingId);
    setEditorLibraryTab("furniture");
    setItemLibrarySection("products");
    setFurnitureCategory("Todos");
    setLibraryMode("all");
    setFurnitureSearch(opening.type === "door" ? "porta" : "janela");
    setLibraryOpen(true);
  };

  const applyCatalogProductToOpening = (openingId: string, item: RealCatalogProduct) => {
    const opening = safeCustomOpenings.find((candidate) => candidate.id === openingId);
    if (!opening) return;
    const kind = catalogOpeningKind(item);
    if (!kind || kind !== opening.type) return;
    const dims = catalogOpeningDimensions(item);
    const before = snapshotEditor();
    setCustomOpenings((prev) => (Array.isArray(prev) ? prev : []).map((candidate) => {
      if (candidate.id !== openingId) return candidate;
      const next: CustomOpening = {
        ...candidate,
        catalogProductId: item.id,
        manufacturer: item.fornecedor ?? candidate.manufacturer,
        frameProfile: dims.profile ?? candidate.frameProfile,
        glassType: kind === "window" ? (dims.glass ?? candidate.glassType) : candidate.glassType,
        width: dims.width ?? candidate.width,
        height: dims.height ?? candidate.height,
      };
      return {
        ...next,
        ...normalizeOpeningDimensions(next),
      };
    }));
    pushRoomHistory(before);
    rememberRecentItem(realLibraryItemKey(item.id));
    setOpeningProductPickerId(null);
    setFurnitureSearch("");
    closeLibraryOnMobile();
  };

  const deleteCustomOpening = (openingId: string) => {
    const before = snapshotEditor();
    setCustomOpenings((prev) => (Array.isArray(prev) ? prev : []).filter((opening) => opening.id !== openingId));
    pushRoomHistory(before);
    setSelectedOpeningId((current) => current === openingId ? null : current);
  };

  const moveWallById = (wallId: string, delta: number) => {
    if (!delta) return;
    const wall = geometry.walls.find((item) => item.id === wallId);
    if (!wall) return;

    const vertical = Math.abs(wall.x1 - wall.x2) < 0.01;
    const minSize = 1;
    const epsilon = 0.08;

    setRooms((prev) => {
      const affected = (Array.isArray(prev) ? prev : []).filter((room) => wall.roomIds.includes(room.id));
      if (!affected.length || affected.some((room) => room.locked)) return Array.isArray(prev) ? prev : [];

      const patches = new Map<string, Partial<Room>>();
      for (const room of affected) {
        if (vertical) {
          const touchesLeft = Math.abs(room.x - wall.x1) < epsilon;
          const touchesRight = Math.abs(room.x + room.width - wall.x1) < epsilon;
          if (touchesLeft) {
            const nextX = room.x + delta;
            const nextWidth = room.width - delta;
            if (nextX < 0 || nextWidth < minSize) return Array.isArray(prev) ? prev : [];
            patches.set(room.id, { x: nextX, width: nextWidth });
          } else if (touchesRight) {
            const nextWidth = room.width + delta;
            if (room.x + nextWidth > lotWidth || nextWidth < minSize) return Array.isArray(prev) ? prev : [];
            patches.set(room.id, { width: nextWidth });
          }
        } else {
          const touchesTop = Math.abs(room.y - wall.y1) < epsilon;
          const touchesBottom = Math.abs(room.y + room.depth - wall.y1) < epsilon;
          if (touchesTop) {
            const nextY = room.y + delta;
            const nextDepth = room.depth - delta;
            if (nextY < 0 || nextDepth < minSize) return Array.isArray(prev) ? prev : [];
            patches.set(room.id, { y: nextY, depth: nextDepth });
          } else if (touchesBottom) {
            const nextDepth = room.depth + delta;
            if (room.y + nextDepth > lotDepth || nextDepth < minSize) return Array.isArray(prev) ? prev : [];
            patches.set(room.id, { depth: nextDepth });
          }
        }
      }

      if (!patches.size) return Array.isArray(prev) ? prev : [];
      return (Array.isArray(prev) ? prev : []).map((room) => patches.has(room.id) ? { ...room, ...patches.get(room.id) } : room);
    });
  };

  const nudgeSelectedWall = (delta: number) => {
    if (!selectedWall) return;
    const before = snapshotEditor();
    moveWallById(selectedWall.id, delta);
    pushRoomHistory(before);
  };

  const moveOpening = (amount: number) => {
    if (!selectedOpening) return;
    const before = snapshotEditor();
    const next = nudgeOpening(selectedOpening, amount, lotWidth, lotDepth);
    updateOpeningById(selectedOpening.id, { x: next.x, y: next.y, type: next.type });
    pushRoomHistory(before);
  };

  const toggleOpeningType = () => {
    if (!selectedOpening) return;
    const before = snapshotEditor();
    const nextType = selectedOpening.type === "door" ? "window" : "door";
    updateOpeningById(selectedOpening.id, {
      x: selectedOpening.x,
      y: selectedOpening.y,
      type: nextType,
    });
    const custom = safeCustomOpenings.find((opening) => opening.id === selectedOpening.id);
    if (custom) {
      setCustomOpenings((prev) => (Array.isArray(prev) ? prev : []).map((opening) =>
        opening.id === selectedOpening.id
          ? {
              ...opening,
              type: nextType,
              width: nextType === "door" ? Math.min(opening.width ?? 0.9, 1.4) : Math.max(opening.width ?? 1.2, 0.8),
              height: nextType === "door" ? 2.1 : 1.2,
              sillHeight: nextType === "door" ? 0 : 0.9,
              openingStyle: nextType === "door" ? "hinged" : "sliding",
            }
          : opening
      ));
    }
    pushRoomHistory(before);
  };

  useEffect(() => {
    if (!selectedCustomOpening || editorView !== "plan") return;
    const handleOpeningShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "INPUT" || target?.tagName === "TEXTAREA" || target?.tagName === "SELECT" || target?.isContentEditable) return;
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        deleteCustomOpening(selectedCustomOpening.id);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
        event.preventDefault();
        duplicateCustomOpening(selectedCustomOpening.id);
      }
    };
    window.addEventListener("keydown", handleOpeningShortcut);
    return () => window.removeEventListener("keydown", handleOpeningShortcut);
  }, [editorView, selectedCustomOpening?.id]);

  const setSelectedWallMaterial = (materialId: string) => {
    const wallId = selectedCustomWall?.id ?? selectedWall?.id;
    if (!wallId) return;
    const before = snapshotEditor();
    setWallMaterials((prev) => ({ ...(prev ?? {}), [wallId]: materialId }));
    pushRoomHistory(before);
    closeLibraryOnMobile();
  };

  const promoteToProject = async () => {
    if (blockingLayoutIssues.length > 0 || architecturalAcceptance.status === "blocked") {
      setMobileValidationOpen(true);
      setHandoffError("Corrija os erros arquitetônicos bloqueantes antes de aprovar o Projeto Mestre.");
      return null;
    }
    const projectConceptId = await saveConcept(6);
    if (!projectConceptId) return;

    setHandoffState("sending");
    setHandoffError(null);

    try {
      const response = await fetch(`/api/arch/concept-projects/${projectConceptId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Não foi possível enviar ao profissional.");
      }

      const data = (await response.json()) as {
        project?: { id?: string };
        leadId?: string | null;
        dealId?: string | null;
        obraId?: string;
        budgetId?: string;
        projectMaster?: ConceptDraftResponse["configuration"]["projectMaster"];
      };
      const projectId = data.project?.id;
      if (!projectId) throw new Error("Projeto criado sem identificador.");

      setArchProjetoId(projectId);
      if (data.projectMaster) setProjectMaster(data.projectMaster);
      setHandoffState("sent");
      return projectId;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao enviar ao profissional.";
      setHandoffError(message);
      setHandoffState("error");
      return null;
    }
  };

  const convertIfcSourceFile = async (source: ProjectSourceFile) => {
    if (source.extension.toLowerCase() !== "ifc" || convertingIfcId) return;
    if (projectMaster) {
      setSourceFileState("error");
      setSourceFileMessage("Crie uma revisão antes de substituir a geometria do Projeto Mestre.");
      return;
    }
    const id = conceptIdRef.current ?? conceptId;
    if (!id) {
      setSourceFileState("error");
      setSourceFileMessage("Salve o pré-projeto antes de converter o IFC.");
      return;
    }

    setConvertingIfcId(source.id);
    setSourceFileMessage(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("vendorai_token") : null;
      const response = await fetch(
        `/api/arch/concept-projects/${encodeURIComponent(id)}/source-file/${encodeURIComponent(source.id)}/extract-geometry`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        walls?: Array<CustomWall & { sourceIfcId?: string; materialId?: string; wallType?: string }>;
        openings?: Array<CustomOpening & { sourceIfcId?: string }>;
        spaces?: Array<{ id: string; floor: number; label: string; kind: string; area: number; floorMaterialId?: string; sourceIfcId?: string }>;
        wallMaterials?: Record<string, string>;
        bounds?: { width: number; depth: number };
        fitsLot?: boolean;
        maxFloor?: number;
        storeys?: Array<{ name: string | null; floor: number }>;
        warnings?: string[];
      };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível converter o IFC.");
      if (!payload.walls?.length) throw new Error("Nenhuma parede editável foi extraída do IFC.");
      if (!payload.fitsLot) {
        throw new Error(
          `A geometria IFC mede aproximadamente ${payload.bounds?.width?.toFixed?.(2) ?? "?"} × ${payload.bounds?.depth?.toFixed?.(2) ?? "?"} m e não cabe no lote atual de ${lotWidth} × ${lotDepth} m.`,
        );
      }

      const confirmed = window.confirm(
        `Converter ${payload.walls.length} paredes e ${payload.openings?.length ?? 0} aberturas do IFC em geometria editável e substituir a planta atual? O briefing e os arquivos BIM/CAD vinculados serão preservados.`,
      );
      if (!confirmed) return;

      const importedWalls = payload.walls.map(({ sourceIfcId: _sourceIfcId, materialId: _materialId, wallType: _wallType, ...wall }) => wall);
      const importedOpenings = (payload.openings ?? []).map(({ sourceIfcId: _sourceIfcId, ...opening }) => opening);
      const importedFloors = Math.max(1, Number(payload.maxFloor ?? 0) + 1);
      const importedWallMaterials = Object.fromEntries(
        payload.walls.flatMap((wall) => wall.materialId ? [[wall.id, wall.materialId] as const] : []),
      );
      const importedSpaces = (payload.spaces ?? []).map(({ sourceIfcId: _sourceIfcId, ...space }) => ({
        ...space,
        centroid: { x: 0, y: 0 },
      })) as SpaceProfile[];
      const wallFirst = Array.from({ length: importedFloors }, (_, index) => index);

      setFloors(importedFloors);
      setActiveFloor(0);
      setRooms([]);
      setCustomWalls(importedWalls);
      setCustomOpenings(importedOpenings);
      setOpeningOverrides({});
      setWallFirstFloors(wallFirst);
      setSpaceProfiles(importedSpaces);
      setWallMaterials(importedWallMaterials);
      setObjects([]);
      setSelectedId(null);
      setSelectedObjectId(null);
      setSelectedOpeningId(null);
      setSelectedWallId(null);
      setSelectedCustomWallId(null);
      setSelectedClosedSpaceId(null);
      setInteractionMode("wall");
      setEditorView("plan");
      setEditorLibraryTab("build");
      setStep(4);

      await saveConcept(4, undefined, {
        rooms: [],
        customWalls: importedWalls,
        customOpenings: importedOpenings,
        wallFirstFloors: wallFirst,
        floors: importedFloors,
        spaceProfiles: importedSpaces,
        wallMaterials: importedWallMaterials,
      });
      if (Object.keys(importedWallMaterials).length || importedSpaces.length) {
        setSourceFileMessage(
          `Metadados BIM recuperados: ${Object.keys(importedWallMaterials).length} material(is) de parede e ${importedSpaces.length} ambiente(s).`,
        );
      }

      const warningText = payload.warnings?.length ? ` · ${payload.warnings.join(" ")}` : "";
      setSourceFileState("success");
      setSourceFileMessage(
        `IFC convertido: ${importedWalls.length} paredes e ${importedOpenings.length} aberturas editáveis em ${importedFloors} pavimento(s).${warningText}`,
      );
      window.setTimeout(() => setSourceFileState("idle"), 6000);
    } catch (error) {
      setSourceFileState("error");
      setSourceFileMessage(error instanceof Error ? error.message : "Falha ao converter IFC.");
    } finally {
      setConvertingIfcId(null);
    }
  };

  const parseIfcSourceFile = async (source: ProjectSourceFile) => {
    if (source.extension.toLowerCase() !== "ifc" || parsingIfcId) return;
    const id = conceptIdRef.current ?? conceptId;
    if (!id) {
      setSourceFileState("error");
      setSourceFileMessage("Salve o pré-projeto antes de ler o IFC.");
      return;
    }
    setParsingIfcId(source.id);
    setSourceFileMessage(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("vendorai_token") : null;
      const response = await fetch(
        `/api/arch/concept-projects/${encodeURIComponent(id)}/source-file/${encodeURIComponent(source.id)}/parse-ifc`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      const payload = await response.json().catch(() => ({})) as ProjectSourceFile & { error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error ?? "Não foi possível ler o IFC.");
      setSourceFiles((current) => current.map((item) => item.id === payload.id ? payload : item));
      setSourceFileState("success");
      setSourceFileMessage(
        `IFC lido: ${payload.ifcMetadata?.storeys.length ?? 0} pavimento(s), ${payload.ifcMetadata?.counts.walls ?? 0} paredes, ${payload.ifcMetadata?.counts.doors ?? 0} portas e ${payload.ifcMetadata?.counts.windows ?? 0} janelas.`,
      );
      window.setTimeout(() => setSourceFileState("idle"), 5000);
    } catch (error) {
      setSourceFileState("error");
      setSourceFileMessage(error instanceof Error ? error.message : "Falha ao ler IFC.");
    } finally {
      setParsingIfcId(null);
    }
  };

  const convertSketchupSourceFile = async (source: ProjectSourceFile) => {
    if (source.extension.toLowerCase() !== "skp" || convertingSketchupId) return;
    const id = conceptIdRef.current ?? conceptId;
    if (!id) {
      setSourceFileState("error");
      setSourceFileMessage("Salve o pré-projeto antes de converter o SketchUp.");
      return;
    }
    setConvertingSketchupId(source.id);
    setSourceFileMessage(null);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("vendorai_token") : null;
      const response = await fetch(
        `/api/arch/concept-projects/${encodeURIComponent(id)}/source-file/${encodeURIComponent(source.id)}/convert-sketchup`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        },
      );
      const payload = await response.json().catch(() => ({})) as ProjectSourceFile & { error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error ?? "Não foi possível converter o SketchUp.");
      setSourceFiles((current) => current.map((item) => item.id === payload.id ? payload : item));
      setSourceFileState("success");
      setSourceFileMessage("SketchUp convertido para modelo 3D do Arqdor. O GLB e os metadados do projeto foram preservados.");
      window.setTimeout(() => setSourceFileState("idle"), 5000);
    } catch (error) {
      setSourceFileState("error");
      setSourceFileMessage(error instanceof Error ? error.message : "Falha ao converter SketchUp.");
    } finally {
      setConvertingSketchupId(null);
    }
  };

  const uploadProjectSourceFile = async (file: File) => {
    if (sourceFileState === "uploading") return;
    setSourceFileState("uploading");
    setSourceFileMessage(null);
    try {
      const id = await saveConcept(4);
      if (!id) throw new Error("Não foi possível salvar o pré-projeto antes do upload.");
      const form = new FormData();
      form.append("file", file);
      const token = typeof window !== "undefined" ? localStorage.getItem("vendorai_token") : null;
      const response = await fetch(`/api/arch/concept-projects/${encodeURIComponent(id)}/source-file`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const payload = await response.json().catch(() => ({})) as ProjectSourceFile & { error?: string };
      if (!response.ok || !payload.id) throw new Error(payload.error ?? "Não foi possível salvar o arquivo BIM/CAD.");
      setSourceFiles((current) => [...current.filter((item) => item.id !== payload.id), payload].slice(-10));
      setSourceFileState("success");
      setSourceFileMessage(
        payload.extension === "ifc"
          ? "IFC vinculado ao projeto. Você pode ler os metadados ou converter para geometria editável."
          : payload.extension === "skp"
            ? "SketchUp vinculado ao projeto. Clique em Converter SketchUp para gerar o modelo 3D no Arqdor."
            : payload.parserStatus === "ready_model3d"
              ? `${payload.extension.toUpperCase()} pronto como modelo 3D do Arqdor.`
              : `${payload.extension.toUpperCase()} vinculado ao projeto. A conversão será feita pela camada de interoperabilidade.`,
      );
      window.setTimeout(() => setSourceFileState("idle"), 5000);
    } catch (error) {
      setSourceFileState("error");
      setSourceFileMessage(error instanceof Error ? error.message : "Falha ao enviar arquivo BIM/CAD.");
    } finally {
      if (sourceFileInputRef.current) sourceFileInputRef.current.value = "";
    }
  };

  const saveReferenceCalibration = async (patch: Partial<Pick<ReferencePlan, "widthMeters" | "offsetX" | "offsetY" | "opacity">>) => {
    if (!referencePlan || referencePlan.kind !== "image" || projectMaster) return;

    const nativeAspect = referencePlan.nativeWidth && referencePlan.nativeHeight
      ? referencePlan.nativeWidth / referencePlan.nativeHeight
      : referencePlan.widthMeters && referencePlan.depthMeters
        ? referencePlan.widthMeters / referencePlan.depthMeters
        : 1;

    let widthMeters = Number(patch.widthMeters ?? referencePlan.widthMeters ?? lotWidth);
    widthMeters = Math.max(0.5, Math.min(lotWidth, widthMeters));
    let depthMeters = widthMeters / Math.max(0.05, nativeAspect);
    if (depthMeters > lotDepth) {
      depthMeters = lotDepth;
      widthMeters = depthMeters * nativeAspect;
    }

    const maxX = Math.max(0, lotWidth - widthMeters);
    const maxY = Math.max(0, lotDepth - depthMeters);
    const offsetX = Math.max(0, Math.min(maxX, Number(patch.offsetX ?? referencePlan.offsetX ?? 0)));
    const offsetY = Math.max(0, Math.min(maxY, Number(patch.offsetY ?? referencePlan.offsetY ?? 0)));
    const opacity = Math.max(0.08, Math.min(0.8, Number(patch.opacity ?? referencePlan.opacity ?? 0.35)));

    const next: ReferencePlan = {
      ...referencePlan,
      fitMode: "calibrated",
      widthMeters,
      depthMeters,
      offsetX,
      offsetY,
      opacity,
      calibrationSource: "image_aspect_fit",
    };

    setReferencePlan(next);
    setReferenceTracePreview(null);
    setSelectedTraceElement(null);
    setReferenceTraceState("idle");
    const saved = await saveConcept(4, undefined, { referencePlan: next });
    setReferencePlanMessage(saved ? "Calibração da referência salva." : "Não foi possível salvar a calibração.");
  };

  const requestReferenceTrace = async (id: string, plan: ReferencePlan) => {
    const traceKey = `${id}:${plan.url}`;
    if (referenceTracePromiseRef.current && referenceTracePromiseKeyRef.current === traceKey) {
      return referenceTracePromiseRef.current;
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("vendorai_token") : null;
    const request = (async () => {
      const response = await fetch(`/api/arch/concept-projects/${encodeURIComponent(id)}/reference-plan/trace`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const payload = await response.json().catch(() => ({})) as ReferenceTracePreview & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível interpretar a planta com IA.");
      return payload;
    })();

    referenceTracePromiseRef.current = request;
    referenceTracePromiseKeyRef.current = traceKey;
    try {
      return await request;
    } finally {
      if (referenceTracePromiseRef.current === request) {
        referenceTracePromiseRef.current = null;
        referenceTracePromiseKeyRef.current = null;
      }
    }
  };

  const traceReferencePlanWithAi = async () => {
    if (referenceTraceState === "loading") return;
    const id = conceptIdRef.current ?? conceptId;
    if (!id || referencePlan?.kind !== "image") {
      setReferenceTraceState("error");
      setReferencePlanMessage("Anexe uma imagem de planta antes de usar a leitura por IA.");
      return;
    }
    setReferenceTraceState("loading");
    setReferenceTracePreview(null);
    setReferencePlanMessage(null);
    try {
      const payload = await requestReferenceTrace(id, referencePlan);
      setReferenceTracePreview(payload);
      setSelectedTraceElement(null);
      setReferenceTraceState("ready");
      setReferenceDisplayMode("overlay");
      setReferencePlanMessage(
        `Leitura concluída: ${payload.walls.length} paredes e ${payload.openings.length} aberturas sugeridas · confiança ${Math.round(payload.confidence * 100)}%.`,
      );
    } catch (error) {
      setReferenceTraceState("error");
      setReferencePlanMessage(error instanceof Error ? error.message : "Falha ao interpretar a planta com IA.");
    }
  };

  const updateReferenceTraceWall = (wallId: string, patch: Partial<CustomWall>) => {
    setReferenceTracePreview((current) => {
      if (!current) return current;
      return {
        ...current,
        walls: current.walls.map((wall) => wall.id === wallId ? { ...wall, ...patch } : wall),
      };
    });
  };

  const updateReferenceTraceOpening = (openingId: string, patch: Partial<CustomOpening>) => {
    setReferenceTracePreview((current) => {
      if (!current) return current;
      return {
        ...current,
        openings: current.openings.map((opening) => opening.id === openingId ? { ...opening, ...patch } : opening),
      };
    });
  };

  const removeReferenceTraceWall = (wallId: string) => {
    setReferenceTracePreview((current) => {
      if (!current) return current;
      const walls = current.walls.filter((wall) => wall.id !== wallId);
      const openings = current.openings.filter((opening) => opening.wallId !== wallId);
      return { ...current, walls, openings, canApply: walls.length > 0 };
    });
    setSelectedTraceElement((current) => current?.kind === "wall" && current.id === wallId ? null : current);
  };

  const removeReferenceTraceOpening = (openingId: string) => {
    setReferenceTracePreview((current) => current
      ? { ...current, openings: current.openings.filter((opening) => opening.id !== openingId) }
      : current);
    setSelectedTraceElement((current) => current?.kind === "opening" && current.id === openingId ? null : current);
  };

  const applyReferenceTracePreview = async (
    preview: ReferenceTracePreview,
    options?: { confirm?: boolean; referencePlanOverride?: ReferencePlan | null },
  ) => {
    if (!preview?.canApply || !preview.walls.length || projectMaster) return false;
    if (options?.confirm !== false) {
      const confirmed = window.confirm(
        `Aplicar ${preview.walls.length} paredes e ${preview.openings.length} aberturas sugeridas pela IA e substituir a geometria atual? A imagem de referência e o briefing serão preservados.`,
      );
      if (!confirmed) return false;
    }

    const importedWalls = preview.walls.map((wall, index) => ({
      id: wall.id || `trace-wall-${index + 1}`,
      floor: 0,
      x1: wall.x1,
      y1: wall.y1,
      x2: wall.x2,
      y2: wall.y2,
      thickness: wall.thickness,
    }));
    const validWallIds = new Set(importedWalls.map((wall) => wall.id));
    const importedOpenings = preview.openings
      .filter((opening) => validWallIds.has(opening.wallId))
      .map((opening, index) => ({
        id: opening.id || `trace-opening-${index + 1}`,
        wallId: opening.wallId,
        floor: 0,
        type: opening.type,
        offset: opening.offset,
        width: opening.width,
        height: opening.height,
        sillHeight: opening.sillHeight,
      }));

    setFloors(1);
    setActiveFloor(0);
    setRooms([]);
    setCustomWalls(importedWalls);
    setCustomOpenings(importedOpenings);
    setOpeningOverrides({});
    setWallFirstFloors([0]);
    setSpaceProfiles([]);
    setObjects([]);
    setSelectedId(null);
    setSelectedObjectId(null);
    setSelectedOpeningId(null);
    setSelectedWallId(null);
    setSelectedCustomWallId(null);
    setSelectedClosedSpaceId(null);
    setInteractionMode("wall");
    setEditorView("plan");
    setEditorLibraryTab("build");
    setStep(4);

    await saveConcept(4, undefined, {
      rooms: [],
      customWalls: importedWalls,
      customOpenings: importedOpenings,
      wallFirstFloors: [0],
      floors: 1,
      referencePlan: options?.referencePlanOverride ?? referencePlan,
    });

    setReferenceTraceState("applied");
    setReferenceDisplayMode("vector");
    setLibraryOpen(false);
    setReferencePlanMessage(
      `Planta editável gerada: ${importedWalls.length} paredes e ${importedOpenings.length} aberturas. Revise medidas e conexões antes de seguir.`,
    );
    return true;
  };

  const applyReferenceTrace = async () => {
    const preview = referenceTracePreview;
    if (!preview) return;
    await applyReferenceTracePreview(preview, { confirm: true });
  };

  useEffect(() => {
    const id = conceptIdRef.current ?? conceptId;
    if (
      !id ||
      referencePlan?.kind !== "image" ||
      referenceTraceState !== "idle" ||
      saveState === "loading" ||
      projectMaster ||
      safeRooms.length > 0 ||
      safeCustomWalls.length > 0
    ) return;

    const traceKey = `${id}:${referencePlan.url}`;
    if (resumedReferenceTraceRef.current === traceKey) return;
    resumedReferenceTraceRef.current = traceKey;

    setReferenceTraceState("loading");
    setReferenceDisplayMode("reference");
    setReferencePlanMessage("Retomando análise da planta importada...");

    void (async () => {
      try {
        const payload = await requestReferenceTrace(id, referencePlan);
        setReferenceTracePreview(payload);
        setSelectedTraceElement(null);

        if (payload.canApply && payload.walls.length > 0) {
          const applied = await applyReferenceTracePreview(payload, {
            confirm: false,
            referencePlanOverride: referencePlan,
          });
          if (!applied) {
            setReferenceTraceState("ready");
            setReferenceDisplayMode("overlay");
          }
        } else {
          setReferenceTraceState("ready");
          setReferenceDisplayMode("overlay");
          setReferencePlanMessage(
            "A imagem foi analisada, mas falta confiança suficiente para gerar a planta automaticamente. Calibre uma medida e tente novamente.",
          );
        }
      } catch (error) {
        setReferenceTraceState("error");
        setReferencePlanMessage(error instanceof Error ? error.message : "Falha ao retomar a leitura da planta.");
      }
    })();
  }, [
    conceptId,
    referencePlan?.kind,
    referencePlan?.url,
    referenceTraceState,
    saveState,
    projectMaster,
    safeRooms.length,
    safeCustomWalls.length,
  ]);

  const uploadReferencePlan = async (file: File) => {
    if (referencePlanState === "uploading") return;
    setReferencePlanState("uploading");
    setReferencePlanMessage(null);
    try {
      const id = await saveConcept(4);
      if (!id) throw new Error("Não foi possível salvar o pré-projeto antes do upload.");
      const form = new FormData();
      form.append("file", file);
      const token = typeof window !== "undefined" ? localStorage.getItem("vendorai_token") : null;
      const response = await fetch(`/api/arch/concept-projects/${encodeURIComponent(id)}/reference-plan`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const payload = await response.json().catch(() => ({})) as ReferencePlan & { error?: string };
      if (!response.ok || !payload.url) throw new Error(payload.error ?? "Não foi possível salvar a planta de referência.");
      setReferencePlan(payload);
      setReferenceTracePreview(null);
      setSelectedTraceElement(null);
      setReferenceDisplayMode("reference");
      setEditorView("plan");
      setEditorLibraryTab("build");
      setReferencePlanState("success");

      if (payload.kind === "image") {
        setReferenceTraceState("loading");
        setReferencePlanMessage("Imagem recebida. A IA está reconstruindo paredes e aberturas para gerar a planta editável...");
        try {
          const tracePayload = await requestReferenceTrace(id, payload);
          setReferenceTracePreview(tracePayload);
          setSelectedTraceElement(null);

          const hasEditableGeometry = safeRooms.length > 0 || safeCustomWalls.length > 0;
          if (tracePayload.canApply && !hasEditableGeometry) {
            const applied = await applyReferenceTracePreview(tracePayload, {
              confirm: false,
              referencePlanOverride: payload,
            });
            if (!applied) {
              setReferenceTraceState("ready");
              setReferenceDisplayMode("overlay");
            }
          } else {
            setReferenceTraceState("ready");
            setReferenceDisplayMode("overlay");
            setReferencePlanMessage(
              tracePayload.canApply
                ? `Planta reconhecida: ${tracePayload.walls.length} paredes e ${tracePayload.openings.length} aberturas · confiança ${Math.round(tracePayload.confidence * 100)}%. Há geometria existente; revise a sobreposição antes de substituir.`
                : `Leitura concluída, mas a confiança foi insuficiente para aplicar automaticamente. Revise a referência e calibre uma medida antes de tentar novamente.`,
            );
          }
        } catch (traceError) {
          setReferenceTraceState("error");
          setReferencePlanMessage(
            traceError instanceof Error
              ? `Imagem importada, mas a leitura automática falhou: ${traceError.message}`
              : "Imagem importada, mas a leitura automática falhou. Tente gerar a planta novamente.",
          );
        }
      } else {
        setReferenceTraceState("idle");
        setReferencePlanMessage(
          "PDF vinculado ao pré-projeto. Converta a página desejada para imagem para gerar a planta editável automaticamente.",
        );
      }
      window.setTimeout(() => setReferencePlanState("idle"), 5000);
    } catch (error) {
      setReferencePlanState("error");
      setReferencePlanMessage(error instanceof Error ? error.message : "Falha ao enviar a planta de referência.");
    } finally {
      if (referencePlanInputRef.current) referencePlanInputRef.current.value = "";
    }
  };

  const importConceptDxf = async (file: File) => {
    if (dxfImportState === "importing") return;
    setDxfImportState("importing");
    setDxfImportMessage(null);
    try {
      const id = await saveConcept(4);
      if (!id) throw new Error("Não foi possível salvar o pré-projeto antes da importação.");

      const form = new FormData();
      form.append("file", file);
      const token = typeof window !== "undefined" ? localStorage.getItem("vendorai_token") : null;
      const response = await fetch(`/api/arch/concept-projects/${encodeURIComponent(id)}/import/dxf`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body: form,
      });
      const payload = await response.json().catch(() => ({})) as {
        error?: string;
        walls?: Array<CustomWall & { sourceLayer?: string }>;
        bounds?: { width: number; depth: number };
        unit?: string;
        warnings?: string[];
        fitsLot?: boolean;
        maxFloor?: number;
      };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível interpretar o DXF.");
      if (!payload.walls?.length) throw new Error("O DXF não contém paredes compatíveis com o editor.");
      if (!payload.fitsLot) {
        throw new Error(
          `O desenho importado mede aproximadamente ${payload.bounds?.width?.toFixed?.(2) ?? "?"} × ${payload.bounds?.depth?.toFixed?.(2) ?? "?"} m e não cabe no lote atual de ${lotWidth} × ${lotDepth} m. Ajuste o terreno antes de aplicar.`,
        );
      }

      const confirmed = window.confirm(
        `Importar ${payload.walls.length} segmentos do DXF e substituir a geometria atual da planta? Esta ação mantém o briefing, mas remove paredes/aberturas/ambientes editáveis atuais.`,
      );
      if (!confirmed) {
        setDxfImportState("idle");
        return;
      }

      const importedWalls = payload.walls.map(({ sourceLayer: _sourceLayer, ...wall }) => wall);
      const importedFloors = Math.max(1, Number(payload.maxFloor ?? 0) + 1);
      const wallFirst = Array.from({ length: importedFloors }, (_, index) => index);

      setFloors(importedFloors);
      setActiveFloor(0);
      setRooms([]);
      setCustomWalls(importedWalls);
      setCustomOpenings([]);
      setOpeningOverrides({});
      setWallFirstFloors(wallFirst);
      setSpaceProfiles([]);
      setObjects([]);
      setSelectedId(null);
      setSelectedObjectId(null);
      setSelectedOpeningId(null);
      setSelectedWallId(null);
      setSelectedCustomWallId(null);
      setSelectedClosedSpaceId(null);
      setInteractionMode("wall");
      setEditorView("plan");
      setEditorLibraryTab("build");
      setStep(4);

      await saveConcept(4, undefined, {
        rooms: [],
        customWalls: importedWalls,
        customOpenings: [],
        wallFirstFloors: wallFirst,
        floors: importedFloors,
      });

      const warningText = payload.warnings?.length ? ` · ${payload.warnings.join(" ")}` : "";
      setDxfImportMessage(`DXF importado: ${importedWalls.length} segmentos, ${importedFloors} pavimento(s), unidade ${payload.unit ?? "detectada"}.${warningText}`);
      setDxfImportState("success");
      window.setTimeout(() => setDxfImportState("idle"), 5000);
    } catch (error) {
      setDxfImportMessage(error instanceof Error ? error.message : "Falha ao importar DXF.");
      setDxfImportState("error");
    } finally {
      if (dxfImportInputRef.current) dxfImportInputRef.current.value = "";
    }
  };

  const exportConceptIfc = async () => {
    if (ifcExportState === "exporting") return;
    setIfcExportState("exporting");
    try {
      const id = await saveConcept(6);
      if (!id) throw new Error("Não foi possível salvar o pré-projeto antes da exportação.");
      const token = typeof window !== "undefined" ? localStorage.getItem("vendorai_token") : null;
      const response = await fetch(`/api/arch/concept-projects/${encodeURIComponent(id)}/export/ifc`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? "Não foi possível exportar o IFC.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || "arqdor-projeto.ifc";
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setIfcExportState("idle");
    } catch (error) {
      console.error("[Arqdor] Falha ao exportar IFC", error);
      setIfcExportState("error");
      window.setTimeout(() => setIfcExportState("idle"), 3000);
    }
  };

  const exportConceptDxf = async () => {
    if (dxfExportState === "exporting") return;
    setDxfExportState("exporting");
    try {
      const id = await saveConcept(6);
      if (!id) throw new Error("Não foi possível salvar o pré-projeto antes da exportação.");
      const token = typeof window !== "undefined" ? localStorage.getItem("vendorai_token") : null;
      const response = await fetch(`/api/arch/concept-projects/${encodeURIComponent(id)}/export/dxf`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error ?? "Não foi possível exportar o arquivo DXF.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const disposition = response.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="?([^";]+)"?/i);
      const filename = match?.[1] || "arqdor-projeto.dxf";
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDxfExportState("idle");
    } catch (error) {
      console.error("[Arqdor] Falha ao exportar DXF", error);
      setDxfExportState("error");
      window.setTimeout(() => setDxfExportState("idle"), 3000);
    }
  };

  const createProjectRevision = async () => {
    const id = conceptIdRef.current ?? conceptId;
    if (!id || !projectMaster) return null;
    setHandoffError(null);
    try {
      const response = await fetch(`/api/arch/concept-projects/${id}/revise`, { method: "POST" });
      const data = await response.json().catch(() => ({})) as { revision?: { id?: string }; error?: string };
      if (!response.ok || !data.revision?.id) throw new Error(data.error ?? "Não foi possível criar a revisão.");
      window.location.assign(`/arch/concept?id=${encodeURIComponent(data.revision.id)}`);
      return data.revision.id;
    } catch (error) {
      setHandoffError(error instanceof Error ? error.message : "Não foi possível criar a revisão.");
      return null;
    }
  };

  const generateConceptRender = async (options?: { source?: "facade" | "model3d"; renderView?: "exterior" | "interior"; lightingMode?: "day" | "sunset" | "night" }) => {
    if (projectMaster) {
      setRenderError("Este Projeto Mestre está congelado. Crie uma revisão para gerar um novo render com alterações.");
      return;
    }
    if (renderSubmittingRef.current || conceptRender?.status === "processing") return;
    if (blockingLayoutIssues.length > 0) {
      setRenderError("Corrija os erros da composição antes de gerar o render.");
      setMobileValidationOpen(true);
      return;
    }
    renderSubmittingRef.current = true;
    const renderProjectId = await saveConcept(5);
    if (!renderProjectId) { renderSubmittingRef.current = false; return; }

    const source = options?.source ?? "facade";
    const renderView = options?.renderView ?? (source === "model3d" ? "interior" : "exterior");
    const lightingMode = options?.lightingMode ?? facadeDesign.lighting;
    // A imagem de referência precisa estar na mesma luz pedida ao motor.
    if (source === "facade" && lightingMode !== facadeDesign.lighting) {
      flushSync(() => setRenderLightingOverride(lightingMode));
    }

    setRenderError(null);
    setSelectedRenderVersionId(null);
    setConceptRender((prev) => ({ ...prev, status: "processing", error: undefined }));

    try {
      let originalImage: string;
      if (source === "model3d") {
        const canvas = document.querySelector<HTMLCanvasElement>("canvas[data-concept-model3d-source='true']");
        if (!canvas) {
          throw new Error("Não foi possível localizar a câmera 3D atual para gerar o render.");
        }

        if (!canvas.width || !canvas.height) throw new Error("Aguarde a prévia 3D carregar antes de renderizar.");
        const exportSize = conceptReferenceSize(canvas.width, canvas.height, 2560);
        const exportCanvas = document.createElement("canvas");
        exportCanvas.width = exportSize.width;
        exportCanvas.height = exportSize.height;
        const ctx = exportCanvas.getContext("2d");
        if (!ctx) throw new Error("Não foi possível preparar a imagem da câmera 3D.");
        ctx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
        originalImage = exportCanvas.toDataURL("image/png", 1);
      } else {
        const svg = document.querySelector<SVGSVGElement>("[data-concept-render-source='true'] svg");
        if (!svg) throw new Error("Não foi possível localizar a volumetria para gerar o render.");
        originalImage = await svgElementToPngDataUrl(svg, 1.7);
        setRenderLightingOverride(null);
      }
      const { buildDerivedFacadeModel } = await import("./conceptFacadeGeometry");
      const derivedFacade = buildDerivedFacadeModel(modelLevels, safeRooms, normalizeSitePlacement(sitePlacement));
      const kontextSummary = renderView === "exterior"
        ? buildConceptKontextSummary({
            floors: derivedFacade.floors,
            facadeWidth: derivedFacade.width,
            facade: facadePreferences,
            facadeDesign,
            lightingMode,
            frontOpenings: derivedFacade.openings.map((opening) => ({ floor: opening.floor, type: opening.type })),
            hasGarage: Boolean(derivedFacade.garageRange),
          })
        : "";
      const brief = buildConceptRenderBrief({
        lotWidth,
        lotDepth,
        floors,
        desiredArea,
        rooms,
        facade: facadePreferences,
        facadeDesign,
        renderView,
        lightingMode,
        sitePlacement,
        objects: safeObjects,
        wallMaterialIds: Object.values(wallMaterials),
        floorMaterialIds: [
          ...Object.values(roomFloorMaterials),
          ...Object.values(spaceFloorMaterials),
        ],
        geometryLock: {
          frontSide: normalizeSitePlacement(sitePlacement).frontSide,
          exteriorWalls: modelLevels.flatMap((level) => [
            ...(level.walls ?? []).filter((wall) => wall.exterior).map((wall) => ({
              floor: level.floor,
              x1: wall.x1,
              y1: wall.y1,
              x2: wall.x2,
              y2: wall.y2,
            })),
            ...(level.customWalls ?? []).map((wall) => ({
              floor: level.floor,
              x1: wall.x1,
              y1: wall.y1,
              x2: wall.x2,
              y2: wall.y2,
            })),
          ]),
          openings: modelLevels.flatMap((level) => (level.openings ?? []).map((opening) => ({
            floor: level.floor,
            type: opening.type,
            x: opening.x,
            y: opening.y,
            width: opening.width,
            height: opening.height,
            sillHeight: opening.sillHeight,
          }))),
        },
      });

      const openingSummary = safeCustomOpenings
        .map((opening) => [
          opening.familyLabel ?? (opening.type === "door" ? "Porta" : "Janela"),
          `${(opening.width ?? (opening.type === "door" ? 0.9 : 1.2)).toFixed(2)}m x ${(opening.height ?? (opening.type === "door" ? 2.1 : 1.2)).toFixed(2)}m`,
          opening.openingStyle ?? (opening.type === "door" ? "hinged" : "sliding"),
        ].join(" | "))
        .join("; ");

      const renderProfile = renderView === "interior"
        ? [
            "INTERIOR CAMERA PROFILE: eye-level architectural photography, approximately 1.55m camera height, 24-28mm full-frame equivalent, vertical lines corrected, natural perspective, no fisheye, no exaggerated wide angle.",
            `INTERIOR LIGHTING: obey the selected ${lightingMode} scenario with physically plausible practical lights, soft indirect bounce, realistic contact shadows, preserved window directions and room proportions.`,
          ]
        : [
            "EXTERIOR CAMERA PROFILE: professional architectural exterior photography, 28-35mm full-frame equivalent, corrected verticals, realistic perspective, natural sky exposure, no drone distortion unless the reference clearly shows an elevated view.",
            `EXTERIOR LIGHTING: obey the selected ${lightingMode} scenario, physically plausible light direction, soft global illumination, realistic facade reflections, glazing, vegetation and ground contact shadows.`,
          ];

      if (source === "model3d") setEditorView("render");

      const response = await fetch("/api/arch/ai-render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          concept_project_id: renderProjectId,
          original_image_url: originalImage,
          mode: "preservar",
          iluminacao: lightingMode,
          source,
          render_view: renderView,
          ambiente: renderView === "interior" ? "interior" : "fachada",
          // O resumo curto vem primeiro e separado: é o único trecho que o motor lê por inteiro.
          user_notes: [
            kontextSummary ? `${kontextSummary}\n---DETALHES---` : "",
            brief,
            ...renderProfile,
            openingSummary ? `OPENINGS TO PRESERVE EXACTLY: ${openingSummary}` : "",
            "PRESERVATION LOCK: keep the exact floor plan, wall positions, openings, room proportions, object positions, furniture layout, facade massing, roof shape and camera composition from the reference. Do not move, add, remove or resize architectural elements unless explicitly described.",
            "MATERIAL FIDELITY: preserve the specified PBR/material identity, realistic roughness, reflectance and texture scale. Glass must remain glass, wood must preserve grain direction, metals must not become plastic, stone/porcelain joints must remain proportionally realistic.",
            "FINAL OUTPUT TARGET: high-end photoreal architectural visualization, physically plausible materials and lighting, ray-traced look, realistic glass, realistic water when present, natural contact shadows, subtle ambient occlusion, balanced exposure, professional architectural photography composition, no geometry changes, no invented openings, no structural modifications, no fantasy styling, no extra furniture.",
          ].filter(Boolean).join("\n"),
          output_resolution: "4k",
          aspect_ratio: "16:9",
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Erro ${response.status} ao iniciar render.`);
      }

      const { render_id } = (await response.json()) as { render_id: string };
      if (!render_id) throw new Error("O servidor não retornou o identificador do render.");
      const processing = {
        ...conceptRender,
        renderId: render_id,
        status: "processing" as const,
        source,
        renderView,
        error: undefined,
      };
      setConceptRender(processing);

      // Persist the active job immediately so reload/navigation can recover it.
      await fetch(`/api/arch/concept-projects/${renderProjectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStep: 5, conceptRender: processing }),
      }).catch(() => undefined);

      // The history effect follows the persisted job, including after reload.
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao gerar render conceitual.";
      setRenderError(message);
      // Keep the previous successful image/history visible instead of collapsing back to an empty gallery.
      setConceptRender((prev) => ({ ...prev, status: "error", error: message }));
    } finally {
      renderSubmittingRef.current = false;
    }
  };

  useEffect(() => {
    if (!conceptId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    setRenderHistoryLoading(true);

    const recoverRenderHistory = async () => {
      try {
        if (renderSubmittingRef.current) {
          timer = setTimeout(recoverRenderHistory, 1000);
          return;
        }
        const response = await fetch(`/api/arch/ai-renders?concept_project_id=${encodeURIComponent(conceptId)}`, {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Não foi possível consultar os renders salvos. Tentando novamente…");
        const payload = await response.json() as {
          versions?: Array<{
            id: string;
            is_primary?: boolean;
            iluminacao?: string | null;
            version_number?: number;
            can_regenerate?: boolean;
            status?: string;
            result_image_url?: string | null;
            erro_msg?: string | null;
            ambiente?: string | null;
            source?: "facade" | "model3d" | null;
            render_view?: "exterior" | "interior" | null;
            created_at?: string | null;
            concluido_em?: string | null;
          }>;
        };
        if (cancelled) return;
        const versions = Array.isArray(payload.versions) ? payload.versions : [];
        const completed = versions.filter((item) => item.status === "concluido" && item.result_image_url).map((item) => ({
          renderId: item.id,
          canRegenerate: item.can_regenerate === true,
          lighting: item.iluminacao,
          versionNumber: item.version_number,
          resultImageUrl: item.result_image_url!,
          generatedAt: item.concluido_em ?? item.created_at ?? "",
          source: item.source ?? (item.ambiente === "interior" ? "model3d" as const : "facade" as const),
          renderView: item.render_view ?? (item.ambiente === "interior" ? "interior" as const : "exterior" as const),
        }));
        setPrimaryRenderId(versions.find((item) => item.is_primary)?.id ?? null);
        const newest = versions[versions.length - 1];
        const active = [...versions].reverse().find((item) => ["processando", "queued", "processing"].includes(item.status ?? ""));
        const failed = newest && ["erro", "error", "rejeitado_auto"].includes(newest.status ?? "");
        const failure = failed ? newest.erro_msg || "O render não pôde ser concluído. Tente novamente." : undefined;
        setConceptRender((prev) => {
          const last = completed[completed.length - 1];
          if (!newest) return prev;
          return {
            ...prev,
            ...(last ?? {}),
            renderId: active?.id ?? newest.id,
            status: active ? "processing" : failed ? "error" : last ? "completed" : "error",
            error: failure,
            history: completed,
          };
        });
        setRenderQueued(active?.status === "queued");
        setRenderError(failure ?? null);
        setRenderHistoryLoading(false);
        if (active) timer = setTimeout(recoverRenderHistory, 3000);
      } catch (error) {
        if (cancelled) return;
        // A connection failure is not a failed generation. Keep the previous image/job.
        setRenderError(error instanceof Error ? error.message : "Falha ao recuperar renders salvos.");
        setRenderHistoryLoading(false);
        timer = setTimeout(recoverRenderHistory, 5000);
      }
    };
    void recoverRenderHistory();
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [conceptId, conceptRender?.renderId, editorView, renderHistoryRevision]);

  const galleryVersions = conceptRender?.history ?? [];
  const primaryRender = galleryVersions.find((item) => item.renderId === primaryRenderId);
  const selectedGalleryRender = galleryVersions.find((item) => item.renderId === selectedRenderVersionId)
    ?? primaryRender ?? galleryVersions[galleryVersions.length - 1];
  const displayedRender = selectedGalleryRender ?? conceptRender;
  const presentationRender = primaryRender ?? conceptRender;

  const latestFacadeRenderUrl = useMemo(() => {
    if (conceptRender?.renderView === "exterior" && conceptRender.resultImageUrl) return conceptRender.resultImageUrl;
    const history = Array.isArray(conceptRender?.history) ? conceptRender.history : [];
    return [...history].reverse().find((item) => item.renderView === "exterior")?.resultImageUrl ?? null;
  }, [conceptRender]);

  const hasEditorSelection = !terrainOnly && Boolean(
    selectedObject || selected || selectedCustomWall || selectedOpening || selectedClosedSpace || selectedWall,
  );

  const clearEditorSelection = () => {
    setSelectedId(null);
    setSelectedOpeningId(null);
    setSelectedWallId(null);
    setSelectedCustomWallId(null);
    setSelectedClosedSpaceId(null);
    setSelectedObjectId(null);
  };

  useEffect(() => {
    if (step !== WORKSPACE_STEP) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (projectMaster) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const editingText =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        Boolean(target?.isContentEditable);

      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.key.toLowerCase() === "z") {
        if (editingText) return;
        event.preventDefault();
        if (event.shiftKey) redoRooms();
        else undoRooms();
        return;
      }

      if (modifier && event.key.toLowerCase() === "y") {
        if (editingText) return;
        event.preventDefault();
        redoRooms();
        return;
      }

      if (event.key === "Escape") {
        if (editingText) return;
        event.preventDefault();
        if (paintTool) setPaintTool(null);
        else clearEditorSelection();
        return;
      }

      if ((event.key === "Delete" || event.key === "Backspace") && !editingText) {
        if (selectedObject) {
          event.preventDefault();
          deleteObject(selectedObject.id);
        } else if (selectedCustomWall) {
          event.preventDefault();
          deleteCustomWall(selectedCustomWall.id);
        } else if (selectedOpening) {
          event.preventDefault();
          deleteCustomOpening(selectedOpening.id);
        } else if (selected) {
          event.preventDefault();
          deleteRoomById(selected.id);
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    step,
    paintTool,
    selectedObject,
    selectedCustomWall,
    selectedOpening,
    selected,
    roomHistory.length,
    roomFuture.length,
    projectMaster,
  ]);

  return (
    <div className="arqdor-reference-ui min-h-screen bg-muted/30">
      {projectMaster && step !== RESULT_STEP && (
        <div className="fixed inset-0 z-[250] grid place-items-center bg-slate-950/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl border border-emerald-200 bg-white p-6 shadow-2xl">
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Projeto Mestre congelado</div>
            <h2 className="mt-2 text-xl font-bold text-slate-950">Versão {projectMaster.version} está somente leitura</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Planta, fachada, cobertura, implantação e renders desta versão não podem ser alterados silenciosamente.
              Para modificar o projeto, crie uma revisão formal.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => { setStep(RESULT_STEP); window.scrollTo({ top: 0 }); }}
                className="flex-1 rounded-xl border px-4 py-3 text-sm font-bold text-slate-700"
              >
                Ver Projeto Mestre
              </button>
              <button
                type="button"
                onClick={() => void createProjectRevision()}
                className="flex-1 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-bold text-white"
              >
                Criar revisão V{projectMaster.version + 1}
              </button>
            </div>
            {handoffError && <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{handoffError}</div>}
          </div>
        </div>
      )}
      {false && (
        <div className="border-b bg-background">
          <div className="mx-auto max-w-[1500px] px-4 py-4 sm:px-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <a
                  href="/dashboard"
                  className="mb-3 inline-flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm font-semibold text-foreground shadow-sm transition hover:bg-muted"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Voltar ao dashboard
                </a>
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
                  <Sparkles className="h-4 w-4" />
                  Arqdor Concept
                </div>
                <h1 className="mt-1 text-2xl font-bold">Crie o conceito da sua casa</h1>
                <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                  Defina o lote e escolha uma proposta visual. Depois personalize a planta, a fachada e o 3D no mesmo workspace.
                </p>
              </div>
              <div className="flex flex-col items-end gap-3">
                <div className="flex flex-wrap gap-3">
                  {FLOW_STEPS.map((label, index) => {
                    const flowIndex = step >= 6 ? 3 : step >= 4 ? 2 : step >= 1 ? 1 : 0;
                    return <StepPill key={label} index={index} current={flowIndex} label={label} />;
                  })}
                </div>
                <div className="flex items-center gap-3">
                  <span className={saveState === "error" ? "text-xs text-red-600" : "text-xs text-muted-foreground"}>
                    {saveState === "loading"
                      ? "Carregando..."
                      : saveState === "saving"
                        ? "Salvando..."
                        : saveState === "saved"
                          ? "Pré-projeto salvo"
                          : saveState === "error"
                            ? "Não foi possível salvar"
                            : "Ainda não salvo"}
                  </span>
                  <button
                    type="button"
                    onClick={() => void saveConcept()}
                    disabled={saveState === "saving" || saveState === "loading"}
                    className="rounded-xl border bg-background px-4 py-2 text-sm font-semibold disabled:opacity-50"
                  >
                    Salvar pré-projeto
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

      )}

      <main className="w-full p-0">
        {step === 0 && (
          <section className="overflow-hidden rounded-2xl border bg-background shadow-sm">
            <div className="flex min-h-[70px] flex-wrap items-center justify-between gap-3 border-b bg-white px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500 text-white shadow-sm">
                  <Home className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-slate-950">Novo projeto residencial</div>
                  <div className="text-xs text-slate-500">Arqdor Concept · Planta 2D</div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="hidden items-center gap-1 rounded-xl border bg-slate-50 p-1 md:flex">
                  <button type="button" className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-950 shadow-sm">
                    2D
                  </button>
                  <button type="button" disabled className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-400">
                    3D
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => void saveConcept()}
                  disabled={saveState === "saving" || saveState === "loading"}
                  className="rounded-xl border bg-white px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Salvar
                </button>
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
                >
                  Gerar propostas
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="grid min-h-[690px] bg-slate-100/70 xl:grid-cols-[68px_260px_minmax(0,1fr)_300px]">
              <nav className="flex border-r bg-white p-2 xl:flex-col xl:items-center">
                <div className="flex gap-2 overflow-x-auto xl:flex-col">
                  <button
                    type="button"
                    title="Selecionar"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <Search className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    title="Terreno"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-500/10 text-orange-600"
                  >
                    <Trees className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    title="Modelos"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <LayoutGrid className="h-5 w-5" />
                  </button>
                  <div className="mx-1 hidden h-px w-8 bg-slate-200 xl:block" />
                  <button
                    type="button"
                    disabled
                    title="Ambientes — disponível após escolher uma proposta"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-300"
                  >
                    <Layers3 className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    disabled
                    title="Visualização 3D — disponível após criar a planta"
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-slate-300"
                  >
                    <Maximize2 className="h-5 w-5" />
                  </button>
                </div>
              </nav>

              <aside className="border-r bg-white p-5">
                <div className="flex items-center gap-2">
                  <Trees className="h-5 w-5 text-orange-500" />
                  <div>
                    <h2 className="font-semibold text-slate-950">Terreno</h2>
                    <p className="text-xs text-slate-500">Defina a área de trabalho.</p>
                  </div>
                </div>

                <div className="mt-6 space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">Largura</span>
                    <div className="flex h-11 items-center rounded-xl border bg-white px-3 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100">
                      <input
                        className="w-full bg-transparent text-sm font-semibold text-slate-950 outline-none"
                        type="number"
                        min={5}
                        value={lotWidth}
                        onChange={(e) => setLotWidth(Math.max(5, Number(e.target.value) || 5))}
                      />
                      <span className="text-xs font-medium text-slate-400">m</span>
                    </div>
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-xs font-semibold text-slate-600">Comprimento</span>
                    <div className="flex h-11 items-center rounded-xl border bg-white px-3 focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100">
                      <input
                        className="w-full bg-transparent text-sm font-semibold text-slate-950 outline-none"
                        type="number"
                        min={10}
                        value={lotDepth}
                        onChange={(e) => setLotDepth(Math.max(10, Number(e.target.value) || 10))}
                      />
                      <span className="text-xs font-medium text-slate-400">m</span>
                    </div>
                  </label>
                </div>

                <div className="mt-5 rounded-xl border bg-slate-50 p-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Área total</div>
                  <div className="mt-1 text-2xl font-bold tracking-tight text-slate-950">{(lotWidth * lotDepth).toFixed(0)} m²</div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-emerald-700">
                    <Check className="h-4 w-4" />
                    Medidas válidas
                  </div>
                </div>

                <div className="mt-6">
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Configurações rápidas</div>
                  <div className="space-y-1">
                    {[
                      ["Frente do lote", "Inferior"],
                      ["Tipo", "Retangular"],
                      ["Unidade", "Metros"],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between rounded-lg px-2 py-2 text-xs">
                        <span className="text-slate-500">{label}</span>
                        <span className="font-semibold text-slate-800">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-semibold text-white hover:bg-slate-800"
                >
                  Ver modelos para este lote
                  <ArrowRight className="h-4 w-4" />
                </button>
              </aside>

              <div className="relative min-h-[560px] overflow-hidden bg-[#f7f8fa]">
                <div
                  className="absolute inset-0 opacity-70"
                  style={{
                    backgroundImage:
                      "linear-gradient(#dfe3e8 1px, transparent 1px), linear-gradient(90deg, #dfe3e8 1px, transparent 1px), linear-gradient(#edf0f3 1px, transparent 1px), linear-gradient(90deg, #edf0f3 1px, transparent 1px)",
                    backgroundSize: "100px 100px, 100px 100px, 20px 20px, 20px 20px",
                  }}
                />

                <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-xl border bg-white/95 p-1 shadow-sm backdrop-blur">
                  <button type="button" className="rounded-lg bg-slate-950 px-3 py-1.5 text-xs font-semibold text-white">
                    Planta
                  </button>
                  <button type="button" disabled className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-400">
                    Implantação 3D
                  </button>
                </div>

                <div className="absolute right-4 top-4 z-10 flex items-center gap-1 rounded-xl border bg-white/95 p-1 shadow-sm backdrop-blur">
                  <button type="button" disabled title="Desfazer" className="grid h-9 w-9 place-items-center rounded-lg text-slate-300">
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  <button type="button" disabled title="Refazer" className="grid h-9 w-9 place-items-center rounded-lg text-slate-300">
                    <RotateCw className="h-4 w-4" />
                  </button>
                </div>

                <div className="relative z-[1] flex h-full min-h-[620px] items-center justify-center p-10">
                  <svg
                    className="h-[520px] w-full max-w-[760px] drop-shadow-sm"
                    viewBox={`0 0 ${Math.max(22, lotWidth + 14)} ${Math.max(32, lotDepth + 15)}`}
                    preserveAspectRatio="xMidYMid meet"
                    role="img"
                    aria-label="Editor do terreno"
                  >
                    <rect
                      x="7"
                      y="5"
                      width={lotWidth}
                      height={lotDepth}
                      rx="0.1"
                      fill="#ffffff"
                      stroke="#1f2937"
                      strokeWidth="0.16"
                    />

                    <line x1="7" y1="3.3" x2={7 + lotWidth} y2="3.3" stroke="#64748b" strokeWidth="0.06" />
                    <line x1="5.3" y1="5" x2="5.3" y2={5 + lotDepth} stroke="#64748b" strokeWidth="0.06" />
                    <line x1="7" y1="3" x2="7" y2="3.7" stroke="#64748b" strokeWidth="0.06" />
                    <line x1={7 + lotWidth} y1="3" x2={7 + lotWidth} y2="3.7" stroke="#64748b" strokeWidth="0.06" />
                    <line x1="5" y1="5" x2="5.7" y2="5" stroke="#64748b" strokeWidth="0.06" />
                    <line x1="5" y1={5 + lotDepth} x2="5.7" y2={5 + lotDepth} stroke="#64748b" strokeWidth="0.06" />

                    <text x={7 + lotWidth / 2} y="2.65" textAnchor="middle" fontSize="0.62" fontWeight="700" fill="#334155">
                      {lotWidth.toFixed(2).replace(".", ",")} m
                    </text>
                    <text
                      x="4.15"
                      y={5 + lotDepth / 2}
                      textAnchor="middle"
                      fontSize="0.62"
                      fontWeight="700"
                      fill="#334155"
                      transform={`rotate(-90 4.15 ${5 + lotDepth / 2})`}
                    >
                      {lotDepth.toFixed(2).replace(".", ",")} m
                    </text>

                    <rect
                      x="7"
                      y={6 + lotDepth}
                      width={lotWidth}
                      height="2.2"
                      rx="0.5"
                      fill="#e5e7eb"
                    />
                    <line
                      x1={8}
                      y1={7.1 + lotDepth}
                      x2={6 + lotWidth}
                      y2={7.1 + lotDepth}
                      stroke="#ffffff"
                      strokeWidth="0.09"
                      strokeDasharray="0.8 0.55"
                    />
                    <text
                      x={7 + lotWidth / 2}
                      y={9.25 + lotDepth}
                      textAnchor="middle"
                      fontSize="0.55"
                      fontWeight="800"
                      letterSpacing="0.09"
                      fill="#475569"
                    >
                      FRENTE / ACESSO
                    </text>
                  </svg>
                </div>

                <div className="absolute bottom-4 left-4 z-10 flex items-center gap-2 rounded-xl border bg-white/95 px-3 py-2 text-xs text-slate-500 shadow-sm backdrop-blur">
                  <span>Escala 1:100</span>
                  <span className="text-slate-300">•</span>
                  <span>Grade 0,50 m</span>
                  <span className="text-slate-300">•</span>
                  <span className="font-semibold text-emerald-700">Snap ativo</span>
                </div>
              </div>

              <aside className="border-l bg-white p-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-slate-950">Propriedades</h3>
                    <p className="text-xs text-slate-500">Terreno selecionado</p>
                  </div>
                  <div className="grid h-9 w-9 place-items-center rounded-lg bg-orange-500/10 text-orange-600">
                    <Trees className="h-4 w-4" />
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  <div className="rounded-xl border p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Dimensões</div>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-slate-50 p-2.5">
                        <div className="text-[10px] text-slate-400">Largura</div>
                        <div className="mt-0.5 text-sm font-semibold text-slate-900">{lotWidth.toFixed(1)} m</div>
                      </div>
                      <div className="rounded-lg bg-slate-50 p-2.5">
                        <div className="text-[10px] text-slate-400">Profundidade</div>
                        <div className="mt-0.5 text-sm font-semibold text-slate-900">{lotDepth.toFixed(1)} m</div>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">Resumo</div>
                    <div className="mt-3 space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Área</span>
                        <span className="font-semibold text-slate-900">{(lotWidth * lotDepth).toFixed(0)} m²</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Perímetro</span>
                        <span className="font-semibold text-slate-900">{(2 * (lotWidth + lotDepth)).toFixed(0)} m</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Formato</span>
                        <span className="font-semibold text-slate-900">Retangular</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-orange-50 p-3 text-xs leading-5 text-orange-900">
                    Próximo passo: o Arqdor compara modelos compatíveis com estas dimensões e abre a planta no mesmo editor.
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600"
                >
                  Continuar
                  <ArrowRight className="h-4 w-4" />
                </button>
              </aside>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-white px-4 py-2 text-[11px] text-slate-500">
              <div className="flex items-center gap-3">
                <span>Projeto local</span>
                <span>•</span>
                <span>{lotWidth.toFixed(1)} × {lotDepth.toFixed(1)} m</span>
              </div>
              <span>
                {saveState === "saving"
                  ? "Salvando..."
                  : saveState === "saved"
                    ? "Alterações salvas"
                    : saveState === "error"
                      ? "Falha ao salvar"
                      : "Ainda não salvo"}
              </span>
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="grid gap-5 xl:grid-cols-[230px_1fr]">
            <aside className="rounded-3xl border bg-card p-4 shadow-sm">
              <div className="flex items-center gap-2 px-2 py-2">
                <LayoutGrid className="h-5 w-5 text-orange-500" />
                <div>
                  <div className="font-semibold">Modelos</div>
                  <div className="text-xs text-muted-foreground">Escolha um ponto de partida</div>
                </div>
              </div>

              <div className="mt-3 space-y-1">
                {([
                  ["todos", "Todos os modelos"],
                  ["terreas", "Casas térreas"],
                  ["sobrados", "Sobrados"],
                  ["lazer", "Com lazer"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setModelCategory(value)}
                    className={modelCategory === value
                      ? "flex w-full items-center justify-between rounded-xl bg-orange-500/10 px-3 py-2.5 text-left text-sm font-semibold text-orange-700"
                      : "flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-medium text-muted-foreground hover:bg-muted"}
                  >
                    <span>{label}</span>
                    <span className="text-xs">
                      {value === "todos"
                        ? CONCEPT_TYPOLOGIES.length
                        : CONCEPT_TYPOLOGIES.filter((item) =>
                            value === "terreas"
                              ? item.id.startsWith("terrea_")
                              : value === "sobrados"
                                ? item.id.startsWith("sobrado_")
                                : item.id.includes("lazer") || item.rooms.some((room) => room.kind === "piscina" || room.kind === "gourmet")
                          ).length}
                    </span>
                  </button>
                ))}
              </div>

              <div className="mt-5 border-t pt-4">
                <div className="px-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Começar
                </div>
                <button
                  type="button"
                  onClick={() => { startBlankPlan(); closeLibraryOnMobile(); }}
                  className="mt-2 flex w-full items-center gap-3 rounded-xl border bg-background px-3 py-3 text-left hover:border-orange-300 hover:bg-orange-50/40"
                >
                  <span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100">
                    <Plus className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">Do zero</span>
                    <span className="block text-[11px] text-muted-foreground">Canvas 2D vazio</span>
                  </span>
                </button>
              </div>

              <div className="mt-5 rounded-2xl bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
                Os modelos são totalmente editáveis. Você pode mover paredes, ajustar ambientes, trocar aberturas e visualizar tudo em 3D.
              </div>
            </aside>

            <div className="min-w-0">
              <div className="rounded-3xl border bg-card p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-600">Biblioteca Arqdor</div>
                    <h2 className="mt-1 text-2xl font-bold">Escolha um modelo para começar</h2>
                    <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                      Modelos residenciais adaptados ao lote de {lotWidth.toFixed(1)} × {lotDepth.toFixed(1)} m. Abra um modelo e personalize no editor 2D/3D.
                    </p>
                  </div>

                  <label className="flex h-11 min-w-[260px] items-center gap-2 rounded-xl border bg-background px-3">
                    <Search className="h-4 w-4 text-muted-foreground" />
                    <input
                      value={modelSearch}
                      onChange={(event) => setModelSearch(event.target.value)}
                      placeholder="Buscar modelo..."
                      className="w-full bg-transparent text-sm outline-none"
                    />
                  </label>
                </div>

                <div className="mt-5 flex flex-wrap gap-2 xl:hidden">
                  {([
                    ["todos", "Todos"],
                    ["terreas", "Térreas"],
                    ["sobrados", "Sobrados"],
                    ["lazer", "Lazer"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setModelCategory(value)}
                      className={modelCategory === value
                        ? "rounded-full bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
                        : "rounded-full border bg-background px-3 py-1.5 text-xs font-semibold"}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {filteredTypologies.length ? (
                  <div className="mt-6 grid gap-x-5 gap-y-7 md:grid-cols-2 2xl:grid-cols-3">
                    {filteredTypologies.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        disabled={lotWidth < item.minLotWidth}
                        title={lotWidth < item.minLotWidth ? `Este modelo precisa de lote com pelo menos ${item.minLotWidth} m de frente` : undefined}
                        onClick={() => { applyTypology(item.id); closeLibraryOnMobile(); }}
                        className="group text-left disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <div className={typology === item.id
                          ? "relative overflow-hidden rounded-2xl border-2 border-orange-500 bg-slate-50 shadow-sm"
                          : "relative overflow-hidden rounded-2xl border bg-slate-50 transition group-hover:-translate-y-0.5 group-hover:border-slate-400 group-hover:shadow-lg"}
                        >
                          <div className="aspect-[4/3]">
                            <ConceptTypologyCardVisual
                              item={item}
                              lotWidth={lotWidth}
                              lotDepth={lotDepth}
                            />
                          </div>


                          {typology === item.id ? (
                            <div className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-orange-500 text-white shadow">
                              <Check className="h-4 w-4" />
                            </div>
                          ) : (
                            <div className="absolute inset-x-3 bottom-3 translate-y-2 rounded-xl bg-black/70 px-3 py-2 text-center text-xs font-semibold text-white opacity-0 backdrop-blur-sm transition group-hover:translate-y-0 group-hover:opacity-100">
                              Abrir este modelo
                            </div>
                          )}
                        </div>

                        <div className="px-1 pt-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="text-base font-semibold">{item.title}</div>
                              <div className="mt-0.5 text-xs text-muted-foreground">{item.subtitle}</div>
                            </div>
                            <div className="shrink-0 text-right">
                              <div className="text-lg font-semibold">≈ {item.suggestedArea} m²</div>
                              <div className="text-[10px] text-muted-foreground">{item.rooms.length} ambientes</div>
                            </div>
                          </div>
                          <div className={typology === item.id
                            ? "mt-3 text-xs font-semibold text-orange-600"
                            : "mt-3 text-xs font-semibold text-muted-foreground group-hover:text-foreground"}
                          >
                            {typology === item.id ? "Modelo selecionado · abrir no editor abaixo" : "Selecionar modelo"}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="mt-8 rounded-2xl border border-dashed p-10 text-center">
                    <Search className="mx-auto h-6 w-6 text-muted-foreground" />
                    <div className="mt-3 font-semibold">Nenhum modelo encontrado</div>
                    <div className="mt-1 text-sm text-muted-foreground">Tente outro termo ou categoria.</div>
                  </div>
                )}

                <div className="mt-7 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="text-sm text-muted-foreground">
                    Modelo selecionado: <span className="font-semibold text-foreground">{CONCEPT_TYPOLOGIES.find((item) => item.id === typology)?.title}</span>
                  </div>
                  <label className="flex items-center gap-2 text-sm font-medium">
                    Área desejada
                    <div className="flex h-10 w-32 items-center rounded-xl border bg-background px-3">
                      <input
                        className="w-full bg-transparent text-right font-semibold outline-none"
                        type="number"
                        min={40}
                        value={desiredArea}
                        onChange={(event) => setDesiredArea(Math.max(40, Number(event.target.value) || 40))}
                      />
                      <span className="ml-1 text-xs text-muted-foreground">m²</span>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </section>
        )}

                {step === 2 && (
          <section className="grid gap-5 lg:grid-cols-[320px_1fr]">
            <aside className="rounded-3xl border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold">3. Ambientes</h2>
              <p className="mt-1 text-sm text-muted-foreground">Toque para adicionar. As medidas são sugestões iniciais.</p>
              <div className="mt-5 grid gap-2">
                {([
                  ["sala", Home, "Sala + jantar"],
                  ["cozinha", ChefHat, "Cozinha"],
                  ["suite", BedDouble, "Suíte"],
                  ["quarto", BedDouble, "Quarto"],
                  ["banheiro", Bath, "Banheiro"],
                  ["garagem", CarFront, "Garagem"],
                  ["gourmet", ChefHat, "Gourmet"],
                  ["piscina", Waves, "Piscina"],
                  ["outro", Plus, "Outro ambiente"],
                ] as const).map(([kind, Icon, label]) => (
                  <button key={kind} type="button" onClick={() => { addRoom(kind); closeLibraryOnMobile(); }} className="flex items-center justify-between rounded-xl border px-3 py-3 text-left text-sm hover:bg-muted">
                    <span className="flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" />{label}</span>
                    <Plus className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </aside>
            <div className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Ambientes cadastrados</h3>
                  <p className="text-sm text-muted-foreground">Área aproximada atual: {currentArea.toFixed(0)} m² de {desiredArea} m² desejados.</p>
                </div>
                <div className="flex gap-2">
                  {Array.from({ length: floors }).map((_, floor) => (
                    <button key={floor} type="button" onClick={() => setActiveFloor(floor)} className={activeFloor === floor ? "rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background" : "rounded-lg border px-3 py-2 text-xs font-semibold"}>
                      {floor === 0 ? "Térreo" : floor === 1 ? "Superior" : `Pav. ${floor + 1}`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleRooms.map((room) => (
                  <button key={room.id} type="button" onClick={() => setSelectedId(room.id)} className={selectedId === room.id ? "rounded-2xl border border-orange-500 bg-orange-500/5 p-4 text-left" : "rounded-2xl border p-4 text-left hover:bg-muted/50"}>
                    <div className="font-semibold">{room.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{room.width.toFixed(1)} × {room.depth.toFixed(1)} m · {(room.width * room.depth).toFixed(1)} m²</div>
                  </button>
                ))}
              </div>
              {selected && (
                <div className="mt-5 rounded-2xl bg-muted/60 p-4">
                  <div className="font-semibold">Ajustar {selected.label}</div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <label className="text-xs font-medium">Largura<input type="number" step="0.1" className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={selected.width} onChange={(e) => updateSelected({ width: Math.max(1, Number(e.target.value) || 1) })} /></label>
                    <label className="text-xs font-medium">Profundidade<input type="number" step="0.1" className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={selected.depth} onChange={(e) => updateSelected({ depth: Math.max(1, Number(e.target.value) || 1) })} /></label>
                    <label className="text-xs font-medium">Pavimento<select className="mt-1 h-10 w-full rounded-lg border bg-background px-3" value={selected.floor} onChange={(e) => updateSelected({ floor: Number(e.target.value) })}>{Array.from({ length: floors }).map((_, floor) => <option key={floor} value={floor}>{floor === 0 ? "Térreo" : floor === 1 ? "Superior" : `Pav. ${floor + 1}`}</option>)}</select></label>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {step === 3 && (
          <section className="mx-auto max-w-4xl rounded-3xl border bg-card p-5 shadow-sm sm:p-8">
            <div className="flex items-center gap-3">
              <Sparkles className="h-7 w-7 text-orange-500" />
              <div>
                <h2 className="text-xl font-semibold">4. Prioridades do projeto</h2>
                <p className="text-sm text-muted-foreground">Estas escolhas agora alteram de verdade a organização da planta.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {([
                ["garageFront", "Garagem na frente", "Prioriza acesso direto de veículos pela rua."],
                ["masterRear", "Suíte principal mais reservada", "Leva a suíte para a faixa mais íntima da implantação."],
                ["kitchenNearGourmet", "Cozinha perto do gourmet", "Aproxima preparo e lazer para reduzir circulação."],
                ["gourmetNearPool", "Gourmet conectado à piscina", "Cria um conjunto de lazer no fundo do lote."],
                ["privateAwaySocial", "Quartos afastados da área social", "Separa ruído e circulação social da área íntima."],
                ["livingIntegratedKitchen", "Sala integrada com cozinha", "Mantém social e cozinha na mesma faixa funcional."],
              ] as Array<[LayoutPreferenceKey, string, string]>).map(([key, title, description]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggleLayoutPreference(key)}
                  className={layoutPreferences[key]
                    ? "flex items-start gap-3 rounded-2xl border border-orange-500 bg-orange-500/5 p-4 text-left"
                    : "flex items-start gap-3 rounded-2xl border p-4 text-left hover:bg-muted/30"}
                >
                  <span className={layoutPreferences[key]
                    ? "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md bg-orange-500 text-white"
                    : "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border"}>
                    {layoutPreferences[key] && <Check className="h-3.5 w-3.5" />}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted-foreground">{description}</span>
                  </span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => organize()}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white"
            >
              <Sparkles className="h-4 w-4" />
              Recalcular planta com essas prioridades
            </button>
          </section>
        )}

        {step === 4 && (
          <section className="min-h-screen overflow-hidden bg-[#eef1f4] arq-workspace-stage">
            <div className="arq-app-bar relative flex min-h-12 flex-wrap items-center justify-between gap-1.5 border-b border-slate-200 bg-white px-2 py-1 text-slate-900 shadow-sm sm:px-3 lg:h-12 lg:flex-nowrap lg:py-0">
              <div className="flex min-w-0 items-center gap-2">
                {!guestMode && <a
                  href="/arch"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white"
                  title="Voltar ao Arqdor"
                >
                  <ArrowLeft className="h-4 w-4" />
                </a>}

                <div className="hidden min-w-0 sm:block">
                  <div className="truncate text-sm font-semibold text-slate-950">{customerProfile.name?.trim() ? `Pré-projeto — ${customerProfile.name.trim()}` : "Pré-projeto"}</div>
                  <div className="text-[11px] text-slate-400">{guestMode ? `${guestBrand ?? "Pré-projeto"} · projete sua casa` : "Arqdor Pro · editor arquitetônico"}</div>
                </div>

                {!guestMode && <button
                  type="button"
                  onClick={openProjectList}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white"
                  title="Meus pré-projetos"
                  aria-label="Meus pré-projetos"
                >
                  <FolderOpen className="h-4 w-4" />
                </button>}
                {!guestMode && <button
                  type="button"
                  onClick={() => { setPublicLinkOpen(true); void loadPublicLink(); }}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10 hover:text-white"
                  title="Link para clientes"
                  aria-label="Link para clientes"
                >
                  <Share2 className="h-4 w-4" />
                </button>}

                <button
                  type="button"
                  onClick={() => void saveConcept(4)}
                  disabled={saveState === "saving" || saveState === "loading"}
                  className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/15 px-3 text-xs font-bold text-emerald-100 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Salvar a planta e todas as edições atuais"
                >
                  <Check className="h-4 w-4" />
                  <span>{saveState === "saving" ? "Salvando planta..." : "Salvar planta"}</span>
                </button>
                {saveStatusLabel && (
                  <span
                    className={saveState === "error"
                      ? "shrink-0 text-[11px] font-semibold text-red-300"
                      : hasUnsavedChanges
                        ? "shrink-0 text-[11px] text-amber-200"
                        : "shrink-0 text-[11px] text-slate-400"}
                    aria-live="polite"
                  >
                    {saveStatusLabel}
                  </span>
                )}

                {projectBrief && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditorExperienceMode("guided");
                      setEditorView("plan");
                      setEditorLibraryTab("brief");
                      setLibraryOpen(true);
                    }}
                    className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-100 transition hover:bg-emerald-500/20"
                    title="Abrir o briefing mestre que orienta este projeto"
                  >
                    <Heart className="h-4 w-4" />
                    <span className="hidden lg:inline">DNA do projeto</span>
                  </button>
                )}

                {!terrainOnly && (
                <button
                  type="button"
                  onClick={() => void runAiDevelopment()}
                  disabled={aiDevelopmentState === "running" || saveState === "loading"}
                  className={aiDevelopmentState === "error"
                    ? "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-red-400/30 bg-red-500/15 px-3 text-xs font-bold text-red-100 disabled:opacity-50"
                    : "inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-orange-400/30 bg-orange-500/15 px-3 text-xs font-bold text-orange-100 transition hover:bg-orange-500/25 disabled:opacity-50"}
                  title="Desenvolver layout, paredes, aberturas e fachada com IA"
                >
                  <Sparkles className={aiDevelopmentState === "running" ? "h-4 w-4 animate-pulse" : "h-4 w-4"} />
                  <span className="hidden md:inline">{aiDevelopmentState === "running" ? "IA analisando..." : aiDevelopmentState === "error" ? "Tentar IA novamente" : "Desenvolver com IA"}</span>
                </button>
                )}

                <button
                  type="button"
                  onClick={() => setActiveFloor((current) => floors <= 1 ? 0 : (current + 1) % floors)}
                  className="ml-1 hidden h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 text-xs font-semibold text-slate-200 shadow-sm hover:bg-white/10 sm:inline-flex"
                  title="Alternar pavimento"
                >
                  <Layers3 className="h-4 w-4 text-slate-500" />
                  <span>{activeFloor === 0 ? "Térreo" : activeFloor === 1 ? "Superior" : `Pav. ${activeFloor + 1}`}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>
                <div className="ml-1 flex items-center rounded-xl border border-white/10 bg-white/5 p-1">
                  <button
                    type="button"
                    onClick={() => setEditorExperienceMode("guided")}
                    className={editorExperienceMode === "guided"
                      ? "rounded-lg bg-white px-3 py-2 text-[11px] font-bold text-slate-950 shadow-sm"
                      : "rounded-lg px-3 py-2 text-[11px] font-semibold text-slate-300 hover:bg-white/10"}
                  >
                    Guiado
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditorExperienceMode("professional"); if (editorLibraryTab === "brief" || editorLibraryTab === "placement") setEditorLibraryTab("build"); }}
                    className={editorExperienceMode === "professional"
                      ? "rounded-lg bg-white px-3 py-2 text-[11px] font-bold text-slate-950 shadow-sm"
                      : "rounded-lg px-3 py-2 text-[11px] font-semibold text-slate-300 hover:bg-white/10"}
                  >
                    <span className="sm:hidden">Pro</span><span className="hidden sm:inline">Profissional</span>
                  </button>
                </div>
              </div>


              <div className="flex shrink-0 items-center gap-1">
                {editorView === "plan" && editorExperienceMode === "professional" && (
                <button
                  type="button"
                  onClick={() => setShowDimensions((value) => !value)}
                  title="Cotas"
                  className={showDimensions
                    ? "hidden h-10 w-10 place-items-center rounded-xl bg-orange-500/15 text-orange-300 sm:grid"
                    : "hidden h-10 w-10 place-items-center rounded-xl text-slate-300 hover:bg-white/10 sm:grid"}
                >
                  <Ruler className="h-4 w-4" />
                </button>
                )}
                {editorView === "plan" && editorExperienceMode === "professional" && (
                  <button
                    type="button"
                    onClick={() => setModelGalleryOpen(true)}
                    title="Abrir galeria de modelos"
                    className="hidden h-10 items-center gap-2 rounded-xl text-slate-300 hover:bg-white/10 sm:inline-flex sm:px-3"
                  >
                    <LayoutGrid className="h-4 w-4" />
                    Modelos
                  </button>
                )}
                {(editorView === "plan" || editorView === "model3d") && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditorLibraryTab("furniture");
                      setLibraryOpen((open) => !(open && editorLibraryTab === "furniture"));
                    }}
                    title="Abrir biblioteca de móveis e objetos"
                    className={libraryOpen && editorLibraryTab === "furniture"
                      ? "hidden h-10 items-center gap-2 rounded-xl bg-white px-3 text-xs font-bold text-slate-950 shadow-sm sm:inline-flex"
                      : "hidden h-10 items-center gap-2 rounded-xl text-slate-300 hover:bg-white/10 sm:inline-flex"}
                  >
                    <Box className="h-4 w-4" />
                    Móveis
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setFloors((value) => Math.min(3, value + 1))}
                  title="Adicionar pavimento"
                  className="hidden h-10 w-10 place-items-center rounded-xl text-slate-300 hover:bg-white/10 sm:grid"
                >
                  <Plus className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => void sharePublicTour()}
                  disabled={tourShareState === "sharing"}
                  title={tourShareState === "copied"
                    ? "Link público do Tour copiado"
                    : tourShareState === "error"
                      ? "Não foi possível gerar o link"
                      : "Compartilhar Tour 3D com cliente"}
                  className={tourShareState === "error"
                    ? "hidden h-10 w-10 place-items-center rounded-xl bg-red-500 text-white shadow-sm hover:bg-red-600 disabled:opacity-60 sm:grid"
                    : tourShareState === "copied"
                      ? "hidden h-10 w-10 place-items-center rounded-xl bg-emerald-500 text-white shadow-sm hover:bg-emerald-600 disabled:opacity-60 sm:grid"
                      : "hidden h-10 w-10 place-items-center rounded-xl bg-orange-500 text-white shadow-sm hover:bg-orange-600 disabled:opacity-60 sm:grid"}
                >
                  <Share2 className="h-4 w-4" />
                </button>
              </div>
            </div>

            {(layoutIssues.length > 0 || explainableFindings.length > 0) && (
              <>
                {mobileValidationOpen && (
                  <div className="fixed inset-0 z-[80]">
                    <button
                      type="button"
                      aria-label="Fechar validação"
                      onClick={() => setMobileValidationOpen(false)}
                      className="absolute inset-0 bg-slate-950/35"
                    />
                    <div className="absolute inset-x-0 bottom-0 max-h-[68vh] overflow-hidden rounded-t-3xl border-t bg-white shadow-2xl md:bottom-auto md:left-1/2 md:top-24 md:max-h-[70vh] md:w-[520px] md:-translate-x-1/2 md:rounded-3xl md:border">
                      <div className="flex items-center justify-between border-b px-4 py-4">
                        <div>
                          <div className="text-sm font-bold text-slate-950">Avaliação arquitetônica</div>
                          <div className="mt-0.5 text-xs font-semibold text-slate-500">
                            Score {architecturalAcceptance.score}/100 · {architecturalAcceptance.status === "approved" ? "aprovado" : architecturalAcceptance.status === "review" ? "revisão recomendada" : "correção necessária"}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMobileValidationOpen(false)}
                          className="grid h-9 w-9 place-items-center rounded-full border text-slate-500"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                      <div className="max-h-[calc(68vh-74px)] space-y-3 overflow-y-auto px-4 py-4">
                        {architecturalRepair.improved && (
                          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                            <div className="text-xs font-bold text-emerald-900">
                              Melhoria segura encontrada · {architecturalAcceptance.score}/100 → {architecturalRepair.after.score}/100
                            </div>
                            <div className="mt-1 text-[11px] leading-4 text-emerald-800">
                              A correção foi testada pelos mesmos validadores e só é oferecida quando não aumenta erros arquitetônicos.
                            </div>
                            <div className="mt-2 space-y-1">
                              {architecturalRepair.actions.slice(0, 6).map((action, index) => (
                                <div key={`${action.type}-${index}`} className="text-[10px] leading-4 text-emerald-900">• {action.description}</div>
                              ))}
                            </div>
                            <button
                              type="button"
                              onClick={repairArchitecturalLayout}
                              className="mt-3 w-full rounded-xl bg-emerald-700 px-3 py-2.5 text-xs font-bold text-white"
                            >
                              Aplicar melhoria
                            </button>
                          </div>
                        )}

                        {explainableFindings.map((finding) => (
                          <div
                            key={finding.id}
                            className={finding.severity === "error"
                              ? "rounded-xl border border-red-200 bg-red-50 px-3 py-3"
                              : "rounded-xl border border-amber-200 bg-amber-50 px-3 py-3"}
                          >
                            <div className={finding.severity === "error" ? "text-xs font-bold text-red-800" : "text-xs font-bold text-amber-900"}>
                              {finding.title}
                            </div>
                            <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Problema</div>
                            <div className="mt-0.5 text-xs leading-5 text-slate-800">{finding.problem}</div>
                            <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Impacto</div>
                            <div className="mt-0.5 text-xs leading-5 text-slate-700">{finding.impact}</div>
                            <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Proposta</div>
                            <div className="mt-0.5 text-xs leading-5 text-slate-700">{finding.proposal}</div>
                            {finding.exactChanges.length > 0 && (
                              <>
                                <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">O que será alterado</div>
                                <div className="mt-1 space-y-1">
                                  {finding.exactChanges.map((change, index) => (
                                    <div key={index} className="text-[11px] leading-4 text-slate-700">• {change}</div>
                                  ))}
                                </div>
                              </>
                            )}
                            <button type="button" className="mt-2 text-xs font-semibold text-slate-700 underline" onClick={() => {
                              setSelectedId(finding.roomId ?? null);
                              setSelectedObjectId(null);
                              setSelectedOpeningId(null);
                              setEditorLibraryTab("build");
                              setLibraryOpen(false);
                              setEditorView("plan");
                              setMobileValidationOpen(false);
                            }}>
                              Ver no projeto
                            </button>
                          </div>
                        ))}

                        {layoutIssues.filter((issue) => !architecturalAcceptance.issues.some((item) => item.id === issue.id)).map((issue) => (
                          <div
                            key={issue.id}
                            className={issue.severity === "error"
                              ? "rounded-xl bg-red-50 px-3 py-3 text-sm text-red-700"
                              : "rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900"}
                          >
                            <div className="mb-1 text-xs font-bold">{issue.severity === "error" ? "Geometria / visualização" : "Revisão visual"}</div>
                            {issue.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            {saveState !== "loading" && !modelGalleryOpen && !projectMaster &&
              (intakeStage === "kind" || intakeStage === "terrain_choice" || intakeStage === "source") && (
              <div className="fixed inset-0 z-[110] flex items-end justify-center bg-slate-950/55 sm:items-center sm:p-6">
                <div className="max-h-[92dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7" role="dialog" aria-label="Iniciar pré-projeto">
                  {startWizardStage === "kind" && (
                    <>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-500">Novo pré-projeto</div>
                      <h2 className="mt-1 text-2xl font-bold text-slate-950">O que você quer projetar?</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-500">Isso define a jornada correta antes de pedir terreno, planta ou referências.</p>
                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <button type="button" onClick={() => { setProjectScope("house"); setStartWithTerrain(null); setTerrainDefined(false); setIntakeStage("terrain_choice"); setStartWizardStage("terrain"); setStartChooserDismissed(false); }}
                          className="group min-h-36 rounded-2xl border-2 border-orange-400 bg-orange-50 p-5 text-left transition hover:border-orange-500 hover:bg-orange-100/70">
                          <div className="flex items-start gap-4">
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-500 text-white"><Home className="h-5 w-5" /></span>
                            <span><span className="block text-base font-bold text-slate-950">Casa completa</span>
                            <span className="mt-1 block text-xs leading-5 text-slate-600">Terreno opcional, planta, ambientes, fachada, 3D e render.</span></span>
                          </div>
                        </button>
                        <button type="button" onClick={() => {
                          setProjectScope("room");
                          setStartWithTerrain(false);
                          setTerrainDefined(false);
                          setIntakeStage("source");
                          setLotWidth(8); setLotDepth(8); setDesiredArea(25); setFloors(1);
                          setStartWizardStage("source");
                          setStartChooserDismissed(false);
                          setEditorView("plan"); setEditorLibraryTab("brief");
                        }}
                          className="group min-h-36 rounded-2xl border bg-white p-5 text-left transition hover:border-slate-400 hover:shadow-sm">
                          <div className="flex items-start gap-4">
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-white"><Sofa className="h-5 w-5" /></span>
                            <span><span className="block text-base font-bold text-slate-950">Um ambiente</span>
                            <span className="mt-1 block text-xs leading-5 text-slate-600">Sala, cozinha, suíte, banheiro, gourmet ou outro espaço isolado. Não exige terreno.</span></span>
                          </div>
                        </button>
                      </div>
                    </>
                  )}

                  {startWizardStage === "terrain" && (
                    <>
                      <button type="button" onClick={() => { setProjectScope(null); setStartWithTerrain(null); setTerrainDefined(false); setIntakeStage("kind"); setStartWizardStage("kind"); setStartChooserDismissed(false); }} className="mb-3 text-xs font-semibold text-slate-500 hover:text-slate-900">← Voltar</button>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-500">Casa completa</div>
                      <h2 className="mt-1 text-2xl font-bold text-slate-950">Quer começar pelo terreno?</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-500">Se você já conhece o lote, o Arqdor usa medidas, frente e recuos desde a primeira proposta. Se não conhece, pode começar pela casa e informar o terreno depois.</p>
                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <button type="button" onClick={() => {
                          setStartWithTerrain(true);
                          setTerrainDefined(true);
                          setIntakeStage("terrain_editor");
                          setStartChooserDismissed(true);
                          setEditorView("plan"); setEditorLibraryTab("site"); setLibraryOpen(true);
                        }} className="min-h-32 rounded-2xl border-2 border-orange-400 bg-orange-50 p-5 text-left hover:bg-orange-100/70">
                          <MapPin className="mb-3 h-6 w-6 text-orange-600" />
                          <span className="block text-base font-bold text-slate-950">Sim, começar pelo terreno</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-600">Informar largura, profundidade, frente e implantação antes da planta.</span>
                        </button>
                        <button type="button" onClick={() => {
                          setStartWithTerrain(false);
                          setTerrainDefined(false);
                          setIntakeStage("source");
                          setStartWizardStage("source");
                          setStartChooserDismissed(false);
                          setEditorView("plan"); setEditorLibraryTab("brief");
                        }} className="min-h-32 rounded-2xl border bg-white p-5 text-left hover:border-slate-400 hover:shadow-sm">
                          <ArrowRight className="mb-3 h-6 w-6 text-slate-700" />
                          <span className="block text-base font-bold text-slate-950">Não, começar pela casa</span>
                          <span className="mt-1 block text-xs leading-5 text-slate-600">Criar a proposta agora e definir ou ajustar o terreno mais tarde.</span>
                        </button>
                      </div>
                    </>
                  )}

                  {startWizardStage === "source" && (
                    <>
                      <button type="button" onClick={() => { if (projectScope === "house") { setIntakeStage("terrain_choice"); setStartWizardStage("terrain"); } else { setProjectScope(null); setStartWithTerrain(null); setTerrainDefined(false); setIntakeStage("kind"); setStartWizardStage("kind"); } setStartChooserDismissed(false); }} className="mb-3 text-xs font-semibold text-slate-500 hover:text-slate-900">← Voltar</button>
                      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-500">{projectScope === "room" ? "Ambiente" : "Projeto"}</div>
                      <h2 className="mt-1 text-2xl font-bold text-slate-950">Como você quer começar?</h2>
                      <p className="mt-1 text-sm leading-6 text-slate-500">
                        {projectScope === "room"
                          ? "Você pode descrever o ambiente, enviar uma foto/croqui, desenhar ou importar uma base."
                          : startWithTerrain
                            ? <>Terreno definido em <strong className="font-semibold text-slate-700">{lotWidth.toFixed(1)} × {lotDepth.toFixed(1)} m</strong>. Agora escolha a origem da planta.</>
                            : "O terreno fica opcional por enquanto. Você pode criar a casa primeiro e posicioná-la no lote depois."}
                      </p>

                      <input ref={projectStartImportInputRef} type="file" accept=".dxf,.ifc,.dwg,.rvt,.skp,application/dxf" className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0]; if (!file) return;
                          setStartSourceChosen(true); setIntakeStage("complete"); setStartChooserDismissed(true);
                          setEditorView("plan"); setEditorLibraryTab("build"); setLibraryOpen(true);
                          const extension = file.name.split(".").pop()?.toLowerCase();
                          if (extension === "dxf") void importConceptDxf(file); else void uploadProjectSourceFile(file);
                        }} />
                      <input ref={projectStartReferenceInputRef} type="file" accept="image/png,image/jpeg,image/webp,application/pdf,.pdf" className="hidden"
                        onChange={(event) => {
                          const file = event.target.files?.[0]; if (!file) return;
                          setStartSourceChosen(true); setIntakeStage("complete"); setStartChooserDismissed(true);
                          setEditorView("plan"); setEditorLibraryTab("build"); setLibraryOpen(true);
                          void uploadReferencePlan(file);
                        }} />

                      <div className="mt-6 grid gap-3 sm:grid-cols-2">
                        <button type="button" onClick={() => {
                          setStartSourceChosen(true); setIntakeStage("complete"); setStartChooserDismissed(true); setEditorExperienceMode("guided");
                          setEditorView("plan"); setEditorLibraryTab("brief"); setLibraryOpen(true);
                        }} className="group min-h-32 rounded-2xl border-2 border-orange-400 bg-orange-50 p-5 text-left transition hover:border-orange-500 hover:bg-orange-100/70">
                          <div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-orange-500 text-white"><Sparkles className="h-5 w-5" /></span>
                            <span><span className="block text-base font-bold text-slate-950">Desenvolver com IA</span>
                            <span className="mt-1 block text-xs leading-5 text-slate-600">{projectScope === "room" ? "Descreva uso, medidas, estilo, móveis e necessidades. A IA monta a primeira proposta do ambiente." : "Informe ambientes, metragens, estilo e prioridades. A IA arquiteta desenvolve a planta inicial para revisão."}</span>
                            <span className="mt-2 block text-[10px] font-bold uppercase tracking-[0.12em] text-orange-700">Recomendado</span></span></div>
                        </button>

                        <button type="button" onClick={() => {
                          if ((safeRooms.length > 0 || safeCustomWalls.length > 0) && !window.confirm("Iniciar do zero substitui a geometria atual deste rascunho. Continuar?")) return;
                          setStartSourceChosen(true); setIntakeStage("complete"); setStartChooserDismissed(true); startBlankPlan(); setLibraryOpen(true);
                        }} className="group min-h-32 rounded-2xl border bg-white p-5 text-left transition hover:border-slate-400 hover:shadow-sm">
                          <div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-950 text-white"><Plus className="h-5 w-5" /></span>
                            <span><span className="block text-base font-bold text-slate-950">Desenhar do zero</span>
                            <span className="mt-1 block text-xs leading-5 text-slate-600">{projectScope === "room" ? "Desenhe o perímetro do ambiente, aberturas, mobiliário e materiais." : "Desenhe paredes, ambientes, portas, janelas e escadas manualmente."}</span></span></div>
                        </button>

                        <button type="button" onClick={() => projectStartImportInputRef.current?.click()}
                          className="group min-h-32 rounded-2xl border bg-white p-5 text-left transition hover:border-slate-400 hover:shadow-sm">
                          <div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-800"><FolderOpen className="h-5 w-5" /></span>
                            <span><span className="block text-base font-bold text-slate-950">Importar projeto</span>
                            <span className="mt-1 block text-xs leading-5 text-slate-600">DXF entra como geometria editável. IFC, DWG, RVT e SKP ficam vinculados ao pré-projeto.</span></span></div>
                        </button>

                        <button type="button" onClick={() => projectStartReferenceInputRef.current?.click()}
                          className="group min-h-32 rounded-2xl border bg-white p-5 text-left transition hover:border-slate-400 hover:shadow-sm">
                          <div className="flex items-start gap-4"><span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-800"><Camera className="h-5 w-5" /></span>
                            <span><span className="block text-base font-bold text-slate-950">{projectScope === "room" ? "Foto / croqui / planta" : "Croqui / pré-planta / foto"}</span>
                            <span className="mt-1 block text-xs leading-5 text-slate-600">Envie imagem ou PDF. Em imagens, a IA interpreta a referência e reconstrói paredes e aberturas como geometria editável.</span></span></div>
                        </button>
                      </div>

                      <div className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-600">
                        A referência enviada não vira apenas uma imagem: primeiro é convertida em <strong className="font-semibold text-slate-800">geometria editável</strong>. Depois o mesmo projeto segue para 2D, 3D e Genius Render.
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="arq-journey-row flex min-h-11 flex-wrap items-center gap-2 border-b bg-white px-3 py-1.5 sm:px-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-slate-950">
                  <span className="sm:hidden">{journeyIndex + 1}/{journeyStages.length} · </span>
                  <span className="hidden sm:inline">Etapa {journeyIndex + 1} de {journeyStages.length} · </span>
                  {journeyStages[journeyIndex].label}
                </div>
                <div className={journeyIndex === 2 || journeyIndex === 3 ? "hidden truncate text-xs text-slate-500 sm:block" : "truncate text-xs text-slate-500"}>
                  {journeyStages[journeyIndex].helper}
                </div>
              </div>
              <div className="hidden shrink-0 rounded-xl border bg-slate-50 p-1 sm:flex">
                {journeyStages.map((stage, index) => (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => goToJourneyStage(index)}
                    className={journeyIndex === index
                      ? "min-h-9 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white"
                      : index < journeyIndex
                        ? "min-h-9 rounded-lg px-3 text-xs font-semibold text-emerald-700 hover:bg-white"
                        : "min-h-9 rounded-lg px-3 text-xs font-semibold text-slate-500 hover:bg-white"}
                  >
                    {index < journeyIndex ? "✓ " : `${index + 1}. `}{stage.label}
                  </button>
                ))}
              </div>
              {(journeyIndex === 2 || journeyIndex === 3) && (
                <div className="flex shrink-0 rounded-xl border bg-slate-50 p-1">
                  {(journeyIndex === 2
                    ? ([["plan", "Planta 2D"], ["model3d", "3D"]] as const)
                    : projectScope === "room"
                      ? ([["model3d", "3D"], ["render", "Imagem"]] as const)
                      : ([["facade", "Fachada"], ["render", "Imagem"]] as const)
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setEditorView(value);
                        if (value !== "plan") setLibraryOpen(false);
                      }}
                      className={editorView === value
                        ? "min-h-9 rounded-lg bg-white px-3 text-xs font-bold text-slate-950 shadow-sm"
                        : "min-h-9 rounded-lg px-3 text-xs font-semibold text-slate-500"}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              {layoutIssues.length > 0 && (
                <button type="button" onClick={() => setMobileValidationOpen(true)}
                  className={`min-h-10 shrink-0 rounded-xl border px-3 text-xs font-bold ${blockingLayoutIssues.length ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
                  {blockingLayoutIssues.length > 0 ? `${blockingLayoutIssues.length} erro(s)` : `${layoutIssues.length} aviso(s)`}
                </button>
              )}
              {blockingLayoutIssues.length > 0 && (
                <button
                  type="button"
                  onClick={repairArchitecturalLayout}
                  className="arq-auto-fix inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl border border-orange-200 bg-orange-50 px-3 text-xs font-bold text-orange-700 hover:bg-orange-100"
                >
                  <Sparkles className="h-4 w-4" /> Corrigir planta
                </button>
              )}
              {conceptJourneyContinueLabel(journeyIndex, journeyStages) && (
                <button
                  type="button"
                  onClick={() => goToJourneyStage(journeyIndex + 1)}
                  disabled={blockingLayoutIssues.length > 0}
                  title={blockingLayoutIssues.length > 0 ? "Corrija os erros arquitetônicos antes de avançar." : undefined}
                  className="arq-journey-continue inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-600 disabled:shadow-none"
                >
                  {blockingLayoutIssues.length > 0 ? "Corrija os erros" : conceptJourneyContinueLabel(journeyIndex, journeyStages)} <ArrowRight className="h-4 w-4" />
                </button>
              )}
            </div>

            <div
              data-concept-render-source="true"
              className="fixed -left-[9999px] top-0 h-[650px] w-[900px] overflow-hidden"
              aria-hidden="true"
            >
              {/* Referência do render em cores e com a luz escolhida: o motor de imagem copia
                  materiais e cores do que vê. Em linhas técnicas ele inventava a casa. */}
              <ConceptDerivedFacade
                viewMode="material"
                lotWidth={lotWidth}
                levels={modelLevels}
                rooms={safeRooms}
                sitePlacement={normalizeSitePlacement(sitePlacement)}
                facade={facadePreferences}
                design={{ ...facadeDesign, lighting: renderLightingOverride ?? facadeDesign.lighting }}
              />
            </div>

            {modelGalleryOpen && (
              <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 sm:p-6">
                <button
                  type="button"
                  aria-label="Fechar galeria de modelos"
                  onClick={() => setModelGalleryOpen(false)}
                  className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
                />
                <div className="relative z-10 max-h-[88vh] w-full max-w-6xl overflow-hidden rounded-3xl border border-white/30 bg-white shadow-2xl">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-6">
                    <div>
                      <div className="text-lg font-bold text-slate-950">Comece com um modelo</div>
                      <div className="mt-0.5 text-xs text-slate-500">Escolha uma base e continue editando normalmente no 2D ou 3D.</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {([
                        ["todos", "Todos"],
                        ["terreas", "Térreas"],
                        ["sobrados", "Sobrados"],
                        ["lazer", "Lazer"],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setModelCategory(value)}
                          className={modelCategory === value
                            ? "rounded-full bg-slate-950 px-3 py-1.5 text-[11px] font-bold text-white"
                            : "rounded-full border px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"}
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setModelGalleryOpen(false)}
                        className="ml-1 grid h-9 w-9 place-items-center rounded-full border text-slate-500 hover:bg-slate-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[calc(88vh-76px)] overflow-y-auto p-5 sm:p-6">
                    <label className="mx-auto mb-5 flex h-11 max-w-xl items-center gap-2 rounded-xl border bg-white px-3 shadow-sm">
                      <Search className="h-4 w-4 text-slate-400" />
                      <input
                        value={modelSearch}
                        onChange={(event) => setModelSearch(event.target.value)}
                        placeholder="Buscar casa térrea, sobrado, lazer..."
                        className="w-full bg-transparent text-sm outline-none"
                        autoFocus
                      />
                    </label>
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      <button
                        type="button"
                        onClick={() => {
                          startBlankPlan();
                          setModelGalleryOpen(false);
                        }}
                        className="group overflow-hidden rounded-2xl border bg-white text-left transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-lg"
                      >
                        <div className="grid h-24 place-items-center bg-gradient-to-br from-slate-50 to-slate-100 sm:aspect-[4/3] sm:h-auto">
                          <div className="grid h-16 w-16 place-items-center rounded-2xl border-2 border-dashed border-slate-300 bg-white text-slate-500">
                            <Plus className="h-7 w-7" />
                          </div>
                        </div>
                        <div className="p-4">
                          <div className="font-semibold">Projeto vazio</div>
                          <div className="mt-1 text-xs text-slate-500">Começar desenhando do zero.</div>
                        </div>
                      </button>
                      {filteredTypologies.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          disabled={lotWidth < item.minLotWidth}
                          title={lotWidth < item.minLotWidth ? `Este modelo precisa de lote com pelo menos ${item.minLotWidth} m de frente` : undefined}
                          onClick={() => {
                            applyTypology(item.id);
                            setModelGalleryOpen(false);
                            setEditorView("plan");
                          }}
                          className={typology === item.id
                            ? "group overflow-hidden rounded-2xl border-2 border-orange-500 bg-white text-left shadow-md"
                            : "group overflow-hidden rounded-2xl border bg-white text-left transition hover:-translate-y-0.5 hover:border-slate-400 hover:shadow-lg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 disabled:hover:shadow-none"}
                        >
                          <div className="relative aspect-[4/3] overflow-hidden">
                            <ConceptTypologyCardVisual item={item} lotWidth={lotWidth} lotDepth={lotDepth} />
                          </div>
                          <div className="p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-slate-950">{item.title}</div>
                                <div className="mt-1 text-xs text-slate-500">{item.subtitle}</div>
                                <div className={lotWidth < item.minLotWidth ? "mt-1 text-[11px] font-semibold text-orange-700" : "mt-1 text-[11px] text-slate-400"}>
                                  {lotWidth < item.minLotWidth ? `Precisa de lote com ${item.minLotWidth} m de frente` : `Lote a partir de ${item.minLotWidth} m de frente`}
                                </div>
                              </div>
                              <div className="shrink-0 text-sm font-bold text-slate-700">≈ {item.suggestedArea} m²</div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {editorView === "plan" && !terrainOnly && (
              <div className="flex items-center gap-1.5 overflow-x-auto border-b border-slate-200 bg-white px-3 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <button
                  type="button"
                  onClick={() => setInteractionMode("navigate")}
                  className={interactionMode === "navigate"
                    ? "shrink-0 rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white"
                    : "shrink-0 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"}
                >
                  Selecionar / editar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!wallFirstActive) activateWallFirstFloor();
                    setEditorLibraryTab("build");
                    setLibraryOpen(true);
                    setInteractionMode("draw-wall");
                    setSelectedId(null);
                    setSelectedOpeningId(null);
                  }}
                  className={interactionMode === "draw-wall"
                    ? "shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-white"
                    : "shrink-0 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:bg-orange-50"}
                >
                  + Parede
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditorLibraryTab("rooms");
                    setLibraryOpen(true);
                    setInteractionMode(wallFirstActive ? "space" : "room");
                    setSelectedOpeningId(null);
                  }}
                  className={(interactionMode === "room" || interactionMode === "space")
                    ? "shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-white"
                    : "shrink-0 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:bg-orange-50"}
                >
                  Ambientes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditorLibraryTab("build");
                    setLibraryOpen(true);
                    setInteractionMode("opening");
                    setSelectedId(null);
                    setSelectedOpeningId(null);
                  }}
                  className={interactionMode === "opening"
                    ? "shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-white"
                    : "shrink-0 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:bg-orange-50"}
                >
                  Portas / janelas
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditorLibraryTab("furniture");
                    setLibraryOpen(true);
                    setInteractionMode("navigate");
                  }}
                  className={editorLibraryTab === "furniture" && libraryOpen
                    ? "shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-xs font-bold text-white"
                    : "shrink-0 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:bg-orange-50"}
                >
                  Móveis
                </button>
                <button
                  type="button"
                  onClick={() => setShowDimensions((value) => !value)}
                  className={showDimensions
                    ? "shrink-0 rounded-xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 ring-1 ring-sky-200"
                    : "shrink-0 rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"}
                >
                  Cotas {showDimensions ? "✓" : ""}
                </button>
              </div>
            )}

            <div className="arq-workspace-shell relative min-h-[calc(100dvh-112px)] overflow-hidden bg-[#f6f7f8]">
              <aside className={editorView !== "plan"
                  ? "arq-workspace-sidebar hidden"
                  : (selected || selectedCustomWall || selectedOpening || selectedClosedSpace || selectedWall)
                    ? "arq-workspace-sidebar absolute inset-y-0 left-0 z-30 hidden max-w-full border-r bg-white shadow-[8px_0_28px_rgba(15,23,42,0.08)] md:block"
                    : "arq-workspace-sidebar absolute inset-y-0 left-0 z-30 max-w-full border-r bg-white shadow-[8px_0_28px_rgba(15,23,42,0.08)]"}>
                <div className="flex min-h-full">
                  <div className="arq-tool-rail w-14 shrink-0 border-r bg-white py-3 sm:w-16">
                    <div className="flex flex-col items-center gap-2">
                      {([
                        ["site", Ruler, "Terreno"],
                        ["placement", MapPin, "Implantação"],
                        ["brief", FileText, "Necessidades"],
                        ["models", LayoutGrid, "Modelos"],
                        ["rooms", DoorOpen, "Ambientes"],
                        ["build", Layers3, "Construir"],
                        ["furniture", Sofa, editorExperienceMode === "guided" ? "Mobiliar" : "Produtos"],
                        ["materials", Paintbrush, editorExperienceMode === "guided" ? "Acabamentos" : "Materiais"],
                        ["outdoor", Trees, "Externo"],
                      ] as Array<[EditorLibraryTab, typeof Ruler, string]>)
                        .filter(([value]) => {
                          if (terrainOnly) return value === "site";
                          if (projectScope === "room" && (value === "site" || value === "placement" || value === "outdoor")) return false;
                          if (projectScope === "house" && !terrainDefined && (value === "site" || value === "placement")) return false;
                          if (editorExperienceMode === "professional") return value !== "brief" && value !== "placement";
                          return true;
                        })
                        .map(([value, Icon, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => {
                            const sameTab = editorLibraryTab === value;
                            setEditorLibraryTab(value);
                            setLibraryOpen((open) => sameTab ? !open : true);
                          }}
                          title={label}
                          className={editorLibraryTab === value
                            ? "grid h-11 w-11 place-items-center rounded-xl bg-orange-50 text-orange-600 shadow-sm"
                            : "grid h-11 w-11 place-items-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"}
                        >
                          <Icon className="h-4.5 w-4.5" />
                        </button>
                      ))}
                      <div className="my-1 h-px w-8 bg-slate-200" />
                    </div>
                  </div>
                  <div className={libraryOpen
                    ? `fixed inset-x-2 bottom-20 z-40 max-h-[68vh] overflow-y-auto rounded-3xl border bg-white shadow-2xl md:static md:inset-auto md:z-auto md:max-h-none md:overflow-visible md:rounded-none md:border-0 md:shadow-none ${editorLibraryTab === "furniture" || editorLibraryTab === "materials" ? "md:w-[340px]" : "md:w-[260px]"}`
                    : "hidden"}>
                <div className="sticky top-0 z-10 rounded-t-3xl border-b bg-white px-4 py-3 md:rounded-none md:px-5 md:py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold">
                        {editorLibraryTab === "site"
                          ? "Terreno"
                          : editorLibraryTab === "brief"
                            ? "Necessidades"
                            : editorLibraryTab === "placement"
                              ? "Implantação"
                          : editorLibraryTab === "models"
                            ? "Modelos"
                            : editorLibraryTab === "build"
                              ? "Construir"
                              : editorLibraryTab === "rooms"
                                ? "Ambientes"
                                : editorLibraryTab === "furniture"
                                  ? "Biblioteca de produtos"
                                  : editorLibraryTab === "materials"
                                    ? "Materiais"
                                    : "Área externa"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {editorExperienceMode === "guided"
                          ? (GUIDED_LIBRARY_FLOW.find((item) => item.id === editorLibraryTab)?.helper ?? "Escolha uma etapa para continuar.")
                          : editorLibraryTab === "site"
                          ? "Dimensões e implantação do lote"
                          : editorLibraryTab === "brief"
                            ? "Preferências para gerar uma planta inicial"
                            : editorLibraryTab === "placement"
                              ? "Recuos e posição da casa no lote"
                          : editorLibraryTab === "models"
                            ? "Escolha uma base sem sair do editor"
                            : editorLibraryTab === "build"
                              ? "Estrutura e aberturas"
                              : editorLibraryTab === "rooms"
                                ? "Organize os ambientes"
                                : editorLibraryTab === "furniture"
                                  ? "Pesquise, insira e edite no 2D ou 3D"
                                  : editorLibraryTab === "materials"
                                    ? "Aplique no objeto selecionado"
                                    : "Lazer e área externa"}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setLibraryOpen(false)}
                      className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
                      title="Fechar biblioteca"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="p-4">
                  {editorLibraryTab === "site" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        <label className="text-xs font-semibold">
                          Largura
                          <div className="mt-1 flex h-11 items-center rounded-xl border bg-white px-3">
                            <input
                              type="number"
                              min={5}
                              step={0.1}
                              value={lotWidth}
                              onChange={(event) => { setTerrainDefined(true); setLotWidth(Math.max(5, Number(event.target.value) || 5)); }}
                              className="w-full bg-transparent text-sm font-semibold outline-none"
                            />
                            <span className="text-xs text-slate-400">m</span>
                          </div>
                        </label>
                        <label className="text-xs font-semibold">
                          Profundidade
                          <div className="mt-1 flex h-11 items-center rounded-xl border bg-white px-3">
                            <input
                              type="number"
                              min={10}
                              step={0.1}
                              value={lotDepth}
                              onChange={(event) => { setTerrainDefined(true); setLotDepth(Math.max(10, Number(event.target.value) || 10)); }}
                              className="w-full bg-transparent text-sm font-semibold outline-none"
                            />
                            <span className="text-xs text-slate-400">m</span>
                          </div>
                        </label>
                      </div>

                      <div className="rounded-xl border bg-slate-50 p-4">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">Área do terreno</div>
                        <div className="mt-1 text-2xl font-bold">{(lotWidth * lotDepth).toFixed(0)} m²</div>
                        <div className="mt-1 text-xs text-slate-500">{lotWidth.toFixed(1)} × {lotDepth.toFixed(1)} m</div>
                      </div>

                      <div className="rounded-xl border border-dashed p-3 text-xs leading-5 text-slate-500">
                        O lote fica no próprio workspace. Você pode ajustar as dimensões a qualquer momento sem voltar etapas.
                      </div>
                    </div>
                  )}

                  {editorLibraryTab === "models" && (
                    <div className="space-y-3">
                      <label className="flex h-10 items-center gap-2 rounded-xl border bg-white px-3">
                        <Search className="h-4 w-4 text-slate-400" />
                        <input
                          value={modelSearch}
                          onChange={(event) => setModelSearch(event.target.value)}
                          placeholder="Buscar modelo..."
                          className="w-full bg-transparent text-sm outline-none"
                        />
                      </label>

                      <button
                        type="button"
                        onClick={() => setModelGalleryOpen(true)}
                        className="flex w-full items-center justify-between rounded-xl bg-slate-950 px-3 py-2.5 text-left text-white shadow-sm hover:bg-slate-800"
                      >
                        <span>
                          <span className="block text-xs font-bold">Galeria de modelos</span>
                          <span className="block text-[10px] text-white/65">Ver opções maiores sobre o canvas</span>
                        </span>
                        <LayoutGrid className="h-4 w-4" />
                      </button>

                      <button
                        type="button"
                        onClick={startBlankPlan}
                        className="flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left hover:bg-slate-50"
                      >
                        <span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-100">
                          <Plus className="h-5 w-5 text-slate-600" />
                        </span>
                        <span>
                          <span className="block text-sm font-semibold">Projeto vazio</span>
                          <span className="block text-[11px] text-slate-500">Começar desenhando paredes</span>
                        </span>
                      </button>

                      <div className="grid gap-3">
                        {filteredTypologies.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            disabled={lotWidth < item.minLotWidth}
                            title={lotWidth < item.minLotWidth ? `Este modelo precisa de lote com pelo menos ${item.minLotWidth} m de frente` : undefined}
                            onClick={() => applyTypology(item.id)}
                            className="overflow-hidden rounded-xl border bg-white text-left transition hover:border-slate-300 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <div className="aspect-[16/8] overflow-hidden">
                              <ConceptTypologyCardVisual item={item} lotWidth={lotWidth} lotDepth={lotDepth} />
                            </div>
                            <div className="p-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-semibold">{item.title}</div>
                                <div className="text-[10px] font-semibold text-slate-500">≈ {item.suggestedArea} m²</div>
                              </div>
                              <div className="mt-0.5 text-[11px] text-slate-500">{item.subtitle}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {editorLibraryTab === "build" && (
                    <ConceptConstructionLibraryPanel
                      mode="build"
                      interactionMode={interactionMode}
                      wallFirstActive={wallFirstActive}
                      selectedCustomWall={selectedCustomWall}
                      floors={floors}
                      activeFloor={activeFloor}
                      activateWallFirstFloor={activateWallFirstFloor}
                      setInteractionMode={setInteractionMode}
                      clearSelectionForWall={() => {
                        setSelectedId(null);
                        setSelectedOpeningId(null);
                        setSelectedWallId(null);
                        setSelectedCustomWallId(null);
                      }}
                      clearOpeningAndWalls={() => {
                        setSelectedOpeningId(null);
                        setSelectedWallId(null);
                        setSelectedCustomWallId(null);
                      }}
                      closeLibraryOnMobile={closeLibraryOnMobile}
                      addRoom={addRoom}
                      addOpeningPreset={addOpeningPreset}
                      setFloors={setFloors}
                      setActiveFloor={setActiveFloor}
                      setEditorViewPlan={() => setEditorView("plan")}
                      clearRoomSelection={() => setSelectedId(null)}
                    />
                  )}

                  {editorLibraryTab === "brief" && (
                    <ConceptClientBriefPanel
                      lotWidth={lotWidth}
                      lotDepth={lotDepth}
                      initialProjectBrief={projectBrief}
                      placement={{
                        frontSide: normalizeSitePlacement(sitePlacement).frontSide,
                        setbacks: resolveSiteSetbacks(normalizeSitePlacement(sitePlacement)),
                      }}
                      onGenerate={applyClientBrief}
                      onImproveCurrent={async (nextProjectBrief) => {
                        await runAiDevelopment(nextProjectBrief);
                        setEditorLibraryTab("build");
                        setLibraryOpen(true);
                      }}
                    />
                  )}

                  {editorLibraryTab === "placement" && (
                    <ConceptSitePlacementPanel
                      lotWidth={lotWidth}
                      lotDepth={lotDepth}
                      rooms={safeRooms}
                      placement={sitePlacement}
                      onPlacementChange={handleSitePlacementChange}
                      onMoveBuilding={moveWholeProjectTo}
                      onContinue={() => {
                        setEditorLibraryTab("rooms");
                        setLibraryOpen(true);
                      }}
                      onOpenFacade={() => {
                        setEditorView("facade");
                        setLibraryOpen(false);
                      }}
                    />
                  )}

                  {editorLibraryTab === "rooms" && (
                    <ConceptConstructionLibraryPanel
                      mode="rooms"
                      interactionMode={interactionMode}
                      wallFirstActive={wallFirstActive}
                      selectedCustomWall={selectedCustomWall}
                      floors={floors}
                      activeFloor={activeFloor}
                      activateWallFirstFloor={activateWallFirstFloor}
                      setInteractionMode={setInteractionMode}
                      clearSelectionForWall={() => {
                        setSelectedId(null);
                        setSelectedOpeningId(null);
                        setSelectedWallId(null);
                        setSelectedCustomWallId(null);
                      }}
                      clearOpeningAndWalls={() => {
                        setSelectedOpeningId(null);
                        setSelectedWallId(null);
                        setSelectedCustomWallId(null);
                      }}
                      closeLibraryOnMobile={closeLibraryOnMobile}
                      addRoom={addRoom}
                      addOpeningPreset={addOpeningPreset}
                      setFloors={setFloors}
                      setActiveFloor={setActiveFloor}
                      setEditorViewPlan={() => setEditorView("plan")}
                      clearRoomSelection={() => setSelectedId(null)}
                    />
                  )}

                  {editorLibraryTab === "furniture" && (
                    <>
                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Biblioteca de itens</div>
                          <div className="mt-0.5 text-[10px] text-slate-400">{editorView === "model3d" ? "Clique para inserir sem sair do 3D" : "Arraste para posicionar ou clique para inserir"}</div>
                        </div>
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-500">
                          {itemLibrarySection === "products"
                            ? visibleRealCatalogProducts.length + filteredFurniture.length
                            : visibleLibraryMaterials.length}
                        </span>
                      </div>

                      <div className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
                        <button
                          type="button"
                          onClick={() => setItemLibrarySection("products")}
                          className={itemLibrarySection === "products"
                            ? "h-9 rounded-lg bg-white text-xs font-bold text-slate-950 shadow-sm"
                            : "h-9 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800"}
                        >
                          Produtos
                        </button>
                        <button
                          type="button"
                          onClick={() => setItemLibrarySection("materials")}
                          className={itemLibrarySection === "materials"
                            ? "h-9 rounded-lg bg-white text-xs font-bold text-slate-950 shadow-sm"
                            : "h-9 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800"}
                        >
                          Materiais
                        </button>
                      </div>

                      <label className="mb-3 flex h-10 items-center gap-2 rounded-xl border bg-white px-3">
                        <Search className="h-4 w-4 text-slate-400" />
                        <input
                          value={furnitureSearch}
                          onChange={(event) => setFurnitureSearch(event.target.value)}
                          placeholder="Buscar sofá, cama, árvore, luminária..."
                          className="w-full bg-transparent text-sm outline-none"
                        />
                      </label>

                      {itemLibrarySection === "products" && (
                        <>
                        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {([
                            ["all", LayoutGrid, "Todos"],
                            ["favorites", Heart, "Favoritos"],
                            ["recent", Clock3, "Recentes"],
                            ["project", Box, "No projeto"],
                          ] as const).map(([mode, Icon, label]) => (
                            <button
                              key={mode}
                              type="button"
                              onClick={() => {
                                setLibraryMode(mode);
                                if (mode !== "all") setFurnitureCategory("Todos");
                              }}
                              className={libraryMode === mode
                                ? "flex h-9 items-center justify-center gap-1.5 rounded-xl bg-slate-950 px-2 text-[11px] font-bold text-white"
                                : "flex h-9 items-center justify-center gap-1.5 rounded-xl border bg-white px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {label}
                            </button>
                          ))}
                        </div>
  
                        <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">

                        {(["Todos", "Sala", "Quarto", "Jantar", "Cozinha", "Escritório", "Decoração", "Iluminação", "Exterior"] as const).map((category) => (
                          <button
                            key={category}
                            type="button"
                            onClick={() => setFurnitureCategory(category)}
                            className={furnitureCategory === category
                              ? "shrink-0 rounded-full bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white"
                              : "shrink-0 rounded-full border bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600"}
                          >
                            {category}
                          </button>
                        ))}
                      </div>

                        </>
                      )}

                      {itemLibrarySection === "materials" && visibleLibraryMaterials.length > 0 && (
                        <div className="mb-5">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div>
                              <div className="text-xs font-bold text-slate-900">Materiais da biblioteca</div>
                              <div className="text-[10px] text-slate-500">Mesma fonte usada no projeto e no render · clique para aplicar ao elemento selecionado</div>
                            </div>
                            <span className="text-[10px] font-semibold text-slate-400">{visibleLibraryMaterials.length}</span>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {visibleLibraryMaterials.map((material) => (
                              <button
                                key={`library-material-${material.id}`}
                                type="button"
                                onClick={() => {
                                  if (selectedObject) {
                                    applyObjectMaterialToId(selectedObject.id, material.id);
                                    armPaintTool("object", material);
                                    return;
                                  }
                                  if (selectedCustomWall || selectedWall) {
                                    setSelectedWallMaterial(material.id);
                                    armPaintTool("wall", material);
                                    return;
                                  }
                                  if (selected || selectedClosedSpace) {
                                    setSelectedSurfaceMaterial(material.id);
                                    armPaintTool("floor", material);
                                    return;
                                  }
                                  setEditorLibraryTab("materials");
                                }}
                                className="overflow-hidden rounded-xl border bg-white text-left transition hover:border-orange-300 hover:shadow-sm"
                              >
                                <div className="h-16 border-b" style={{ background: material.swatch }} />
                                <div className="p-2.5">
                                  <div className="truncate text-xs font-semibold text-slate-900">{material.name}</div>
                                  <div className="mt-0.5 truncate text-[9px] text-slate-500">{material.category}</div>
                                  {material.source && <div className="mt-1 truncate text-[9px] font-medium text-slate-400">{material.source}</div>}
                                </div>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {itemLibrarySection === "materials" && visibleLibraryMaterials.length === 0 && (
                        <div className="rounded-xl border border-dashed p-4 text-center text-xs text-slate-500">
                          Nenhum material encontrado para esta busca ou seleção.
                        </div>
                      )}

                      {itemLibrarySection === "products" && (
                        <>
                      <ConceptCatalogPanels
                        openingPickerId={openingProductPickerId}
                        opening={openingProductPickerId ? safeCustomOpenings.find((item) => item.id === openingProductPickerId) ?? null : null}
                        catalogProducts={realCatalogProducts}
                        search={furnitureSearch}
                        loading={realCatalogLoading}
                        projectMode={!openingProductPickerId && libraryMode === "project"}
                        usedCounts={Object.fromEntries(usedProjectProductCounts)}
                        usedProducts={usedProjectProducts}
                        onCancelOpening={() => {
                          setOpeningProductPickerId(null);
                          setFurnitureSearch("");
                        }}
                        onApplyOpening={(item) => {
                          if (openingProductPickerId) applyCatalogProductToOpening(openingProductPickerId, item as RealCatalogProduct);
                        }}
                        onSelectUsed={(productId) => {
                          const objectInstance = safeObjects.find((object) => object.catalogProductId === productId);
                          const openingInstance = safeCustomOpenings.find((opening) => opening.catalogProductId === productId);
                          if (objectInstance) {
                            setSelectedObjectId(objectInstance.id);
                            setSelectedOpeningId(null);
                            setSelectedCustomWallId(null);
                            setSelectedWallId(null);
                            setSelectedId(null);
                            setSelectedClosedSpaceId(null);
                          } else if (openingInstance) {
                            setSelectedOpeningId(openingInstance.id);
                            setSelectedObjectId(null);
                            setSelectedCustomWallId(null);
                            setSelectedWallId(null);
                            setSelectedId(null);
                            setSelectedClosedSpaceId(null);
                          }
                          closeLibraryOnMobile();
                        }}
                      />

                      {!openingProductPickerId && libraryMode !== "project" && (polyHavenLoading || polyHavenModels.length > 0) && (
                        <div className="mb-5">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div>
                              <div className="text-xs font-bold text-slate-900">Modelos 3D reais · Poly Haven</div>
                              <div className="text-[10px] text-slate-500">CC0 · <a href="https://polyhaven.com" target="_blank" rel="noreferrer" className="font-semibold text-slate-600 underline-offset-2 hover:underline">Powered by Poly Haven</a> · clique para inserir</div>
                            </div>
                            {polyHavenLoading && <span className="text-[10px] font-semibold text-orange-600">Buscando...</span>}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {polyHavenModels.map((item) => {
                              const pseudo: RealCatalogProduct = {
                                id: item.slug,
                                nome: item.name,
                                categoria: item.category ?? "Mobiliário",
                                subcategoria: item.tags?.join(" ") ?? "",
                              };
                              const preset = inferCatalogFurniturePreset(pseudo);
                              if (!preset) return null;
                              return (
                                <button
                                  key={item.slug}
                                  type="button"
                                  disabled={polyHavenInsertSlug === item.slug}
                                  onClick={async () => {
                                    setPolyHavenInsertSlug(item.slug);
                                    try {
                                      const response = await fetch(`/api/arch/polyhaven/assets/${encodeURIComponent(item.slug)}`);
                                      if (!response.ok) throw new Error("asset");
                                      const asset = await response.json();
                                      addObjectAt(
                                        preset.kind,
                                        item.name,
                                        preset.width,
                                        preset.depth,
                                        libraryInsertPoint,
                                        {
                                          imageUrl: item.thumbnailUrl ?? undefined,
                                          supplier: "Poly Haven",
                                          model3dUrl: typeof asset?.model3dUrl === "string" ? asset.model3dUrl : undefined,
                                        },
                                      );
                                      rememberRecentItem(`polyhaven:${item.slug}`);
                                    } catch {
                                      // Mantém o editor estável: se o GLB não resolver, não insere um asset quebrado.
                                    } finally {
                                      setPolyHavenInsertSlug(null);
                                    }
                                  }}
                                  className="group overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-lg disabled:opacity-60"
                                >
                                  <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                                    {item.thumbnailUrl ? (
                                      <img src={item.thumbnailUrl} alt={item.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]" loading="lazy" />
                                    ) : (
                                      <div className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-50 to-orange-50">
                                        <Box className="h-10 w-10 text-slate-400" />
                                      </div>
                                    )}
                                    <span className="absolute left-2 top-2 rounded-full bg-emerald-600 px-2 py-1 text-[9px] font-bold text-white">CC0</span>
                                    <span className="absolute right-2 top-2 rounded-full bg-orange-500 px-2 py-1 text-[9px] font-bold text-white">3D</span>
                                  </div>
                                  <div className="p-3">
                                    <div className="line-clamp-2 text-xs font-semibold text-slate-900">{item.name}</div>
                                    <div className="mt-1 line-clamp-1 text-[10px] text-slate-500">{item.category ?? "Modelo 3D real"}</div>
                                    <div className="mt-2 text-[10px] font-semibold text-emerald-700">
                                      {polyHavenInsertSlug === item.slug ? "Preparando GLB..." : "Inserir modelo real"}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {!openingProductPickerId && libraryMode !== "project" && (realCatalogLoading || visibleRealCatalogProducts.length > 0) && (
                        <div className="mb-5">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div>
                              <div className="text-xs font-bold text-slate-900">Itens do catálogo para render</div>
                              <div className="text-[10px] text-slate-500">Produto mestre do tenant · mesmo cadastro usado no projeto, render, orçamento e proposta</div>
                            </div>
                            {realCatalogLoading && <span className="text-[10px] font-semibold text-orange-600">Carregando...</span>}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            {visibleRealCatalogProducts.map((item) => {
                              const preset = inferCatalogFurniturePreset(item);
                              const polyHavenQuery = getCatalogPolyHavenQuery(item);
                              const autoPreview = polyHavenQuery ? autoModelPreviews[polyHavenQuery] : undefined;
                              const imageUrl = item.imagens?.[0] ?? autoPreview?.thumbnailUrl ?? undefined;
                              if (!preset) return null;
                              const price = Number(item.precoBase ?? 0);
                              const starter = typeof item.especificacoes?.source === "string" && item.especificacoes.source.startsWith("arqdor-");
                              return (
                                <div
                                  key={item.id}
                                  role="button"
                                  tabIndex={0}
                                  draggable
                                  onDragStart={(event) => {
                                    event.dataTransfer.effectAllowed = "copy";
                                    event.dataTransfer.setData("application/x-arqdor-object", JSON.stringify({
                                      kind: preset.kind,
                                      label: item.nome,
                                      width: preset.width,
                                      depth: preset.depth,
                                      catalogProductId: item.id,
                                      imageUrl,
                                      supplier: item.fornecedor ?? undefined,
                                      price: price > 0 ? price : undefined,
                                      model3dUrl: getCatalogModel3dUrl(item),
                                      textureUrl: getCatalogTextureUrl(item),
                                    }));
                                  }}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter" || event.key === " ") event.currentTarget.click();
                                  }}
                                  onClick={async () => {
                                    rememberRecentItem(realLibraryItemKey(item.id));
                                    let model3dUrl = getCatalogModel3dUrl(item);
                                    let resolvedSupplier = item.fornecedor ?? undefined;
                                    const polyHavenSlug = getCatalogPolyHavenSlug(item);
                                    const polyHavenQuery = getCatalogPolyHavenQuery(item);
                                    const autoPreview = polyHavenQuery ? autoModelPreviews[polyHavenQuery] : undefined;
                                    if (!model3dUrl && polyHavenSlug) {
                                      try {
                                        const response = await fetch(`/api/arch/polyhaven/assets/${encodeURIComponent(polyHavenSlug)}`);
                                        if (response.ok) {
                                          const asset = await response.json();
                                          if (typeof asset?.model3dUrl === "string") {
                                            model3dUrl = asset.model3dUrl;
                                            resolvedSupplier = "Poly Haven";
                                          }
                                        }
                                      } catch {
                                        // Se a resolução remota falhar, o objeto ainda entra com fallback paramétrico.
                                      }
                                    }
                                    if (!model3dUrl && polyHavenQuery) {
                                      try {
                                        const response = await fetch(`/api/arch/catalogo/${encodeURIComponent(item.id)}/resolve-real-model`, {
                                          method: "POST",
                                        });
                                        if (response.ok) {
                                          const asset = await response.json();
                                          if (typeof asset?.model3dUrl === "string") {
                                            model3dUrl = asset.model3dUrl;
                                            resolvedSupplier = "Poly Haven";
                                            setRealCatalogProducts((current) => current.map((product) => {
                                              if (product.id !== item.id) return product;
                                              const specs = product.especificacoes && typeof product.especificacoes === "object"
                                                ? product.especificacoes
                                                : {};
                                              const thumbnailUrl = typeof asset?.thumbnailUrl === "string" ? asset.thumbnailUrl : null;
                                              return {
                                                ...product,
                                                imagens: thumbnailUrl
                                                  ? [thumbnailUrl, ...((product.imagens ?? []).filter((url) => url !== thumbnailUrl))].slice(0, 5)
                                                  : product.imagens,
                                                especificacoes: {
                                                  ...specs,
                                                  model3dUrl: asset.model3dUrl,
                                                  polyHavenSlug: typeof asset?.polyHavenSlug === "string" ? asset.polyHavenSlug : specs.polyHavenSlug,
                                                  modelLicense: "CC0",
                                                  modelSource: "Poly Haven",
                                                  lod: "real-remote",
                                                  source: "arqdor-auto-polyhaven",
                                                },
                                              };
                                            }));
                                          }
                                        }
                                      } catch {
                                        // Mantém fallback paramétrico se a persistência/resolução remota falhar.
                                      }
                                    }
                                    addObjectAt(
                                      preset.kind,
                                      item.nome,
                                      preset.width,
                                      preset.depth,
                                      libraryInsertPoint,
                                      {
                                        catalogProductId: item.id,
                                        imageUrl,
                                        supplier: resolvedSupplier,
                                        price: price > 0 ? price : undefined,
                                        model3dUrl,
                                        textureUrl: getCatalogTextureUrl(item),
                                      },
                                    );
                                  }}
                                  className="group overflow-hidden rounded-2xl border bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:border-orange-300 hover:shadow-lg"
                                >
                                  <div className="relative aspect-[4/3] overflow-hidden bg-slate-100">
                                    <button
                                      type="button"
                                      aria-label="Favoritar produto"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        toggleFavoriteItem(realLibraryItemKey(item.id));
                                      }}
                                      className={favoriteItemIds.includes(realLibraryItemKey(item.id))
                                        ? "absolute bottom-2 right-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white text-rose-500 shadow-md"
                                        : "absolute bottom-2 right-2 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/90 text-slate-500 shadow-md hover:text-rose-500"}
                                    >
                                      <Heart className="h-4 w-4" fill={favoriteItemIds.includes(realLibraryItemKey(item.id)) ? "currentColor" : "none"} />
                                    </button>
                                    {imageUrl ? (
                                      <img
                                        src={imageUrl}
                                        alt={item.nome}
                                        className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <div className="grid h-full w-full place-items-center bg-gradient-to-br from-slate-50 via-white to-orange-50">
                                        <Box className="h-10 w-10 text-slate-400" />
                                      </div>
                                    )}
                                    <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-1 text-[9px] font-bold text-white backdrop-blur">
                                      {starter ? "ARQDOR BASE" : "CATÁLOGO"}
                                    </span>
                                    {(getCatalogModel3dUrl(item) || getCatalogPolyHavenSlug(item) || getCatalogPolyHavenQuery(item)) && (
                                      <span className="absolute right-2 top-2 rounded-full bg-orange-500 px-2 py-1 text-[9px] font-bold text-white shadow">
                                        {getCatalogPolyHavenQuery(item) && !getCatalogModel3dUrl(item) && !getCatalogPolyHavenSlug(item)
                                          ? "3D AUTO"
                                          : "3D REAL"}
                                      </span>
                                    )}
                                  </div>
                                  <div className="p-3">
                                    <div className="line-clamp-2 text-xs font-semibold text-slate-900">{item.nome}</div>
                                    <div className="mt-1 text-[10px] text-slate-500">
                                      {[item.categoria, item.fornecedor ?? (autoPreview ? "Poly Haven" : null)].filter(Boolean).join(" · ") || "Catálogo"}
                                    </div>
                                    {price > 0 && (
                                      <div className="mt-2 text-xs font-bold text-slate-900">
                                        {price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      <div className="mb-3 flex items-center justify-between">
                        <div>
                          <div className="text-xs font-bold text-slate-900">Biblioteca paramétrica</div>
                          <div className="text-[10px] text-slate-500">Itens genéricos editáveis em 2D e 3D</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {filteredFurniture.map(({ kind, label, width, depth, category }) => (
                          <div
                            key={`${category}-${label}`}
                            role="button"
                            tabIndex={0}
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "copy";
                              event.dataTransfer.setData("application/x-arqdor-object", JSON.stringify({ kind, label, width, depth }));
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") event.currentTarget.click();
                            }}
                            onClick={() => {
                              rememberRecentItem(libraryItemKey(label, category));
                              addObjectAt(kind, label, width, depth, libraryInsertPoint);
                            }}
                            className="cursor-grab overflow-hidden rounded-xl border bg-white text-left transition active:cursor-grabbing hover:border-orange-300 hover:shadow-md"
                          >
                            <div className="relative grid h-24 place-items-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-stone-100">
                              <button
                                type="button"
                                aria-label="Favoritar item"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleFavoriteItem(libraryItemKey(label, category));
                                }}
                                className={favoriteItemIds.includes(libraryItemKey(label, category))
                                  ? "absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-white text-rose-500 shadow-sm"
                                  : "absolute right-2 top-2 z-10 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-slate-400 shadow-sm hover:text-rose-500"}
                              >
                                <Heart className="h-3.5 w-3.5" fill={favoriteItemIds.includes(libraryItemKey(label, category)) ? "currentColor" : "none"} />
                              </button>
                              <div className="absolute left-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[9px] font-semibold text-slate-500 shadow-sm">
                                {category}
                              </div>
                              {kind === "sofa" && (
                                <div className="relative h-10 w-16 rounded-lg border-2 border-slate-500 bg-slate-200">
                                  <div className="absolute left-1 right-1 top-1 h-3 rounded bg-slate-300" />
                                  <div className="absolute bottom-1 left-1 h-4 w-[46%] rounded bg-white/80" />
                                  <div className="absolute bottom-1 right-1 h-4 w-[46%] rounded bg-white/80" />
                                </div>
                              )}
                              {kind === "bed" && (
                                <div className="relative h-14 w-10 rounded-md border-2 border-slate-400 bg-white">
                                  <div className="absolute left-1 right-1 top-1 h-3 rounded bg-slate-200" />
                                  <div className="absolute bottom-1 left-1 right-1 top-5 rounded bg-stone-100" />
                                </div>
                              )}
                              {kind === "table" && (
                                <div className="h-10 w-14 rounded-xl border-2 border-amber-700/70 bg-amber-100 shadow-sm" />
                              )}
                              {kind === "chair" && (
                                <div className="relative h-11 w-10">
                                  <div className="absolute inset-x-1 top-1 h-7 rounded-lg border-2 border-slate-500 bg-slate-100" />
                                  <div className="absolute bottom-0 left-1 h-3 w-1 bg-slate-500" />
                                  <div className="absolute bottom-0 right-1 h-3 w-1 bg-slate-500" />
                                </div>
                              )}
                              {kind === "plant" && (
                                <div className="relative h-14 w-12">
                                  <div className="absolute bottom-0 left-1/2 h-5 w-8 -translate-x-1/2 rounded-b-lg border-2 border-amber-800/60 bg-amber-100" />
                                  <div className="absolute left-1/2 top-0 h-10 w-10 -translate-x-1/2 rounded-full bg-emerald-200 shadow-inner">
                                    <div className="absolute left-1 top-3 h-5 w-5 rounded-full bg-emerald-400/80" />
                                    <div className="absolute right-1 top-1 h-6 w-6 rounded-full bg-emerald-500/70" />
                                  </div>
                                </div>
                              )}
                              {kind === "lamp" && (
                                <div className="relative h-14 w-12">
                                  <div className="absolute left-1/2 top-1 h-8 w-8 -translate-x-1/2 rounded-full border-2 border-amber-400 bg-amber-100 shadow-[0_0_14px_rgba(251,191,36,0.45)]" />
                                  <div className="absolute bottom-1 left-1/2 h-8 w-1 -translate-x-1/2 bg-slate-600" />
                                  <div className="absolute bottom-0 left-1/2 h-1 w-8 -translate-x-1/2 rounded bg-slate-700" />
                                </div>
                              )}
                              {kind === "rug" && (
                                <div className="relative h-10 w-16 rounded-xl border-2 border-stone-400 bg-stone-200 shadow-sm">
                                  <div className="absolute inset-1 rounded-lg border border-dashed border-stone-400" />
                                </div>
                              )}
                              {kind === "cabinet" && (
                                <div className="relative h-14 w-12 rounded border-2 border-amber-800/70 bg-amber-100">
                                  <div className="absolute bottom-1 left-1 top-1 w-[44%] border-r border-amber-800/50" />
                                  <div className="absolute bottom-1 right-1 top-1 w-[44%]" />
                                </div>
                              )}
                              {kind === "tv" && (
                                <div className="relative h-10 w-16 rounded border-2 border-slate-700 bg-slate-900 shadow-md">
                                  <div className="absolute inset-1 rounded bg-gradient-to-br from-slate-700 to-slate-950" />
                                </div>
                              )}
                            </div>
                            <div className="p-3">
                              <div className="text-sm font-semibold">{label}</div>
                              <div className="mt-0.5 text-[10px] text-muted-foreground">
                                {width.toFixed(2).replace(".", ",")} × {depth.toFixed(2).replace(".", ",")} m
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {!filteredFurniture.length && (
                        <div className="rounded-xl border border-dashed p-4 text-center text-xs text-slate-500">
                          {libraryMode === "favorites"
                            ? "Nenhum favorito ainda. Toque no coração dos itens que você usa mais."
                            : libraryMode === "recent"
                              ? "Nenhum item recente ainda. Os últimos itens inseridos aparecerão aqui."
                              : "Nenhum item encontrado nessa categoria."}
                        </div>
                      )}
                        </>
                      )}
                    </>
                  )}

                  {editorLibraryTab === "materials" && (
                    <>
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Materiais</div>
                        <span className="truncate text-[10px] text-slate-400">
                          {selectedObject
                            ? selectedObject.label
                            : selectedCustomWall || selectedWall
                              ? "Parede selecionada"
                              : selected
                                ? selected.label
                                : selectedClosedSpace
                                  ? selectedSpaceProfile?.label ?? "Ambiente"
                                  : "Selecione um elemento"}
                        </span>
                      </div>

                      {selectedObject ? (
                        <>
                          {selectedObject.catalogProductId && selectedProductMaterialLinks.length > 0 ? (
                            <div className="space-y-4">
                              <div className="rounded-xl border bg-slate-50 p-3">
                                <div className="text-xs font-semibold text-slate-700">Acabamentos disponíveis para este produto</div>
                                <div className="mt-1 text-[10px] leading-4 text-slate-500">
                                  Somente materiais autorizados no Catálogo. A escolha é salva nesta peça e aparece imediatamente no 3D.
                                </div>
                                {Number(selectedObject.configuredPrice ?? selectedObject.price ?? 0) > 0 && (
                                  <div className="mt-2 text-sm font-bold text-slate-800">
                                    R$ {Number(selectedObject.configuredPrice ?? selectedObject.price ?? 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </div>
                                )}
                              </div>

                              {[...new Set(selectedProductMaterialLinks.map((link) => link.surfaceKey || "__all__"))].map((surface) => {
                                const links = selectedProductMaterialLinks.filter((link) => (link.surfaceKey || "__all__") === surface);
                                const current = selectedObject.materialSelections?.[surface];
                                const surfaceLabel = surface === "__all__"
                                  ? (links[0]?.grupo || "Produto inteiro")
                                  : (links[0]?.grupo || surface.replace(/^material:|^node:/, "").replace(/-/g, " "));
                                return (
                                  <div key={surface} className="space-y-2">
                                    <div className="flex items-center justify-between gap-2">
                                      <div className="text-xs font-semibold capitalize text-slate-700">{surfaceLabel}</div>
                                      {current && (
                                        <button type="button" onClick={() => clearProductMaterialSelection(surface)}
                                          className="text-[10px] font-medium text-slate-400 hover:text-slate-700">
                                          Usar padrão
                                        </button>
                                      )}
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                      {links.map((link) => {
                                        const material = link.material;
                                        if (!material) return null;
                                        const texture = material.primaryImage?.storageUrl;
                                        const selectedMaterial = current?.materialId === material.id
                                          || (!current && link.isDefault);
                                        return (
                                          <button
                                            key={link.id}
                                            type="button"
                                            onClick={() => applyProductMaterialSelection(surface, link)}
                                            className={selectedMaterial
                                              ? "overflow-hidden rounded-xl border-2 border-orange-500 bg-orange-50 text-left"
                                              : "overflow-hidden rounded-xl border bg-white text-left hover:border-orange-300 hover:shadow-sm"}
                                          >
                                            <div className="h-20 border-b bg-slate-100">
                                              {texture ? (
                                                <img src={texture} alt={material.nome} className="h-full w-full object-cover" />
                                              ) : (
                                                <div className="grid h-full place-items-center text-[10px] text-slate-400">Sem imagem</div>
                                              )}
                                            </div>
                                            <div className="p-2.5">
                                              <div className="truncate text-xs font-semibold">{material.nome}</div>
                                              <div className="mt-0.5 truncate text-[9px] text-muted-foreground">{material.fabricante} · {material.linha}</div>
                                              {Number(link.precoAdicional ?? 0) > 0 && (
                                                <div className="mt-1 text-[10px] font-semibold text-emerald-700">
                                                  + R$ {Number(link.precoAdicional).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                </div>
                                              )}
                                              {selectedMaterial && (
                                                <div className="mt-1 text-[9px] font-semibold text-orange-600">Selecionado</div>
                                              )}
                                            </div>
                                          </button>
                                        );
                                      })}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : selectedObject.catalogProductId && selectedProductMaterialsLoading ? (
                            <div className="rounded-xl border border-dashed p-4 text-center text-xs text-slate-500">
                              Carregando acabamentos do produto…
                            </div>
                          ) : (
                            <>
                              <div className="mb-3 text-xs font-semibold text-slate-600">Acabamento genérico do objeto</div>
                              <div className="grid grid-cols-2 gap-3">
                                {objectMaterialOptions.map((material) => (
                                  <button
                                    key={material.id}
                                    type="button"
                                    onClick={() => {
                                      applyObjectMaterialToId(selectedObject.id, material.id);
                                      armPaintTool("object", material);
                                    }}
                                    className={selectedObject.materialId === material.id
                                      ? "overflow-hidden rounded-xl border-2 border-orange-500 bg-orange-50 text-left"
                                      : "overflow-hidden rounded-xl border bg-white text-left hover:border-orange-300 hover:shadow-sm"}
                                  >
                                    <div className="h-16 border-b" style={{ background: material.swatch }} />
                                    <div className="p-3">
                                      <div className="text-sm font-semibold">{material.name}</div>
                                      <div className="mt-0.5 text-[10px] text-muted-foreground">{material.category}</div>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </>
                      ) : selectedCustomWall || selectedWall ? (
                        <>
                          <div className="mb-3 text-xs font-semibold text-slate-600">Acabamento da parede</div>
                          <div className="grid grid-cols-2 gap-3">
                            {wallMaterialOptions.map((material) => {
                              const wallId = selectedCustomWall?.id ?? selectedWall?.id ?? "";
                              const currentMaterial = wallMaterials[wallId];
                              return (
                                <button
                                  key={material.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedWallMaterial(material.id);
                                    armPaintTool("wall", material);
                                  }}
                                  className={currentMaterial === material.id
                                    ? "overflow-hidden rounded-xl border-2 border-orange-500 bg-orange-50 text-left"
                                    : "overflow-hidden rounded-xl border bg-white text-left hover:border-orange-300 hover:shadow-sm"}
                                >
                                  <div className="relative h-16 overflow-hidden border-b" style={{ background: material.swatch }}>
                                    {material.id === "madeira-ripada" && (
                                      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 10px, #5b4636 10px 12px)" }} />
                                    )}
                                    {material.id === "pedra-cinza" && (
                                      <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, #111827 0 1px, transparent 1px), radial-gradient(circle at 70% 60%, #111827 0 1px, transparent 1px)", backgroundSize: "16px 16px" }} />
                                    )}
                                  </div>
                                  <div className="p-3">
                                    <div className="text-sm font-semibold">{material.name}</div>
                                    <div className="mt-0.5 text-[10px] text-muted-foreground">{material.category}</div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </>
                      ) : selected || selectedClosedSpace ? (
                        <>
                          <div className="mb-3 text-xs font-semibold text-slate-600">Piso do ambiente</div>
                          <div className="grid grid-cols-2 gap-3">
                            {floorMaterialOptions.map((material) => {
                              const currentMaterial = selected?.floorMaterialId ?? selectedSpaceProfile?.floorMaterialId;
                              return (
                                <button
                                  key={material.id}
                                  type="button"
                                  onClick={() => {
                                    setSelectedSurfaceMaterial(material.id);
                                    armPaintTool("floor", material);
                                  }}
                                  className={currentMaterial === material.id
                                    ? "overflow-hidden rounded-xl border-2 border-orange-500 bg-orange-50 text-left"
                                    : "overflow-hidden rounded-xl border bg-white text-left hover:border-orange-300 hover:shadow-sm"}
                                >
                                  <div className="relative h-16 overflow-hidden border-b" style={{ background: material.swatch }}>
                                    {(material.id.includes("madeira") || material.id === "vinilico-claro") && (
                                      <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "repeating-linear-gradient(90deg, transparent 0 18px, #5b4636 18px 19px)" }} />
                                    )}
                                    {(material.id.includes("porcelanato") || material.id.includes("ceramica")) && (
                                      <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "linear-gradient(#78716c 1px, transparent 1px), linear-gradient(90deg, #78716c 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
                                    )}
                                  </div>
                                  <div className="p-3">
                                    <div className="text-sm font-semibold">{material.name}</div>
                                    <div className="mt-0.5 text-[10px] text-muted-foreground">{material.category}</div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <div className="rounded-2xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                          Selecione um móvel, uma parede ou um ambiente na planta. O painel mostra automaticamente os materiais compatíveis.
                        </div>
                      )}
                    </>
                  )}

                  {editorLibraryTab === "outdoor" && (
                    <>
                      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Área externa</div>
                      <div className="grid grid-cols-2 gap-3">
                        {([
                          ["piscina", Waves, "Piscina", "from-sky-50 to-cyan-100"],
                          ["gourmet", ChefHat, "Gourmet", "from-amber-50 to-orange-100"],
                          ["garagem", CarFront, "Garagem", "from-slate-50 to-slate-200"],
                        ] as Array<[RoomKind, typeof Home, string, string]>).map(([kind, Icon, label, gradient]) => {
                          const classifySpace = wallFirstActive && (kind === "gourmet" || kind === "garagem");
                          return (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => {
                                if (classifySpace) {
                                  setInteractionMode("space");
                                  setEditorLibraryTab("rooms");
                                  setSelectedId(null);
                                  return;
                                }
                                addRoom(kind);
                                closeLibraryOnMobile();
                              }}
                              className="overflow-hidden rounded-xl border bg-white text-left hover:border-orange-300 hover:shadow-sm"
                            >
                              <div className={`grid h-24 place-items-center bg-gradient-to-br ${gradient}`}>
                                <Icon className="h-9 w-9 text-slate-700" />
                              </div>
                              <div className="p-3">
                                <div className="flex items-center justify-between">
                                  <span className="text-sm font-semibold">{label}</span>
                                  <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                                </div>
                                <div className="mt-0.5 text-[10px] text-muted-foreground">
                                  {classifySpace ? "Classificar espaço fechado" : "Inserir no lote"}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => {
                            setEditorView("facade");
                            setLibraryOpen(false);
                          }}
                          className="overflow-hidden rounded-xl border bg-white text-left hover:border-emerald-300 hover:shadow-sm"
                        >
                          <div className="grid h-24 place-items-center bg-gradient-to-br from-emerald-50 to-green-100">
                            <Trees className="h-9 w-9 text-emerald-700" />
                          </div>
                          <div className="p-3">
                            <div className="text-sm font-semibold">Paisagismo</div>
                            <div className="mt-0.5 text-[10px] text-muted-foreground">Abrir composição externa</div>
                          </div>
                        </button>
                      </div>
                    </>
                  )}

                  {!terrainOnly && safeObjects.filter((object) => object.floor === activeFloor).length > 0 && (
                    <div className="mt-5 rounded-xl border bg-slate-50 p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">Objetos no pavimento · arraste para editar</span>
                        <span className="rounded-full bg-white px-2 py-1 font-bold text-slate-600">
                          {safeObjects.filter((object) => object.floor === activeFloor).length}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className={terrainOnly ? "hidden" : "mt-6 hidden border-t pt-4 xl:block"}>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">No projeto</div>
                    <div className="mt-3 max-h-64 space-y-1.5 overflow-auto">
                      {wallFirstActive
                        ? closedSpaces.map((space) => (
                            <button
                              key={space.id}
                              type="button"
                              onClick={() => {
                                setInteractionMode("space");
                                setSelectedClosedSpaceId(space.id);
                                setSelectedId(null);
                                setEditorView("plan");
                              }}
                              className={selectedClosedSpaceId === space.id
                                ? "w-full rounded-xl border border-orange-500 bg-orange-500/5 px-3 py-2.5 text-left"
                                : "w-full rounded-xl border bg-background px-3 py-2.5 text-left hover:bg-muted/40"}
                            >
                              <div className="truncate text-xs font-semibold">{spaceAssignments.get(space.id)?.label || "Espaço sem nome"}</div>
                              <div className="mt-0.5 text-[10px] text-muted-foreground">{space.area.toFixed(1)} m²</div>
                            </button>
                          ))
                        : visibleRooms.map((room) => (
                            <button
                              key={room.id}
                              type="button"
                              onClick={() => { setSelectedId(room.id); setEditorView("plan"); }}
                              className={selectedId === room.id
                                ? "w-full rounded-xl border border-orange-500 bg-orange-500/5 px-3 py-2.5 text-left"
                                : "w-full rounded-xl border bg-background px-3 py-2.5 text-left hover:bg-muted/40"}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate text-xs font-semibold">{room.label}</span>
                                {room.locked && <Lock className="h-3 w-3 shrink-0" />}
                              </div>
                              <div className="mt-0.5 text-[10px] text-muted-foreground">{(room.width * room.depth).toFixed(1)} m²</div>
                            </button>
                          ))}
                    </div>
                  </div>
                </div>
                  </div>
                </div>
              </aside>

              <div className="arq-workspace-center arq-canvas relative min-h-[calc(100dvh-56px)] overflow-hidden bg-[#f6f7f8]">
                  {editorView === "plan" && referencePlan?.kind === "image" && referenceTraceState !== "applied" && (
                    <div className="absolute left-1/2 top-3 z-[70] w-[min(620px,calc(100%-32px))] -translate-x-1/2 rounded-2xl border border-blue-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur">
                      <div className="flex items-center gap-3">
                        <div className={referenceTraceState === "error"
                          ? "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600"
                          : "grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700"}>
                          {referenceTraceState === "loading" ? <Sparkles className="h-4 w-4 animate-pulse" /> : <Ruler className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-950">
                            {referenceTraceState === "loading"
                              ? "Gerando planta editável..."
                              : referenceTraceState === "ready"
                                ? "Planta reconhecida — revisar"
                                : referenceTraceState === "error"
                                  ? "A leitura da planta precisa de atenção"
                                  : "Imagem importada — preparando leitura"}
                          </div>
                          <div className="mt-0.5 truncate text-[11px] text-slate-500">
                            {referencePlanMessage ?? "A imagem será convertida em paredes e aberturas editáveis."}
                          </div>
                        </div>
                        {referenceTraceState === "error" && (
                          <button
                            type="button"
                            onClick={() => void traceReferencePlanWithAi()}
                            className="shrink-0 rounded-xl bg-slate-950 px-3 py-2 text-[11px] font-bold text-white"
                          >
                            Tentar novamente
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {editorView === "plan" && !terrainOnly && (
                      <div className={`absolute top-3 z-30 flex snap-x items-center gap-1.5 overflow-x-auto rounded-2xl border border-slate-200 bg-white/96 p-1.5 shadow-md backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden
                        left-16 right-3 md:right-auto
                        ${libraryOpen ? (editorLibraryTab === "furniture" || editorLibraryTab === "materials" ? "md:left-[460px]" : "md:left-[380px]") : "md:left-20"}
                      `}>
                        <button
                          type="button"
                          title="Selecionar e editar paredes, ambientes, portas e janelas"
                          onClick={() => {
                            setInteractionMode("navigate");
                            setSelectedId(null);
                            setSelectedClosedSpaceId(null);
                            setSelectedOpeningId(null);
                            setSelectedWallId(null);
                            setSelectedCustomWallId(null);
                          }}
                          className={interactionMode === "navigate"
                            ? "shrink-0 rounded-xl bg-foreground px-3 py-2 text-xs font-semibold text-background"
                            : "shrink-0 rounded-xl border bg-background px-3 py-2 text-xs font-semibold"}
                        >
                          Selecionar / editar
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!wallFirstActive) activateWallFirstFloor();
                            setInteractionMode("draw-wall");
                            setSelectedId(null);
                            setSelectedOpeningId(null);
                            setSelectedWallId(null);
                            setSelectedCustomWallId(null);
                          }}
                          className={interactionMode === "draw-wall"
                            ? "shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white"
                            : "shrink-0 rounded-xl border bg-background px-3 py-2 text-xs font-semibold"}
                        >
                          + Parede
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInteractionMode(wallFirstActive ? "space" : "room");
                            setSelectedOpeningId(null);
                            setSelectedWallId(null);
                            setSelectedCustomWallId(null);
                          }}
                          className={(interactionMode === "room" || interactionMode === "space")
                            ? "shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white"
                            : "shrink-0 rounded-xl border bg-background px-3 py-2 text-xs font-semibold"}
                        >
                          Ambientes
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setInteractionMode("opening");
                            setSelectedId(null);
                            setSelectedWallId(null);
                            setSelectedCustomWallId(null);
                          }}
                          className={interactionMode === "opening"
                            ? "shrink-0 rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white"
                            : "shrink-0 rounded-xl border bg-background px-3 py-2 text-xs font-semibold"}
                        >
                          Portas / janelas
                        </button>
                        <button
                          type="button"
                          title="Abrir biblioteca de produtos e objetos"
                          onClick={() => {
                            setEditorLibraryTab("furniture");
                            setItemLibrarySection("products");
                            setLibraryOpen(true);
                          }}
                          className={libraryOpen && editorLibraryTab === "furniture" && itemLibrarySection === "products"
                            ? "shrink-0 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
                            : "shrink-0 rounded-xl border bg-background px-3 py-2 text-xs font-semibold"}
                        >
                          Produtos
                        </button>
                        <button
                          type="button"
                          title="Abrir biblioteca de materiais para pintar e especificar"
                          onClick={() => {
                            setEditorLibraryTab("furniture");
                            setItemLibrarySection("materials");
                            setLibraryOpen(true);
                          }}
                          className={libraryOpen && editorLibraryTab === "furniture" && itemLibrarySection === "materials"
                            ? "shrink-0 rounded-xl bg-slate-950 px-3 py-2 text-xs font-semibold text-white"
                            : "shrink-0 rounded-xl border bg-background px-3 py-2 text-xs font-semibold"}
                        >
                          Materiais
                        </button>
                        <button
                          type="button"
                          title="Mostrar cotas principais; medidas detalhadas aparecem ao selecionar um elemento"
                          onClick={() => setShowDimensions((value) => !value)}
                          className={showDimensions
                            ? "rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800"
                            : "rounded-xl border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground"}
                        >
                          Cotas {showDimensions ? "✓" : ""}
                        </button>
                      </div>
                    )}

                  {editorView === "plan" && (
                    <>
                      {paintTool && (
                        <div className="absolute left-1/2 top-16 z-[65] flex max-w-[calc(100%-24px)] -translate-x-1/2 items-center gap-3 rounded-2xl border border-orange-200 bg-white/95 px-3 py-2 shadow-xl backdrop-blur">
                          <span className="h-7 w-7 shrink-0 rounded-lg border" style={{ background: paintTool.swatch }} />
                          <div className="min-w-0">
                            <div className="truncate text-xs font-bold text-slate-900">Pintar: {paintTool.name}</div>
                            <div className="truncate text-[10px] text-slate-500">
                              {paintTool.target === "wall"
                                ? "Toque nas paredes para aplicar"
                                : paintTool.target === "floor"
                                  ? "Toque nos ambientes para aplicar"
                                  : "Toque nos móveis para aplicar"}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPaintTool(null)}
                            className="shrink-0 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-semibold text-white"
                          >
                            Encerrar
                          </button>
                        </div>
                      )}
                      <div
                        className={`absolute bottom-0 top-0 z-10
                          left-14 right-0 sm:left-16
                          ${libraryOpen ? "md:left-[324px]" : "md:left-16"}
                          ${hasEditorSelection ? "md:right-[364px]" : "md:right-0"}
                        `}
                      >
                      <ConceptPlan2D
                        rooms={terrainOnly || hideCurrentGeometryForReferenceReview ? [] : visibleRooms}
                        lotWidth={lotWidth}
                        lotDepth={lotDepth}
                        showLotBoundary={startWithTerrain === true && terrainDefined}
                        activeFloor={activeFloor}
                        geometry={terrainOnly || hideCurrentGeometryForReferenceReview ? { ...geometry, walls: [], openings: [] } : geometry}
                        referenceImage={showReferenceImage && referencePlan?.kind === "image" ? {
                          url: referencePlan.url,
                          opacity: referenceDisplayMode === "reference" ? Math.max(0.72, referencePlan.opacity ?? 0.35) : Math.min(0.34, referencePlan.opacity ?? 0.28),
                          x: referencePlan.offsetX,
                          y: referencePlan.offsetY,
                          width: referencePlan.widthMeters,
                          height: referencePlan.depthMeters,
                        } : null}
                        previewWalls={showReferenceVector && referenceTraceState === "ready" ? referenceTracePreview?.walls ?? [] : []}
                        previewOpenings={showReferenceVector && referenceTraceState === "ready" ? referenceTracePreview?.openings ?? [] : []}
                        closedSpaces={terrainOnly || hideCurrentGeometryForReferenceReview ? [] : closedSpaces}
                        selectedClosedSpaceId={selectedClosedSpaceId}
                        onSelectClosedSpace={(spaceId) => {
                          if (spaceId && paintTool?.target === "floor") {
                            applyFloorMaterialToSpace(spaceId, paintTool.materialId);
                            return;
                          }
                          setSelectedClosedSpaceId(spaceId);
                          setSelectedId(null);
                          setSelectedOpeningId(null);
                          setSelectedWallId(null);
                          setSelectedCustomWallId(null);
                          setSelectedObjectId(null);
                          closeLibraryOnMobile();
                        }}
                        closedSpaceLabels={Object.fromEntries(
                          closedSpaces.map((space) => [
                            space.id,
                            spaceAssignments.get(space.id)?.label || modelLevels.find((level) => level.floor === activeFloor)?.labels[space.id] || "",
                          ]),
                        )}
                        selectedId={selectedId}
                        onSelect={(roomId) => {
                          if (paintTool?.target === "floor") {
                            applyFloorMaterialToRoom(roomId, paintTool.materialId);
                            return;
                          }
                          setSelectedId(roomId);
                          setSelectedOpeningId(null);
                          setSelectedObjectId(null);
                          closeLibraryOnMobile();
                        }}
                        onRoomChange={updateRoomById}
                        selectedOpeningId={selectedOpeningId}
                        onSelectOpening={(openingId) => {
                          setSelectedOpeningId(openingId);
                          setSelectedId(null);
                          setSelectedObjectId(null);
                          if (openingId) {
                            setSelectedWallId(null);
                            setSelectedCustomWallId(null);
                            setSelectedClosedSpaceId(null);
                          }
                          closeLibraryOnMobile();
                        }}
                        onOpeningChange={updateOpeningById}
                        onOpeningWidthChange={updateOpeningWidth}
                        selectedWallId={selectedWallId}
                        onSelectWall={(wallId) => {
                          if (wallId && paintTool?.target === "wall") {
                            applyWallMaterialToId(wallId, paintTool.materialId);
                            return;
                          }
                          setSelectedWallId(wallId);
                          setSelectedId(null);
                          setSelectedOpeningId(null);
                          setSelectedObjectId(null);
                          closeLibraryOnMobile();
                        }}
                        onWallMove={moveWallById}
                        customWalls={terrainOnly || hideCurrentGeometryForReferenceReview ? [] : safeCustomWalls.filter((wall) => wall.floor === activeFloor)}
                        selectedCustomWallId={selectedCustomWallId}
                        onCreateCustomWall={addCustomWall}
                        onSelectCustomWall={(wallId) => {
                          if (wallId && paintTool?.target === "wall") {
                            applyWallMaterialToId(wallId, paintTool.materialId);
                            return;
                          }
                          setSelectedCustomWallId(wallId);
                          setSelectedWallId(null);
                          setSelectedId(null);
                          setSelectedOpeningId(null);
                          setSelectedObjectId(null);
                          closeLibraryOnMobile();
                        }}
                        onDeleteCustomWall={deleteCustomWall}
                        onUpdateCustomWall={updateCustomWall}
                        onCustomWallLengthChange={updateCustomWallLength}
                        topologyNodes={customWallTopology.nodes}
                        showDimensions={showDimensions}
                        onMoveTopologyJunction={moveTopologyJunction}
                        onEditStart={beginRoomEdit}
                        onEditEnd={endRoomEdit}
                        interactionMode={interactionMode}
                        objects={terrainOnly || hideCurrentGeometryForReferenceReview ? [] : safeObjects}
                        previewObjects={
                          furnishLayoutSpaceId === selectedClosedSpaceId
                            ? (furnishLayoutOptions.find((item) => item.id === previewFurnishLayoutId)?.objects ?? [])
                            : []
                        }
                        previewDiagnostics={
                          furnishLayoutSpaceId === selectedClosedSpaceId
                            ? (() => {
                                const current = furnishLayoutOptions.find((item) => item.id === previewFurnishLayoutId);
                                const bestScore = Math.max(...furnishLayoutOptions.map((item) => item.score), 1);
                                if (!current) return undefined;
                                const quality = Math.max(0, Math.min(100, Math.round((current.score / bestScore) * 100)));
                                return {
                                  score: current.score,
                                  quality,
                                  doorZones: current.doorZones,
                                  windowZones: current.windowZones,
                                };
                              })()
                            : undefined
                        }
                        selectedObjectId={selectedObjectId}
                        onSelectObject={(objectId) => {
                          if (objectId && paintTool?.target === "object") {
                            applyObjectMaterialToId(objectId, paintTool.materialId);
                            return;
                          }
                          setSelectedObjectId(objectId);
                          if (objectId) {
                            setSelectedId(null);
                            setSelectedOpeningId(null);
                            setSelectedWallId(null);
                            setSelectedCustomWallId(null);
                            setSelectedClosedSpaceId(null);
                            closeLibraryOnMobile();
                          }
                        }}
                        onObjectChange={updateObjectById}
                        onObjectDrop={(preset, point) => addObjectAt(
                          preset.kind,
                          preset.label,
                          preset.width,
                          preset.depth,
                          point,
                          {
                            catalogProductId: preset.catalogProductId,
                            imageUrl: preset.imageUrl,
                            supplier: preset.supplier,
                            price: preset.price,
                            model3dUrl: preset.model3dUrl,
                          },
                        )}
                        onObjectRotate={rotateObject}
                        onObjectDuplicate={duplicateObject}
                        onObjectDelete={deleteObject}
                        roomFloorMaterials={roomFloorMaterials}
                        spaceFloorMaterials={spaceFloorMaterials}
                        wallMaterials={wallMaterials}
                        onOpenMaterials={openMaterialsForSelection}
                        onRoomDuplicate={duplicateRoomById}
                        onRoomDelete={deleteRoomById}
                        paintTarget={paintTool?.target ?? null}
                      />
                      </div>
                      <div className="absolute bottom-[calc(5rem+env(safe-area-inset-bottom))] left-3 z-20 flex items-center gap-2 md:bottom-4 md:left-20">
                        <div className="flex overflow-hidden rounded-xl border bg-white shadow-sm">
                          <button
                            type="button"
                            onClick={undoRooms}
                            disabled={!roomHistory.length}
                            className="grid h-10 w-10 place-items-center border-r text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                            title="Desfazer"
                          >
                            <RotateCcw className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={redoRooms}
                            disabled={!roomFuture.length}
                            className="grid h-10 w-10 place-items-center text-slate-600 hover:bg-slate-50 disabled:opacity-30"
                            title="Refazer"
                          >
                            <RotateCw className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm">
                          {currentArea.toFixed(0)} m²
                        </div>
                      </div>
                    </>
                  )}

                  {editorView === "model3d" && (
                    <ConceptModel3D
                      lotWidth={lotWidth}
                      lotDepth={lotDepth}
                      activeFloor={activeFloor}
                      levels={modelLevels}
                      roof={facadePreferences.roof}
                      facadeDesign={facadeDesign}
                      frontSide={normalizeSitePlacement(sitePlacement).frontSide}
                      objects={safeObjects}
                      selectedObjectId={selectedObjectId}
                      selectedWallId={selectedWallId}
                      selectedCustomWallId={selectedCustomWallId}
                      selectedClosedSpaceId={selectedClosedSpaceId}
                      selectedOpeningId={selectedOpeningId}
                      onSelectObject={(objectId) => {
                        setSelectedObjectId(objectId);
                        if (objectId) {
                          setSelectedId(null);
                          setSelectedOpeningId(null);
                          setSelectedWallId(null);
                          setSelectedCustomWallId(null);
                          setSelectedClosedSpaceId(null);
                        }
                      }}
                      onObjectChange={updateObjectById}
                      onObjectDrop={(preset, point) => addObjectAt(
                        preset.kind,
                        preset.label,
                        preset.width,
                        preset.depth,
                        point,
                        {
                          catalogProductId: preset.catalogProductId,
                          imageUrl: preset.imageUrl,
                          supplier: preset.supplier,
                          price: preset.price,
                          model3dUrl: preset.model3dUrl,
                        },
                      )}
                      onObjectRotate={rotateObject}
                      onObjectDuplicate={duplicateObject}
                      onObjectDelete={deleteObject}
                      onObjectEditStart={beginRoomEdit}
                      onObjectEditEnd={endRoomEdit}
                      paintTool={paintTool}
                      onPaintObject={applyObjectMaterialToId}
                      onPaintWall={applyWallMaterialToId}
                      onPaintFloor={applyFloorMaterialToSpace}
                      onCancelPaint={() => setPaintTool(null)}
                      savedTourPoints={savedTourPoints}
                      onSavedTourPointsChange={(points) => {
                        setSavedTourPoints(points);
                        void saveConcept(undefined, points);
                      }}
                      onSavedTourPointActivate={(point) => {
                        setActiveFloor(Math.max(0, Math.min(floors - 1, point.floor)));
                      }}
                      onRenderView={(lightingMode, renderView) => void generateConceptRender({ source: "model3d", renderView, lightingMode })}
                      onSelectWall={(wallId) => {
                        setSelectedWallId(wallId);
                        if (wallId) {
                          setSelectedObjectId(null);
                          setSelectedCustomWallId(null);
                          setSelectedClosedSpaceId(null);
                          setSelectedId(null);
                          setSelectedOpeningId(null);
                        }
                      }}
                      onSelectCustomWall={(wallId) => {
                        setSelectedCustomWallId(wallId);
                        if (wallId) {
                          setSelectedObjectId(null);
                          setSelectedWallId(null);
                          setSelectedClosedSpaceId(null);
                          setSelectedId(null);
                          setSelectedOpeningId(null);
                        }
                      }}
                      onSelectClosedSpace={(spaceId) => {
                        setSelectedClosedSpaceId(spaceId);
                        if (spaceId) {
                          setSelectedObjectId(null);
                          setSelectedWallId(null);
                          setSelectedCustomWallId(null);
                          setSelectedId(null);
                          setSelectedOpeningId(null);
                        }
                      }}
                      onSelectOpening={(openingId) => {
                        setSelectedOpeningId(openingId);
                        if (openingId) {
                          setSelectedObjectId(null);
                          setSelectedWallId(null);
                          setSelectedCustomWallId(null);
                          setSelectedClosedSpaceId(null);
                          setSelectedId(null);
                        }
                      }}
                    />
                  )}

                  {editorView === "facade" && (
                    <ConceptFacadeEditor
                      conceptProjectId={conceptId}
                      lotWidth={lotWidth}
                      lotDepth={lotDepth}
                      sitePlacement={sitePlacement}
                      levels={modelLevels}
                      rooms={safeRooms}
                      facade={facadePreferences}
                      design={facadeDesign}
                      onFacadeChange={handleFacadePreferencesChange}
                      onDesignChange={handleFacadeDesignChange}
                      realisticPreviewUrl={latestFacadeRenderUrl}
                      realisticPreviewLoading={conceptRender?.status === "processing"}
                      onOpenRender={() => void generateConceptRender({ source: "facade", renderView: "exterior" })}
                      onOpenGallery={() => setEditorView("render")}
                    />
                  )}

                  {editorView === "render" && (
                    <div className="min-h-[calc(100dvh-64px)] bg-slate-100 px-3 pb-24 pt-4 md:p-5">
                      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3 shadow-sm">
                          <div>
                            <div className="flex items-center gap-2 text-sm font-semibold">
                              <Sparkles className="h-4 w-4 text-orange-500" />
                              Renders do projeto
                            </div>
                            <div className="mt-0.5 text-xs text-muted-foreground">
                              Fachada e vistas 3D ficam salvas no mesmo projeto.
                            </div>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setEditorView("facade")}
                              disabled={conceptRender?.status === "processing"}
                              className="rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50"
                            >
                              Nova fachada
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditorView("model3d");
                              }}
                              className="rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-white"
                            >
                              Abrir 3D para nova vista
                            </button>
                          </div>
                        </div>

                        {(renderError || conceptRender?.error) && (
                          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 shadow-sm">
                            <div className="text-sm font-semibold text-red-800">{conceptRender?.status === "error" ? "O render não foi concluído" : "Acompanhamento do render"}</div>
                            <div className="mt-1 text-xs leading-5 text-red-700">
                              {renderError ?? conceptRender?.error}
                            </div>
                            <button
                              type="button"
                              disabled={conceptRender?.status === "processing"}
                              onClick={() => setEditorView(conceptRender?.source === "model3d" ? "model3d" : "facade")}
                              className="mt-3 rounded-xl bg-red-700 px-3 py-2 text-xs font-semibold text-white"
                            >
                              {conceptRender?.status === "processing" ? "Geração em andamento" : "Tentar novamente"}
                            </button>
                          </div>
                        )}

                        {displayedRender?.resultImageUrl ? (
                          <div className="overflow-hidden rounded-2xl border bg-white shadow-xl">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
                              <div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="text-sm font-semibold">
                                    {displayedRender.renderView === "interior" ? "Render interior / vista 3D" : "Render de fachada"}
                                  </div>
                                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                                    Imagem gerada
                                  </span>
                                </div>
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  {displayedRender.generatedAt
                                    ? new Date(displayedRender.generatedAt).toLocaleString("pt-BR")
                                    : "Render atual"}
                                  <span className="mx-1.5">•</span>
                                  preservação estrutural do projeto
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                {conceptRender?.status === "processing" && (
                                  <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">{renderQueued ? "Render na fila" : "Gerando render…"}</span>
                                )}
                                {displayedRender.resultImageUrl && conceptRender?.status !== "processing" && (
                                  <a
                                    href={displayedRender.resultImageUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-xl border bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:text-orange-700"
                                  >
                                    Abrir imagem
                                  </a>
                                )}
                              </div>
                            </div>
                            <img
                              src={displayedRender.resultImageUrl}
                              alt="Render conceitual"
                              className="max-h-[calc(100dvh-260px)] w-full object-contain"
                            />
                          </div>
                        ) : conceptRender?.status === "processing" ? (
                          <div className="grid min-h-[420px] place-items-center rounded-2xl border border-orange-200 bg-gradient-to-br from-white to-orange-50 text-center shadow-sm">
                            <div className="max-w-md px-6">
                              <div className="mx-auto h-12 w-12 animate-pulse rounded-2xl bg-orange-500/15 p-3 text-orange-600">
                                <Sparkles className="h-6 w-6" />
                              </div>
                              <div className="mt-4 text-lg font-semibold">{renderQueued ? "Render na fila" : "Gerando render arquitetônico"}</div>
                              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                                O Arqdor está usando a câmera atual do projeto, preservando paredes, aberturas, volumes e mobiliário para produzir a imagem final.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="grid min-h-[420px] place-items-center rounded-2xl border bg-white text-center shadow-sm">
                            <div>
                              <Sparkles className="mx-auto h-8 w-8 text-orange-500" />
                              <div className="mt-3 font-semibold">{renderHistoryLoading ? "Consultando renders salvos…" : renderError ? "Histórico temporariamente indisponível" : "Ainda não há render"}</div>
                              <p className="mt-1 text-sm text-muted-foreground">Gere uma fachada ou abra o 3D para renderizar a vista atual.</p>
                              <button
                                type="button"
                                onClick={() => setEditorView("facade")}
                                className="mt-4 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white"
                              >
                                Gerar fachada
                              </button>
                            </div>
                          </div>
                        )}

                        {selectedGalleryRender && (
                          <ConceptRenderGalleryActions
                            versions={galleryVersions}
                            selected={selectedGalleryRender}
                            primaryId={primaryRenderId}
                            processing={conceptRender?.status === "processing"}
                            onPrimary={(renderId) => {
                              setPrimaryRenderId(renderId);
                              setRenderHistoryRevision((value) => value + 1);
                            }}
                            onRegenerated={(renderId) => {
                              setRenderError(null);
                              setRenderQueued(true);
                              setConceptRender((previous) => ({ ...previous, renderId, status: "processing", error: undefined }));
                            }}
                          />
                        )}

                        {Array.isArray(conceptRender?.history) && conceptRender.history.length > 0 && (
                          <div className="rounded-2xl border bg-white p-4 shadow-sm">
                            <div className="mb-3 flex items-center justify-between">
                              <div>
                                <div className="text-sm font-semibold">Histórico de renders</div>
                                <div className="text-[11px] text-muted-foreground">Versões salvas deste pré-projeto.</div>
                              </div>
                              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">
                                {conceptRender.history.length}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                              {[...conceptRender.history].reverse().map((item) => (
                                <button
                                  key={item.renderId}
                                  type="button"
                                  onClick={() => setSelectedRenderVersionId(item.renderId)}
                                  className={selectedGalleryRender?.renderId === item.renderId
                                    ? "overflow-hidden rounded-xl border-2 border-orange-500 bg-orange-50 text-left"
                                    : "overflow-hidden rounded-xl border bg-white text-left hover:border-orange-300"}
                                >
                                  <img src={item.resultImageUrl} alt="" loading="lazy" decoding="async" className="aspect-video w-full object-cover" />
                                  <div className="p-2.5">
                                    <div className="text-xs font-semibold">
                                      V{item.versionNumber ?? galleryVersions.indexOf(item) + 1} · {item.source === "model3d" ? "3D" : "Fachada"}
                                      {item.renderId === primaryRenderId && <span className="ml-1 text-orange-700">· Principal</span>}
                                    </div>
                                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                                      {new Date(item.generatedAt).toLocaleString("pt-BR")}
                                      <span className="block">{item.lighting === "night" ? "Noite" : item.lighting === "sunset" ? "Entardecer" : item.lighting === "day" ? "Dia" : item.lighting ?? "Iluminação original"} · Concluído</span>
                                    </div>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 flex items-center justify-between rounded-2xl border bg-white/95 p-1.5 shadow-xl backdrop-blur md:hidden">
                {journeyStages.map((stage, index) => (
                  <button
                    key={stage.id}
                    type="button"
                    onClick={() => goToJourneyStage(index)}
                    className={journeyIndex === index
                      ? "flex min-h-11 flex-1 flex-col items-center justify-center rounded-xl bg-slate-950 px-1 py-1.5 text-[11px] font-bold text-white"
                      : "flex min-h-11 flex-1 flex-col items-center justify-center rounded-xl px-1 py-1.5 text-[11px] font-semibold text-slate-500"}
                  >
                    <span className={index < journeyIndex && journeyIndex !== index ? "text-emerald-600" : ""}>{index < journeyIndex ? "✓" : index + 1}</span>
                    {stage.label}
                  </button>
                ))}
              </div>

              {hasEditorSelection && (editorView === "plan" || editorView === "model3d") && (
              <aside className="arq-workspace-inspector arq-inspector fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[70] max-h-[64vh] overflow-y-auto rounded-3xl border bg-white/98 px-4 py-4 shadow-2xl backdrop-blur md:inset-y-3 md:left-auto md:right-3 md:bottom-auto md:w-[340px] md:max-h-[calc(100dvh-24px)] md:rounded-2xl md:border-slate-200 md:px-4 md:py-4 md:shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
                <button
                  type="button"
                  onClick={clearEditorSelection}
                  className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full border bg-white text-slate-500 shadow-sm hover:bg-slate-50"
                  aria-label="Fechar propriedades"
                >
                  <X className="h-4 w-4" />
                </button>
                {selectedObject ? (
                  <div className="flex flex-wrap items-end gap-2 pr-10 md:pr-0">
                    <div className="mr-2 min-w-[140px]">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Objeto</div>
                      <div className="mt-1 text-sm font-semibold">{selectedObject.label}</div>
                    </div>
                    {selectedObject.imageUrl && (
                      <div className="flex w-full items-center gap-3 rounded-xl border bg-slate-50 p-2.5 md:order-first md:w-full">
                        <img
                          src={selectedObject.imageUrl}
                          alt={selectedObject.label}
                          className="h-16 w-20 shrink-0 rounded-lg object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-orange-600">Produto real</div>
                          <div className="mt-0.5 truncate text-xs font-semibold text-slate-900">{selectedObject.label}</div>
                          <div className="mt-1 text-[10px] text-slate-500">
                            {[selectedObject.supplier, selectedObject.price
                              ? selectedObject.price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
                              : null].filter(Boolean).join(" · ")}
                          </div>
                        </div>
                      </div>
                    )}
                    {([
                      ["width", "Largura", selectedObject.width],
                      ["depth", "Prof.", selectedObject.depth],
                    ] as const).map(([key, label, value]) => (
                      <label key={key} className="text-[10px] font-semibold text-slate-500">
                        {label} (m)
                        <input
                          type="number"
                          min="0.3"
                          step="0.05"
                          value={value.toFixed(2)}
                          onChange={(event) => updateObjectById(selectedObject.id, { [key]: Number(event.target.value) || 0.3 })}
                          className="mt-1 h-9 w-[92px] rounded-lg border px-2 text-xs font-semibold"
                        />
                      </label>
                    ))}
                    <label className="text-[10px] font-semibold text-slate-500">
                      Rotação (°)
                      <input
                        type="number"
                        step="1"
                        min="-360"
                        max="360"
                        value={selectedObject.rotation}
                        onChange={(event) => {
                          const value = Number(event.target.value);
                          if (!Number.isFinite(value)) return;
                          updateObjectById(selectedObject.id, { rotation: ((value % 360) + 360) % 360 });
                        }}
                        className="mt-1 h-9 w-[100px] rounded-lg border bg-white px-2 text-xs font-semibold"
                      />
                    </label>
                    {editorView === "model3d" && (
                      <div className="flex items-end gap-1">
                        <button
                          type="button"
                          onClick={() => rotateObject(selectedObject.id)}
                          className="h-9 rounded-lg border px-3 text-xs font-semibold"
                        >
                          Girar 90°
                        </button>
                      </div>
                    )}
                    <label className="min-w-[150px] text-[10px] font-semibold text-slate-500">
                      Material
                      <select
                        value={selectedObject.materialId ?? ""}
                        onChange={(event) => updateObjectById(selectedObject.id, { materialId: event.target.value || undefined })}
                        className="mt-1 h-9 w-full rounded-lg border bg-white px-2 text-xs"
                      >
                        <option value="">Automático</option>
                        {objectMaterialOptions.map((material) => (
                          <option key={material.id} value={material.id}>{material.name}</option>
                        ))}
                      </select>
                    </label>
                    <div className="mt-2 flex w-full items-center gap-1.5 md:ml-auto md:mt-0 md:w-auto">
                      <button type="button" onClick={openMaterialsForSelection} className="h-9 rounded-lg border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-700">Materiais</button>
                      {editorView === "model3d" && (
                        <button
                          type="button"
                          onClick={() => setEditorView("plan")}
                          className="h-9 rounded-lg border px-3 text-xs font-semibold"
                        >
                          Editar no 2D
                        </button>
                      )}
                      <button type="button" onClick={() => rotateObject(selectedObject.id)} className="h-9 rounded-lg border px-3 text-xs font-semibold" title="Girar 90° (R)">Girar</button>
                      <button type="button" onClick={duplicateSelectedObject} className="h-9 rounded-lg border px-3 text-xs font-semibold" title="Duplicar (Ctrl/Cmd+D)">Duplicar</button>
                      <button type="button" onClick={deleteSelectedObject} className="h-9 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600" title="Excluir (Del)">Excluir</button>
                    </div>
                  </div>
                ) : selectedCustomWall ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="mr-2 min-w-[130px]">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Parede</div>
                      <div className="mt-1 text-sm font-semibold">Parede livre</div>
                    </div>
                    <label className="text-[10px] font-semibold text-slate-500">
                      Comprimento (m)
                      <input
                        key={`${selectedCustomWall.id}-${selectedCustomWall.x1}-${selectedCustomWall.y1}-${selectedCustomWall.x2}-${selectedCustomWall.y2}`}
                        type="number"
                        min="0.5"
                        step="0.01"
                        defaultValue={Math.hypot(selectedCustomWall.x2 - selectedCustomWall.x1, selectedCustomWall.y2 - selectedCustomWall.y1).toFixed(2)}
                        onBlur={(event) => setCustomWallLength(selectedCustomWall.id, Number(event.currentTarget.value))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                        className="mt-1 h-9 w-[105px] rounded-lg border px-2 text-xs font-semibold"
                      />
                    </label>
                    <label className="text-[10px] font-semibold text-slate-500">
                      Espessura
                      <select
                        value={selectedCustomWall.thickness ?? 0.15}
                        onChange={(event) => updateCustomWall(selectedCustomWall.id, { thickness: Number(event.target.value) }, true)}
                        className="mt-1 h-9 w-[100px] rounded-lg border bg-white px-2 text-xs"
                      >
                        <option value={0.10}>10 cm</option>
                        <option value={0.12}>12 cm</option>
                        <option value={0.15}>15 cm</option>
                        <option value={0.20}>20 cm</option>
                        <option value={0.25}>25 cm</option>
                      </select>
                    </label>
                    <div className="mt-2 flex w-full items-center gap-1.5 md:ml-auto md:mt-0 md:w-auto">
                      <button type="button" onClick={openMaterialsForSelection} className="h-9 rounded-lg border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-700">Materiais</button>
                      {editorView === "model3d" && (
                        <button type="button" onClick={() => setEditorView("plan")} className="h-9 rounded-lg border px-3 text-xs font-semibold">Editar no 2D</button>
                      )}
                      <button type="button" onClick={() => addOpeningToCustomWall(selectedCustomWall.id, "door")} className="h-9 rounded-lg border px-3 text-xs font-semibold hover:bg-slate-50">+ Porta</button>
                      <button type="button" onClick={() => addOpeningToCustomWall(selectedCustomWall.id, "window")} className="h-9 rounded-lg border px-3 text-xs font-semibold hover:bg-slate-50">+ Janela</button>
                      <button
                        type="button"
                        onClick={() => splitCustomWall(selectedCustomWall.id)}
                        disabled={Math.hypot(selectedCustomWall.x2 - selectedCustomWall.x1, selectedCustomWall.y2 - selectedCustomWall.y1) < 1}
                        className="h-9 rounded-lg border px-3 text-xs font-semibold hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                        title="Dividir a parede no ponto médio"
                      >
                        Dividir
                      </button>
                      <button type="button" onClick={() => duplicateCustomWall(selectedCustomWall.id)} className="h-9 rounded-lg border px-3 text-xs font-semibold hover:bg-slate-50" title="Duplicar parede (Ctrl/Cmd+D)">Duplicar</button>
                      <button type="button" onClick={() => deleteCustomWall(selectedCustomWall.id)} className="h-9 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50" title="Excluir parede (Del)">Excluir</button>
                    </div>
                  </div>
                ) : selectedOpening ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="mr-2 min-w-[120px]">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Abertura</div>
                      <button type="button" onClick={toggleOpeningType} className="mt-1 text-sm font-semibold hover:text-orange-600">
                        {selectedOpening.type === "door" ? "Porta" : "Janela"} ↔
                      </button>
                    </div>
                    {selectedCustomOpening && (
                      <>
                        <label className="text-[10px] font-semibold text-slate-500">
                          Largura (m)
                          <input
                            type="number"
                            min="0.5"
                            max="4"
                            step="0.05"
                            value={(selectedCustomOpening.width ?? (selectedOpening.type === "door" ? 0.9 : 1.2)).toFixed(2)}
                            onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { width: Number(event.target.value) })}
                            className="mt-1 h-9 w-[90px] rounded-lg border px-2 text-xs font-semibold"
                          />
                        </label>
                        <label className="text-[10px] font-semibold text-slate-500">
                          Altura (m)
                          <input
                            type="number"
                            min="0.5"
                            max="2.8"
                            step="0.05"
                            value={(selectedCustomOpening.height ?? (selectedOpening.type === "door" ? 2.1 : 1.2)).toFixed(2)}
                            onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { height: Number(event.target.value) })}
                            className="mt-1 h-9 w-[90px] rounded-lg border px-2 text-xs font-semibold"
                          />
                        </label>
                        {selectedOpening.type === "window" && (
                          <label className="text-[10px] font-semibold text-slate-500">
                            Peitoril (m)
                            <input
                              type="number"
                              min="0"
                              max="2.2"
                              step="0.05"
                              value={(selectedCustomOpening.sillHeight ?? 0.9).toFixed(2)}
                              onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { sillHeight: Number(event.target.value) })}
                              className="mt-1 h-9 w-[90px] rounded-lg border px-2 text-xs font-semibold"
                            />
                          </label>
                        )}
                        <label className="text-[10px] font-semibold text-slate-500">
                          Posição na parede (%)
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            value={Math.round((selectedCustomOpening.offset ?? 0.5) * 100)}
                            onChange={(event) => setCustomOpeningOffset(selectedOpening.id, Number(event.target.value))}
                            className="mt-1 h-9 w-[110px] rounded-lg border px-2 text-xs font-semibold"
                          />
                        </label>
                        <label className="text-[10px] font-semibold text-slate-500">
                          Abertura
                          <select
                            value={selectedCustomOpening.openingStyle ?? (selectedOpening.type === "door" ? "hinged" : "sliding")}
                            onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { openingStyle: event.target.value as CustomOpening["openingStyle"] })}
                            className="mt-1 h-9 w-[125px] rounded-lg border bg-white px-2 text-xs"
                          >
                            <option value="hinged">Giro</option>
                            <option value="sliding">Correr</option>
                            <option value="fixed">Fixa</option>
                            {selectedOpening.type === "window" && <option value="tilt_turn">Oscilobatente</option>}
                          </select>
                        </label>
                        <label className="text-[10px] font-semibold text-slate-500">
                          Folhas
                          <select
                            value={Math.max(1, Math.min(6, selectedCustomOpening.leafCount ?? (selectedOpening.type === "door" ? 1 : 2)))}
                            onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { leafCount: Number(event.target.value) })}
                            className="mt-1 h-9 w-[82px] rounded-lg border bg-white px-2 text-xs"
                          >
                            {[1, 2, 3, 4, 6].map((count) => <option key={count} value={count}>{count}</option>)}
                          </select>
                        </label>
                        <label className="min-w-[130px] text-[10px] font-semibold text-slate-500">
                          Perfil
                          <input
                            value={selectedCustomOpening.frameProfile ?? ""}
                            onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { frameProfile: event.target.value })}
                            placeholder="Ex.: PVC branco"
                            className="mt-1 h-9 w-full rounded-lg border px-2 text-xs font-semibold"
                          />
                        </label>
                        {selectedOpening.type === "window" && (
                          <label className="min-w-[120px] text-[10px] font-semibold text-slate-500">
                            Vidro
                            <select
                              value={selectedCustomOpening.glassType ?? "Incolor"}
                              onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { glassType: event.target.value })}
                              className="mt-1 h-9 w-full rounded-lg border bg-white px-2 text-xs"
                            >
                              <option value="Incolor">Incolor</option>
                              <option value="Fumê">Fumê</option>
                              <option value="Refletivo">Refletivo</option>
                              <option value="Laminado">Laminado</option>
                              <option value="Duplo">Duplo / insulado</option>
                            </select>
                          </label>
                        )}
                        <label className="min-w-[130px] text-[10px] font-semibold text-slate-500">
                          Fabricante
                          <input
                            value={selectedCustomOpening.manufacturer ?? ""}
                            onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { manufacturer: event.target.value })}
                            placeholder="Fabricante"
                            className="mt-1 h-9 w-full rounded-lg border px-2 text-xs font-semibold"
                          />
                        </label>
                      </>
                    )}
                    <div className="mt-2 flex w-full items-center gap-1.5 md:ml-auto md:mt-0 md:w-auto">
                      {editorView === "model3d" && (
                        <button type="button" onClick={() => setEditorView("plan")} className="h-9 rounded-lg border px-3 text-xs font-semibold">
                          Editar no 2D
                        </button>
                      )}
                      <button type="button" onClick={() => moveOpening(-0.25)} className="h-9 rounded-lg border px-3 text-xs font-semibold">− 25 cm</button>
                      <button type="button" onClick={() => moveOpening(0.25)} className="h-9 rounded-lg border px-3 text-xs font-semibold">+ 25 cm</button>
                      {selectedCustomOpening && (
                        <>
                          {selectedOpening.type === "door" && selectedCustomOpening.openingStyle === "hinged" && (
                            <>
                              <button type="button" onClick={() => toggleCustomOpeningSwing(selectedOpening.id)} className="h-9 rounded-lg border px-3 text-xs font-semibold">
                                Inverter mão · {selectedCustomOpening.swing === "right" ? "Direita" : "Esquerda"}
                              </button>
                              <button type="button" onClick={() => toggleCustomOpeningSide(selectedOpening.id)} className="h-9 rounded-lg border px-3 text-xs font-semibold">
                                Sentido · {selectedCustomOpening.swingSide === "outside" ? "Exterior" : "Interior"}
                              </button>
                            </>
                          )}
                          <button type="button" onClick={() => openOpeningProductPicker(selectedOpening.id)} className="h-9 rounded-lg border border-sky-200 bg-sky-50 px-3 text-xs font-semibold text-sky-700">
                            Substituir produto
                          </button>
                          <button type="button" onClick={() => duplicateCustomOpening(selectedOpening.id)} className="h-9 rounded-lg border px-3 text-xs font-semibold" title="Duplicar (Ctrl/Cmd+D)">Duplicar</button>
                          <button type="button" onClick={() => deleteCustomOpening(selectedOpening.id)} className="h-9 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600" title="Excluir (Del)">Excluir</button>
                        </>
                      )}
                    </div>
                  </div>
                ) : selectedClosedSpace ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="mr-2 min-w-[110px]">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Ambiente</div>
                      <div className="mt-1 text-sm font-semibold">{selectedClosedSpace.area.toFixed(1)} m²</div>
                    </div>
                    <label className="min-w-[220px] flex-1 text-[10px] font-semibold text-slate-500">
                      Nome
                      <input
                        value={selectedSpaceProfile?.label ?? ""}
                        onChange={(event) => updateSelectedSpaceProfile({ label: event.target.value })}
                        placeholder="Ex.: Sala de estar"
                        className="mt-1 h-9 w-full rounded-lg border px-3 text-xs font-semibold"
                      />
                    </label>
                    <label className="text-[10px] font-semibold text-slate-500">
                      Tipo
                      <select
                        value={selectedSpaceProfile?.kind ?? "outro"}
                        onChange={(event) => updateSelectedSpaceProfile({ kind: event.target.value })}
                        className="mt-1 h-9 w-[150px] rounded-lg border bg-white px-2 text-xs"
                      >
                        <option value="sala">Sala / estar</option>
                        <option value="cozinha">Cozinha</option>
                        <option value="suite">Suíte</option>
                        <option value="quarto">Quarto</option>
                        <option value="banheiro">Banheiro</option>
                        <option value="lavanderia">Lavanderia</option>
                        <option value="garagem">Garagem</option>
                        <option value="gourmet">Gourmet</option>
                        <option value="circulacao">Circulação</option>
                        <option value="escada">Escada</option>
                        <option value="outro">Outro</option>
                      </select>
                    </label>
                    <button type="button" onClick={openMaterialsForSelection} className="h-9 rounded-lg border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-700">Piso / materiais</button>
                    <button
                      type="button"
                      onClick={() => addOpeningToSelectedSpace("door")}
                      className="h-9 rounded-lg border px-3 text-xs font-semibold"
                    >
                      + Porta
                    </button>
                    <button
                      type="button"
                      onClick={() => addOpeningToSelectedSpace("window")}
                      className="h-9 rounded-lg border px-3 text-xs font-semibold"
                    >
                      + Janela
                    </button>
                    <button
                      type="button"
                      onClick={furnishSelectedSpace}
                      className="h-9 rounded-lg border border-slate-800 bg-slate-900 px-3 text-xs font-semibold text-white"
                    >
                      {furnishLayoutOptions.length && furnishLayoutSpaceId === selectedClosedSpace.id ? "Recalcular layouts" : "Mobiliar"}
                    </button>
                    {furnishLayoutSpaceId === selectedClosedSpace.id && furnishLayoutOptions.map((option, index) => {
                      const activePreview = previewFurnishLayoutId === option.id;
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => setPreviewFurnishLayoutId(option.id)}
                          onMouseEnter={() => setPreviewFurnishLayoutId(option.id)}
                          className={activePreview
                            ? "h-9 rounded-lg border border-orange-400 bg-orange-50 px-3 text-xs font-semibold text-orange-700"
                            : "h-9 rounded-lg border px-3 text-xs font-semibold"}
                          title={`Pré-visualizar · pontuação ${option.score.toFixed(0)}`}
                        >
                          Layout {index + 1} · {option.score.toFixed(0)}
                        </button>
                      );
                    })}
                    {furnishLayoutSpaceId === selectedClosedSpace.id && previewFurnishLayoutId && (
                      <button
                        type="button"
                        onClick={() => applyFurnishLayoutOption(previewFurnishLayoutId)}
                        className="h-9 rounded-lg bg-orange-500 px-3 text-xs font-semibold text-white"
                      >
                        Confirmar layout
                      </button>
                    )}
                    {furnishLayoutSpaceId === selectedClosedSpace.id && furnishLayoutOptions.length > 0 && (
                      <button
                        type="button"
                        onClick={cancelFurnishLayoutOptions}
                        className="h-9 rounded-lg border px-3 text-xs font-semibold text-slate-500"
                      >
                        Cancelar
                      </button>
                    )}
                    {editorView === "model3d" && (
                      <button type="button" onClick={() => setEditorView("plan")} className="h-9 rounded-lg border px-3 text-xs font-semibold">Editar no 2D</button>
                    )}
                  </div>
                ) : selectedWall ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="mr-2 min-w-[170px]">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Parede</div>
                      <div className="mt-1 text-sm font-semibold">
                        {selectedWall.exterior ? "Externa" : "Interna"} · {Math.hypot(selectedWall.x2 - selectedWall.x1, selectedWall.y2 - selectedWall.y1).toFixed(2)} m
                      </div>
                    </div>
                    <button type="button" onClick={openMaterialsForSelection} className="h-9 rounded-lg border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-700">Materiais</button>
                    {editorView === "model3d" && (
                      <button type="button" onClick={() => setEditorView("plan")} className="h-9 rounded-lg border px-3 text-xs font-semibold">Editar no 2D</button>
                    )}
                    <button type="button" onClick={() => nudgeSelectedWall(-0.25)} className="h-9 rounded-lg border px-3 text-xs font-semibold">− 25 cm</button>
                    <button type="button" onClick={() => nudgeSelectedWall(0.25)} className="h-9 rounded-lg border px-3 text-xs font-semibold">+ 25 cm</button>
                    <button type="button" onClick={() => setSelectedWallId(null)} className="ml-auto h-9 rounded-lg border px-3 text-xs font-semibold text-slate-500">Fechar</button>
                  </div>
                ) : selected ? (
                  <div className="flex flex-wrap items-end gap-2">
                    <div className="mr-2 min-w-[145px]">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Ambiente</div>
                      <div className="mt-1 text-sm font-semibold">{selected.label} · {(selected.width * selected.depth).toFixed(1)} m²</div>
                    </div>
                    {([
                      ["width", "Largura", selected.width],
                      ["depth", "Prof.", selected.depth],
                      ["x", "X", selected.x],
                      ["y", "Y", selected.y],
                    ] as const).map(([key, label, value]) => (
                      <label key={key} className="text-[10px] font-semibold text-slate-500">
                        {label} (m)
                        <input
                          type="number"
                          step={key === "x" || key === "y" ? 0.25 : 0.1}
                          value={value}
                          onChange={(event) => updateSelected({
                            [key]: key === "x" || key === "y"
                              ? Math.max(0, Number(event.target.value) || 0)
                              : Math.max(1, Number(event.target.value) || 1),
                          })}
                          className="mt-1 h-9 w-[86px] rounded-lg border px-2 text-xs font-semibold"
                        />
                      </label>
                    ))}
                    <div className="mt-2 flex w-full items-center gap-1.5 md:ml-auto md:mt-0 md:w-auto">
                      <button type="button" onClick={openMaterialsForSelection} className="h-9 rounded-lg border border-orange-200 bg-orange-50 px-3 text-xs font-semibold text-orange-700">Piso / materiais</button>
                      <button type="button" onClick={() => updateSelected({ locked: !selected.locked })} className="h-9 rounded-lg border px-3 text-xs font-semibold">
                        {selected.locked ? "Desbloquear" : "Bloquear"}
                      </button>
                      <button type="button" onClick={duplicateSelectedRoom} disabled={SINGLETON_ROOM_KINDS.has(selected.kind)} className="h-9 rounded-lg border px-3 text-xs font-semibold disabled:opacity-40">Duplicar</button>
                      <button type="button" onClick={deleteSelectedRoom} className="h-9 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600">Excluir</button>
                    </div>
                  </div>
                ) : null}
              </aside>
              )}
          </section>
        )}

        {step === 5 && (
          <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
            <aside className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-orange-500" />
                <div>
                  <h2 className="text-lg font-semibold">6. Fachada</h2>
                  <p className="text-xs text-muted-foreground">Agora a fachada é tratada como composição frontal, não como caixas 3D pintadas.</p>
                </div>
              </div>

              <div className="mt-5 space-y-5">
                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Estilo</div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["contemporaneo", "Contemporâneo"],
                      ["minimalista", "Minimalista"],
                      ["classico_contemporaneo", "Clássico atual"],
                      ["tropical", "Tropical"],
                      ["industrial", "Industrial"],
                      ["rustico_contemporaneo", "Rústico atual"],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFacadePreferences((prev) => ({ ...prev, style: value }))}
                        className={facadePreferences.style === value ? "rounded-xl border border-orange-500 bg-orange-500/5 p-3 text-left text-xs font-semibold" : "rounded-xl border p-3 text-left text-xs font-semibold"}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cobertura</div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ["platibanda", "Platibanda"],
                      ["aparente", "Telhado"],
                      ["misto", "Misto"],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFacadePreferences((prev) => ({ ...prev, roof: value }))}
                        className={facadePreferences.roof === value ? "rounded-xl border border-orange-500 bg-orange-500/5 px-3 py-2 text-xs font-semibold" : "rounded-xl border px-3 py-2 text-xs font-semibold"}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <label className="block text-xs font-semibold">
                  Material principal
                  <select
                    value={facadePreferences.primaryMaterial}
                    onChange={(event) => setFacadePreferences((prev) => ({ ...prev, primaryMaterial: event.target.value as ConceptFacadePreferences["primaryMaterial"] }))}
                    className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm"
                  >
                    <option value="pintura">Pintura / reboco</option>
                    <option value="madeira">Madeira</option>
                    <option value="pedra">Pedra</option>
                    <option value="concreto">Concreto aparente</option>
                  </select>
                </label>

                <label className="block text-xs font-semibold">
                  Material de destaque
                  <select
                    value={facadePreferences.accentMaterial}
                    onChange={(event) => setFacadePreferences((prev) => ({ ...prev, accentMaterial: event.target.value as ConceptFacadePreferences["accentMaterial"] }))}
                    className="mt-2 h-10 w-full rounded-xl border bg-background px-3 text-sm"
                  >
                    <option value="nenhum">Sem destaque</option>
                    <option value="madeira">Madeira</option>
                    <option value="pedra">Pedra</option>
                    <option value="concreto">Concreto</option>
                  </select>
                </label>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tom da fachada</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(["claro", "medio", "escuro"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFacadePreferences((prev) => ({ ...prev, facadeTone: value }))}
                        className={facadePreferences.facadeTone === value ? "rounded-xl border border-orange-500 bg-orange-500/5 px-3 py-2 text-xs font-semibold capitalize" : "rounded-xl border px-3 py-2 text-xs font-semibold capitalize"}
                      >
                        {value === "medio" ? "Médio" : value}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Esquadrias</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(["preto", "branco", "bronze"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFacadePreferences((prev) => ({ ...prev, frameTone: value }))}
                        className={facadePreferences.frameTone === value ? "rounded-xl border border-orange-500 bg-orange-500/5 px-3 py-2 text-xs font-semibold capitalize" : "rounded-xl border px-3 py-2 text-xs font-semibold capitalize"}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Paisagismo</div>
                  <div className="grid grid-cols-3 gap-2">
                    {(["leve", "medio", "intenso"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setFacadePreferences((prev) => ({ ...prev, landscaping: value }))}
                        className={facadePreferences.landscaping === value ? "rounded-xl border border-orange-500 bg-orange-500/5 px-3 py-2 text-xs font-semibold capitalize" : "rounded-xl border px-3 py-2 text-xs font-semibold capitalize"}
                      >
                        {value === "medio" ? "Médio" : value}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </aside>

            <div className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">Elevação frontal conceitual</h3>
                  <p className="text-sm text-muted-foreground">Garagem, entrada, pavimentos, cobertura e aberturas são compostos como fachada frontal.</p>
                </div>
                <div className="rounded-full bg-orange-500/10 px-3 py-1 text-xs font-semibold capitalize text-orange-700">
                  {String(facadePreferences.style ?? "").replaceAll("_", " ")}
                </div>
              </div>

              <div data-concept-render-source="true" className="mt-4 overflow-hidden rounded-2xl border bg-slate-50">
                <ConceptDerivedFacade viewMode="material" lotWidth={lotWidth} levels={modelLevels} rooms={safeRooms} sitePlacement={normalizeSitePlacement(sitePlacement)} facade={facadePreferences} design={facadeDesign} />
              </div>

              <div className="mt-4 rounded-2xl border bg-muted/30 p-4">
                <div className="font-semibold">Critério da fachada</div>
                <div className="mt-2 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                  <span>• garagem e acesso reconhecíveis</span>
                  <span>• composição por pavimentos</span>
                  <span>• cobertura coerente com estilo</span>
                  <span>• esquadrias proporcionais</span>
                  <span>• até 2 materiais dominantes</span>
                  <span>• paisagismo sem esconder arquitetura</span>
                </div>
              </div>

              <div className="mt-5 rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">Render conceitual</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Usa esta elevação frontal + planta + preferências como referência estruturada.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void generateConceptRender({ source: "facade", renderView: "exterior" })}
                    disabled={conceptRender?.status === "processing"}
                    className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    <Sparkles className="h-4 w-4" />
                    {conceptRender?.status === "processing"
                      ? "Gerando render..."
                      : conceptRender?.resultImageUrl
                        ? "Gerar nova versão"
                        : "Gerar render conceitual"}
                  </button>
                </div>

                {renderError && (
                  <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{renderError}</div>
                )}

                {conceptRender?.status === "processing" && (
                  <div className="mt-4 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
                    Render em processamento com preservação da tipologia e da composição frontal.
                  </div>
                )}

                {presentationRender?.resultImageUrl && (
                  <div className="mt-4 overflow-hidden rounded-2xl border bg-muted">
                    <img
                      src={presentationRender.resultImageUrl}
                      alt="Render conceitual do pré-projeto"
                      className="max-h-[640px] w-full object-contain"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-background p-3 text-xs text-muted-foreground">
                      <span>Render vinculado a este pré-projeto</span>
                      {presentationRender.generatedAt && <span>{new Date(presentationRender.generatedAt).toLocaleString("pt-BR")}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {step === 6 && (
          <section className="mx-auto max-w-6xl space-y-5 px-3 pt-4 print:max-w-none sm:px-6">
            <button
              type="button"
              onClick={() => { setStep(WORKSPACE_STEP); setEditorView("render"); }}
              className="inline-flex items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm font-semibold shadow-sm print:hidden"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar ao editor
            </button>
            {handoffState !== "sent" && (
              <button
                type="button"
                onClick={() => document.getElementById(startContactValid ? "enviar-profissional" : "dados-cliente")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-30 inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-orange-500 px-4 text-sm font-semibold text-white shadow-xl md:hidden print:hidden"
              >
                <Send className="h-4 w-4" /> {startContactValid ? "Enviar ao profissional" : "Informar contato e enviar"}
              </button>
            )}
            <div className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
                    <FileText className="h-4 w-4" />
                    Resultado do pré-projeto
                  </div>
                  <h2 className="mt-2 text-2xl font-bold">Sua ideia organizada para seguir com o profissional</h2>
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                    Este material reúne programa de necessidades, dimensões, implantação, fachada, cobertura e render.
                    Quando aprovado, ele é congelado como Projeto Mestre e passa a ser a fonte de partida do fluxo profissional e de Obras.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 print:hidden">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold"
                  >
                    <Printer className="h-4 w-4" /> Imprimir / PDF
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportConceptDxf()}
                    disabled={dxfExportState === "exporting"}
                    className="inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                  >
                    <Download className="h-4 w-4" />
                    {dxfExportState === "exporting" ? "Gerando DXF..." : dxfExportState === "error" ? "Tentar DXF novamente" : "Exportar DXF"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportConceptIfc()}
                    disabled={ifcExportState === "exporting"}
                    className="inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                    title="Exportação IFC4 conceitual com pavimentos e paredes do modelo Arqdor"
                  >
                    <Box className="h-4 w-4" />
                    {ifcExportState === "exporting" ? "Gerando IFC..." : ifcExportState === "error" ? "Tentar IFC novamente" : "Exportar IFC (BIM)"}
                  </button>
                  <input
                    ref={dxfImportInputRef}
                    type="file"
                    accept=".dxf,application/dxf"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void importConceptDxf(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => dxfImportInputRef.current?.click()}
                    disabled={dxfImportState === "importing" || Boolean(projectMaster)}
                    className="inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                    title={projectMaster ? "Crie uma revisão antes de importar nova geometria." : "Importar DXF ASCII como paredes editáveis"}
                  >
                    <FolderOpen className="h-4 w-4" />
                    {dxfImportState === "importing" ? "Lendo DXF..." : "Importar DXF"}
                  </button>
                  <input
                    ref={referencePlanInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf,.pdf"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadReferencePlan(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => referencePlanInputRef.current?.click()}
                    disabled={referencePlanState === "uploading" || Boolean(projectMaster)}
                    className="inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                    title={projectMaster ? "Crie uma revisão antes de trocar a planta de referência." : "Anexar imagem ou PDF como planta de referência"}
                  >
                    <Camera className="h-4 w-4" />
                    {referencePlanState === "uploading" ? "Enviando referência..." : referencePlan ? "Trocar referência" : "Imagem / PDF"}
                  </button>
                  <input
                    ref={sourceFileInputRef}
                    type="file"
                    accept=".ifc,.dwg,.rvt,.skp,.glb,.gltf"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void uploadProjectSourceFile(file);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => sourceFileInputRef.current?.click()}
                    disabled={sourceFileState === "uploading" || Boolean(projectMaster)}
                    className="inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
                    title={projectMaster ? "Crie uma revisão antes de anexar nova fonte de projeto." : "Importar IFC, DWG, RVT, SketchUp, GLB ou GLTF"}
                  >
                    <Box className="h-4 w-4" />
                    {sourceFileState === "uploading" ? "Enviando modelo..." : "Importar modelo"}
                  </button>
                  {archProjetoId && (
                    <button
                      type="button"
                      onClick={() => { window.location.href = `/arch/projetos/${archProjetoId}`; }}
                      className="inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-2.5 text-sm font-semibold"
                    >
                      Abrir projeto <ExternalLink className="h-4 w-4" />
                    </button>
                  )}
                </div>
                {dxfImportMessage && (
                  <div className={dxfImportState === "error"
                    ? "mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                    : "mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"}
                  >
                    {dxfImportMessage}
                  </div>
                )}
                {referencePlanMessage && (
                  <div className={referencePlanState === "error"
                    ? "mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                    : "mt-3 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800"}
                  >
                    {referencePlanMessage}
                  </div>
                )}
                {referencePlan?.kind === "image" && (
                  <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50/60 p-3 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold text-blue-950">Importação da planta</div>
                        <div className="mt-0.5 text-blue-800/80">
                          {referenceImportStage === "uploading"
                            ? "Enviando a referência..."
                            : referenceImportStage === "analyzing"
                              ? "Analisando paredes, portas, janelas e topologia..."
                              : referenceImportStage === "review"
                                ? "Leitura concluída. Revise a sobreposição antes de substituir geometria existente."
                                : referenceImportStage === "editable"
                                  ? "Planta editável criada. A imagem original continua disponível como referência."
                                  : referenceImportStage === "error"
                                    ? "A leitura precisa de revisão antes de continuar."
                                    : "A imagem será convertida em geometria editável, não apenas inserida no canvas."}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {[
                            ["uploading", "1. Enviar"],
                            ["analyzing", "2. Analisar"],
                            ["review", "3. Revisar"],
                            ["editable", "4. Editável"],
                          ].map(([stage, label]) => {
                            const order = { uploading: 0, analyzing: 1, review: 2, editable: 3 } as const;
                            const current = referenceImportStage in order ? order[referenceImportStage as keyof typeof order] : -1;
                            const target = order[stage as keyof typeof order];
                            return (
                              <span key={stage} className={current >= target
                                ? "rounded-full bg-blue-700 px-2 py-1 text-[10px] font-bold text-white"
                                : "rounded-full border border-blue-200 bg-white px-2 py-1 text-[10px] font-semibold text-blue-500"}>
                                {label}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void traceReferencePlanWithAi()}
                          disabled={referenceTraceState === "loading"}
                          className="rounded-lg border border-blue-300 bg-white px-3 py-1.5 font-semibold text-blue-800 disabled:opacity-50"
                        >
                          {referenceTraceState === "loading" ? "Analisando..." : referenceTraceState === "applied" ? "Analisar novamente" : "Tentar leitura novamente"}
                        </button>
                        {referenceTracePreview?.canApply && (
                          <button
                            type="button"
                            onClick={() => void applyReferenceTrace()}
                            disabled={Boolean(projectMaster)}
                            className="rounded-lg bg-emerald-600 px-3 py-1.5 font-semibold text-white disabled:opacity-50"
                          >
                            Usar como planta editável
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="mt-2 inline-flex rounded-lg border border-blue-200 bg-white p-1" role="group" aria-label="Modo de conferência da planta importada">
                      {([
                        ["reference", "Referência"],
                        ["vector", "Vetorizado"],
                        ["overlay", "Sobreposição"],
                      ] as const).map(([mode, label]) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setReferenceDisplayMode(mode)}
                          className={`rounded-md px-2.5 py-1 text-[10px] font-semibold transition-colors ${referenceDisplayMode === mode ? "bg-blue-700 text-white" : "text-blue-800 hover:bg-blue-50"}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="mt-1 text-[10px] text-blue-800/75">
                      Referência mostra somente a imagem importada; Vetorizado mostra somente o traçado; Sobreposição serve para conferir coincidência antes de aplicar.
                    </div>
                    {referenceTracePreview && (
                      <div className="mt-2 space-y-1 text-[11px] text-blue-900">
                        <div>
                          {referenceTracePreview.walls.length} paredes · {referenceTracePreview.openings.length} aberturas · confiança {Math.round(referenceTracePreview.confidence * 100)}%
                          {typeof referenceTracePreview.alignmentScore === "number"
                            ? ` · alinhamento ${Math.round(referenceTracePreview.alignmentScore * 100)}%`
                            : ""}
                          {referenceTracePreview.topologyRepairs
                            ? ` · ${referenceTracePreview.topologyRepairs} junções corrigidas`
                            : ""}
                        </div>
                        {referenceTracePreview.alignmentCorrection && (
                          <div className="text-[10px] text-blue-800/75">
                            Registro automático: escala ×{referenceTracePreview.alignmentCorrection.scale.toFixed(2)} · ΔX {(referenceTracePreview.alignmentCorrection.translateX * 100).toFixed(1)}% · ΔY {(referenceTracePreview.alignmentCorrection.translateY * 100).toFixed(1)}%.
                          </div>
                        )}
                        {(() => {
                          const lowConfidenceWalls = referenceTracePreview.walls.filter((wall) => (wall.confidence ?? 0.5) < 0.65).length;
                          const lowConfidenceOpenings = referenceTracePreview.openings.filter((opening) => (opening.confidence ?? 0.5) < 0.65).length;
                          const reviewCount = lowConfidenceWalls + lowConfidenceOpenings;
                          return reviewCount > 0 ? (
                            <div className="rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-orange-800">
                              Revisar em laranja: {lowConfidenceWalls} parede(s) e {lowConfidenceOpenings} abertura(s) com confiança abaixo de 65%.
                            </div>
                          ) : (
                            <div className="text-emerald-700">Prévia sem elementos abaixo de 65% de confiança.</div>
                          );
                        })()}
                        <div className="text-[10px] text-blue-800/75">
                          Azul = parede sugerida · verde/roxo = porta/janela · laranja = elemento que merece revisão antes de aplicar.
                        </div>
                        <div className="mt-2 rounded-lg border border-blue-200 bg-white/80 p-2">
                          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <div className="font-semibold text-blue-950">Revisar traçado antes de aplicar</div>
                              <div className="text-[10px] text-blue-800/75">Edite coordenadas, espessuras e aberturas. Excluir uma parede também remove suas portas e janelas sugeridas.</div>
                            </div>
                            {selectedTraceElement ? (
                              <button
                                type="button"
                                onClick={() => setSelectedTraceElement(null)}
                                className="rounded-md border px-2 py-1 text-[10px] font-semibold"
                              >
                                Fechar edição
                              </button>
                            ) : null}
                          </div>

                          <div className="grid gap-2 lg:grid-cols-2">
                            <details className="rounded-md border bg-background p-2" open>
                              <summary className="cursor-pointer font-semibold text-slate-800">Paredes ({referenceTracePreview.walls.length})</summary>
                              <div className="mt-2 max-h-56 space-y-2 overflow-auto pr-1">
                                {referenceTracePreview.walls.map((wall, index) => {
                                  const selected = selectedTraceElement?.kind === "wall" && selectedTraceElement.id === wall.id;
                                  return (
                                    <div key={wall.id} className={`rounded-md border p-2 ${selected ? "border-orange-300 bg-orange-50" : "bg-white"}`}>
                                      <div className="flex items-center justify-between gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setSelectedTraceElement({ kind: "wall", id: wall.id })}
                                          className="text-left font-semibold"
                                        >
                                          Parede {index + 1} · {Math.round((wall.confidence ?? 0.5) * 100)}%
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => removeReferenceTraceWall(wall.id)}
                                          className="rounded border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-700"
                                        >
                                          Excluir
                                        </button>
                                      </div>
                                      {selected ? (
                                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                                          {([
                                            ["x1", wall.x1],
                                            ["y1", wall.y1],
                                            ["x2", wall.x2],
                                            ["y2", wall.y2],
                                            ["thickness", wall.thickness ?? 0.12],
                                          ] as const).map(([key, value]) => (
                                            <label key={key} className="text-[9px] font-semibold text-muted-foreground">
                                              {key === "thickness" ? "Espessura" : key.toUpperCase()}
                                              <input
                                                type="number"
                                                step="0.05"
                                                min={key === "thickness" ? 0.05 : 0}
                                                max={key === "x1" || key === "x2" ? lotWidth : key === "y1" || key === "y2" ? lotDepth : 1}
                                                value={Number(value).toFixed(2)}
                                                onChange={(event) => {
                                                  const next = Number(event.currentTarget.value);
                                                  if (Number.isFinite(next)) updateReferenceTraceWall(wall.id, { [key]: next });
                                                }}
                                                className="mt-1 h-7 w-full rounded border bg-background px-1.5 text-[10px]"
                                              />
                                            </label>
                                          ))}
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </details>

                            <details className="rounded-md border bg-background p-2" open>
                              <summary className="cursor-pointer font-semibold text-slate-800">Portas e janelas ({referenceTracePreview.openings.length})</summary>
                              <div className="mt-2 max-h-56 space-y-2 overflow-auto pr-1">
                                {referenceTracePreview.openings.map((opening, index) => {
                                  const selected = selectedTraceElement?.kind === "opening" && selectedTraceElement.id === opening.id;
                                  return (
                                    <div key={opening.id} className={`rounded-md border p-2 ${selected ? "border-orange-300 bg-orange-50" : "bg-white"}`}>
                                      <div className="flex items-center justify-between gap-2">
                                        <button
                                          type="button"
                                          onClick={() => setSelectedTraceElement({ kind: "opening", id: opening.id })}
                                          className="text-left font-semibold"
                                        >
                                          {opening.type === "door" ? "Porta" : "Janela"} {index + 1} · {Math.round((opening.confidence ?? 0.5) * 100)}%
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => removeReferenceTraceOpening(opening.id)}
                                          className="rounded border border-red-200 px-2 py-1 text-[10px] font-semibold text-red-700"
                                        >
                                          Excluir
                                        </button>
                                      </div>
                                      {selected ? (
                                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-5">
                                          <label className="text-[9px] font-semibold text-muted-foreground">
                                            Tipo
                                            <select
                                              value={opening.type}
                                              onChange={(event) => updateReferenceTraceOpening(opening.id, { type: event.currentTarget.value as "door" | "window" })}
                                              className="mt-1 h-7 w-full rounded border bg-background px-1 text-[10px]"
                                            >
                                              <option value="door">Porta</option>
                                              <option value="window">Janela</option>
                                            </select>
                                          </label>
                                          <label className="text-[9px] font-semibold text-muted-foreground">
                                            Posição %
                                            <input
                                              type="number"
                                              min="0"
                                              max="100"
                                              step="1"
                                              value={Math.round(opening.offset * 100)}
                                              onChange={(event) => {
                                                const next = Number(event.currentTarget.value);
                                                if (Number.isFinite(next)) updateReferenceTraceOpening(opening.id, { offset: Math.max(0, Math.min(1, next / 100)) });
                                              }}
                                              className="mt-1 h-7 w-full rounded border bg-background px-1.5 text-[10px]"
                                            />
                                          </label>
                                          {([
                                            ["width", opening.width ?? 0.9, "Largura"],
                                            ["height", opening.height ?? (opening.type === "door" ? 2.1 : 1.2), "Altura"],
                                            ["sillHeight", opening.sillHeight ?? (opening.type === "window" ? 1 : 0), "Peitoril"],
                                          ] as const).map(([key, value, label]) => (
                                            <label key={key} className="text-[9px] font-semibold text-muted-foreground">
                                              {label}
                                              <input
                                                type="number"
                                                min="0"
                                                step="0.05"
                                                value={Number(value).toFixed(2)}
                                                onChange={(event) => {
                                                  const next = Number(event.currentTarget.value);
                                                  if (Number.isFinite(next)) updateReferenceTraceOpening(opening.id, { [key]: next });
                                                }}
                                                className="mt-1 h-7 w-full rounded border bg-background px-1.5 text-[10px]"
                                              />
                                            </label>
                                          ))}
                                        </div>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            </details>
                          </div>
                        </div>
                        {referenceTracePreview.warnings?.length ? (
                          <div className="text-amber-800">{referenceTracePreview.warnings.join(" ")}</div>
                        ) : null}
                      </div>
                    )}
                  </div>
                )}

                {referencePlan && (
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/30 px-3 py-2 text-xs">
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{referencePlan.originalName}</div>
                      <div className="text-muted-foreground">{referencePlan.kind === "image" ? "Imagem de referência no editor 2D" : "PDF de referência vinculado"}</div>
                      {referencePlan.kind === "image" && referencePlan.widthMeters && referencePlan.depthMeters ? (
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          Referência calibrada: {referencePlan.widthMeters.toFixed(2)} × {referencePlan.depthMeters.toFixed(2)} m · proporção preservada
                        </div>
                      ) : null}
                      {referencePlan.kind === "image" && !projectMaster ? (
                        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" onClick={(event) => event.stopPropagation()}>
                          <label className="text-[10px] font-semibold text-muted-foreground">
                            Largura ref. (m)
                            <input
                              type="number"
                              min="0.5"
                              max={lotWidth}
                              step="0.05"
                              defaultValue={(referencePlan.widthMeters ?? lotWidth).toFixed(2)}
                              onBlur={(event) => void saveReferenceCalibration({ widthMeters: Number(event.currentTarget.value) })}
                              className="mt-1 h-8 w-full rounded-lg border bg-background px-2 text-xs text-foreground"
                            />
                          </label>
                          <label className="text-[10px] font-semibold text-muted-foreground">
                            Posição X (m)
                            <input
                              type="number"
                              min="0"
                              step="0.05"
                              defaultValue={(referencePlan.offsetX ?? 0).toFixed(2)}
                              onBlur={(event) => void saveReferenceCalibration({ offsetX: Number(event.currentTarget.value) })}
                              className="mt-1 h-8 w-full rounded-lg border bg-background px-2 text-xs text-foreground"
                            />
                          </label>
                          <label className="text-[10px] font-semibold text-muted-foreground">
                            Posição Y (m)
                            <input
                              type="number"
                              min="0"
                              step="0.05"
                              defaultValue={(referencePlan.offsetY ?? 0).toFixed(2)}
                              onBlur={(event) => void saveReferenceCalibration({ offsetY: Number(event.currentTarget.value) })}
                              className="mt-1 h-8 w-full rounded-lg border bg-background px-2 text-xs text-foreground"
                            />
                          </label>
                          <label className="text-[10px] font-semibold text-muted-foreground">
                            Opacidade
                            <input
                              type="number"
                              min="0.08"
                              max="0.8"
                              step="0.05"
                              defaultValue={(referencePlan.opacity ?? 0.35).toFixed(2)}
                              onBlur={(event) => void saveReferenceCalibration({ opacity: Number(event.currentTarget.value) })}
                              className="mt-1 h-8 w-full rounded-lg border bg-background px-2 text-xs text-foreground"
                            />
                          </label>
                        </div>
                      ) : null}
                    </div>
                    <a href={referencePlan.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-orange-600 hover:underline">
                      Abrir arquivo
                    </a>
                  </div>
                )}
                {sourceFileMessage && (
                  <div className={sourceFileState === "error"
                    ? "mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
                    : "mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-800"}
                  >
                    {sourceFileMessage}
                  </div>
                )}
                {sourceFiles.length > 0 && (
                  <div className="mt-3 space-y-2 rounded-xl border bg-muted/20 p-3 text-xs">
                    <div className="font-semibold">Modelos e arquivos de projeto</div>
                    {sourceFiles.slice().reverse().map((source) => (
                      <div key={source.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{source.originalName}</div>
                          <div className="text-muted-foreground">
                            {source.extension.toUpperCase()} · {source.parserStatus === "ready_model3d"
                              ? "modelo 3D pronto"
                              : source.parserStatus === "parsed_metadata"
                                ? "IFC lido"
                                : source.parserStatus === "pending_ifc_parser"
                                  ? "aguardando parser BIM"
                                  : "aguardando conversão"}
                          </div>
                          {source.ifcMetadata && (
                            <div className="mt-1 text-[11px] text-slate-600">
                              {source.ifcMetadata.storeys.length} pav. · {source.ifcMetadata.counts.walls} paredes · {source.ifcMetadata.counts.doors} portas · {source.ifcMetadata.counts.windows} janelas · {source.ifcMetadata.counts.spaces} espaços
                            </div>
                          )}
                          {source.ifcMetadata?.storeys.length ? (
                            <div className="mt-1 text-[10px] text-muted-foreground">
                              {source.ifcMetadata.storeys.map((storey) => storey.name || `Pavimento #${storey.id}`).join(" · ")}
                            </div>
                          ) : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {source.extension.toLowerCase() === "skp" && source.parserStatus !== "ready_model3d" && (
                            <button
                              type="button"
                              onClick={() => void convertSketchupSourceFile(source)}
                              disabled={convertingSketchupId === source.id || Boolean(projectMaster)}
                              className="rounded-lg border px-2.5 py-1.5 font-semibold text-sky-700 disabled:opacity-50"
                              title={projectMaster ? "Crie uma revisão antes de converter nova fonte." : "Converter o arquivo SKP para GLB e preservar os metadados do SketchUp"}
                            >
                              {convertingSketchupId === source.id ? "Convertendo SketchUp..." : "Converter SketchUp"}
                            </button>
                          )}
                          {source.parserStatus === "ready_model3d" && source.model3d?.url && (
                            <a
                              href={source.model3d.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg border px-2.5 py-1.5 font-semibold text-emerald-700 hover:bg-emerald-50"
                            >
                              Abrir modelo 3D
                            </a>
                          )}
                          {source.extension.toLowerCase() === "ifc" && source.parserStatus !== "parsed_metadata" && (
                            <button
                              type="button"
                              onClick={() => void parseIfcSourceFile(source)}
                              disabled={parsingIfcId === source.id}
                              className="rounded-lg border px-2.5 py-1.5 font-semibold text-violet-700 disabled:opacity-50"
                            >
                              {parsingIfcId === source.id ? "Lendo IFC..." : "Ler IFC"}
                            </button>
                          )}
                          {source.extension.toLowerCase() === "ifc" && (
                            <button
                              type="button"
                              onClick={() => void convertIfcSourceFile(source)}
                              disabled={convertingIfcId === source.id || Boolean(projectMaster)}
                              className="rounded-lg border px-2.5 py-1.5 font-semibold text-emerald-700 disabled:opacity-50"
                              title={projectMaster ? "Crie uma revisão antes de substituir a geometria." : "Extrair paredes IFC compatíveis e tornar editáveis no Arqdor"}
                            >
                              {convertingIfcId === source.id ? "Convertendo..." : "Converter IFC"}
                            </button>
                          )}
                          <a href={source.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-orange-600 hover:underline">
                            Abrir
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
              <div className="space-y-5">
                {presentationRender?.resultImageUrl ? (
                  <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
                    <img
                      src={presentationRender.resultImageUrl}
                      alt="Render conceitual final"
                      className="max-h-[680px] w-full object-contain bg-muted/30"
                    />
                    <div className="border-t p-4">
                      <div className="font-semibold">Render conceitual</div>
                      <div className="mt-1 text-xs text-muted-foreground">Visualização baseada na planta, elevação frontal e preferências selecionadas.</div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed bg-card p-8 text-center">
                    <Sparkles className="mx-auto h-8 w-8 text-orange-500" />
                    <div className="mt-3 font-semibold">Render ainda não gerado</div>
                    <p className="mt-1 text-sm text-muted-foreground">A imagem realista da fachada valoriza muito o pré-projeto para o cliente.</p>
                    <button
                      type="button"
                      onClick={() => { goToJourneyStage(3); setEditorView("render"); window.scrollTo({ top: 0 }); }}
                      className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white print:hidden"
                    >
                      <Sparkles className="h-4 w-4" /> Gerar imagem realista
                    </button>
                  </div>
                )}

                <div className="rounded-3xl border bg-card p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">Fachada conceitual</h3>
                      <p className="text-xs text-muted-foreground">Elevação frontal derivada da geometria do modelo, dos pavimentos e das preferências aprovadas.</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Conceitual</span>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-2xl border bg-slate-50">
                    <ConceptDerivedFacade viewMode="material" lotWidth={lotWidth} levels={modelLevels} rooms={safeRooms} sitePlacement={normalizeSitePlacement(sitePlacement)} facade={facadePreferences} design={facadeDesign} />
                  </div>
                </div>
              </div>

              <div className="space-y-5">
                <div className="rounded-3xl border bg-card p-5 shadow-sm">
                  <h3 className="font-semibold">Resumo</h3>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {[
                      ["Terreno", `${lotWidth} × ${lotDepth} m`],
                      ["Pavimentos", String(floors)],
                      ["Área desejada", `${desiredArea} m²`],
                      ["Área dos ambientes", `${currentArea.toFixed(0)} m²`],
                      ["Ambientes", String(safeRooms.length)],
                      ["Layout", ["Opção A", "Opção B", "Opção C"][layoutVariant] ?? "Personalizado"],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-2xl bg-muted/50 p-3">
                        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
                        <div className="mt-1 text-sm font-semibold">{value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border bg-card p-5 shadow-sm">
                  <h3 className="font-semibold">Programa de necessidades</h3>
                  <div className="mt-4 max-h-[360px] space-y-2 overflow-auto pr-1">
                    {safeRooms.map((room) => (
                      <div key={room.id} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5">
                        <div>
                          <div className="text-sm font-semibold">{room.label}</div>
                          <div className="text-xs text-muted-foreground">
                            {room.floor === 0 ? "Térreo" : room.floor === 1 ? "Superior" : `Pavimento ${room.floor + 1}`}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">{room.width.toFixed(1)} × {room.depth.toFixed(1)} m</div>
                          <div className="text-xs text-muted-foreground">{(room.width * room.depth).toFixed(1)} m²</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border bg-card p-5 shadow-sm">
                  <h3 className="font-semibold">Preferências de fachada</h3>
                  <div className="mt-4 space-y-2 text-sm">
                    {[
                      ["Estilo", facadePreferences.style],
                      ["Cobertura", facadePreferences.roof],
                      ["Material principal", facadePreferences.primaryMaterial],
                      ["Material de destaque", facadePreferences.accentMaterial],
                      ["Tom", facadePreferences.facadeTone],
                      ["Esquadrias", facadePreferences.frameTone],
                      ["Paisagismo", facadePreferences.landscaping],
                    ].map(([label, raw]) => [label, readableFacadeValue(raw)]).map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-4 border-b py-2 last:border-b-0">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div id="dados-cliente" className="scroll-mt-4 rounded-3xl border bg-card p-5 shadow-sm print:hidden">
                  <h3 className="font-semibold">Dados do cliente</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Essas informações qualificam o contato e entram no CRM quando o pré-projeto for enviado.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold">
                      Nome
                      <input
                        value={customerProfile.name ?? ""}
                        onInput={(event) => { const value = event.currentTarget.value; setCustomerProfile((prev) => ({ ...prev, name: value })); }}
                        onChange={(event) => setCustomerProfile((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Nome do cliente"
                        className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      WhatsApp / telefone
                      <input
                        value={customerProfile.phone ?? ""}
                        onInput={(event) => { const value = event.currentTarget.value; setCustomerProfile((prev) => ({ ...prev, phone: value })); }}
                        onChange={(event) => setCustomerProfile((prev) => ({ ...prev, phone: event.target.value }))}
                        placeholder="(49) 99999-9999"
                        className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      E-mail
                      <input
                        type="email"
                        value={customerProfile.email ?? ""}
                        onInput={(event) => { const value = event.currentTarget.value; setCustomerProfile((prev) => ({ ...prev, email: value })); }}
                        onChange={(event) => setCustomerProfile((prev) => ({ ...prev, email: event.target.value }))}
                        placeholder="cliente@email.com"
                        className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      Instagram
                      <input
                        value={customerProfile.instagram ?? ""}
                        onChange={(event) => setCustomerProfile((prev) => ({ ...prev, instagram: event.target.value }))}
                        placeholder="@cliente"
                        autoCapitalize="none"
                        className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      Faixa de investimento
                      <select
                        value={customerProfile.budgetRange ?? ""}
                        onInput={(event) => { const value = event.currentTarget.value; setCustomerProfile((prev) => ({ ...prev, budgetRange: value })); }}
                        onChange={(event) => setCustomerProfile((prev) => ({ ...prev, budgetRange: event.target.value }))}
                        className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm"
                      >
                        <option value="">Ainda não definido</option>
                        <option value="até R$ 500 mil">Até R$ 500 mil</option>
                        <option value="R$ 500 mil a R$ 1 milhão">R$ 500 mil a R$ 1 milhão</option>
                        <option value="R$ 1 milhão a R$ 2 milhões">R$ 1 milhão a R$ 2 milhões</option>
                        <option value="acima de R$ 2 milhões">Acima de R$ 2 milhões</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold">
                      Quando pretende começar?
                      <select
                        value={customerProfile.timeframe ?? ""}
                        onInput={(event) => { const value = event.currentTarget.value; setCustomerProfile((prev) => ({ ...prev, timeframe: value })); }}
                        onChange={(event) => setCustomerProfile((prev) => ({ ...prev, timeframe: event.target.value }))}
                        className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm"
                      >
                        <option value="">Ainda não definido</option>
                        <option value="até 3 meses">Até 3 meses</option>
                        <option value="3 a 6 meses">3 a 6 meses</option>
                        <option value="6 a 12 meses">6 a 12 meses</option>
                        <option value="mais de 12 meses">Mais de 12 meses</option>
                      </select>
                    </label>
                    <label className="text-xs font-semibold sm:col-span-2">
                      Observações
                      <textarea
                        value={customerProfile.notes ?? ""}
                        onInput={(event) => { const value = event.currentTarget.value; setCustomerProfile((prev) => ({ ...prev, notes: value })); }}
                        onChange={(event) => setCustomerProfile((prev) => ({ ...prev, notes: event.target.value }))}
                        placeholder="Preferências, prioridades, limitações ou qualquer detalhe importante."
                        rows={3}
                        className="mt-1 w-full rounded-xl border bg-background px-3 py-2 text-sm outline-none"
                      />
                    </label>
                  </div>
                  <div className="mt-3 rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                    Ao enviar, o sistema procura um lead já existente antes de criar outro. Se não encontrar, cria o lead canônico no CRM e um negócio em aquecimento.
                  </div>
                </div>

                <div id="enviar-profissional" className="scroll-mt-4 rounded-3xl border border-orange-200 bg-orange-50 p-5 shadow-sm print:hidden">
                  <div className="flex items-start gap-3">
                    <Send className="mt-0.5 h-5 w-5 text-orange-600" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-orange-950">Enviar para o profissional</h3>
                      <p className="mt-1 text-sm text-orange-900/80">
                        Cria um Projeto Arqdor canônico com este briefing, sem duplicar CRM, orçamento ou obra.
                      </p>

                      {handoffError && (
                        <div className="mt-3 rounded-xl bg-red-100 px-3 py-2 text-xs text-red-700">{handoffError}</div>
                      )}
                      {handoffState !== "sent" &&
                        (!customerProfile.name?.trim() || !(customerProfile.phone?.trim() || customerProfile.email?.trim())) && (
                          <div className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-xs text-orange-900">
                            Informe o nome e pelo menos um contato (WhatsApp/telefone ou e-mail) para habilitar o envio ao profissional.
                          </div>
                        )}

                      {handoffState === "sent" && archProjetoId ? (
                        <div className="mt-4 space-y-3">
                          <div className="rounded-xl bg-emerald-100 px-3 py-2 text-sm font-semibold text-emerald-800">
                            Projeto Mestre aprovado e congelado.
                          </div>
                          {projectMaster && (
                            <div className="rounded-xl border border-emerald-200 bg-white/70 px-3 py-2 text-xs text-emerald-950">
                              Versão {projectMaster.version} · Obra, orçamento e projeto profissional vinculados ao mesmo snapshot.
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={() => { window.location.href = `/arch/projetos/${archProjetoId}`; }}
                            className="inline-flex items-center gap-2 rounded-xl bg-foreground px-4 py-3 text-sm font-semibold text-background"
                          >
                            Abrir projeto profissional <ExternalLink className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void promoteToProject()}
                          disabled={
                          handoffState === "sending" ||
                          blockingLayoutIssues.length > 0 ||
                          architecturalAcceptance.status === "blocked" ||
                          !customerProfile.name?.trim() ||
                          !(customerProfile.phone?.trim() || customerProfile.email?.trim())
                        }
                          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          <Send className="h-4 w-4" />
                          {handoffState === "sending" ? "Aprovando..." : "Aprovar Projeto Mestre"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
              Este resultado é um estudo conceitual para briefing, visualização e tomada de decisão. Dimensões, implantação,
              estrutura, instalações, recuos, acessibilidade e demais requisitos técnicos ou legais devem ser verificados pelo profissional responsável.
            </div>
          </section>
        )}

        {step !== 4 && (
          <div className="mx-auto mt-6 flex max-w-4xl items-center justify-between gap-3">
            <button
              type="button"
              disabled={step === 0}
              onClick={() => setStep(previousConceptStep(step))}
              className="inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-3 text-sm font-semibold disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar
            </button>
            {step < 6 ? (
              <button
                type="button"
                onClick={() => {
                  const nextStep = nextConceptStep(step);
                  if (nextStep === 4) {
                    setRooms((prev) =>
                      generateTypologyLayout(
                        normalizeDraftRooms(prev),
                        lotWidth,
                        lotDepth,
                        activeFloor,
                        typology,
                        layoutVariant,
                        layoutPreferences,
                      ),
                    );
                  }
                  setStep(nextStep);
                  void saveConcept(nextStep);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white"
              >
                {conceptStepCta(step)} <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void saveConcept()}
                className="inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background"
              >
                <Sparkles className="h-4 w-4" /> Salvar resultado
              </button>
            )}
          </div>
        )}
      </main>

      {publicLinkOpen && !guestMode && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/60 sm:items-center sm:p-6" onClick={() => setPublicLinkOpen(false)}>
          <div className="w-full max-w-lg rounded-t-3xl bg-background p-5 shadow-2xl sm:rounded-3xl" onClick={(event) => event.stopPropagation()} role="dialog" aria-label="Link para clientes">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold">Link para clientes</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Coloque no seu site. O cliente se cadastra (nome, WhatsApp, e-mail, Instagram e endereço), vira lead no CRM e projeta a casa dele aqui. Os projetos chegam na sua lista de pré-projetos.
                </p>
              </div>
              <button type="button" onClick={() => setPublicLinkOpen(false)} className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border" aria-label="Fechar"><X className="h-4 w-4" /></button>
            </div>
            {publicLinkState === "loading" && !publicLink && <p className="mt-4 text-sm text-muted-foreground">Carregando…</p>}
            {publicLinkState === "error" && <p className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">Não foi possível carregar ou salvar. Tente de novo.</p>}
            {publicLink && (
              <div className="mt-4 space-y-3">
                <label className="flex items-center justify-between gap-3 rounded-2xl border p-3">
                  <span className="text-sm font-semibold">{publicLink.enabled ? "Link ativo" : "Link desativado"}</span>
                  <input
                    type="checkbox"
                    className="h-5 w-5 accent-orange-500"
                    checked={publicLink.enabled}
                    disabled={!publicLink.canManage || publicLinkState === "saving"}
                    onChange={(event) => void togglePublicLink(event.target.checked)}
                  />
                </label>
                {!publicLink.canManage && <p className="text-xs text-muted-foreground">Somente o administrador pode ativar ou desativar.</p>}
                <div className="rounded-2xl border p-3">
                  <div className="text-xs font-semibold text-muted-foreground">Endereço</div>
                  <div className="mt-1 break-all text-sm font-medium">{publicLinkUrl}</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button type="button" onClick={() => void copyPublicLink("link")} className="min-h-9 rounded-xl bg-slate-950 px-3 text-xs font-semibold text-white">
                      {publicLinkCopied === "link" ? "Copiado!" : "Copiar link"}
                    </button>
                    {publicLink.enabled && <a href={publicLinkUrl} target="_blank" rel="noopener" className="inline-flex min-h-9 items-center rounded-xl border px-3 text-xs font-semibold">Abrir</a>}
                  </div>
                </div>
                <div className="rounded-2xl border p-3">
                  <div className="text-xs font-semibold text-muted-foreground">Botão para colar no site</div>
                  <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-muted p-2 text-[11px]">{publicLinkEmbed}</pre>
                  <button type="button" onClick={() => void copyPublicLink("code")} className="mt-2 min-h-9 rounded-xl border px-3 text-xs font-semibold">
                    {publicLinkCopied === "code" ? "Copiado!" : "Copiar código do botão"}
                  </button>
                </div>
                <div className="rounded-2xl border p-3">
                  <label className="flex items-start justify-between gap-3">
                    <span>
                      <span className="block text-sm font-semibold">Mostrar botão no site da empresa</span>
                      <span className="block text-xs text-muted-foreground">Opcional. Aparece no canto do site feito pelo Vendor.ai. Desligado, o site fica como está.</span>
                    </span>
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 shrink-0 accent-orange-500"
                      checked={Boolean(publicLink.showOnSite)}
                      disabled={!publicLink.canManage || !publicLink.enabled || publicLinkState === "saving"}
                      onChange={(event) => void savePublicLink({ showOnSite: event.target.checked })}
                    />
                  </label>
                  {!publicLink.enabled && <p className="mt-2 text-xs text-muted-foreground">Ative o link para poder mostrar o botão no site.</p>}
                  {publicLink.enabled && publicLink.showOnSite && (
                    <div className="mt-3 grid grid-cols-[1fr_auto] items-end gap-2">
                      <label className="text-xs font-semibold">
                        Texto do botão
                        <input
                          defaultValue={publicLink.siteButtonLabel ?? "Projete sua casa"}
                          maxLength={40}
                          disabled={!publicLink.canManage}
                          onBlur={(event) => {
                            const value = event.currentTarget.value.trim() || "Projete sua casa";
                            if (value !== publicLink.siteButtonLabel) void savePublicLink({ siteButtonLabel: value });
                          }}
                          className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm font-normal outline-none"
                        />
                      </label>
                      <label className="text-xs font-semibold">
                        Cor
                        <input
                          type="color"
                          value={publicLink.siteButtonColor ?? "#f97316"}
                          disabled={!publicLink.canManage}
                          onChange={(event) => void savePublicLink({ siteButtonColor: event.target.value })}
                          className="mt-1 block h-10 w-14 cursor-pointer rounded-xl border bg-background p-1"
                        />
                      </label>
                      <div className="col-span-2 pt-1">
                        <span
                          className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow"
                          style={{ background: publicLink.siteButtonColor ?? "#f97316" }}
                        >
                          🏠 {publicLink.siteButtonLabel ?? "Projete sua casa"}
                        </span>
                        <span className="ml-2 text-xs text-muted-foreground">prévia</span>
                      </div>
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Cada cliente pode gerar até 5 imagens realistas por dia.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {projectListOpen && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-slate-950/60 p-0 sm:items-center sm:p-6" onClick={() => setProjectListOpen(false)}>
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-background shadow-2xl sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-label="Meus pré-projetos"
          >
            <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
              <div>
                <h2 className="text-lg font-bold">Meus pré-projetos</h2>
                <p className="text-xs text-muted-foreground">Um pré-projeto por cliente. Toque para abrir.</p>
              </div>
              <button type="button" onClick={() => setProjectListOpen(false)} className="grid h-9 w-9 place-items-center rounded-xl border" aria-label="Fechar">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b px-5 py-3">
              <button
                type="button"
                onClick={() => void goToConcept({ isNew: true })}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white"
              >
                <Plus className="h-4 w-4" /> Novo pré-projeto
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {projectListError && (
                <div className="mx-2 mb-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">{projectListError}</div>
              )}
              {projectListState === "loading" && projectList.length === 0 && (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground">Carregando…</div>
              )}
              {projectListState === "error" && (
                <div className="px-2 py-8 text-center text-sm text-red-600">
                  Não foi possível carregar a lista.{" "}
                  <button type="button" className="font-semibold underline" onClick={() => void loadProjectList()}>Tentar de novo</button>
                </div>
              )}
              {projectListState === "idle" && projectList.length === 0 && (
                <div className="px-2 py-8 text-center text-sm text-muted-foreground">Nenhum pré-projeto salvo ainda.</div>
              )}
              <ul className="space-y-2">
                {projectList.map((item) => {
                  const isCurrent = item.id === (conceptIdRef.current ?? conceptId);
                  const label = item.customerName ?? (item.title && item.title !== "Meu pré-projeto" ? item.title : "Sem cliente definido");
                  return (
                    <li key={item.id} className={isCurrent ? "flex items-center gap-3 rounded-2xl border border-orange-300 bg-orange-50/60 p-2" : "flex items-center gap-3 rounded-2xl border p-2"}>
                      <button
                        type="button"
                        onClick={() => { if (isCurrent) setProjectListOpen(false); else void goToConcept({ id: item.id }); }}
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                      >
                        <div className="h-14 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                          {item.thumbnailUrl
                            ? <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                            : <div className="grid h-full w-full place-items-center text-muted-foreground"><Home className="h-5 w-5" /></div>}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{label}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            {item.updatedAt && <span>{new Date(item.updatedAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}</span>}
                            {isCurrent && <span className="rounded-full bg-orange-100 px-2 py-0.5 font-semibold text-orange-700">Aberto</span>}
                            {item.sentToProfessional && <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">Enviado</span>}
                          </div>
                        </div>
                      </button>
                      {!item.sentToProfessional && confirmDeleteId === item.id && (
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void deleteConceptFromList(item)}
                            disabled={deletingProjectId === item.id}
                            className="min-h-9 rounded-xl bg-red-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {deletingProjectId === item.id ? "Excluindo…" : "Excluir"}
                          </button>
                          <button type="button" onClick={() => setConfirmDeleteId(null)} className="min-h-9 rounded-xl border px-3 text-xs font-semibold">
                            Cancelar
                          </button>
                        </div>
                      )}
                      {!item.sentToProfessional && confirmDeleteId !== item.id && (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          disabled={deletingProjectId === item.id}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border text-muted-foreground hover:text-red-600 disabled:opacity-50"
                          aria-label="Excluir pré-projeto"
                          title="Excluir"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


