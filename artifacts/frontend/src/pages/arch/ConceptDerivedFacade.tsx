import { useRef, useState } from "react";
import type { ConceptFacadePreferences } from "./ConceptVolumetry";
import type { SitePlacement } from "./conceptSitePlacement";
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

const STORY_HEIGHT = 18;

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

function Roof({
  x,
  y,
  width,
  facade,
  color,
}: {
  x: number;
  y: number;
  width: number;
  facade: ConceptFacadePreferences;
  color: string;
}) {
  if (facade.roof === "platibanda") {
    return (
      <g>
        <rect x={x - 0.8} y={y - 2.2} width={width + 1.6} height="2.5" rx="0.25" fill={color} stroke="#334155" strokeWidth="0.55" />
        <line x1={x} y1={y - 0.35} x2={x + width} y2={y - 0.35} stroke="#94a3b8" strokeOpacity="0.75" strokeWidth="0.28" />
      </g>
    );
  }

  if (facade.roof === "misto") {
    return (
      <g>
        <rect x={x - 0.6} y={y - 1.8} width={width * 0.5} height="2.1" rx="0.2" fill={color} />
        <path
          d={"M " + (x + width * 0.42) + " " + y + " L " + (x + width * 0.64) + " " + (y - 8.4) + " L " + (x + width + 1.8) + " " + y + " Z"}
          fill={color}
          stroke="#3f342e"
          strokeWidth="0.55"
        />
        <path
          d={"M " + (x + width * 0.42) + " " + (y - 0.15) + " L " + (x + width * 0.64) + " " + (y - 8.4) + " L " + (x + width + 1.8) + " " + (y - 0.15)}
          fill="none"
          stroke="#8b6a59"
          strokeWidth="0.42"
        />
      </g>
    );
  }

  if (facade.style === "classico_contemporaneo") {
    return (
      <g>
        <path
          d={"M " + (x - 2.2) + " " + y + " L " + (x + width / 2) + " " + (y - 10.8) + " L " + (x + width + 2.2) + " " + y + " Z"}
          fill={color}
          stroke="#3f342e"
          strokeWidth="0.62"
        />
        <path
          d={"M " + (x - 2.2) + " " + y + " L " + (x + width / 2) + " " + (y - 10.8) + " L " + (x + width + 2.2) + " " + y}
          fill="none"
          stroke="#9a7764"
          strokeWidth="0.42"
        />
      </g>
    );
  }

  return (
    <g>
      <path
        d={"M " + (x - 2) + " " + y + " L " + (x + width * 0.18) + " " + (y - 7.4) + " L " + (x + width * 0.82) + " " + (y - 7.4) + " L " + (x + width + 2) + " " + y + " Z"}
        fill={color}
        stroke="#3d4246"
        strokeWidth="0.58"
      />
      <line x1={x + width * 0.18} y1={y - 7.4} x2={x + width * 0.82} y2={y - 7.4} stroke="#7b8287" strokeWidth="0.34" />
    </g>
  );
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
  const builtRooms = (Array.isArray(rooms) ? rooms : []).filter((room) => room.kind !== "piscina");
  const derivedFacade = buildDerivedFacadeModel(levels, rooms, sitePlacement);
  const overall = {
    minX: derivedFacade.minAxis,
    maxX: derivedFacade.maxAxis,
    width: Math.max(6, derivedFacade.width),
  };
  const facadeHorizontal = sitePlacement.frontSide === "top" || sitePlacement.frontSide === "bottom";
  const roomAxisStart = (room: ConceptRoomShape) => facadeHorizontal ? room.x : room.y;
  const roomAxisSize = (room: ConceptRoomShape) => facadeHorizontal ? room.width : room.depth;

  const maxFloorFromRooms = builtRooms.reduce((max, room) => Math.max(max, room.floor), 0);
  const maxFloorFromLevels = levels.reduce((max, level) => Math.max(max, level.floor), 0);
  const maxFloor = Math.max(maxFloorFromRooms, maxFloorFromLevels);
  const floors = derivedFacade.floors;

  const facadeWidth = 106;
  const scaleX = facadeWidth / Math.max(6, overall.width);
  const baseX = (140 - facadeWidth) / 2;
  const groundY = 63;
  const groundTop = groundY - STORY_HEIGHT;

  const mapX = (x: number) => baseX + (x - overall.minX) * scaleX;
  const mapW = (width: number) => width * scaleX;

  const groundRooms = builtRooms.filter((room) => room.floor === 0);
  const garage = groundRooms.find((room) => room.kind === "garagem");
  const social = groundRooms.find((room) => room.kind === "sala") ?? groundRooms.find((room) => room.kind === "cozinha");
  const garageCenter = garage ? roomAxisStart(garage) + roomAxisSize(garage) / 2 : overall.minX + overall.width * 0.24;
  const garageOnLeft = garageCenter < overall.minX + overall.width / 2;

  const garageX = garage ? mapX(roomAxisStart(garage)) + 1.3 : baseX + 2;
  const garageW = garage ? clamp(mapW(roomAxisSize(garage)) - 2.6, 24, 40) : 31;
  const garageDoorX = garageOnLeft
    ? clamp(garageX, baseX + 1.4, baseX + facadeWidth - garageW - 1.4)
    : clamp(garageX + Math.max(0, mapW(garage ? roomAxisSize(garage) : 0) - garageW - 1.3), baseX + 1.4, baseX + facadeWidth - garageW - 1.4);

  const entryW = facade.style === "classico_contemporaneo" ? 8.6 : 7.5;
  const desiredEntry = garageOnLeft ? garageDoorX + garageW + 2.2 : garageDoorX - entryW - 2.2;
  const entryX = clamp(desiredEntry, baseX + 4, baseX + facadeWidth - entryW - 4);

  const socialX = social ? mapX(roomAxisStart(social)) : (garageOnLeft ? entryX + entryW + 4 : baseX + 5);
  const socialRegionW = social ? mapW(roomAxisSize(social)) : facadeWidth * 0.42;
  const socialGlassW = clamp(socialRegionW - 4.5, 18, 31);
  const socialGlassX = clamp(socialX + 2, baseX + 3, baseX + facadeWidth - socialGlassW - 3);

  const upperAxisRooms = builtRooms.filter((room) => room.floor === maxFloor);
  const upperMinAxis = upperAxisRooms.length ? Math.min(...upperAxisRooms.map(roomAxisStart)) : overall.minX;
  const upperMaxAxis = upperAxisRooms.length ? Math.max(...upperAxisRooms.map((room) => roomAxisStart(room) + roomAxisSize(room))) : overall.maxX;
  const upperX = floors > 1 ? mapX(upperMinAxis) : baseX;
  const upperW = floors > 1 ? clamp(mapW(Math.max(1, upperMaxAxis - upperMinAxis)), facadeWidth * 0.55, facadeWidth) : facadeWidth;
  const roofX = floors > 1 ? upperX : baseX;
  const roofW = floors > 1 ? upperW : facadeWidth;
  const roofY = groundTop - (floors - 1) * STORY_HEIGHT;

  const upperRooms = builtRooms
    .filter((room) => room.floor === maxFloor && ["suite", "quarto", "sala"].includes(room.kind))
    .sort((a, b) => a.x - b.x)
    .slice(0, 3);

  const privateGround = groundRooms
    .filter((room) => ["suite", "quarto"].includes(room.kind))
    .sort((a, b) => a.x - b.x)
    .slice(0, 2);

  const accentFill = lineMode
    ? "url(#technical-accent)"
    : design
      ? `url(#facade-material-${design.surfaceMaterials.accent})`
      : facade.accentMaterial === "pedra"
        ? "url(#derived-stone)"
        : colors.accent;
  const mainFill = lineMode
    ? "url(#technical-wall)"
    : design ? `url(#facade-material-${design.surfaceMaterials.main})` : colors.wall;
  const garageFill = lineMode
    ? "url(#technical-gate)"
    : design ? `url(#facade-material-${design.surfaceMaterials.garage})` : "#33393e";
  const entranceFill = lineMode
    ? "#ffffff"
    : design ? `url(#facade-material-${design.surfaceMaterials.entrance})` : facade.accentMaterial === "madeira" ? "#7f523c" : "#4e555a";
  const pavingFill = lineMode
    ? "url(#technical-paving)"
    : design ? `url(#facade-material-${design.surfaceMaterials.paving})` : "url(#derived-driveway)";
  const frameColor = lineMode ? "#334155" : design ? getFacadeMaterial(design.surfaceMaterials.frames).baseColor : colors.frame;
  const glassPatternId = lineMode ? "technical-glass" : "derived-facade-glass";

  const buildingHeight = STORY_HEIGHT * floors;
  const buildingTop = groundY - buildingHeight;

  const frontOpenings = [...derivedFacade.openings].sort((a, b) =>
    a.floor === b.floor ? a.axis - b.axis : a.floor - b.floor,
  );
  const frontDoors = frontOpenings.filter((opening) => opening.floor === 0 && opening.type === "door");
  const frontWindows = frontOpenings.filter((opening) => opening.floor === 0 && opening.type === "window");
  const hasUpperRealOpenings = frontOpenings.some((opening) => opening.floor > 0);
  const verticalScale = STORY_HEIGHT / 2.8;

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drag || drag.pointerId !== event.pointerId || !onVolumeChange) return;
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    const dx = ((event.clientX - drag.startClientX) / rect.width) * 100;
    const dy = ((event.clientY - drag.startClientY) / rect.height) * 100;
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

    return (
      <g
        key={volume.id}
        onPointerDown={beginDrag}
        onClick={(event) => {
          event.stopPropagation();
          onSelectVolume?.(volume.id);
        }}
        className={volume.locked ? "cursor-default" : "cursor-move"}
      >
        {volume.kind === "portal" || volume.kind === "frame" ? (
          <>
            <rect x={x} y={y} width={width} height={height} rx="0.5" {...common} />
            <rect
              x={x + Math.min(2.2, width * 0.14)}
              y={y + Math.min(2.2, height * 0.12)}
              width={Math.max(1, width - Math.min(4.4, width * 0.28))}
              height={Math.max(1, height - Math.min(3.2, height * 0.18))}
              rx="0.35"
              fill={lineMode ? "#ffffff" : "url(#derived-facade-glass)"}
              fillOpacity="0.16"
              stroke="none"
            />
          </>
        ) : volume.kind === "slats" ? (
          <>
            <rect x={x} y={y} width={width} height={height} rx="0.3" fill={lineMode ? "#ffffff" : getFacadeMaterial(volume.materialId).shadeColor} opacity={lineMode ? 1 : 0.2} stroke="#64748b" strokeWidth="0.32" />
            {Array.from({ length: Math.max(3, Math.round(width / 1.6)) }).map((_, index) => (
              <rect
                key={index}
                x={x + (index * width) / Math.max(3, Math.round(width / 1.6))}
                y={y}
                width={Math.max(0.32, width / Math.max(8, Math.round(width / 0.7)))}
                height={height}
                {...common}
              />
            ))}
          </>
        ) : volume.kind === "pergola" ? (
          <>
            <rect x={x} y={y} width={width} height={Math.max(1.1, height * 0.12)} rx="0.2" {...common} />
            {Array.from({ length: 6 }).map((_, index) => (
              <rect
                key={index}
                x={x + (index * width) / 5}
                y={y}
                width={Math.max(0.4, width * 0.035)}
                height={height}
                {...common}
              />
            ))}
          </>
        ) : volume.kind === "planter" ? (
          <>
            <rect x={x} y={y} width={width} height={height} rx="0.35" {...common} />
            <ellipse cx={x + width * 0.3} cy={y - 0.4} rx={Math.max(0.8, width * 0.12)} ry="1" fill={lineMode ? "#ffffff" : "#66835f"} stroke={lineMode ? "#64748b" : "none"} strokeWidth="0.28" />
            <ellipse cx={x + width * 0.68} cy={y - 0.45} rx={Math.max(0.8, width * 0.13)} ry="1.05" fill={lineMode ? "#ffffff" : "#78936f"} stroke={lineMode ? "#64748b" : "none"} strokeWidth="0.28" />
          </>
        ) : volume.kind === "gate" ? (
          <>
            <rect x={x} y={y} width={width} height={height} rx="0.25" fill={lineMode ? "#ffffff" : getFacadeMaterial(volume.materialId).shadeColor} stroke={common.stroke} strokeWidth={common.strokeWidth} />
            {Array.from({ length: 8 }).map((_, index) => (
              <line
                key={index}
                x1={x + (index + 1) * width / 9}
                y1={y}
                x2={x + (index + 1) * width / 9}
                y2={y + height}
                stroke={getFacadeMaterial(volume.materialId).lineColor}
                strokeWidth="0.35"
                opacity="0.8"
              />
            ))}
          </>
        ) : volume.kind === "balcony" ? (
          <>
            <rect x={x} y={y + height * 0.58} width={width} height={height * 0.42} rx="0.18" {...common} />
            <rect x={x + width * 0.04} y={y + height * 0.12} width={width * 0.92} height={height * 0.48} rx="0.2" fill={lineMode ? "#ffffff" : "#b8d0dc"} fillOpacity={lineMode ? 1 : 0.42} stroke="#64748b" strokeWidth="0.38" />
          </>
        ) : (
          <rect x={x} y={y} width={width} height={height} rx={volume.kind === "canopy" ? 0.18 : 0.42} {...common} />
        )}

        {selected && (
          <>
            <circle cx={x} cy={y} r="1.15" fill="#fff" stroke="#f97316" strokeWidth="0.55" />
            <circle cx={x + width} cy={y + height} r="1.15" fill="#fff" stroke="#f97316" strokeWidth="0.55" />
          </>
        )}
      </g>
    );
  };

  const facadeViewY = Math.min(30, roofY - 14);
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
      className="block h-full w-full md:min-h-[calc(100vh-64px)]"
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

      <rect
        width="140"
        height="78"
        fill={lineMode ? "#ffffff" : design?.lighting === "night" ? "#111827" : design?.lighting === "sunset" ? "#ead8c8" : "url(#derived-facade-sky)"}
      />
      <rect y="63" width="140" height="15" fill={lineMode ? "#ffffff" : "#e4e9e2"} />
      <path d="M0 63 H140" stroke={lineMode ? "#64748b" : "#b9c3b7"} strokeWidth={lineMode ? "0.72" : "0.55"} />

      {!lineMode && <ellipse cx="70" cy="65.2" rx="56" ry="2.5" fill="#94a3a8" opacity="0.14" filter="url(#soft-shadow)" />}

      <path
        d={"M " + (garageDoorX - 2) + " 63 L " + (garageDoorX + garageW + 2) + " 63 L " + (garageDoorX + garageW + 9) + " 78 L " + (garageDoorX - 9) + " 78 Z"}
        fill={pavingFill}
        opacity="0.95"
        stroke={selectedSurface === "paving" ? "#f97316" : lineMode ? "#94a3b8" : "transparent"}
        strokeWidth={selectedSurface === "paving" ? "0.8" : lineMode ? "0.3" : "0"}
        className={onSelectSurface ? "cursor-pointer" : undefined}
        onClick={(event) => {
          if (!onSelectSurface) return;
          event.stopPropagation();
          onSelectSurface("paving");
          onSelectVolume?.(null);
        }}
      />

      <g filter={lineMode ? undefined : "url(#derived-facade-shadow)"}>
        <rect
          x={baseX}
          y={groundTop}
          width={facadeWidth}
          height={STORY_HEIGHT}
          rx="0.42"
          fill={mainFill}
          stroke={selectedSurface === "main" ? "#f97316" : lineMode ? "#334155" : "none"}
          strokeWidth={selectedSurface === "main" ? "0.8" : lineMode ? "0.7" : "0"}
          className={onSelectSurface ? "cursor-pointer" : undefined}
          onClick={(event) => {
            if (!onSelectSurface) return;
            event.stopPropagation();
            onSelectSurface("main");
            onSelectVolume?.(null);
          }}
        />

        {floors > 1 && (
          <rect
            x={upperX}
            y={groundTop - STORY_HEIGHT}
            width={upperW}
            height={STORY_HEIGHT}
            rx="0.42"
            fill={mainFill}
            stroke={lineMode ? "#334155" : "none"}
            strokeWidth={lineMode ? "0.7" : "0"}
          />
        )}

        <rect
          x={entryX - 1.5}
          y={floors > 1 ? groundTop - STORY_HEIGHT + 1.3 : groundTop - 3.8}
          width={entryW + 3}
          height={floors > 1 ? STORY_HEIGHT * 2 - 1.3 : STORY_HEIGHT + 3.8}
          rx="0.32"
          fill={accentFill}
          opacity={lineMode ? 1 : facade.accentMaterial === "nenhum" ? 0.34 : 0.96}
          stroke={selectedSurface === "accent" ? "#f97316" : lineMode ? "#475569" : "none"}
          strokeWidth={selectedSurface === "accent" ? "0.8" : lineMode ? "0.55" : "0"}
          className={onSelectSurface ? "cursor-pointer" : undefined}
          onClick={(event) => {
            if (!onSelectSurface) return;
            event.stopPropagation();
            onSelectSurface("accent");
            onSelectVolume?.(null);
          }}
        />

        {facade.style === "contemporaneo" && (
          <rect
            x={socialGlassX - 1.4}
            y={groundTop + 2.7}
            width={socialGlassW + 2.8}
            height="11.7"
            rx="0.35"
            fill={lineMode ? "#ffffff" : "#30363a"}
            opacity={lineMode ? 1 : 0.9}
            stroke={lineMode ? "#475569" : "none"}
            strokeWidth={lineMode ? "0.42" : "0"}
          />
        )}

        {facade.style === "industrial" && (
          <rect
            x={garageOnLeft ? baseX + facadeWidth - 7.2 : baseX}
            y={roofY - 3}
            width="7.2"
            height={groundY - roofY + 3}
            fill={lineMode ? "#ffffff" : "#444b50"}
            stroke={lineMode ? "#475569" : "none"}
            strokeWidth={lineMode ? "0.42" : "0"}
          />
        )}

        {facade.style === "rustico_contemporaneo" && (
          <rect x={baseX} y={groundY - 5.2} width={facadeWidth} height="5.2" fill={lineMode ? "url(#technical-wall)" : "url(#derived-stone)"} opacity={lineMode ? 1 : 0.92} stroke={lineMode ? "#64748b" : "none"} strokeWidth={lineMode ? "0.35" : "0"} />
        )}

        <rect
          x={garageDoorX}
          y={groundTop + 5.1}
          width={garageW}
          height={STORY_HEIGHT - 5.1}
          rx="0.42"
          fill={garageFill}
          stroke={selectedSurface === "garage" ? "#f97316" : frameColor}
          strokeWidth={selectedSurface === "garage" ? "1.05" : "0.7"}
          className={onSelectSurface ? "cursor-pointer" : undefined}
          onClick={(event) => {
            if (!onSelectSurface) return;
            event.stopPropagation();
            onSelectSurface("garage");
            onSelectVolume?.(null);
          }}
        />
        <g stroke="#6d767c" strokeWidth="0.32" opacity="0.88">
          <line x1={garageDoorX} y1={groundTop + 8.3} x2={garageDoorX + garageW} y2={groundTop + 8.3} />
          <line x1={garageDoorX} y1={groundTop + 11.5} x2={garageDoorX + garageW} y2={groundTop + 11.5} />
          <line x1={garageDoorX} y1={groundTop + 14.7} x2={garageDoorX + garageW} y2={groundTop + 14.7} />
          <line x1={garageDoorX + garageW / 2} y1={groundTop + 5.1} x2={garageDoorX + garageW / 2} y2={groundY} />
        </g>

        {frontDoors.length === 0 && (
          <>
            <rect
              x={entryX}
              y={groundY - 14.8}
              width={entryW}
              height="14.8"
              rx="0.35"
              fill={entranceFill}
              stroke={selectedSurface === "entrance" ? "#f97316" : colors.frame}
              strokeWidth={selectedSurface === "entrance" ? "1.05" : "0.65"}
              className={onSelectSurface ? "cursor-pointer" : undefined}
              onClick={(event) => {
                if (!onSelectSurface) return;
                event.stopPropagation();
                onSelectSurface("entrance");
                onSelectVolume?.(null);
              }}
            />
            <rect x={entryX + entryW * 0.68} y={groundY - 14.8} width={entryW * 0.32} height="14.8" fill={lineMode ? "url(#technical-glass)" : "#43545d"} opacity={lineMode ? 1 : 0.78} stroke={lineMode ? "#64748b" : "none"} strokeWidth={lineMode ? "0.28" : "0"} />
            <circle cx={entryX + entryW * 0.58} cy={groundY - 7.1} r="0.34" fill={lineMode ? "#334155" : "#d9c7b2"} />
          </>
        )}

        {frontWindows.length === 0 && (
          <>
            <Window
              x={socialGlassX}
              y={groundTop + 5.1}
              width={socialGlassW}
              height="8.8"
              frame={frameColor}
              id={glassPatternId}
            />
            {onSelectSurface && (
              <rect
                x={socialGlassX - 0.5}
                y={groundTop + 4.6}
                width={socialGlassW + 1}
                height="9.8"
                rx="0.35"
                fill="transparent"
                stroke={selectedSurface === "frames" ? "#f97316" : "transparent"}
                strokeWidth={selectedSurface === "frames" ? "0.9" : "0"}
                className="cursor-pointer"
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectSurface("frames");
                  onSelectVolume?.(null);
                }}
              />
            )}
          </>
        )}

        {frontWindows.length === 0 && floors === 1 && privateGround.map((room, index) => {
          const width = clamp(mapW(roomAxisSize(room)) * 0.52, 9, 15);
          const x = clamp(mapX(roomAxisStart(room)) + mapW(roomAxisSize(room)) / 2 - width / 2, baseX + 3, baseX + facadeWidth - width - 3);
          const overlapsMain = x < socialGlassX + socialGlassW + 2 && x + width > socialGlassX - 2;
          const overlapsGarage = x < garageDoorX + garageW + 2 && x + width > garageDoorX - 2;
          const overlapsEntry = x < entryX + entryW + 2 && x + width > entryX - 2;
          if (overlapsMain || overlapsGarage || overlapsEntry) return null;
          return (
            <Window
              key={room.id}
              x={x}
              y={groundTop + 6.2 + index * 0.15}
              width={width}
              height="7.2"
              frame={frameColor}
              id={glassPatternId}
            />
          );
        })}

        {floors > 1 && !hasUpperRealOpenings && upperRooms.map((room, index) => {
          const width = clamp(mapW(roomAxisSize(room)) * 0.55, 10, 17);
          const x = clamp(mapX(roomAxisStart(room)) + mapW(roomAxisSize(room)) / 2 - width / 2, upperX + 3, upperX + upperW - width - 3);
          return (
            <Window
              key={room.id}
              x={x}
              y={groundTop - STORY_HEIGHT + 5.2 + (index % 2) * 0.2}
              width={width}
              height="7.4"
              frame={frameColor}
              id={glassPatternId}
            />
          );
        })}

        {frontOpenings.map((opening) => {
          const widthMeters = Math.max(0.5, opening.width ?? (opening.type === "door" ? 0.95 : 1.35));
          const heightMeters = Math.max(0.5, opening.height ?? (opening.type === "door" ? 2.1 : 1.2));
          const sillMeters = opening.type === "door" ? 0 : Math.max(0, opening.sillHeight ?? 0.9);
          const width = clamp(mapW(widthMeters), opening.type === "door" ? 5 : 6, opening.type === "door" ? 18 : 22);
          const height = Math.max(4.2, heightMeters * verticalScale);
          const x = clamp(mapX(opening.axis) - width / 2, baseX + 1, baseX + facadeWidth - width - 1);
          const floorBaseY = groundY - opening.floor * STORY_HEIGHT;
          const y = floorBaseY - (sillMeters + heightMeters) * verticalScale;

          if (opening.type === "door") {
            return (
              <g
                key={opening.id}
                className={onSelectSurface ? "cursor-pointer" : undefined}
                onClick={(event) => {
                  if (!onSelectSurface) return;
                  event.stopPropagation();
                  onSelectSurface("entrance");
                  onSelectVolume?.(null);
                }}
              >
                <rect
                  x={x}
                  y={y}
                  width={width}
                  height={height}
                  rx="0.28"
                  fill={entranceFill}
                  stroke={selectedSurface === "entrance" ? "#f97316" : frameColor}
                  strokeWidth={selectedSurface === "entrance" ? "1" : "0.62"}
                />
                {opening.openingStyle === "sliding" && (
                  <line x1={x + width / 2} y1={y} x2={x + width / 2} y2={y + height} stroke={frameColor} strokeWidth="0.4" />
                )}
              </g>
            );
          }

          return (
            <g
              key={opening.id}
              className={onSelectSurface ? "cursor-pointer" : undefined}
              onClick={(event) => {
                if (!onSelectSurface) return;
                event.stopPropagation();
                onSelectSurface("frames");
                onSelectVolume?.(null);
              }}
            >
              <Window x={x} y={y} width={width} height={height} frame={frameColor} id="derived-facade-glass" />
              {selectedSurface === "frames" && (
                <rect x={x - 0.35} y={y - 0.35} width={width + 0.7} height={height + 0.7} rx="0.35" fill="none" stroke="#f97316" strokeWidth="0.75" />
              )}
            </g>
          );
        })}

        {facade.style === "classico_contemporaneo" && (
          <g>
            <rect
              x={entryX - 2}
              y={groundTop + 1.7}
              width={entryW + 4}
              height={STORY_HEIGHT - 1.7}
              fill="none"
              stroke="#d9d2c8"
              strokeWidth="1.05"
            />
            <line
              x1={entryX - 2}
              y1={groundTop + 1.7}
              x2={entryX + entryW + 2}
              y2={groundTop + 1.7}
              stroke="#bdb4a8"
              strokeWidth="1.15"
            />
          </g>
        )}

        {facade.style === "minimalista" && (
          <rect x={socialGlassX - 2.2} y={groundTop + 2.4} width={socialGlassW + 4.4} height="0.8" rx="0.2" fill={lineMode ? "#ffffff" : "#7c8287"} opacity={lineMode ? 1 : 0.75} stroke={lineMode ? "#475569" : "none"} strokeWidth={lineMode ? "0.34" : "0"} />
        )}

        {facade.style === "tropical" && (
          <g fill={lineMode ? "#ffffff" : "#9b6a47"} stroke={lineMode ? "#64748b" : "none"} strokeWidth={lineMode ? "0.28" : "0"}>
            <rect x={socialGlassX - 2.8} y={groundTop + 1.6} width={socialGlassW + 5.6} height="1.05" rx="0.22" />
            {Array.from({ length: 7 }).map((_, index) => (
              <rect
                key={index}
                x={socialGlassX - 1.8 + index * ((socialGlassW + 3.6) / 6)}
                y={groundTop + 1.6}
                width="0.42"
                height="5.1"
              />
            ))}
          </g>
        )}

        {design?.volumes.map(renderVolume)}
        <Roof x={roofX} y={roofY} width={roofW} facade={facade} color={lineMode ? "#ffffff" : colors.roof} />
        <rect x={baseX} y={groundY - 0.75} width={facadeWidth} height="0.75" fill={lineMode ? "#ffffff" : colors.wallShade} opacity={lineMode ? 1 : 0.72} stroke={lineMode ? "#64748b" : "none"} strokeWidth={lineMode ? "0.32" : "0"} />
      </g>

      {(design?.showLandscaping ?? true) && (
      <g opacity={lineMode ? 1 : facade.landscaping === "leve" ? 0.66 : facade.landscaping === "intenso" ? 1 : 0.86}>
        <ellipse cx={baseX + 5} cy="64.2" rx="7.4" ry="2.1" fill={lineMode ? "#ffffff" : "#7f9c79"} stroke={lineMode ? "#94a3b8" : "none"} strokeWidth={lineMode ? "0.28" : "0"} />
        <ellipse cx={baseX + facadeWidth - 5} cy="64" rx="6.7" ry="1.9" fill={lineMode ? "#ffffff" : "#89a481"} stroke={lineMode ? "#94a3b8" : "none"} strokeWidth={lineMode ? "0.28" : "0"} />
        <ellipse cx={baseX + facadeWidth * 0.71} cy="64.6" rx="4.8" ry="1.35" fill={lineMode ? "#ffffff" : "#93aa89"} stroke={lineMode ? "#94a3b8" : "none"} strokeWidth={lineMode ? "0.28" : "0"} />
        {facade.landscaping === "intenso" && (
          <>
            <circle cx={baseX + 2.6} cy="59.7" r="3.25" fill={lineMode ? "#ffffff" : "#73906f"} stroke={lineMode ? "#94a3b8" : "none"} strokeWidth={lineMode ? "0.28" : "0"} />
            <circle cx={baseX + facadeWidth - 2.2} cy="60.1" r="2.8" fill={lineMode ? "#ffffff" : "#7e9d77"} stroke={lineMode ? "#94a3b8" : "none"} strokeWidth={lineMode ? "0.28" : "0"} />
            <rect x={baseX + facadeWidth * 0.76} y="55.2" width="0.65" height="7.5" fill={lineMode ? "#ffffff" : "#7b6754"} stroke={lineMode ? "#94a3b8" : "none"} strokeWidth={lineMode ? "0.2" : "0"} />
            <ellipse cx={baseX + facadeWidth * 0.763} cy="54.4" rx="3.8" ry="2.4" fill={lineMode ? "#ffffff" : "#809d77"} stroke={lineMode ? "#94a3b8" : "none"} strokeWidth={lineMode ? "0.28" : "0"} />
          </>
        )}
      </g>
      )}

      <path d={"M " + (baseX - 4) + " 65.5 H " + (baseX + facadeWidth + 4)} stroke={lineMode ? "#475569" : "#a9b2a8"} strokeWidth={lineMode ? "0.72" : "0.58"} />
      <text x="70" y="74.2" textAnchor="middle" fontSize="1.65" fill="#667085" fontWeight="650" letterSpacing="0.08">
        {Math.round(overall.width * 10) / 10} m de frente construída · lote {lotWidth.toFixed(1)} m
      </text>
    </svg>
  );
}

