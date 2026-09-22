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
  X,
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
  onOpenGallery?: () => void;
  realisticPreviewUrl?: string | null;
  realisticPreviewLoading?: boolean;
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

function FacadePresetThumbnail({ kind }: { kind: FacadeVolumeKind }) {
  const dark = "bg-slate-700";
  const warm = "bg-amber-200";
  const light = "bg-slate-200";

  if (kind === "portal" || kind === "frame") {
    return (
      <div className="relative h-14 w-full overflow-hidden rounded-lg bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="absolute inset-x-5 bottom-2 top-2 rounded-md border-[6px] border-slate-700 bg-white" />
      </div>
    );
  }

  if (kind === "canopy") {
    return (
      <div className="relative h-14 w-full overflow-hidden rounded-lg bg-gradient-to-b from-sky-50 to-slate-100">
        <div className="absolute left-3 right-3 top-5 h-2 rounded-sm bg-slate-700 shadow" />
        <div className="absolute left-5 top-7 h-5 w-1 bg-slate-400" />
      </div>
    );
  }

  if (kind === "slats" || kind === "gate") {
    return (
      <div className="relative flex h-14 w-full items-center justify-center gap-1 rounded-lg bg-slate-50 px-5">
        {Array.from({ length: 7 }).map((_, index) => (
          <span key={index} className="h-10 w-1.5 rounded-sm bg-amber-700/80" />
        ))}
      </div>
    );
  }

  if (kind === "pergola") {
    return (
      <div className="relative h-14 w-full rounded-lg bg-gradient-to-b from-emerald-50 to-stone-100">
        <div className="absolute left-4 right-4 top-3 flex gap-1">
          {Array.from({ length: 6 }).map((_, index) => <span key={index} className="h-2 flex-1 rounded-sm bg-amber-800/80" />)}
        </div>
        <div className="absolute left-5 top-4 h-8 w-1.5 bg-amber-800/80" />
        <div className="absolute right-5 top-4 h-8 w-1.5 bg-amber-800/80" />
      </div>
    );
  }

  if (kind === "planter") {
    return (
      <div className="relative h-14 w-full rounded-lg bg-gradient-to-b from-emerald-50 to-slate-100">
        <div className="absolute bottom-2 left-4 right-4 h-4 rounded-sm bg-slate-300" />
        <div className="absolute bottom-5 left-7 h-4 w-5 rounded-full bg-emerald-600/70" />
        <div className="absolute bottom-5 right-7 h-5 w-6 rounded-full bg-emerald-700/70" />
      </div>
    );
  }

  if (kind === "balcony") {
    return (
      <div className="relative h-14 w-full rounded-lg bg-gradient-to-b from-sky-50 to-slate-100">
        <div className="absolute bottom-2 left-4 right-4 h-3 rounded-sm bg-slate-300" />
        <div className="absolute bottom-5 left-5 right-5 h-6 rounded border border-sky-300 bg-sky-100/80" />
      </div>
    );
  }

  if (kind === "wall") {
    return (
      <div className="relative h-14 w-full rounded-lg bg-gradient-to-b from-slate-50 to-stone-100">
        <div className="absolute bottom-2 left-3 right-3 h-7 rounded-sm bg-stone-500">
          <div className="h-full w-full opacity-30" style={{ backgroundImage: "linear-gradient(90deg,#fff 1px,transparent 1px),linear-gradient(#fff 1px,transparent 1px)", backgroundSize: "18px 10px" }} />
        </div>
      </div>
    );
  }

  if (kind === "garage") {
    return (
      <div className="relative h-14 w-full rounded-lg bg-gradient-to-b from-slate-50 to-slate-100">
        <div className="absolute bottom-2 left-3 right-3 h-9 rounded-md bg-stone-200 shadow-sm">
          <div className="absolute bottom-0 left-2 right-2 h-7 rounded-t bg-slate-700" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-14 w-full rounded-lg bg-gradient-to-br from-slate-50 to-orange-50">
      <div className={`absolute bottom-2 left-5 right-5 top-3 rounded-md shadow-sm ${light}`} />
      <div className={`absolute bottom-2 left-5 h-8 w-2 rounded-sm ${dark}`} />
      <div className={`absolute right-6 top-5 h-5 w-8 rounded-sm ${warm}`} />
    </div>
  );
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
  onOpenGallery,
  realisticPreviewUrl,
  realisticPreviewLoading = false,
}: Props) {
  const [panel, setPanel] = useState<"style" | "volumes" | "materials" | "frames" | "outdoor" | "lighting">("style");
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedSurface, setSelectedSurface] = useState<FacadeSurfaceKey>("main");
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(null);

  const selectedVolume = useMemo(
    () => design.volumes.find((volume) => volume.id === selectedVolumeId) ?? null,
    [design.volumes, selectedVolumeId],
  );

  const facadeMetrics = useMemo(() => {
    const builtRooms = (Array.isArray(rooms) ? rooms : []).filter((room) => room.kind !== "piscina");
    if (!builtRooms.length) {
      return {
        width: Math.max(6, lotWidth * 0.78),
        height: Math.max(2.8, Math.max(1, levels.length) * 2.96),
      };
    }
    const minX = Math.min(...builtRooms.map((room) => room.x));
    const maxX = Math.max(...builtRooms.map((room) => room.x + room.width));
    return {
      width: Math.max(4, maxX - minX),
      height: Math.max(2.8, Math.max(1, levels.length) * 2.96),
    };
  }, [rooms, lotWidth, levels.length]);

  const metricToPercent = (value: number, total: number, maxPercent = 100) =>
    clamp((value / Math.max(0.01, total)) * 100, 0, maxPercent);

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
      volumes: (Array.isArray(design.volumes) ? design.volumes : []).filter((volume) => volume.id !== selectedVolume.id),
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
    <div className="relative h-[calc(100dvh-64px)] min-h-[520px] overflow-hidden bg-[#eef1f3] md:min-h-[680px]">
      <div className="absolute inset-x-3 top-3 z-30 flex snap-x overflow-x-auto rounded-2xl border bg-white/95 p-1 shadow-lg backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:inset-x-auto md:left-4 md:top-4 md:rounded-xl md:p-0">
        {([
          ["style", Sparkles, "Estilo"],
          ["volumes", Box, "Volumes"],
          ["materials", PaintBucket, "Materiais"],
          ["frames", Box, "Esquadrias"],
          ["outdoor", Sparkles, "Externo"],
          ["lighting", Sun, "Luz"],
        ] as const).map(([value, Icon, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              const same = panel === value;
              setPanel(value);
              setPanelOpen((open) => same ? !open : true);
            }}
            className={panel === value
              ? "flex h-10 shrink-0 snap-center items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white md:rounded-none md:border-r md:last:border-r-0"
              : "flex h-10 shrink-0 snap-center items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 md:rounded-none md:border-r md:last:border-r-0"}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {panelOpen && (
      <div className="fixed inset-x-2 bottom-20 z-40 max-h-[62vh] overflow-auto rounded-3xl border bg-white shadow-2xl md:absolute md:inset-x-auto md:bottom-auto md:left-4 md:top-16 md:z-30 md:w-[286px] md:max-h-[calc(100vh-100px)] md:rounded-2xl md:shadow-xl">
        <button
          type="button"
          onClick={() => setPanelOpen(false)}
          className="absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Fechar painel"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="absolute left-4 top-3 z-10 flex items-center gap-2">
          <span className="rounded-full bg-orange-50 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-orange-600">
            Configurador de fachada
          </span>
        </div>

        {panel === "volumes" && (
          <div className="p-4 pt-11">
            <div className="text-sm font-semibold">Elementos arquitetônicos</div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Insira pórticos, molduras, marquises, sacadas, muro e outros elementos; depois arraste e dimensione diretamente.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {FACADE_VOLUME_PRESETS.map((preset) => (
                <button
                  key={preset.kind}
                  type="button"
                  onClick={() => addVolume(preset.kind)}
                  className="rounded-xl border bg-white p-3 text-left transition hover:border-orange-300 hover:bg-orange-50/40"
                >
                  <FacadePresetThumbnail kind={preset.kind} />
                  <div className="mt-2 text-xs font-semibold">{preset.label}</div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    ≈ {(facadeMetrics.width * preset.width / 100).toFixed(1)} × {(facadeMetrics.height * preset.height / 100).toFixed(1)} m
                  </div>
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
          <div className="p-4 pt-11">
            <div className="text-sm font-semibold">Materiais por elemento</div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Clique na própria fachada ou escolha a superfície abaixo. A alteração alimenta o 3D e o render.
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

        {panel === "frames" && (
          <div className="p-4 pt-11">
            <div className="text-sm font-semibold">Esquadrias e perfis</div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Escolha a linguagem das janelas, portas e perfis sem entrar em parâmetros técnicos.
            </p>

            <div className="mt-4 grid grid-cols-3 gap-2">
              {([
                ["preto", "Preto", "#111827"],
                ["branco", "Branco", "#f8fafc"],
                ["bronze", "Bronze", "#8b6f47"],
              ] as const).map(([value, label, swatch]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    onFacadeChange({ ...facade, frameTone: value });
                    setSelectedSurface("frames");
                  }}
                  className={facade.frameTone === value
                    ? "rounded-xl border-2 border-orange-500 bg-orange-50 p-2 text-center"
                    : "rounded-xl border bg-white p-2 text-center hover:border-slate-300"}
                >
                  <span className="mx-auto block h-10 w-full rounded-lg border" style={{ backgroundColor: swatch }} />
                  <span className="mt-2 block text-[10px] font-bold text-slate-700">{label}</span>
                </button>
              ))}
            </div>

            <div className="mt-5 rounded-xl border bg-slate-50 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Aplicação</div>
              <div className="mt-1 text-xs font-semibold text-slate-800">Janelas, portas e perfis da fachada</div>
              <button
                type="button"
                onClick={() => {
                  setSelectedSurface("frames");
                  setPanel("materials");
                }}
                className="mt-3 w-full rounded-lg border bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:border-orange-300"
              >
                Escolher material dos perfis
              </button>
            </div>
          </div>
        )}

        {panel === "outdoor" && (
          <div className="p-4 pt-11">
            <div className="text-sm font-semibold">Área externa</div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Complete a fachada com jardim, muro, portão, pergolado e elementos externos.
            </p>

            <label className="mt-4 flex items-center justify-between rounded-xl border p-3">
              <span>
                <span className="block text-xs font-semibold">Paisagismo frontal</span>
                <span className="block text-[10px] text-slate-400">Vegetação integrada à composição</span>
              </span>
              <input
                type="checkbox"
                checked={design.showLandscaping}
                onChange={(event) => updateDesign({ showLandscaping: event.target.checked })}
                className="h-4 w-4"
              />
            </label>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {FACADE_VOLUME_PRESETS
                .filter((preset) => ["planter", "wall", "gate", "pergola"].includes(preset.kind))
                .map((preset) => (
                  <button
                    key={preset.kind}
                    type="button"
                    onClick={() => addVolume(preset.kind)}
                    className="overflow-hidden rounded-xl border bg-white text-left hover:border-orange-300 hover:shadow-sm"
                  >
                    <FacadePresetThumbnail kind={preset.kind} />
                    <div className="p-2.5">
                      <div className="text-[11px] font-bold text-slate-800">{preset.label}</div>
                      <div className="mt-0.5 text-[9px] text-slate-400">Adicionar à fachada</div>
                    </div>
                  </button>
                ))}
            </div>

            <div className="mt-5">
              <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Intensidade do jardim</div>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ["leve", "Leve"],
                  ["medio", "Médio"],
                  ["intenso", "Intenso"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onFacadeChange({ ...facade, landscaping: value })}
                    className={facade.landscaping === value
                      ? "rounded-lg border border-orange-400 bg-orange-50 px-2 py-2 text-[10px] font-semibold text-orange-800"
                      : "rounded-lg border px-2 py-2 text-[10px] font-semibold text-slate-600"}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {panel === "lighting" && (
          <div className="p-4 pt-11">
            <div className="text-sm font-semibold">Iluminação e atmosfera</div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Veja a mesma composição em diferentes horários antes do render final.
            </p>

            <div className="mt-4 space-y-2">
              {([
                ["day", "Dia", "Luz neutra para avaliar materiais e proporções."],
                ["sunset", "Fim de tarde", "Luz quente para valorizar volumes e texturas."],
                ["night", "Noite", "Contraste para avaliar iluminação arquitetônica."],
              ] as const).map(([value, label, helper]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateDesign({ lighting: value })}
                  className={design.lighting === value
                    ? "w-full rounded-xl border-2 border-orange-500 bg-orange-50 p-3 text-left"
                    : "w-full rounded-xl border bg-white p-3 text-left hover:border-slate-300"}
                >
                  <div className="flex items-center gap-2">
                    <Sun className="h-4 w-4 text-orange-500" />
                    <span className="text-xs font-bold text-slate-800">{label}</span>
                  </div>
                  <div className="mt-1 text-[10px] leading-4 text-slate-500">{helper}</div>
                </button>
              ))}
            </div>

            {onOpenRender && (
              <button
                type="button"
                onClick={onOpenRender}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white"
              >
                <Sparkles className="h-4 w-4" />
                Gerar render desta opção
              </button>
            )}
          </div>
        )}

        {panel === "style" && (
          <div className="p-4 pt-11">
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
                Gerar fachada renderizada
              </button>
            )}
          </div>
        )}
      </div>
      )}

      <div className="absolute inset-0 grid grid-cols-1 bg-slate-200 md:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <div className="relative min-w-0 overflow-hidden border-r border-slate-200 bg-[#eef1f3]">
          <ConceptDerivedFacade
            lotWidth={lotWidth}
            levels={levels}
            rooms={rooms}
            facade={facade}
            design={design}
            selectedVolumeId={selectedVolumeId}
            onSelectVolume={setSelectedVolumeId}
            onVolumeChange={updateVolume}
            selectedSurface={selectedSurface}
            onSelectSurface={(surface) => {
              if (!surface) return;
              setSelectedSurface(surface);
              setSelectedVolumeId(null);
              setPanel("materials");
              setPanelOpen(true);
            }}
          />

          <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-xl border bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
            <Sun className="h-4 w-4 text-orange-500" />
            <span className="text-xs font-semibold">
              {design.lighting === "day" ? "Dia" : design.lighting === "sunset" ? "Pôr do sol" : "Noite"}
            </span>
          </div>
        </div>

        <aside className="hidden min-w-0 flex-col bg-slate-950 md:flex">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <div className="text-sm font-bold text-white">Visual realista</div>
              <div className="mt-0.5 text-[11px] text-slate-400">Comparação direta com a composição arquitetônica</div>
            </div>
            {realisticPreviewLoading && (
              <span className="rounded-full bg-orange-500/15 px-2.5 py-1 text-[10px] font-bold text-orange-300">Gerando...</span>
            )}
          </div>

          <div className="flex min-h-0 flex-1 items-center justify-center p-4">
            {realisticPreviewUrl ? (
              <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl">
                <img
                  src={realisticPreviewUrl}
                  alt="Prévia realista da fachada"
                  className="max-h-[calc(100dvh-210px)] w-full object-contain"
                />
              </div>
            ) : (
              <div className="w-full rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-orange-400" />
                  <div>
                    <div className="text-sm font-bold text-white">Sua opção de fachada</div>
                    <div className="text-[11px] text-slate-400">Revise a composição antes do render realista.</div>
                  </div>
                </div>

                <div className="mt-5 grid gap-2">
                  {[
                    ["Estilo", STYLE_LABELS.find(([value]) => value === facade.style)?.[1] ?? facade.style],
                    ["Cobertura", facade.roof === "platibanda" ? "Platibanda" : facade.roof === "aparente" ? "Telhado aparente" : "Mista"],
                    ["Parede principal", getFacadeMaterial(design.surfaceMaterials.main).name],
                    ["Destaque", getFacadeMaterial(design.surfaceMaterials.accent).name],
                    ["Esquadrias", facade.frameTone === "preto" ? "Preto" : facade.frameTone === "branco" ? "Branco" : "Bronze"],
                    ["Paisagismo", design.showLandscaping ? facade.landscaping : "Oculto"],
                    ["Iluminação", design.lighting === "day" ? "Dia" : design.lighting === "sunset" ? "Fim de tarde" : "Noite"],
                  ].map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
                      <span className="text-[10px] font-semibold text-slate-400">{label}</span>
                      <span className="text-right text-[11px] font-bold text-white">{value}</span>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={onOpenRender}
                  disabled={realisticPreviewLoading}
                  className="mt-5 w-full rounded-xl bg-orange-500 px-4 py-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  {realisticPreviewLoading ? "Gerando..." : "Gerar fachada realista"}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4">
            <button
              type="button"
              onClick={onOpenRender}
              disabled={realisticPreviewLoading}
              className="rounded-xl bg-orange-500 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50"
            >
              {realisticPreviewUrl ? "Atualizar render" : "Gerar render"}
            </button>
            <button
              type="button"
              onClick={onOpenGallery}
              className="rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-xs font-semibold text-white hover:bg-white/10"
            >
              Abrir galeria
            </button>
          </div>
        </aside>
      </div>

      {selectedVolume && (
        <div className="absolute bottom-4 left-1/2 z-40 w-[min(980px,calc(100vw-120px))] -translate-x-1/2 rounded-2xl border bg-white/96 p-3 shadow-2xl backdrop-blur">
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
              ["x", "Pos. X", facadeMetrics.width, 0, facadeMetrics.width * 0.96, 0.1, 96],
              ["y", "Pos. Y", facadeMetrics.height, 0, facadeMetrics.height * 0.96, 0.05, 96],
              ["width", "Largura", facadeMetrics.width, 0.2, facadeMetrics.width, 0.1, 100],
              ["height", "Altura", facadeMetrics.height, 0.2, facadeMetrics.height, 0.05, 100],
            ] as const).map(([key, label, total, min, max, step, maxPercent]) => (
              <label key={key} className="text-[10px] font-semibold text-slate-500">
                {label} (m)
                <input
                  type="number"
                  min={min}
                  max={max}
                  step={step}
                  value={((selectedVolume[key] / 100) * total).toFixed(2)}
                  onChange={(event) => updateVolume(selectedVolume.id, {
                    [key]: metricToPercent(Number(event.target.value) || 0, total, maxPercent),
                  } as Partial<FacadeVolume>)}
                  className="mt-1 h-9 w-[82px] rounded-lg border px-2 text-xs font-semibold text-slate-800"
                />
              </label>
            ))}

            <label className="text-[10px] font-semibold text-slate-500">
              Prof. (m)
              <input
                type="number"
                min={0}
                max={3}
                step={0.05}
                value={selectedVolume.depth.toFixed(2)}
                onChange={(event) => updateVolume(selectedVolume.id, {
                  depth: clamp(Number(event.target.value) || 0, 0, 3),
                })}
                className="mt-1 h-9 w-[82px] rounded-lg border px-2 text-xs font-semibold text-slate-800"
              />
            </label>

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
