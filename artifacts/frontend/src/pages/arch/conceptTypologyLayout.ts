import type { ConceptRoomShape } from "./conceptGeometry";
import type { ConceptTypology, LayoutPreferences } from "./conceptTemplates";

const EPS = 0.05;

type Anchor = { x: number; y: number };

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function overlaps(
  room: ConceptRoomShape,
  x: number,
  y: number,
  placed: ConceptRoomShape[],
) {
  return placed.some((other) => {
    const separated =
      x + room.width <= other.x + EPS ||
      x >= other.x + other.width - EPS ||
      y + room.depth <= other.y + EPS ||
      y >= other.y + other.depth - EPS;
    return !separated;
  });
}

function nearestFit<T extends ConceptRoomShape>(
  room: T,
  anchor: Anchor,
  placed: T[],
  lotWidth: number,
  lotDepth: number,
): T {
  const maxX = Math.max(0, lotWidth - room.width);
  const maxY = Math.max(0, lotDepth - room.depth);
  const targetX = clamp(anchor.x, 0, maxX);
  const targetY = clamp(anchor.y, 0, maxY);

  const candidates: Array<{ x: number; y: number; d: number }> = [];
  const step = 0.25;
  for (let y = 0; y <= maxY + EPS; y += step) {
    for (let x = 0; x <= maxX + EPS; x += step) {
      if (overlaps(room, x, y, placed)) continue;
      const dx = x - targetX;
      const dy = y - targetY;
      candidates.push({ x, y, d: dx * dx + dy * dy });
    }
  }
  candidates.sort((a, b) => a.d - b.d || a.y - b.y || a.x - b.x);
  const best = candidates[0];
  return { ...room, x: best?.x ?? targetX, y: best?.y ?? targetY };
}

function roomMatches(room: ConceptRoomShape, kind: string, labelIncludes?: string) {
  return room.kind === kind && (!labelIncludes || room.label.toLowerCase().includes(labelIncludes.toLowerCase()));
}

function getAnchor(
  room: ConceptRoomShape,
  floor: number,
  lotWidth: number,
  lotDepth: number,
  variant: number,
  preferences?: LayoutPreferences,
): Anchor {
  const pad = 0.6;
  const left = pad;
  const right = Math.max(pad, lotWidth - room.width - pad);
  const center = Math.max(pad, (lotWidth - room.width) / 2);
  const mirror = variant === 1;

  if (floor === 0) {
    if (room.kind === "garagem") return { x: mirror ? right : left, y: pad };
    if (room.kind === "sala") return { x: mirror ? left : right, y: pad };
    if (room.kind === "cozinha") {
      const socialSide = mirror ? left : right;
      return {
        x: preferences?.livingIntegratedKitchen === false ? center : socialSide,
        y: Math.max(5.2, room.depth + 2.2),
      };
    }
    if (room.kind === "escada") return { x: center, y: 5.7 };
    if (room.kind === "circulacao") return { x: center, y: 8.6 };
    if (room.kind === "lavanderia") return { x: mirror ? right : left, y: 7.2 };
    if (room.kind === "banheiro") return { x: center, y: 10.8 };
    if (room.kind === "suite") {
      return {
        x: preferences?.masterRear === false ? (mirror ? right : left) : right,
        y: preferences?.masterRear === false ? 11.6 : 15.6,
      };
    }
    if (room.kind === "quarto") {
      const isSecond = room.label.toLowerCase().includes("2");
      const x = isSecond ? right : left;
      return { x: mirror ? lotWidth - room.width - x : x, y: isSecond ? 14.4 : 11.2 };
    }
    if (room.kind === "gourmet") {
      return {
        x: variant === 2 ? center : (mirror ? right : left),
        y: Math.max(16, lotDepth - room.depth - 5.2),
      };
    }
    if (room.kind === "piscina") {
      return {
        x: variant === 1 ? left : center,
        y: Math.max(0, lotDepth - room.depth - pad),
      };
    }
  } else {
    if (room.kind === "escada") return { x: center, y: 5.7 };
    if (room.kind === "circulacao") return { x: center, y: 8.6 };
    if (room.kind === "suite") return { x: mirror ? left : right, y: 12.2 };
    if (room.kind === "quarto") {
      const isSecond = room.label.toLowerCase().includes("2");
      return { x: isSecond ? right : left, y: isSecond ? 9.6 : 6.2 };
    }
    if (room.kind === "banheiro") return { x: center, y: 10.2 };
  }

  return { x: center, y: Math.max(pad, lotDepth * 0.45) };
}

function sortRooms<T extends ConceptRoomShape>(rooms: T[]) {
  const priority = (room: ConceptRoomShape) => {
    if (room.kind === "garagem") return 0;
    if (room.kind === "sala") return 1;
    if (room.kind === "escada") return 2;
    if (room.kind === "circulacao") return 3;
    if (room.kind === "cozinha") return 4;
    if (room.kind === "lavanderia") return 5;
    if (room.kind === "banheiro") return 6;
    if (room.kind === "suite") return 7;
    if (room.kind === "quarto") return 8;
    if (room.kind === "gourmet") return 9;
    if (room.kind === "piscina") return 10;
    return 11;
  };
  return [...rooms].sort((a, b) => priority(a) - priority(b));
}

export function generateTypologyLayout<T extends ConceptRoomShape>(
  rooms: T[],
  lotWidth: number,
  lotDepth: number,
  floor: number,
  typology: ConceptTypology,
  variant: number,
  preferences?: LayoutPreferences,
): T[] {
  const others = rooms.filter((room) => room.floor !== floor);
  const current = sortRooms(rooms.filter((room) => room.floor === floor));
  const locked = current.filter((room) => room.locked);
  const movable = current.filter((room) => !room.locked);

  const placed: T[] = [...locked];

  for (const room of movable) {
    let anchor = getAnchor(room, floor, lotWidth, lotDepth, variant, preferences);

    if (typology === "terrea_2q" && room.kind === "gourmet") {
      anchor = { x: lotWidth - room.width - 0.6, y: 15 };
    }
    if (typology === "terrea_lazer" && room.kind === "gourmet") {
      anchor = {
        x: variant === 2 ? Math.max(0.6, (lotWidth - room.width) / 2) : 0.6,
        y: Math.max(15.2, lotDepth - room.depth - 5.5),
      };
    }
    if ((typology === "sobrado_3q" || typology === "sobrado_master") && floor === 1 && room.kind === "escada") {
      const lower = rooms.find((candidate) => candidate.kind === "escada" && candidate.floor === 0);
      if (lower) anchor = { x: lower.x, y: lower.y };
    }

    placed.push(nearestFit(room, anchor, placed, lotWidth, lotDepth));
  }

  return [...others, ...placed];
}
