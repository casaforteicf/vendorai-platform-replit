import { Bath, BedDouble, CarFront, ChefHat, Home, Plus, Waves } from "lucide-react";
import { CONCEPT_OPENING_FAMILIES } from "./catalogs/conceptOpeningCatalog";

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

type Props = {
  mode: "build" | "rooms";
  interactionMode: string;
  wallFirstActive: boolean;
  selectedCustomWall: { id: string } | null;
  floors: number;
  activeFloor: number;
  activateWallFirstFloor: () => void;
  setInteractionMode: (mode: "room" | "space" | "wall" | "opening" | "draw-wall" | "navigate") => void;
  clearSelectionForWall: () => void;
  clearOpeningAndWalls: () => void;
  closeLibraryOnMobile: () => void;
  addRoom: (kind: RoomKind) => void;
  addOpeningPreset: (wallId: string, preset: {
    type: "door" | "window";
    width: number;
    height: number;
    sillHeight: number;
    openingStyle: "hinged" | "sliding" | "fixed" | "tilt_turn";
    swing?: "left" | "right";
    familyId?: string;
    familyLabel?: string;
  }) => void;
  setFloors: (updater: (value: number) => number) => void;
  setActiveFloor: (floor: number) => void;
  setEditorViewPlan: () => void;
  clearRoomSelection: () => void;
};

export default function ConceptConstructionLibraryPanel(props: Props) {
  const {
    mode,
    interactionMode,
    wallFirstActive,
    selectedCustomWall,
    floors,
    activeFloor,
    activateWallFirstFloor,
    setInteractionMode,
    clearSelectionForWall,
    clearOpeningAndWalls,
    closeLibraryOnMobile,
    addRoom,
    addOpeningPreset,
    setFloors,
    setActiveFloor,
    setEditorViewPlan,
    clearRoomSelection,
  } = props;

  if (mode === "rooms") {
    return (
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
              ["garagem", CarFront, "Garagem"],
              ["gourmet", ChefHat, "Área gourmet"],
              ["piscina", Waves, "Piscina"],
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
    );
  }

  return (
    <>
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Construção</div>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => {
            if (!wallFirstActive) activateWallFirstFloor();
            setInteractionMode("draw-wall");
            clearSelectionForWall();
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
            clearOpeningAndWalls();
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
            clearSelectionForWall();
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
              {[2,3,4,5,6].map((height) => <span key={height} className="w-2 rounded-sm bg-slate-600" style={{ height: `${height * 5}px` }} />)}
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
          {CONCEPT_OPENING_FAMILIES.map((family) => (
            <button
              key={family.id}
              type="button"
              disabled={!selectedCustomWall}
              onClick={() => selectedCustomWall && addOpeningPreset(selectedCustomWall.id, {
                type: family.type,
                width: family.width,
                height: family.height,
                sillHeight: family.sillHeight,
                openingStyle: family.openingStyle,
                swing: family.swing,
                familyId: family.id,
                familyLabel: family.label,
              })}
              className="rounded-xl border bg-white px-3 py-3 text-left disabled:cursor-not-allowed disabled:opacity-40 hover:border-orange-300 hover:bg-orange-50/40"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs font-semibold">{family.label}</div>
                <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-500">{family.type === "door" ? "porta" : "janela"}</span>
              </div>
              <div className="mt-1 text-[10px] text-slate-500">
                {family.width.toFixed(2).replace(".", ",")} × {family.height.toFixed(2).replace(".", ",")} m · {family.openingStyle === "hinged" ? "giro" : family.openingStyle === "sliding" ? "correr" : family.openingStyle === "fixed" ? "fixa" : "oscilo/maxim"}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-5 border-t pt-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Pavimentos</div>
          {floors < 3 && (
            <button type="button" onClick={() => setFloors((value) => Math.min(3, value + 1))} className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[10px] font-semibold">
              <Plus className="h-3 w-3" /> Adicionar
            </button>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: floors }).map((_, floor) => (
            <button
              key={floor}
              type="button"
              onClick={() => { setActiveFloor(floor); clearRoomSelection(); setEditorViewPlan(); }}
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
  );
}