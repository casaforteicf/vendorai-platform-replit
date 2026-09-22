import { useEffect, useMemo, useState } from "react";
import { useRoute } from "wouter";
import { ChevronLeft, ChevronRight, Eye, Maximize2, RotateCcw } from "lucide-react";
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
  const [navigationMode, setNavigationMode] = useState<"orbit" | "panorama">("orbit");
  const [webglReady, setWebglReady] = useState(false);
  const [viewToken, setViewToken] = useState(0);

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
  const scenes = data?.configuration?.savedTourPoints ?? [];
  const activeScene = scenes.length ? scenes[Math.min(activeSceneIndex, scenes.length - 1)] : null;
  const lotWidth = Math.max(5, Number(data?.lot?.width) || 12);
  const lotDepth = Math.max(10, Number(data?.lot?.depth) || 30);
  const objects = Array.isArray(data?.configuration?.objects) ? data!.configuration.objects! : [];

  useEffect(() => {
    if (!activeScene) return;
    setActiveFloor(Math.max(0, Math.min(levels.length - 1, activeScene.floor)));
    setNavigationMode("orbit");
    setViewToken((value) => value + 1);
  }, [activeScene?.id, levels.length]);

  const goToScene = (index: number) => {
    if (!scenes.length) return;
    const normalized = ((index % scenes.length) + scenes.length) % scenes.length;
    setActiveSceneIndex(normalized);
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
          savedCameraViewpoint={activeScene ? { ...activeScene, id: `${activeScene.id}:${viewToken}` } : null}
          onReady={setWebglReady}
        />
      </div>

      <header className="pointer-events-none absolute left-0 right-0 top-0 z-30 flex items-start justify-between gap-4 bg-gradient-to-b from-slate-950/90 via-slate-950/50 to-transparent p-4 sm:p-6">
        <div className="min-w-0 rounded-2xl border border-white/10 bg-slate-950/55 px-4 py-3 shadow-xl backdrop-blur">
          <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-orange-400">Arqdor Tour</div>
          <h1 className="mt-1 truncate text-lg font-bold sm:text-xl">{data.title || "Projeto residencial"}</h1>
          <div className="mt-1 text-xs text-slate-300">
            {levels.length} pavimento{levels.length === 1 ? "" : "s"} · {scenes.length} cena{scenes.length === 1 ? "" : "s"}
          </div>
        </div>
      </header>

      <div className="absolute right-4 top-28 z-30 flex flex-col gap-2 sm:right-6">
        <button
          type="button"
          onClick={() => setNavigationMode((mode) => mode === "panorama" ? "orbit" : "panorama")}
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
      </div>

      {scenes.length > 0 ? (
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
                  {scene.name || `Cena ${index + 1}`}
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
      )}
    </div>
  );
}
