import { useMemo } from "react";
import { CONCEPT_TYPOLOGIES, type ConceptTypology } from "./conceptTemplates";

type Props = {
  typology: ConceptTypology;
  lotWidth: number;
  lotDepth: number;
  variant?: number;
};

type PreviewTheme = {
  wall: string;
  accent: string;
  dark: string;
  roof: string;
  glass: string;
  landscaping: string;
};

const THEMES: Record<ConceptTypology, PreviewTheme> = {
  terrea_2q: {
    wall: "#f3efe8",
    accent: "#b58c66",
    dark: "#31363b",
    roof: "#40464c",
    glass: "#9fc4d7",
    landscaping: "#73845f",
  },
  terrea_3q: {
    wall: "#f5f3ef",
    accent: "#8f775f",
    dark: "#292f34",
    roof: "#3a4146",
    glass: "#9fc7db",
    landscaping: "#687d58",
  },
  terrea_lazer: {
    wall: "#f1eee8",
    accent: "#9f7855",
    dark: "#2b3135",
    roof: "#383f43",
    glass: "#91bfd5",
    landscaping: "#58744f",
  },
  sobrado_3q: {
    wall: "#f0eee9",
    accent: "#8b6d51",
    dark: "#282e33",
    roof: "#373d42",
    glass: "#91bad0",
    landscaping: "#607953",
  },
  sobrado_master: {
    wall: "#ece9e3",
    accent: "#7f654e",
    dark: "#242a2e",
    roof: "#31373b",
    glass: "#88b4ca",
    landscaping: "#536c49",
  },
};

export default function ConceptTypologyPreview({
  typology,
  lotWidth,
  lotDepth,
}: Props) {
  const template = useMemo(
    () => CONCEPT_TYPOLOGIES.find((item) => item.id === typology) ?? CONCEPT_TYPOLOGIES[0],
    [typology],
  );

  const theme = THEMES[typology];
  const isTwoStorey = template.floors > 1;
  const hasPool = template.rooms.some((room) => room.kind === "piscina");
  const hasGourmet = template.rooms.some((room) => room.kind === "gourmet");
  const compact = typology === "terrea_2q";

  const houseX = compact ? 92 : 72;
  const houseWidth = compact ? 430 : 470;
  const groundY = 300;
  const lowerH = 142;
  const upperH = isTwoStorey ? 105 : 0;
  const houseTop = groundY - lowerH - upperH;

  return (
    <div className="h-full min-h-[190px] overflow-hidden rounded-xl bg-[#eef3f5]">
      <svg
        className="block h-full min-h-[190px] w-full"
        viewBox="0 0 640 400"
        preserveAspectRatio="xMidYMid slice"
        role="img"
        aria-label={`Prévia arquitetônica de ${template.title}`}
      >
        <defs>
          <linearGradient id={`sky-${typology}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dce8ee" />
            <stop offset="100%" stopColor="#f7fafb" />
          </linearGradient>
          <linearGradient id={`glass-${typology}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#c7e0eb" />
            <stop offset="55%" stopColor={theme.glass} />
            <stop offset="100%" stopColor="#6e8fa0" />
          </linearGradient>
          <linearGradient id={`ground-${typology}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#b7bdaf" />
            <stop offset="100%" stopColor="#87917f" />
          </linearGradient>
          <filter id={`shadow-${typology}`} x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow dx="0" dy="12" stdDeviation="10" floodColor="#1f2937" floodOpacity="0.16" />
          </filter>
        </defs>

        <rect width="640" height="400" fill={`url(#sky-${typology})`} />
        <circle cx="545" cy="62" r="28" fill="#ffffff" opacity="0.7" />

        <g opacity="0.68">
          <circle cx="42" cy="180" r="44" fill="#91a487" />
          <circle cx="70" cy="190" r="52" fill="#7f9675" />
          <rect x="52" y="205" width="9" height="92" rx="4" fill="#6e5b48" />
          <circle cx="598" cy="196" r="42" fill="#89a17c" />
          <circle cx="570" cy="205" r="50" fill="#78916d" />
          <rect x="580" y="215" width="9" height="82" rx="4" fill="#6f5944" />
        </g>

        <rect y="292" width="640" height="108" fill={`url(#ground-${typology})`} />
        <path d="M0 330 C155 310 255 318 370 332 C490 347 557 335 640 320 L640 400 L0 400 Z" fill="#9ca58f" />
        <path d="M0 354 C164 335 318 350 640 340 L640 400 L0 400 Z" fill="#8e9884" opacity="0.9" />

        <g filter={`url(#shadow-${typology})`}>
          {isTwoStorey && (
            <>
              <rect
                x={houseX + 105}
                y={houseTop}
                width={houseWidth - 125}
                height={upperH + 12}
                rx="3"
                fill={theme.wall}
              />
              <rect
                x={houseX + 105}
                y={houseTop}
                width={houseWidth - 125}
                height="16"
                fill={theme.dark}
              />
              <rect
                x={houseX + 132}
                y={houseTop + 32}
                width="85"
                height="47"
                rx="2"
                fill={`url(#glass-${typology})`}
                stroke="#334155"
                strokeWidth="5"
              />
              <rect
                x={houseX + 250}
                y={houseTop + 32}
                width="102"
                height="47"
                rx="2"
                fill={`url(#glass-${typology})`}
                stroke="#334155"
                strokeWidth="5"
              />
            </>
          )}

          <rect
            x={houseX}
            y={groundY - lowerH}
            width={houseWidth}
            height={lowerH}
            rx="3"
            fill={theme.wall}
          />

          <rect
            x={houseX}
            y={groundY - lowerH}
            width={houseWidth}
            height="18"
            fill={theme.roof}
          />

          <rect
            x={houseX + houseWidth * 0.54}
            y={groundY - lowerH}
            width={houseWidth * 0.18}
            height={lowerH}
            fill={theme.accent}
            opacity="0.95"
          />

          <rect
            x={houseX + 22}
            y={groundY - 88}
            width={compact ? 155 : 175}
            height="88"
            rx="2"
            fill="#d8dad8"
            stroke="#a7aba9"
            strokeWidth="2"
          />
          <line x1={houseX + 22} y1={groundY - 58} x2={houseX + (compact ? 177 : 197)} y2={groundY - 58} stroke="#b2b6b4" strokeWidth="2" />
          <line x1={houseX + 22} y1={groundY - 30} x2={houseX + (compact ? 177 : 197)} y2={groundY - 30} stroke="#b2b6b4" strokeWidth="2" />

          <rect
            x={houseX + houseWidth * 0.27}
            y={groundY - 86}
            width="78"
            height="58"
            rx="2"
            fill={`url(#glass-${typology})`}
            stroke="#334155"
            strokeWidth="5"
          />

          <rect
            x={houseX + houseWidth * 0.575}
            y={groundY - 100}
            width="54"
            height="100"
            fill={theme.dark}
          />
          <rect
            x={houseX + houseWidth * 0.59}
            y={groundY - 86}
            width="24"
            height="72"
            fill="#715b49"
          />

          <rect
            x={houseX + houseWidth * 0.76}
            y={groundY - 86}
            width={houseWidth * 0.17}
            height="56"
            rx="2"
            fill={`url(#glass-${typology})`}
            stroke="#334155"
            strokeWidth="5"
          />

          {hasGourmet && (
            <rect
              x={houseX + houseWidth - 65}
              y={groundY - 118}
              width="78"
              height="118"
              fill={theme.dark}
              opacity="0.96"
            />
          )}
        </g>

        <path
          d={`M${houseX - 12} ${groundY + 1} L${houseX + houseWidth + 28} ${groundY + 1} L${houseX + houseWidth + 70} 374 L${houseX - 45} 374 Z`}
          fill="#d8d4cc"
        />
        <path
          d={`M${houseX + 205} ${groundY + 1} L${houseX + 300} ${groundY + 1} L${houseX + 324} 374 L${houseX + 190} 374 Z`}
          fill="#beb9b0"
        />

        {hasPool && (
          <g>
            <path d="M395 323 L573 323 L608 370 L418 370 Z" fill="#68b7d3" stroke="#e7f6fb" strokeWidth="8" />
            <path d="M412 337 L568 337" stroke="#bce8f5" strokeWidth="3" opacity="0.7" />
            <path d="M430 350 L586 350" stroke="#bce8f5" strokeWidth="2" opacity="0.6" />
          </g>
        )}

        <g fill={theme.landscaping}>
          <ellipse cx={houseX + 18} cy="306" rx="34" ry="13" />
          <ellipse cx={houseX + houseWidth - 42} cy="307" rx="38" ry="14" />
          <ellipse cx={houseX + houseWidth + 22} cy="312" rx="24" ry="10" />
        </g>

        <g>
          <rect x="18" y="18" width="142" height="34" rx="17" fill="#ffffff" opacity="0.92" />
          <text x="32" y="40" fontSize="14" fontWeight="800" fill="#334155">
            {template.floors === 1 ? "CASA TÉRREA" : "SOBRADO"}
          </text>
        </g>

        <g>
          <rect x="18" y="62" width="205" height="29" rx="14.5" fill="#ffffff" opacity="0.86" />
          <text x="31" y="81.5" fontSize="11.5" fontWeight="700" fill="#475569">
            {template.suggestedArea} m² · lote {lotWidth.toFixed(0)} × {lotDepth.toFixed(0)} m
          </text>
        </g>
      </svg>
    </div>
  );
}
