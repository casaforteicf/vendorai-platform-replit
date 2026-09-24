import { buildFacadeMeshBoxes } from "./conceptFacadeMeshes";
import { useRef, useState } from "react";
import type { ConceptFacadePreferences } from "./ConceptVolumetry";
import { normalizeSitePlacement, type SitePlacement } from "./conceptSitePlacement";
import { buildDerivedFacadeModel } from "./conceptFacadeGeometry";
import {
  FACADE_MATERIALS,
  getFacadeMaterial,
  type FacadeDesignState,
  type FacadeSurfaceKey,
  type FacadeVolume,
} from "./conceptFacadeDesign";
import type { ConceptModelLevel } from "./ConceptModel3D";
import type { ConceptRoomShape } from "./conceptGeometry";

type Props = {
  lotWidth: number;
  levels: ConceptModelLevel[];
  rooms: ConceptRoomShape[];
  sitePlacement: SitePlacement;
  facade: ConceptFacadePreferences;
  design?: FacadeDesignState;
  selectedVolumeId?: string | null;
  onSelectVolume?: (id: string | null) => void;
  onVolumeChange?: (id: string, patch: Partial<FacadeVolume>) => void;
  selectedSurface?: FacadeSurfaceKey | null;
  onSelectSurface?: (surface: FacadeSurfaceKey | null) => void;
  viewMode?: "line" | "material";
};


function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function facadePalette(facade: ConceptFacadePreferences, design?: FacadeDesignState) {
  const wall =
    facade.primaryMaterial === "madeira" ? "#c9a47f" :
    facade.primaryMaterial === "pedra" ? "#d9d4cc" :
    facade.primaryMaterial === "concreto" ? "#c9ced2" :
    facade.facadeTone === "escuro" ? "#6f7479" :
    facade.facadeTone === "medio" ? "#d9d6d0" : "#f2f0eb";

  const wallShade =
    facade.facadeTone === "escuro" ? "#5f6469" :
    facade.facadeTone === "medio" ? "#c8c4bd" : "#dfdcd5";

  const accent =
    facade.accentMaterial === "madeira" ? "#986848" :
    facade.accentMaterial === "pedra" ? "#8f8980" :
    facade.accentMaterial === "concreto" ? "#747b81" : "#b9b4ac";

  const frame =
    facade.frameTone === "branco" ? "#f5f7f8" :
    facade.frameTone === "bronze" ? "#735a45" : "#202428";

  const roof =
    facade.style === "rustico_contemporaneo" ? "#675044" :
    facade.style === "classico_contemporaneo" ? "#6e5143" :
    facade.facadeTone === "escuro" ? "#454a4e" : "#565b60";

  const mainMaterial = design ? getFacadeMaterial(design.surfaceMaterials.main) : null;
  const accentMaterial = design ? getFacadeMaterial(design.surfaceMaterials.accent) : null;
  const frameMaterial = design ? getFacadeMaterial(design.surfaceMaterials.frames) : null;

  return {
    wall: mainMaterial?.baseColor ?? wall,
    wallShade: mainMaterial?.shadeColor ?? wallShade,
    accent: accentMaterial?.baseColor ?? accent,
    frame: frameMaterial?.baseColor ?? frame,
    roof,
  };
}

function Window({
  x,
  y,
  width,
  height,
  frame,
  id,
  sill = false,
  depth = false,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  frame: string;
  id: string;
  sill?: boolean;
  depth?: boolean;
}) {
  const panes = width > height * 1.3 ? 2 : 1;
  const reveal = Math.min(0.9, Math.max(0.35, height * 0.07));
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={"url(#" + id + ")"} stroke={frame} strokeWidth="0.7" />
      {/* Requadro: a esquadria fica recuada na parede, então o topo e a lateral recebem sombra */}
      {depth && <>
        <rect x={x} y={y} width={width} height={reveal} fill="#000" fillOpacity="0.22" pointerEvents="none" />
        <rect x={x} y={y} width={reveal * 0.7} height={height} fill="#000" fillOpacity="0.12" pointerEvents="none" />
      </>}
      {Array.from({ length: panes - 1 }, (_, index) => (
        <line key={index} x1={x + (width / panes) * (index + 1)} y1={y} x2={x + (width / panes) * (index + 1)} y2={y + height}
          stroke={frame} strokeWidth="0.45" />
      ))}
      <path d={`M${x + width * 0.12} ${y + height * 0.85} L${x + width * 0.34} ${y + height * 0.15}`} stroke="#ffffff" strokeOpacity="0.35" strokeWidth="0.35" />
      {sill && <rect x={x - 0.35} y={y + height} width={width + 0.7} height="0.35" fill="#e5e7eb" stroke="#64748b" strokeWidth="0.2" />}
    </g>
  );
}

function Tree({ x, ground, scale, height, line = false, back = false, night = false }: {
  x: number; ground: number; scale: number; height: number; line?: boolean; back?: boolean; night?: boolean;
}) {
  const h = height * scale;
  const r = h * 0.28;
  const trunk = h * 0.42;
  const leaf = line ? "#ffffff" : night ? (back ? "#2c3b33" : "#2f4236") : back ? "#8fa487" : "#5f7d56";
  const leafDark = line ? "#ffffff" : night ? (back ? "#233029" : "#24332a") : back ? "#7d9377" : "#4d6a47";
  return <g data-facade-tree="true" opacity={back ? 0.75 : 1}>
    <line x1={x} y1={ground} x2={x} y2={ground - trunk} stroke={line ? "#475569" : "#6b5444"} strokeWidth={Math.max(0.35, 0.12 * scale)} />
    <circle cx={x - r * 0.45} cy={ground - trunk - r * 0.55} r={r * 0.72} fill={leafDark} stroke={line ? "#475569" : "none"} strokeWidth="0.25" />
    <circle cx={x + r * 0.5} cy={ground - trunk - r * 0.6} r={r * 0.68} fill={leafDark} stroke={line ? "#475569" : "none"} strokeWidth="0.25" />
    <circle cx={x} cy={ground - trunk - r * 1.05} r={r * 0.85} fill={leaf} stroke={line ? "#475569" : "none"} strokeWidth="0.25" />
    {!line && <circle cx={x - r * 0.25} cy={ground - trunk - r * 1.3} r={r * 0.42} fill="#ffffff" fillOpacity={night ? 0.03 : 0.1} />}
  </g>;
}

/** Arbusto baixo junto à fachada (jardineira). */
function Shrub({ x, ground, scale, night }: { x: number; ground: number; scale: number; night: boolean }) {
  const r = 0.38 * scale;
  return <g pointerEvents="none">
    <ellipse cx={x} cy={ground - r * 0.55} rx={r * 1.25} ry={r * 0.75} fill={night ? "#243229" : "#4f6e48"} />
    <ellipse cx={x - r * 0.45} cy={ground - r * 0.85} rx={r * 0.7} ry={r * 0.55} fill={night ? "#2c3d32" : "#62845a"} />
    <ellipse cx={x + r * 0.5} cy={ground - r * 0.8} rx={r * 0.65} ry={r * 0.5} fill={night ? "#28382e" : "#587a50"} />
  </g>;
}

function Roof({ x, y, width, facade, color, scale, wall, line }: {
  x: number; y: number; width: number; facade: ConceptFacadePreferences; color: string; scale: number; wall: string; line: boolean;
}) {
  // Platibanda de verdade: prolongamento da parede (~0,9 m) com rufo no topo — antes era uma
  // tampa fina de 30 cm que deixava a casa com cara de caixa.
  const parapet = 0.9 * scale;
  const cap = 0.08 * scale;
  const capOverhang = 0.06 * scale;
  const platibanda = (px: number, pw: number) => <g>
    <rect x={px} y={y - parapet} width={pw} height={parapet} fill={wall} stroke="#334155" strokeWidth="0.45" />
    <rect x={px - capOverhang} y={y - parapet - cap} width={pw + capOverhang * 2} height={cap} fill={line ? "#fff" : "#9aa1a6"} stroke="#334155" strokeWidth="0.3" />
    {!line && <rect x={px} y={y - parapet} width={pw} height={0.1 * scale} fill="#000" fillOpacity="0.08" />}
  </g>;
  if (facade.roof === "platibanda") return platibanda(x, width);
  const eave = 0.6 * scale;
  const rise = Math.min(1.8 * scale, width * 0.2);
  const start = facade.roof === "misto" ? x + width * 0.45 : x;
  const span = x + width - start;
  return <g>
    {facade.roof === "misto" && platibanda(x, width * 0.45)}
    <path d={`M${start - eave} ${y + 0.05 * scale} L${start + span / 2} ${y - rise} L${x + width + eave} ${y + 0.05 * scale} Z`}
      fill={color} stroke="#334155" strokeWidth="0.45" />
    {!line && <path d={`M${start - eave} ${y + 0.05 * scale} H${x + width + eave}`} stroke="#000" strokeOpacity="0.2" strokeWidth={0.12 * scale} />}
  </g>;
}

export default function ConceptDerivedFacade({
  lotWidth,
  levels,
  rooms,
  sitePlacement,
  facade,
  design,
  selectedVolumeId,
  onSelectVolume,
  onVolumeChange,
  selectedSurface,
  onSelectSurface,
  viewMode = "line",
}: Props) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [drag, setDrag] = useState<{
    pointerId: number;
    id: string;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const colors = facadePalette(facade, design);
  const lineMode = viewMode === "line";
  const lighting = lineMode ? "day" : (design?.lighting ?? "day");
  const night = lighting === "night";
  const sunset = lighting === "sunset";
  const safeSitePlacement = normalizeSitePlacement(sitePlacement);
  const derivedFacade = buildDerivedFacadeModel(levels, rooms, safeSitePlacement);
  const facadeWidth = 92;
  // One metric scale for both axes: a 1 m opening must never get stretched.
  const scaleX = facadeWidth / derivedFacade.width;
  const storyHeight = 2.96 * scaleX;
  const baseX = 24;
  const groundY = 63;
  const buildingHeight = storyHeight * derivedFacade.floors;
  const buildingTop = groundY - buildingHeight;
  const reversed = safeSitePlacement.frontSide === "bottom" || safeSitePlacement.frontSide === "left";
  const mapX = (axis: number) => baseX + (reversed ? derivedFacade.maxAxis - axis : axis - derivedFacade.minAxis) * scaleX;
  const rangeX = (start: number, end: number) => Math.min(mapX(start), mapX(end));
  const topStory = derivedFacade.stories[derivedFacade.stories.length - 1];
  const roofX = rangeX(topStory.minAxis, topStory.maxAxis);
  const roofW = (topStory.maxAxis - topStory.minAxis) * scaleX;
  const roofY = buildingTop;
  const mainFill = lineMode ? "#fff" : design ? `url(#facade-material-${design.surfaceMaterials.main})` : colors.wall;
  const frameColor = lineMode ? "#334155" : colors.frame;
  const glassPatternId = lineMode ? "technical-glass" : night ? "facade-glass-night" : sunset ? "facade-glass-sunset" : "derived-facade-glass";
  const entranceFill = lineMode ? "#fff" : design ? getFacadeMaterial(design.surfaceMaterials.entrance).baseColor : colors.accent;
  const frontOpenings = derivedFacade.openings;
  const garageFill = design ? getFacadeMaterial(design.surfaceMaterials.garage).baseColor : colors.frame;
  const pavingFill = design ? getFacadeMaterial(design.surfaceMaterials.paving).baseColor : "#d6d3cd";
  // Muro, portão e jardim automáticos da implantação ficam na divisa do lote: no 3D fazem sentido,
  // mas na elevação caíam em cima da casa. A elevação desenha portão e paisagismo próprios.
  const elevationVolumes = (design?.volumes ?? []).filter((volume) => !/^site-auto-(wall|gate|planter)/.test(volume.id));
  const entranceOpening = derivedFacade.openings.find((opening) => opening.type === "door" && opening.floor === 0);
  const hasCanopyVolume = elevationVolumes.some((volume) => volume.kind === "canopy" || volume.kind === "portal");
  const landscaping = facade.landscaping ?? "medio";
  const showTrees = design?.showLandscaping ?? true;
  const buildingLeft = baseX;
  const buildingRight = baseX + facadeWidth;
  const trees = [
    { x: Math.max(14, buildingLeft - Math.min(0.9 * scaleX, 8)), height: landscaping === "intenso" ? 5.2 : 4.2, back: false },
    { x: Math.min(126, buildingRight + Math.min(0.9 * scaleX, 8)), height: landscaping === "leve" ? 3 : 3.8, back: false },
    ...(landscaping === "intenso" ? [{ x: buildingLeft + facadeWidth * 0.7, height: 5.4, back: true }] : []),
    
  ];

  const groundStory = derivedFacade.stories.find((story) => story.floor === 0) ?? derivedFacade.stories[0];
  const shrubs: number[] = [];
  if (showTrees && !lineMode && groundStory) {
    const blocked = [
      ...(derivedFacade.garageRange ? [[Math.min(derivedFacade.garageRange.start, derivedFacade.garageRange.end) - 0.3, Math.max(derivedFacade.garageRange.start, derivedFacade.garageRange.end) + 0.3]] : []),
      ...derivedFacade.openings.filter((opening) => opening.floor === 0 && (opening.type === "door" || opening.sillHeight < 0.3))
        .map((opening) => [opening.axis - opening.width / 2 - 0.5, opening.axis + opening.width / 2 + 0.5]),
      ...derivedFacade.porchRanges.filter((porch) => porch.floor === 0).map((porch) => [Math.min(porch.start, porch.end), Math.max(porch.start, porch.end)]),
    ];
    const step = landscaping === "leve" ? 2.4 : landscaping === "intenso" ? 1.1 : 1.6;
    for (let axis = groundStory.minAxis + 0.6; axis <= groundStory.maxAxis - 0.6; axis += step) {
      if (!blocked.some(([start, end]) => axis >= start && axis <= end)) shrubs.push(axis);
    }
  }

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drag || drag.pointerId !== event.pointerId || !onVolumeChange) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    const view = svgRef.current!.viewBox.baseVal;
    const pixelsPerUnit = Math.min(rect.width / view.width, rect.height / view.height);
    const dx = (event.clientX - drag.startClientX) / pixelsPerUnit / facadeWidth * 100;
    const dy = (event.clientY - drag.startClientY) / pixelsPerUnit / buildingHeight * 100;
    onVolumeChange(drag.id, {
      x: clamp(drag.startX + dx, 0, 96),
      y: clamp(drag.startY + dy, 0, 96),
    });
  };

  const renderVolume = (volume: FacadeVolume) => {
    const x = baseX + facadeWidth * (volume.x / 100);
    const y = buildingTop + buildingHeight * (volume.y / 100);
    const width = Math.max(2.8, facadeWidth * (volume.width / 100));
    const height = Math.max(1.8, buildingHeight * (volume.height / 100));
    const fill = lineMode ? "url(#technical-volume)" : `url(#facade-material-${volume.materialId})`;
    const selected = selectedVolumeId === volume.id;
    const common = {
      fill,
      opacity: lineMode ? 1 : (volume.opacity ?? 1),
      stroke: selected ? "#f97316" : "#334155",
      strokeWidth: selected ? 0.9 : lineMode ? 0.55 : 0.32,
    };

    const beginDrag = (event: React.PointerEvent<SVGGElement>) => {
      event.stopPropagation();
      onSelectVolume?.(volume.id);
      if (volume.locked || !onVolumeChange) return;
      const svg = event.currentTarget.ownerSVGElement;
      svg?.setPointerCapture?.(event.pointerId);
      setDrag({
        pointerId: event.pointerId,
        id: volume.id,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startX: volume.x,
        startY: volume.y,
      });
    };

    const pieces = buildFacadeMeshBoxes({ ...design!, volumes: [volume] }, {
      minX: 0, maxX: derivedFacade.width, minZ: 0, maxZ: 1,
    }, derivedFacade.height, "top");
    return <g key={volume.id} onPointerDown={beginDrag}
      onClick={(event) => { event.stopPropagation(); onSelectVolume?.(volume.id); }}
      className={volume.locked ? "cursor-default" : "cursor-move"}>
      {pieces.map((piece, index) => <rect key={index}
        x={baseX + (piece.x - piece.width / 2) * scaleX}
        y={groundY - (piece.y + piece.height / 2) * scaleX}
        width={piece.width * scaleX} height={piece.height * scaleX} {...common} />)}
      {selected && <g data-render-ignore="true" fill="#fff" stroke="#f97316" strokeWidth="0.55">
        <circle cx={x} cy={y} r="1.15" /><circle cx={x + width} cy={y + height} r="1.15" />
      </g>}
    </g>;
  };

  const facadeViewY = roofY - Math.max(1.05 * scaleX, facade.roof === "platibanda" ? 0 : Math.min(1.8 * scaleX, roofW * 0.2)) - 3;
  const facadeViewHeight = groundY + 0.45 * scaleX + 7 - facadeViewY;

  return (
    <svg
      ref={svgRef}
      viewBox={`10 ${facadeViewY} 120 ${facadeViewHeight}`}
      onPointerMove={handlePointerMove}
      onPointerUp={(event) => {
        if (drag?.pointerId === event.pointerId) setDrag(null);
      }}
      onPointerCancel={(event) => {
        if (drag?.pointerId === event.pointerId) setDrag(null);
      }}
      onClick={() => {
        onSelectVolume?.(null);
        onSelectSurface?.(null);
      }}
      preserveAspectRatio="xMidYMid meet"
      className="block h-full w-full"
      role="img"
      aria-label="Fachada arquitetônica conceitual derivada do pré-projeto"
        letterSpacing="normal"
    >
      <defs>
        <pattern id="technical-wall" width="7" height="7" patternUnits="userSpaceOnUse">
          <rect width="7" height="7" fill="#ffffff" />
          <path d="M0 7 L7 0" stroke="#cbd5e1" strokeWidth="0.22" />
        </pattern>
        <pattern id="technical-accent" width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="#ffffff" />
          <path d="M1 0 V5 M3 0 V5" stroke="#94a3b8" strokeWidth="0.24" />
        </pattern>
        <pattern id="technical-gate" width="4" height="4" patternUnits="userSpaceOnUse">
          <rect width="4" height="4" fill="#ffffff" />
          <path d="M0 2 H4" stroke="#64748b" strokeWidth="0.26" />
        </pattern>
        <pattern id="technical-paving" width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="#ffffff" />
          <path d="M0 0 H5 M0 2.5 H5 M0 5 H5 M0 0 V5 M2.5 0 V5 M5 0 V5" stroke="#cbd5e1" strokeWidth="0.18" />
        </pattern>
        <pattern id="technical-volume" width="5" height="5" patternUnits="userSpaceOnUse">
          <rect width="5" height="5" fill="#ffffff" />
          <path d="M0 5 L5 0" stroke="#cbd5e1" strokeWidth="0.2" />
        </pattern>
        <pattern id="technical-glass" width="6" height="6" patternUnits="userSpaceOnUse">
          <rect width="6" height="6" fill="#f8fafc" />
          <path d="M0 6 L6 0" stroke="#cbd5e1" strokeWidth="0.2" />
        </pattern>
        {FACADE_MATERIALS.map((material) => (
          <pattern
            key={material.id}
            id={`facade-material-${material.id}`}
            width={material.texture === "brick" ? 6 : material.texture === "wood" || material.texture === "slats" ? 3.2 : 5}
            height={material.texture === "brick" ? 3 : 4}
            patternUnits="userSpaceOnUse"
          >
            <rect width="100%" height="100%" fill={material.baseColor} />
            {material.texture === "wood" && (
              <>
                <path d="M0 1.2 H3.2 M0 2.8 H3.2" stroke={material.lineColor} strokeOpacity="0.34" strokeWidth="0.24" />
                <path d="M1.1 0 V4 M2.5 0 V4" stroke={material.lineColor} strokeOpacity="0.14" strokeWidth="0.18" />
              </>
            )}
            {material.texture === "stone" && (
              <path d="M0 2 H5 M1.8 0 V2 M3.7 2 V4" stroke={material.lineColor} strokeOpacity="0.38" strokeWidth="0.24" />
            )}
            {material.texture === "brick" && (
              <path d="M0 1.5 H6 M3 0 V1.5 M1.5 1.5 V3 M4.5 1.5 V3" stroke={material.lineColor} strokeOpacity="0.44" strokeWidth="0.22" />
            )}
            {material.texture === "slats" && (
              <path d="M0.55 0 V4 M1.6 0 V4 M2.65 0 V4" stroke={material.lineColor} strokeOpacity="0.65" strokeWidth="0.3" />
            )}
          </pattern>
        ))}
        <linearGradient id="derived-facade-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5f7fa" />
          <stop offset="72%" stopColor="#eef2f4" />
          <stop offset="100%" stopColor="#e8ece8" />
        </linearGradient>
        <linearGradient id="derived-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#e8eef3" />
          <stop offset="100%" stopColor="#f6f4ef" />
        </linearGradient>
        <linearGradient id="derived-facade-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#91a8b3" />
          <stop offset="35%" stopColor="#617783" />
          <stop offset="70%" stopColor="#3f515a" />
          <stop offset="100%" stopColor="#263239" />
        </linearGradient>
        <linearGradient id="derived-driveway" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d9d9d4" />
          <stop offset="100%" stopColor="#c7c8c4" />
        </linearGradient>
        <pattern id="derived-stone" width="5" height="3.4" patternUnits="userSpaceOnUse">
          <rect width="5" height="3.4" fill={colors.accent} />
          <path d="M0 1.7 H5 M2.5 0 V1.7 M1.2 1.7 V3.4 M4 1.7 V3.4" stroke="#ffffff" strokeOpacity="0.13" strokeWidth="0.22" />
        </pattern>
        <linearGradient id="facade-sky-day" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cfdfeb" />
          <stop offset="70%" stopColor="#eef3f6" />
          <stop offset="100%" stopColor="#f6f4ef" />
        </linearGradient>
        <linearGradient id="facade-sky-sunset" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8a9bc0" />
          <stop offset="45%" stopColor="#f2b389" />
          <stop offset="100%" stopColor="#fbe3c8" />
        </linearGradient>
        <linearGradient id="facade-sky-night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0b1526" />
          <stop offset="75%" stopColor="#1c2a43" />
          <stop offset="100%" stopColor="#2a3651" />
        </linearGradient>
        <linearGradient id="facade-glass-night" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffd28a" />
          <stop offset="60%" stopColor="#f4b25e" />
          <stop offset="100%" stopColor="#c9843c" />
        </linearGradient>
        <linearGradient id="facade-glass-sunset" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f1c7a3" />
          <stop offset="40%" stopColor="#8e8e99" />
          <stop offset="100%" stopColor="#353b47" />
        </linearGradient>
        <linearGradient id="facade-wall-light" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.14" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.07" />
        </linearGradient>
        <linearGradient id="facade-eave-shadow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="facade-uplight" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#ffe3ad" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#ffe3ad" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="facade-ground-shadow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#000000" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <filter id="derived-facade-shadow" x="-20%" y="-30%" width="140%" height="180%">
          <feDropShadow dx="0" dy="2.2" stdDeviation="2.1" floodColor="#475569" floodOpacity="0.22" />
        </filter>
        <filter id="soft-shadow" x="-30%" y="-50%" width="160%" height="220%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>

      {/* Céu e chão se estendem além do quadro para preencher as sobras quando a tela é mais larga ou mais alta */}
      <rect x="-200" y={facadeViewY - 200} width="540" height={groundY - facadeViewY + 200} fill={lineMode ? "#fff" : `url(#facade-sky-${lighting})`} />
      {!lineMode && <rect x="-200" y={groundY} width="540" height="200" fill={night ? "#1b2433" : sunset ? "#efe1cf" : "#ecebe6"} />}
      {night && <g pointerEvents="none" fill="#ffffff">
        <circle cx="131" cy={facadeViewY + 4} r="1.8" fillOpacity="0.85" />
        {[[22, 4], [38, 9], [57, 5], [76, 11], [95, 6], [131, 12]].map(([sx, sy]) => (
          <circle key={`${sx}-${sy}`} cx={sx} cy={facadeViewY + sy} r="0.28" fillOpacity="0.7" />
        ))}
      </g>}
      {sunset && <circle cx="120" cy={groundY - 6} r="7" fill="#ffd8a8" fillOpacity="0.55" pointerEvents="none" />}

      {/* Calçada e linha do terreno */}
      <rect x="0" y={groundY} width="140" height={0.45 * scaleX} fill={lineMode ? "url(#technical-paving)" : pavingFill} />
      {!lineMode && <g pointerEvents="none">
        <rect x="0" y={groundY} width="140" height={0.22 * scaleX} fill={night ? "#23332a" : "#86a672"} />
        {derivedFacade.garageRange && (() => {
          const start = Math.min(derivedFacade.garageRange.start, derivedFacade.garageRange.end);
          const end = Math.max(derivedFacade.garageRange.start, derivedFacade.garageRange.end);
          return <rect x={rangeX(start, end)} y={groundY} width={(end - start) * scaleX} height={0.22 * scaleX} fill={pavingFill} />;
        })()}
        {entranceOpening && <rect x={mapX(entranceOpening.axis) - (entranceOpening.width / 2 + 0.3) * scaleX} y={groundY}
          width={(entranceOpening.width + 0.6) * scaleX} height={0.22 * scaleX} fill={pavingFill} />}
        <rect x={baseX - 2} y={groundY - 0.35 * scaleX} width={facadeWidth + 4} height={0.7 * scaleX} fill="url(#facade-ground-shadow)" />
        {night && <rect x="0" y={groundY} width="140" height={0.45 * scaleX} fill="#0b1220" fillOpacity="0.45" />}
      </g>}
      <path d={`M0 ${groundY} H140`} stroke="#64748b" strokeWidth="0.35" />

      {/* Paisagismo atrás da casa (árvores de fundo) */}
      {showTrees && !lineMode && trees.filter((tree) => tree.back).map((tree) => (
        <Tree key={`back-${tree.x}`} x={tree.x} ground={groundY} scale={scaleX} height={tree.height} line={lineMode} back night={night} />
      ))}

      {/* Pavimentos */}
      {derivedFacade.stories.map((story) => {
        const x = rangeX(story.minAxis, story.maxAxis);
        const w = (story.maxAxis - story.minAxis) * scaleX;
        const top = groundY - (story.floor + 1) * storyHeight;
        return <g key={story.floor}>
          <rect x={x} y={top} width={w} height={storyHeight}
            fill={mainFill} stroke={selectedSurface === "main" ? "#f97316" : "#334155"} strokeWidth="0.45"
            onClick={(event) => { event.stopPropagation(); onSelectSurface?.("main"); }} />
          {!lineMode && <g pointerEvents="none">
            <rect x={x} y={top} width={w} height={storyHeight} fill="url(#facade-wall-light)" />
            <rect x={x} y={top} width={w} height={0.45 * scaleX} fill="url(#facade-eave-shadow)" />
            {story.floor === 0 && <rect x={x} y={groundY - 0.22 * scaleX} width={w} height={0.22 * scaleX} fill={colors.wallShade} fillOpacity="0.9" />}
          </g>}
          {story.floor < derivedFacade.floors - 1 && (
            <rect x={x - 0.08 * scaleX} y={top - 0.12 * scaleX} width={w + 0.16 * scaleX} height={0.24 * scaleX}
              fill={lineMode ? "#fff" : colors.wallShade} stroke="#334155" strokeWidth="0.3" />
          )}
        </g>;
      })}

      {/* Painel de destaque (madeira, pedra, tijolo...) marcando a entrada, do chão ao topo */}
      {entranceOpening && elevationVolumes.length === 0 && (() => {
        const panelWidth = (entranceOpening.width + 1.3) * scaleX;
        const x = mapX(entranceOpening.axis) - panelWidth / 2;
        const top = buildingTop - (facade.roof === "platibanda" ? 0.9 * scaleX : 0);
        return <rect x={x} y={top} width={panelWidth} height={groundY - top}
          fill={lineMode ? "url(#technical-accent)" : `url(#facade-material-${design?.surfaceMaterials.accent ?? "wood-natural"})`}
          filter={lineMode ? undefined : "url(#derived-facade-shadow)"}
          stroke={selectedSurface === "accent" ? "#f97316" : "#334155"} strokeWidth="0.4"
          onClick={(event) => { event.stopPropagation(); onSelectSurface?.("accent"); }} />;
      })()}

      {/* Varandas: recuo aberto com pilares e fundo envidraçado */}
      {derivedFacade.porchRanges.map((porch) => {
        const x = rangeX(porch.start, porch.end);
        const w = Math.abs(porch.end - porch.start) * scaleX;
        const top = groundY - (porch.floor + 1) * storyHeight + 0.35 * scaleX;
        const bottom = groundY - porch.floor * storyHeight;
        const column = 0.22 * scaleX;
        return <g key={`porch-${porch.floor}-${porch.start}`}>
          <rect x={x} y={top} width={w} height={bottom - top} fill={lineMode ? "url(#technical-wall)" : "#4b5359"} fillOpacity={lineMode ? 1 : 0.28} stroke="#334155" strokeWidth="0.3" />
          <Window x={x + w * 0.18} y={bottom - 2.1 * scaleX} width={w * 0.64} height={2.1 * scaleX} frame={frameColor} id={glassPatternId} />
          <rect x={x} y={top} width={column} height={bottom - top} fill={mainFill} stroke="#334155" strokeWidth="0.3" />
          <rect x={x + w - column} y={top} width={column} height={bottom - top} fill={mainFill} stroke="#334155" strokeWidth="0.3" />
        </g>;
      })}

      {/* Portão da garagem */}
      {derivedFacade.garageRange && (() => {
        const inset = 0.3;
        const start = Math.min(derivedFacade.garageRange.start, derivedFacade.garageRange.end) + inset;
        const end = Math.max(derivedFacade.garageRange.start, derivedFacade.garageRange.end) - inset;
        if (end - start < 2) return null;
        const x = rangeX(start, end);
        const w = (end - start) * scaleX;
        const h = Math.min(2.4, 2.96 - 0.3) * scaleX;
        const slats = Math.max(8, Math.round((end - start) / 0.12));
        return <g onClick={(event) => { event.stopPropagation(); onSelectSurface?.("garage"); }}>
          <rect x={x} y={groundY - h} width={w} height={h} fill={lineMode ? "#fff" : garageFill}
            stroke={selectedSurface === "garage" ? "#f97316" : "#334155"} strokeWidth="0.45" />
          {!lineMode && <rect x={x} y={groundY - h} width={w} height={0.28 * scaleX} fill="url(#facade-eave-shadow)" pointerEvents="none" />}
          {Array.from({ length: slats - 1 }, (_, index) => {
            const lx = x + (w / slats) * (index + 1);
            return <line key={index} x1={lx} y1={groundY - h + 0.08 * scaleX} x2={lx} y2={groundY - 0.05 * scaleX}
              stroke={lineMode ? "#94a3b8" : "#000"} strokeOpacity={lineMode ? 0.8 : 0.18} strokeWidth="0.18" />;
          })}
        </g>;
      })()}

      {/* Volumes de composição escolhidos pelo usuário */}
      {elevationVolumes.map(renderVolume)}

      <Roof x={roofX} y={roofY} width={roofW} facade={facade} scale={scaleX}
        color={lineMode ? "#fff" : colors.roof} wall={mainFill} line={lineMode} />

      {/* Luz ambiente: fim de tarde aquece, noite escurece a casa (as janelas acesas vêm por cima) */}
      {(night || sunset) && (() => {
        const parapet = 1.0 * scaleX;
        const rise = Math.min(1.8 * scaleX, roofW * 0.2);
        const eave = 0.6 * scaleX;
        const roofStart = facade.roof === "misto" ? roofX + roofW * 0.45 : roofX;
        return <>
          <clipPath id="facade-ambient-clip">
            {derivedFacade.stories.map((story) => (
              <rect key={story.floor} x={rangeX(story.minAxis, story.maxAxis) - 0.1} y={groundY - (story.floor + 1) * storyHeight}
                width={(story.maxAxis - story.minAxis) * scaleX + 0.2} height={storyHeight} />
            ))}
            {(facade.roof === "platibanda" || facade.roof === "misto") && (
              <rect x={roofX - 0.06 * scaleX} y={roofY - parapet} width={(facade.roof === "misto" ? roofW * 0.45 : roofW) + 0.12 * scaleX} height={parapet} />
            )}
            {facade.roof !== "platibanda" && (
              <path d={`M${roofStart - eave} ${roofY + 0.05 * scaleX} L${roofStart + (roofX + roofW - roofStart) / 2} ${roofY - rise} L${roofX + roofW + eave} ${roofY + 0.05 * scaleX} Z`} />
            )}
          </clipPath>
          <rect x={baseX - 20} y={roofY - rise - parapet - 2} width={facadeWidth + 40} height={groundY - roofY + rise + parapet + 2}
            clipPath="url(#facade-ambient-clip)" pointerEvents="none"
            fill={night ? "#0b1220" : "#f59e0b"} fillOpacity={night ? 0.5 : 0.1} />
        </>;
      })()}

      {/* Portas e janelas */}
      {frontOpenings.map((opening) => {
        const width = opening.width * scaleX;
        const height = opening.height * scaleX;
        const x = mapX(opening.axis) - width / 2;
        const y = groundY - opening.floor * storyHeight - (opening.sillHeight + opening.height) * scaleX;
        const entrance = opening.type === "door" && opening.floor === 0;
        return <g key={`${opening.floor}-${opening.id}`}
          onClick={(event) => { event.stopPropagation(); onSelectSurface?.(opening.type === "door" ? "entrance" : "frames"); }}>
          {opening.type === "window"
            ? <Window x={x} y={y} width={width} height={height} frame={frameColor} id={glassPatternId} sill={opening.sillHeight > 0.3} depth={!lineMode} />
            : <g>
              <rect x={x} y={y} width={width} height={height} fill={entranceFill}
                stroke={selectedSurface === "entrance" ? "#f97316" : frameColor} strokeWidth="0.55" />
              {!lineMode && Array.from({ length: Math.max(3, Math.round(opening.width / 0.14)) - 1 }, (_, index) => {
                const gx = x + (width / Math.max(3, Math.round(opening.width / 0.14))) * (index + 1);
                return <line key={index} x1={gx} y1={y + 0.05 * scaleX} x2={gx} y2={y + height - 0.05 * scaleX} stroke="#000" strokeOpacity="0.14" strokeWidth="0.16" />;
              })}
              <line x1={x + width * 0.8} y1={y + height * 0.28} x2={x + width * 0.8} y2={y + height * 0.72}
                stroke={lineMode ? "#334155" : "#d4d4d8"} strokeWidth={lineMode ? 0.45 : 0.55} strokeLinecap="round" />
              {night && <rect x={x} y={y} width={width} height={height} fill="#0b1220" fillOpacity="0.35" pointerEvents="none" />}
            </g>}
          {entrance && !hasCanopyVolume && (
            <rect x={x - 0.7 * scaleX} y={groundY - 2.75 * scaleX} width={width + 1.4 * scaleX} height={0.16 * scaleX}
              fill={lineMode ? "#fff" : colors.accent} stroke="#334155" strokeWidth="0.35" />
          )}
        </g>;
      })}


      {night && <g pointerEvents="none">
        {entranceOpening && (() => {
          const cx = mapX(entranceOpening.axis);
          return <>
            <rect x={cx - (entranceOpening.width / 2 + 0.9) * scaleX} y={groundY - 2.7 * scaleX} width={0.5 * scaleX} height={2.7 * scaleX} fill="url(#facade-uplight)" />
            <rect x={cx + (entranceOpening.width / 2 + 0.4) * scaleX} y={groundY - 2.7 * scaleX} width={0.5 * scaleX} height={2.7 * scaleX} fill="url(#facade-uplight)" />
          </>;
        })()}
        {derivedFacade.stories.filter((story) => story.floor === 0).flatMap((story) => [story.minAxis + 0.5, story.maxAxis - 0.5]).map((axis) => (
          <rect key={`wash-${axis}`} x={mapX(axis) - 0.3 * scaleX} y={groundY - 2.4 * scaleX} width={0.6 * scaleX} height={2.4 * scaleX} fill="url(#facade-uplight)" />
        ))}
      </g>}

      {shrubs.map((axis) => <Shrub key={`shrub-${axis}`} x={mapX(axis)} ground={groundY} scale={scaleX} night={night} />)}

      {/* Paisagismo na frente */}
      {showTrees && trees.filter((tree) => !tree.back).map((tree) => (
        <Tree key={`front-${tree.x}`} x={tree.x} ground={groundY} scale={scaleX} height={tree.height} line={lineMode} night={night} />
      ))}

      <text data-render-ignore="true" x="70" y={groundY + 0.45 * scaleX + 4} textAnchor="middle" fontSize="1.65" fill="#667085">
        {derivedFacade.width.toFixed(1)} m de frente construída · lote {lotWidth.toFixed(1)} m
      </text>
    </svg>
  );
}

