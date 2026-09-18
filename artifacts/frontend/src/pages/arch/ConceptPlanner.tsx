import { useEffect, useMemo, useState } from "react";
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
  Sparkles,
  Trees,
  Waves,
} from "lucide-react";
import { buildConceptGeometry, generateLayoutVariant, nudgeOpening, validateConceptLayout } from "./conceptGeometry";
import ConceptVolumetry, { type ConceptFacadePreferences } from "./ConceptVolumetry";
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

type ConceptDraftResponse = {
  id: string;
  currentStep: number;
  lot: { width: number; depth: number };
  configuration: { floors: number; desiredArea: number };
  rooms: Room[];
  openingOverrides: Record<string, OpeningOverride>;
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

const STEPS = ["Terreno", "Casa", "Ambientes", "Posições", "Layout", "Fachada"];

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
  const [floors, setFloors] = useState(1);
  const [desiredArea, setDesiredArea] = useState(180);
  const [activeFloor, setActiveFloor] = useState(0);
  const [rooms, setRooms] = useState<Room[]>([
    createRoom("garagem"),
    createRoom("sala"),
    createRoom("cozinha"),
    createRoom("suite"),
    createRoom("quarto"),
    createRoom("quarto"),
    createRoom("banheiro"),
    createRoom("lavanderia"),
    createRoom("gourmet"),
    createRoom("piscina"),
  ]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [layoutVariant, setLayoutVariant] = useState(0);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string | null>(null);
  const [openingOverrides, setOpeningOverrides] = useState<Record<string, OpeningOverride>>({});
  const [conceptId, setConceptId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "loading" | "saving" | "saved" | "error">("loading");
  const [viewMode, setViewMode] = useState<"2d" | "3d">("2d");
  const [rotation, setRotation] = useState(45);
  const [exploded3d, setExploded3d] = useState(false);
  const [facadePreferences, setFacadePreferences] = useState<ConceptFacadePreferences>(DEFAULT_FACADE);
  const [conceptRender, setConceptRender] = useState<ConceptDraftResponse["conceptRender"]>({ status: "idle" });
  const [renderError, setRenderError] = useState<string | null>(null);

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
        setStep(Math.max(0, Math.min(STEPS.length - 1, draft.currentStep ?? 0)));
        setLotWidth(draft.lot?.width ?? 12);
        setLotDepth(draft.lot?.depth ?? 30);
        setFloors(Math.max(1, Math.min(3, draft.configuration?.floors ?? 1)));
        setDesiredArea(draft.configuration?.desiredArea ?? 180);
        setRooms(Array.isArray(draft.rooms) && draft.rooms.length ? draft.rooms : []);
        setOpeningOverrides(draft.openingOverrides ?? {});
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
      configuration: { floors, desiredArea },
      rooms,
      openingOverrides,
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

  const addRoom = (kind: RoomKind) => {
    const next = createRoom(kind, activeFloor);
    setRooms((prev) => autoArrange([...prev, next], lotWidth, lotDepth, activeFloor));
    setSelectedId(next.id);
  };

  const updateSelected = (patch: Partial<Room>) => {
    if (!selectedId) return;
    setRooms((prev) => prev.map((room) => (room.id === selectedId ? { ...room, ...patch } : room)));
  };

  const organize = (variant = layoutVariant) => {
    setLayoutVariant(variant);
    setRooms((prev) => generateLayoutVariant(prev, lotWidth, lotDepth, activeFloor, variant));
  };

  const swapPosition = (room: Room, direction: "left" | "right" | "up" | "down") => {
    if (room.locked) return;
    const delta = 1;
    const nextX = Math.max(0, Math.min(lotWidth - room.width, room.x + (direction === "right" ? delta : direction === "left" ? -delta : 0)));
    const nextY = Math.max(0, Math.min(lotDepth - room.depth, room.y + (direction === "down" ? delta : direction === "up" ? -delta : 0)));
    updateSelected({ x: nextX, y: nextY });
  };

  const scaleX = 100 / lotWidth;
  const scaleY = 100 / lotDepth;
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

  const moveOpening = (amount: number) => {
    if (!selectedOpening) return;
    const next = nudgeOpening(selectedOpening, amount, lotWidth, lotDepth);
    setOpeningOverrides((prev) => ({
      ...prev,
      [selectedOpening.id]: { x: next.x, y: next.y, type: next.type },
    }));
  };

  const toggleOpeningType = () => {
    if (!selectedOpening) return;
    const nextType = selectedOpening.type === "door" ? "window" : "door";
    setOpeningOverrides((prev) => ({
      ...prev,
      [selectedOpening.id]: { x: selectedOpening.x, y: selectedOpening.y, type: nextType },
    }));
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
            configuration: { floors, desiredArea },
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
                {STEPS.map((label, index) => (
                  <StepPill key={label} index={index} current={step} label={label} />
                ))}
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
          <section className="mx-auto max-w-3xl rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-3">
              <Home className="h-7 w-7 text-orange-500" />
              <div>
                <h2 className="text-xl font-semibold">2. Como será a casa?</h2>
                <p className="text-sm text-muted-foreground">Defina só o essencial. O layout será montado depois.</p>
              </div>
            </div>
            <div className="mt-7 grid gap-4 sm:grid-cols-3">
              {[1, 2, 3].map((count) => (
                <button
                  key={count}
                  type="button"
                  onClick={() => {
                    setFloors(count);
                    setActiveFloor(Math.min(activeFloor, count - 1));
                  }}
                  className={[
                    "rounded-2xl border p-5 text-left transition",
                    floors === count ? "border-orange-500 bg-orange-500/5 ring-2 ring-orange-500/15" : "hover:border-foreground/30",
                  ].join(" ")}
                >
                  <Layers3 className="h-6 w-6" />
                  <div className="mt-3 font-semibold">{count === 1 ? "Casa térrea" : count === 2 ? "Sobrado" : "3 pavimentos"}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{count} nível{count > 1 ? "eis" : ""} para organizar</div>
                </button>
              ))}
            </div>
            <label className="mt-6 block space-y-2 text-sm font-medium">
              Área aproximada desejada
              <div className="flex items-center rounded-xl border bg-background px-3">
                <input className="h-12 w-full bg-transparent outline-none" type="number" min={40} value={desiredArea} onChange={(e) => setDesiredArea(Math.max(40, Number(e.target.value) || 40))} />
                <span className="text-muted-foreground">m²</span>
              </div>
            </label>
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
          <section className="mx-auto max-w-4xl rounded-3xl border bg-card p-6 shadow-sm sm:p-8">
            <div className="flex items-center gap-3">
              <Sparkles className="h-7 w-7 text-orange-500" />
              <div>
                <h2 className="text-xl font-semibold">4. Onde você prefere cada parte?</h2>
                <p className="text-sm text-muted-foreground">O sistema organiza sozinho; você só indica prioridades.</p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {[
                "Garagem na frente",
                "Suíte principal nos fundos",
                "Cozinha perto do gourmet",
                "Gourmet perto da piscina",
                "Quartos separados da área social",
                "Sala integrada com a cozinha",
              ].map((text, index) => (
                <label key={text} className="flex cursor-pointer items-center gap-3 rounded-2xl border p-4">
                  <input type="checkbox" defaultChecked={index < 4} className="h-4 w-4 accent-orange-500" />
                  <span className="text-sm font-medium">{text}</span>
                </label>
              ))}
            </div>
            <button type="button" onClick={() => organize()} className="mt-6 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white">
              <Sparkles className="h-4 w-4" />
              Organizar para mim
            </button>
          </section>
        )}

        {step === 4 && (
          <section className="grid min-h-[680px] gap-5 xl:grid-cols-[260px_1fr_310px]">
            <aside className="rounded-3xl border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-semibold">5. Layout</h2>
                  <p className="text-xs text-muted-foreground">Selecione um ambiente para ajustar.</p>
                </div>
                <button type="button" onClick={() => organize()} className="rounded-lg border p-2" title="Organizar novamente"><RotateCcw className="h-4 w-4" /></button>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {Array.from({ length: floors }).map((_, floor) => (
                  <button key={floor} type="button" onClick={() => { setActiveFloor(floor); setSelectedId(null); }} className={activeFloor === floor ? "rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background" : "rounded-lg border px-3 py-2 text-xs font-semibold"}>
                    {floor === 0 ? "Térreo" : floor === 1 ? "Superior" : `Pav. ${floor + 1}`}
                  </button>
                ))}
              </div>
              <div className="mt-4 space-y-2">
                {visibleRooms.map((room) => (
                  <button key={room.id} type="button" onClick={() => setSelectedId(room.id)} className={selectedId === room.id ? "w-full rounded-xl border border-orange-500 bg-orange-500/5 p-3 text-left" : "w-full rounded-xl border p-3 text-left"}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{room.label}</span>
                      {room.locked && <Lock className="h-3.5 w-3.5" />}
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">{room.width.toFixed(1)} × {room.depth.toFixed(1)} m</div>
                  </button>
                ))}
              </div>
            </aside>

            <div className="rounded-3xl border bg-card p-4 shadow-sm">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{viewMode === "2d" ? `Planta conceitual — ${activeFloor === 0 ? "Térreo" : activeFloor === 1 ? "Superior" : `Pavimento ${activeFloor + 1}`}` : "Volumetria 3D conceitual"}</div>
                  <div className="text-xs text-muted-foreground">
                    {viewMode === "2d"
                      ? `Terreno ${lotWidth} × ${lotDepth} m · paredes, portas e janelas são calculadas a partir dos ambientes.`
                      : "A volumetria usa exatamente os pavimentos, posições e dimensões da planta — sem inventar outra geometria."}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-xl border bg-background p-1">
                    <button
                      type="button"
                      onClick={() => setViewMode("2d")}
                      className={viewMode === "2d" ? "rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background" : "rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground"}
                    >
                      2D
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode("3d")}
                      className={viewMode === "3d" ? "rounded-lg bg-foreground px-3 py-2 text-xs font-semibold text-background" : "rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground"}
                    >
                      3D
                    </button>
                  </div>
                  <button type="button" onClick={() => organize()} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white">
                    <Sparkles className="h-4 w-4" /> Organizar para mim
                  </button>
                </div>
              </div>
              <div className="mb-4 grid gap-2 sm:grid-cols-3">
                {[
                  ["Opção A", "Social integrada"],
                  ["Opção B", "Mais privacidade"],
                  ["Opção C", "Lazer central"],
                ].map(([title, subtitle], index) => (
                  <button
                    key={title}
                    type="button"
                    onClick={() => organize(index)}
                    className={layoutVariant === index ? "rounded-xl border border-orange-500 bg-orange-500/5 p-3 text-left ring-2 ring-orange-500/10" : "rounded-xl border p-3 text-left hover:bg-muted/50"}
                  >
                    <div className="text-sm font-semibold">{title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{subtitle}</div>
                  </button>
                ))}
              </div>
              {viewMode === "2d" ? (
                <div className="space-y-3">
                  <div className="relative mx-auto h-[560px] max-w-[720px] overflow-hidden rounded-2xl border-2 border-slate-300 bg-[linear-gradient(to_right,rgba(148,163,184,.14)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,.14)_1px,transparent_1px)] bg-[size:24px_24px] p-2">
                                {visibleRooms.map((room) => {
                                  const left = room.x * scaleX;
                                  const top = room.y * scaleY;
                                  const width = Math.max(10, room.width * scaleX);
                                  const height = Math.max(8, room.depth * scaleY);
                                  return (
                                    <button
                                      key={room.id}
                                      type="button"
                                      onClick={() => setSelectedId(room.id)}
                                      className={[
                                        "absolute overflow-hidden rounded-md border-2 px-2 py-1 text-left shadow-sm transition",
                                        room.kind === "piscina" ? "border-sky-400 bg-sky-100" : "border-slate-500 bg-white",
                                        selectedId === room.id ? "ring-4 ring-orange-400/40" : "",
                                      ].join(" ")}
                                      style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%` }}
                                    >
                                      <div className="truncate text-[11px] font-bold text-slate-800">{room.label}</div>
                                      <div className="truncate text-[9px] text-slate-500">{room.width.toFixed(1)} × {room.depth.toFixed(1)} m</div>
                                    </button>
                                  );
                                })}
                                <svg
                                  className="pointer-events-none absolute inset-2 z-20 h-[calc(100%-1rem)] w-[calc(100%-1rem)] overflow-visible"
                                  viewBox={`0 0 ${lotWidth} ${lotDepth}`}
                                  preserveAspectRatio="none"
                                  aria-hidden="true"
                                >
                                  {geometry.walls.map((wall) => (
                                    <line
                                      key={wall.id}
                                      x1={wall.x1}
                                      y1={wall.y1}
                                      x2={wall.x2}
                                      y2={wall.y2}
                                      stroke={wall.exterior ? "#0f172a" : "#334155"}
                                      strokeWidth={wall.exterior ? 5 : 3}
                                      vectorEffect="non-scaling-stroke"
                                    />
                                  ))}
                                  {geometry.openings.map((opening) => {
                                    const half = opening.type === "door" ? 0.45 : 0.6;
                                    const horizontal = opening.orientation === "horizontal";
                                    return (
                                      <line
                                        key={opening.id}
                                        x1={horizontal ? opening.x - half : opening.x}
                                        y1={horizontal ? opening.y : opening.y - half}
                                        x2={horizontal ? opening.x + half : opening.x}
                                        y2={horizontal ? opening.y : opening.y + half}
                                        stroke={opening.type === "door" ? "#f97316" : "#0284c7"}
                                        strokeWidth={opening.type === "door" ? 5 : 4}
                                        vectorEffect="non-scaling-stroke"
                                      />
                                    );
                                  })}
                                </svg>
                              </div>
                  <div className="flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                    <span><strong className="text-slate-900">Parede externa</strong> linha escura</span>
                    <span><strong className="text-orange-600">Porta sugerida</strong> laranja</span>
                    <span><strong className="text-sky-600">Janela sugerida</strong> azul</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="relative mx-auto h-[560px] max-w-[820px] overflow-hidden rounded-2xl border-2 border-slate-300 bg-gradient-to-b from-slate-50 to-slate-100">
                    <ConceptVolumetry
                      rooms={rooms}
                      lotWidth={lotWidth}
                      lotDepth={lotDepth}
                      floors={floors}
                      rotation={rotation}
                      exploded={exploded3d}
                      facade={facadePreferences}
                    />
                    <div className="absolute left-3 top-3 rounded-xl border bg-white/90 px-3 py-2 text-xs shadow-sm backdrop-blur">
                      <div className="font-semibold text-slate-900">Volumetria vinculada à planta</div>
                      <div className="mt-0.5 text-slate-500">{floors} pavimento{floors > 1 ? "s" : ""} · pé-direito conceitual 2,80 m</div>
                    </div>
                  </div>
                  <div className="grid gap-3 rounded-2xl border bg-muted/30 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Girar visualização
                      <input
                        type="range"
                        min="0"
                        max="360"
                        step="5"
                        value={rotation}
                        onChange={(event) => setRotation(Number(event.target.value))}
                        className="mt-2 w-full accent-orange-500"
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => setExploded3d((value) => !value)}
                      className={exploded3d ? "rounded-xl border border-orange-500 bg-orange-500/5 px-4 py-2 text-xs font-semibold text-orange-700" : "rounded-xl border bg-background px-4 py-2 text-xs font-semibold"}
                    >
                      {exploded3d ? "Unir pavimentos" : "Separar pavimentos"}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <aside className="rounded-3xl border bg-card p-4 shadow-sm">
              <h3 className="font-semibold">Ajustes simples</h3>
              {!selected ? (
                <div className="mt-4 rounded-2xl border border-dashed p-5 text-sm text-muted-foreground">Toque em um ambiente na planta.</div>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-2xl bg-muted p-4">
                    <div className="font-semibold">{selected.label}</div>
                    <div className="text-xs text-muted-foreground">{(selected.width * selected.depth).toFixed(1)} m²</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="text-xs font-medium">Largura<input type="number" step="0.1" value={selected.width} onChange={(e) => updateSelected({ width: Math.max(1, Number(e.target.value) || 1) })} className="mt-1 h-10 w-full rounded-lg border bg-background px-2" /></label>
                    <label className="text-xs font-medium">Profundidade<input type="number" step="0.1" value={selected.depth} onChange={(e) => updateSelected({ depth: Math.max(1, Number(e.target.value) || 1) })} className="mt-1 h-10 w-full rounded-lg border bg-background px-2" /></label>
                  </div>
                  <button type="button" onClick={() => updateSelected({ locked: !selected.locked })} className="flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-semibold">
                    <Lock className="h-4 w-4" /> {selected.locked ? "Liberar posição" : "Manter aqui"}
                  </button>
                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Mover ambiente</div>
                    <div className="grid grid-cols-3 gap-2">
                      <span />
                      <button disabled={selected.locked} type="button" onClick={() => swapPosition(selected, "up")} className="rounded-lg border p-2 disabled:opacity-40">↑</button>
                      <span />
                      <button disabled={selected.locked} type="button" onClick={() => swapPosition(selected, "left")} className="rounded-lg border p-2 disabled:opacity-40">←</button>
                      <button type="button" onClick={() => organize()} className="rounded-lg border p-2 text-xs font-semibold">IA</button>
                      <button disabled={selected.locked} type="button" onClick={() => swapPosition(selected, "right")} className="rounded-lg border p-2 disabled:opacity-40">→</button>
                      <span />
                      <button disabled={selected.locked} type="button" onClick={() => swapPosition(selected, "down")} className="rounded-lg border p-2 disabled:opacity-40">↓</button>
                      <span />
                    </div>
                  </div>
                  <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 text-xs leading-relaxed text-orange-950">
                    <strong>Geometria automática ativa:</strong> ao mover ou redimensionar ambientes, o sistema recalcula paredes e sugere vãos.
                  </div>
                </div>
              )}
              <div className="mt-5 rounded-2xl border p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold">Checagem do layout</div>
                  <span className={layoutIssues.some((issue) => issue.severity === "error") ? "rounded-full bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700" : layoutIssues.length ? "rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700" : "rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700"}>
                    {layoutIssues.some((issue) => issue.severity === "error") ? "Corrigir" : layoutIssues.length ? "Atenção" : "Tudo certo"}
                  </span>
                </div>
                <div className="mt-3 space-y-2">
                  {layoutIssues.length === 0 ? (
                    <div className="text-xs text-emerald-700">Sem colisões ou problemas básicos detectados neste pavimento.</div>
                  ) : (
                    layoutIssues.slice(0, 5).map((issue) => (
                      <button
                        key={issue.id}
                        type="button"
                        onClick={() => issue.roomId && setSelectedId(issue.roomId)}
                        className={issue.severity === "error" ? "block w-full rounded-lg bg-red-50 px-3 py-2 text-left text-xs text-red-800" : "block w-full rounded-lg bg-amber-50 px-3 py-2 text-left text-xs text-amber-800"}
                      >
                        {issue.message}
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="mt-5 rounded-2xl border p-4">
                <div className="font-semibold">Portas e janelas</div>
                <p className="mt-1 text-xs text-muted-foreground">Selecione um vão sugerido para mover ou trocar o tipo.</p>
                <div className="mt-3 max-h-44 space-y-2 overflow-auto">
                  {geometry.openings
                    .filter((opening) => !selected || opening.roomId === selected.id)
                    .map((opening) => (
                      <button
                        key={opening.id}
                        type="button"
                        onClick={() => setSelectedOpeningId(opening.id)}
                        className={selectedOpeningId === opening.id ? "flex w-full items-center justify-between rounded-lg border border-orange-500 bg-orange-500/5 px-3 py-2 text-left text-xs" : "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs"}
                      >
                        <span>{opening.type === "door" ? "Porta" : "Janela"}</span>
                        <span className="text-muted-foreground">{opening.orientation === "horizontal" ? "horizontal" : "vertical"}</span>
                      </button>
                    ))}
                </div>
                {selectedOpening && (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => moveOpening(-0.25)} className="rounded-lg border px-2 py-2 text-xs font-semibold">← 25 cm</button>
                    <button type="button" onClick={toggleOpeningType} className="rounded-lg border px-2 py-2 text-xs font-semibold">Trocar tipo</button>
                    <button type="button" onClick={() => moveOpening(0.25)} className="rounded-lg border px-2 py-2 text-xs font-semibold">25 cm →</button>
                  </div>
                )}
              </div>

              <div className="mt-5 rounded-2xl border p-4">
                <div className="flex items-center gap-2 font-semibold"><Maximize2 className="h-4 w-4" /> Resumo</div>
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  <div>Terreno: {lotWidth} × {lotDepth} m</div>
                  <div>Pavimentos: {floors}</div>
                  <div>Área desejada: {desiredArea} m²</div>
                  <div>Ambientes: {rooms.length}</div>
                  <div>Área dos blocos: {currentArea.toFixed(0)} m²</div>
                </div>
              </div>
            </aside>
          </section>
        )}

        {step === 5 && (
          <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
            <aside className="rounded-3xl border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-orange-500" />
                <div>
                  <h2 className="text-lg font-semibold">6. Fachada e estilo</h2>
                  <p className="text-xs text-muted-foreground">Escolha a direção visual. A geometria da casa continua a mesma.</p>
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
                  <h3 className="font-semibold">Prévia da fachada</h3>
                  <p className="text-sm text-muted-foreground">A prévia aplica a linguagem visual sem alterar a planta aprovada.</p>
                </div>
                <div className="rounded-full bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-700">
                  {facadePreferences.style.replaceAll("_", " ")}
                </div>
              </div>

              <div data-concept-render-source="true" className="mt-4 h-[590px] overflow-hidden rounded-2xl border-2 border-slate-300 bg-gradient-to-b from-slate-50 to-slate-100">
                <ConceptVolumetry
                  rooms={rooms}
                  lotWidth={lotWidth}
                  lotDepth={lotDepth}
                  floors={floors}
                  rotation={rotation}
                  exploded={false}
                  facade={facadePreferences}
                  showLabels={false}
                />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-muted-foreground">
                  Girar fachada
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="5"
                    value={rotation}
                    onChange={(event) => setRotation(Number(event.target.value))}
                    className="mt-2 w-full accent-orange-500"
                  />
                </label>
                <div className="rounded-xl border bg-muted/30 p-3 text-xs text-muted-foreground">
                  O render usa esta mesma câmera, volumetria e preferências para preservar a ideia aprovada.
                </div>
              </div>

              <div className="mt-5 rounded-2xl border p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">Render conceitual</div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Gera uma imagem fotorrealista mantendo a geometria do pré-projeto.
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
                    Render em processamento. A geometria, fachada e materiais selecionados estão sendo usados como base.
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
                      {conceptRender.generatedAt && (
                        <span>{new Date(conceptRender.generatedAt).toLocaleString("pt-BR")}</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <div className="mx-auto mt-6 flex max-w-4xl items-center justify-between gap-3">
          <button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} className="inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-3 text-sm font-semibold disabled:opacity-40">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => { if (step === 3) organize(); const nextStep = Math.min(STEPS.length - 1, step + 1); setStep(nextStep); void saveConcept(nextStep); }} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white">
              Continuar <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void saveConcept()}
              className="inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background"
            >
              <Sparkles className="h-4 w-4" /> {conceptRender?.resultImageUrl ? "Salvar pré-projeto" : "Salvar fachada"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
