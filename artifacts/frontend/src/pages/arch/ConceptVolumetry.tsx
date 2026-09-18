import { useMemo } from "react";

export type VolumetryRoom = {
  id: string;
  kind: string;
  label: string;
  width: number;
  depth: number;
  floor: number;
  x: number;
  y: number;
};

type Point = { x: number; y: number };

type Props = {
  rooms: VolumetryRoom[];
  lotWidth: number;
  lotDepth: number;
  floors: number;
  rotation: number;
  exploded?: boolean;
  showLabels?: boolean;
};

const FLOOR_HEIGHT = 2.8;
const SLAB_THICKNESS = 0.18;

function polygon(points: Point[]) {
  return points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}

function rotatePoint(x: number, y: number, cx: number, cy: number, angleDeg: number) {
  const angle = (angleDeg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  return {
    x: cx + dx * Math.cos(angle) - dy * Math.sin(angle),
    y: cy + dx * Math.sin(angle) + dy * Math.cos(angle),
  };
}

function IsoScene({
  rooms,
  lotWidth,
  lotDepth,
  floors,
  rotation,
  exploded = false,
  showLabels = true,
}: Props) {
  const scene = useMemo(() => {
    const width = 900;
    const height = 650;
    const cx = lotWidth / 2;
    const cy = lotDepth / 2;
    const horizontalScale = Math.min(24, 560 / Math.max(1, lotWidth + lotDepth));
    const zScale = horizontalScale * 1.1;
    const centerX = width / 2;
    const centerY = 420;

    const project = (x: number, y: number, z: number): Point => {
      const rotated = rotatePoint(x, y, cx, cy, rotation);
      const isoX = (rotated.x - rotated.y) * horizontalScale;
      const isoY = (rotated.x + rotated.y) * horizontalScale * 0.48 - z * zScale;
      return { x: centerX + isoX, y: centerY + isoY };
    };

    const terrain = [
      project(0, 0, 0),
      project(lotWidth, 0, 0),
      project(lotWidth, lotDepth, 0),
      project(0, lotDepth, 0),
    ];

    const roomShapes = rooms
      .filter((room) => room.kind !== "piscina")
      .map((room) => {
        const extra = exploded ? room.floor * 0.65 : 0;
        const z0 = room.floor * FLOOR_HEIGHT + extra;
        const z1 = z0 + FLOOR_HEIGHT - SLAB_THICKNESS;
        const a0 = project(room.x, room.y, z0);
        const b0 = project(room.x + room.width, room.y, z0);
        const c0 = project(room.x + room.width, room.y + room.depth, z0);
        const d0 = project(room.x, room.y + room.depth, z0);
        const a1 = project(room.x, room.y, z1);
        const b1 = project(room.x + room.width, room.y, z1);
        const c1 = project(room.x + room.width, room.y + room.depth, z1);
        const d1 = project(room.x, room.y + room.depth, z1);
        const label = project(room.x + room.width / 2, room.y + room.depth / 2, z1 + 0.12);

        return {
          room,
          z0,
          top: [a1, b1, c1, d1],
          sideA: [a0, b0, b1, a1],
          sideB: [b0, c0, c1, b1],
          sideC: [c0, d0, d1, c1],
          sideD: [d0, a0, a1, d1],
          label,
        };
      })
      .sort((a, b) => a.z0 - b.z0 || a.room.y - b.room.y || a.room.x - b.room.x);

    const poolShapes = rooms
      .filter((room) => room.kind === "piscina")
      .map((room) => ({
        room,
        points: [
          project(room.x, room.y, 0.03),
          project(room.x + room.width, room.y, 0.03),
          project(room.x + room.width, room.y + room.depth, 0.03),
          project(room.x, room.y + room.depth, 0.03),
        ],
      }));

    const levelGuides = Array.from({ length: floors }).map((_, floor) => {
      const extra = exploded ? floor * 0.65 : 0;
      const z = floor * FLOOR_HEIGHT + extra;
      const anchor = project(0, lotDepth, z);
      return { floor, anchor };
    });

    return { width, height, terrain, roomShapes, poolShapes, levelGuides };
  }, [rooms, lotWidth, lotDepth, floors, rotation, exploded]);

  return (
    <svg
      className="h-full w-full"
      viewBox={`0 0 ${scene.width} ${scene.height}`}
      role="img"
      aria-label="Volumetria 3D conceitual da casa"
    >
      <defs>
        <filter id="concept-shadow" x="-20%" y="-20%" width="140%" height="160%">
          <feDropShadow dx="0" dy="10" stdDeviation="10" floodOpacity="0.14" />
        </filter>
      </defs>

      <polygon points={polygon(scene.terrain)} fill="#f1f5f9" stroke="#94a3b8" strokeWidth="2" />
      <polyline
        points={polygon([...scene.terrain, scene.terrain[0]])}
        fill="none"
        stroke="#64748b"
        strokeDasharray="6 6"
        strokeWidth="1.5"
      />

      {scene.poolShapes.map(({ room, points }) => (
        <polygon
          key={room.id}
          points={polygon(points)}
          fill="#bae6fd"
          stroke="#0284c7"
          strokeWidth="2"
          opacity="0.9"
        />
      ))}

      <g filter="url(#concept-shadow)">
        {scene.roomShapes.map(({ room, top, sideA, sideB, sideC, sideD, label }) => (
          <g key={room.id}>
            <polygon points={polygon(sideD)} fill="#cbd5e1" stroke="#64748b" strokeWidth="1.25" />
            <polygon points={polygon(sideC)} fill="#dbe3ec" stroke="#64748b" strokeWidth="1.25" />
            <polygon points={polygon(sideA)} fill="#b8c4d1" stroke="#64748b" strokeWidth="1.25" />
            <polygon points={polygon(sideB)} fill="#c7d2df" stroke="#64748b" strokeWidth="1.25" />
            <polygon points={polygon(top)} fill="#f8fafc" stroke="#475569" strokeWidth="1.35" />
            {showLabels && (
              <g>
                <rect
                  x={label.x - 38}
                  y={label.y - 10}
                  width="76"
                  height="20"
                  rx="10"
                  fill="white"
                  opacity="0.9"
                />
                <text
                  x={label.x}
                  y={label.y + 4}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="700"
                  fill="#334155"
                >
                  {room.label.length > 13 ? `${room.label.slice(0, 12)}…` : room.label}
                </text>
              </g>
            )}
          </g>
        ))}
      </g>

      {scene.levelGuides.map(({ floor, anchor }) => (
        <g key={floor}>
          <circle cx={anchor.x - 18} cy={anchor.y} r="10" fill="#0f172a" />
          <text
            x={anchor.x - 18}
            y={anchor.y + 3.5}
            textAnchor="middle"
            fontSize="9"
            fontWeight="800"
            fill="white"
          >
            {floor + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default IsoScene;
