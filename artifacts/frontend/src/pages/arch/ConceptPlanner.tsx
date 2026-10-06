[Reading 1000 lines from start (total: 11034 lines, 10034 remaining)]

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
  poolDepthM?: number;
  stairRiserCount?: number;
  stairTreadDepthM?: number;
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
    projectRevision?: string | null;
    sceneId?: string | null;
    sceneName?: string | null;
    cameraSnapshot?: {
      floor?: number;
      position: { x: number; y: number; z: number };
      target: { x: number; y: number; z: number };
    } | null;
    history?: Array<{
      renderId: string;
      canRegenerate?: boolean;
      lighting?: string | null;
      versionNumber?: number;
      resultImageUrl: string;
      generatedAt: string;
      source: "facade" | "model3d";
      renderView: "exterior" | "interior";
      projectRevision?: string | null;
      sceneId?: string | null;
      sceneName?: string | null;
      cameraSnapshot?: {
        floor?: number;
        position: { x: number; y: number; z: number };
        target: { x: number; y: number; z: number };
      } | null;
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
      poolDepthM: raw.kind === "piscina" && Number.isFinite(Number(raw.poolDepthM)) ? finiteNumber(raw.poolDepthM, 1.4, 0.2, 5) : undefined,
      stairRiserCount: raw.kind === "escada" && Number.isFinite(Number(raw.stairRiserCount)) ? Math.round(finiteNumber(raw.stairRiserCount, 17, 2, 40)) : undefined,
      stairTreadDepthM: raw.kind === "escada" && Number.isFinite(Number(raw.stairTreadDepthM)) ? finiteNumber(raw.stairTreadDepthM, 0.28, 0.18, 0.5) : undefined,
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
