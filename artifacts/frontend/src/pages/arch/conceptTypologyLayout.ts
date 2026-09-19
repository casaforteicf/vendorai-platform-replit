import type { ConceptRoomShape } from "./conceptGeometry";
import type { ConceptTypology, LayoutPreferences } from "./conceptTemplates";

const EPS = 0.05;
const GRID = 0.25;
const PAD = 0.6;

type Anchor = { x: number; y: number };
type Candidate = { x: number; y: number; score: number };

const WET_KINDS = new Set(["cozinha", "banheiro", "lavanderia"]);
const PRIVATE_KINDS = new Set(["suite", "quarto"]);
const SOCIAL_KINDS = new Set(["sala", "cozinha", "gourmet"]);

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function rectGap(
  a: Pick<ConceptRoomShape, "x" | "y" | "width" | "depth">,
  b: Pick<ConceptRoomShape, "x" | "y" | "width" | "depth">,
) {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.depth), b.y - (a.y + a.depth)));
  return Math.hypot(dx, dy);
}

function sharedEdge(
  room: ConceptRoomShape,
  x: number,
  y: number,
  other: ConceptRoomShape,
) {
  const verticalTouch =
    (Math.abs(x + room.width - other.x) < 0.08 || Math.abs(x - (other.x + other.width)) < 0.08) &&
    Math.max(0, Math.min(y + room.depth, other.y + other.depth) - Math.max(y, other.y));

  const horizontalTouch =
    (Math.abs(y + room.depth - other.y) < 0.08 || Math.abs(y - (other.y + other.depth)) < 0.08) &&
    Math.max(0, Math.min(x + room.width, other.x + other.width) - Math.max(x, other.x));

  return Math.max(verticalTouch || 0, horizontalTouch || 0);
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

function relationWeight(a: string, b: string, preferences?: LayoutPreferences) {
  const pair = new Set([a, b]);

  if (pair.has("sala") && pair.has("cozinha")) return preferences?.livingIntegratedKitchen === false ? 2 : 12;
  if (pair.has("cozinha") && pair.has("gourmet")) return preferences?.kitchenNearGourmet === false ? 3 : 11;
  if (pair.has("gourmet") && pair.has("piscina")) return preferences?.gourmetNearPool === false ? 3 : 10;
  if (pair.has("cozinha") && pair.has("lavanderia")) return 9;
  if ((a === "quarto" || a === "suite") && b === "circulacao") return 12;
  if ((b === "quarto" || b === "suite") && a === "circulacao") return 12;
  if (pair.has("banheiro") && pair.has("circulacao")) return 9;
  if (pair.has("escada") && pair.has("circulacao")) return 11;
  if (pair.has("escada") && pair.has("sala")) return 6;
  if (pair.has("garagem") && (pair.has("sala") || pair.has("circulacao"))) return 5;
  if (WET_KINDS.has(a) && WET_KINDS.has(b)) return 6;
  return 0;
}

function zoneTarget(
  room: ConceptRoomShape,
  lotWidth: number,
  lotDepth: number,
  variant: number,
  preferences?: LayoutPreferences,
): Anchor {
  const mirror = variant === 1;
  const left = PAD;
  const right = Math.max(PAD, lotWidth - room.width - PAD);
  const center = Math.max(PAD, (lotWidth - room.width) / 2);

  const front = PAD;
  const socialBand = Math.min(Math.max(4.8, lotDepth * 0.18), Math.max(PAD, lotDepth - room.depth - PAD));
  const serviceBand = Math.min(Math.max(7.2, lotDepth * 0.28), Math.max(PAD, lotDepth - room.depth - PAD));
  const circulationBand = Math.min(Math.max(9.0, lotDepth * 0.36), Math.max(PAD, lotDepth - room.depth - PAD));
  const privateBand = Math.min(Math.max(11.0, lotDepth * 0.48), Math.max(PAD, lotDepth - room.depth - PAD));
  const rear = Math.max(PAD, lotDepth - room.depth - PAD);
  const leisureBand = Math.max(PAD, Math.min(rear, lotDepth - room.depth - 4.6));

  if (room.floor > 0) {
    if (room.kind === "escada") return { x: center, y: socialBand };
    if (room.kind === "circulacao") return { x: center, y: circulationBand };
    if (room.kind === "suite") return { x: mirror ? left : right, y: privateBand };
    if (room.kind === "quarto") {
      const second = room.label.toLowerCase().includes("2");
      return { x: mirror ? (second ? left : right) : (second ? right : left), y: privateBand - (second ? 0 : 2.8) };
    }
    if (room.kind === "banheiro") return { x: center, y: privateBand };
    return { x: center, y: socialBand };
  }

  if (room.kind === "garagem") {
    const x = preferences?.garageFront === false ? center : mirror ? right : left;
    return { x, y: front };
  }

  if (room.kind === "sala") return { x: mirror ? left : right, y: front };
  if (room.kind === "cozinha") return { x: mirror ? left : right, y: socialBand };
  if (room.kind === "lavanderia") return { x: mirror ? right : left, y: serviceBand };
  if (room.kind === "escada") return { x: center, y: socialBand };
  if (room.kind === "circulacao") return { x: center, y: circulationBand };
  if (room.kind === "banheiro") return { x: center, y: privateBand - 1.6 };

  if (room.kind === "suite") {
    return {
      x: mirror ? left : right,
      y: preferences?.masterRear === false ? privateBand - 2.5 : privateBand + 1.2,
    };
  }

  if (room.kind === "quarto") {
    const second = room.label.toLowerCase().includes("2");
    return {
      x: mirror ? (second ? left : right) : (second ? right : left),
      y: privateBand - (second ? 0 : 2.8),
    };
  }

  if (room.kind === "gourmet") {
    return {
      x: variant === 2 ? center : mirror ? right : left,
      y: leisureBand,
    };
  }

  if (room.kind === "piscina") {
    return {
      x: variant === 1 ? left : center,
      y: rear,
    };
  }

  return { x: center, y: Math.max(PAD, lotDepth * 0.45) };
}

function candidatePositions<T extends ConceptRoomShape>(
  room: T,
  placed: T[],
  lotWidth: number,
  lotDepth: number,
  anchor: Anchor,
) {
  const minX = room.kind === "piscina" ? PAD : PAD;
  const minY = PAD;
  const maxX = Math.max(minX, lotWidth - room.width - PAD);
  const maxY = Math.max(minY, lotDepth - room.depth - PAD);

  const values = new Map<string, { x: number; y: number }>();
  const add = (x: number, y: number) => {
    const sx = Math.round(clamp(x, minX, maxX) / GRID) * GRID;
    const sy = Math.round(clamp(y, minY, maxY) / GRID) * GRID;
    values.set(`${sx.toFixed(2)}:${sy.toFixed(2)}`, { x: sx, y: sy });
  };

  add(anchor.x, anchor.y);

  for (let y = minY; y <= maxY + EPS; y += GRID) {
    for (let x = minX; x <= maxX + EPS; x += GRID) add(x, y);
  }

  for (const other of placed) {
    const xs = [
      other.x,
      other.x + other.width,
      other.x - room.width,
      other.x + other.width - room.width,
      other.x + other.width / 2 - room.width / 2,
    ];
    const ys = [
      other.y,
      other.y + other.depth,
      other.y - room.depth,
      other.y + other.depth - room.depth,
      other.y + other.depth / 2 - room.depth / 2,
    ];
    for (const x of xs) {
      add(x, anchor.y);
      for (const y of ys) add(x, y);
    }
    for (const y of ys) add(anchor.x, y);
  }

  return [...values.values()];
}

function buildingBounds(rooms: ConceptRoomShape[]) {
  if (!rooms.length) return null;
  const minX = Math.min(...rooms.map((room) => room.x));
  const minY = Math.min(...rooms.map((room) => room.y));
  const maxX = Math.max(...rooms.map((room) => room.x + room.width));
  const maxY = Math.max(...rooms.map((room) => room.y + room.depth));
  return { minX, minY, maxX, maxY, area: (maxX - minX) * (maxY - minY) };
}

function candidateScore<T extends ConceptRoomShape>(
  room: T,
  x: number,
  y: number,
  anchor: Anchor,
  placed: T[],
  preferences?: LayoutPreferences,
) {
  const candidate = { ...room, x, y };
  const dx = x - anchor.x;
  const dy = y - anchor.y;
  let score = dx * dx * 0.9 + dy * dy * 0.75;

  if (!placed.length) return score;

  const touching = placed
    .map((other) => ({ other, shared: sharedEdge(room, x, y, other) }))
    .filter((entry) => entry.shared >= 0.65);

  if (room.kind !== "piscina") {
    if (!touching.length) score += 90;
    else score -= Math.min(28, touching.reduce((sum, entry) => sum + entry.shared * 4.5, 0));
  }

  for (const other of placed) {
    const gap = rectGap(candidate, other);
    const relation = relationWeight(room.kind, other.kind, preferences);

    if (relation > 0) {
      score += gap * relation * 2.2;
      const shared = sharedEdge(room, x, y, other);
      if (shared >= 0.8) score -= relation * 3.2;
    }

    if (PRIVATE_KINDS.has(room.kind) && SOCIAL_KINDS.has(other.kind)) {
      const privatePreference = preferences?.privateAwaySocial !== false;
      if (privatePreference && gap < 1.0) score += (1.0 - gap) * 18;
    }

    if (WET_KINDS.has(room.kind) && WET_KINDS.has(other.kind)) {
      score += gap * 5.5;
      if (sharedEdge(room, x, y, other) >= 0.8) score -= 14;
    }
  }

  const before = buildingBounds(placed.filter((item) => item.kind !== "piscina"));
  const after = buildingBounds([...placed.filter((item) => item.kind !== "piscina"), candidate]);
  if (before && after && room.kind !== "piscina") {
    score += Math.max(0, after.area - before.area - room.width * room.depth) * 0.8;
  }

  if (room.kind === "circulacao") {
    const privateRooms = placed.filter((other) => PRIVATE_KINDS.has(other.kind));
    const socialRooms = placed.filter((other) => other.kind === "sala" || other.kind === "cozinha");
    if (privateRooms.length && socialRooms.length) {
      const privateDistance = Math.min(...privateRooms.map((other) => rectGap(candidate, other)));
      const socialDistance = Math.min(...socialRooms.map((other) => rectGap(candidate, other)));
      score += (privateDistance + socialDistance) * 8;
    }
  }

  if (room.kind === "piscina") {
    const gourmet = placed.find((other) => other.kind === "gourmet");
    if (gourmet) {
      const gap = rectGap(candidate, gourmet);
      score += Math.abs(gap - 1.2) * 8;
    }
  }

  return score;
}

function placeRoom<T extends ConceptRoomShape>(
  room: T,
  anchor: Anchor,
  placed: T[],
  lotWidth: number,
  lotDepth: number,
  preferences?: LayoutPreferences,
): T {
  const candidates: Candidate[] = [];

  for (const position of candidatePositions(room, placed, lotWidth, lotDepth, anchor)) {
    if (overlaps(room, position.x, position.y, placed)) continue;
    candidates.push({
      ...position,
      score: candidateScore(room, position.x, position.y, anchor, placed, preferences),
    });
  }

  candidates.sort((a, b) => a.score - b.score || a.y - b.y || a.x - b.x);
  const best = candidates[0];

  return {
    ...room,
    x: best?.x ?? clamp(anchor.x, PAD, Math.max(PAD, lotWidth - room.width - PAD)),
    y: best?.y ?? clamp(anchor.y, PAD, Math.max(PAD, lotDepth - room.depth - PAD)),
  };
}

function sortRooms<T extends ConceptRoomShape>(rooms: T[]) {
  const priority = (room: ConceptRoomShape) => {
    if (room.kind === "garagem") return 0;
    if (room.kind === "sala") return 1;
    if (room.kind === "cozinha") return 2;
    if (room.kind === "lavanderia") return 3;
    if (room.kind === "escada") return 4;
    if (room.kind === "circulacao") return 5;
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
    let anchor = zoneTarget(room, lotWidth, lotDepth, variant, preferences);

    if ((typology === "sobrado_3q" || typology === "sobrado_master") && floor === 1 && room.kind === "escada") {
      const lower = rooms.find((candidate) => candidate.kind === "escada" && candidate.floor === 0);
      if (lower) anchor = { x: lower.x, y: lower.y };
    }

    placed.push(placeRoom(room, anchor, placed, lotWidth, lotDepth, preferences));
  }

  return [...others, ...placed];
}
