import type { ConceptFacadePreferences } from "./ConceptVolumetry";
import type { ConceptRoomShape } from "./conceptGeometry";

type Props = {
  rooms: ConceptRoomShape[];
  floors: number;
  lotWidth?: number;
  facade: ConceptFacadePreferences;
};

function palette(facade: ConceptFacadePreferences) {
  const wall =
    facade.primaryMaterial === "madeira" ? "#d8b08c" :
    facade.primaryMaterial === "pedra" ? "#d4d0c8" :
    facade.primaryMaterial === "concreto" ? "#c8ced3" :
    facade.facadeTone === "escuro" ? "#777d84" :
    facade.facadeTone === "medio" ? "#dedbd5" : "#f1efea";

  const accent =
    facade.accentMaterial === "madeira" ? "#936447" :
    facade.accentMaterial === "pedra" ? "#8d867d" :
    facade.accentMaterial === "concreto" ? "#7b8289" :
    "#c7c2ba";

  const frame =
    facade.frameTone === "branco" ? "#eef2f5" :
    facade.frameTone === "bronze" ? "#6c523f" : "#25282c";

  return { wall, accent, frame };
}

function Roof({
  x,
  y,
  width,
  facade,
}: {
  x: number;
  y: number;
  width: number;
  facade: ConceptFacadePreferences;
}) {
  if (facade.roof === "platibanda") {
    return (
      <>
        <rect x={x - 0.8} y={y - 2.1} width={width + 1.6} height="2.5" rx="0.3" fill="#6f747a" />
        <rect x={x} y={y - 0.3} width={width} height="1.3" fill="#a3a8ad" opacity="0.45" />
      </>
    );
  }
  if (facade.roof === "misto") {
    return (
      <>
        <rect x={x - 0.5} y={y - 1.7} width={width * 0.53} height="2.2" rx="0.3" fill="#6f747a" />
        <path
          d={`M ${x + width * 0.43} ${y} L ${x + width * 0.72} ${y - 9.2} L ${x + width} ${y} Z`}
          fill="#7e5642"
        />
        <path
          d={`M ${x + width * 0.43} ${y} L ${x + width * 0.72} ${y - 9.2} L ${x + width} ${y}`}
          fill="none"
          stroke="#5d4033"
          strokeWidth="0.7"
        />
      </>
    );
  }
  return (
    <>
      <path
        d={`M ${x - 1.5} ${y} L ${x + width / 2} ${y - 11.5} L ${x + width + 1.5} ${y} Z`}
        fill="#7e5642"
      />
      <path
        d={`M ${x - 1.5} ${y} L ${x + width / 2} ${y - 11.5} L ${x + width + 1.5} ${y}`}
        fill="none"
        stroke="#5d4033"
        strokeWidth="0.8"
      />
    </>
  );
}

export default function ConceptFacadeElevation({ rooms, floors, lotWidth = 12, facade }: Props) {
  const colors = palette(facade);
  const garage = rooms.find((room) => room.kind === "garagem");
  const social = rooms.find((room) => room.kind === "sala");
  const hasUpper = floors > 1 && rooms.some((room) => room.floor > 0);
  const garageOnRight = Boolean(garage && garage.x + garage.width / 2 > lotWidth / 2);

  const x = 11;
  const bodyWidth = 98;
  const groundY = 34;
  const groundH = 24;
  const upperY = 14;
  const upperH = 20;

  const garageWidth = Math.min(38, Math.max(29, (garage?.width ?? 5.8) * 5.3));
  const socialWidth = Math.max(38, bodyWidth - garageWidth - 8);
  const garageX = garageOnRight ? x + bodyWidth - garageWidth : x;
  const socialX = garageOnRight ? x : garageX + garageWidth + 8;
  const entranceX = garageOnRight ? garageX - 6.5 : garageX + garageWidth + 2.5;

  const glassWidth = facade.style === "minimalista" || facade.style === "tropical"
    ? Math.min(29, socialWidth - 7)
    : Math.min(24, socialWidth - 10);
  const upperShift =
    facade.style === "industrial" ? 5 :
    facade.style === "rustico_contemporaneo" ? 3 :
    facade.style === "tropical" ? -2 : 0;

  return (
    <svg viewBox="0 0 120 72" className="block h-auto w-full" role="img" aria-label="Elevação frontal conceitual">
      <defs>
        <linearGradient id="facade-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f6f8fb" />
          <stop offset="100%" stopColor="#e9eef2" />
        </linearGradient>
        <linearGradient id="facade-glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#78909c" />
          <stop offset="50%" stopColor="#4f626c" />
          <stop offset="100%" stopColor="#2f3a40" />
        </linearGradient>
        <filter id="facade-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodColor="#64748b" floodOpacity="0.18" />
        </filter>
        <pattern id="stone-pattern" width="4" height="3" patternUnits="userSpaceOnUse">
          <rect width="4" height="3" fill={colors.accent} />
          <path d="M0 1.5 H4 M2 0 V1.5 M1 1.5 V3" stroke="#ffffff" strokeOpacity="0.14" strokeWidth="0.22" />
        </pattern>
      </defs>

      <rect width="120" height="72" fill="url(#facade-sky)" />
      <rect y="58" width="120" height="14" fill="#e6ebe4" />
      <path d="M0 60 H120" stroke="#c3cbc1" strokeWidth="0.55" />
      <path d="M6 64 C25 61, 38 62, 55 64 S92 66, 114 63" fill="none" stroke="#d2d8d0" strokeWidth="0.6" />

      <g filter="url(#facade-shadow)">
        <rect x={x} y={groundY} width={bodyWidth} height={groundH} rx="0.45" fill={colors.wall} />

        <rect
          x={garageX}
          y={groundY + 3.2}
          width={garageWidth}
          height={groundH - 3.2}
          fill={facade.accentMaterial === "pedra" ? "url(#stone-pattern)" : colors.accent}
          opacity="0.96"
        />

        {hasUpper && (
          <>
            <rect
              x={x + 17 + upperShift}
              y={upperY}
              width={65}
              height={upperH}
              rx="0.4"
              fill={colors.wall}
            />
            <rect
              x={x + 17 + upperShift}
              y={upperY}
              width="8"
              height={upperH}
              fill={colors.accent}
              opacity="0.82"
            />
          </>
        )}

        <Roof x={hasUpper ? x + 17 + upperShift : x} y={hasUpper ? upperY : groundY} width={hasUpper ? 65 : bodyWidth} facade={facade} />

        <rect
          x={garageX + 3}
          y={groundY + 8}
          width={garageWidth - 6}
          height={groundH - 8}
          rx="0.45"
          fill="#31363b"
        />
        <g stroke="#6f777e" strokeWidth="0.42" opacity="0.95">
          <line x1={garageX + 3} y1={groundY + 12} x2={garageX + garageWidth - 3} y2={groundY + 12} />
          <line x1={garageX + 3} y1={groundY + 16} x2={garageX + garageWidth - 3} y2={groundY + 16} />
          <line x1={garageX + garageWidth / 2} y1={groundY + 8} x2={garageX + garageWidth / 2} y2={groundY + groundH} />
        </g>

        <rect x={entranceX} y={groundY + 6.2} width="5.3" height="16.2" rx="0.35" fill="#8c6046" />
        <rect x={entranceX - 1.4} y={groundY + 3.4} width="8.5" height="1.5" rx="0.35" fill="#6f747a" />
        <circle cx={entranceX + 4.4} cy={groundY + 14.3} r="0.35" fill="#d9c8b5" />

        <rect
          x={socialX + 3.2}
          y={groundY + 6.3}
          width={glassWidth}
          height="11.5"
          rx="0.45"
          fill="url(#facade-glass)"
          stroke={colors.frame}
          strokeWidth="0.8"
        />
        <line x1={socialX + 3.2 + glassWidth / 2} y1={groundY + 6.3} x2={socialX + 3.2 + glassWidth / 2} y2={groundY + 17.8} stroke="#c7d0d6" strokeOpacity="0.65" strokeWidth="0.42" />

        <rect
          x={socialX + glassWidth + 6.2}
          y={groundY + 5.3}
          width={Math.max(7.8, socialWidth - glassWidth - 9.6)}
          height="13.2"
          rx="0.35"
          fill={facade.style === "industrial" ? "#5f666c" : colors.accent}
          opacity="0.9"
        />

        {hasUpper && (
          <>
            <rect x={x + 30 + upperShift} y={upperY + 6} width="16" height="7.8" rx="0.35" fill="url(#facade-glass)" stroke={colors.frame} strokeWidth="0.7" />
            <rect x={x + 53 + upperShift} y={upperY + 6} width="17" height="7.8" rx="0.35" fill="url(#facade-glass)" stroke={colors.frame} strokeWidth="0.7" />
          </>
        )}

        {facade.style === "tropical" && (
          <g fill="#9a6c48">
            <rect x={socialX + 1} y={groundY + 1.1} width={socialWidth - 1} height="1.4" rx="0.25" />
            {Array.from({ length: 7 }).map((_, index) => (
              <rect key={index} x={socialX + 2 + index * 4.2} y={groundY + 1.1} width="0.45" height="5" />
            ))}
          </g>
        )}

        {facade.style === "industrial" && (
          <rect x={garageOnRight ? x + 3 : x + bodyWidth - 7} y={groundY - 7} width="4.4" height="31" rx="0.25" fill="#42494f" />
        )}

        {facade.style === "classico_contemporaneo" && (
          <>
            <rect x={entranceX - 2.2} y={groundY + 2.5} width="9.8" height="20" fill="none" stroke="#d8d1c6" strokeWidth="1.25" />
            <line x1={entranceX - 2.2} y1={groundY + 2.5} x2={entranceX + 7.6} y2={groundY + 2.5} stroke="#beb5a8" strokeWidth="1.3" />
          </>
        )}

        {facade.style === "minimalista" && (
          <rect x={socialX + 1.5} y={groundY + 2.4} width={socialWidth - 2} height="0.95" rx="0.2" fill="#8e9499" opacity="0.72" />
        )}

        {facade.style === "rustico_contemporaneo" && (
          <rect x={x} y={groundY + groundH - 5} width={bodyWidth} height="5" fill="url(#stone-pattern)" opacity="0.92" />
        )}
      </g>

      <g opacity={facade.landscaping === "leve" ? 0.58 : facade.landscaping === "intenso" ? 1 : 0.82}>
        <ellipse cx={garageOnRight ? 18 : 103} cy="58.8" rx="8" ry="2.6" fill="#7f9f7b" />
        <ellipse cx={garageOnRight ? 103 : 17} cy="59.2" rx="6.4" ry="2.1" fill="#8ca887" />
        {facade.landscaping === "intenso" && (
          <>
            <circle cx={garageOnRight ? 12 : 109} cy="53.6" r="3.6" fill="#789875" />
            <circle cx={garageOnRight ? 107 : 13} cy="54.5" r="2.8" fill="#87a981" />
          </>
        )}
      </g>

      <path d="M9 61 H111" stroke="#aab3aa" strokeWidth="0.65" />
      <text x="60" y="68" textAnchor="middle" fontSize="2.25" fill="#64748b" fontWeight="700" letterSpacing="0.16">
        FACHADA CONCEITUAL
      </text>
    </svg>
  );
}
