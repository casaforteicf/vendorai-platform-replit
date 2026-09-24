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
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  frame: string;
  id: string;
}) {
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx="0.45" fill={"url(#" + id + ")"} stroke={frame} strokeWidth="0.72" />
      <line x1={x + width / 2} y1={y} x2={x + width / 2} y2={y + height} stroke="#d8e0e4" strokeOpacity="0.52" strokeWidth="0.32" />
      <line x1={x} y1={y + height * 0.58} x2={x + width} y2={y + height * 0.58} stroke="#d8e0e4" strokeOpacity="0.24" strokeWidth="0.26" />
    </g>
  );
}

function Roof({ x, y, width, facade, color, scale }: {
  x: number; y: number; width: number; facade: ConceptFacadePreferences; color: string; scale: number;
}) {
  const edge = 0.12 * scale;
  const parapet = 0.3 * scale;
  if (facade.roof === "platibanda") return <rect x={x - edge} y={y - parapet} width={width + edge * 2} height={parapet} fill={color} stroke="#334155" strokeWidth="0.45" />;
  const rise = Math.min(2 * scale, width * 0.22);
  const start = facade.roof === "misto" ? x + width * 0.45 : x;
  const span = x + width - start;
  return <g>
    {facade.roof === "misto" && <rect x={x - edge} y={y - parapet} width={width * 0.45 + edge} height={parapet} fill={color} stroke="#334155" strokeWidth="0.45" />}
    <path d={`M${start - edge} ${y} L${start + span / 2} ${y - rise} L${x + width + edge} ${y} Z`} fill={color} stroke="#334155" strokeWidth="0.45" />
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
  const safeSitePlacement = normalizeSitePlacement(sitePlacement);
  const derivedFacade = buildDerivedFacadeModel(levels, rooms, safeSitePlacement);
  const facadeWidth = 106;
  // One metric scale for both axes: a 1 m opening must never get stretched.
  const scaleX = facadeWidth / derivedFacade.width;
  const storyHeight = 2.96 * scaleX;
  const baseX = 17;
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
  const mainFill = lineMode ? "#fff" : colors.wall;
  const frameColor = lineMode ? "#334155" : colors.frame;
  const glassPatternId = lineMode ? "technical-glass" : "derived-facade-glass";
  const entranceFill = lineMode ? "#fff" : design ? getFacadeMaterial(design.surfaceMaterials.entrance).baseColor : colors.accent;
  const frontOpenings = derivedFacade.openings;

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

  const facadeViewY = roofY - Math.max(0.5 * scaleX, facade.roof === "platibanda" ? 0 : Math.min(2 * scaleX, roofW * 0.22)) - 3;
  const facadeViewHeight = groundY + 8 - facadeViewY;

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
        <filter id="derived-facade-shadow" x="-20%" y="-30%" width="140%" height="180%">
          <feDropShadow dx="0" dy="2.2" stdDeviation="2.1" floodColor="#475569" floodOpacity="0.22" />
        </filter>
        <filter id="soft-shadow" x="-30%" y="-50%" width="160%" height="220%">
          <feGaussianBlur stdDeviation="1.4" />
        </filter>
      </defs>

      <rect x="0" y={facadeViewY} width="140" height={facadeViewHeight} fill={lineMode ? "#fff" : "#eef2f4"} />
      <path d={`M0 ${groundY} H140`} stroke="#94a3b8" strokeWidth="0.3" />
      {derivedFacade.stories.map((story) => (
        <rect key={story.floor} x={rangeX(story.minAxis, story.maxAxis)}
          y={groundY - (story.floor + 1) * storyHeight}
          width={(story.maxAxis - story.minAxis) * scaleX} height={storyHeight}
          fill={mainFill} stroke={selectedSurface === "main" ? "#f97316" : "#334155"} strokeWidth="0.45"
          onClick={() => onSelectSurface?.("main")} />
      ))}
      {design?.volumes.map(renderVolume)}
      {frontOpenings.map((opening) => {
        const width = opening.width * scaleX;
        const height = opening.height * scaleX;
        const x = mapX(opening.axis) - width / 2;
        const y = groundY - opening.floor * storyHeight - (0.16 + opening.sillHeight + opening.height) * scaleX;
        return <g key={`${opening.floor}-${opening.id}`} onClick={() => onSelectSurface?.(opening.type === "door" ? "entrance" : "frames")}>
          {opening.type === "window"
            ? <Window x={x} y={y} width={width} height={height} frame={frameColor} id={glassPatternId} />
            : <rect x={x} y={y} width={width} height={height} fill={entranceFill} stroke={frameColor} strokeWidth="0.45" />}
        </g>;
      })}
      <Roof x={roofX} y={roofY} width={roofW} facade={facade} scale={scaleX} color={lineMode ? "#fff" : colors.roof} />
      {(design?.showLandscaping ?? true) && <g fill={lineMode ? "#fff" : "#6f8962"} stroke="#71816c" strokeWidth="0.2">
        {[baseX - 2, baseX + facadeWidth + 2].map((x) => <path key={x}
          d={`M${x} ${groundY} q-2 -1 -1 -3 q1 -1 1 1 q0 -4 1 -3 q2 1 0 4 Z`} />)}
      </g>}
      <text data-render-ignore="true" x="70" y={groundY + 5} textAnchor="middle" fontSize="1.65" fill="#667085">
        {derivedFacade.width.toFixed(1)} m de frente construída · lote {lotWidth.toFixed(1)} m
      </text>
    </svg>
  );
}
