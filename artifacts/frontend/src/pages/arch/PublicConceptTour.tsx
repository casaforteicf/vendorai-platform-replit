import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Maximize2, Play, RotateCcw, Share2 } from "lucide-react";
import ConceptWebGLScene from "./ConceptWebGLScene";
import type { ConceptModelLevel } from "./ConceptModel3D";
import type { ConceptPlanObject } from "./ConceptPlan2D";
import { buildConceptGeometry } from "./conceptGeometry";
import { detectClosedSpaces } from "./conceptWallNetwork";

type SavedTourPoint = {
  id: string;
  name: string;
  floor: number;
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
};

type PublicTourData = {
  id: string;
  title: string;
  lot: { width: number; depth: number };
  configuration: {
    floors?: number;
    wallFirstFloors?: number[];
    customWalls?: Array<{
      id: string;
      floor: number;
      x1: number;
      y1: number;
      x2: number;
      y2: number;
      thickness?: number;
    }>;
    customOpenings?: Array<{
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
    }>;
    spaceProfiles?: Array<{
      id: string;
      floor: number;
      label: string;
      kind: string;
      centroid: { x: number; y: number };
      area: number;
      floorMaterialId?: string;
    }>;
    objects?: ConceptPlanObject[];
    wallMaterials?: Record<string, string>;
    savedTourPoints?: SavedTourPoint[];
  };
  rooms: Array<{
    id: string;
    kind: string;
    label: string;
    width: number;
    depth: number;
    floor: number;
    x: number;
    y: number;
    locked?: boolean;
    floorMaterialId?: string;
  }>;
  openingOverrides?: Record<string, { x: number; y: number; type: "door" | "window" }>;
  facadePreferences?: {
    roof?: "platibanda" | "aparente" | "misto";
  };
  coverImageUrl?: string | null;
  updatedAt?: string;
};

function buildPublicLevels(data: PublicTourData): ConceptModelLevel[] {
  const lotWidth = Math.max(5, Number(data.lot?.width) || 12);
  const lotDepth = Math.max(10, Number(data.lot?.depth) || 30);
  const floors = Math.max(1, Math.min(8, Math.round(Number(data.configuration?.floors) || 1)));
  const rooms = Array.isArray(data.rooms) ? data.rooms : [];
  const wallFirstFloors = Array.isArray(data.configuration?.wallFirstFloors) ? data.configuration.wallFirstFloors : [];
  const customWalls = Array.isArray(data.configuration?.customWalls) ? data.configuration.customWalls : [];
  const customOpenings = Array.isArray(data.configuration?.customOpenings) ? data.configuration.customOpenings : [];
  const spaceProfiles = Array.isArray(data.configuration?.spaceProfiles) ? data.configuration.spaceProfiles : [];
  const wallMaterials = data.configuration?.wallMaterials && typeof data.configuration.wallMaterials === "object"
    ? data.configuration.wallMaterials
    : {};
  const openingOverrides = data.openingOverrides && typeof data.openingOverrides === "object"
    ? data.openingOverrides
    : {};

  return Array.from({ length: floors }, (_, floorIndex) => {
    const base = buildConceptGeometry(rooms as any, lotWidth, lotDepth, floorIndex);
    const geometryOpenings = base.openings.map((opening) => {
      const override = openingOverrides[opening.id];
      return override ? { ...opening, ...override } : opening;
    });
    const wallFirst = wallFirstFloors.includes(floorIndex);
    const floorCustomWalls = customWalls.filter((wall) => wall.floor === floorIndex);
    const legacyWalls = wallFirst ? [] : base.walls;
    const customOpeningMarkers = customOpenings
      .filter((opening) => opening.floor === floorIndex)
      .flatMap((opening) => {
        const wall = floorCustomWalls.find((item) => item.id === opening.wallId);
        if (!wall) return [];
        const offset = Math.max(0.08, Math.min(0.92, Number(opening.offset) || 0.5));
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

    const closedSpaces = detectClosedSpaces(
      [
        ...legacyWalls.map((wall) => ({ id: wall.id, x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 })),
        ...floorCustomWalls.map((wall) => ({ id: wall.id, x1: wall.x1, y1: wall.y1, x2: wall.x2, y2: wall.y2 })),
      ],
      lotWidth,
      lotDepth,
    );

    const labels: Record<string, string> = {};
    const floorMaterials: Record<string, string> = {};
    const usedProfiles = new Set<string>();

    for (const space of closedSpaces) {
      const match = spaceProfiles
        .filter((profile) => profile.floor === floorIndex && !usedProfiles.has(profile.id))
        .map((profile) => {
          const distance = Math.hypot(profile.centroid.x - space.centroid.x, profile.centroid.y - space.centroid.y);
          const areaRatio = Math.abs(profile.area - space.area) / Math.max(1, space.area);
          return { profile, score: distance + areaRatio * 2.5, distance, areaRatio };
        })
        .filter((candidate) => candidate.distance <= 3.5 && candidate.areaRatio <= 0.65)
        .sort((a, b) => a.score - b.score)[0];

      if (match) {
        labels[space.id] = match.profile.label;
        if (match.profile.floorMaterialId) floorMaterials[space.id] = match.profile.floorMaterialId;
        usedProfiles.add(match.profile.id);
      } else if (!wallFirst) {
        const ownerRoom = rooms
          .filter((room) => room.floor === floorIndex)
          .find((room) =>
            space.centroid.x >= room.x - 0.15 &&
            space.centroid.x <= room.x + room.width + 0.15 &&
            space.centroid.y >= room.y - 0.15 &&
            space.centroid.y <= room.y + room.depth + 0.15
          );
        if (ownerRoom?.label) labels[space.id] = ownerRoom.label;
        if (ownerRoom?.floorMaterialId) floorMaterials[space.id] = ownerRoom.floorMaterialId;
      }
    }

    return {
      floor: floorIndex,
      walls: legacyWalls,
      customWalls: floorCustomWalls,
      closedSpaces,
      openings: wallFirst ? customOpeningMarkers : [...geometryOpenings, ...customOpeningMarkers],
      labels,
      floorMaterials,
      wallMaterials: Object.fromEntries(
        [...legacyWalls, ...floorCustomWalls]
          .map((wall) => [wall.id, wallMaterials[wall.id]])
          .filter(([, material]) => Boolean(material)),
      ),
      stairs: rooms
        .filter((room) => room.floor === floorIndex && room.kind === "escada")
        .map((room) => ({ id: room.id, x: room.x, y: room.y, width: room.width, depth: room.depth })),
    };
  });
}

export default function PublicConceptTour() {
  const [, params] = useRoute("/tour/arqdor/:token");
  const token = params?.token ?? "";
  const [data, setData] = useState<PublicTourData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFloor, setActiveFloor] = useState(0);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);
  const [navigationMode, setNavigationMode] = useState<"orbit" | "tour" | "panorama">("orbit");
  const [webglReady, setWebglReady] = useState(false);
  const [viewToken, setViewToken] = useState(0);
  const [started, setStarted] = useState(false);
  const [controlsHidden, setControlsHidden] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/arch/public-tour/${encodeURIComponent(token)}`)
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload?.error ?? "Tour não encontrado.");
        }
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setData(payload as PublicTourData);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Tour não encontrado.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [token]);

  const levels = useMemo(() => data ? buildPublicLevels(data) : [], [data]);
  const savedScenes = data?.configuration?.savedTourPoints ?? [];
  const automaticScenes = useMemo(() => {
    return levels.flatMap((level) =>
      level.closedSpaces
        .filter((space) => Number.isFinite(space.centroid?.x) && Number.isFinite(space.centroid?.y) && space.area >= 1.5)
        .sort((a, b) => b.area - a.area)
        .map((space, index) => ({
          id: `auto:${level.floor}:${space.id}`,
          name: level.labels?.[space.id] ?? `Ambiente ${index + 1}`,
          floor: level.floor,
          area: space.area,
          x: space.centroid.x,
          y: space.centroid.y,
          kind: "auto" as const,
        }))
    );
  }, [levels]);
  const scenes = savedScenes.length
    ? savedScenes.map((scene) => ({ ...scene, kind: "saved" as const }))
    : automaticScenes;
  const activeScene = scenes.length ? scenes[Math.min(activeSceneIndex, scenes.length - 1)] : null;
  const lotWidth = Math.max(5, Number(data?.lot?.width) || 12);
  const lotDepth = Math.max(10, Number(data?.lot?.depth) || 30);
  const objects = Array.isArray(data?.configuration?.objects) ? data!.configuration.objects! : [];

  useEffect(() => {
    if (!activeScene) return;
    setActiveFloor(Math.max(0, Math.min(levels.length - 1, activeScene.floor)));
    setNavigationMode(activeScene.kind === "saved" ? "orbit" : "tour");
    setViewToken((value) => value + 1);
  }, [activeScene?.id, levels.length]);

  const goToScene = (index: number) => {
    if (!scenes.length) return;
    const normalized = ((index % scenes.length) + scenes.length) % scenes.length;
    setActiveSceneIndex(normalized);
  };

  const copyTourLink = async () => {
    try {
      await navigator.clipboard?.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="text-lg font-bold">Arqdor Tour</div>
          <div className="mt-2 text-sm text-slate-400">Carregando experiência 3D...</div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="grid min-h-screen place-items-center bg-slate-950 px-6 text-white">
        <div className="max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center shadow-2xl">
          <div className="text-xl font-bold">Tour indisponível</div>
          <div className="mt-2 text-sm text-slate-400">{error ?? "Este compartilhamento não está mais disponível."}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="absolute inset-0">
        <ConceptWebGLScene
          lotWidth={lotWidth}
          lotDepth={lotDepth}
          activeFloor={activeFloor}
          levels={levels}
          objects={objects}
          showAllFloors={false}
          interiorMode
          showRoof={false}
          roof={data.facadePreferences?.roof ?? "platibanda"}
          lightingMode="day"
          renderQuality="realistic"
          cameraPresetDegrees={35}
          cameraZoom={1.32}
          navigationMode={navigationMode}
          savedCameraViewpoint={activeScene?.kind === "saved"
            ? { ...activeScene, id: `${activeScene.id}:${viewToken}` }
            : null}
          tourPoint={activeScene?.kind === "auto"
            ? {
                x: activeScene.x,
                y: activeScene.y,
                floor: activeScene.floor,
                token: viewToken,
              }
            : null}
          onReady={setWebglReady}
        />
      </div>

      {!started && (
        <div
          className="absolute inset-0 z-50 grid place-items-center bg-slate-950"
          style={data.coverImageUrl ? {
            backgroundImage: `linear-gradient(180deg, rgba(2,6,23,.30), rgba(2,6,23,.88)), url("${data.coverImageUrl}")`,
            backgroundPosition: "center",
            backgroundSize: "cover",
          } : undefined}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(2,6,23,.35)_55%,rgba(2,6,23,.92)_100%)]" />
          <div className="relative mx-auto w-[min(92vw,680px)] rounded-[28px] border border-white/15 bg-slate-950/70 p-6 text-center shadow-2xl backdrop-blur-xl sm:p-9">
            <div className="mx-auto inline-flex items-center rounded-full border border-orange-400/30 bg-orange-500/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.22em] text-orange-300">
              Arqdor Tour
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-white sm:text-4xl">
              {data.title || "Projeto residencial"}
            </h1>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
              Explore o projeto em 3D, navegue pelos ambientes e use o modo Panorama 360° para uma experiência imersiva.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px] font-semibold text-slate-300">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                {levels.length} pavimento{levels.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">
                {scenes.length} cena{scenes.length === 1 ? "" : "s"}
              </span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Panorama 360°</span>
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5">Tela cheia</span>
            </div>
            <button
              type="button"
              onClick={() => setStarted(true)}
              className="mt-7 inline-flex h-12 items-center gap-2 rounded-2xl bg-orange-500 px-6 text-sm font-black text-white shadow-[0_16px_50px_rgba(249,115,22,.28)] transition hover:bg-orange-400"
            >
              <Play className="h-4 w-4 fill-current" />
              Entrar no tour
            </button>
            <div className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              Arraste para olhar · selecione um ambiente para navegar
            </div>
          </div>
        </div>
      )}

      {started && !controlsHidden && (
      <header className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-start justify-between gap-4 bg-gradient-to-b from-slate-950/90 via-slate-950/50 to-transparent p-4 sm:p-6">
        <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 shadow-xl backdrop-blur">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-400">Arqdor Tour</div>
          <h1 className="mt-1 truncate text-lg font-bold sm:text-xl">{data.title || "Projeto residencial"}</h1>
          <div className="mt-1 text-xs text-slate-300">
            {levels.length} pavimento{levels.length === 1 ? "" : "s"} · {scenes.length} cena{scenes.length === 1 ? "" : "s"} {savedScenes.length ? "salva" : "automática"}{scenes.length === 1 ? "" : "s"}
          </div>
        </div>
      </header>
      )}

      {started && controlsHidden && (
        <button
          type="button"
          onClick={() => setControlsHidden(false)}
          className="absolute right-4 top-4 z-40 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-xs font-bold text-white shadow-xl backdrop-blur hover:bg-slate-900 sm:right-6 sm:top-6"
        >
          <Eye className="h-4 w-4" />
          Mostrar controles
        </button>
      )}

      {started && !controlsHidden && (
      <div className="absolute right-4 top-28 z-30 flex flex-col gap-2 sm:right-6">
        <button
          type="button"
          onClick={() => setNavigationMode((mode) => {
            if (mode === "panorama") return activeScene?.kind === "auto" ? "tour" : "orbit";
            return "panorama";
          })}
          disabled={!webglReady}
          className={navigationMode === "panorama"
            ? "inline-flex items-center gap-2 rounded-xl border border-violet-400/40 bg-violet-600 px-3 py-2 text-xs font-bold text-white shadow-xl"
            : "inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-xs font-bold text-white shadow-xl backdrop-blur hover:bg-slate-900 disabled:opacity-50"}
        >
          {navigationMode === "panorama" ? <RotateCcw className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {navigationMode === "panorama" ? "Sair do 360°" : "Panorama 360°"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen?.();
            else void document.documentElement.requestFullscreen?.();
          }}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-xs font-bold text-white shadow-xl backdrop-blur hover:bg-slate-900"
        >
          <Maximize2 className="h-4 w-4" />
          Tela cheia
        </button>
        <button
          type="button"
          onClick={() => void copyTourLink()}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-xs font-bold text-white shadow-xl backdrop-blur hover:bg-slate-900"
        >
          <Share2 className="h-4 w-4" />
          {copied ? "Link copiado" : "Compartilhar"}
        </button>
        <button
          type="button"
          onClick={() => setControlsHidden(true)}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-xs font-bold text-white shadow-xl backdrop-blur hover:bg-slate-900"
        >
          <EyeOff className="h-4 w-4" />
          Ocultar interface
        </button>
      </div>
      )}

      {started && !controlsHidden && (scenes.length > 0 ? (
        <div className="absolute bottom-4 left-1/2 z-30 w-[min(94vw,760px)] -translate-x-1/2 rounded-2xl border border-white/10 bg-slate-950/80 p-2 shadow-2xl backdrop-blur sm:bottom-6">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToScene(activeSceneIndex - 1)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 hover:bg-white/15"
              aria-label="Cena anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto">
              {scenes.map((scene, index) => (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => setActiveSceneIndex(index)}
                  className={index === activeSceneIndex
                    ? "shrink-0 rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-bold text-white"
                    : "shrink-0 rounded-xl px-4 py-2.5 text-xs font-semibold text-slate-300 hover:bg-white/10"}
                >
                  <span className="block">{scene.name || `Cena ${index + 1}`}</span>
                  <span className="mt-0.5 block text-[9px] font-medium opacity-75">
                    Pav. {scene.floor + 1}{scene.kind === "auto" && Number.isFinite(scene.area) ? ` · ${scene.area.toFixed(1)} m²` : ""}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => goToScene(activeSceneIndex + 1)}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 hover:bg-white/15"
              aria-label="Próxima cena"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      ) : (
        <div className="absolute bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/75 px-4 py-2 text-xs font-semibold text-slate-300 shadow-xl backdrop-blur">
          Arraste para explorar o projeto em 3D
        </div>
      ))}

      {started && controlsHidden && activeScene && (
        <div className="pointer-events-none absolute bottom-5 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/70 px-4 py-2 text-xs font-semibold text-white shadow-xl backdrop-blur">
          {activeScene.name || `Cena ${activeSceneIndex + 1}`} · Pav. {activeScene.floor + 1}
        </div>
      )}
    </div>
  );
}
