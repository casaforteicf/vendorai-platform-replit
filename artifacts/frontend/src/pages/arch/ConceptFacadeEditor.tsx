import { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Copy,
  Loader2,
  Lock,
  PaintBucket,
  Plus,
  Sparkles,
  Sun,
  Trash2,
  Unlock,
  WandSparkles,
  X,
} from "lucide-react";
import ConceptDerivedFacade from "./ConceptDerivedFacade";
import type { ConceptFacadePreferences } from "./ConceptVolumetry";
import type { ConceptModelLevel } from "./ConceptModel3D";
import type { ConceptRoomShape } from "./conceptGeometry";
import { normalizeSitePlacement, type SitePlacement } from "./conceptSitePlacement";
import { buildFacadeGeometryContract } from "./conceptFacadeContract";
import { applySiteExteriorToFacade, buildSiteExteriorPlan } from "./conceptSiteExterior";
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
  conceptProjectId?: string | null;
  lotWidth: number;
  lotDepth: number;
  sitePlacement: SitePlacement;
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

export type FacadeStudyResponse = {
  mode: "diagnose" | "develop";
  intervention: "leve" | "moderada" | "marcante";
  geometryLocked?: boolean;
  geometryContractVersion?: "master_facade_v1" | string;
  diagnosis?: {
    score?: number;
    summary?: string;
    strengths?: string[];
    issues?: string[];
    opportunities?: string[];
  } | null;
  concept?: {
    title?: string;
    architecturalDirection?: string;
    entryStrategy?: string;
    roofStrategy?: string;
    materialStrategy?: string;
    landscapeStrategy?: string;
    whyItFitsClient?: string;
  } | null;
  facadeSuggestion?: Partial<ConceptFacadePreferences> | null;
  designSuggestion?: {
    surfaceMaterials?: Partial<FacadeDesignState["surfaceMaterials"]>;
    volumes?: FacadeVolume[];
  } | null;
  openingRecommendations?: Array<{
    type?: "window" | "door";
    recommendation?: string;
    reason?: string;
    requiresClientApproval?: boolean;
  }>;
  warnings?: string[];
};

export type AIDevelopmentResponse = {
  geometryHealth?: { score: number; status: "ok" | "warning" | "error"; messages: string[] };
  layoutSuggestion?: {
    roomPatches?: Array<{
      id: string;
      x: number;
      y: number;
      width: number;
      depth: number;
      reason?: string;
    }>;
    wallSuggestions?: Array<{
      id: string;
      floor: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      thickness?: number;
      reason?: string;
    }>;
    openingSuggestions?: Array<{
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
      reason?: string;
    }>;
  };
  facadeSuggestion?: Partial<ConceptFacadePreferences>;
  notes?: string[];
  geometryWarnings?: string[];
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

const STYLE_DESCRIPTIONS: Record<ConceptFacadePreferences["style"], string> = {
  contemporaneo: "Volumes limpos, grandes vãos e composição horizontal.",
  minimalista: "Poucos elementos, linhas precisas e materiais claros.",
  tropical: "Madeira, sombra, vegetação e aberturas generosas.",
  industrial: "Concreto, metal escuro e volumes marcados.",
  classico_contemporaneo: "Proporções elegantes com leitura atual.",
  rustico_contemporaneo: "Pedra, madeira e volumes mais acolhedores.",
};

// Cada estilo agora muda de fato a fachada (cobertura, materiais, esquadrias e paisagismo).
// Antes só trocava o nome enviado ao render e a elevação continuava igual.
type StylePreset = {
  facade: Partial<ConceptFacadePreferences>;
  materials: Partial<FacadeDesignState["surfaceMaterials"]>;
};

export const FACADE_STYLE_PRESETS: Record<ConceptFacadePreferences["style"], StylePreset> = {
  contemporaneo: {
    facade: { roof: "platibanda", primaryMaterial: "pintura", accentMaterial: "madeira", facadeTone: "claro", frameTone: "preto", landscaping: "medio" },
    materials: { main: "paint-offwhite", accent: "wood-natural", entrance: "wood-natural", garage: "metal-black", frames: "metal-black", paving: "concrete-light" },
  },
  minimalista: {
    facade: { roof: "platibanda", primaryMaterial: "pintura", accentMaterial: "concreto", facadeTone: "claro", frameTone: "preto", landscaping: "leve" },
    materials: { main: "paint-offwhite", accent: "concrete-light", entrance: "paint-greige", garage: "paint-offwhite", frames: "metal-black", paving: "concrete-light" },
  },
  tropical: {
    facade: { roof: "aparente", primaryMaterial: "pintura", accentMaterial: "madeira", facadeTone: "claro", frameTone: "bronze", landscaping: "intenso" },
    materials: { main: "paint-offwhite", accent: "wood-natural", entrance: "wood-dark", garage: "wood-natural", frames: "wood-dark", paving: "stone-sand" },
  },
  industrial: {
    facade: { roof: "platibanda", primaryMaterial: "concreto", accentMaterial: "nenhum", facadeTone: "medio", frameTone: "preto", landscaping: "leve" },
    materials: { main: "concrete-light", accent: "brick-light", entrance: "metal-black", garage: "metal-black", frames: "metal-black", paving: "concrete-dark" },
  },
  classico_contemporaneo: {
    facade: { roof: "aparente", primaryMaterial: "pintura", accentMaterial: "pedra", facadeTone: "medio", frameTone: "bronze", landscaping: "medio" },
    materials: { main: "paint-greige", accent: "stone-sand", entrance: "wood-dark", garage: "paint-greige", frames: "wood-dark", paving: "stone-sand" },
  },
  rustico_contemporaneo: {
    facade: { roof: "misto", primaryMaterial: "pintura", accentMaterial: "pedra", facadeTone: "claro", frameTone: "bronze", landscaping: "intenso" },
    materials: { main: "paint-offwhite", accent: "stone-graphite", entrance: "wood-dark", garage: "wood-dark", frames: "wood-dark", paving: "stone-sand" },
  },
};

export function applyFacadeStylePreset(
  style: ConceptFacadePreferences["style"],
  facade: ConceptFacadePreferences,
  design: FacadeDesignState,
) {
  const preset = FACADE_STYLE_PRESETS[style];
  return {
    facade: { ...facade, ...preset.facade, style },
    design: { ...design, surfaceMaterials: { ...design.surfaceMaterials, ...preset.materials } },
  };
}

function FacadeStylePreview({ style }: { style: ConceptFacadePreferences["style"] }) {
  const industrial = style === "industrial";
  const tropical = style === "tropical";
  const classic = style === "classico_contemporaneo";
  const rustic = style === "rustico_contemporaneo";
  const minimal = style === "minimalista";
  return (
    <div className="relative h-24 overflow-hidden bg-gradient-to-b from-sky-100 via-slate-50 to-stone-100">
      <div className="absolute inset-x-0 bottom-0 h-5 bg-[#dfe5dc]" />
      <div className={`absolute bottom-4 left-[8%] right-[8%] h-14 overflow-hidden shadow-sm ${classic ? "rounded-t-[20px]" : "rounded-sm"} ${industrial ? "bg-zinc-500" : minimal ? "bg-white" : rustic ? "bg-stone-200" : "bg-stone-100"}`}>
        <div className={`absolute inset-y-0 w-[30%] ${style === "contemporaneo" ? "left-[34%] bg-amber-700/60" : tropical ? "right-0 bg-amber-700/65" : industrial ? "left-0 bg-zinc-700" : classic ? "left-[35%] bg-stone-300" : rustic ? "left-0 bg-stone-400/70" : "left-0 bg-white"}`} />
        <div className={`absolute bottom-0 h-9 w-[30%] bg-slate-800 ${style === "contemporaneo" || industrial ? "left-[4%]" : "right-[4%]"}`} />
        <div className={`absolute bottom-3 h-6 w-[25%] border-2 border-slate-700 bg-slate-400/60 ${style === "contemporaneo" || industrial ? "right-[8%]" : "left-[8%]"}`} />
        {tropical && <div className="absolute left-[42%] top-2 h-8 w-2 bg-amber-800/70" />}
        {classic && <div className="absolute inset-x-[18%] top-0 h-2 rounded-full bg-stone-400" />}
        {rustic && <div className="absolute inset-y-0 left-[34%] w-[18%]" style={{ backgroundImage: "repeating-linear-gradient(135deg,#8b735f 0 3px,#b5a18e 3px 6px)" }} />}
      </div>
      <div className={`absolute left-[7%] right-[7%] top-5 h-1.5 ${industrial ? "bg-zinc-700" : minimal ? "bg-slate-300" : classic ? "bg-stone-400" : "bg-blue-400/80"}`} />
      {(tropical || rustic) && (
        <>
          <div className="absolute bottom-2 left-[3%] h-7 w-10 rounded-full bg-emerald-600/60" />
          <div className="absolute bottom-1 right-[4%] h-6 w-12 rounded-full bg-emerald-700/50" />
        </>
      )}
    </div>
  );
}

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
    <div className="relative h-14 w-full rounded-lg bg-gradient-to-br from-slate-50 to-blue-50">
      <div className={`absolute bottom-2 left-5 right-5 top-3 rounded-md shadow-sm ${light}`} />
      <div className={`absolute bottom-2 left-5 h-8 w-2 rounded-sm ${dark}`} />
      <div className={`absolute right-6 top-5 h-5 w-8 rounded-sm ${warm}`} />
    </div>
  );
}

export default function ConceptFacadeEditor({
  conceptProjectId,
  lotWidth,
  lotDepth,
  sitePlacement,
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
  const safeSitePlacement = useMemo(() => normalizeSitePlacement(sitePlacement), [sitePlacement]);
  const [panel, setPanel] = useState<"style" | "volumes" | "materials" | "frames" | "outdoor" | "lighting" | "ai">("style");
  const [panelOpen, setPanelOpen] = useState(() => typeof window === "undefined" ? true : window.innerWidth >= 768);
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [selectedSurface, setSelectedSurface] = useState<FacadeSurfaceKey>("main");
  const [selectedVolumeId, setSelectedVolumeId] = useState<string | null>(null);
  const [elevationMode, setElevationMode] = useState<"material" | "line">("material");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<FacadeStudyResponse | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [facadeIntervention, setFacadeIntervention] = useState<"leve" | "moderada" | "marcante">("moderada");
  const [facadeStudyApplied, setFacadeStudyApplied] = useState(false);
  const dismissedSiteVolumeIdsRef = useRef<Set<string>>(new Set());

  const resolvedConceptProjectId = useMemo(() => {
    if (conceptProjectId) return conceptProjectId;
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("conceptProjectId") ?? params.get("concept_project_id") ?? params.get("id");
  }, [conceptProjectId]);

  const facadeGeometryContract = useMemo(
    () => buildFacadeGeometryContract({
      levels,
      rooms,
      placement: sitePlacement,
      roof: facade.roof,
    }),
    [levels, rooms, sitePlacement, facade.roof],
  );

  const facadeArchitectureStats = useMemo(() => ({
    openings: facadeGeometryContract.openings.length,
    windows: facadeGeometryContract.openings.filter((opening) => opening.type === "window").length,
    doors: facadeGeometryContract.openings.filter((opening) => opening.type === "door").length,
    floors: Math.max(1, facadeGeometryContract.derivedFacade.floors),
    width: facadeGeometryContract.derivedFacade.width,
  }), [facadeGeometryContract]);

  const selectedVolume = useMemo(
    () => design.volumes.find((volume) => volume.id === selectedVolumeId) ?? null,
    [design.volumes, selectedVolumeId],
  );

  const siteExteriorPlan = useMemo(
    () => buildSiteExteriorPlan(rooms, lotWidth, lotDepth, safeSitePlacement),
    [rooms, lotWidth, lotDepth, sitePlacement],
  );

  const siteSynced = design.volumes.some((volume) => volume.label.startsWith("Implantação ·"));
  const siteGeneratedItems = [
    "Muro frontal",
    "Portão da garagem",
    ...siteExteriorPlan.zones.map((zone) => zone.label),
  ];

  useEffect(() => {
    const alreadySynced = design.volumes.some((volume) => volume.label.startsWith("Implantação ·"));
    if (!alreadySynced && dismissedSiteVolumeIdsRef.current.size === 0) {
      onDesignChange(applySiteExteriorToFacade(design, siteExteriorPlan));
    }
  }, [design, onDesignChange, siteExteriorPlan]);

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
    if (selectedVolume.label.startsWith("Implantação ·")) {
      dismissedSiteVolumeIdsRef.current.add(selectedVolume.id);
    }
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

  const runFacadeStudy = async (action: "diagnose" | "develop") => {
    if (!resolvedConceptProjectId || aiBusy) return;
    setAiBusy(true);
    setAiError(null);
    if (action === "develop") setFacadeStudyApplied(false);
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("vendorai_token") : null;
      const response = await fetch(`/api/arch/concept-projects/${resolvedConceptProjectId}/facade-study`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          action,
          intervention: facadeIntervention,
          facade,
          facadeDesign: design,
          geometryContract: facadeGeometryContract,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error ?? "Falha no estudo de fachada com IA.");
      setAiResult(payload as FacadeStudyResponse);
      setPanel("ai");
      setPanelOpen(true);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : "Falha no estudo de fachada com IA.");
    } finally {
      setAiBusy(false);
    }
  };

  const applyFacadeStudy = () => {
    if (!aiResult || aiResult.mode !== "develop") return;
    if (aiResult.facadeSuggestion) {
      onFacadeChange({ ...facade, ...aiResult.facadeSuggestion });
    }
    if (aiResult.designSuggestion) {
      const generatedVolumes = Array.isArray(aiResult.designSuggestion.volumes)
        ? aiResult.designSuggestion.volumes
        : [];
      const existingManualVolumes = design.volumes.filter((volume) => !volume.id.startsWith("ai-facade-"));
      onDesignChange({
        ...design,
        surfaceMaterials: {
          ...design.surfaceMaterials,
          ...(aiResult.designSuggestion.surfaceMaterials ?? {}),
        },
        volumes: [...existingManualVolumes, ...generatedVolumes],
      });
    }
    setFacadeStudyApplied(true);
  };

  return (
    <div className="relative h-[calc(100dvh-64px)] min-h-[520px] overflow-hidden bg-[#eef1f3] md:min-h-[680px]">
      <div className="absolute inset-x-3 top-2 z-30 flex snap-x overflow-x-auto rounded-2xl border bg-white/95 p-1 shadow-lg backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:inset-x-auto md:left-4 md:top-4 md:rounded-xl md:p-0">
        {([
          ["style", Sparkles, "Estilo"],
          ["volumes", Box, "Volumes"],
          ["materials", PaintBucket, "Materiais"],
          ["frames", Box, "Esquadrias"],
          ["outdoor", Sparkles, "Externo"],
          ["lighting", Sun, "Luz"],
          ["ai", WandSparkles, "IA"],
        ] as const).map(([value, Icon, label]) => (
          <button
            key={value}
            type="button"
            aria-expanded={panelOpen && panel === value}
            onClick={() => {
              const same = panel === value;
              if (!same) setPanelExpanded(false);
              setPanel(value);
              setPanelOpen((open) => same ? !open : true);
            }}
            className={[
              panel === value
                ? "flex h-10 shrink-0 snap-center items-center gap-2 rounded-xl bg-slate-900 px-3 text-xs font-semibold text-white md:rounded-none md:border-r md:last:border-r-0"
                : "flex h-10 shrink-0 snap-center items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-slate-600 hover:bg-slate-50 md:rounded-none md:border-r md:last:border-r-0",
              value === "frames" || value === "lighting" ? "hidden md:flex" : "",
            ].join(" ")}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {panelOpen && (
      <div role="region" aria-label="Propriedades da fachada" className={`fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-40 ${panelExpanded ? "max-h-[75dvh]" : "max-h-[40dvh]"} overflow-auto overscroll-contain rounded-t-[28px] border border-b-0 bg-white shadow-[0_-18px_50px_rgba(15,23,42,0.22)] md:absolute md:inset-x-auto md:bottom-auto md:left-4 md:top-16 md:z-30 md:w-[286px] md:max-h-[calc(100vh-100px)] md:rounded-2xl md:border md:shadow-xl`}>
        <button type="button" onClick={() => setPanelExpanded((expanded) => !expanded)}
          aria-expanded={panelExpanded} aria-label={panelExpanded ? "Reduzir painel" : "Expandir painel"}
          className="sticky top-0 z-20 flex h-8 w-full items-center justify-center bg-white md:hidden">
          <span className="h-1 w-10 rounded-full bg-slate-300" />
        </button>
        <button
          type="button"
          onClick={() => setPanelOpen(false)}
          className="absolute right-2 top-2 z-30 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Fechar painel"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="absolute left-4 top-3 z-10 flex items-center gap-2">
          <span className="rounded-full bg-blue-50 px-2 py-1 text-[9px] font-bold uppercase tracking-[0.12em] text-blue-600">
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
                  className="rounded-xl border bg-white p-3 text-left transition hover:border-blue-300 hover:bg-blue-50/40"
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
                        ? "flex w-full items-center justify-between rounded-lg border border-blue-400 bg-blue-50 px-3 py-2 text-left"
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

        {panel === "ai" && (
          <div className="p-4 pt-11">
            <div className="text-sm font-semibold">Estudo de Fachada com IA</div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Primeiro a IA analisa a fachada derivada da planta. Depois desenvolve materiais e elementos compatíveis sem alterar paredes, pavimentos, aberturas ou cobertura do Projeto Mestre.
            </p>
            <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-[10px] font-semibold text-emerald-800">
              Fidelidade arquitetônica bloqueada · fachada vinculada à geometria aprovada
            </div>

            <div className="mt-4 rounded-xl border bg-slate-50 p-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">Nível de intervenção</div>
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {([
                  ["leve", "Leve"],
                  ["moderada", "Moderada"],
                  ["marcante", "Marcante"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFacadeIntervention(value)}
                    className={facadeIntervention === value
                      ? "rounded-lg bg-slate-950 px-2 py-2 text-[10px] font-bold text-white"
                      : "rounded-lg border bg-white px-2 py-2 text-[10px] font-bold text-slate-600"}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="mt-2 text-[9px] leading-4 text-slate-500">
                {facadeIntervention === "leve"
                  ? "Materiais, cores, paisagismo e detalhes."
                  : facadeIntervention === "moderada"
                    ? "Pode propor pórtico, marquise, painel, ripado e cobertura compatível."
                    : "Composição mais autoral, sem transformar o projeto em outra casa."}
              </div>
            </div>

            <div className="mt-3 grid gap-2">
              <button
                type="button"
                onClick={() => void runFacadeStudy("diagnose")}
                disabled={!resolvedConceptProjectId || aiBusy}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-xs font-bold text-slate-800 disabled:opacity-50"
              >
                {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                1. Analisar fachada atual
              </button>
              <button
                type="button"
                onClick={() => void runFacadeStudy("develop")}
                disabled={!resolvedConceptProjectId || aiBusy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-3 py-3 text-xs font-bold text-white shadow-sm disabled:opacity-50"
              >
                {aiBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <WandSparkles className="h-4 w-4" />}
                2. Desenvolver proposta de fachada
              </button>
            </div>

            {!resolvedConceptProjectId && (
              <p className="mt-2 text-[10px] text-amber-700">Salve o pré-projeto antes de iniciar o estudo de fachada.</p>
            )}
            {aiError && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] text-red-700">{aiError}</div>}

            {aiResult?.diagnosis && (
              <div className="mt-4 space-y-3 rounded-xl border bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700">Diagnóstico arquitetônico</span>
                  <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-700">
                    {Math.max(0, Math.min(100, Number(aiResult.diagnosis.score ?? 0)))}/100
                  </span>
                </div>
                {aiResult.diagnosis.summary && (
                  <p className="text-[10px] leading-4 text-slate-600">{aiResult.diagnosis.summary}</p>
                )}
                {!!aiResult.diagnosis.strengths?.length && (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5">
                    <div className="text-[9px] font-bold uppercase text-emerald-700">Pontos fortes</div>
                    <ul className="mt-1 space-y-1 text-[10px] leading-4 text-emerald-900">
                      {aiResult.diagnosis.strengths.slice(0,4).map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  </div>
                )}
                {!!aiResult.diagnosis.issues?.length && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                    <div className="text-[9px] font-bold uppercase text-amber-700">O que melhorar</div>
                    <ul className="mt-1 space-y-1 text-[10px] leading-4 text-amber-900">
                      {aiResult.diagnosis.issues.slice(0,5).map((item) => <li key={item}>• {item}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {aiResult?.concept && (
              <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-700">
                  {aiResult.concept.title || "Proposta de fachada"}
                </div>
                {aiResult.concept.architecturalDirection && (
                  <p className="mt-1 text-[10px] leading-4 text-blue-950">{aiResult.concept.architecturalDirection}</p>
                )}
                <div className="mt-2 space-y-1 text-[10px] leading-4 text-slate-700">
                  {aiResult.concept.entryStrategy && <div><b>Entrada:</b> {aiResult.concept.entryStrategy}</div>}
                  {aiResult.concept.roofStrategy && <div><b>Cobertura:</b> {aiResult.concept.roofStrategy}</div>}
                  {aiResult.concept.materialStrategy && <div><b>Materiais:</b> {aiResult.concept.materialStrategy}</div>}
                  {aiResult.concept.landscapeStrategy && <div><b>Paisagismo:</b> {aiResult.concept.landscapeStrategy}</div>}
                  {aiResult.concept.whyItFitsClient && <div><b>DNA do cliente:</b> {aiResult.concept.whyItFitsClient}</div>}
                </div>
              </div>
            )}

            {!!aiResult?.openingRecommendations?.length && (
              <div className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                <div className="text-[9px] font-bold uppercase text-cyan-700">Aberturas — somente recomendação</div>
                <ul className="mt-1 space-y-1 text-[10px] leading-4 text-cyan-900">
                  {aiResult.openingRecommendations.slice(0,5).map((item, index) => (
                    <li key={index}>• {item.recommendation}{item.reason ? ` — ${item.reason}` : ""}</li>
                  ))}
                </ul>
              </div>
            )}

            {aiResult?.mode === "develop" && (aiResult.facadeSuggestion || aiResult.designSuggestion) && (
              <button
                type="button"
                onClick={applyFacadeStudy}
                className="mt-3 w-full rounded-xl border border-blue-300 bg-white px-3 py-3 text-[11px] font-bold text-blue-700"
              >
                3. Aplicar proposta ao projeto
              </button>
            )}

            {facadeStudyApplied && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[10px] leading-4 text-emerald-800">
                Proposta aplicada à fachada atual. Revise o modelo e, quando estiver aprovado, gere o render fotorealista.
              </div>
            )}

            <button
              type="button"
              onClick={onOpenRender}
              disabled={realisticPreviewLoading || !onOpenRender || aiBusy}
              className="mt-3 w-full rounded-xl bg-slate-950 px-3 py-3 text-xs font-bold text-white disabled:opacity-50"
            >
              {realisticPreviewLoading ? "Renderizando..." : "4. Gerar render da fachada"}
            </button>
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
                    ? "rounded-lg border border-blue-400 bg-blue-50 px-2.5 py-2 text-left text-[11px] font-semibold text-blue-800"
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
                      ? "overflow-hidden rounded-xl border-2 border-blue-500 bg-white text-left"
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
                    ? "rounded-xl border-2 border-blue-500 bg-blue-50 p-2 text-center"
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
                className="mt-3 w-full rounded-lg border bg-white px-3 py-2 text-[11px] font-bold text-slate-700 hover:border-blue-300"
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

            <div className="mt-4 overflow-hidden rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 to-white">
              <div className="border-b border-blue-100 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-blue-600">Implantação vinculada</div>
                  <span className={siteSynced ? "rounded-full bg-emerald-100 px-2 py-1 text-[9px] font-bold text-emerald-700" : "rounded-full bg-slate-100 px-2 py-1 text-[9px] font-bold text-slate-600"}>
                    {siteSynced ? "Sincronizada" : "Pendente"}
                  </span>
                </div>
                <div className="mt-2 text-xs font-bold text-slate-900">
                  {siteExteriorPlan.frontLabel} · garagem {siteExteriorPlan.garageSide === "left" ? "à esquerda" : siteExteriorPlan.garageSide === "right" ? "à direita" : siteExteriorPlan.garageSide === "center" ? "central" : "não identificada"}
                </div>
                <div className="mt-1 text-[10px] leading-4 text-slate-500">{siteExteriorPlan.leisureSummary}</div>
              </div>

              <div className="p-3">
                <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Gerado a partir do terreno</div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {siteGeneratedItems.map((item) => (
                    <span key={item} className="rounded-full border bg-white px-2 py-1 text-[9px] font-semibold text-slate-600">
                      {item}
                    </span>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    dismissedSiteVolumeIdsRef.current.clear();
                    onDesignChange(applySiteExteriorToFacade(design, siteExteriorPlan));
                  }}
                  className="mt-3 w-full rounded-xl bg-slate-950 px-3 py-2.5 text-[11px] font-bold text-white"
                >
                  {siteSynced ? "Reaplicar implantação" : "Aplicar implantação ao exterior"}
                </button>
                <div className="mt-2 text-center text-[9px] leading-4 text-slate-400">
                  Mantém casa, acessos, circulação, jardim e lazer coerentes com a planta e o terreno.
                </div>
              </div>
            </div>

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
                    className="overflow-hidden rounded-xl border bg-white text-left hover:border-blue-300 hover:shadow-sm"
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
                      ? "rounded-lg border border-blue-400 bg-blue-50 px-2 py-2 text-[10px] font-semibold text-blue-800"
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
                    ? "w-full rounded-xl border-2 border-blue-500 bg-blue-50 p-3 text-left"
                    : "w-full rounded-xl border bg-white p-3 text-left hover:border-slate-300"}
                >
                  <div className="flex items-center gap-2">
                    <Sun className="h-4 w-4 text-blue-500" />
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
              disabled={realisticPreviewLoading || !onOpenRender}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white"
              >
                <Sparkles className="h-4 w-4" />
                Gerar imagem realista
              </button>
            )}
          </div>
        )}

        {panel === "style" && (
          <div className="p-4 pt-11">
            <div className="text-sm font-semibold">Estudos arquitetônicos de fachada</div>
            <p className="mt-1 text-[11px] leading-5 text-slate-500">
              Compare linguagens diferentes sobre a mesma arquitetura. As opções mudam composição, materiais e cobertura, mas preservam a geometria da planta e todas as aberturas cadastradas.
            </p>

            <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <div className="flex items-center gap-2 text-[10px] font-bold text-emerald-800">
                <Lock className="h-3.5 w-3.5" />
                Projeto Mestre protegido
              </div>
              <div className="mt-1 text-[9px] leading-4 text-emerald-700">
                {facadeArchitectureStats.floors} pavimento{facadeArchitectureStats.floors > 1 ? "s" : ""} · {facadeArchitectureStats.width.toFixed(1)} m de frente construída · {facadeArchitectureStats.openings} abertura{facadeArchitectureStats.openings !== 1 ? "s" : ""} ({facadeArchitectureStats.windows} janela{facadeArchitectureStats.windows !== 1 ? "s" : ""} + {facadeArchitectureStats.doors} porta{facadeArchitectureStats.doors !== 1 ? "s" : ""})
              </div>
            </div>

            <div className="mt-4 flex snap-x gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:grid md:grid-cols-2 md:overflow-visible md:pb-0">
              {STYLE_LABELS.map(([value, label], index) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => {
                    const next = applyFacadeStylePreset(value, facade, design);
                    onFacadeChange(next.facade);
                    onDesignChange(next.design);
                  }}
                  className={facade.style === value
                    ? "w-[76%] shrink-0 snap-center overflow-hidden rounded-2xl border-2 border-blue-500 bg-blue-50 text-left shadow-sm md:w-auto"
                    : "w-[76%] shrink-0 snap-center overflow-hidden rounded-2xl border bg-white text-left hover:border-slate-300 hover:shadow-sm md:w-auto"}
                >
                  <div className="h-24 w-full overflow-hidden bg-slate-50" aria-hidden="true">
                    {rooms.length > 0 ? (
                      <ConceptDerivedFacade
                        viewMode="material"
                        lotWidth={lotWidth}
                        levels={levels}
                        rooms={rooms}
                        sitePlacement={safeSitePlacement}
                        {...(() => {
                          const preview = applyFacadeStylePreset(value, facade, { ...design, volumes: [] });
                          return { facade: preview.facade, design: preview.design };
                        })()}
                      />
                    ) : (
                      <FacadeStylePreview style={value} />
                    )}
                  </div>
                  <div className="p-2.5">
                    <div className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-400">Opção {String(index + 1).padStart(2, "0")}</div>
                    <div className="mt-0.5 text-[11px] font-bold text-slate-800">{label}</div>
                    <div className="mt-1 min-h-[32px] text-[9px] leading-4 text-slate-500">{STYLE_DESCRIPTIONS[value]}</div>
                    <div className={facade.style === value ? "mt-2 text-[9px] font-bold text-blue-600" : "mt-2 text-[9px] font-bold text-slate-400"}>
                      {facade.style === value ? "Opção em estudo" : "Comparar esta opção"}
                    </div>
                  </div>
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
                      ? "rounded-lg border border-blue-400 bg-blue-50 px-2 py-2 text-[10px] font-semibold text-blue-800"
                      : "rounded-lg border px-2 py-2 text-[10px] font-semibold text-slate-600"}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {facade.roof !== "platibanda" && (
                <div className="mt-3 rounded-xl border bg-slate-50 p-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Cobertura paramétrica</div>
                  <div className="mt-3">
                    <div className="mb-1 text-[9px] font-semibold text-slate-500">Número de águas</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([1, 2, 4] as const).map((waters) => (
                        <button
                          key={waters}
                          type="button"
                          onClick={() => updateDesign({
                            roofConfig: {
                              ...(DEFAULT_FACADE_DESIGN.roofConfig!),
                              ...(design.roofConfig ?? {}),
                              waters,
                            },
                          })}
                          className={(design.roofConfig?.waters ?? DEFAULT_FACADE_DESIGN.roofConfig!.waters) === waters
                            ? "rounded-lg bg-slate-950 px-2 py-2 text-[10px] font-bold text-white"
                            : "rounded-lg border bg-white px-2 py-2 text-[10px] font-bold text-slate-600"}
                        >
                          {waters} água{waters > 1 ? "s" : ""}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="mt-3 block">
                    <span className="flex items-center justify-between text-[9px] font-semibold text-slate-500">
                      <span>Inclinação</span>
                      <strong>{Math.round(design.roofConfig?.pitchDegrees ?? DEFAULT_FACADE_DESIGN.roofConfig!.pitchDegrees)}°</strong>
                    </span>
                    <input
                      type="range"
                      min={3}
                      max={55}
                      step={1}
                      value={design.roofConfig?.pitchDegrees ?? DEFAULT_FACADE_DESIGN.roofConfig!.pitchDegrees}
                      onChange={(event) => updateDesign({
                        roofConfig: {
                          ...(DEFAULT_FACADE_DESIGN.roofConfig!),
                          ...(design.roofConfig ?? {}),
                          pitchDegrees: Number(event.target.value),
                        },
                      })}
                      className="mt-1 w-full"
                    />
                  </label>

                  <label className="mt-3 block">
                    <span className="flex items-center justify-between text-[9px] font-semibold text-slate-500">
                      <span>Beiral</span>
                      <strong>{(design.roofConfig?.overhang ?? DEFAULT_FACADE_DESIGN.roofConfig!.overhang).toFixed(2)} m</strong>
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.05}
                      value={design.roofConfig?.overhang ?? DEFAULT_FACADE_DESIGN.roofConfig!.overhang}
                      onChange={(event) => updateDesign({
                        roofConfig: {
                          ...(DEFAULT_FACADE_DESIGN.roofConfig!),
                          ...(design.roofConfig ?? {}),
                          overhang: Number(event.target.value),
                        },
                      })}
                      className="mt-1 w-full"
                    />
                  </label>

                  <div className="mt-3">
                    <div className="mb-1 text-[9px] font-semibold text-slate-500">Direção da cumeeira</div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {([
                        ["auto", "Automática"],
                        ["x", "Horizontal"],
                        ["y", "Vertical"],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => updateDesign({
                            roofConfig: {
                              ...(DEFAULT_FACADE_DESIGN.roofConfig!),
                              ...(design.roofConfig ?? {}),
                              ridgeDirection: value,
                            },
                          })}
                          className={(design.roofConfig?.ridgeDirection ?? DEFAULT_FACADE_DESIGN.roofConfig!.ridgeDirection) === value
                            ? "rounded-lg bg-slate-950 px-1.5 py-2 text-[9px] font-bold text-white"
                            : "rounded-lg border bg-white px-1.5 py-2 text-[9px] font-bold text-slate-600"}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className="mt-3 flex items-center justify-between rounded-lg border bg-white px-2.5 py-2">
                    <span className="text-[10px] font-semibold text-slate-600">Calhas automáticas</span>
                    <input
                      type="checkbox"
                      checked={design.roofConfig?.gutter ?? DEFAULT_FACADE_DESIGN.roofConfig!.gutter}
                      onChange={(event) => updateDesign({
                        roofConfig: {
                          ...(DEFAULT_FACADE_DESIGN.roofConfig!),
                          ...(design.roofConfig ?? {}),
                          gutter: event.target.checked,
                        },
                      })}
                    />
                  </label>
                </div>
              )}

              {facade.roof === "platibanda" && (
                <label className="mt-3 block rounded-xl border bg-slate-50 p-3">
                  <span className="flex items-center justify-between text-[9px] font-semibold text-slate-500">
                    <span>Altura da platibanda</span>
                    <strong>{(design.roofConfig?.parapetHeight ?? DEFAULT_FACADE_DESIGN.roofConfig!.parapetHeight).toFixed(2)} m</strong>
                  </span>
                  <input
                    type="range"
                    min={0.2}
                    max={1.6}
                    step={0.05}
                    value={design.roofConfig?.parapetHeight ?? DEFAULT_FACADE_DESIGN.roofConfig!.parapetHeight}
                    onChange={(event) => updateDesign({
                      roofConfig: {
                        ...(DEFAULT_FACADE_DESIGN.roofConfig!),
                        ...(design.roofConfig ?? {}),
                        parapetHeight: Number(event.target.value),
                      },
                    })}
                    className="mt-2 w-full"
                  />
                </label>
              )}
            </div>

            <button
              type="button"
              onClick={() => setPanel("volumes")}
              className="mt-5 w-full rounded-xl bg-slate-950 px-4 py-3 text-xs font-bold text-white"
            >
              Continuar para volumes
            </button>
          </div>
        )}
      </div>
      )}

      <div className={`absolute inset-x-0 bottom-0 top-14 grid grid-cols-1 bg-slate-200 md:top-16 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] ${panelOpen ? "md:left-[316px]" : ""}`}>
        <div className="relative min-w-0 overflow-hidden border-r border-slate-200 bg-white">
          <div className="absolute inset-x-0 bottom-[calc(11.5rem+env(safe-area-inset-bottom))] top-28 md:bottom-20 md:top-0 xl:inset-0">
          <ConceptDerivedFacade
            viewMode={elevationMode}
            lotWidth={lotWidth}
            levels={levels}
            rooms={rooms}
            sitePlacement={safeSitePlacement}
            facade={facade}
            design={design}
            selectedVolumeId={selectedVolumeId}
            onSelectVolume={(id) => {
              setSelectedVolumeId(id);
              if (id) { setPanel("volumes"); setPanelOpen(false); }
            }}
            onVolumeChange={updateVolume}
            selectedSurface={panel === "materials" && panelOpen ? selectedSurface : null}
            onSelectSurface={(surface) => {
              if (!surface) return;
              setSelectedSurface(surface);
              setSelectedVolumeId(null);
              setPanel("materials");
              setPanelOpen(true);
            }}
          />
          </div>

          <div className="absolute left-4 top-16 z-20 flex rounded-xl border bg-white/95 p-1 shadow-sm backdrop-blur md:top-4">
            {([["material", "Cores"], ["line", "Linhas"]] as const).map(([value, label]) => (
              <button
                key={value}
                type="button"
                onClick={() => setElevationMode(value)}
                className={elevationMode === value
                  ? "min-h-8 rounded-lg bg-slate-950 px-3 text-xs font-bold text-white"
                  : "min-h-8 rounded-lg px-3 text-xs font-semibold text-slate-600"}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="absolute right-4 top-16 z-20 flex items-center gap-2 rounded-xl border bg-white/95 px-3 py-2 shadow-sm backdrop-blur md:top-4">
            <Sun className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-semibold">
              {design.lighting === "day" ? "Dia" : design.lighting === "sunset" ? "Pôr do sol" : "Noite"}
            </span>
          </div>
        </div>

        <div className="absolute inset-x-3 bottom-[calc(7.25rem+env(safe-area-inset-bottom))] z-20 flex gap-2 md:inset-x-auto md:bottom-4 md:right-4 xl:hidden">
          <button type="button" onClick={onOpenRender} disabled={realisticPreviewLoading || !onOpenRender}
            className="min-h-12 flex-1 rounded-xl bg-blue-500 px-4 py-3 text-sm font-bold text-white shadow-lg disabled:opacity-50 md:min-h-0 md:flex-none md:text-xs">
            {realisticPreviewLoading ? "Gerando..." : "Gerar imagem realista"}
          </button>
          <button type="button" onClick={onOpenGallery} className="min-h-12 rounded-xl border bg-white px-4 py-3 text-sm font-semibold shadow-lg md:min-h-0 md:text-xs">
            Galeria
          </button>
        </div>
        <aside className="hidden min-w-0 flex-col bg-slate-950 xl:flex">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <div className="text-sm font-bold text-white">Estudo arquitetônico</div>
              <div className="mt-0.5 text-[11px] text-slate-400">Elevação fiel à planta + visualização fotorealista</div>
            </div>
            {realisticPreviewLoading && (
              <span className="rounded-full bg-blue-500/15 px-2.5 py-1 text-[10px] font-bold text-blue-300">Gerando...</span>
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
                  <Sparkles className="h-5 w-5 text-blue-400" />
                  <div>
                    <div className="text-sm font-bold text-white">Composição vinculada à planta</div>
                    <div className="text-[11px] text-slate-400">Volumes e acabamentos podem evoluir sem deslocar portas, janelas ou paredes.</div>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  {[
                    ["Pavimentos", facadeArchitectureStats.floors],
                    ["Janelas", facadeArchitectureStats.windows],
                    ["Portas", facadeArchitectureStats.doors],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-emerald-400/20 bg-emerald-400/10 px-2 py-2 text-center">
                      <div className="text-[13px] font-bold text-emerald-300">{value}</div>
                      <div className="text-[8px] font-semibold uppercase tracking-[0.08em] text-emerald-200/70">{label}</div>
                    </div>
                  ))}
                </div>

                <div className="mt-4 grid gap-2">
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
              disabled={realisticPreviewLoading || !onOpenRender}
                  className="mt-5 w-full rounded-xl bg-blue-500 px-4 py-3 text-xs font-bold text-white disabled:opacity-50"
                >
                  {realisticPreviewLoading ? "Gerando..." : "Gerar visualização fotorealista"}
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 border-t border-white/10 p-4">
            <button
              type="button"
              onClick={onOpenRender}
              disabled={realisticPreviewLoading || !onOpenRender}
              className="rounded-xl bg-blue-500 px-3 py-2.5 text-xs font-bold text-white disabled:opacity-50"
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
        <div className="absolute bottom-20 left-3 right-3 z-40 max-h-[42dvh] overflow-y-auto overscroll-contain rounded-2xl border bg-white/96 p-3 shadow-2xl backdrop-blur md:bottom-4 md:left-1/2 md:right-auto md:w-[min(980px,calc(100vw-120px))] md:-translate-x-1/2">
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
