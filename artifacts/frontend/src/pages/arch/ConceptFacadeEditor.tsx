import { useMemo, useState } from "react";
import {
  Box,
  Copy,
  Lock,
  PaintBucket,
  Plus,
  Sparkles,
  Sun,
  Trash2,
  Unlock,
} from "lucide-react";
import ConceptDerivedFacade from "./ConceptDerivedFacade";
import type { ConceptFacadePreferences } from "./ConceptVolumetry";
import type { ConceptModelLevel } from "./ConceptModel3D";
import type { ConceptRoomShape } from "./conceptGeometry";
import {
  DEFAULT_FACADE_DESIGN,
  FACADE_MATERIALS,
  FACADE_VOLUME_PRESETS,
  createFacadeVolume,
  getFacadeMaterial,
  type FacadeDesignState,
  type FacadeMaterialId,
  type FacadeSurfaceKey,
  type FacadeVolume,
  type FacadeVolumeKind,
} from "./conceptFacadeDesign";

type Props = {
  lotWidth: number;
  levels: ConceptModelLevel[];
  rooms: ConceptRoomShape[];
  facade: ConceptFacadePreferences;
  design: FacadeDesignState;
  onFacadeChange: (next: ConceptFacadePreferences) => void;
  onDesignChange: (next: FacadeDesignState) => void;
  onOpenRender?: () => void;
};

const SURFACE_LABELS: Array<[FacadeSurfaceKey, string]> = [
  ["main", "Parede principal"],
  ["accent", "Destaque"],
  ["garage", "Garagem"],
  ["entrance", "Porta de entrada"],
  ["paving", "Piso externo"],
  ["frames", "Esquadrias"],
];

const STYLE_LABELS: Array<[ConceptFacadePreferences["style"], string]> = [
  ["contemporaneo", "Contemporâneo"],
  ["minimalista", "Minimalista"],
  ["tropical", "Tropical"],
  ["industrial", "Industrial"],
  ["classico_contemporaneo", "Clássico atual"],
  ["rustico_contemporaneo", "Rústico atual"],
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function ConceptFacadeEditor({
  lotWidth,
  levels,
  rooms,
  facade,
  design,
  onFacadeChange,
  onDesignChange,
  onOpenRender,
}: Props) {
  const [panel, setPanel] = useState<"volumes" | "materials" | "style">("volumes");
  const [selectedSurface, setSelectedSurface] = useState<FacadeSurfaceKey>("main");
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(null);

  const selectedVolume = useMemo(
    () => design.volumes.find((volume) => volume.id === selectedVolumeId) ?? null,
    [design.volumes, selectedVolumeId],
  );

  const updateDesign = (patch: Partial<FacadeDesignState>) => {
    onDesignChange({ ...design, ...patch });
  };

  const updateVolume = (id: string, patch: Partial<FacadeVolume>) => {
    onDesignChange({
      ...design,
      volumes: design.volumes.map((volume) => volume.id === id ? { ...volume, ...patch } : volume),
    });
  };

  const addVolume = (kind: FacadeVolumeKind) => {
    const next = createFacadeVolume(kind, design.volumes.length);
    onDesignChange({ ...design, volumes: [...design.volumes, next] });
    setSelectedVolumeId(next.id);
  };

  const deleteSelected = () => {
    if (!selectedVolume) return;
    onDesignChange({
      ...design,
      volumes: design.volumes.filter((volume) => volume.id !== selectedVolume.id),
    });
    setSelectedVolumeId(null);
  };

  const duplicateSelected = () => {
    if (!selectedVolume) return;
    const copy: FacadeVolume = {
      ...selectedVolume,
      id: `facade-volume-${Date.now()}-${design.volumes.length}`,
      label: `${selectedVolume.label} cópia`,
      x: clamp(selectedVolume.x + 4, 0, 96),
      y: clamp(selectedVolume.y + 4, 0, 96),
      locked: false,
    };
    onDesignChange({ ...design, volumes: [...design.volumes, copy] });
    setSelectedVolumeId(copy.id);
  };

  const setSurfaceMaterial = (materialId: FacadeMaterialId) => {
    onDesignChange({
      ...design,
      surfaceMaterials: {
        ...design.surfaceMaterials,
        [selectedSurface]: materialId,
      },
    });
  };

  return (
    <div className="relative h-[calc(100vh-64px)] min-h-[680px] overflow-hidden bg-[#eef1f3]">
      <div className="absolute left-4 top-4 z-30 flex overflow-hidden rounded-xl border bg-white shadow-lg">
        {([
          ["volumes", Box, "Volumes"],
          ["materials", PaintBucket, "Materiais"],
          ["style", Sparkles, "Estilo"],
        ] as const).map(([value, Icon, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setPanel(value)}
            className={panel === value
              ? "flex h-10 items-center gap-2 border-r bg-slate-900 px-3 text-xs font-semibold text-white last:border-r-0"
              : "flex h-10 items-center gap-2 border-r bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 last:border-r-0"}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      <div className="absolute left-4 top-16 z-30 w-[300px] max-h-[calc(100vh-110px)] overflow-auto rounded-2xl border bg-white shadow-xl">
        {panel === "volumes" && (
          <div className="p-4">
            <div className="text-sm font-semibold">Composição de volumes</div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Adicione elementos sobre a fachada e arraste diretamente no desenho.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {FACADE_VOLUME_PRESETS.map((preset) => (
                <button
                  key={preset.kind}
                  type="button"
                  onClick={() => addVolume(preset.kind)}
                  className="rounded-xl border bg-white p-3 text-left transition hover:border-orange-300 hover:bg-orange-50/40"
                >
                  <div className="grid h-12 place-items-center rounded-lg bg-slate-50">
                    <Box className="h-5 w-5 text-slate-600" />
                  </div>
                  <div className="mt-2 text-xs font-semibold">{preset.label}</div>
                  <div className="mt-0.5 text-[10px] text-slate-400">{preset.depth.toFixed(1)} m prof.</div>
                </button>
              ))}
            </div>

            {!!design.volumes.length && (
              <div className="mt-5 border-t pt-4">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">No projeto</div>
                <div className="space-y-1.5">
                  {design.volumes.map((volume) => (
                    <button
                      key={volume.id}
                      type="button"
                      onClick={() => setSelectedVolumeId(volume.id)}
                      className={selectedVolumeId === volume.id
                        ? "flex w-full items-center justify-between rounded-lg border border-orange-400 bg-orange-50 px-3 py-2 text-left"
                        : "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left hover:bg-slate-50"}
                    >
                      <span>
                        <span className="block text-xs font-semibold">{volume.label}</span>
                        <span className="block text-[10px] text-slate-400">{getFacadeMaterial(volume.materialId).name}</span>
                      </span>
                      {volume.locked && <Lock className="h-3.5 w-3.5 text-slate-400" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {panel === "materials" && (
          <div className="p-4">
            <div className="text-sm font-semibold">Materiais por elemento</div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Selecione a superfície e aplique um material. A alteração também alimenta o 3D e o render.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {SURFACE_LABELS.map(([surface, label]) => (
                <button
                  key={surface}
                  type="button"
                  onClick={() => setSelectedSurface(surface)}
                  className={selectedSurface === surface
                    ? "rounded-lg border border-orange-400 bg-orange-50 px-2.5 py-2 text-left text-[11px] font-semibold text-orange-800"
                    : "rounded-lg border px-2.5 py-2 text-left text-[11px] font-semibold text-slate-600"}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {FACADE_MATERIALS.map((material) => {
                const active = design.surfaceMaterials[selectedSurface] === material.id;
                return (
                  <button
                    key={material.id}
                    type="button"
                    onClick={() => setSurfaceMaterial(material.id)}
                    className={active
                      ? "overflow-hidden rounded-xl border-2 border-orange-500 bg-white text-left"
                      : "overflow-hidden rounded-xl border bg-white text-left hover:border-slate-300"}
                  >
                    <div
                      className="h-14"
                      style={{
                        backgroundColor: material.baseColor,
                        backgroundImage: material.texture === "wood"
                          ? `repeating-linear-gradient(0deg, transparent 0 5px, ${material.lineColor}55 5px 6px)`
                          : material.texture === "brick"
                            ? `repeating-linear-gradient(0deg, transparent 0 9px, ${material.lineColor}55 9px 10px)`
                            : undefined,
                      }}
                    />
                    <div className="p-2">
                      <div className="text-[11px] font-semibold">{material.name}</div>
                      <div className="text-[9px] text-slate-400">{material.category}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {panel === "style" && (
          <div className="p-4">
            <div className="text-sm font-semibold">Linguagem da fachada</div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {STYLE_LABELS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onFacadeChange({ ...facade, style: value })}
                  className={facade.style === value
                    ? "rounded-xl border border-orange-400 bg-orange-50 px-3 py-2.5 text-xs font-semibold text-orange-800"
                    : "rounded-xl border px-3 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Cobertura</div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ["platibanda", "Platibanda"],
                  ["aparente", "Aparente"],
                  ["misto", "Misto"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onFacadeChange({ ...facade, roof: value })}
                    className={facade.roof === value
                      ? "rounded-lg border border-orange-400 bg-orange-50 px-2 py-2 text-[10px] font-semibold text-orange-800"
                      : "rounded-lg border px-2 py-2 text-[10px] font-semibold text-slate-600"}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Iluminação</div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ["day", "Dia"],
                  ["sunset", "Pôr do sol"],
                  ["night", "Noite"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => updateDesign({ lighting: value })}
                    className={design.lighting === value
                      ? "rounded-lg border border-orange-400 bg-orange-50 px-2 py-2 text-[10px] font-semibold text-orange-800"
                      : "rounded-lg border px-2 py-2 text-[10px] font-semibold text-slate-600"}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <label className="mt-5 flex items-center justify-between rounded-xl border p-3">
              <span>
                <span className="block text-xs font-semibold">Paisagismo</span>
                <span className="block text-[10px] text-slate-400">Exibir vegetação frontal</span>
              </span>
              <input
                type="checkbox"
                checked={design.showLandscaping}
                onChange={(event) => updateDesign({ showLandscaping: event.target.checked })}
                className="h-4 w-4"
              />
            </label>

            {onOpenRender && (
              <button
                type="button"
                onClick={onOpenRender}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white"
              >
                <Sparkles className="h-4 w-4" />
                Gerar resultado
              </button>
            )}
          </div>
        )}
      </div>

      <div className="absolute inset-0 pl-12">
        <ConceptDerivedFacade
          lotWidth={lotWidth}
          levels={levels}
          rooms={rooms}
          facade={facade}
          design={design}
          selectedVolumeId={selectedVolumeId}
          onSelectVolume={setSelectedVolumeId}
          onVolumeChange={updateVolume}
        />
      </div>

      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-xl border bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <Sun className="h-4 w-4 text-orange-500" />
        <span className="text-xs font-semibold">
          {design.lighting === "day" ? "Dia" : design.lighting === "sunset" ? "Pôr do sol" : "Noite"}
        </span>
      </div>

      {selectedVolume && (
        <div className="absolute bottom-4 left-1/2 z-40 w-[min(920px,calc(100vw-120px))] -translate-x-1/2 rounded-2xl border bg-white/95 p-3 shadow-2xl backdrop-blur">
          <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-[150px]">
              <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Selecionado</div>
              <input
                value={selectedVolume.label}
                onChange={(event) => updateVolume(selectedVolume.id, { label: event.target.value })}
                className="mt-1 w-full bg-transparent text-sm font-semibold outline-none"
              />
            </div>

            {([
              ["x", "X", 0, 96, 1],
              ["y", "Y", 0, 96, 1],
              ["width", "Largura", 4, 100, 1],
              ["height", "Altura", 4, 100, 1],
              ["depth", "Prof.", 0, 3, 0.1],
            ] as const).map(([key, label, min, max, step]) => (
              <label key={key} className="text-[10px] font-semibold text-slate-500">
                {label}
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={selectedVolume[key]}
                  onChange={(event) => updateVolume(selectedVolume.id, {
                    [key]: clamp(Number(event.target.value) || 0, min, max),
                  } as Partial<FacadeVolume>)}
                  className="mt-1 h-9 w-[82px] rounded-lg border px-2 text-xs font-semibold text-slate-800"
                />
              </label>
            ))}

            <label className="min-w-[145px] text-[10px] font-semibold text-slate-500">
              Material
              <select
                value={selectedVolume.materialId}
                onChange={(event) => updateVolume(selectedVolume.id, { materialId: event.target.value as FacadeMaterialId })}
                className="mt-1 h-9 w-full rounded-lg border bg-white px-2 text-xs"
              >
                {FACADE_MATERIALS.map((material) => (
                  <option key={material.id} value={material.id}>{material.name}</option>
                ))}
              </select>
            </label>

            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => updateVolume(selectedVolume.id, { locked: !selectedVolume.locked })}
                className="grid h-9 w-9 place-items-center rounded-lg border text-slate-600 hover:bg-slate-50"
                title={selectedVolume.locked ? "Desbloquear" : "Bloquear"}
              >
                {selectedVolume.locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              </button>
              <button
                type="button"
                onClick={duplicateSelected}
                className="grid h-9 w-9 place-items-center rounded-lg border text-slate-600 hover:bg-slate-50"
                title="Duplicar"
              >
                <Copy className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={deleteSelected}
                className="grid h-9 w-9 place-items-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                title="Excluir"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {!selectedVolume && panel === "volumes" && (
        <div className="absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-xl border bg-white/95 px-4 py-2 text-xs text-slate-500 shadow-sm backdrop-blur">
          Selecione um volume no desenho para editar · arraste para reposicionar
        </div>
      )}
    </div>
  );
}
