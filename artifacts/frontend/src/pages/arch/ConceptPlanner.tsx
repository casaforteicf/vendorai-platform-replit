import { useMemo, useState } from "react";
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
import { buildConceptGeometry, generateLayoutVariant } from "./conceptGeometry";

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

const STEPS = ["Terreno", "Casa", "Ambientes", "Posições", "Layout"];

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
  const geometry = useMemo(
    () => buildConceptGeometry(rooms, lotWidth, lotDepth, activeFloor),
    [rooms, lotWidth, lotDepth, activeFloor],
  );

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
            <div className="flex flex-wrap gap-3">
              {STEPS.map((label, index) => (
                <StepPill key={label} index={index} current={step} label={label} />
              ))}
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
                  <div className="font-semibold">Planta conceitual — {activeFloor === 0 ? "Térreo" : activeFloor === 1 ? "Superior" : `Pavimento ${activeFloor + 1}`}</div>
                  <div className="text-xs text-muted-foreground">Terreno {lotWidth} × {lotDepth} m · paredes, portas e janelas são calculadas a partir dos ambientes.</div>
                </div>
                <button type="button" onClick={() => organize()} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white">
                  <Sparkles className="h-4 w-4" /> Organizar para mim
                </button>
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
              <div className="mt-3 flex flex-wrap gap-4 text-[11px] text-muted-foreground">
                <span><strong className="text-slate-900">Parede externa</strong> linha escura</span>
                <span><strong className="text-orange-600">Porta sugerida</strong> laranja</span>
                <span><strong className="text-sky-600">Janela sugerida</strong> azul</span>
              </div>
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
                    <strong>Paredes automáticas:</strong> o cliente organiza espaços; o sistema transforma os limites dos ambientes em paredes no próximo motor geométrico.
                  </div>
                </div>
              )}
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

        <div className="mx-auto mt-6 flex max-w-4xl items-center justify-between gap-3">
          <button type="button" disabled={step === 0} onClick={() => setStep((s) => Math.max(0, s - 1))} className="inline-flex items-center gap-2 rounded-xl border bg-background px-4 py-3 text-sm font-semibold disabled:opacity-40">
            <ArrowLeft className="h-4 w-4" /> Voltar
          </button>
          {step < STEPS.length - 1 ? (
            <button type="button" onClick={() => { if (step === 3) organize(); setStep((s) => Math.min(STEPS.length - 1, s + 1)); }} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white">
              Continuar <ArrowRight className="h-4 w-4" />
            </button>
          ) : (
            <button type="button" className="inline-flex items-center gap-2 rounded-xl bg-foreground px-5 py-3 text-sm font-semibold text-background">
              <Sparkles className="h-4 w-4" /> Gerar próxima etapa
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
