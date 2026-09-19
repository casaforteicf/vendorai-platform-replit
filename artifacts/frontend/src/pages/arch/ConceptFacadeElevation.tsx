import type { ConceptFacadePreferences } from "./ConceptVolumetry";
import type { ConceptRoomShape } from "./conceptGeometry";

type Props = {
  rooms: ConceptRoomShape[];
  floors: number;
  facade: ConceptFacadePreferences;
};

function materialColors(facade: ConceptFacadePreferences) {
  const base =
    facade.primaryMaterial === "madeira" ? "#b8875f" :
    facade.primaryMaterial === "pedra" ? "#b8b2a9" :
    facade.primaryMaterial === "concreto" ? "#aeb7c2" :
    facade.facadeTone === "escuro" ? "#5d6470" :
    facade.facadeTone === "medio" ? "#d3d6da" : "#f2f1ee";

  const accent =
    facade.accentMaterial === "madeira" ? "#8f603f" :
    facade.accentMaterial === "pedra" ? "#8b8479" :
    facade.accentMaterial === "concreto" ? "#7f8791" :
    "#dedede";

  const frame =
    facade.frameTone === "branco" ? "#f8fafc" :
    facade.frameTone === "bronze" ? "#6f5139" : "#171717";

  return { base, accent, frame };
}

export default function ConceptFacadeElevation({ rooms, floors, facade }: Props) {
  const colors = materialColors(facade);
  const garage = rooms.find((room) => room.kind === "garagem");
  const social = rooms.find((room) => room.kind === "sala");
  const upperRooms = rooms.filter((room) => room.floor > 0);
  const hasUpper = floors > 1 && upperRooms.length > 0;

  const garageWidth = garage ? Math.min(39, Math.max(28, garage.width * 5.6)) : 30;
  const socialWidth = social ? Math.min(46, Math.max(34, social.width * 5.4)) : 40;
  const bodyWidth = Math.min(92, garageWidth + socialWidth + 10);
  const bodyX = (100 - bodyWidth) / 2;
  const garageX = bodyX;
  const socialX = bodyX + garageWidth;
  const groundY = 61;
  const groundH = 24;
  const upperY = 37;
  const upperH = 24;

  const roofY = hasUpper ? upperY - 3 : groundY - 3;
  const styleShift =
    facade.style === "minimalista" ? 0 :
    facade.style === "industrial" ? 4 :
    facade.style === "tropical" ? -2 :
    facade.style === "rustico_contemporaneo" ? 3 : 1;

  return (
    <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label="Elevação frontal conceitual">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#eef4f8" />
          <stop offset="100%" stopColor="#ffffff" />
        </linearGradient>
        <filter id="soft-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" floodOpacity="0.16" />
        </filter>
      </defs>

      <rect width="100" height="100" fill="url(#sky)" />
      <rect x="0" y="85" width="100" height="15" fill="#eef1ec" />
      <line x1="0" y1="85" x2="100" y2="85" stroke="#cfd6d0" strokeWidth="0.5" />

      <g filter="url(#soft-shadow)">
        <rect x={bodyX} y={groundY} width={bodyWidth} height={groundH} rx="0.5" fill={colors.base} />
        <rect x={garageX} y={groundY + 3} width={garageWidth} height={groundH - 3} fill={colors.accent} opacity="0.9" />

        {hasUpper && (
          <rect
            x={bodyX + 13 + styleShift}
            y={upperY}
            width={Math.min(bodyWidth - 18, 58)}
            height={upperH}
            rx="0.5"
            fill={colors.base}
          />
        )}

        {facade.roof === "platibanda" && (
          <>
            <rect x={bodyX - 1} y={roofY} width={bodyWidth + 2} height="3.6" fill={colors.accent} />
            {hasUpper && <rect x={bodyX + 11 + styleShift} y={upperY - 3} width={Math.min(bodyWidth - 14, 62)} height="3.6" fill={colors.accent} />}
          </>
        )}

        {facade.roof === "aparente" && (
          <path
            d={hasUpper
              ? `M ${bodyX + 8} ${upperY} L 50 ${upperY - 11} L ${bodyX + bodyWidth - 8} ${upperY} Z`
              : `M ${bodyX} ${groundY} L 50 ${groundY - 12} L ${bodyX + bodyWidth} ${groundY} Z`}
            fill="#6d4c3d"
          />
        )}

        {facade.roof === "misto" && (
          <>
            <rect x={bodyX - 1} y={roofY} width={bodyWidth * 0.56} height="3.4" fill={colors.accent} />
            <path
              d={`M ${bodyX + bodyWidth * 0.48} ${roofY + 3} L ${bodyX + bodyWidth * 0.75} ${roofY - 7} L ${bodyX + bodyWidth} ${roofY + 3} Z`}
              fill="#6d4c3d"
            />
          </>
        )}

        <rect x={garageX + 3} y={groundY + 8} width={garageWidth - 6} height={groundH - 8} rx="0.7" fill={colors.frame} opacity="0.9" />
        <g stroke="#dbe3ea" strokeWidth="0.45" opacity="0.75">
          <line x1={garageX + 3} y1={groundY + 13} x2={garageX + garageWidth - 3} y2={groundY + 13} />
          <line x1={garageX + 3} y1={groundY + 18} x2={garageX + garageWidth - 3} y2={groundY + 18} />
          <line x1={garageX + garageWidth / 2} y1={groundY + 8} x2={garageX + garageWidth / 2} y2={groundY + groundH} />
        </g>

        <rect x={socialX + 6} y={groundY + 7} width={Math.max(12, socialWidth - 13)} height="9.5" rx="0.5" fill={colors.frame} />
        <rect x={socialX + socialWidth - 5} y={groundY + 8} width="3" height="14" rx="0.3" fill={colors.accent} />

        {hasUpper && (
          <>
            <rect x={bodyX + 21 + styleShift} y={upperY + 8} width="12" height="8" rx="0.4" fill={colors.frame} />
            <rect x={bodyX + 40 + styleShift} y={upperY + 8} width="13" height="8" rx="0.4" fill={colors.frame} />
          </>
        )}

        <rect x={socialX + 1} y={groundY + 5} width="3.6" height="17" rx="0.25" fill={colors.accent} />

        {facade.style === "tropical" && (
          <rect x={socialX + 4} y={groundY + 3} width={socialWidth - 4} height="2.2" fill="#7c9a72" opacity="0.8" />
        )}

        {facade.style === "industrial" && (
          <rect x={bodyX + bodyWidth - 7} y={groundY - 7} width="4.5" height="31" fill="#3f454d" />
        )}
      </g>

      <g opacity={facade.landscaping === "leve" ? 0.6 : facade.landscaping === "intenso" ? 1 : 0.82}>
        <ellipse cx={bodyX + 6} cy="86" rx="6" ry="2.2" fill="#7aa87a" />
        <ellipse cx={bodyX + bodyWidth - 5} cy="86" rx="7" ry="2.4" fill="#6b9b70" />
        {facade.landscaping === "intenso" && (
          <>
            <circle cx={bodyX + 3} cy="80" r="3.6" fill="#739c6f" />
            <circle cx={bodyX + bodyWidth - 2} cy="79" r="4" fill="#739c6f" />
          </>
        )}
      </g>

      <line x1={bodyX - 3} y1="88.5" x2={bodyX + bodyWidth + 3} y2="88.5" stroke="#aeb6ad" strokeWidth="0.45" />
      <text x="50" y="96" textAnchor="middle" fontSize="2.6" fill="#64748b" fontWeight="700">
        ELEVAÇÃO FRONTAL CONCEITUAL
      </text>
      <text x="50" y="99" textAnchor="middle" fontSize="1.8" fill="#94a3b8">
        composição baseada na tipologia, pavimentos e preferências
      </text>
    </svg>
  );
}
