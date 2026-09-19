import { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { buildConceptGeometry, nudgeOpening, validateConceptLayout } from "./conceptGeometry";
import { type ConceptFacadePreferences } from "./ConceptVolumetry";
import ConceptPlan2D from "./ConceptPlan2D";
import ConceptFacadeElevation from "./ConceptFacadeElevation";
import { buildTypologyRooms, CONCEPT_TYPOLOGIES, DEFAULT_LAYOUT_PREFERENCES, type ConceptTypology, type LayoutPreferences, type LayoutPreferenceKey } from "./conceptTemplates";
import { generateTypologyLayout } from "./conceptTypologyLayout";
import { buildConceptRenderBrief, svgElementToPngDataUrl } from "./conceptRender";

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

type EditorSnapshot = {
  rooms: Room[];
  customWalls: CustomWall[];
  openingOverrides: Record<string, OpeningOverride>;
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
    customWalls?: Array<{ id: string; floor: number; x1: number; y1: number; x2: number; y2: number; thickness?: number }>;
  };
  rooms: Room[];
  openingOverrides: Record<string, OpeningOverride>;
  customerProfile?: CustomerProfile;
  facadePreferences?: ConceptFacadePreferences;
  conceptRender?: {
    renderId?: string;
    status?: "idle" | "processing" | "completed" | "error";
    resultImageUrl?: string;
    generatedAt?: string;
    error?: string;
  };
  selectedVariant: number;
};

const STEPS = ["Terreno", "Casa", "Ambientes", "Posições", "Layout", "Fachada", "Resultado"];
const FLOW_STEPS = ["Terreno", "Modelo", "Editor", "Resultado"];

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

function normalizeDraftRooms(input: Room[]) {
  const singletonKinds = SINGLETON_ROOM_KINDS;
  const seen = new Set<string>();
  return input.filter((room) => {
    if (!singletonKinds.has(room.kind)) return true;
    const key = `${room.floor}:${room.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function autoArrange(rooms: Room[], lotWidth: number, lotDepth: number, floor: number) {
  const floorRooms = rooms.filter((r) => r.floor === floor);
  const others = rooms.filter((r) => r.floor !== floor);
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

export default function ConceptPlanner() {
  const [step, setStep] = useState(0);
  const [lotWidth, setLotWidth] = useState(12);
  const [lotDepth, setLotDepth] = useState(30);
  const [typology, setTypology] = useState<ConceptTypology>("terrea_3q");
  const [layoutPreferences, setLayoutPreferences] = useState<LayoutPreferences>(DEFAULT_LAYOUT_PREFERENCES);
  const [floors, setFloors] = useState(1);
  const [desiredArea, setDesiredArea] = useState(145);
  const [activeFloor, setActiveFloor] = useState(0);
  const [editorView, setEditorView] = useState<"plan" | "facade" | "render">("plan");
  const [interactionMode, setInteractionMode] = useState<"room" | "wall" | "opening" | "draw-wall">("room");
  const [rooms, setRooms] = useState<Room[]>(() => buildTypologyRooms("terrea_3q") as Room[]);
  const roomsRef = useRef<Room[]>(rooms);
  const customWallsRef = useRef<CustomWall[]>([]);
  const openingOverridesRef = useRef<Record<string, OpeningOverride>>({});
  const editStartRef = useRef<EditorSnapshot | null>(null);
  const [roomHistory, setRoomHistory] = useState<EditorSnapshot[]>([]);
  const [roomFuture, setRoomFuture] = useState<EditorSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layoutVariant, setLayoutVariant] = useState(0);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedCustomWallId, setSelectedCustomWallId] = useState<string | null>(null);
  const [customWalls, setCustomWalls] = useState<CustomWall[]>([]);
  const [openingOverrides, setOpeningOverrides] = useState<Record<string, OpeningOverride>>({});
  const [conceptId, setConceptId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "loading" | "saving" | "saved" | "error">("loading");
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile>({});
  const [facadePreferences, setFacadePreferences] = useState<ConceptFacadePreferences>(DEFAULT_FACADE);
  const [conceptRender, setConceptRender] = useState<ConceptDraftResponse["conceptRender"]>({ status: "idle" });
  const [renderError, setRenderError] = useState<string | null>(null);
  const [archProjetoId, setArchProjetoId] = useState<string | null>(null);
  const [handoffState, setHandoffState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [handoffError, setHandoffError] = useState<string | null>(null);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    customWallsRef.current = customWalls;
  }, [customWalls]);

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
        const rawStep = Math.max(0, Math.min(STEPS.length - 1, draft.currentStep ?? 0));
        setStep(rawStep <= 0 ? 0 : rawStep === 1 ? 1 : rawStep >= 6 ? 6 : 4);
        setLotWidth(draft.lot?.width ?? 12);
        setLotDepth(draft.lot?.depth ?? 30);
        setFloors(Math.max(1, Math.min(3, draft.configuration?.floors ?? 1)));
        setDesiredArea(draft.configuration?.desiredArea ?? 145);
        setTypology(draft.configuration?.typology ?? "terrea_3q");
        setLayoutPreferences({ ...DEFAULT_LAYOUT_PREFERENCES, ...(draft.configuration?.layoutPreferences ?? {}) });
        setCustomWalls(Array.isArray(draft.configuration?.customWalls) ? draft.configuration.customWalls : []);
        setRooms(Array.isArray(draft.rooms) && draft.rooms.length ? normalizeDraftRooms(draft.rooms) : []);
        setOpeningOverrides(draft.openingOverrides ?? {});
        setCustomerProfile(draft.customerProfile ?? {});
        setFacadePreferences(draft.facadePreferences ?? DEFAULT_FACADE);
        setConceptRender(draft.conceptRender ?? { status: "idle" });
        setLayoutVariant(draft.selectedVariant ?? 0);
        setSaveState("saved");
      } catch {
        if (!cancelled) setSaveState("error");
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
      status: "draft",
      currentStep: stepOverride ?? step,
      lot: { width: lotWidth, depth: lotDepth },
      configuration: { floors, desiredArea, typology, layoutPreferences, customWalls },
      rooms,
      openingOverrides,
      customerProfile,
      facadePreferences,
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

  const selected = rooms.find((r) => r.id === selectedId) ?? null;
  const visibleRooms = rooms.filter((r) => r.floor === activeFloor);
  const currentArea = useMemo(
    () => rooms.filter((r) => r.kind !== "piscina").reduce((sum, r) => sum + r.width * r.depth, 0),
    [rooms],
  );

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
    setRooms(nextRooms);
  };

  const toggleLayoutPreference = (key: LayoutPreferenceKey) => {
    setLayoutPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const snapshotEditor = (): EditorSnapshot => ({
    rooms: roomsRef.current.map((room) => ({ ...room })),
    customWalls: customWallsRef.current.map((wall) => ({ ...wall })),
    openingOverrides: Object.fromEntries(
      Object.entries(openingOverridesRef.current).map(([key, value]) => [key, { ...value }]),
    ),
  });

  const cloneSnapshot = (snapshot: EditorSnapshot): EditorSnapshot => ({
    rooms: snapshot.rooms.map((room) => ({ ...room })),
    customWalls: snapshot.customWalls.map((wall) => ({ ...wall })),
    openingOverrides: Object.fromEntries(
      Object.entries(snapshot.openingOverrides).map(([key, value]) => [key, { ...value }]),
    ),
  });

  const restoreSnapshot = (snapshot: EditorSnapshot) => {
    const cloned = cloneSnapshot(snapshot);
    setRooms(cloned.rooms);
    setCustomWalls(cloned.customWalls);
    setOpeningOverrides(cloned.openingOverrides);
    setSelectedId(null);
    setSelectedWallId(null);
    setSelectedCustomWallId(null);
    setSelectedOpeningId(null);
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
    if (SINGLETON_ROOM_KINDS.has(kind)) {
      const existing = rooms.find((room) => room.floor === activeFloor && room.kind === kind);
      if (existing) {
        setSelectedId(existing.id);
        return;
      }
    }
    const next = createRoom(kind, activeFloor);
    setRooms((prev) => autoArrange([...prev, next], lotWidth, lotDepth, activeFloor));
    setSelectedId(next.id);
  };

  const updateSelected = (patch: Partial<Room>) => {
    if (!selectedId) return;
    setRooms((prev) => prev.map((room) => {
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
    setRooms((prev) => prev.map((room) => (room.id === roomId ? { ...room, ...patch } : room)));
  };

  const updateOpeningById = (openingId: string, patch: OpeningOverride) => {
    setOpeningOverrides((prev) => ({
      ...prev,
      [openingId]: patch,
    }));
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

  const duplicateSelectedRoom = () => {
    if (!selected) return;
    if (SINGLETON_ROOM_KINDS.has(selected.kind)) return;
    const copy: Room = {
      ...selected,
      id: uid(),
      label: selected.label.replace(/\s+\d+$/, "") + " cópia",
      locked: false,
      x: Math.max(0, Math.min(lotWidth - selected.width, selected.x + 0.5)),
      y: Math.max(0, Math.min(lotDepth - selected.depth, selected.y + 0.5)),
    };
    setRooms((prev) => [...prev, copy]);
    setSelectedId(copy.id);
  };

  const deleteSelectedRoom = () => {
    if (!selected) return;
    setRooms((prev) => prev.filter((room) => room.id !== selected.id));
    setSelectedId(null);
  };

  const baseGeometry = useMemo(
    () => buildConceptGeometry(rooms, lotWidth, lotDepth, activeFloor),
    [rooms, lotWidth, lotDepth, activeFloor],
  );
  const geometry = useMemo(
    () => ({
      ...baseGeometry,
      openings: baseGeometry.openings.map((opening) => {
        const override = openingOverrides[opening.id];
        return override ? { ...opening, ...override } : opening;
      }),
    }),
    [baseGeometry, openingOverrides],
  );
  const layoutIssues = useMemo(
    () => validateConceptLayout(rooms, lotWidth, lotDepth, activeFloor),
    [rooms, lotWidth, lotDepth, activeFloor],
  );
  const selectedOpening = geometry.openings.find((opening) => opening.id === selectedOpeningId) ?? null;
  const selectedWall = geometry.walls.find((wall) => wall.id === selectedWallId) ?? null;

  const addCustomWall = (wall: CustomWall) => {
    const before = snapshotEditor();
    setCustomWalls((prev) => [...prev, wall]);
    pushRoomHistory(before);
    setSelectedCustomWallId(wall.id);
    setSelectedWallId(null);
  };

  const updateCustomWall = (
    wallId: string,
    patch: Partial<{ x1: number; y1: number; x2: number; y2: number; thickness: number }>,
  ) => {
    setCustomWalls((prev) => prev.map((wall) => wall.id === wallId ? { ...wall, ...patch } : wall));
  };

  const deleteCustomWall = (wallId: string) => {
    const before = snapshotEditor();
    setCustomWalls((prev) => prev.filter((wall) => wall.id !== wallId));
    pushRoomHistory(before);
    setSelectedCustomWallId((current) => current === wallId ? null : current);
  };

  const selectedCustomWall = customWalls.find((wall) => wall.id === selectedCustomWallId) ?? null;

  const moveWallById = (wallId: string, delta: number) => {
    if (!delta) return;
    const wall = geometry.walls.find((item) => item.id === wallId);
    if (!wall) return;

    const vertical = Math.abs(wall.x1 - wall.x2) < 0.01;
    const minSize = 1;
    const epsilon = 0.08;

    setRooms((prev) => {
      const affected = prev.filter((room) => wall.roomIds.includes(room.id));
      if (!affected.length || affected.some((room) => room.locked)) return prev;

      const patches = new Map<string, Partial<Room>>();
      for (const room of affected) {
        if (vertical) {
          const touchesLeft = Math.abs(room.x - wall.x1) < epsilon;
          const touchesRight = Math.abs(room.x + room.width - wall.x1) < epsilon;
          if (touchesLeft) {
            const nextX = room.x + delta;
            const nextWidth = room.width - delta;
            if (nextX < 0 || nextWidth < minSize) return prev;
            patches.set(room.id, { x: nextX, width: nextWidth });
          } else if (touchesRight) {
            const nextWidth = room.width + delta;
            if (room.x + nextWidth > lotWidth || nextWidth < minSize) return prev;
            patches.set(room.id, { width: nextWidth });
          }
        } else {
          const touchesTop = Math.abs(room.y - wall.y1) < epsilon;
          const touchesBottom = Math.abs(room.y + room.depth - wall.y1) < epsilon;
          if (touchesTop) {
            const nextY = room.y + delta;
            const nextDepth = room.depth - delta;
            if (nextY < 0 || nextDepth < minSize) return prev;
            patches.set(room.id, { y: nextY, depth: nextDepth });
          } else if (touchesBottom) {
            const nextDepth = room.depth + delta;
            if (room.y + nextDepth > lotDepth || nextDepth < minSize) return prev;
            patches.set(room.id, { depth: nextDepth });
          }
        }
      }

      if (!patches.size) return prev;
      return prev.map((room) => patches.has(room.id) ? { ...room, ...patches.get(room.id) } : room);
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
    setOpeningOverrides((prev) => ({
      ...prev,
      [selectedOpening.id]: { x: next.x, y: next.y, type: next.type },
    }));
    pushRoomHistory(before);
  };

  const toggleOpeningType = () => {
    if (!selectedOpening) return;
    const before = snapshotEditor();
    const nextType = selectedOpening.type === "door" ? "window" : "door";
    setOpeningOverrides((prev) => ({
      ...prev,
      [selectedOpening.id]: { x: selectedOpening.x, y: selectedOpening.y, type: nextType },
    }));
    pushRoomHistory(before);
  };

  const promoteToProject = async () => {
    let projectConceptId = conceptId;
    if (!projectConceptId) {
      projectConceptId = await saveConcept(6);
      if (!projectConceptId) return;
    }

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

  const generateConceptRender = async () => {
    let renderProjectId = conceptId;
    if (!renderProjectId) {
      renderProjectId = await saveConcept(5);
      if (!renderProjectId) return;
    }

    setRenderError(null);
    setConceptRender((prev) => ({ ...prev, status: "processing", error: undefined }));

    try {
      const svg = document.querySelector<SVGSVGElement>("[data-concept-render-source='true'] svg");
      if (!svg) throw new Error("Não foi possível localizar a volumetria para gerar o render.");

      const originalImage = await svgElementToPngDataUrl(svg);
      const brief = buildConceptRenderBrief({
        lotWidth,
        lotDepth,
        floors,
        desiredArea,
        rooms,
        facade: facadePreferences,
      });

      const response = await fetch("/api/arch/ai-render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          project_id: renderProjectId,
          original_image_url: originalImage,
          mode: "preservar",
          ambiente: "fachada",
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
          const completed = {
            renderId: render_id,
            status: "completed" as const,
            resultImageUrl: data.result_image_url,
            generatedAt: new Date().toISOString(),
          };
          setConceptRender(completed);

          const payload = {
            title: "Meu pré-projeto",
            status: "draft",
            currentStep: 5,
            lot: { width: lotWidth, depth: lotDepth },
            configuration: { floors, desiredArea, typology, layoutPreferences, customWalls },
            rooms,
            openingOverrides,
            facadePreferences,
            conceptRender: completed,
            selectedVariant: layoutVariant,
          };
          if (renderProjectId) {
            await fetch(`/api/arch/concept-projects/${renderProjectId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
          }
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

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="border-b bg-background">
        <div className="mx-auto max-w-[1500px] px-4 py-4 sm:px-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-500">
                <Sparkles className="h-4 w-4" />
                Arqdor Concept
              </div>
              <h1 className="mt-1 text-2xl font-bold">Monte a ideia da sua casa</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Você escolhe ambientes, medidas e prioridades. O sistema organiza paredes e posições.
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

      <main className="mx-auto max-w-[1500px] p-4 sm:p-6">
        {step === 0 && (
          <section className="mx-auto max-w-3xl rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-3">
              <Trees className="h-7 w-7 text-orange-500" />
              <div>
                <h2 className="text-xl font-semibold">1. Seu terreno</h2>
                <p className="text-sm text-muted-foreground">Começamos pelas dimensões básicas.</p>
              </div>
            </div>
            <div className="mt-7 grid gap-5 sm:grid-cols-2">
              <label className="space-y-2 text-sm font-medium">
                Largura do terreno
                <div className="flex items-center rounded-xl border bg-background px-3">
                  <input className="h-12 w-full bg-transparent outline-none" type="number" min={5} value={lotWidth} onChange={(e) => setLotWidth(Math.max(5, Number(e.target.value) || 5))} />
                  <span className="text-muted-foreground">m</span>
                </div>
              </label>
              <label className="space-y-2 text-sm font-medium">
                Comprimento
                <div className="flex items-center rounded-xl border bg-background px-3">
                  <input className="h-12 w-full bg-transparent outline-none" type="number" min={10} value={lotDepth} onChange={(e) => setLotDepth(Math.max(10, Number(e.target.value) || 10))} />
                  <span className="text-muted-foreground">m</span>
                </div>
              </label>
            </div>
            <div className="mt-5 rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">
              Primeira versão: terreno retangular. Depois entram esquina, irregular, aclive/declive e leitura de levantamento.
            </div>
          </section>
        )}

        {step === 1 && (
          <section className="mx-auto max-w-5xl rounded-3xl border bg-card p-5 shadow-sm sm:p-8">
            <div className="flex items-center gap-3">
              <Home className="h-7 w-7 text-orange-500" />
              <div>
                <h2 className="text-xl font-semibold">2. Escolha uma tipologia de partida</h2>
                <p className="text-sm text-muted-foreground">Você não começa do zero. Escolha uma casa-base coerente e personalize depois.</p>
              </div>
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {CONCEPT_TYPOLOGIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => applyTypology(item.id)}
                  className={typology === item.id
                    ? "rounded-2xl border border-orange-500 bg-orange-500/5 p-5 text-left ring-2 ring-orange-500/10"
                    : "rounded-2xl border p-5 text-left transition hover:border-slate-400 hover:bg-muted/30"}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{item.title}</div>
                      <div className="mt-1 text-xs leading-5 text-muted-foreground">{item.subtitle}</div>
                    </div>
                    <Layers3 className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <div className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span className="rounded-full bg-muted px-2 py-1">{item.floors === 1 ? "Térrea" : "Sobrado"}</span>
                    <span className="rounded-full bg-muted px-2 py-1">≈ {item.suggestedArea} m²</span>
                    <span className="rounded-full bg-muted px-2 py-1">{item.rooms.length} ambientes</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-6 grid gap-4 rounded-2xl border bg-muted/25 p-4 sm:grid-cols-[1fr_auto] sm:items-end">
              <label className="block space-y-2 text-sm font-medium">
                Área aproximada desejada
                <div className="flex items-center rounded-xl border bg-background px-3">
                  <input
                    className="h-12 w-full bg-transparent outline-none"
                    type="number"
                    min={40}
                    value={desiredArea}
                    onChange={(e) => setDesiredArea(Math.max(40, Number(e.target.value) || 40))}
                  />
                  <span className="text-muted-foreground">m²</span>
                </div>
              </label>
              <div className="rounded-xl bg-background px-4 py-3 text-xs text-muted-foreground">
                A tipologia define a lógica inicial; medidas e ambientes continuam editáveis.
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
                  <button key={kind} type="button" onClick={() => addRoom(kind)} className="flex items-center justify-between rounded-xl border px-3 py-3 text-left text-sm hover:bg-muted">
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
          <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-background px-4 py-3">
              <div>
                <div className="text-sm font-semibold">Editor do pré-projeto</div>
                <div className="text-xs text-muted-foreground">Edite a mesma casa em planta, fachada e render sem sair do workspace.</div>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex rounded-xl border bg-muted/40 p-1">
                  {([
                    ["plan", "2D"],
                    ["facade", "Fachada"],
                    ["render", "Render"],
                  ] as const).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setEditorView(value)}
                      className={editorView === value
                        ? "rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background"
                        : "rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground"}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={undoRooms}
                  disabled={!roomHistory.length}
                  title="Desfazer"
                  className="grid h-9 w-9 place-items-center rounded-xl border bg-background disabled:opacity-35"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={redoRooms}
                  disabled={!roomFuture.length}
                  title="Refazer"
                  className="grid h-9 w-9 place-items-center rounded-xl border bg-background disabled:opacity-35"
                >
                  <RotateCw className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void saveConcept(4)}
                  className="rounded-xl border bg-background px-3 py-2 text-xs font-semibold"
                >
                  {saveState === "saving" ? "Salvando..." : "Salvar"}
                </button>
              </div>
            </div>

            <div
              data-concept-render-source="true"
              className="fixed -left-[9999px] top-0 h-[650px] w-[900px] overflow-hidden"
              aria-hidden="true"
            >
              <ConceptFacadeElevation rooms={rooms} floors={floors} lotWidth={lotWidth} facade={facadePreferences} />
            </div>

            <div className="grid min-h-[720px] xl:grid-cols-[220px_1fr_300px]">
              <aside className="order-3 border-t bg-muted/20 p-3 xl:order-1 xl:border-r xl:border-t-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Construção</div>
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-1">
                  {([
                    ["sala", "Sala"],
                    ["cozinha", "Cozinha"],
                    ["quarto", "Quarto"],
                    ["suite", "Suíte"],
                    ["banheiro", "Banheiro"],
                    ["lavanderia", "Lavanderia"],
                    ["gourmet", "Gourmet"],
                    ["garagem", "Garagem"],
                    ["escada", "Escada"],
                    ["piscina", "Piscina"],
                  ] as Array<[RoomKind, string]>).map(([kind, label]) => (
                    <button
                      key={kind}
                      type="button"
                      onClick={() => addRoom(kind)}
                      className="flex items-center justify-between rounded-xl border bg-background px-3 py-2.5 text-left text-sm font-medium hover:bg-muted"
                    >
                      <span>{label}</span>
                      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
                    </button>
                  ))}
                </div>

                <div className="mt-5 border-t pt-4">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Pavimentos</div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Array.from({ length: floors }).map((_, floor) => (
                      <button
                        key={floor}
                        type="button"
                        onClick={() => { setActiveFloor(floor); setSelectedId(null); setEditorView("plan"); }}
                        className={activeFloor === floor
                          ? "rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background"
                          : "rounded-lg border bg-background px-3 py-2 text-xs font-semibold"}
                      >
                        {floor === 0 ? "Térreo" : floor === 1 ? "Superior" : `Pav. ${floor + 1}`}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5 hidden border-t pt-4 xl:block">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Ambientes</div>
                  <div className="mt-2 max-h-72 space-y-1.5 overflow-auto">
                    {visibleRooms.map((room) => (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => { setSelectedId(room.id); setEditorView("plan"); }}
                        className={selectedId === room.id
                          ? "w-full rounded-lg border border-orange-500 bg-orange-500/5 px-3 py-2 text-left"
                          : "w-full rounded-lg border bg-background px-3 py-2 text-left"}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs font-semibold">{room.label}</span>
                          {room.locked && <Lock className="h-3 w-3 shrink-0" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </aside>

              <div className="order-1 min-w-0 bg-slate-100/60 p-3 sm:p-5 xl:order-2">
                <div className="mx-auto max-w-5xl">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold">
                        {editorView === "plan"
                          ? `Planta 2D — ${activeFloor === 0 ? "Térreo" : activeFloor === 1 ? "Superior" : `Pavimento ${activeFloor + 1}`}`
                          : editorView === "facade"
                            ? "Fachada conceitual"
                            : "Render conceitual"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {editorView === "plan"
                          ? "Arraste para mover. Use as alças laranja nas bordas e cantos para ajustar o ambiente."
                          : editorView === "facade"
                            ? "A fachada nasce da mesma implantação e das preferências do projeto."
                            : "Visualização fotorrealista vinculada ao mesmo pré-projeto."}
                      </div>
                    </div>
                    {editorView === "plan" && (
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex rounded-lg border bg-background p-1">
                          <button
                            type="button"
                            onClick={() => { setInteractionMode("room"); setSelectedOpeningId(null); setSelectedWallId(null); setSelectedCustomWallId(null); }}
                            className={interactionMode === "room"
                              ? "rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
                              : "rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground"}
                          >
                            Ambientes
                          </button>
                          <button
                            type="button"
                            onClick={() => { setInteractionMode("wall"); setSelectedId(null); setSelectedOpeningId(null); }}
                            className={interactionMode === "wall"
                              ? "rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
                              : "rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground"}
                          >
                            Paredes
                          </button>
                          <button
                            type="button"
                            onClick={() => { setInteractionMode("draw-wall"); setSelectedId(null); setSelectedWallId(null); setSelectedCustomWallId(null); setSelectedOpeningId(null); }}
                            className={interactionMode === "draw-wall"
                              ? "rounded-md bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white"
                              : "rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground"}
                          >
                            Desenhar parede
                          </button>
                          <button
                            type="button"
                            onClick={() => { setInteractionMode("opening"); setSelectedId(null); setSelectedWallId(null); setSelectedCustomWallId(null); }}
                            className={interactionMode === "opening"
                              ? "rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
                              : "rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground"}
                          >
                            Portas e janelas
                          </button>
                        </div>
                        {[
                          ["A", "Social"],
                          ["B", "Privacidade"],
                          ["C", "Lazer"],
                        ].map(([label, subtitle], index) => (
                          <button
                            key={label}
                            type="button"
                            onClick={() => organize(index)}
                            className={layoutVariant === index
                              ? "rounded-lg border border-orange-500 bg-orange-500/5 px-3 py-2 text-xs font-semibold"
                              : "rounded-lg border bg-background px-3 py-2 text-xs font-semibold"}
                          >
                            {label} · {subtitle}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {editorView === "plan" && (
                    <>
                      <ConceptPlan2D
                        rooms={visibleRooms}
                        lotWidth={lotWidth}
                        lotDepth={lotDepth}
                        activeFloor={activeFloor}
                        geometry={geometry}
                        selectedId={selectedId}
                        onSelect={(roomId) => {
                          setSelectedId(roomId);
                          setSelectedOpeningId(null);
                        }}
                        onRoomChange={updateRoomById}
                        selectedOpeningId={selectedOpeningId}
                        onSelectOpening={(openingId) => {
                          setSelectedOpeningId(openingId);
                          setSelectedId(null);
                        }}
                        onOpeningChange={updateOpeningById}
                        selectedWallId={selectedWallId}
                        onSelectWall={(wallId) => {
                          setSelectedWallId(wallId);
                          setSelectedId(null);
                          setSelectedOpeningId(null);
                        }}
                        onWallMove={moveWallById}
                        customWalls={customWalls.filter((wall) => wall.floor === activeFloor)}
                        selectedCustomWallId={selectedCustomWallId}
                        onCreateCustomWall={addCustomWall}
                        onSelectCustomWall={(wallId) => {
                          setSelectedCustomWallId(wallId);
                          setSelectedWallId(null);
                          setSelectedId(null);
                          setSelectedOpeningId(null);
                        }}
                        onDeleteCustomWall={deleteCustomWall}
                        onUpdateCustomWall={updateCustomWall}
                        onEditStart={beginRoomEdit}
                        onEditEnd={endRoomEdit}
                        interactionMode={interactionMode}
                      />
                      <div className="mt-3 rounded-xl border bg-background/90 px-3 py-2 text-[11px] text-muted-foreground">
                        {interactionMode === "room"
                          ? "Ambientes: arraste para mover · 8 alças laranja ajustam o perímetro · snap magnético + grade de 25 cm."
                          : interactionMode === "wall"
                            ? "Paredes: selecione uma parede existente e arraste perpendicularmente · ambientes dos dois lados acompanham o ajuste."
                            : interactionMode === "draw-wall"
                              ? "Desenhar parede: toque no ponto inicial e depois no ponto final · o editor trava automaticamente em horizontal/vertical e grade de 25 cm."
                              : "Portas e janelas: toque para selecionar e arraste ao longo da parede · ajuste fino de 25 cm nas propriedades."}
                      </div>
                    </>
                  )}

                  {editorView === "facade" && (
                    <div data-concept-render-source="true" className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                      <ConceptFacadeElevation rooms={rooms} floors={floors} lotWidth={lotWidth} facade={facadePreferences} />
                    </div>
                  )}

                  {editorView === "render" && (
                    <div className="rounded-2xl border bg-white p-4 shadow-sm">
                      {conceptRender?.resultImageUrl ? (
                        <img
                          src={conceptRender.resultImageUrl}
                          alt="Render conceitual"
                          className="max-h-[680px] w-full object-contain"
                        />
                      ) : (
                        <div className="grid min-h-[420px] place-items-center text-center">
                          <div>
                            <Sparkles className="mx-auto h-8 w-8 text-orange-500" />
                            <div className="mt-3 font-semibold">Ainda não há render</div>
                            <p className="mt-1 text-sm text-muted-foreground">Gere a imagem sem sair do editor.</p>
                            <button
                              type="button"
                              onClick={() => void generateConceptRender()}
                              disabled={conceptRender?.status === "processing"}
                              className="mt-4 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                            >
                              {conceptRender?.status === "processing" ? "Gerando..." : "Gerar render"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <aside className="order-2 border-t bg-background p-4 xl:order-3 xl:border-l xl:border-t-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Propriedades</div>

                {editorView === "plan" && (
                  <>
                    {interactionMode === "draw-wall" ? (
                      <div className="mt-4 space-y-3">
                        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
                          Toque no primeiro ponto e continue tocando nos próximos pontos. Cada novo segmento parte do anterior, permitindo desenhar contornos em L, U e sequências ortogonais.
                        </div>
                        <button
                          type="button"
                          onClick={() => setInteractionMode("wall")}
                          className="w-full rounded-xl border px-3 py-2.5 text-sm font-semibold"
                        >
                          Finalizar desenho
                        </button>
                      </div>
                    ) : interactionMode === "wall" ? (
                      selectedCustomWall ? (
                        <div className="mt-4 space-y-4">
                          <div className="rounded-xl bg-muted p-3">
                            <div className="font-semibold">Parede livre</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {Math.hypot(selectedCustomWall.x2 - selectedCustomWall.x1, selectedCustomWall.y2 - selectedCustomWall.y1).toFixed(2)} m · espessura {((selectedCustomWall.thickness ?? 0.15) * 100).toFixed(0)} cm
                            </div>
                          </div>
                          <label className="block text-xs font-semibold">
                            Espessura
                            <select
                              value={selectedCustomWall.thickness ?? 0.15}
                              onChange={(event) => updateCustomWall(selectedCustomWall.id, { thickness: Number(event.target.value) })}
                              className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm"
                            >
                              <option value={0.10}>10 cm</option>
                              <option value={0.12}>12 cm</option>
                              <option value={0.15}>15 cm</option>
                              <option value={0.20}>20 cm</option>
                              <option value={0.25}>25 cm</option>
                            </select>
                          </label>
                          <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
                            Arraste os pontos laranja nas extremidades para alterar o comprimento mantendo a parede ortogonal.
                          </div>
                          <button
                            type="button"
                            onClick={() => deleteCustomWall(selectedCustomWall.id)}
                            className="w-full rounded-xl border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-700"
                          >
                            Excluir parede livre
                          </button>
                        </div>
                      ) : !selectedWall ? (
                        <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                          Selecione uma parede derivada dos ambientes ou uma parede livre desenhada na planta.
                        </div>
                      ) : (
                        <div className="mt-4 space-y-4">
                          <div className="rounded-xl bg-muted p-3">
                            <div className="font-semibold">{selectedWall.exterior ? "Parede externa" : "Parede interna"}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              {Math.abs(selectedWall.x1 - selectedWall.x2) < 0.01 ? "Vertical" : "Horizontal"} · {Math.hypot(selectedWall.x2 - selectedWall.x1, selectedWall.y2 - selectedWall.y1).toFixed(2)} m
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => nudgeSelectedWall(-0.25)}
                              className="rounded-xl border px-3 py-2.5 text-sm font-semibold"
                            >
                              − 25 cm
                            </button>
                            <button
                              type="button"
                              onClick={() => nudgeSelectedWall(0.25)}
                              className="rounded-xl border px-3 py-2.5 text-sm font-semibold"
                            >
                              + 25 cm
                            </button>
                          </div>
                          <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
                            {selectedWall.roomIds.length > 1
                              ? "Parede compartilhada: os ambientes dos dois lados são ajustados juntos."
                              : "Parede de perímetro: o contorno do ambiente é ajustado dentro do terreno."}
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedWallId(null)}
                            className="w-full rounded-xl border px-3 py-2.5 text-sm font-semibold text-muted-foreground"
                          >
                            Fechar seleção
                          </button>
                        </div>
                      )
                    ) : interactionMode === "opening" ? (
                      !selectedOpening ? (
                        <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                          Selecione uma porta ou janela na planta para mover ou alterar o tipo.
                        </div>
                      ) : (
                        <div className="mt-4 space-y-4">
                          <div className="rounded-xl bg-muted p-3">
                            <div className="font-semibold">{selectedOpening.type === "door" ? "Porta" : "Janela"}</div>
                            <div className="mt-1 text-xs text-muted-foreground">
                              Arraste na planta ou use o ajuste fino abaixo.
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => moveOpening(-0.25)}
                              className="rounded-xl border px-3 py-2.5 text-sm font-semibold"
                            >
                              − 25 cm
                            </button>
                            <button
                              type="button"
                              onClick={() => moveOpening(0.25)}
                              className="rounded-xl border px-3 py-2.5 text-sm font-semibold"
                            >
                              + 25 cm
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={toggleOpeningType}
                            className="w-full rounded-xl border px-3 py-2.5 text-sm font-semibold"
                          >
                            Trocar para {selectedOpening.type === "door" ? "janela" : "porta"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedOpeningId(null)}
                            className="w-full rounded-xl border px-3 py-2.5 text-sm font-semibold text-muted-foreground"
                          >
                            Fechar seleção
                          </button>
                        </div>
                      )
                    ) : !selected ? (
                      <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                        Selecione um ambiente na planta para editar medidas, posição e bloqueio.
                      </div>
                    ) : (
                      <div className="mt-4 space-y-4">
                        <div className="rounded-xl bg-muted p-3">
                          <div className="font-semibold">{selected.label}</div>
                          <div className="mt-1 text-xs text-muted-foreground">{(selected.width * selected.depth).toFixed(1)} m²</div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="text-xs font-medium">Largura
                            <input type="number" step="0.1" value={selected.width} onChange={(e) => updateSelected({ width: Math.max(1, Number(e.target.value) || 1) })} className="mt-1 h-10 w-full rounded-lg border px-2" />
                          </label>
                          <label className="text-xs font-medium">Profundidade
                            <input type="number" step="0.1" value={selected.depth} onChange={(e) => updateSelected({ depth: Math.max(1, Number(e.target.value) || 1) })} className="mt-1 h-10 w-full rounded-lg border px-2" />
                          </label>
                          <label className="text-xs font-medium">X
                            <input type="number" step="0.25" value={selected.x} onChange={(e) => updateSelected({ x: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 h-10 w-full rounded-lg border px-2" />
                          </label>
                          <label className="text-xs font-medium">Y
                            <input type="number" step="0.25" value={selected.y} onChange={(e) => updateSelected({ y: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 h-10 w-full rounded-lg border px-2" />
                          </label>
                        </div>
                        <div>
                          <div className="mb-2 text-xs font-semibold text-muted-foreground">Mover 25 cm</div>
                          <div className="grid grid-cols-3 gap-2">
                            <span />
                            <button type="button" disabled={selected.locked} onClick={() => swapPosition(selected, "up")} className="rounded-lg border py-2 text-sm disabled:opacity-40">↑</button>
                            <span />
                            <button type="button" disabled={selected.locked} onClick={() => swapPosition(selected, "left")} className="rounded-lg border py-2 text-sm disabled:opacity-40">←</button>
                            <button type="button" disabled={selected.locked} onClick={() => swapPosition(selected, "down")} className="rounded-lg border py-2 text-sm disabled:opacity-40">↓</button>
                            <button type="button" disabled={selected.locked} onClick={() => swapPosition(selected, "right")} className="rounded-lg border py-2 text-sm disabled:opacity-40">→</button>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateSelected({ locked: !selected.locked })}
                          className="flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold"
                        >
                          <Lock className="h-4 w-4" /> {selected.locked ? "Desbloquear" : "Bloquear posição"}
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={duplicateSelectedRoom}
                            disabled={SINGLETON_ROOM_KINDS.has(selected.kind)}
                            className="rounded-xl border px-3 py-2.5 text-sm font-semibold disabled:opacity-40"
                          >
                            Duplicar
                          </button>
                          <button
                            type="button"
                            onClick={deleteSelectedRoom}
                            className="rounded-xl border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-700"
                          >
                            Excluir
                          </button>
                        </div>
                      </div>
                    )}

                    {interactionMode === "room" && (
                    <div className="mt-5 border-t pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-semibold">Validação</div>
                        <span className={layoutIssues.some((issue) => issue.severity === "error")
                          ? "rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700"
                          : layoutIssues.length
                            ? "rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700"
                            : "rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700"}>
                          {layoutIssues.some((issue) => issue.severity === "error") ? "Corrigir" : layoutIssues.length ? "Atenção" : "OK"}
                        </span>
                      </div>
                      <div className="mt-3 space-y-2">
                        {layoutIssues.slice(0, 5).map((issue) => (
                          <button
                            key={issue.id}
                            type="button"
                            onClick={() => issue.roomId && setSelectedId(issue.roomId)}
                            className={issue.severity === "error"
                              ? "block w-full rounded-lg bg-red-50 px-3 py-2 text-left text-xs text-red-800"
                              : "block w-full rounded-lg bg-amber-50 px-3 py-2 text-left text-xs text-amber-800"}
                          >
                            {issue.message}
                          </button>
                        ))}
                        {layoutIssues.length === 0 && <div className="text-xs text-emerald-700">Sem conflitos básicos detectados.</div>}
                      </div>
                    </div>
                    )}
                  </>
                )}

                {editorView === "facade" && (
                  <div className="mt-4 space-y-4">
                    <label className="block text-xs font-semibold">Estilo
                      <select
                        value={facadePreferences.style}
                        onChange={(event) => setFacadePreferences((prev) => ({ ...prev, style: event.target.value as ConceptFacadePreferences["style"] }))}
                        className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm"
                      >
                        <option value="contemporaneo">Contemporâneo</option>
                        <option value="minimalista">Minimalista</option>
                        <option value="classico_contemporaneo">Clássico contemporâneo</option>
                        <option value="tropical">Tropical</option>
                        <option value="industrial">Industrial</option>
                        <option value="rustico_contemporaneo">Rústico contemporâneo</option>
                      </select>
                    </label>
                    <label className="block text-xs font-semibold">Cobertura
                      <select
                        value={facadePreferences.roof}
                        onChange={(event) => setFacadePreferences((prev) => ({ ...prev, roof: event.target.value as ConceptFacadePreferences["roof"] }))}
                        className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm"
                      >
                        <option value="platibanda">Platibanda</option>
                        <option value="aparente">Telhado aparente</option>
                        <option value="misto">Misto</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => setStep(5)}
                      className="w-full rounded-xl bg-foreground px-4 py-3 text-sm font-semibold text-background"
                    >
                      Abrir ajustes completos de fachada
                    </button>
                  </div>
                )}

                {editorView === "render" && (
                  <div className="mt-4 space-y-3">
                    <button
                      type="button"
                      onClick={() => void generateConceptRender()}
                      disabled={conceptRender?.status === "processing"}
                      className="w-full rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {conceptRender?.status === "processing"
                        ? "Gerando render..."
                        : conceptRender?.resultImageUrl
                          ? "Gerar nova versão"
                          : "Gerar render"}
                    </button>
                    {renderError && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{renderError}</div>}
                  </div>
                )}
              </aside>
            </div>
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
                <ConceptFacadeElevation
                  rooms={rooms}
                  floors={floors}
                  lotWidth={lotWidth}
                  facade={facadePreferences}
                />
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
                    onClick={() => void generateConceptRender()}
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
                      <p className="text-xs text-muted-foreground">Elevação frontal derivada da tipologia e das preferências aprovadas.</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Conceitual</span>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-2xl border bg-slate-50">
                    <ConceptFacadeElevation rooms={rooms} floors={floors} lotWidth={lotWidth} facade={facadePreferences} />
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
                      ["Ambientes", String(rooms.length)],
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
                    {rooms.map((room) => (
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
                        onChange={(event) => setCustomerProfile((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Nome do cliente"
                        className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      WhatsApp / telefone
                      <input
                        value={customerProfile.phone ?? ""}
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
                        onChange={(event) => setCustomerProfile((prev) => ({ ...prev, email: event.target.value }))}
                        placeholder="cliente@email.com"
                        className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm outline-none"
                      />
                    </label>
                    <label className="text-xs font-semibold">
                      Faixa de investimento
                      <select
                        value={customerProfile.budgetRange ?? ""}
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

        <div className="mx-auto mt-6 flex max-w-4xl items-center justify-between gap-3">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep(step >= 6 ? 4 : step >= 4 ? 1 : 0)}
            className="inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-3 text-sm font-semibold disabled:opacity-40"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          {step < 6 ? (
            <button
              type="button"
              onClick={() => {
                const nextStep = step === 0 ? 1 : step === 1 ? 4 : 6;
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
              {step === 1 ? "Abrir editor" : step === 4 ? "Ver resultado" : "Continuar"} <ArrowRight className="h-4 w-4" />
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
      </main>
    </div>
  );
}
