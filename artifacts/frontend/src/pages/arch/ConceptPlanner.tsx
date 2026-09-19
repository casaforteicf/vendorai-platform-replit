import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
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
import { buildConceptGeometry, nudgeOpening } from "./conceptGeometry";
import { type ConceptFacadePreferences } from "./ConceptVolumetry";
import ConceptPlan2D from "./ConceptPlan2D";
import ConceptDerivedFacade from "./ConceptDerivedFacade";
import ConceptModel3D from "./ConceptModel3D";
import { buildTypologyRooms, CONCEPT_TYPOLOGIES, DEFAULT_LAYOUT_PREFERENCES, type ConceptTypology, type LayoutPreferences, type LayoutPreferenceKey } from "./conceptTemplates";
import { generateTypologyLayout } from "./conceptTypologyLayout";
import { buildConceptRenderBrief, svgElementToPngDataUrl } from "./conceptRender";
import { buildOrthogonalWallTopology, detectClosedSpaces, type WallTopologyEndpointRef } from "./conceptWallNetwork";
import {
  OPENING_FRAME_MATERIAL_OPTIONS,
  OPENING_GLASS_TYPE_OPTIONS,
  OPENING_PRESETS,
  OPENING_STYLE_OPTIONS,
  defaultOpeningParameters,
  normalizeOpeningParameters,
  openingStyleSupportsSwing,
  parametersFromOpeningPreset,
  type OpeningParameters,
} from "./conceptOpenings";
import {
  buildStairSlabOpenings,
  normalizeStairParameters,
  riserCountForTargetHeight,
  stairFootprintMetrics,
} from "./conceptStairs";
import { defaultRoofParameters, normalizeRoofParameters, type RoofWaterCount } from "./conceptRoof";
import {
  CONCEPT_OBJECT_CATEGORIES,
  CONCEPT_OBJECT_PRESETS,
  createConceptObjectFromPreset,
  normalizeConceptObject,
  objectCategoryLabel,
  type ConceptObject,
} from "./conceptObjects";
import {
  validateArchitecturalConcept,
  type ArchitecturalIssue,
  type ArchitecturalValidationCategory,
} from "./conceptValidation";
import {
  CONCEPT_MATERIAL_LIBRARY,
  conceptFloorMaterial,
  conceptMaterialSchemeFromLegacyFacade,
  defaultConceptMaterialScheme,
  legacyFacadePrimaryMaterial,
  materialFromLibrary,
  materialOptionsFor,
  normalizeConceptMaterialScheme,
  type ConceptMaterialRef,
  type ConceptMaterialScheme,
} from "./conceptMaterials";
import {
  SINGLETON_ROOM_KINDS,
  autoArrange,
  buildConceptPersistencePayload,
  cloneEditorSnapshot as cloneSnapshot,
  conceptUid as uid,
  createRoom,
  customOpeningToMarker,
  customWallLength,
  normalizeCustomOpeningForWall,
  normalizeCustomOpeningsForWalls,
  normalizeDraftRooms,
  type ConceptDraftResponse,
  type CustomOpening,
  type CustomWall,
  type CustomerProfile,
  type EditorSnapshot,
  type OpeningOverride,
  type Room,
  type RoomKind,
  type SpaceProfile,
} from "./conceptEditorState";
import { buildConceptModelLevels, matchSpaceProfiles } from "./conceptModel";

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

function RoofControls({
  value,
  onChange,
  compact = false,
}: {
  value: ConceptFacadePreferences;
  onChange: (patch: Partial<ConceptFacadePreferences>) => void;
  compact?: boolean;
}) {
  const roof = normalizeRoofParameters(value);
  const patchRoof = (patch: Partial<ConceptFacadePreferences>) => {
    onChange(normalizeRoofParameters({ ...value, ...patch }));
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4 rounded-2xl border bg-muted/20 p-4"}>
      <label className="block text-xs font-semibold">
        Tipo de cobertura
        <select
          value={roof.roof}
          onChange={(event) => patchRoof({ roof: event.target.value as ConceptFacadePreferences["roof"] })}
          className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm"
        >
          <option value="platibanda">Platibanda</option>
          <option value="aparente">Telhado aparente</option>
          <option value="misto">Misto</option>
        </select>
      </label>

      {roof.roof === "platibanda" ? (
        <label className="block text-xs font-semibold">
          Altura da platibanda
          <div className="mt-1 flex items-center rounded-xl border bg-background px-3">
            <input
              type="number"
              min="0.25"
              max="1.5"
              step="0.05"
              value={roof.roofParapetHeight}
              onChange={(event) => patchRoof({ roofParapetHeight: Number(event.target.value) })}
              className="h-10 w-full bg-transparent outline-none"
            />
            <span className="text-xs text-muted-foreground">m</span>
          </div>
        </label>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold">
              Águas
              <select
                value={roof.roofWaters}
                onChange={(event) => patchRoof({ roofWaters: Number(event.target.value) as RoofWaterCount })}
                className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm"
              >
                <option value={1}>1 água</option>
                <option value={2}>2 águas</option>
                <option value={4}>4 águas</option>
              </select>
            </label>
            <label className="text-xs font-semibold">
              Inclinação
              <div className="mt-1 flex items-center rounded-xl border bg-background px-3">
                <input
                  type="number"
                  min="3"
                  max="55"
                  step="1"
                  value={roof.roofPitchDeg}
                  onChange={(event) => patchRoof({ roofPitchDeg: Number(event.target.value) })}
                  className="h-10 w-full bg-transparent outline-none"
                />
                <span className="text-xs text-muted-foreground">°</span>
              </div>
            </label>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold">
              Beiral
              <div className="mt-1 flex items-center rounded-xl border bg-background px-3">
                <input
                  type="number"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={roof.roofOverhang}
                  onChange={(event) => patchRoof({ roofOverhang: Number(event.target.value) })}
                  className="h-10 w-full bg-transparent outline-none"
                />
                <span className="text-xs text-muted-foreground">m</span>
              </div>
            </label>
            {roof.roofWaters === 1 ? (
              <label className="text-xs font-semibold">
                Sentido da queda
                <select
                  value={roof.roofSlopeDirection}
                  onChange={(event) => patchRoof({ roofSlopeDirection: event.target.value as ConceptFacadePreferences["roofSlopeDirection"] })}
                  className="mt-1 h-10 w-full rounded-xl border bg-background px-2 text-sm"
                >
                  <option value="north">Para cima</option>
                  <option value="south">Para baixo</option>
                  <option value="east">Para direita</option>
                  <option value="west">Para esquerda</option>
                </select>
              </label>
            ) : (
              <label className="text-xs font-semibold">
                Cumeeira
                <select
                  value={roof.roofRidgeOrientation}
                  onChange={(event) => patchRoof({ roofRidgeOrientation: event.target.value as ConceptFacadePreferences["roofRidgeOrientation"] })}
                  className="mt-1 h-10 w-full rounded-xl border bg-background px-2 text-sm"
                >
                  <option value="x">Paralela à fachada</option>
                  <option value="y">Perpendicular à fachada</option>
                </select>
              </label>
            )}
          </div>

          {roof.roof === "misto" && (
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs font-semibold">
                Parte com platibanda
                <div className="mt-1 flex items-center rounded-xl border bg-background px-3">
                  <input
                    type="number"
                    min="20"
                    max="80"
                    step="5"
                    value={Math.round(roof.roofMixedRatio * 100)}
                    onChange={(event) => patchRoof({ roofMixedRatio: Number(event.target.value) / 100 })}
                    className="h-10 w-full bg-transparent outline-none"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </label>
              <label className="text-xs font-semibold">
                Altura da platibanda
                <div className="mt-1 flex items-center rounded-xl border bg-background px-3">
                  <input
                    type="number"
                    min="0.25"
                    max="1.5"
                    step="0.05"
                    value={roof.roofParapetHeight}
                    onChange={(event) => patchRoof({ roofParapetHeight: Number(event.target.value) })}
                    className="h-10 w-full bg-transparent outline-none"
                  />
                  <span className="text-xs text-muted-foreground">m</span>
                </div>
              </label>
            </div>
          )}
        </>
      )}

      <div className="rounded-lg border bg-background px-3 py-2 text-[11px] text-muted-foreground">
        {roof.roof === "platibanda"
          ? `Laje coberta por platibanda de ${roof.roofParapetHeight.toFixed(2)} m.`
          : `${roof.roofWaters} água${roof.roofWaters > 1 ? "s" : ""} · ${roof.roofPitchDeg.toFixed(0)}° · beiral ${roof.roofOverhang.toFixed(2)} m.`}
      </div>
    </div>
  );
}
export default function ConceptPlanner() {
  const { user, tenantOverride, isLoading: authLoading } = useAuth();
  const effectiveTenantId = tenantOverride?.id ?? user?.tenantId ?? "";
  const [step, setStep] = useState(0);
  const [lotWidth, setLotWidth] = useState(12);
  const [lotDepth, setLotDepth] = useState(30);
  const [typology, setTypology] = useState<ConceptTypology>("terrea_3q");
  const [layoutPreferences, setLayoutPreferences] = useState<LayoutPreferences>(DEFAULT_LAYOUT_PREFERENCES);
  const [floors, setFloors] = useState(1);
  const [desiredArea, setDesiredArea] = useState(145);
  const [activeFloor, setActiveFloor] = useState(0);
  const [editorView, setEditorView] = useState<"plan" | "model3d" | "facade" | "render">("plan");
  const [interactionMode, setInteractionMode] = useState<"room" | "space" | "wall" | "opening" | "object" | "draw-wall" | "navigate">("room");
  const [mobilePanel, setMobilePanel] = useState<"closed" | "build" | "properties" | "tools">("closed");
  const [rooms, setRooms] = useState<Room[]>(() => normalizeDraftRooms(buildTypologyRooms("terrea_3q") as Room[]));
  const roomsRef = useRef<Room[]>(rooms);
  const customWallsRef = useRef<CustomWall[]>([]);
  const customOpeningsRef = useRef<CustomOpening[]>([]);
  const objectsRef = useRef<ConceptObject[]>([]);
  const wallFirstFloorsRef = useRef<number[]>([]);
  const openingOverridesRef = useRef<Record<string, OpeningOverride>>({});
  const editStartRef = useRef<EditorSnapshot | null>(null);
  const [roomHistory, setRoomHistory] = useState<EditorSnapshot[]>([]);
  const [roomFuture, setRoomFuture] = useState<EditorSnapshot[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layoutVariant, setLayoutVariant] = useState(0);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [selectedWallId, setSelectedWallId] = useState<string | null>(null);
  const [selectedCustomWallId, setSelectedCustomWallId] = useState<string | null>(null);
  const [selectedClosedSpaceId, setSelectedClosedSpaceId] = useState<string | null>(null);
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [customWalls, setCustomWalls] = useState<CustomWall[]>([]);
  const [customOpenings, setCustomOpenings] = useState<CustomOpening[]>([]);
  const [objects, setObjects] = useState<ConceptObject[]>([]);
  const [materialScheme, setMaterialScheme] = useState<ConceptMaterialScheme>(() => defaultConceptMaterialScheme());
  const [wallFirstFloors, setWallFirstFloors] = useState<number[]>([]);
  const [showDimensions, setShowDimensions] = useState(true);
  const [spaceProfiles, setSpaceProfiles] = useState<SpaceProfile[]>([]);
  const [openingOverrides, setOpeningOverrides] = useState<Record<string, OpeningOverride>>({});
  const [conceptId, setConceptId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "loading" | "saving" | "saved" | "error">("loading");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [customerProfile, setCustomerProfile] = useState<CustomerProfile>({});
  const [facadePreferences, setFacadePreferences] = useState<ConceptFacadePreferences>(DEFAULT_FACADE);
  const [conceptRender, setConceptRender] = useState<ConceptDraftResponse["conceptRender"]>({ status: "idle" });
  const [renderError, setRenderError] = useState<string | null>(null);
  const [archProjetoId, setArchProjetoId] = useState<string | null>(null);
  const [handoffState, setHandoffState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [handoffError, setHandoffError] = useState<string | null>(null);
  const wallFirstActive = wallFirstFloors.includes(activeFloor);
  const resolvedRoof = normalizeRoofParameters(facadePreferences);

  useEffect(() => {
    roomsRef.current = rooms;
  }, [rooms]);

  useEffect(() => {
    setMobilePanel("closed");
  }, [activeFloor, editorView]);

  useEffect(() => {
    customWallsRef.current = customWalls;
  }, [customWalls]);

  useEffect(() => {
    customOpeningsRef.current = customOpenings;
  }, [customOpenings]);

  useEffect(() => {
    objectsRef.current = objects;
  }, [objects]);

  useEffect(() => {
    wallFirstFloorsRef.current = wallFirstFloors;
  }, [wallFirstFloors]);

  useEffect(() => {
    openingOverridesRef.current = openingOverrides;
  }, [openingOverrides]);

  const conceptHeaders = (json = false) => {
    const headers: Record<string, string> = {};
    if (json) headers["Content-Type"] = "application/json";
    if (effectiveTenantId) headers["x-tenant-id"] = effectiveTenantId;
    return headers;
  };

  useEffect(() => {
    if (authLoading) return;

    if (!effectiveTenantId) {
      setSaveState("error");
      setSaveError(user?.platformRole === "super_admin"
        ? "Selecione uma empresa no Super Admin para salvar o pré-projeto."
        : "Sua sessão não possui uma empresa vinculada.");
      return;
    }

    let cancelled = false;

    const loadLatest = async () => {
      try {
        const response = await fetch("/api/arch/concept-projects/latest", {
          headers: conceptHeaders(),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? "Falha ao carregar pré-projeto");
        }
        const draft = (await response.json()) as ConceptDraftResponse | null;
        if (cancelled || !draft) {
          if (!cancelled) {
            setConceptId(null);
            setArchProjetoId(null);
            setHandoffState("idle");
            setSaveState("idle");
            setSaveError(null);
          }
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
        setWallFirstFloors(Array.isArray(draft.configuration?.wallFirstFloors) ? draft.configuration.wallFirstFloors : []);
        setShowDimensions(draft.configuration?.showDimensions ?? true);
        const loadedCustomWalls = Array.isArray(draft.configuration?.customWalls)
          ? draft.configuration.customWalls
          : [];
        const loadedCustomOpenings = Array.isArray(draft.configuration?.customOpenings)
          ? normalizeCustomOpeningsForWalls(draft.configuration.customOpenings, loadedCustomWalls)
          : [];
        setCustomWalls(loadedCustomWalls);
        setCustomOpenings(loadedCustomOpenings);
        setSpaceProfiles(Array.isArray(draft.configuration?.spaceProfiles) ? draft.configuration.spaceProfiles : []);
        const loadedLotWidth = draft.lot?.width ?? 12;
        const loadedLotDepth = draft.lot?.depth ?? 30;
        setObjects(
          Array.isArray(draft.configuration?.objects)
            ? draft.configuration.objects.map((object) => normalizeConceptObject(object, loadedLotWidth, loadedLotDepth))
            : []
        );
        const loadedMaterialScheme = draft.configuration?.materials
          ? normalizeConceptMaterialScheme(draft.configuration.materials)
          : conceptMaterialSchemeFromLegacyFacade(draft.facadePreferences?.primaryMaterial);
        setMaterialScheme(loadedMaterialScheme);
        setRooms(Array.isArray(draft.rooms) && draft.rooms.length ? normalizeDraftRooms(draft.rooms) : []);
        setOpeningOverrides(draft.openingOverrides ?? {});
        setCustomerProfile(draft.customerProfile ?? {});
        const loadedFacade = { ...DEFAULT_FACADE, ...(draft.facadePreferences ?? {}) };
        setFacadePreferences({ ...loadedFacade, ...normalizeRoofParameters(loadedFacade) });
        setConceptRender(draft.conceptRender ?? { status: "idle" });
        setLayoutVariant(draft.selectedVariant ?? 0);
        setSaveState("saved");
        setSaveError(null);
      } catch (error) {
        if (!cancelled) {
          setSaveState("error");
          setSaveError(error instanceof Error ? error.message : "Não foi possível carregar o pré-projeto.");
        }
      }
    };

    void loadLatest();
    return () => {
      cancelled = true;
    };
  }, [authLoading, effectiveTenantId]);

  const buildConceptPayload = (
    currentStep: number,
    renderState: ConceptDraftResponse["conceptRender"] = conceptRender,
  ) => buildConceptPersistencePayload({
    currentStep,
    renderState,
    floors,
    desiredArea,
    typology,
    layoutPreferences,
    wallFirstFloors,
    showDimensions,
    customWalls,
    customOpenings,
    spaceProfiles,
    objects,
    materialScheme,
    rooms,
    openingOverrides,
    customerProfile,
    facadePreferences,
    selectedVariant: layoutVariant,
    lotWidth,
    lotDepth,
  });

  const saveConcept = async (stepOverride?: number) => {
    if (!effectiveTenantId) {
      setSaveState("error");
      setSaveError(user?.platformRole === "super_admin"
        ? "Selecione uma empresa no Super Admin para salvar o pré-projeto."
        : "Sua sessão não possui uma empresa vinculada.");
      return null;
    }

    setSaveState("saving");
    setSaveError(null);
    const payload = buildConceptPayload(stepOverride ?? step);

    try {
      const response = await fetch(
        conceptId ? `/api/arch/concept-projects/${conceptId}` : "/api/arch/concept-projects",
        {
          method: conceptId ? "PATCH" : "POST",
          headers: conceptHeaders(true),
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Falha ao salvar pré-projeto");
      }
      const saved = (await response.json()) as ConceptDraftResponse;
      setConceptId(saved.id);
      setSaveState("saved");
      setSaveError(null);
      return saved.id;
    } catch (error) {
      setSaveState("error");
      setSaveError(error instanceof Error ? error.message : "Não foi possível salvar o pré-projeto.");
      return null;
    }
  };

  const selected = rooms.find((r) => r.id === selectedId) ?? null;
  const selectedObject = objects.find((object) => object.id === selectedObjectId) ?? null;
  const visibleRooms = wallFirstActive ? [] : rooms.filter((r) => r.floor === activeFloor);
  const visibleObjects = objects.filter((object) => object.floor === activeFloor);
  const activeFloorMaterial = conceptFloorMaterial(materialScheme, activeFloor);

  const updateMaterialSurface = (
    surface: "floor" | "interiorWall" | "exteriorWall" | "roof" | "stair",
    materialId: string,
  ) => {
    const selectedLibraryMaterial = CONCEPT_MATERIAL_LIBRARY.find((material) => material.id === materialId);
    if (!selectedLibraryMaterial) return;

    if (surface === "exteriorWall") {
      setFacadePreferences((currentFacade) => ({
        ...currentFacade,
        primaryMaterial: legacyFacadePrimaryMaterial(selectedLibraryMaterial),
      }));
    }

    setMaterialScheme((current) => {
      const normalized = normalizeConceptMaterialScheme(current);
      if (surface === "floor") {
        return {
          ...normalized,
          floorByLevel: {
            ...normalized.floorByLevel,
            [String(activeFloor)]: materialFromLibrary(materialId, conceptFloorMaterial(normalized, activeFloor)),
          },
        };
      }

      return {
        ...normalized,
        [surface]: materialFromLibrary(materialId, normalized[surface]),
      };
    });
  };

  const materialSelect = (
    label: string,
    surface: "floor" | "interiorWall" | "exteriorWall" | "roof" | "stair",
    value: ConceptMaterialRef,
  ) => (
    <label className="block text-xs font-semibold">
      {label}
      <div className="mt-1 flex items-center gap-2">
        <span
          className="h-9 w-9 shrink-0 rounded-lg border shadow-inner"
          style={{ backgroundColor: value.color }}
          title={value.name}
        />
        <select
          value={value.id}
          onChange={(event) => updateMaterialSurface(surface, event.target.value)}
          className="h-10 min-w-0 flex-1 rounded-xl border bg-background px-3 text-xs"
        >
          {materialOptionsFor(surface).map((material) => (
            <option key={material.id} value={material.id}>
              {material.name}{material.finish ? ` · ${material.finish}` : ""}
            </option>
          ))}
        </select>
      </div>
    </label>
  );

  const currentArea = useMemo(() => {
    const legacyArea = rooms
      .filter((room) => room.kind !== "piscina" && !wallFirstFloors.includes(room.floor))
      .reduce((sum, room) => sum + room.width * room.depth, 0);
    const wallFirstArea = wallFirstFloors.reduce((sum, floor) => {
      const floorWalls = customWalls
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
  }, [rooms, wallFirstFloors, customWalls, lotWidth, lotDepth]);

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
    setObjects([]);
    setSelectedObjectId(null);
    setSpaceProfiles([]);
    setRooms(normalizeDraftRooms(nextRooms));
  };

  const toggleLayoutPreference = (key: LayoutPreferenceKey) => {
    setLayoutPreferences((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const snapshotEditor = (): EditorSnapshot => ({
    rooms: roomsRef.current.map((room) => ({ ...room })),
    customWalls: customWallsRef.current.map((wall) => ({ ...wall })),
    customOpenings: customOpeningsRef.current.map((opening) => ({ ...opening })),
    objects: objectsRef.current.map((object) => ({ ...object })),
    wallFirstFloors: [...wallFirstFloorsRef.current],
    openingOverrides: Object.fromEntries(
      Object.entries(openingOverridesRef.current).map(([key, value]) => [key, { ...value }]),
    ),
  });

  const cloneSnapshot = (snapshot: EditorSnapshot): EditorSnapshot => ({
    rooms: snapshot.rooms.map((room) => ({ ...room })),
    customWalls: snapshot.customWalls.map((wall) => ({ ...wall })),
    customOpenings: snapshot.customOpenings.map((opening) => ({ ...opening })),
    objects: snapshot.objects.map((object) => ({ ...object })),
    wallFirstFloors: [...snapshot.wallFirstFloors],
    openingOverrides: Object.fromEntries(
      Object.entries(snapshot.openingOverrides).map(([key, value]) => [key, { ...value }]),
    ),
  });

  const restoreSnapshot = (snapshot: EditorSnapshot) => {
    const cloned = cloneSnapshot(snapshot);
    setRooms(cloned.rooms);
    setCustomWalls(cloned.customWalls);
    setCustomOpenings(cloned.customOpenings);
    setObjects(cloned.objects);
    setWallFirstFloors(cloned.wallFirstFloors);
    setOpeningOverrides(cloned.openingOverrides);
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

  const setStairFloorToFloorHeight = (roomId: string, rawHeight: number) => {
    if (!Number.isFinite(rawHeight)) return;
    const source = rooms.find((room) => room.id === roomId && room.kind === "escada");
    if (!source) return;
    const height = normalizeStairParameters({
      ...source,
      stairFloorToFloorHeight: rawHeight,
    }).stairFloorToFloorHeight;
    setRooms((prev) => prev.map((room) =>
      room.kind === "escada" && room.floor === source.floor
        ? { ...room, stairFloorToFloorHeight: height }
        : room
    ));
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
    const custom = customOpenings.find((opening) => opening.id === openingId);
    if (custom) {
      const wall = customWalls.find((item) => item.id === custom.wallId);
      if (!wall) return;
      const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
      const start = horizontal ? wall.x1 : wall.y1;
      const end = horizontal ? wall.x2 : wall.y2;
      const current = horizontal ? patch.x : patch.y;
      const denominator = end - start;
      const rawOffset = Math.abs(denominator) < 0.001
        ? custom.offset
        : (current - start) / denominator;

      setCustomOpenings((prev) => prev.map((opening) =>
        opening.id === openingId
          ? normalizeCustomOpeningForWall(opening, wall, {
              offset: rawOffset,
              type: patch.type,
            })
          : opening
      ));
      return;
    }

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
  const activateWallFirstFloor = () => {
    if (wallFirstActive) return;
    const before = snapshotEditor();
    const floorRooms = rooms.filter((room) => room.floor === activeFloor && room.kind !== "piscina");
    const existingWalls = customWalls.filter((wall) => wall.floor === activeFloor);
    const otherWalls = customWalls.filter((wall) => wall.floor !== activeFloor);

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

    const existingOpenings = customOpenings.filter((opening) => opening.floor === activeFloor);
    const otherOpenings = customOpenings.filter((opening) => opening.floor !== activeFloor);
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
        ...defaultOpeningParameters(source.type),
      });
    }

    const derivedSpaces = detectClosedSpaces(floorWalls, lotWidth, lotDepth);
    const existingProfiles = spaceProfiles.filter((profile) => profile.floor === activeFloor);
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
        ...prev.filter((profile) => profile.floor !== activeFloor),
        ...seededProfiles,
      ]);
    }

    setCustomWalls([...otherWalls, ...floorWalls]);
    setCustomOpenings([...otherOpenings, ...existingOpenings, ...importedOpenings]);
    setWallFirstFloors((prev) => [...new Set([...prev, activeFloor])].sort((a, b) => a - b));
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
    setWallFirstFloors((prev) => prev.filter((floor) => floor !== activeFloor));
    setCustomWalls((prev) => prev.filter((wall) =>
      wall.floor !== activeFloor || !wall.id.startsWith(`wf-${activeFloor}-`)
    ));
    setCustomOpenings((prev) => prev.filter((opening) =>
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
      customOpenings
        .filter((opening) => opening.floor === activeFloor)
        .flatMap((opening) => {
          const wall = customWalls.find((item) => item.id === opening.wallId && item.floor === activeFloor);
          return wall ? [customOpeningToMarker(opening, wall)] : [];
        }),
    [customOpenings, customWalls, activeFloor],
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
          ...customWalls
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
    [geometry.walls, customWalls, activeFloor, lotWidth, lotDepth],
  );
  const closedArea = closedSpaces.reduce((sum, space) => sum + space.area, 0);
  const spaceAssignments = useMemo(
    () => matchSpaceProfiles(closedSpaces, spaceProfiles, activeFloor),
    [closedSpaces, spaceProfiles, activeFloor],
  );

  const modelLevels = useMemo(
    () => buildConceptModelLevels({
      floors,
      rooms,
      objects,
      lotWidth,
      lotDepth,
      openingOverrides,
      customWalls,
      customOpenings,
      spaceProfiles,
      wallFirstFloors,
    }),
    [
      floors,
      rooms,
      objects,
      lotWidth,
      lotDepth,
      openingOverrides,
      customWalls,
      customOpenings,
      spaceProfiles,
      wallFirstFloors,
    ],
  );

  const selectedClosedSpace = closedSpaces.find((space) => space.id === selectedClosedSpaceId) ?? null;
  const selectedSpaceProfile = selectedClosedSpace ? spaceAssignments.get(selectedClosedSpace.id) ?? null : null;

  const updateSelectedSpaceProfile = (patch: Partial<Pick<SpaceProfile, "label" | "kind">>) => {
    if (!selectedClosedSpace) return;
    const existing = spaceAssignments.get(selectedClosedSpace.id);
    if (existing) {
      setSpaceProfiles((prev) => prev.map((profile) =>
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
    setSpaceProfiles((prev) => [...prev, created]);
  };
  const architecturalIssues = useMemo(() => {
    const validationSpaces = closedSpaces.map((space) => {
      const profile = spaceAssignments.get(space.id);
      return {
        ...space,
        label: profile?.label,
        kind: profile?.kind,
      };
    });
    return validateArchitecturalConcept({
      rooms,
      walls: [
        ...geometry.walls.map((wall) => ({
          id: wall.id,
          x1: wall.x1,
          y1: wall.y1,
          x2: wall.x2,
          y2: wall.y2,
          thickness: 0.15,
        })),
        ...customWalls
          .filter((wall) => wall.floor === activeFloor)
          .map((wall) => ({
            id: wall.id,
            x1: wall.x1,
            y1: wall.y1,
            x2: wall.x2,
            y2: wall.y2,
            thickness: wall.thickness,
          })),
      ],
      lotWidth,
      lotDepth,
      floor: activeFloor,
      floors,
      wallFirstActive,
      wallCount: geometry.walls.length + customWalls.filter((wall) => wall.floor === activeFloor).length,
      spaces: validationSpaces,
      openings: geometry.openings,
      objects,
    });
  }, [
    rooms,
    lotWidth,
    lotDepth,
    activeFloor,
    floors,
    wallFirstActive,
    closedSpaces,
    spaceAssignments,
    geometry.walls.length,
    geometry.openings,
    customWalls,
    objects,
  ]);

  const validationErrorCount = architecturalIssues.filter((issue) => issue.severity === "error").length;
  const validationWarningCount = architecturalIssues.filter((issue) => issue.severity === "warning").length;

  const validationCategoryLabel = (category: ArchitecturalValidationCategory) => ({
    geometry: "Geometria",
    dimension: "Dimensões",
    circulation: "Circulação",
    opening: "Vãos",
    stair: "Escadas",
    object: "Mobiliário",
  }[category]);

  const focusValidationIssue = (issue: ArchitecturalIssue) => {
    setEditorView("plan");
    setSelectedId(null);
    setSelectedOpeningId(null);
    setSelectedWallId(null);
    setSelectedCustomWallId(null);
    setSelectedClosedSpaceId(null);
    setSelectedObjectId(null);

    if (issue.entityType === "room" || issue.entityType === "stair") {
      setInteractionMode("room");
      if (issue.entityId) setSelectedId(issue.entityId);
      return;
    }
    if (issue.entityType === "space") {
      setInteractionMode("space");
      if (issue.entityId) setSelectedClosedSpaceId(issue.entityId);
      return;
    }
    if (issue.entityType === "opening") {
      setInteractionMode("opening");
      if (issue.entityId) setSelectedOpeningId(issue.entityId);
      return;
    }
    if (issue.entityType === "object") {
      setInteractionMode("object");
      if (issue.entityId) setSelectedObjectId(issue.entityId);
      return;
    }
  };
  const selectedStairParams = selected?.kind === "escada"
    ? normalizeStairParameters(selected)
    : null;
  const selectedStairMetrics = selected?.kind === "escada"
    ? stairFootprintMetrics(selected)
    : null;
  const selectedOpening = geometry.openings.find((opening) => opening.id === selectedOpeningId) ?? null;
  const selectedCustomOpening = selectedOpening
    ? customOpenings.find((opening) => opening.id === selectedOpening.id) ?? null
    : null;
  const selectedOpeningWall = selectedCustomOpening
    ? customWalls.find((wall) => wall.id === selectedCustomOpening.wallId) ?? null
    : null;
  const selectedResolvedCustomOpening = selectedCustomOpening && selectedOpeningWall
    ? normalizeCustomOpeningForWall(selectedCustomOpening, selectedOpeningWall)
    : selectedCustomOpening;
  const selectedOpeningParams = selectedResolvedCustomOpening
    ? normalizeOpeningParameters(selectedResolvedCustomOpening.type, selectedResolvedCustomOpening)
    : null;
  const selectedOpeningWallLength = selectedOpeningWall ? customWallLength(selectedOpeningWall) : 0;
  const selectedOpeningPresets = selectedCustomOpening
    ? OPENING_PRESETS.filter((preset) => preset.type === selectedCustomOpening.type)
    : [];
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
    recordHistory = false,
  ) => {
    const before = recordHistory ? snapshotEditor() : null;
    setCustomWalls((prev) => prev.map((wall) => wall.id === wallId ? { ...wall, ...patch } : wall));
    if (before) pushRoomHistory(before);
  };

  const setCustomWallLength = (wallId: string, rawLength: number) => {
    const wall = customWalls.find((item) => item.id === wallId);
    if (!wall || !Number.isFinite(rawLength)) return;
    const length = Math.max(0.5, Math.min(Math.max(lotWidth, lotDepth), rawLength));
    const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
    const before = snapshotEditor();

    if (horizontal) {
      const direction = wall.x2 >= wall.x1 ? 1 : -1;
      const x2 = Math.max(0, Math.min(lotWidth, wall.x1 + length * direction));
      setCustomWalls((prev) => prev.map((item) => item.id === wallId ? { ...item, x2, y2: item.y1 } : item));
    } else {
      const direction = wall.y2 >= wall.y1 ? 1 : -1;
      const y2 = Math.max(0, Math.min(lotDepth, wall.y1 + length * direction));
      setCustomWalls((prev) => prev.map((item) => item.id === wallId ? { ...item, x2: item.x1, y2 } : item));
    }

    pushRoomHistory(before);
  };

  const setCustomWallStart = (wallId: string, axis: "x" | "y", value: number) => {
    const wall = customWalls.find((item) => item.id === wallId);
    if (!wall || !Number.isFinite(value)) return;
    const horizontal = Math.abs(wall.y1 - wall.y2) < 0.01;
    const before = snapshotEditor();

    if (horizontal) {
      if (axis === "x") {
        const next = Math.max(0, Math.min(lotWidth, value));
        if (Math.abs(wall.x2 - next) < 0.5) return;
        setCustomWalls((prev) => prev.map((item) => item.id === wallId ? { ...item, x1: next } : item));
      } else {
        const next = Math.max(0, Math.min(lotDepth, value));
        setCustomWalls((prev) => prev.map((item) => item.id === wallId ? { ...item, y1: next, y2: next } : item));
      }
    } else {
      if (axis === "x") {
        const next = Math.max(0, Math.min(lotWidth, value));
        setCustomWalls((prev) => prev.map((item) => item.id === wallId ? { ...item, x1: next, x2: next } : item));
      } else {
        const next = Math.max(0, Math.min(lotDepth, value));
        if (Math.abs(wall.y2 - next) < 0.5) return;
        setCustomWalls((prev) => prev.map((item) => item.id === wallId ? { ...item, y1: next } : item));
      }
    }

    pushRoomHistory(before);
  };

  const deleteCustomWall = (wallId: string) => {
    const before = snapshotEditor();
    setCustomWalls((prev) => prev.filter((wall) => wall.id !== wallId));
    setCustomOpenings((prev) => prev.filter((opening) => opening.wallId !== wallId));
    pushRoomHistory(before);
    setSelectedCustomWallId((current) => current === wallId ? null : current);
  };

  const selectedCustomWall = customWalls.find((wall) => wall.id === selectedCustomWallId) ?? null;
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

    const original = customWallsRef.current;
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
    const wall = customWalls.find((item) => item.id === wallId);
    if (!wall) return;
    const before = snapshotEditor();
    const opening: CustomOpening = {
      id: `custom-opening-${uid()}`,
      wallId,
      floor: wall.floor,
      type,
      offset: 0.5,
      ...defaultOpeningParameters(type),
    };
    setCustomOpenings((prev) => [...prev, opening]);
    pushRoomHistory(before);
    setInteractionMode("opening");
    setSelectedOpeningId(opening.id);
    setSelectedCustomWallId(null);
  };

  const updateCustomOpeningParams = (
    openingId: string,
    patch: Partial<OpeningParameters>,
  ) => {
    const before = snapshotEditor();
    setCustomOpenings((prev) => prev.map((opening) => {
      if (opening.id !== openingId) return opening;
      const wall = customWalls.find((item) => item.id === opening.wallId);
      const manualPatch = { ...patch, presetId: undefined };
      return wall
        ? normalizeCustomOpeningForWall(opening, wall, manualPatch)
        : { ...opening, ...normalizeOpeningParameters(opening.type, { ...opening, ...manualPatch }) };
    }));
    pushRoomHistory(before);
  };

  const applyPresetToCustomOpening = (openingId: string, presetId: string) => {
    const preset = OPENING_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    const opening = customOpenings.find((item) => item.id === openingId);
    if (!opening || opening.type !== preset.type) return;
    const wall = customWalls.find((item) => item.id === opening.wallId);
    if (!wall) return;

    const before = snapshotEditor();
    setCustomOpenings((prev) => prev.map((item) =>
      item.id === openingId
        ? normalizeCustomOpeningForWall(item, wall, parametersFromOpeningPreset(preset))
        : item
    ));
    pushRoomHistory(before);
  };

  const setCustomOpeningOffsetMeters = (openingId: string, rawMeters: number) => {
    if (!Number.isFinite(rawMeters)) return;
    const opening = customOpenings.find((item) => item.id === openingId);
    if (!opening) return;
    const wall = customWalls.find((item) => item.id === opening.wallId);
    if (!wall) return;
    const length = customWallLength(wall);
    if (length <= 0.001) return;

    const before = snapshotEditor();
    setCustomOpenings((prev) => prev.map((item) =>
      item.id === openingId
        ? normalizeCustomOpeningForWall(item, wall, { offset: rawMeters / length })
        : item
    ));
    pushRoomHistory(before);
  };

  const deleteCustomOpening = (openingId: string) => {
    const before = snapshotEditor();
    setCustomOpenings((prev) => prev.filter((opening) => opening.id !== openingId));
    pushRoomHistory(before);
    setSelectedOpeningId((current) => current === openingId ? null : current);
  };

  const addConceptObject = (presetId: string) => {
    const preset = CONCEPT_OBJECT_PRESETS.find((item) => item.id === presetId);
    if (!preset) return;
    const before = snapshotEditor();
    const focus = selectedClosedSpace?.centroid ?? { x: lotWidth / 2, y: Math.min(lotDepth / 2, 8) };
    const created = normalizeConceptObject(
      createConceptObjectFromPreset(
        preset,
        activeFloor,
        focus.x,
        focus.y,
        `concept-object-${uid()}`,
      ),
      lotWidth,
      lotDepth,
    );
    setObjects((prev) => [...prev, created]);
    setSelectedObjectId(created.id);
    setSelectedId(null);
    setSelectedOpeningId(null);
    setSelectedWallId(null);
    setSelectedCustomWallId(null);
    pushRoomHistory(before);
  };

  const updateConceptObject = (objectId: string, patch: Partial<ConceptObject>, recordHistory = false) => {
    const before = recordHistory ? snapshotEditor() : null;
    setObjects((prev) => prev.map((object) =>
      object.id === objectId
        ? normalizeConceptObject({ ...object, ...patch }, lotWidth, lotDepth)
        : object
    ));
    if (before) pushRoomHistory(before);
  };

  const rotateConceptObject = (objectId: string, delta: number) => {
    const object = objects.find((item) => item.id === objectId);
    if (!object) return;
    updateConceptObject(objectId, { rotationDeg: object.rotationDeg + delta }, true);
  };

  const deleteConceptObject = (objectId: string) => {
    const before = snapshotEditor();
    setObjects((prev) => prev.filter((object) => object.id !== objectId));
    setSelectedObjectId((current) => current === objectId ? null : current);
    pushRoomHistory(before);
  };
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
    updateOpeningById(selectedOpening.id, { x: next.x, y: next.y, type: next.type });
    pushRoomHistory(before);
  };

  const toggleOpeningType = () => {
    if (!selectedOpening) return;
    const before = snapshotEditor();
    const nextType = selectedOpening.type === "door" ? "window" : "door";
    const custom = customOpenings.find((opening) => opening.id === selectedOpening.id);

    if (custom) {
      const wall = customWalls.find((item) => item.id === custom.wallId);
      if (!wall) return;
      setCustomOpenings((prev) => prev.map((opening) =>
        opening.id === selectedOpening.id
          ? normalizeCustomOpeningForWall(opening, wall, {
              type: nextType,
              ...defaultOpeningParameters(nextType),
              presetId: undefined,
            })
          : opening
      ));
    } else {
      updateOpeningById(selectedOpening.id, {
        x: selectedOpening.x,
        y: selectedOpening.y,
        type: nextType,
      });
    }

    pushRoomHistory(before);
  };

  const promoteToProject = async () => {
    const projectConceptId = await saveConcept(6);
    if (!projectConceptId) {
      setHandoffError("Salve o pré-projeto antes de enviar ao profissional.");
      setHandoffState("error");
      return null;
    }

    setHandoffState("sending");
    setHandoffError(null);

    try {
      const response = await fetch(`/api/arch/concept-projects/${projectConceptId}/promote`, {
        method: "POST",
        headers: conceptHeaders(true),
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
        materials: materialScheme,
      });

      const response = await fetch("/api/arch/ai-render", {
        method: "POST",
        headers: conceptHeaders(true),
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
        const poll = await fetch(`/api/arch/ai-render/${render_id}`, {
          headers: conceptHeaders(),
        });
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

          const payload = buildConceptPayload(5, completed);
          if (renderProjectId) {
            await fetch(`/api/arch/concept-projects/${renderProjectId}`, {
              method: "PATCH",
              headers: conceptHeaders(true),
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
                          ? (saveError ?? "Não foi possível salvar")
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
                  ["escada", Layers3, "Escada"],
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
          <section className="overflow-hidden rounded-3xl border bg-card pb-32 shadow-sm xl:pb-0">
            <div className="flex flex-col gap-3 border-b bg-background px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4">
              <div>
                <div className="text-sm font-semibold">Editor do pré-projeto</div>
                <div className="text-xs text-muted-foreground">Edite a mesma casa em 2D, 3D, fachada e render sem sair do workspace.</div>
              </div>
              <div className="flex max-w-full items-center gap-2 overflow-x-auto pb-1 sm:overflow-visible sm:pb-0">
                <div className="inline-flex shrink-0 rounded-xl border bg-muted/40 p-1">
                  {([
                    ["plan", "2D"],
                    ["model3d", "3D"],
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
              <ConceptDerivedFacade lotWidth={lotWidth} levels={modelLevels} facade={facadePreferences} materials={materialScheme} />
            </div>

            {mobilePanel !== "closed" && (
              <button
                type="button"
                aria-label="Fechar painel móvel"
                onClick={() => setMobilePanel("closed")}
                className="fixed inset-0 z-40 bg-slate-950/25 backdrop-blur-[1px] xl:hidden"
              />
            )}

            {mobilePanel === "tools" && (
              <aside className="fixed inset-x-3 bottom-28 z-50 max-h-[58vh] overflow-y-auto rounded-2xl border bg-background p-4 shadow-2xl xl:hidden">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Mais ferramentas</div>
                    <div className="mt-1 text-xs text-muted-foreground">Ferramentas menos frequentes sem ocupar a planta.</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMobilePanel("closed")}
                    className="rounded-lg border px-3 py-2 text-xs font-semibold"
                  >
                    Fechar
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditorView("plan");
                      setInteractionMode("space");
                      setSelectedId(null);
                      setSelectedOpeningId(null);
                      setSelectedWallId(null);
                      setSelectedCustomWallId(null);
                      setSelectedObjectId(null);
                      setMobilePanel("closed");
                    }}
                    className={interactionMode === "space"
                      ? "min-h-14 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-3 text-left text-sm font-semibold text-emerald-900"
                      : "min-h-14 rounded-xl border bg-background px-3 py-3 text-left text-sm font-semibold"}
                  >
                    Espaços
                    <span className="mt-1 block text-[10px] font-normal text-muted-foreground">Nomear áreas fechadas</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditorView("plan");
                      setInteractionMode("draw-wall");
                      setSelectedId(null);
                      setSelectedOpeningId(null);
                      setSelectedWallId(null);
                      setSelectedCustomWallId(null);
                      setSelectedObjectId(null);
                      setMobilePanel("closed");
                    }}
                    className={interactionMode === "draw-wall"
                      ? "min-h-14 rounded-xl border border-orange-300 bg-orange-50 px-3 py-3 text-left text-sm font-semibold text-orange-900"
                      : "min-h-14 rounded-xl border bg-background px-3 py-3 text-left text-sm font-semibold"}
                  >
                    Desenhar parede
                    <span className="mt-1 block text-[10px] font-normal text-muted-foreground">Toque início e fim</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setShowDimensions((value) => !value)}
                    className={showDimensions
                      ? "min-h-14 rounded-xl border border-sky-300 bg-sky-50 px-3 py-3 text-left text-sm font-semibold text-sky-900"
                      : "min-h-14 rounded-xl border bg-background px-3 py-3 text-left text-sm font-semibold"}
                  >
                    Cotas {showDimensions ? "ligadas" : "desligadas"}
                    <span className="mt-1 block text-[10px] font-normal text-muted-foreground">Medidas na planta</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (wallFirstActive) deactivateWallFirstFloor();
                      else activateWallFirstFloor();
                      setMobilePanel("closed");
                    }}
                    className={wallFirstActive
                      ? "min-h-14 rounded-xl border border-violet-300 bg-violet-50 px-3 py-3 text-left text-sm font-semibold text-violet-900"
                      : "min-h-14 rounded-xl border bg-background px-3 py-3 text-left text-sm font-semibold"}
                  >
                    {wallFirstActive ? "Paredes = modelo" : "Usar wall-first"}
                    <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                      {wallFirstActive ? "Toque para reverter" : "Rede de paredes como fonte"}
                    </span>
                  </button>
                </div>
              </aside>
            )}

            <div className="grid min-h-[calc(100vh-210px)] xl:min-h-[720px] xl:grid-cols-[220px_1fr_300px]">
              <aside className={[
                mobilePanel === "build"
                  ? "fixed inset-x-3 bottom-28 z-50 block max-h-[64vh] overflow-y-auto rounded-2xl border bg-background p-3 shadow-2xl"
                  : "hidden",
                "order-3 xl:static xl:order-1 xl:block xl:max-h-none xl:overflow-visible xl:rounded-none xl:border-0 xl:border-r xl:bg-muted/20 xl:p-3 xl:shadow-none",
              ].join(" ")}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Construção</div>
                  <button
                    type="button"
                    onClick={() => setMobilePanel("closed")}
                    className="rounded-lg border px-3 py-2 text-xs font-semibold xl:hidden"
                  >
                    Fechar
                  </button>
                </div>
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
                      onClick={() => {
                        if (!wallFirstActive) {
                          addRoom(kind);
                          setMobilePanel("closed");
                        }
                      }}
                      disabled={wallFirstActive}
                      title={wallFirstActive ? "Neste pavimento os ambientes são derivados das paredes." : undefined}
                      className="flex items-center justify-between rounded-xl border bg-background px-3 py-2.5 text-left text-sm font-medium hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
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
                        onClick={() => {
                          setActiveFloor(floor);
                          setSelectedId(null);
                          setEditorView("plan");
                          setMobilePanel("closed");
                        }}
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
                          : editorView === "model3d"
                            ? `Modelo 3D — ${activeFloor === 0 ? "Térreo" : activeFloor === 1 ? "Superior" : `Pavimento ${activeFloor + 1}`}`
                            : editorView === "facade"
                              ? "Fachada conceitual"
                              : "Render conceitual"}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {editorView === "plan"
                          ? wallFirstActive
                            ? "Modo wall-first ativo: ambientes, 3D e fachada são derivados da rede de paredes."
                            : "Arraste para mover. Use as alças laranja nas bordas e cantos para ajustar o ambiente."
                          : editorView === "model3d"
                            ? "O 3D é reconstruído automaticamente a partir da mesma rede de paredes e espaços fechados."
                            : editorView === "facade"
                              ? "A fachada é derivada da mesma geometria 2D/3D, incluindo pavimentos e vãos do projeto."
                              : "Visualização fotorrealista vinculada ao mesmo pré-projeto."}
                      </div>
                    </div>
                    {editorView === "plan" && (
                      <div className="-mx-1 flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                        <div className={closedSpaces.length
                          ? "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800"
                          : "rounded-lg border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground"}
                        >
                          {closedSpaces.length
                            ? `${closedSpaces.length} área${closedSpaces.length > 1 ? "s" : ""} fechada${closedSpaces.length > 1 ? "s" : ""} · ${closedArea.toFixed(1)} m²`
                            : "Nenhuma área fechada"}
                        </div>
                        <div className="rounded-lg border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground">
                          {customWallTopology.nodes.filter((node) => node.segmentIds.length >= 3 || node.endpointRefs.length >= 2).length} junções · {customWallTopology.segments.length} segmentos topológicos
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowDimensions((value) => !value)}
                          className={showDimensions
                            ? "rounded-lg border border-sky-300 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-800"
                            : "rounded-lg border bg-background px-3 py-2 text-xs font-semibold text-muted-foreground"}
                        >
                          Cotas {showDimensions ? "ligadas" : "desligadas"}
                        </button>
                        {wallFirstActive ? (
                          <div className="inline-flex items-center gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-800">
                            <span>Rede de paredes = modelo principal</span>
                            <button
                              type="button"
                              onClick={deactivateWallFirstFloor}
                              className="rounded-md border border-violet-200 bg-white px-2 py-1 text-[10px] font-semibold text-violet-700 hover:bg-violet-100"
                            >
                              Reverter
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={activateWallFirstFloor}
                            className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-800 hover:bg-violet-100"
                          >
                            Usar paredes como modelo principal
                          </button>
                        )}
                        <div className="inline-flex rounded-lg border bg-background p-1">
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
                              ? "rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                              : "rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground"}
                          >
                            Navegar
                          </button>
                          {!wallFirstActive && (
                          <button
                            type="button"
                            onClick={() => { setInteractionMode("room"); setSelectedOpeningId(null); setSelectedWallId(null); setSelectedCustomWallId(null); }}
                            className={interactionMode === "room"
                              ? "rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background"
                              : "rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground"}
                          >
                            Ambientes
                          </button>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              setInteractionMode("space");
                              setSelectedId(null);
                              setSelectedOpeningId(null);
                              setSelectedWallId(null);
                              setSelectedCustomWallId(null);
                            }}
                            className={interactionMode === "space"
                              ? "rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"
                              : "rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground"}
                          >
                            Espaços
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
                          <button
                            type="button"
                            onClick={() => {
                              setInteractionMode("object");
                              setSelectedId(null);
                              setSelectedOpeningId(null);
                              setSelectedWallId(null);
                              setSelectedCustomWallId(null);
                              setSelectedClosedSpaceId(null);
                            }}
                            className={interactionMode === "object"
                              ? "rounded-md bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white"
                              : "rounded-md px-3 py-1.5 text-xs font-semibold text-muted-foreground"}
                          >
                            Móveis e objetos
                          </button>
                        </div>
                        {!wallFirstActive && (
                          <>
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
                          </>
                        )}
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
                        closedSpaces={closedSpaces}
                        selectedClosedSpaceId={selectedClosedSpaceId}
                        onSelectClosedSpace={(spaceId) => {
                          setSelectedClosedSpaceId(spaceId);
                          setSelectedId(null);
                          setSelectedOpeningId(null);
                          setSelectedWallId(null);
                          setSelectedCustomWallId(null);
                        }}
                        closedSpaceLabels={Object.fromEntries(
                          closedSpaces.map((space) => [
                            space.id,
                            spaceAssignments.get(space.id)?.label ?? "",
                          ]),
                        )}
                        selectedId={selectedId}
                        onSelect={(roomId) => {
                          setSelectedId(roomId);
                          setSelectedOpeningId(null);
                          setSelectedObjectId(null);
                        }}
                        onRoomChange={updateRoomById}
                        selectedOpeningId={selectedOpeningId}
                        onSelectOpening={(openingId) => {
                          setSelectedOpeningId(openingId);
                          setSelectedId(null);
                          setSelectedObjectId(null);
                        }}
                        onOpeningChange={updateOpeningById}
                        selectedWallId={selectedWallId}
                        onSelectWall={(wallId) => {
                          setSelectedWallId(wallId);
                          setSelectedId(null);
                          setSelectedOpeningId(null);
                          setSelectedObjectId(null);
                        }}
                        onWallMove={moveWallById}
                        customWalls={customWalls.filter((wall) => wall.floor === activeFloor)}
                        stairOpenings={activeFloor > 0
                          ? rooms
                              .filter((room) => room.floor === activeFloor - 1 && room.kind === "escada")
                              .flatMap((room) => buildStairSlabOpenings(room))
                          : []}
                        objects={visibleObjects}
                        selectedObjectId={selectedObjectId}
                        onSelectObject={(objectId) => {
                          setSelectedObjectId(objectId);
                          setSelectedId(null);
                          setSelectedOpeningId(null);
                          setSelectedWallId(null);
                          setSelectedCustomWallId(null);
                          setSelectedClosedSpaceId(null);
                        }}
                        onObjectChange={(objectId, patch) => updateConceptObject(objectId, patch)}
                        validationIssues={architecturalIssues}
                        roof={facadePreferences}
                        showRoofPlan={activeFloor === floors - 1}
                        selectedCustomWallId={selectedCustomWallId}
                        onCreateCustomWall={addCustomWall}
                        onSelectCustomWall={(wallId) => {
                          setSelectedCustomWallId(wallId);
                          setSelectedWallId(null);
                          setSelectedId(null);
                          setSelectedOpeningId(null);
                          setSelectedObjectId(null);
                        }}
                        onDeleteCustomWall={deleteCustomWall}
                        onUpdateCustomWall={updateCustomWall}
                        topologyNodes={customWallTopology.nodes}
                        showDimensions={showDimensions}
                        onMoveTopologyJunction={moveTopologyJunction}
                        onEditStart={beginRoomEdit}
                        onEditEnd={endRoomEdit}
                        interactionMode={interactionMode}
                      />
                      <div className="mt-3 rounded-xl border bg-background/90 px-3 py-2 text-[11px] text-muted-foreground">
                        {interactionMode === "navigate"
                          ? "Navegar: arraste com um dedo para mover · use pinça com dois dedos, roda do mouse ou +/− para zoom."
                          : interactionMode === "room"
                            ? "Ambientes: arraste para mover · 8 alças laranja ajustam o perímetro · snap magnético + grade de 25 cm."
                          : interactionMode === "space"
                            ? "Espaços: selecione uma área fechada para nomear e classificar o ambiente diretamente na planta."
                          : interactionMode === "wall"
                            ? wallFirstActive
                              ? "Paredes: esta rede é a geometria principal do pavimento · edite segmentos, junções e medidas diretamente."
                              : "Paredes: selecione uma parede existente e arraste perpendicularmente · ambientes dos dois lados acompanham o ajuste."
                            : interactionMode === "draw-wall"
                              ? "Desenhar parede: cada segmento encaixa na rede existente; ao fechar um contorno, a área interna é detectada automaticamente."
                              : interactionMode === "object"
                                ? "Móveis e objetos: escolha na biblioteca, arraste na planta e ajuste rotação, dimensões e especificações."
                                : "Portas e janelas: toque para selecionar e arraste ao longo da parede · ajuste fino de 25 cm nas propriedades."}
                      </div>
                    </>
                  )}

                  {editorView === "model3d" && (
                    <ConceptModel3D
                      lotWidth={lotWidth}
                      lotDepth={lotDepth}
                      activeFloor={activeFloor}
                      levels={modelLevels}
                      roof={facadePreferences}
                      materials={materialScheme}
                    />
                  )}

                  {editorView === "facade" && (
                    <div data-concept-render-source="true" className="overflow-hidden rounded-2xl border bg-white shadow-sm">
                      <ConceptDerivedFacade lotWidth={lotWidth} levels={modelLevels} facade={facadePreferences} materials={materialScheme} />
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

              <aside className={[
                mobilePanel === "properties"
                  ? "fixed inset-x-3 bottom-28 z-50 block max-h-[64vh] overflow-y-auto rounded-2xl border bg-background p-4 shadow-2xl"
                  : "hidden",
                "order-2 [&_input]:text-base [&_select]:text-base xl:static xl:order-3 xl:block xl:max-h-none xl:overflow-visible xl:rounded-none xl:border-0 xl:border-l xl:bg-background xl:p-4 xl:shadow-none xl:[&_input]:text-sm xl:[&_select]:text-sm",
              ].join(" ")}>
                <div className="flex items-center justify-between gap-3">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Propriedades</div>
                  <button
                    type="button"
                    onClick={() => setMobilePanel("closed")}
                    className="rounded-lg border px-3 py-2 text-xs font-semibold xl:hidden"
                  >
                    Fechar
                  </button>
                </div>

                {editorView === "plan" && (
                  <>
                    {interactionMode === "navigate" ? (
                      <div className="mt-4 space-y-3">
                        <div className="rounded-xl border bg-muted/30 p-4 text-sm text-muted-foreground">
                          Arraste o canvas com mouse ou um dedo para navegar. Use pinça com dois dedos, roda do mouse ou os botões de zoom. O botão de enquadrar retorna à visão completa.
                        </div>
                        <button
                          type="button"
                          onClick={() => setInteractionMode("room")}
                          className="w-full rounded-xl bg-foreground px-4 py-3 text-sm font-semibold text-background"
                        >
                          Voltar para editar
                        </button>
                      </div>
                    ) : interactionMode === "space" ? (
                      !selectedClosedSpace ? (
                        <div className="mt-4 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                          Selecione uma área fechada na planta para definir seu nome e uso.
                        </div>
                      ) : (
                        <div className="mt-4 space-y-4">
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Espaço detectado</div>
                            <div className="mt-1 text-lg font-bold text-emerald-950">{selectedClosedSpace.area.toFixed(1)} m²</div>
                          </div>
                          <label className="block text-xs font-semibold">
                            Nome do ambiente
                            <input
                              value={selectedSpaceProfile?.label ?? ""}
                              onChange={(event) => updateSelectedSpaceProfile({ label: event.target.value })}
                              placeholder="Ex.: Sala de estar"
                              className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm"
                            />
                          </label>
                          <label className="block text-xs font-semibold">
                            Tipo
                            <select
                              value={selectedSpaceProfile?.kind ?? "outro"}
                              onChange={(event) => updateSelectedSpaceProfile({ kind: event.target.value })}
                              className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm"
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
                          <div className="rounded-xl bg-muted/40 p-3 text-xs text-muted-foreground">
                            A classificação acompanha o espaço pela posição e área, mesmo após pequenos ajustes nas paredes.
                          </div>
                        </div>
                      )
                    ) : interactionMode === "draw-wall" ? (
                      <div className="mt-4 space-y-3">
                        <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-900">
                          Toque no primeiro ponto e continue pelos vértices. Ao fechar o contorno, o sistema identifica automaticamente a área interna e calcula sua metragem.
                        </div>
                        <div className={closedSpaces.length
                          ? "rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800"
                          : "rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground"}
                        >
                          {closedSpaces.length
                            ? `Detectado: ${closedSpaces.length} espaço${closedSpaces.length > 1 ? "s" : ""} fechado${closedSpaces.length > 1 ? "s" : ""}, total ${closedArea.toFixed(1)} m².`
                            : "Feche o perímetro com paredes conectadas para o Arqdor reconhecer o ambiente."}
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
                          <div>
                            <div className="mb-2 text-xs font-semibold text-muted-foreground">Adicionar vão nesta parede</div>
                            <div className="grid grid-cols-2 gap-2">
                              <button
                                type="button"
                                onClick={() => addOpeningToCustomWall(selectedCustomWall.id, "door")}
                                className="rounded-xl border px-3 py-2.5 text-sm font-semibold hover:bg-muted"
                              >
                                + Porta
                              </button>
                              <button
                                type="button"
                                onClick={() => addOpeningToCustomWall(selectedCustomWall.id, "window")}
                                className="rounded-xl border px-3 py-2.5 text-sm font-semibold hover:bg-muted"
                              >
                                + Janela
                              </button>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <label className="block text-xs font-semibold">
                              Comprimento exato (m)
                              <input
                                type="number"
                                min="0.5"
                                step="0.05"
                                value={Math.hypot(selectedCustomWall.x2 - selectedCustomWall.x1, selectedCustomWall.y2 - selectedCustomWall.y1).toFixed(2)}
                                onChange={(event) => setCustomWallLength(selectedCustomWall.id, Number(event.target.value))}
                                className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm"
                              />
                            </label>
                            <label className="block text-xs font-semibold">
                              Orientação
                              <div className="mt-1 flex h-10 items-center rounded-xl border bg-muted/30 px-3 text-sm font-medium">
                                {Math.abs(selectedCustomWall.y1 - selectedCustomWall.y2) < 0.01 ? "Horizontal" : "Vertical"}
                              </div>
                            </label>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <label className="block text-xs font-semibold">
                              Início X (m)
                              <input
                                type="number"
                                min="0"
                                max={lotWidth}
                                step="0.05"
                                value={selectedCustomWall.x1.toFixed(2)}
                                onChange={(event) => setCustomWallStart(selectedCustomWall.id, "x", Number(event.target.value))}
                                className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm"
                              />
                            </label>
                            <label className="block text-xs font-semibold">
                              Início Y (m)
                              <input
                                type="number"
                                min="0"
                                max={lotDepth}
                                step="0.05"
                                value={selectedCustomWall.y1.toFixed(2)}
                                onChange={(event) => setCustomWallStart(selectedCustomWall.id, "y", Number(event.target.value))}
                                className="mt-1 h-10 w-full rounded-xl border bg-background px-3 text-sm"
                              />
                            </label>
                          </div>

                          <label className="block text-xs font-semibold">
                            Espessura
                            <select
                              value={selectedCustomWall.thickness ?? 0.15}
                              onChange={(event) => updateCustomWall(selectedCustomWall.id, { thickness: Number(event.target.value) }, true)}
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
                            Arraste as extremidades para edição rápida ou informe comprimento e coordenadas para ajuste preciso. Alterações numéricas também entram em Desfazer/Refazer.
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
                          Selecione uma parede ou uma junção da rede. Nós roxos representam encontros editáveis; cruzamentos/T detectados pela topologia aparecem na malha.
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
                    ) : interactionMode === "object" ? (
                      <div className="mt-4 space-y-4">
                        <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                          <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">Biblioteca de móveis e objetos</div>
                          <div className="mt-1 text-[11px] text-violet-900/75">
                            Objetos independentes dos ambientes, compartilhados pela planta, 3D e persistência do projeto.
                          </div>
                        </div>

                        {selectedObject && (
                          <div className="space-y-3 rounded-xl border bg-background p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="font-semibold">{selectedObject.name}</div>
                                <div className="text-[11px] text-muted-foreground">{objectCategoryLabel(selectedObject.category)} · pavimento {selectedObject.floor + 1}</div>
                              </div>
                              <button
                                type="button"
                                onClick={() => updateConceptObject(selectedObject.id, { locked: !selectedObject.locked }, true)}
                                className={selectedObject.locked ? "rounded-lg bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white" : "rounded-lg border px-2 py-1 text-[11px] font-semibold"}
                              >
                                {selectedObject.locked ? "Bloqueado" : "Bloquear"}
                              </button>
                            </div>

                            <label className="block text-xs font-medium">
                              Nome
                              <input
                                value={selectedObject.name}
                                onChange={(event) => updateConceptObject(selectedObject.id, { name: event.target.value }, true)}
                                className="mt-1 h-10 w-full rounded-lg border px-2"
                              />
                            </label>

                            <div className="grid grid-cols-3 gap-2">
                              <label className="text-xs font-medium">Largura
                                <input type="number" min="0.15" step="0.05" value={selectedObject.width.toFixed(2)} onChange={(event) => updateConceptObject(selectedObject.id, { width: Number(event.target.value) }, true)} className="mt-1 h-10 w-full rounded-lg border px-2" />
                              </label>
                              <label className="text-xs font-medium">Prof.
                                <input type="number" min="0.15" step="0.05" value={selectedObject.depth.toFixed(2)} onChange={(event) => updateConceptObject(selectedObject.id, { depth: Number(event.target.value) }, true)} className="mt-1 h-10 w-full rounded-lg border px-2" />
                              </label>
                              <label className="text-xs font-medium">Altura
                                <input type="number" min="0.05" step="0.05" value={selectedObject.height.toFixed(2)} onChange={(event) => updateConceptObject(selectedObject.id, { height: Number(event.target.value) }, true)} className="mt-1 h-10 w-full rounded-lg border px-2" />
                              </label>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-xs font-medium">Rotação
                                <div className="mt-1 flex items-center rounded-lg border px-2">
                                  <input type="number" step="15" value={selectedObject.rotationDeg.toFixed(0)} onChange={(event) => updateConceptObject(selectedObject.id, { rotationDeg: Number(event.target.value) }, true)} className="h-10 w-full bg-transparent outline-none" />
                                  <span className="text-xs text-muted-foreground">°</span>
                                </div>
                              </label>
                              <label className="text-xs font-medium">Categoria
                                <select value={selectedObject.category} onChange={(event) => updateConceptObject(selectedObject.id, { category: event.target.value as ConceptObject["category"] }, true)} className="mt-1 h-10 w-full rounded-lg border bg-background px-2">
                                  {CONCEPT_OBJECT_CATEGORIES.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}
                                </select>
                              </label>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-xs font-medium">Posição X
                                <input
                                  type="number"
                                  min="0"
                                  max={lotWidth}
                                  step="0.05"
                                  value={selectedObject.x.toFixed(2)}
                                  onChange={(event) => updateConceptObject(selectedObject.id, { x: Number(event.target.value) }, true)}
                                  className="mt-1 h-10 w-full rounded-lg border px-2"
                                />
                              </label>
                              <label className="text-xs font-medium">Posição Y
                                <input
                                  type="number"
                                  min="0"
                                  max={lotDepth}
                                  step="0.05"
                                  value={selectedObject.y.toFixed(2)}
                                  onChange={(event) => updateConceptObject(selectedObject.id, { y: Number(event.target.value) }, true)}
                                  className="mt-1 h-10 w-full rounded-lg border px-2"
                                />
                              </label>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <button type="button" onClick={() => rotateConceptObject(selectedObject.id, -90)} className="rounded-lg border px-3 py-2 text-xs font-semibold">↶ 90°</button>
                              <button type="button" onClick={() => rotateConceptObject(selectedObject.id, 90)} className="rounded-lg border px-3 py-2 text-xs font-semibold">↷ 90°</button>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-xs font-medium">Material
                                <input value={selectedObject.material ?? ""} onChange={(event) => updateConceptObject(selectedObject.id, { material: event.target.value }, true)} className="mt-1 h-10 w-full rounded-lg border px-2" placeholder="Ex.: madeira" />
                              </label>
                              <label className="text-xs font-medium">Cor
                                <input value={selectedObject.color ?? ""} onChange={(event) => updateConceptObject(selectedObject.id, { color: event.target.value }, true)} className="mt-1 h-10 w-full rounded-lg border px-2" placeholder="Ex.: freijó" />
                              </label>
                            </div>

                            <label className="block text-xs font-medium">
                              Material visual da biblioteca
                              <select
                                value=""
                                onChange={(event) => {
                                  const material = CONCEPT_MATERIAL_LIBRARY.find((item) => item.id === event.target.value);
                                  if (!material) return;
                                  updateConceptObject(selectedObject.id, {
                                    material: material.name,
                                    finish: material.finish,
                                    color: material.color,
                                  }, true);
                                }}
                                className="mt-1 h-10 w-full rounded-lg border bg-background px-2"
                              >
                                <option value="">Aplicar preset...</option>
                                {CONCEPT_MATERIAL_LIBRARY
                                  .filter((material) => {
                                    if (selectedObject.symbol === "sofa" || selectedObject.symbol === "chair") {
                                      return ["fabric", "wood"].includes(material.category);
                                    }
                                    if (selectedObject.symbol === "counter" || selectedObject.symbol === "island" || selectedObject.symbol === "sink") {
                                      return ["stone", "wood", "metal"].includes(material.category);
                                    }
                                    if (selectedObject.symbol === "appliance") return material.category === "metal";
                                    if (selectedObject.symbol === "plant") return false;
                                    return ["wood", "stone", "metal", "fabric"].includes(material.category);
                                  })
                                  .map((material) => (
                                    <option key={material.id} value={material.id}>
                                      {material.name}{material.finish ? ` · ${material.finish}` : ""}
                                    </option>
                                  ))}
                              </select>
                              <span className="mt-1 block text-[10px] text-muted-foreground">
                                Aplica nome, acabamento e cor ao mesmo objeto; você ainda pode editar manualmente.
                              </span>
                            </label>

                            <button type="button" onClick={() => deleteConceptObject(selectedObject.id)} className="w-full rounded-xl border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-700">
                              Excluir objeto
                            </button>
                          </div>
                        )}

                        <div>
                          <div className="mb-2 text-xs font-semibold text-muted-foreground">Adicionar ao pavimento atual</div>
                          <div className="max-h-[440px] space-y-3 overflow-auto pr-1">
                            {CONCEPT_OBJECT_CATEGORIES.map((category) => {
                              const presets = CONCEPT_OBJECT_PRESETS.filter((preset) => preset.category === category.value);
                              if (!presets.length) return null;
                              return (
                                <div key={category.value}>
                                  <div className="mb-1 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{category.label}</div>
                                  <div className="grid grid-cols-2 gap-1.5">
                                    {presets.map((preset) => (
                                      <button
                                        key={preset.id}
                                        type="button"
                                        onClick={() => addConceptObject(preset.id)}
                                        className="rounded-lg border bg-background px-2 py-2 text-left text-[11px] font-semibold hover:border-violet-300 hover:bg-violet-50"
                                      >
                                        <span className="block">{preset.name}</span>
                                        <span className="mt-0.5 block font-normal text-muted-foreground">{preset.width.toFixed(2)} × {preset.depth.toFixed(2)} m</span>
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
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
                          {selectedCustomOpening && selectedOpeningParams && (
                            <div className="space-y-3 rounded-xl border bg-background p-3">
                              <div>
                                <div className="text-xs font-semibold text-muted-foreground">Biblioteca de esquadrias</div>
                                <select
                                  value={selectedResolvedCustomOpening?.presetId ?? ""}
                                  onChange={(event) => {
                                    if (event.target.value) {
                                      applyPresetToCustomOpening(selectedOpening.id, event.target.value);
                                    } else {
                                      updateCustomOpeningParams(selectedOpening.id, { presetId: undefined });
                                    }
                                  }}
                                  className="mt-1 h-10 w-full rounded-lg border bg-background px-2 text-xs"
                                >
                                  <option value="">Personalizada</option>
                                  {selectedOpeningPresets.map((preset) => (
                                    <option key={preset.id} value={preset.id}>{preset.label}</option>
                                  ))}
                                </select>
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  O preset apenas preenche o mesmo objeto paramétrico; qualquer edição manual passa a ser personalizada.
                                </div>
                              </div>

                              <div className="text-xs font-semibold text-muted-foreground">Dimensões do vão</div>
                              <div className="grid grid-cols-2 gap-2">
                                <label className="text-xs font-medium">
                                  Largura (m)
                                  <input
                                    type="number"
                                    min="0.5"
                                    max={Math.max(0.5, Math.min(4, selectedOpeningWallLength ? selectedOpeningWallLength - 0.1 : 4))}
                                    step="0.05"
                                    value={selectedOpeningParams.width.toFixed(2)}
                                    onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { width: Number(event.target.value) })}
                                    className="mt-1 h-10 w-full rounded-lg border px-2"
                                  />
                                </label>
                                <label className="text-xs font-medium">
                                  Altura (m)
                                  <input
                                    type="number"
                                    min="0.5"
                                    max={selectedOpening.type === "door" ? 2.8 : Math.max(0.5, 2.8 - selectedOpeningParams.sillHeight)}
                                    step="0.05"
                                    value={selectedOpeningParams.height.toFixed(2)}
                                    onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { height: Number(event.target.value) })}
                                    className="mt-1 h-10 w-full rounded-lg border px-2"
                                  />
                                </label>
                              </div>

                              {selectedOpening.type === "window" && (
                                <label className="block text-xs font-medium">
                                  Peitoril (m)
                                  <input
                                    type="number"
                                    min="0"
                                    max={Math.max(0, 2.8 - selectedOpeningParams.height)}
                                    step="0.05"
                                    value={selectedOpeningParams.sillHeight.toFixed(2)}
                                    onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { sillHeight: Number(event.target.value) })}
                                    className="mt-1 h-10 w-full rounded-lg border px-2"
                                  />
                                </label>
                              )}

                              {selectedOpeningWall && selectedOpeningWallLength > 0 && (
                                <label className="block text-xs font-medium">
                                  Centro desde o início da parede (m)
                                  <input
                                    type="number"
                                    min="0"
                                    max={selectedOpeningWallLength}
                                    step="0.05"
                                    value={((selectedResolvedCustomOpening?.offset ?? selectedCustomOpening.offset) * selectedOpeningWallLength).toFixed(2)}
                                    onChange={(event) => setCustomOpeningOffsetMeters(selectedOpening.id, Number(event.target.value))}
                                    className="mt-1 h-10 w-full rounded-lg border px-2"
                                  />
                                  <span className="mt-1 block text-[11px] font-normal text-muted-foreground">
                                    Vinculada à parede por wallId + offset; o centro é limitado automaticamente para o vão não sair do segmento.
                                  </span>
                                </label>
                              )}

                              <label className="block text-xs font-medium">
                                Tipo de abertura
                                <select
                                  value={selectedOpeningParams.openingStyle}
                                  onChange={(event) => updateCustomOpeningParams(selectedOpening.id, {
                                    openingStyle: event.target.value as NonNullable<CustomOpening["openingStyle"]>,
                                  })}
                                  className="mt-1 h-10 w-full rounded-lg border bg-background px-2"
                                >
                                  {OPENING_STYLE_OPTIONS[selectedOpening.type].map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                  ))}
                                </select>
                              </label>

                              {openingStyleSupportsSwing(selectedOpeningParams.openingStyle) && (
                                <div>
                                  <div className="mb-1 text-xs font-medium">Sentido de abertura</div>
                                  <div className="grid grid-cols-2 gap-2">
                                    {(["left", "right"] as const).map((swing) => (
                                      <button
                                        key={swing}
                                        type="button"
                                        onClick={() => updateCustomOpeningParams(selectedOpening.id, { swing })}
                                        className={selectedOpeningParams.swing === swing
                                          ? "rounded-lg border border-orange-400 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-800"
                                          : "rounded-lg border px-3 py-2 text-xs font-semibold"}
                                      >
                                        {swing === "left" ? "Esquerda" : "Direita"}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="border-t pt-3">
                                <div className="mb-2 text-xs font-semibold text-muted-foreground">Especificação técnica</div>
                                <div className="grid grid-cols-2 gap-2">
                                  <label className="text-xs font-medium">
                                    Fabricante
                                    <input
                                      type="text"
                                      value={selectedOpeningParams.manufacturer ?? ""}
                                      onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { manufacturer: event.target.value })}
                                      placeholder="Ex.: fabricante"
                                      className="mt-1 h-10 w-full rounded-lg border px-2"
                                    />
                                  </label>
                                  <label className="text-xs font-medium">
                                    Linha
                                    <input
                                      type="text"
                                      value={selectedOpeningParams.productLine ?? ""}
                                      onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { productLine: event.target.value })}
                                      placeholder="Ex.: Linha 70"
                                      className="mt-1 h-10 w-full rounded-lg border px-2"
                                    />
                                  </label>
                                </div>

                                <label className="mt-2 block text-xs font-medium">
                                  Perfil / sistema
                                  <input
                                    type="text"
                                    value={selectedOpeningParams.profile ?? ""}
                                    onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { profile: event.target.value })}
                                    placeholder="Ex.: perfil 70 mm"
                                    className="mt-1 h-10 w-full rounded-lg border px-2"
                                  />
                                </label>

                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  <label className="text-xs font-medium">
                                    Material
                                    <select
                                      value={selectedOpeningParams.frameMaterial ?? ""}
                                      onChange={(event) => updateCustomOpeningParams(selectedOpening.id, {
                                        frameMaterial: (event.target.value || undefined) as OpeningParameters["frameMaterial"],
                                      })}
                                      className="mt-1 h-10 w-full rounded-lg border bg-background px-2"
                                    >
                                      <option value="">Não definido</option>
                                      {OPENING_FRAME_MATERIAL_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="text-xs font-medium">
                                    Cor
                                    <input
                                      type="text"
                                      value={selectedOpeningParams.frameColor ?? ""}
                                      onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { frameColor: event.target.value })}
                                      placeholder="Ex.: Preto"
                                      className="mt-1 h-10 w-full rounded-lg border px-2"
                                    />
                                  </label>
                                </div>

                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  <label className="text-xs font-medium">
                                    Vidro
                                    <select
                                      value={selectedOpeningParams.glassType ?? ""}
                                      onChange={(event) => updateCustomOpeningParams(selectedOpening.id, {
                                        glassType: (event.target.value || undefined) as OpeningParameters["glassType"],
                                      })}
                                      className="mt-1 h-10 w-full rounded-lg border bg-background px-2"
                                    >
                                      <option value="">Não definido</option>
                                      {OPENING_GLASS_TYPE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{option.label}</option>
                                      ))}
                                    </select>
                                  </label>
                                  <label className="text-xs font-medium">
                                    Esp. vidro (mm)
                                    <input
                                      type="number"
                                      min="1"
                                      max="80"
                                      step="1"
                                      value={selectedOpeningParams.glassThicknessMm ?? ""}
                                      onChange={(event) => updateCustomOpeningParams(selectedOpening.id, {
                                        glassThicknessMm: event.target.value === "" ? undefined : Number(event.target.value),
                                      })}
                                      className="mt-1 h-10 w-full rounded-lg border px-2"
                                    />
                                  </label>
                                </div>

                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  <label className="text-xs font-medium">
                                    Nº de folhas
                                    <input
                                      type="number"
                                      min="1"
                                      max="12"
                                      step="1"
                                      value={selectedOpeningParams.leafCount}
                                      onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { leafCount: Number(event.target.value) })}
                                      className="mt-1 h-10 w-full rounded-lg border px-2"
                                    />
                                  </label>
                                  <label className="text-xs font-medium">
                                    Custo unitário (R$)
                                    <input
                                      type="number"
                                      min="0"
                                      step="0.01"
                                      value={selectedOpeningParams.unitCost ?? ""}
                                      onChange={(event) => updateCustomOpeningParams(selectedOpening.id, {
                                        unitCost: event.target.value === "" ? undefined : Number(event.target.value),
                                      })}
                                      className="mt-1 h-10 w-full rounded-lg border px-2"
                                    />
                                  </label>
                                </div>

                                <label className="mt-2 block text-xs font-medium">
                                  Componentes
                                  <textarea
                                    rows={2}
                                    value={selectedOpeningParams.components ?? ""}
                                    onChange={(event) => updateCustomOpeningParams(selectedOpening.id, { components: event.target.value })}
                                    placeholder="Ex.: marco, folhas, trilhos, roldanas, fechos"
                                    className="mt-1 w-full rounded-lg border px-2 py-2 text-sm"
                                  />
                                </label>

                                <div className="mt-2 rounded-lg border bg-muted/30 p-2 text-[11px] text-muted-foreground">
                                  Estes dados pertencem ao mesmo vão paramétrico usado pela planta, 3D, fachada e persistência; não existe uma esquadria duplicada fora do objeto da abertura.
                                </div>
                              </div>
                            </div>
                          )}

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
                          {customOpenings.some((opening) => opening.id === selectedOpening.id) && (
                            <button
                              type="button"
                              onClick={() => deleteCustomOpening(selectedOpening.id)}
                              className="w-full rounded-xl border border-red-200 px-3 py-2.5 text-sm font-semibold text-red-700"
                            >
                              Excluir vão
                            </button>
                          )}
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
                        {selected.kind === "escada" && selectedStairParams && selectedStairMetrics && (
                          <div className="space-y-3 rounded-xl border bg-background p-3">
                            <div>
                              <div className="text-xs font-semibold text-muted-foreground">Escada paramétrica</div>
                              <div className="mt-1 text-[11px] text-muted-foreground">
                                A mesma escada gera os degraus 2D/3D e recorta automaticamente a laje do pavimento superior.
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-xs font-medium">Formato
                                <select value={selectedStairParams.stairShape} onChange={(event) => updateSelected({ stairShape: event.target.value as NonNullable<Room["stairShape"]> })} className="mt-1 h-10 w-full rounded-lg border bg-background px-2">
                                  <option value="straight">Reta</option>
                                  <option value="l">Em L</option>
                                  <option value="u">Em U</option>
                                </select>
                              </label>
                              <label className="text-xs font-medium">Sobe para
                                <select value={selectedStairParams.stairDirection} onChange={(event) => updateSelected({ stairDirection: event.target.value as NonNullable<Room["stairDirection"]> })} className="mt-1 h-10 w-full rounded-lg border bg-background px-2">
                                  <option value="north">Cima</option>
                                  <option value="south">Baixo</option>
                                  <option value="east">Direita</option>
                                  <option value="west">Esquerda</option>
                                </select>
                              </label>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-xs font-medium">Piso a piso (m)
                                <input type="number" min="2.96" max="4.5" step="0.01" value={selectedStairParams.stairFloorToFloorHeight.toFixed(2)} onChange={(event) => setStairFloorToFloorHeight(selected.id, Number(event.target.value))} className="mt-1 h-10 w-full rounded-lg border px-2" />
                              </label>
                              <label className="text-xs font-medium">Nº de espelhos
                                <input type="number" min="12" max="30" step="1" value={selectedStairParams.stairRiserCount} onChange={(event) => updateSelected({ stairRiserCount: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-lg border px-2" />
                              </label>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-xs font-medium">Espelho desejado (cm)
                                <input type="number" min="12" max="24" step="0.5" value={(selectedStairParams.riserHeight * 100).toFixed(1)} onChange={(event) => updateSelected({ stairRiserCount: riserCountForTargetHeight(selectedStairParams.stairFloorToFloorHeight, Number(event.target.value) / 100) })} className="mt-1 h-10 w-full rounded-lg border px-2" />
                              </label>
                              <label className="text-xs font-medium">Piso (cm)
                                <input type="number" min="22" max="36" step="1" value={(selectedStairParams.stairTreadDepth * 100).toFixed(0)} onChange={(event) => updateSelected({ stairTreadDepth: Number(event.target.value) / 100 })} className="mt-1 h-10 w-full rounded-lg border px-2" />
                              </label>
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="text-xs font-medium">Largura do lance (m)
                                <input type="number" min="0.8" max="2.4" step="0.05" value={selectedStairParams.stairFlightWidth.toFixed(2)} onChange={(event) => updateSelected({ stairFlightWidth: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-lg border px-2" />
                              </label>
                              <label className="text-xs font-medium">Patamar (m)
                                <input type="number" min="0.8" max="2.5" step="0.05" value={selectedStairParams.stairLandingDepth.toFixed(2)} onChange={(event) => updateSelected({ stairLandingDepth: Number(event.target.value) })} className="mt-1 h-10 w-full rounded-lg border px-2" />
                              </label>
                            </div>
                            <div className={selectedStairMetrics.fitsTreadDepth ? "rounded-lg border bg-emerald-50 p-2 text-[11px] text-emerald-800" : "rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-800"}>
                              Espelho resultante: {(selectedStairParams.riserHeight * 100).toFixed(1)} cm · {selectedStairParams.treadCount} pisos · desenvolvimento disponível {selectedStairMetrics.pathLength.toFixed(2)} m.
                              {!selectedStairMetrics.fitsTreadDepth && " O espaço atual é menor que o desenvolvimento necessário para o piso informado."}
                            </div>
                          </div>
                        )}
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

                    <div className="mt-5 border-t pt-4">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-sm font-semibold">Validação arquitetônica</div>
                          <div className="mt-0.5 text-[10px] text-muted-foreground">Referência conceitual · não substitui validação normativa/executiva.</div>
                        </div>
                        <span className={validationErrorCount
                          ? "rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700"
                          : validationWarningCount
                            ? "rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700"
                            : "rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700"}>
                          {validationErrorCount ? `${validationErrorCount} erro${validationErrorCount > 1 ? "s" : ""}` : validationWarningCount ? `${validationWarningCount} atenção` : "OK"}
                        </span>
                      </div>

                      {(validationErrorCount > 0 || validationWarningCount > 0) && (
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <div className="rounded-lg bg-red-50 px-2.5 py-2">
                            <div className="text-[10px] uppercase tracking-wide text-red-600">Erros</div>
                            <div className="text-lg font-bold text-red-800">{validationErrorCount}</div>
                          </div>
                          <div className="rounded-lg bg-amber-50 px-2.5 py-2">
                            <div className="text-[10px] uppercase tracking-wide text-amber-600">Atenções</div>
                            <div className="text-lg font-bold text-amber-800">{validationWarningCount}</div>
                          </div>
                        </div>
                      )}

                      <div className="mt-3 max-h-[330px] space-y-2 overflow-auto pr-1">
                        {architecturalIssues.slice(0, 12).map((issue) => (
                          <button
                            key={issue.id}
                            type="button"
                            onClick={() => focusValidationIssue(issue)}
                            className={issue.severity === "error"
                              ? "block w-full rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-left text-xs text-red-800"
                              : "block w-full rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-left text-xs text-amber-800"}
                          >
                            <span className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-[10px] font-bold uppercase tracking-wide opacity-75">{validationCategoryLabel(issue.category)}</span>
                              <span className="text-[9px] font-bold uppercase">{issue.severity === "error" ? "Corrigir" : "Revisar"}</span>
                            </span>
                            <span className="block font-medium">{issue.message}</span>
                            {issue.recommendation && <span className="mt-1 block text-[10px] opacity-75">{issue.recommendation}</span>}
                          </button>
                        ))}
                        {architecturalIssues.length > 12 && (
                          <div className="rounded-lg border bg-muted/30 px-3 py-2 text-[10px] text-muted-foreground">
                            + {architecturalIssues.length - 12} validações adicionais neste pavimento.
                          </div>
                        )}
                        {architecturalIssues.length === 0 && (
                          <div className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                            Nenhum conflito conceitual detectado neste pavimento.
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {editorView === "model3d" && (
                  <div className="mt-4 space-y-4">
                    <div className="rounded-xl border bg-muted/30 p-4">
                      <div className="text-sm font-semibold">Modelo sincronizado</div>
                      <p className="mt-1 text-xs leading-5 text-muted-foreground">
                        Alterações feitas na planta 2D, nas paredes livres e nos espaços fechados alimentam esta visualização. Não existe um segundo modelo paralelo.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-xl bg-muted/50 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Paredes</div>
                        <div className="mt-1 text-lg font-bold">{modelLevels.reduce((sum, level) => sum + level.walls.length + level.customWalls.length, 0)}</div>
                      </div>
                      <div className="rounded-xl bg-muted/50 p-3">
                        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Espaços</div>
                        <div className="mt-1 text-lg font-bold">{modelLevels.reduce((sum, level) => sum + level.closedSpaces.length, 0)}</div>
                      </div>
                    </div>
                    <div className="space-y-3 rounded-xl border bg-background p-3">
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wide text-violet-700">Materialidade sincronizada</div>
                        <div className="mt-1 text-[11px] leading-4 text-muted-foreground">
                          Estas superfícies alimentam o mesmo 3D e seguem com o projeto ao promover para o Arqdor.
                        </div>
                      </div>
                      {materialSelect(`Piso · ${activeFloor === 0 ? "Térreo" : `Pavimento ${activeFloor + 1}`}`, "floor", activeFloorMaterial)}
                      {materialSelect("Parede interna", "interiorWall", materialScheme.interiorWall)}
                      {materialSelect("Parede externa", "exteriorWall", materialScheme.exteriorWall)}
                      {materialSelect("Escada", "stair", materialScheme.stair)}
                      {materialSelect("Cobertura", "roof", materialScheme.roof)}
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditorView("plan")}
                      className="w-full rounded-xl bg-foreground px-4 py-3 text-sm font-semibold text-background"
                    >
                      Voltar para editar planta
                    </button>
                  </div>
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
                    <RoofControls
                      compact
                      value={facadePreferences}
                      onChange={(patch) => setFacadePreferences((prev) => ({ ...prev, ...patch }))}
                    />
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

            <div className="fixed inset-x-2 bottom-2 z-30 grid grid-cols-4 gap-1 rounded-2xl border bg-background/95 p-1.5 pb-[calc(0.375rem+env(safe-area-inset-bottom))] shadow-2xl backdrop-blur xl:hidden">
              {([
                ["navigate", "Mover"],
                ["room", "Ambientes"],
                ["wall", "Paredes"],
                ["opening", "Vãos"],
                ["object", "Objetos"],
              ] as const).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    setEditorView("plan");
                    setInteractionMode(mode);
                    setMobilePanel("closed");
                  }}
                  className={interactionMode === mode && editorView === "plan"
                    ? "min-h-12 rounded-xl bg-foreground px-2 text-[11px] font-bold text-background"
                    : "min-h-12 rounded-xl px-2 text-[11px] font-semibold text-muted-foreground"}
                >
                  {label}
                </button>
              ))}

              <button
                type="button"
                onClick={() => setMobilePanel((current) => current === "tools" ? "closed" : "tools")}
                className={mobilePanel === "tools"
                  ? "min-h-12 rounded-xl bg-emerald-600 px-2 text-[11px] font-bold text-white"
                  : "min-h-12 rounded-xl px-2 text-[11px] font-semibold text-muted-foreground"}
              >
                Mais
              </button>

              <button
                type="button"
                onClick={() => setMobilePanel((current) => current === "build" ? "closed" : "build")}
                className={mobilePanel === "build"
                  ? "min-h-12 rounded-xl bg-orange-500 px-2 text-[11px] font-bold text-white"
                  : "min-h-12 rounded-xl px-2 text-[11px] font-semibold text-muted-foreground"}
              >
                + Itens
              </button>

              <button
                type="button"
                onClick={() => setMobilePanel((current) => current === "properties" ? "closed" : "properties")}
                className={mobilePanel === "properties"
                  ? "min-h-12 rounded-xl bg-violet-600 px-2 text-[11px] font-bold text-white"
                  : "min-h-12 rounded-xl px-2 text-[11px] font-semibold text-muted-foreground"}
              >
                Ajustes
              </button>
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
                  <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cobertura paramétrica</div>
                  <RoofControls
                    value={facadePreferences}
                    onChange={(patch) => setFacadePreferences((prev) => ({ ...prev, ...patch }))}
                  />
                </div>

                {materialSelect("Revestimento externo principal", "exteriorWall", materialScheme.exteriorWall)}

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
                <ConceptDerivedFacade lotWidth={lotWidth} levels={modelLevels} facade={facadePreferences} materials={materialScheme} />
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
                      <p className="text-xs text-muted-foreground">Elevação frontal derivada da geometria do modelo, dos pavimentos e das preferências aprovadas.</p>
                    </div>
                    <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">Conceitual</span>
                  </div>
                  <div className="mt-4 overflow-hidden rounded-2xl border bg-slate-50">
                    <ConceptDerivedFacade lotWidth={lotWidth} levels={modelLevels} facade={facadePreferences} materials={materialScheme} />
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
                      [
                        "Cobertura",
                        resolvedRoof.roof === "platibanda"
                          ? `Platibanda · ${resolvedRoof.roofParapetHeight.toFixed(2)} m`
                          : `${resolvedRoof.roof === "misto" ? "Mista" : "Telhado"} · ${resolvedRoof.roofWaters} água${resolvedRoof.roofWaters > 1 ? "s" : ""} · ${resolvedRoof.roofPitchDeg.toFixed(0)}° · beiral ${resolvedRoof.roofOverhang.toFixed(2)} m`,
                      ],
                      ["Material principal", materialScheme.exteriorWall.name],
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
