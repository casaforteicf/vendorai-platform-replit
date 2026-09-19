import type { ConceptFacadePreferences } from "./ConceptVolumetry";
import type { ConceptModelLevel } from "./ConceptModel3D";
import { normalizeOpeningParameters } from "./conceptOpenings";
import { buildRoofFacadeProfile, normalizeRoofParameters } from "./conceptRoof";

type Props = {
  lotWidth: number;
  levels: ConceptModelLevel[];
  facade: ConceptFacadePreferences;
};

const EPS = 0.08;
const WALL_HEIGHT = 2.8;
const FLOOR_THICKNESS = 0.16;

function facadePalette(facade: ConceptFacadePreferences) {
  const wall =
    facade.primaryMaterial === "madeira" ? "#d6ae88" :
    facade.primaryMaterial === "pedra" ? "#d6d1c8" :
    facade.primaryMaterial === "concreto" ? "#c7ccd1" :
    facade.facadeTone === "escuro" ? "#747a81" :
    facade.facadeTone === "medio" ? "#dedbd5" : "#f2f0ec";

  const accent =
    facade.accentMaterial === "madeira" ? "#8f6247" :
    facade.accentMaterial === "pedra" ? "#8d877e" :
    facade.accentMaterial === "concreto" ? "#777f86" : "#c5c0b8";

  const frame =
    facade.frameTone === "branco" ? "#f5f7f8" :
    facade.frameTone === "bronze" ? "#69513f" : "#202428";

  return { wall, accent, frame };
}

function specificationFrameColor(value: string | undefined, fallback: string) {
  const normalized = value?.trim().toLocaleLowerCase("pt-BR");
  if (!normalized) return fallback;
  if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized;
  if (normalized.includes("branco")) return "#f5f7f8";
  if (normalized.includes("preto")) return "#202428";
  if (normalized.includes("grafite")) return "#3f454a";
  if (normalized.includes("bronze")) return "#69513f";
  if (normalized.includes("cinza")) return "#737b82";
  if (normalized.includes("madeira") || normalized.includes("amadeir")) return "#815d45";
  return fallback;
}

function glassOpacity(glassType: string | undefined) {
  if (glassType === "frosted") return 0.72;
  if (glassType === "insulated") return 0.9;
  if (glassType === "laminated") return 0.94;
  if (glassType === "tempered") return 0.97;
  return 1;
}

function frontSegments(level: ConceptModelLevel) {
  const legacyExterior = level.walls.filter(
    (wall) => wall.exterior && Math.abs(wall.y1 - wall.y2) <= EPS,
  );
  const customHorizontal = level.customWalls.filter(
    (wall) => Math.abs(wall.y1 - wall.y2) <= EPS,
  );
  const candidates = legacyExterior.length > 0 ? legacyExterior : customHorizontal;
  if (!candidates.length) return { segments: [], frontY: 0 };

  const frontY = Math.max(...candidates.map((wall) => (wall.y1 + wall.y2) / 2));
  const segments = candidates.filter((wall) => {
    const y = (wall.y1 + wall.y2) / 2;
    return y >= frontY - 2.5;
  });

  return { segments, frontY };
}

function frontOpenings(
  level: ConceptModelLevel,
  frontY: number,
  segments: Array<{ id: string; x1: number; y1: number; x2: number; y2: number }>,
) {
  const wallIds = new Set(segments.map((wall) => wall.id));
  return level.openings.filter((opening) => {
    if (opening.orientation !== "horizontal") return false;
    if (opening.wallId) return wallIds.has(opening.wallId);
    return Math.abs(opening.y - frontY) <= 2.55;
  });
}

function Roof({
  x,
  y,
  widthMeters,
  depthMeters,
  scaleX,
  pxPerMeterY,
  facade,
}: {
  x: number;
  y: number;
  widthMeters: number;
  depthMeters: number;
  scaleX: number;
  pxPerMeterY: number;
  facade: ConceptFacadePreferences;
}) {
  const params = normalizeRoofParameters(facade);
  const pathFor = (
    originX: number,
    visibleWidth: number,
    visibleDepth: number,
    source: ConceptFacadePreferences,
  ) => {
    const profile = buildRoofFacadeProfile(visibleWidth, visibleDepth, source);
    return profile
      .map((point, index) =>
        `${index === 0 ? "M" : "L"} ${originX + point.x * scaleX} ${y - point.z * pxPerMeterY}`
      )
      .join(" ") + " Z";
  };

  if (params.roof === "platibanda") {
    const height = params.roofParapetHeight * pxPerMeterY;
    return (
      <>
        <rect x={x} y={y - height} width={widthMeters * scaleX} height={height} fill="#747a80" />
        <rect
          x={x + 0.45}
          y={y - height * 0.62}
          width={Math.max(0, widthMeters * scaleX - 0.9)}
          height={Math.max(0.5, height * 0.42)}
          fill="#9da3a8"
          opacity="0.45"
        />
      </>
    );
  }

  if (params.roof === "misto") {
    const splitMeters = widthMeters * params.roofMixedRatio;
    const flatHeight = params.roofParapetHeight * pxPerMeterY;
    const pitchedWidth = Math.max(0.1, widthMeters - splitMeters + params.roofOverhang * 2);
    const pitchedDepth = depthMeters + params.roofOverhang * 2;
    const pitchedX = x + splitMeters * scaleX - params.roofOverhang * scaleX;
    const pitchedSource = { ...facade, roof: "aparente" as const };
    return (
      <>
        <rect
          x={x}
          y={y - flatHeight}
          width={splitMeters * scaleX}
          height={flatHeight}
          fill="#747a80"
        />
        <path
          d={pathFor(pitchedX, pitchedWidth, pitchedDepth, pitchedSource)}
          fill="#76513f"
          stroke="#50382d"
          strokeWidth="0.55"
        />
      </>
    );
  }

  const overhang = params.roofOverhang;
  const visibleWidth = widthMeters + overhang * 2;
  const visibleDepth = depthMeters + overhang * 2;
  const originX = x - overhang * scaleX;
  return (
    <path
      d={pathFor(originX, visibleWidth, visibleDepth, facade)}
      fill="#76513f"
      stroke="#50382d"
      strokeWidth="0.6"
    />
  );
}
export default function ConceptDerivedFacade({ lotWidth, levels, facade }: Props) {
  const colors = facadePalette(facade);
  const usable = levels
    .map((level) => ({ level, ...frontSegments(level) }))
    .filter((entry) => entry.segments.length > 0);

  const maxFloor = usable.reduce((max, entry) => Math.max(max, entry.level.floor), 0);
  const scaleX = 94 / Math.max(6, lotWidth);
  const baseX = 13;
  const groundY = 58;
  const pxPerMeterY = 7.2;

  const topLevel = usable.find((entry) => entry.level.floor === maxFloor);
  const topMinX = topLevel?.segments.length
    ? Math.min(...topLevel.segments.flatMap((wall) => [wall.x1, wall.x2]))
    : 0;
  const topMaxX = topLevel?.segments.length
    ? Math.max(...topLevel.segments.flatMap((wall) => [wall.x1, wall.x2]))
    : lotWidth;
  const topMinY = topLevel?.level.closedSpaces.length
    ? Math.min(...topLevel.level.closedSpaces.map((space) => space.bounds.y))
    : 0;
  const topMaxY = topLevel?.level.closedSpaces.length
    ? Math.max(...topLevel.level.closedSpaces.map((space) => space.bounds.y + space.bounds.height))
    : Math.max(6, lotWidth * 0.7);
  const roofX = baseX + topMinX * scaleX;
  const roofWidthMeters = Math.max(1, topMaxX - topMinX);
  const roofDepthMeters = Math.max(1, topMaxY - topMinY);
  const topWallHeight = topLevel
    ? Math.max(WALL_HEIGHT, topLevel.level.floorToFloorHeight - FLOOR_THICKNESS)
    : WALL_HEIGHT;
  const roofY = groundY
    - (topLevel?.level.elevation ?? 0) * pxPerMeterY
    - (topWallHeight + FLOOR_THICKNESS) * pxPerMeterY;

  return (
    <svg viewBox="0 0 120 76" className="block h-auto w-full" role="img" aria-label="Fachada derivada da geometria do pré-projeto">
      <defs>
        <linearGradient id="derived-facade-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7f9fb" />
          <stop offset="100%" stopColor="#e8edf1" />
        </linearGradient>
        <linearGradient id="derived-facade-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#81939d" />
          <stop offset="55%" stopColor="#4f626c" />
          <stop offset="100%" stopColor="#2a343a" />
        </linearGradient>
        <pattern id="derived-stone" width="4" height="3" patternUnits="userSpaceOnUse">
          <rect width="4" height="3" fill={colors.accent} />
          <path d="M0 1.5 H4 M2 0 V1.5 M1 1.5 V3" stroke="#fff" strokeOpacity="0.15" strokeWidth="0.2" />
        </pattern>
        <filter id="derived-facade-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="1.3" stdDeviation="1.4" floodColor="#64748b" floodOpacity="0.2" />
        </filter>
      </defs>

      <rect width="120" height="76" fill="url(#derived-facade-sky)" />
      <rect y="60" width="120" height="16" fill="#e7ebe5" />
      <path d="M0 60 H120" stroke="#c4cbc1" strokeWidth="0.5" />

      <g filter="url(#derived-facade-shadow)">
        {usable.map(({ level, segments, frontY }) => {
          const wallHeight = Math.max(WALL_HEIGHT, level.floorToFloorHeight - FLOOR_THICKNESS);
          const levelBottom = groundY - level.elevation * pxPerMeterY;
          const levelTop = levelBottom - wallHeight * pxPerMeterY;
          const minX = Math.min(...segments.flatMap((wall) => [wall.x1, wall.x2]));
          const maxX = Math.max(...segments.flatMap((wall) => [wall.x1, wall.x2]));
          const bodyX = baseX + minX * scaleX;
          const bodyW = Math.max(4, (maxX - minX) * scaleX);
          const openings = frontOpenings(level, frontY, segments);

          return (
            <g key={`facade-level-${level.floor}`}>
              <rect
                x={bodyX}
                y={levelTop}
                width={bodyW}
                height={wallHeight * pxPerMeterY}
                fill={colors.wall}
              />

              {segments.map((wall, index) => {
                const sx = baseX + Math.min(wall.x1, wall.x2) * scaleX;
                const sw = Math.max(1.2, Math.abs(wall.x2 - wall.x1) * scaleX);
                const useAccent =
                  facade.style === "industrial" ? index % 3 === 0 :
                  facade.style === "minimalista" ? index === segments.length - 1 :
                  index % 2 === 1;
                if (!useAccent) return null;
                return (
                  <rect
                    key={wall.id}
                    x={sx}
                    y={levelTop}
                    width={sw}
                    height={wallHeight * pxPerMeterY}
                    fill={facade.accentMaterial === "pedra" ? "url(#derived-stone)" : colors.accent}
                    opacity="0.62"
                  />
                );
              })}

              {openings.map((opening) => {
                const params = normalizeOpeningParameters(opening.type, opening);
                const widthM = params.width;
                const heightM = params.height;
                const sillM = params.sillHeight;
                const openingX = baseX + (opening.x - widthM / 2) * scaleX;
                const openingW = Math.max(3.8, widthM * scaleX);
                const openingY = levelBottom - (sillM + heightM) * pxPerMeterY;
                const openingH = heightM * pxPerMeterY;
                const frameColor = specificationFrameColor(params.frameColor, colors.frame);
                const leafDividers = params.leafCount > 1
                  ? Array.from({ length: params.leafCount - 1 }, (_, index) => (index + 1) / params.leafCount)
                  : [];

                if (opening.type === "door") {
                  return (
                    <g key={opening.id}>
                      <rect
                        x={openingX}
                        y={levelBottom - openingH}
                        width={openingW}
                        height={openingH}
                        rx="0.25"
                        fill={params.glassType && params.glassType !== "none"
                          ? "url(#derived-facade-glass)"
                          : facade.accentMaterial === "madeira" ? "#8a5d43" : "#4b5055"}
                        fillOpacity={params.glassType && params.glassType !== "none" ? glassOpacity(params.glassType) : 1}
                        stroke={frameColor}
                        strokeWidth="0.55"
                      />
                      {leafDividers.map((ratio) => (
                        <line
                          key={ratio}
                          x1={openingX + openingW * ratio}
                          y1={levelBottom - openingH}
                          x2={openingX + openingW * ratio}
                          y2={levelBottom}
                          stroke={frameColor}
                          strokeOpacity="0.72"
                          strokeWidth="0.32"
                        />
                      ))}
                      {params.openingStyle === "hinged" ? (
                        <circle
                          cx={params.swing === "right" ? openingX + 0.8 : openingX + openingW - 0.8}
                          cy={levelBottom - Math.min(heightM * 0.48, 1.05) * pxPerMeterY}
                          r="0.28"
                          fill="#d7c8b8"
                        />
                      ) : null}
                    </g>
                  );
                }

                return (
                  <g key={opening.id}>
                    <rect
                      x={openingX}
                      y={openingY}
                      width={openingW}
                      height={openingH}
                      rx="0.22"
                      fill={params.glassType === "none" ? colors.wall : "url(#derived-facade-glass)"}
                      fillOpacity={params.glassType === "none" ? 1 : glassOpacity(params.glassType)}
                      stroke={frameColor}
                      strokeWidth="0.6"
                    />
                    {leafDividers.map((ratio) => (
                      <line
                        key={ratio}
                        x1={openingX + openingW * ratio}
                        y1={openingY}
                        x2={openingX + openingW * ratio}
                        y2={openingY + openingH}
                        stroke={frameColor}
                        strokeOpacity="0.7"
                        strokeWidth="0.32"
                      />
                    ))}
                    {params.openingStyle === "hinged" && (
                      <line
                        x1={params.swing === "right" ? openingX + openingW : openingX}
                        y1={openingY}
                        x2={params.swing === "right" ? openingX : openingX + openingW}
                        y2={openingY + openingH}
                        stroke="#d4dde2"
                        strokeOpacity="0.55"
                        strokeWidth="0.28"
                      />
                    )}
                    {params.openingStyle === "tilt_turn" && (
                      <>
                        <line
                          x1={openingX}
                          y1={openingY}
                          x2={openingX + openingW / 2}
                          y2={openingY + openingH}
                          stroke="#d4dde2"
                          strokeOpacity="0.58"
                          strokeWidth="0.26"
                        />
                        <line
                          x1={openingX + openingW}
                          y1={openingY}
                          x2={openingX + openingW / 2}
                          y2={openingY + openingH}
                          stroke="#d4dde2"
                          strokeOpacity="0.58"
                          strokeWidth="0.26"
                        />
                      </>
                    )}
                  </g>
                );
              })}

            </g>
          );
        })}

        {usable.length > 0 && (
          <Roof
            x={roofX}
            y={roofY}
            widthMeters={roofWidthMeters}
            depthMeters={roofDepthMeters}
            scaleX={scaleX}
            pxPerMeterY={pxPerMeterY}
            facade={facade}
          />
        )}
      </g>

      <g opacity={facade.landscaping === "leve" ? 0.58 : facade.landscaping === "intenso" ? 1 : 0.82}>
        <ellipse cx="18" cy="60.7" rx="7.6" ry="2.4" fill="#7f9f7b" />
        <ellipse cx="102" cy="60.5" rx="6.8" ry="2.1" fill="#8aa786" />
        {facade.landscaping === "intenso" && (
          <>
            <circle cx="12" cy="55.7" r="3.4" fill="#789875" />
            <circle cx="108" cy="56.1" r="2.9" fill="#86a680" />
          </>
        )}
      </g>

      <path d="M9 62 H111" stroke="#aab3aa" strokeWidth="0.62" />
      <text x="60" y="70.5" textAnchor="middle" fontSize="2.1" fill="#64748b" fontWeight="700" letterSpacing="0.15">
        FACHADA DERIVADA DO MODELO
      </text>
    </svg>
  );
}
