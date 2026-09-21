import { useEffect, useMemo, useRef, useState } from "react";
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
  Printer,
  Send,
  Search,
  LayoutGrid,
  Camera,
  Ruler,
  Share2,
  ChevronDown,
  X,
} from "lucide-react";
import { buildConceptGeometry, nudgeOpening, validateConceptLayout } from "./conceptGeometry";
import { type ConceptFacadePreferences } from "./ConceptVolumetry";
import ConceptPlan2D, { type ConceptPlanObject } from "./ConceptPlan2D";
import ConceptTypologyPreview from "./ConceptTypologyPreview";
import ConceptDerivedFacade from "./ConceptDerivedFacade";
import ConceptFacadeEditor from "./ConceptFacadeEditor";
import ConceptModel3D, { type ConceptModelLevel } from "./ConceptModel3D";
import {
  DEFAULT_FACADE_DESIGN,
  normalizeFacadeDesign,
  type FacadeDesignState,
} from "./conceptFacadeDesign";
import { buildTypologyRooms, CONCEPT_TYPOLOGIES, DEFAULT_LAYOUT_PREFERENCES, type ConceptTypology, type LayoutPreferences, type LayoutPreferenceKey } from "./conceptTemplates";
import { generateTypologyLayout } from "./conceptTypologyLayout";
import { buildConceptRenderBrief, svgElementToPngDataUrl } from "./conceptRender";
import { buildOrthogonalWallTopology, detectClosedSpaces, type ClosedSpace, type WallTopologyEndpointRef } from "./conceptWallNetwork";
import { conceptStepCta, nextConceptStep, normalizeConceptStep, previousConceptStep } from "./conceptNavigation";
import { blockingConceptIssues, buildCompletedRenderPatch, canAdvanceConceptLayout } from "./conceptWorkflow";

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
};

type CustomerProfile = {
  name?: string;
  phone?: string;
  email?: string;
  budgetRange?: string;
  timeframe?: string;
  notes?: string;
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
  category: "Sala" | "Quarto" | "Jantar" | "Cozinha" | "Escritório" | "Decoração" | "Iluminação";
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
  { kind: "table", label: "Mesa escritório", width: 1.20, depth: 0.60, category: "Escritório" },
  { kind: "chair", label: "Cadeira escritório", width: 0.60, depth: 0.60, category: "Escritório" },
  { kind: "plant", label: "Planta em vaso", width: 0.65, depth: 0.65, category: "Decoração" },
  { kind: "plant", label: "Planta grande", width: 0.90, depth: 0.90, category: "Decoração" },
  { kind: "rug", label: "Tapete sala", width: 2.00, depth: 1.50, category: "Decoração" },
  { kind: "rug", label: "Tapete quarto", width: 1.40, depth: 0.90, category: "Decoração" },
  { kind: "lamp", label: "Luminária de piso", width: 0.45, depth: 0.45, category: "Iluminação" },
  { kind: "lamp", label: "Abajur", width: 0.35, depth: 0.35, category: "Iluminação" },
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
  const validKinds = new Set<ConceptPlanObject["kind"]>(["sofa", "bed", "table", "chair", "cabinet", "tv", "plant", "lamp", "rug"]);
  return input.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const raw = candidate as Partial<ConceptPlanObject>;
    const kind = validKinds.has(raw.kind as ConceptPlanObject["kind"]) ? raw.kind as ConceptPlanObject["kind"] : "sofa";
    const width = finiteNumber(
      raw.width,
      kind === "sofa" ? 2.2 : kind === "bed" ? 1.6 : kind === "plant" ? 0.65 : kind === "lamp" ? 0.45 : kind === "rug" ? 2.0 : 1.2,
      0.3,
      6,
    );
    const depth = finiteNumber(
      raw.depth,
      kind === "sofa" ? 0.9 : kind === "bed" ? 2.0 : kind === "plant" ? 0.65 : kind === "lamp" ? 0.45 : kind === "rug" ? 1.5 : 0.8,
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

const WORKSPACE_STEP = 4;

export default function ConceptPlanner() {
  const [step, setStep] = useState(WORKSPACE_STEP);
  const [lotWidth, setLotWidth] = useState(12);
  const [lotDepth, setLotDepth] = useState(30);
  const [typology, setTypology] = useState<ConceptTypology>("terrea_3q");
  const [layoutPreferences, setLayoutPreferences] = useState<LayoutPreferences>(DEFAULT_LAYOUT_PREFERENCES);
  const [floors, setFloors] = useState(1);
  const [desiredArea, setDesiredArea] = useState(145);
  const [activeFloor, setActiveFloor] = useState(0);
  const [editorView, setEditorView] = useState<"plan" | "model3d" | "facade" | "render">("plan");

  useEffect(() => {
    if (step !== WORKSPACE_STEP) {
      setStep(WORKSPACE_STEP);
      setEditorView("plan");
    }
  }, [step]);

  const [interactionMode, setInteractionMode] = useState<"room" | "space" | "wall" | "opening" | "draw-wall" | "navigate">("draw-wall");
  const [rooms, setRooms] = useState<Room[]>([]);
  const roomsRef = useRef<Room[]>(rooms);
  const customWallsRef = useRef<CustomWall[]>([]);
  const customOpeningsRef = useRef<CustomOpening[]>([]);
  const wallFirstFloorsRef = useRef<number[]>([]);
  const openingOverridesRef = useRef<Record<string, OpeningOverride>>({});
  const objectsRef = useRef<ConceptPlanObject[]>([]);
  const wallMaterialsRef = useRef<Record<string, string>>({});
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
  const [wallMaterials, setWallMaterials] = useState<Record<string, string>>({});
  const [paintTool, setPaintTool] = useState<null | {
    target: "object" | "wall" | "floor";
    materialId: string;
    name: string;
    swatch: string;
  }>(null);
  const [openingOverrides, setOpeningOverrides] = useState<Record<string, OpeningOverride>>({});
  const [conceptId, setConceptId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "loading" | "saving" | "saved" | "error">("loading");
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile>({});
  const [facadePreferences, setFacadePreferences] = useState<ConceptFacadePreferences>(DEFAULT_FACADE);
  const [facadeDesign, setFacadeDesign] = useState<FacadeDesignState>(DEFAULT_FACADE_DESIGN);
  const [conceptRender, setConceptRender] = useState<ConceptDraftResponse["conceptRender"]>({ status: "idle" });
  const [renderError, setRenderError] = useState<string | null>(null);
  const [archProjetoId, setArchProjetoId] = useState<string | null>(null);
  const [handoffState, setHandoffState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const wallFirstActive = (Array.isArray(wallFirstFloors) ? wallFirstFloors : []).includes(activeFloor);
  const [modelSearch, setModelSearch] = useState("");
  const [modelCategory, setModelCategory] = useState<"todos" | "terreas" | "sobrados" | "lazer">("todos");
  const [furnitureSearch, setFurnitureSearch] = useState("");
  const [furnitureCategory, setFurnitureCategory] = useState<"Todos" | "Sala" | "Quarto" | "Jantar" | "Cozinha" | "Escritório" | "Decoração" | "Iluminação">("Todos");
  const [editorLibraryTab, setEditorLibraryTab] = useState<"site" | "models" | "build" | "rooms" | "furniture" | "materials" | "outdoor">("build");
  const [libraryOpen, setLibraryOpen] = useState(() => typeof window === "undefined" ? true : window.innerWidth >= 768);
  const [mobileValidationOpen, setMobileValidationOpen] = useState(false);
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

  const filteredFurniture = useMemo(() => {
    const query = furnitureSearch.trim().toLocaleLowerCase("pt-BR");
    return CONCEPT_FURNITURE_LIBRARY.filter((item) => {
      const categoryMatch = furnitureCategory === "Todos" || item.category === furnitureCategory;
      const queryMatch = !query || `${item.label} ${item.category}`.toLocaleLowerCase("pt-BR").includes(query);
      return categoryMatch && queryMatch;
    });
  }, [furnitureSearch, furnitureCategory]);

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
    let cancelled = false;

    const loadLatest = async () => {
      try {
        const response = await fetch("/api/arch/concept-projects/latest");
        if (!response.ok) throw new Error("Falha ao carregar pré-projeto");
        const draft = (await response.json()) as ConceptDraftResponse | null;
        if (cancelled || !draft) {
          if (!cancelled) setSaveState("idle");
          return;
        }

        setConceptId(draft.id);
        setArchProjetoId(draft.archProjetoId ?? null);
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
        setRooms(loadedRooms);
        setOpeningOverrides(draft.openingOverrides && typeof draft.openingOverrides === "object" ? draft.openingOverrides : {});
        setCustomerProfile(draft.customerProfile ?? {});
        setFacadePreferences(draft.facadePreferences ?? DEFAULT_FACADE);
        setFacadeDesign(normalizeFacadeDesign(draft.facadeDesign));
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

  const saveConcept = async (stepOverride?: number) => {
    setSaveState("saving");
    const payload = {
      title: "Meu pré-projeto",
      currentStep: stepOverride ?? step,
      lot: { width: lotWidth, depth: lotDepth },
      configuration: { floors, desiredArea, typology, layoutPreferences, wallFirstFloors, showDimensions, customWalls, customOpenings, spaceProfiles, objects, wallMaterials },
      rooms,
      openingOverrides,
      customerProfile,
      facadePreferences,
      facadeDesign,
      conceptRender,
      selectedVariant: layoutVariant,
    };

    try {
      const response = await fetch(
        conceptId ? `/api/arch/concept-projects/${conceptId}` : "/api/arch/concept-projects",
        {
          method: conceptId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) throw new Error("Falha ao salvar pré-projeto");
      const saved = (await response.json()) as ConceptDraftResponse;
      setConceptId(saved.id);
      setSaveState("saved");
      return saved.id;
    } catch {
      setSaveState("error");
      return null;
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

  const selected = safeRooms.find((r) => r.id === selectedId) ?? null;
  const selectedObject = safeObjects.find((object) => object.id === selectedObjectId) ?? null;
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

    let nextRooms = buildTypologyRooms(nextTypology) as Room[];
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
    setRooms((prev) => (Array.isArray(prev) ? prev : []).map((room) => (room.id === roomId ? { ...room, ...patch } : room)));
  };

  const updateOpeningById = (openingId: string, patch: OpeningOverride) => {
    const custom = safeCustomOpenings.find((opening) => opening.id === openingId);
    if (custom) {
      const wall = safeCustomWalls.find((item) => item.id === custom.wallId);
      if (!wall) return;
      const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
      const start = horizontal ? wall.x1 : wall.y1;
      const end = horizontal ? wall.x2 : wall.y2;
      const current = horizontal ? patch.x : patch.y;
      const denominator = end - start;
      const offset = Math.abs(denominator) < 0.001
        ? custom.offset
        : Math.max(0.08, Math.min(0.92, (current - start) / denominator));
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

  const addObjectAt = (
    kind: ConceptPlanObject["kind"],
    label: string,
    width: number,
    depth: number,
    point?: { x: number; y: number },
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
    };
    setObjects((prev) => [...(Array.isArray(prev) ? prev : []), next]);
    setSelectedObjectId(next.id);
    setSelectedId(null);
    setSelectedOpeningId(null);
    setSelectedWallId(null);
    setSelectedCustomWallId(null);
    setSelectedClosedSpaceId(null);
    setEditorView("plan");
    closeLibraryOnMobile();
    pushRoomHistory(before);
  };

  const addObject = (kind: ConceptPlanObject["kind"], label: string, width: number, depth: number) =>
    addObjectAt(kind, label, width, depth);

  const updateObjectById = (objectId: string, patch: Partial<Pick<ConceptPlanObject, "x" | "y" | "width" | "depth" | "rotation" | "materialId">>) => {
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
    setObjects((prev) => (Array.isArray(prev) ? prev : []).filter((object) => object.id !== selectedObjectId));
    setSelectedObjectId(null);
    pushRoomHistory(before);
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
    setObjects((prev) => (Array.isArray(prev) ? prev : []).filter((object) => object.id !== objectId));
    setSelectedObjectId((current) => current === objectId ? null : current);
    pushRoomHistory(before);
  };

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
    () => buildConceptGeometry(rooms, lotWidth, lotDepth, activeFloor),
    [rooms, lotWidth, lotDepth, activeFloor],
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
      const base = buildConceptGeometry(safeRooms, lotWidth, lotDepth, floorIndex);
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
  }, [floors, safeRooms, lotWidth, lotDepth, openingOverrides, safeCustomWalls, safeCustomOpenings, safeSpaceProfiles, safeWallFirstFloors, wallMaterials]);

  const selectedClosedSpace = closedSpaces.find((space) => space.id === selectedClosedSpaceId) ?? null;
  const selectedSpaceProfile = selectedClosedSpace ? spaceAssignments.get(selectedClosedSpace.id) ?? null : null;

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
  const layoutIssues = useMemo(
    () => wallFirstActive ? [] : validateConceptLayout(rooms, lotWidth, lotDepth, activeFloor),
    [rooms, lotWidth, lotDepth, activeFloor, wallFirstActive],
  );
  const blockingLayoutIssues = blockingConceptIssues(layoutIssues);
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

  const updateCustomWall = (
    wallId: string,
    patch: Partial<{ x1: number; y1: number; x2: number; y2: number; thickness: number }>,
    recordHistory = false,
  ) => {
    const before = recordHistory ? snapshotEditor() : null;
    setCustomWalls((prev) => (Array.isArray(prev) ? prev : []).map((wall) => wall.id === wallId ? { ...wall, ...patch } : wall));
    if (before) pushRoomHistory(before);
  };

  const setCustomWallLength = (wallId: string, rawLength: number) => {
    const wall = safeCustomWalls.find((item) => item.id === wallId);
    if (!wall || !Number.isFinite(rawLength)) return;
    const length = Math.max(0.5, Math.min(Math.max(lotWidth, lotDepth), rawLength));
    const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
    const before = snapshotEditor();

    if (horizontal) {
      const direction = wall.x2 >= wall.x1 ? 1 : -1;
      const x2 = Math.max(0, Math.min(lotWidth, wall.x1 + length * direction));
      setCustomWalls((prev) => (Array.isArray(prev) ? prev : []).map((item) => item.id === wallId ? { ...item, x2, y2: item.y1 } : item));
    } else {
      const direction = wall.y2 >= wall.y1 ? 1 : -1;
      const y2 = Math.max(0, Math.min(lotDepth, wall.y1 + length * direction));
      setCustomWalls((prev) => (Array.isArray(prev) ? prev : []).map((item) => item.id === wallId ? { ...item, x2: item.x1, y2 } : item));
    }

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

  const selectedCustomWall = safeCustomWalls.find((wall) => wall.id === selectedCustomWallId) ?? null;
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
    const opening: CustomOpening = {
      id: `custom-opening-${uid()}`,
      wallId,
      floor: wall.floor,
      type,
      offset: 0.5,
      width: type === "door" ? 0.90 : 1.20,
      height: type === "door" ? 2.10 : 1.20,
      sillHeight: type === "door" ? 0 : 0.90,
      openingStyle: type === "door" ? "hinged" : "sliding",
      swing: "left",
    };
    setCustomOpenings((prev) => [...(Array.isArray(prev) ? prev : []), opening]);
    pushRoomHistory(before);
    setInteractionMode("opening");
    setSelectedOpeningId(opening.id);
    setSelectedCustomWallId(null);
  };

  const addOpeningPreset = (
    wallId: string,
    preset: Pick<CustomOpening, "type" | "width" | "height" | "sillHeight" | "openingStyle">,
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
      swing: "left",
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
    patch: Partial<Pick<CustomOpening, "width" | "height" | "sillHeight" | "openingStyle" | "swing">>,
  ) => {
    const before = snapshotEditor();
    setCustomOpenings((prev) => (Array.isArray(prev) ? prev : []).map((opening) => {
      if (opening.id !== openingId) return opening;
      const next = { ...opening, ...patch };
      const isDoor = next.type === "door";
      return {
        ...next,
        width: Math.max(0.5, Math.min(4, next.width ?? (isDoor ? 0.9 : 1.2))),
        height: Math.max(0.5, Math.min(2.8, next.height ?? (isDoor ? 2.1 : 1.2))),
        sillHeight: isDoor ? 0 : Math.max(0, Math.min(2.2, next.sillHeight ?? 0.9)),
      };
    }));
    pushRoomHistory(before);
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
    moveWallById(selectedWall.id, delta);
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

  const setSelectedWallMaterial = (materialId: string) => {
    const wallId = selectedCustomWall?.id ?? selectedWall?.id;
    if (!wallId) return;
    const before = snapshotEditor();
    setWallMaterials((prev) => ({ ...(prev ?? {}), [wallId]: materialId }));
    pushRoomHistory(before);
    closeLibraryOnMobile();
  };

  const promoteToProject = async () => {
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

      const data = (await response.json()) as { project?: { id?: string }; leadId?: string | null; dealId?: string | null };
      const projectId = data.project?.id;
      if (!projectId) throw new Error("Projeto criado sem identificador.");

      setArchProjetoId(projectId);
      setHandoffState("sent");
      return projectId;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao enviar ao profissional.";
      setHandoffError(message);
      setHandoffState("error");
      return null;
    }
  };

  const generateConceptRender = async (options?: { source?: "facade" | "model3d"; renderView?: "exterior" | "interior"; lightingMode?: "day" | "sunset" | "night" }) => {
    const renderProjectId = await saveConcept(5);
    if (!renderProjectId) return;

    const source = options?.source ?? "facade";
    const renderView = options?.renderView ?? (source === "model3d" ? "interior" : "exterior");

    setRenderError(null);
    setConceptRender((prev) => ({ ...prev, status: "processing", error: undefined }));

    try {
      const selector = source === "model3d"
        ? "svg[data-concept-model3d-source='true']"
        : "[data-concept-render-source='true'] svg";
      const svg = document.querySelector<SVGSVGElement>(selector);
      if (!svg) throw new Error(source === "model3d"
        ? "Não foi possível localizar a vista 3D atual para gerar o render."
        : "Não foi possível localizar a volumetria para gerar o render.");

      const originalImage = await svgElementToPngDataUrl(svg, source === "model3d" ? 1.9 : 1.7);
      const brief = buildConceptRenderBrief({
        lotWidth,
        lotDepth,
        floors,
        desiredArea,
        rooms,
        facade: facadePreferences,
        facadeDesign,
        renderView,
        lightingMode: options?.lightingMode,
        objects: safeObjects,
        wallMaterialIds: Object.values(wallMaterials),
        floorMaterialIds: [
          ...Object.values(roomFloorMaterials),
          ...Object.values(spaceFloorMaterials),
        ],
      });

      if (source === "model3d") setEditorView("render");

      const response = await fetch("/api/arch/ai-render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: renderProjectId,
          original_image_url: originalImage,
          mode: "preservar",
          ambiente: renderView === "interior" ? "interior" : "fachada",
          user_notes: brief,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Erro ${response.status} ao iniciar render.`);
      }

      const { render_id } = (await response.json()) as { render_id: string };
      const processing = { renderId: render_id, status: "processing" as const };
      setConceptRender(processing);

      let attempts = 0;
      while (attempts < 90) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const poll = await fetch(`/api/arch/ai-render/${render_id}`);
        if (!poll.ok) throw new Error("Não foi possível acompanhar o render.");

        const data = (await poll.json()) as {
          status?: string;
          result_image_url?: string;
          erro_msg?: string;
        };

        if (data.status === "concluido" && data.result_image_url) {
          const generatedAt = new Date().toISOString();
          const historyItem = {
            renderId: render_id,
            resultImageUrl: data.result_image_url,
            generatedAt,
            source,
            renderView,
          };
          const existingHistory = Array.isArray(conceptRender?.history) ? conceptRender.history : [];
          const completed = {
            renderId: render_id,
            status: "completed" as const,
            resultImageUrl: data.result_image_url,
            generatedAt,
            source,
            renderView,
            history: [...existingHistory, historyItem].slice(-12),
          };
          setConceptRender(completed);

          await fetch(`/api/arch/concept-projects/${renderProjectId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(buildCompletedRenderPatch(completed)),
          });
          return;
        }

        if (data.status === "erro") {
          throw new Error(data.erro_msg ?? "O render não pôde ser concluído.");
        }
        attempts += 1;
      }

      throw new Error("Tempo esgotado aguardando o render conceitual.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Erro ao gerar render conceitual.";
      setRenderError(message);
      setConceptRender((prev) => ({ ...prev, status: "error", error: message }));
    }
  };

  const hasEditorSelection = Boolean(
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

  return (
    <div className="arqdor-reference-ui min-h-screen bg-muted/30">
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
                        onClick={() => { applyTypology(item.id); closeLibraryOnMobile(); }}
                        className="group text-left"
                      >
                        <div className={typology === item.id
                          ? "relative overflow-hidden rounded-2xl border-2 border-orange-500 bg-slate-50 shadow-sm"
                          : "relative overflow-hidden rounded-2xl border bg-slate-50 transition group-hover:-translate-y-0.5 group-hover:border-slate-400 group-hover:shadow-lg"}
                        >
                          <div className="aspect-[4/3]">
                            <ConceptTypologyPreview
                              typology={item.id}
                              lotWidth={lotWidth}
                              lotDepth={lotDepth}
                            />
                          </div>

                          <div className="absolute left-3 top-3 flex gap-2">
                            <span className="rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold shadow-sm">
                              {item.floors === 1 ? "TÉRREA" : "SOBRADO"}
                            </span>
                            {(item.rooms.some((room) => room.kind === "piscina" || room.kind === "gourmet")) && (
                              <span className="rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-bold shadow-sm">
                                LAZER
                              </span>
                            )}
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
          <section className="min-h-screen overflow-hidden bg-white">
            <div className="relative flex min-h-16 flex-wrap items-center justify-between gap-2 border-b bg-white px-2 py-2 text-slate-800 shadow-sm sm:px-4 lg:h-16 lg:flex-nowrap lg:py-0">
              <div className="flex min-w-0 items-center gap-2">
                <a
                  href="/arch"
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border bg-white transition hover:bg-slate-50"
                  title="Voltar ao Arqdor"
                >
                  <ArrowLeft className="h-4 w-4" />
                </a>

                <div className="hidden min-w-0 sm:block">
                  <div className="truncate text-sm font-semibold text-slate-950">Projeto residencial</div>
                  <div className="text-[11px] text-slate-500">Arqdor Concept</div>
                </div>

                <button
                  type="button"
                  onClick={() => void saveConcept(4)}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full border bg-white text-slate-600 transition hover:bg-slate-50"
                  title="Salvar projeto"
                >
                  <Check className="h-4 w-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setActiveFloor((current) => floors <= 1 ? 0 : (current + 1) % floors)}
                  className="ml-1 hidden h-10 items-center gap-2 rounded-xl border bg-white px-3 text-xs font-semibold shadow-sm sm:inline-flex"
                  title="Alternar pavimento"
                >
                  <Layers3 className="h-4 w-4 text-slate-500" />
                  <span>{activeFloor === 0 ? "Térreo" : activeFloor === 1 ? "Superior" : `Pav. ${activeFloor + 1}`}</span>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>
              </div>

              <div className="order-3 w-full min-w-0 lg:absolute lg:left-1/2 lg:top-1/2 lg:order-none lg:w-auto lg:-translate-x-1/2 lg:-translate-y-1/2">
                <div className="flex w-full snap-x overflow-x-auto rounded-full border bg-slate-50 p-1 shadow-sm [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:inline-flex lg:w-auto">
                  {([
                    ["plan", "2D"],
                    ["model3d", "3D"],
                    ["facade", "Fachada"],
                    ["render", "Render"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setStep(4);
                        setEditorView(value);
                        if (value !== "plan") setLibraryOpen(false);
                      }}
                      className={editorView === value
                        ? "shrink-0 snap-center rounded-full bg-orange-500 px-3 py-2 text-xs font-bold text-white shadow-sm sm:px-4"
                        : "shrink-0 snap-center rounded-full px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 sm:px-4"}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-1">
                {editorView === "plan" && (
                <button
                  type="button"
                  onClick={() => setShowDimensions((value) => !value)}
                  title="Cotas"
                  className={showDimensions
                    ? "hidden h-10 w-10 place-items-center rounded-full bg-orange-50 text-orange-700 sm:grid"
                    : "hidden h-10 w-10 place-items-center rounded-full text-slate-600 hover:bg-slate-50 sm:grid"}
                >
                  <Ruler className="h-4 w-4" />
                </button>
                )}
                <button
                  type="button"
                  onClick={() => setFloors((value) => Math.min(3, value + 1))}
                  title="Adicionar pavimento"
                  className="hidden h-10 w-10 place-items-center rounded-full text-slate-600 hover:bg-slate-50 sm:grid"
                >
                  <Plus className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={() => { void navigator.clipboard?.writeText(window.location.href); }}
                  title="Copiar link do projeto"
                  className="hidden h-10 w-10 place-items-center rounded-full bg-orange-500 text-white shadow-sm hover:bg-orange-600 sm:grid"
                >
                  <Share2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditorView("facade");
                    setLibraryOpen(false);
                    void saveConcept(4);
                  }}
                  title="Abrir edição de fachada"
                  className="ml-1 inline-flex h-10 shrink-0 items-center gap-1 rounded-xl bg-slate-900 px-2.5 text-xs font-bold text-white shadow-sm hover:bg-slate-800 sm:gap-2 sm:px-3"
                >
                  Fachada <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            {layoutIssues.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setMobileValidationOpen(true);
                    setLibraryOpen(false);
                  }}
                  className={blockingLayoutIssues.length > 0
                    ? "absolute right-3 top-20 z-40 rounded-full border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 shadow md:hidden"
                    : "absolute right-3 top-20 z-40 rounded-full border border-amber-200 bg-white px-3 py-2 text-xs font-bold text-amber-700 shadow md:hidden"}
                >
                  {blockingLayoutIssues.length > 0 ? `${blockingLayoutIssues.length} erro(s)` : `${layoutIssues.length} aviso(s)`}
                </button>

                <button
                  type="button"
                  onClick={() => setMobileValidationOpen(true)}
                  className={blockingLayoutIssues.length > 0
                    ? "absolute right-4 top-20 z-40 hidden rounded-xl border border-red-200 bg-white/95 px-3 py-2 text-xs font-bold text-red-700 shadow-lg backdrop-blur md:block"
                    : "absolute right-4 top-20 z-40 hidden rounded-xl border border-amber-200 bg-white/95 px-3 py-2 text-xs font-bold text-amber-700 shadow-lg backdrop-blur md:block"}
                >
                  {blockingLayoutIssues.length > 0 ? `${blockingLayoutIssues.length} erro(s)` : `${layoutIssues.length} aviso(s)`}
                </button>

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
                          <div className="text-sm font-bold text-slate-950">Validação da planta</div>
                          <div className={blockingLayoutIssues.length > 0 ? "mt-0.5 text-xs font-bold text-red-600" : "mt-0.5 text-xs font-bold text-amber-600"}>
                            {blockingLayoutIssues.length > 0 ? `${blockingLayoutIssues.length} erro(s)` : `${layoutIssues.length} aviso(s)`}
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
                      <div className="max-h-[calc(68vh-74px)] space-y-2 overflow-y-auto px-4 py-4">
                        {layoutIssues.map((issue) => (
                          <div
                            key={issue.id}
                            className={issue.severity === "error"
                              ? "rounded-xl bg-red-50 px-3 py-3 text-sm text-red-700"
                              : "rounded-xl bg-amber-50 px-3 py-3 text-sm text-amber-900"}
                          >
                            {issue.message}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}

            <div
              data-concept-render-source="true"
              className="fixed -left-[9999px] top-0 h-[650px] w-[900px] overflow-hidden"
              aria-hidden="true"
            >
              <ConceptDerivedFacade
                lotWidth={lotWidth}
                levels={modelLevels}
                rooms={safeRooms}
                facade={facadePreferences}
                design={facadeDesign}
              />
            </div>

            <div className="relative min-h-[calc(100dvh-64px)] overflow-hidden bg-[#f6f7f8]">
              <aside className={(selected || selectedCustomWall || selectedOpening || selectedClosedSpace || selectedWall)
                  ? "absolute inset-y-0 left-0 z-30 hidden max-w-full border-r bg-white shadow-[8px_0_28px_rgba(15,23,42,0.08)] md:block"
                  : "absolute inset-y-0 left-0 z-30 max-w-full border-r bg-white shadow-[8px_0_28px_rgba(15,23,42,0.08)]"}>
                <div className="flex min-h-full">
                  <div className="w-14 shrink-0 border-r bg-white py-3 sm:w-16">
                    <div className="flex flex-col items-center gap-2">
                      {([
                        ["site", Ruler, "Terreno"],
                        ["models", LayoutGrid, "Modelos"],
                        ["build", Layers3, "Construir"],
                        ["rooms", Home, "Ambientes"],
                        ["furniture", LayoutGrid, "Móveis"],
                        ["materials", Sparkles, "Materiais"],
                        ["outdoor", Trees, "Externo"],
                      ] as const).map(([value, Icon, label]) => (
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
                  <div className={libraryOpen ? "fixed inset-x-2 bottom-20 z-40 max-h-[68vh] overflow-y-auto rounded-3xl border bg-white shadow-2xl md:static md:inset-auto md:z-auto md:max-h-none md:w-[300px] md:overflow-visible md:rounded-none md:border-0 md:shadow-none" : "hidden"}>
                <div className="sticky top-0 z-10 rounded-t-3xl border-b bg-white px-4 py-3 md:rounded-none md:px-5 md:py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold">
                        {editorLibraryTab === "site"
                          ? "Terreno"
                          : editorLibraryTab === "models"
                            ? "Modelos"
                            : editorLibraryTab === "build"
                              ? "Construir"
                              : editorLibraryTab === "rooms"
                                ? "Ambientes"
                                : editorLibraryTab === "furniture"
                                  ? "Móveis e objetos"
                                  : editorLibraryTab === "materials"
                                    ? "Materiais"
                                    : "Área externa"}
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">
                        {editorLibraryTab === "site"
                          ? "Dimensões e implantação do lote"
                          : editorLibraryTab === "models"
                            ? "Escolha uma base sem sair do editor"
                            : editorLibraryTab === "build"
                              ? "Estrutura e aberturas"
                              : editorLibraryTab === "rooms"
                                ? "Organize os ambientes"
                                : editorLibraryTab === "furniture"
                                  ? "Insira e mova itens na planta"
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
                              onChange={(event) => setLotWidth(Math.max(5, Number(event.target.value) || 5))}
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
                              onChange={(event) => setLotDepth(Math.max(10, Number(event.target.value) || 10))}
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
                            onClick={() => applyTypology(item.id)}
                            className="overflow-hidden rounded-xl border bg-white text-left transition hover:border-slate-300 hover:shadow-sm"
                          >
                            <div className="aspect-[16/8] overflow-hidden">
                              <ConceptTypologyPreview typology={item.id} lotWidth={lotWidth} lotDepth={lotDepth} />
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
                    <>
                      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Construção</div>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            if (!wallFirstActive) activateWallFirstFloor();
                            setInteractionMode("draw-wall");
                            setSelectedId(null);
                            setSelectedOpeningId(null);
                            setSelectedWallId(null);
                            setSelectedCustomWallId(null);
                            closeLibraryOnMobile();
                          }}
                          className={interactionMode === "draw-wall"
                            ? "group overflow-hidden rounded-xl border-2 border-orange-500 bg-orange-50 text-left"
                            : "group overflow-hidden rounded-xl border bg-white text-left hover:border-slate-300 hover:shadow-sm"}
                        >
                          <div className="grid h-24 place-items-center bg-gradient-to-br from-slate-50 to-slate-100">
                            <div className="relative h-12 w-14">
                              <span className="absolute left-1 top-1 h-10 w-1.5 rounded-full bg-slate-700" />
                              <span className="absolute left-1 top-1 h-1.5 w-11 rounded-full bg-slate-700" />
                              <span className="absolute bottom-1 right-1 h-10 w-1.5 rounded-full bg-orange-400" />
                              <span className="absolute bottom-1 right-1 h-1.5 w-11 rounded-full bg-orange-400" />
                            </div>
                          </div>
                          <div className="p-3">
                            <div className="text-sm font-semibold">Paredes</div>
                            <div className="mt-0.5 text-[10px] text-muted-foreground">Desenhar livre</div>
                          </div>
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
                            ? "group overflow-hidden rounded-xl border-2 border-orange-500 bg-orange-50 text-left"
                            : "group overflow-hidden rounded-xl border bg-white text-left hover:border-slate-300 hover:shadow-sm"}
                        >
                          <div className="grid h-24 place-items-center bg-gradient-to-br from-orange-50 to-amber-50">
                            <Home className="h-10 w-10 text-orange-500" />
                          </div>
                          <div className="p-3">
                            <div className="text-sm font-semibold">Ambiente</div>
                            <div className="mt-0.5 text-[10px] text-muted-foreground">{wallFirstActive ? "Nomear espaços" : "Criar cômodo"}</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setInteractionMode("opening");
                            setSelectedId(null);
                            setSelectedWallId(null);
                            setSelectedCustomWallId(null);
                            closeLibraryOnMobile();
                          }}
                          className={interactionMode === "opening"
                            ? "group overflow-hidden rounded-xl border-2 border-orange-500 bg-orange-50 text-left"
                            : "group overflow-hidden rounded-xl border bg-white text-left hover:border-slate-300 hover:shadow-sm"}
                        >
                          <div className="grid h-24 place-items-center bg-gradient-to-br from-sky-50 to-slate-50">
                            <div className="grid h-12 w-9 place-items-center rounded-t-lg border-4 border-slate-600 bg-white">
                              <span className="h-1.5 w-1.5 rounded-full bg-slate-500" />
                            </div>
                          </div>
                          <div className="p-3">
                            <div className="text-sm font-semibold">Portas e janelas</div>
                            <div className="mt-0.5 text-[10px] text-muted-foreground">Selecionar / editar</div>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => { addRoom("escada"); closeLibraryOnMobile(); }}
                          className="group overflow-hidden rounded-xl border bg-white text-left hover:border-orange-300 hover:shadow-sm"
                        >
                          <div className="grid h-24 place-items-center bg-gradient-to-br from-stone-50 to-slate-100">
                            <div className="flex items-end gap-0.5">
                              {[2,3,4,5,6].map((height) => (
                                <span key={height} className="w-2 rounded-sm bg-slate-600" style={{ height: `${height * 5}px` }} />
                              ))}
                            </div>
                          </div>
                          <div className="p-3">
                            <div className="text-sm font-semibold">Escada</div>
                            <div className="mt-0.5 text-[10px] text-muted-foreground">{wallFirstActive ? "Inserir na planta" : "Adicionar"}</div>
                          </div>
                        </button>
                      </div>

                      <div className="mt-5 border-t pt-4">
                        <div className="mb-3 flex items-center justify-between">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Portas e janelas</div>
                          <span className="text-[10px] text-slate-400">{selectedCustomWall ? "Parede selecionada" : "Selecione uma parede"}</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            ["Porta 90", { type: "door", width: 0.90, height: 2.10, sillHeight: 0, openingStyle: "hinged" }],
                            ["Porta correr 160", { type: "door", width: 1.60, height: 2.10, sillHeight: 0, openingStyle: "sliding" }],
                            ["Janela 120", { type: "window", width: 1.20, height: 1.20, sillHeight: 0.90, openingStyle: "sliding" }],
                            ["Janela 180", { type: "window", width: 1.80, height: 1.20, sillHeight: 0.90, openingStyle: "sliding" }],
                          ] as const).map(([label, preset]) => (
                            <button
                              key={label}
                              type="button"
                              disabled={!selectedCustomWall}
                              onClick={() => selectedCustomWall && addOpeningPreset(selectedCustomWall.id, preset)}
                              className="rounded-xl border bg-white px-3 py-3 text-left disabled:cursor-not-allowed disabled:opacity-40 hover:border-orange-300 hover:bg-orange-50/40"
                            >
                              <div className="text-xs font-semibold">{label}</div>
                              <div className="mt-1 text-[10px] text-slate-500">
                                {preset.width.toFixed(2).replace(".", ",")} × {preset.height.toFixed(2).replace(".", ",")} m
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="mt-5 border-t pt-4">
                        <div className="flex items-center justify-between">
                          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Pavimentos</div>
                          {floors < 3 && (
                            <button
                              type="button"
                              onClick={() => setFloors((value) => Math.min(3, value + 1))}
                              className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold"
                            >
                              <Plus className="h-3 w-3" /> Adicionar
                            </button>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {Array.from({ length: floors }).map((_, floor) => (
                            <button
                              key={floor}
                              type="button"
                              onClick={() => { setActiveFloor(floor); setSelectedId(null); setEditorView("plan"); }}
                              className={activeFloor === floor
                                ? "rounded-xl bg-foreground px-3 py-2 text-xs font-semibold text-background"
                                : "rounded-xl border bg-background px-3 py-2 text-xs font-semibold"}
                            >
                              {floor === 0 ? "Térreo" : floor === 1 ? "Superior" : `Pav. ${floor + 1}`}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {editorLibraryTab === "rooms" && (
                    <>
                      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                        {wallFirstActive ? "Classificar espaços" : "Adicionar ambientes"}
                      </div>
                      {wallFirstActive ? (
                        <div className="rounded-2xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                          Desenhe as paredes, feche os espaços e clique dentro da planta para nomear cada ambiente.
                          <button
                            type="button"
                            onClick={() => setInteractionMode("space")}
                            className="mt-3 w-full rounded-xl bg-foreground px-3 py-2.5 text-xs font-semibold text-background"
                          >
                            Nomear espaços na planta
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3">
                          {([
                            ["sala", Home, "Sala"],
                            ["cozinha", ChefHat, "Cozinha"],
                            ["quarto", BedDouble, "Quarto"],
                            ["suite", BedDouble, "Suíte"],
                            ["banheiro", Bath, "Banheiro"],
                            ["lavanderia", Home, "Lavanderia"],
                          ] as Array<[RoomKind, typeof Home, string]>).map(([kind, Icon, label]) => (
                            <button
                              key={kind}
                              type="button"
                              onClick={() => addRoom(kind)}
                              className="overflow-hidden rounded-xl border bg-white text-left hover:border-slate-300 hover:shadow-sm"
                            >
                              <div className="grid h-20 place-items-center bg-gradient-to-br from-slate-50 to-orange-50">
                                <Icon className="h-8 w-8 text-slate-600" />
                              </div>
                              <div className="flex items-center justify-between p-3">
                                <span className="text-sm font-semibold">{label}</span>
                                <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {editorLibraryTab === "furniture" && (
                    <>
                      <div className="mb-3 flex items-center justify-between">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Móveis e objetos</div>
                        <span className="text-[10px] text-slate-400">Arraste para a planta</span>
                      </div>

                      <label className="mb-3 flex h-10 items-center gap-2 rounded-xl border bg-white px-3">
                        <Search className="h-4 w-4 text-slate-400" />
                        <input
                          value={furnitureSearch}
                          onChange={(event) => setFurnitureSearch(event.target.value)}
                          placeholder="Buscar sofá, cama, mesa..."
                          className="w-full bg-transparent text-sm outline-none"
                        />
                      </label>

                      <div className="mb-3 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {(["Todos", "Sala", "Quarto", "Jantar", "Cozinha", "Escritório", "Decoração", "Iluminação"] as const).map((category) => (
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

                      <div className="grid grid-cols-2 gap-3">
                        {filteredFurniture.map(({ kind, label, width, depth, category }) => (
                          <button
                            key={`${category}-${label}`}
                            type="button"
                            draggable
                            onDragStart={(event) => {
                              event.dataTransfer.effectAllowed = "copy";
                              event.dataTransfer.setData("application/x-arqdor-object", JSON.stringify({ kind, label, width, depth }));
                            }}
                            onClick={() => addObject(kind, label, width, depth)}
                            className="cursor-grab overflow-hidden rounded-xl border bg-white text-left transition active:cursor-grabbing hover:border-orange-300 hover:shadow-md"
                          >
                            <div className="relative grid h-24 place-items-center overflow-hidden bg-gradient-to-br from-slate-50 via-white to-stone-100">
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
                          </button>
                        ))}
                      </div>

                      {!filteredFurniture.length && (
                        <div className="rounded-xl border border-dashed p-4 text-center text-xs text-slate-500">
                          Nenhum item encontrado nessa categoria.
                        </div>
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
                          <div className="mb-3 text-xs font-semibold text-slate-600">Acabamento do móvel</div>
                          <div className="grid grid-cols-2 gap-3">
                            {CONCEPT_OBJECT_MATERIALS.map((material) => (
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
                      ) : selectedCustomWall || selectedWall ? (
                        <>
                          <div className="mb-3 text-xs font-semibold text-slate-600">Acabamento da parede</div>
                          <div className="grid grid-cols-2 gap-3">
                            {CONCEPT_WALL_MATERIALS.map((material) => {
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
                            {CONCEPT_FLOOR_MATERIALS.map((material) => {
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

                  {safeObjects.filter((object) => object.floor === activeFloor).length > 0 && (
                    <div className="mt-5 rounded-xl border bg-slate-50 p-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-700">Objetos no pavimento · arraste para editar</span>
                        <span className="rounded-full bg-white px-2 py-1 font-bold text-slate-600">
                          {safeObjects.filter((object) => object.floor === activeFloor).length}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="mt-6 hidden border-t pt-4 xl:block">
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

              <div className={`relative min-h-[calc(100dvh-64px)] overflow-hidden bg-[#f6f7f8] pl-14 sm:pl-16 ${hasEditorSelection && (editorView === "plan" || editorView === "model3d") ? "md:pr-[360px]" : ""}`}>
                <div className="h-full w-full">
                  <div className="absolute left-1/2 top-3 z-[55] hidden -translate-x-1/2 items-center gap-1 rounded-2xl border border-slate-200 bg-white/95 p-1.5 shadow-xl backdrop-blur md:flex">
                    {([
                      ["plan", "2D"],
                      ["model3d", "3D"],
                      ["facade", "Fachada"],
                      ["render", "Render"],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => {
                          setEditorView(value);
                          setLibraryOpen(value === "plan" ? libraryOpen : false);
                        }}
                        className={editorView === value
                          ? "rounded-xl bg-slate-950 px-4 py-2 text-xs font-bold text-white shadow-sm"
                          : "rounded-xl px-4 py-2 text-xs font-semibold text-slate-500 hover:bg-slate-100 hover:text-slate-900"}
                      >
                        {label}
                      </button>
                    ))}
                    <div className="mx-1 h-6 w-px bg-slate-200" />
                    <button
                      type="button"
                      onClick={() => void saveConcept()}
                      disabled={saveState === "saving" || saveState === "loading"}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {saveState === "saving" ? "Salvando..." : saveState === "saved" ? "Salvo" : "Salvar"}
                    </button>
                  </div>

                  {editorView === "plan" && (
                      <div className="absolute left-16 right-3 top-3 z-20 flex snap-x items-center gap-2 overflow-x-auto rounded-2xl border bg-white/95 p-1.5 shadow-lg backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:left-20 md:right-auto">
                        <button
                          type="button"
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
                          Selecionar
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
                          onClick={() => setShowDimensions((value) => !value)}
                          className={showDimensions
                            ? "rounded-xl border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800"
                            : "rounded-xl border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground"}
                        >
                          Cotas {showDimensions ? "✓" : ""}
                        </button>
                      </div>
                    )}
                  </div>

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
                      <ConceptPlan2D
                        rooms={visibleRooms}
                        lotWidth={lotWidth}
                        lotDepth={lotDepth}
                        activeFloor={activeFloor}
                        geometry={geometry}
                        closedSpaces={closedSpaces}
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
                            spaceAssignments.get(space.id)?.label ?? "",
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
                        customWalls={safeCustomWalls.filter((wall) => wall.floor === activeFloor)}
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
                        topologyNodes={customWallTopology.nodes}
                        showDimensions={showDimensions}
                        onMoveTopologyJunction={moveTopologyJunction}
                        onEditStart={beginRoomEdit}
                        onEditEnd={endRoomEdit}
                        interactionMode={interactionMode}
                        objects={safeObjects}
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
                        onObjectDrop={(preset, point) => addObjectAt(preset.kind, preset.label, preset.width, preset.depth, point)}
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
                      lotWidth={lotWidth}
                      levels={modelLevels}
                      rooms={safeRooms}
                      facade={facadePreferences}
                      design={facadeDesign}
                      onFacadeChange={setFacadePreferences}
                      onDesignChange={setFacadeDesign}
                      onOpenRender={() => { setEditorView("render"); void generateConceptRender({ source: "facade", renderView: "exterior" }); }}
                    />
                  )}

                  {editorView === "render" && (
                    <div className="min-h-[calc(100dvh-64px)] bg-slate-100 p-4 md:p-5">
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
                              onClick={() => void generateConceptRender({ source: "facade", renderView: "exterior" })}
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

                        {conceptRender?.resultImageUrl ? (
                          <div className="overflow-hidden rounded-2xl border bg-white shadow-xl">
                            <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
                              <div>
                                <div className="text-sm font-semibold">
                                  {conceptRender.renderView === "interior" ? "Render interior / vista 3D" : "Render de fachada"}
                                </div>
                                <div className="text-[11px] text-muted-foreground">
                                  {conceptRender.generatedAt
                                    ? new Date(conceptRender.generatedAt).toLocaleString("pt-BR")
                                    : "Render atual"}
                                </div>
                              </div>
                              {conceptRender.status === "processing" && (
                                <span className="rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700">Gerando...</span>
                              )}
                            </div>
                            <img
                              src={conceptRender.resultImageUrl}
                              alt="Render conceitual"
                              className="max-h-[calc(100dvh-260px)] w-full object-contain"
                            />
                          </div>
                        ) : (
                          <div className="grid min-h-[420px] place-items-center rounded-2xl border bg-white text-center shadow-sm">
                            <div>
                              <Sparkles className="mx-auto h-8 w-8 text-orange-500" />
                              <div className="mt-3 font-semibold">Ainda não há render</div>
                              <p className="mt-1 text-sm text-muted-foreground">Gere uma fachada ou abra o 3D para renderizar a vista atual.</p>
                              <button
                                type="button"
                                onClick={() => void generateConceptRender({ source: "facade", renderView: "exterior" })}
                                disabled={conceptRender?.status === "processing"}
                                className="mt-4 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                              >
                                {conceptRender?.status === "processing" ? "Gerando..." : "Gerar fachada"}
                              </button>
                            </div>
                          </div>
                        )}

                        {Array.isArray(conceptRender?.history) && conceptRender.history.length > 0 && (
                          <div className="rounded-2xl border bg-white p-4 shadow-sm">
                            <div className="mb-3 flex items-center justify-between">
                              <div>
                                <div className="text-sm font-semibold">Histórico de renders</div>
                                <div className="text-[11px] text-muted-foreground">Até 12 versões recentes.</div>
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
                                  onClick={() => setConceptRender((prev) => ({
                                    ...prev,
                                    renderId: item.renderId,
                                    resultImageUrl: item.resultImageUrl,
                                    generatedAt: item.generatedAt,
                                    source: item.source,
                                    renderView: item.renderView,
                                    status: "completed",
                                  }))}
                                  className={conceptRender.renderId === item.renderId
                                    ? "overflow-hidden rounded-xl border-2 border-orange-500 bg-orange-50 text-left"
                                    : "overflow-hidden rounded-xl border bg-white text-left hover:border-orange-300"}
                                >
                                  <img src={item.resultImageUrl} alt="" className="aspect-video w-full object-cover" />
                                  <div className="p-2.5">
                                    <div className="text-xs font-semibold">
                                      {item.renderView === "interior" ? "Vista 3D" : "Fachada"}
                                    </div>
                                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                                      {new Date(item.generatedAt).toLocaleString("pt-BR")}
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
                {([
                  ["plan", "2D"],
                  ["model3d", "3D"],
                  ["facade", "Fachada"],
                  ["render", "Render"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setStep(4);
                      setEditorView(value);
                      setLibraryOpen(false);
                    }}
                    className={editorView === value
                      ? "flex-1 rounded-xl bg-slate-950 px-2 py-2.5 text-xs font-bold text-white"
                      : "flex-1 rounded-xl px-2 py-2.5 text-xs font-semibold text-slate-500"}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {hasEditorSelection && (editorView === "plan" || editorView === "model3d") && (
              <aside className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[70] max-h-[64vh] overflow-y-auto rounded-3xl border bg-white/98 px-4 py-4 shadow-2xl backdrop-blur md:inset-y-3 md:left-auto md:right-3 md:bottom-auto md:w-[340px] md:max-h-[calc(100dvh-24px)] md:rounded-2xl md:border-slate-200 md:px-4 md:py-4 md:shadow-[0_18px_50px_rgba(15,23,42,0.16)]">
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
                      Rotação
                      <select
                        value={selectedObject.rotation}
                        onChange={(event) => updateObjectById(selectedObject.id, { rotation: Number(event.target.value) })}
                        className="mt-1 h-9 w-[100px] rounded-lg border bg-white px-2 text-xs"
                      >
                        <option value={0}>0°</option>
                        <option value={90}>90°</option>
                        <option value={180}>180°</option>
                        <option value={270}>270°</option>
                      </select>
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
                        {CONCEPT_OBJECT_MATERIALS.map((material) => (
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
                      <button type="button" onClick={duplicateSelectedObject} className="h-9 rounded-lg border px-3 text-xs font-semibold">Duplicar</button>
                      <button type="button" onClick={deleteSelectedObject} className="h-9 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600">Excluir</button>
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
                        type="number"
                        min="0.5"
                        step="0.05"
                        value={Math.hypot(selectedCustomWall.x2 - selectedCustomWall.x1, selectedCustomWall.y2 - selectedCustomWall.y1).toFixed(2)}
                        onChange={(event) => setCustomWallLength(selectedCustomWall.id, Number(event.target.value))}
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
                      <button type="button" onClick={() => deleteCustomWall(selectedCustomWall.id)} className="h-9 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 hover:bg-red-50">Excluir</button>
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
                      {safeCustomOpenings.some((opening) => opening.id === selectedOpening.id) && (
                        <button type="button" onClick={() => deleteCustomOpening(selectedOpening.id)} className="h-9 rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600">Excluir</button>
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
                  {facadePreferences.style.replaceAll("_", " ")}
                </div>
              </div>

              <div data-concept-render-source="true" className="mt-4 overflow-hidden rounded-2xl border bg-slate-50">
                <ConceptDerivedFacade lotWidth={lotWidth} levels={modelLevels} facade={facadePreferences} />
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

                {conceptRender?.resultImageUrl && (
                  <div className="mt-4 overflow-hidden rounded-2xl border bg-muted">
                    <img
                      src={conceptRender.resultImageUrl}
                      alt="Render conceitual do pré-projeto"
                      className="max-h-[640px] w-full object-contain"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-background p-3 text-xs text-muted-foreground">
                      <span>Render vinculado a este pré-projeto</span>
                      {conceptRender.generatedAt && <span>{new Date(conceptRender.generatedAt).toLocaleString("pt-BR")}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        {step === 6 && (
          <section className="mx-auto max-w-6xl space-y-5 print:max-w-none">
            <div className="rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
                    <FileText className="h-4 w-4" />
                    Resultado do pré-projeto
                  </div>
                  <h2 className="mt-2 text-2xl font-bold">Sua ideia organizada para seguir com o profissional</h2>
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                    Este material reúne programa de necessidades, dimensões, implantação conceitual, fachada e render.
                    É um pré-projeto conceitual e precisa de validação técnica antes de qualquer execução.
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
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
              <div className="space-y-5">
                {conceptRender?.resultImageUrl ? (
                  <div className="overflow-hidden rounded-3xl border bg-card shadow-sm">
                    <img
                      src={conceptRender.resultImageUrl}
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
                    <p className="mt-1 text-sm text-muted-foreground">Volte à etapa Fachada para gerar a imagem conceitual.</p>
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
                    <ConceptDerivedFacade lotWidth={lotWidth} levels={modelLevels} facade={facadePreferences} />
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
                      ["Estilo", facadePreferences.style.replaceAll("_", " ")],
                      ["Cobertura", facadePreferences.roof],
                      ["Material principal", facadePreferences.primaryMaterial],
                      ["Material de destaque", facadePreferences.accentMaterial],
                      ["Tom", facadePreferences.facadeTone],
                      ["Esquadrias", facadePreferences.frameTone],
                      ["Paisagismo", facadePreferences.landscaping],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between gap-4 border-b py-2 last:border-b-0">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium capitalize">{value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-3xl border bg-card p-5 shadow-sm print:hidden">
                  <h3 className="font-semibold">Dados do cliente</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Essas informações qualificam o contato e entram no CRM quando o pré-projeto for enviado.
                  </p>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-xs font-semibold">
                      Nome
                      <input
                        value={customerProfile.name ?? ""}
                        onInput={(event) => setCustomerProfile((prev) => ({ ...prev, name: event.currentTarget.value }))}
                        onChange={(event) => setCustomerProfile((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Nome do cliente"
                        className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      WhatsApp / telefone
                      <input
                        value={customerProfile.phone ?? ""}
                        onInput={(event) => setCustomerProfile((prev) => ({ ...prev, phone: event.currentTarget.value }))}
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
                        onInput={(event) => setCustomerProfile((prev) => ({ ...prev, email: event.currentTarget.value }))}
                        onChange={(event) => setCustomerProfile((prev) => ({ ...prev, email: event.target.value }))}
                        placeholder="cliente@email.com"
                        className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      Faixa de investimento
                      <select
                        value={customerProfile.budgetRange ?? ""}
                        onInput={(event) => setCustomerProfile((prev) => ({ ...prev, budgetRange: event.currentTarget.value }))}
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
                        onInput={(event) => setCustomerProfile((prev) => ({ ...prev, timeframe: event.currentTarget.value }))}
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
                        onInput={(event) => setCustomerProfile((prev) => ({ ...prev, notes: event.currentTarget.value }))}
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

                <div className="rounded-3xl border border-orange-200 bg-orange-50 p-5 shadow-sm print:hidden">
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
                            Pré-projeto enviado e vinculado ao Projeto Arqdor.
                          </div>
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
                          !customerProfile.name?.trim() ||
                          !(customerProfile.phone?.trim() || customerProfile.email?.trim())
                        }
                          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                        >
                          <Send className="h-4 w-4" />
                          {handoffState === "sending" ? "Enviando..." : "Enviar ao profissional"}
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
    </div>
  );
}
