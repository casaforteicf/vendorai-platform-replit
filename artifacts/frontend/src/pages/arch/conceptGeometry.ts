import type { LayoutPreferences } from "./conceptTemplates";

export type ConceptRoomShape = {
  id: string;
  kind: string;
  label: string;
  width: number;
  depth: number;
  floor: number;
  x: number;
  y: number;
  locked?: boolean;
};

export type WallSegment = {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  exterior: boolean;
  roomIds: string[];
};

export type OpeningMarker = {
  id: string;
  type: "door" | "window";
  x: number;
  y: number;
  orientation: "horizontal" | "vertical";
  roomId: string;
  width?: number;
  height?: number;
  sillHeight?: number;
  openingStyle?: "hinged" | "sliding" | "fixed" | "tilt_turn";
  swing?: "left" | "right";
  swingSide?: "inside" | "outside";
  leafCount?: number;
  frameProfile?: string;
  glassType?: string;
  manufacturer?: string;
  catalogProductId?: string;
};

export type ConceptGeometry = {
  walls: WallSegment[];
  openings: OpeningMarker[];
};

const EPS = 0.05;

function nearly(a: number, b: number) {
  return Math.abs(a - b) <= EPS;
}

function overlap(a1: number, a2: number, b1: number, b2: number) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

function keyOf(x1: number, y1: number, x2: number, y2: number) {
  const ax = Math.round(x1 * 100);
  const ay = Math.round(y1 * 100);
  const bx = Math.round(x2 * 100);
  const by = Math.round(y2 * 100);
  return ax < bx || (ax === bx && ay <= by)
    ? `${ax}:${ay}:${bx}:${by}`
    : `${bx}:${by}:${ax}:${ay}`;
}

const PRIVATE_BATH = /(su[ií]te|master)/i;
const MIN_WINDOW_SETBACK = 1.5;

function lower(value: string | undefined) {
  return (value ?? "").toLocaleLowerCase("pt-BR");
}

function isCloset(room: ConceptRoomShape) {
  return /closet/.test(lower(room.label));
}

function isLavabo(room: ConceptRoomShape) {
  return room.kind === "banheiro" && /lavabo/.test(lower(room.label));
}

function isPrivateBath(room: ConceptRoomShape) {
  return room.kind === "banheiro" && PRIVATE_BATH.test(room.label ?? "");
}

function isVeranda(room: ConceptRoomShape) {
  return /varanda|sacada/.test(lower(room.label));
}

function circulationLike(kind: string) {
  return kind === "circulacao" || kind === "escada";
}

const OPEN_PAIRS = new Set([
  "sala|cozinha", "sala|gourmet", "sala|garagem", "sala|quarto", "sala|banheiro",
  "cozinha|lavanderia", "cozinha|gourmet", "cozinha|garagem",
  "lavanderia|garagem", "lavanderia|gourmet", "gourmet|garagem",
]);

function doorAllowed(a: ConceptRoomShape, b: ConceptRoomShape, floorRooms: ConceptRoomShape[]) {
  if (a.kind === "piscina" || b.kind === "piscina") return false;

  if (isCloset(a) || isCloset(b)) {
    const other = isCloset(a) ? b : a;
    return other.kind === "suite";
  }
  if (isPrivateBath(a) || isPrivateBath(b)) {
    const bath = isPrivateBath(a) ? a : b;
    const other = bath === a ? b : a;
    if (other.kind !== "suite") return false;
    const bathLabel = lower(bath.label);
    const owners = floorRooms.filter((room) => room.kind === "suite" && bathLabel.includes(lower(room.label)));
    return owners.length === 0 || owners.some((room) => room.id === other.id);
  }
  if (isLavabo(a) || isLavabo(b)) {
    const other = isLavabo(a) ? b : a;
    return other.kind === "sala" || circulationLike(other.kind);
  }
  if (isVeranda(a) || isVeranda(b)) {
    const other = isVeranda(a) ? b : a;
    return ["sala", "gourmet", "suite", "quarto"].includes(other.kind) || circulationLike(other.kind);
  }
  if (circulationLike(a.kind) || circulationLike(b.kind)) return true;
  if (a.kind === b.kind) return a.kind === "sala" || a.kind === "outro";
  if (a.kind === "outro" || b.kind === "outro") return true;
  const key = [a.kind, b.kind].sort().join("|");
  return OPEN_PAIRS.has(key) || OPEN_PAIRS.has([b.kind, a.kind].join("|")) || OPEN_PAIRS.has([a.kind, b.kind].join("|"));
}

type WindowSpec = { width: number; height: number; sill: number; style: OpeningMarker["openingStyle"] };

function windowSpec(room: ConceptRoomShape): WindowSpec | null {
  if (isCloset(room) || isVeranda(room) || /dep[oó]sito|despensa/.test(lower(room.label))) return null;
  switch (room.kind) {
    case "sala": return { width: 2.4, height: 2.1, sill: 0, style: "sliding" };
    case "gourmet": return { width: 3.0, height: 2.1, sill: 0, style: "sliding" };
    case "suite": return { width: 1.8, height: 1.2, sill: 1.0, style: "sliding" };
    case "quarto": return { width: 1.5, height: 1.2, sill: 1.0, style: "sliding" };
    case "cozinha": return { width: 1.5, height: 1.0, sill: 1.1, style: "sliding" };
    case "banheiro": return { width: 0.8, height: 0.6, sill: 1.5, style: "tilt_turn" };
    case "lavanderia": return { width: 1.0, height: 0.8, sill: 1.3, style: "tilt_turn" };
    case "outro": return { width: 1.2, height: 1.2, sill: 1.0, style: "sliding" };
    default: return null;
  }
}

/** Trechos da parede de um lado do cômodo que não encostam em nenhum outro cômodo. */
function freeIntervals(room: ConceptRoomShape, side: "top" | "bottom" | "left" | "right", floorRooms: ConceptRoomShape[]) {
  const horizontal = side === "top" || side === "bottom";
  const start = horizontal ? room.x : room.y;
  const end = horizontal ? room.x + room.width : room.y + room.depth;
  const covered: Array<[number, number]> = [];
  for (const other of floorRooms) {
    if (other.id === room.id) continue;
    const touches = side === "top" ? nearly(other.y + other.depth, room.y)
      : side === "bottom" ? nearly(other.y, room.y + room.depth)
        : side === "left" ? nearly(other.x + other.width, room.x)
          : nearly(other.x, room.x + room.width);
    if (!touches) continue;
    const a = Math.max(start, horizontal ? other.x : other.y);
    const b = Math.min(end, horizontal ? other.x + other.width : other.y + other.depth);
    if (b - a > EPS) covered.push([a, b]);
  }
  covered.sort((left, right) => left[0] - right[0]);
  const free: Array<[number, number]> = [];
  let cursor = start;
  for (const [a, b] of covered) {
    if (a - cursor > EPS) free.push([cursor, a]);
    cursor = Math.max(cursor, b);
  }
  if (end - cursor > EPS) free.push([cursor, end]);
  return free;
}

export function buildConceptGeometry(
  rooms: ConceptRoomShape[],
  lotWidth: number,
  lotDepth: number,
  floor: number,
  frontSide: "top" | "bottom" | "left" | "right" = "top",
): ConceptGeometry {
  const floorRooms = (Array.isArray(rooms) ? rooms : []).filter((room) => room.floor === floor && room.kind !== "piscina");
  const wallMap = new Map<string, WallSegment>();
  const sharedKeys = new Set<string>();

  for (const room of floorRooms) {
    const edges: Array<[number, number, number, number]> = [
      [room.x, room.y, room.x + room.width, room.y],
      [room.x + room.width, room.y, room.x + room.width, room.y + room.depth],
      [room.x, room.y + room.depth, room.x + room.width, room.y + room.depth],
      [room.x, room.y, room.x, room.y + room.depth],
    ];
    for (const [x1, y1, x2, y2] of edges) {
      const key = keyOf(x1, y1, x2, y2);
      const existing = wallMap.get(key);
      if (existing) {
        sharedKeys.add(key);
        if (!existing.roomIds.includes(room.id)) existing.roomIds.push(room.id);
      } else {
        wallMap.set(key, { id: key, x1, y1, x2, y2, exterior: true, roomIds: [room.id] });
      }
    }
  }

  const walls = [...wallMap.values()].map((wall) => {
    const sourceKey = wall.id;
    const exterior = !sharedKeys.has(sourceKey);
    const vertical = nearly(wall.x1, wall.x2);
    const roomIds = [...wall.roomIds].sort();
    let stableId = `wall-${roomIds.join("-")}-${vertical ? "v" : "h"}`;

    if (roomIds.length === 1) {
      const owner = floorRooms.find((room) => room.id === roomIds[0]);
      if (owner) {
        const side = vertical
          ? nearly(wall.x1, owner.x) ? "left" : "right"
          : nearly(wall.y1, owner.y) ? "top" : "bottom";
        stableId = `wall-${owner.id}-${side}`;
      }
    }

    return {
      ...wall,
      id: stableId,
      exterior,
    };
  });

  const openings: OpeningMarker[] = [];

  // Portas: antes toda dupla de cômodos encostados ganhava porta (garagem→quarto, banheiro→cozinha,
  // banho da suíte→corredor...). Agora só entre ambientes que fazem sentido se ligar. Se algum
  // cômodo ficar sem nenhuma porta por essa regra (plantas livres), volta a regra antiga para ele.
  const candidates: Array<{ a: ConceptRoomShape; b: ConceptRoomShape; marker: OpeningMarker; shared: number }> = [];
  for (let i = 0; i < floorRooms.length; i += 1) {
    const a = floorRooms[i];
    for (let j = i + 1; j < floorRooms.length; j += 1) {
      const b = floorRooms[j];

      if (nearly(a.x + a.width, b.x) || nearly(b.x + b.width, a.x)) {
        const yStart = Math.max(a.y, b.y);
        const yEnd = Math.min(a.y + a.depth, b.y + b.depth);
        const shared = overlap(a.y, a.y + a.depth, b.y, b.y + b.depth);
        if (shared >= 0.8) {
          candidates.push({ a, b, shared, marker: {
            id: `door-v-${a.id}-${b.id}`,
            type: "door",
            x: nearly(a.x + a.width, b.x) ? b.x : a.x,
            y: (yStart + yEnd) / 2,
            orientation: "vertical",
            roomId: a.id,
          } });
        }
      }

      if (nearly(a.y + a.depth, b.y) || nearly(b.y + b.depth, a.y)) {
        const xStart = Math.max(a.x, b.x);
        const xEnd = Math.min(a.x + a.width, b.x + b.width);
        const shared = overlap(a.x, a.x + a.width, b.x, b.x + b.width);
        if (shared >= 0.8) {
          candidates.push({ a, b, shared, marker: {
            id: `door-h-${a.id}-${b.id}`,
            type: "door",
            x: (xStart + xEnd) / 2,
            y: nearly(a.y + a.depth, b.y) ? b.y : a.y,
            orientation: "horizontal",
            roomId: a.id,
          } });
        }
      }
    }
  }

  const connected = new Set<string>();
  for (const candidate of candidates) {
    if (!doorAllowed(candidate.a, candidate.b, floorRooms)) continue;
    openings.push(candidate.marker);
    connected.add(candidate.a.id);
    connected.add(candidate.b.id);
  }
  for (const room of floorRooms) {
    if (connected.has(room.id)) continue;
    const fallback = candidates
      .filter((candidate) => candidate.a.id === room.id || candidate.b.id === room.id)
      .sort((left, right) => right.shared - left.shared)[0];
    if (fallback && !openings.some((opening) => opening.id === fallback.marker.id)) {
      openings.push(fallback.marker);
      connected.add(fallback.a.id);
      connected.add(fallback.b.id);
    }
  }

  // Janelas: só em parede realmente externa (antes podiam cair numa parede interna), com medidas
  // de projeto por ambiente — porta-janela na sala, peitoril de 1,00 m nos quartos, basculante no banho.
  let entrancePlaced = false;
  const entranceRooms = [...floorRooms].sort((left, right) => (left.kind === "sala" ? 0 : 1) - (right.kind === "sala" ? 0 : 1));
  for (const room of entranceRooms) {
    const spec = windowSpec(room);
    if (!spec) continue;

    const sides = (["top", "bottom", "left", "right"] as const).map((side) => {
      const free = freeIntervals(room, side, floorRooms);
      const best = free.sort((left, right) => (right[1] - right[0]) - (left[1] - left[0]))[0];
      const boundary = side === "top" ? room.y
        : side === "left" ? room.x
          : side === "right" ? lotWidth - (room.x + room.width)
            : lotDepth - (room.y + room.depth);
      // Preferência de fachada: primeiro o lado da rua, depois os fundos, por último as laterais.
      const opposite = { top: "bottom", bottom: "top", left: "right", right: "left" }[frontSide];
      const facing = side === frontSide ? 2 : side === opposite ? 1 : 0;
      return { side, best, length: best ? best[1] - best[0] : 0, boundary, facing };
    }).filter((item) => item.length >= 0.8)
      // Código Civil, art. 1.301: janela a menos de 1,5 m da divisa não pode. Entre os lados
      // permitidos, fica o que tem mais espaço livre à frente (normalmente a frente ou os fundos),
      // e não mais o lado mais próximo da divisa — que jogava todas as janelas nas laterais.
      .sort((left, right) => (right.boundary >= MIN_WINDOW_SETBACK - EPS ? 1 : 0) - (left.boundary >= MIN_WINDOW_SETBACK - EPS ? 1 : 0)
        || (right.length >= spec.width + 0.4 ? 1 : 0) - (left.length >= spec.width + 0.4 ? 1 : 0)
        // Antes vencia o lado com mais espaço livre: em lote largo as janelas da frente iam todas
        // para as laterais e a fachada ficava cega.
        || right.facing - left.facing
        || right.boundary - left.boundary
        || right.length - left.length);

    const chosen = sides[0];
    if (!chosen?.best) continue;
    const horizontal = chosen.side === "top" || chosen.side === "bottom";
    let intervalStart = chosen.best[0];
    let intervalLength = chosen.length;

    // Porta de entrada: na sala do térreo (ou no hall social), no mesmo lado da janela principal.
    if (floor === 0 && !entrancePlaced && (room.kind === "sala" || /hall social/.test(lower(room.label)))) {
      const doorWidth = 1.0;
      const doorCenter = intervalStart + 0.3 + doorWidth / 2;
      if (intervalLength >= doorWidth + 0.6) {
        openings.push({
          id: `entrance-${room.id}`,
          type: "door",
          x: horizontal ? doorCenter : chosen.side === "left" ? room.x : room.x + room.width,
          y: horizontal ? (chosen.side === "top" ? room.y : room.y + room.depth) : doorCenter,
          orientation: horizontal ? "horizontal" : "vertical",
          roomId: room.id,
          width: doorWidth,
          height: 2.2,
          sillHeight: 0,
          openingStyle: "hinged",
        });
        entrancePlaced = true;
        intervalStart += doorWidth + 0.6;
        intervalLength -= doorWidth + 0.6;
        if (intervalLength < 0.9) continue;
      }
    }

    const width = Math.max(0.5, Math.min(spec.width, intervalLength - 0.4));
    const center = intervalStart + intervalLength / 2;
    openings.push({
      id: `window-${chosen.side}-${room.id}`,
      type: "window",
      x: horizontal ? center : chosen.side === "left" ? room.x : room.x + room.width,
      y: horizontal ? (chosen.side === "top" ? room.y : room.y + room.depth) : center,
      orientation: horizontal ? "horizontal" : "vertical",
      roomId: room.id,
      width: Math.round(width * 100) / 100,
      height: spec.height,
      sillHeight: spec.sill,
      openingStyle: spec.style,
    });
  }

  return { walls, openings };
}

function sortForVariant<T extends ConceptRoomShape>(rooms: T[], variant: number): T[] {
  const social = new Set(["sala", "cozinha", "gourmet"]);
  const privateKinds = new Set(["suite", "quarto", "banheiro"]);
  const service = new Set(["garagem", "lavanderia"]);
  const circulation = new Set(["circulacao", "escada"]);

  return [...rooms].sort((a, b) => {
    const score = (room: ConceptRoomShape) => {
      if (room.kind === "garagem") return -10;
      if (circulation.has(room.kind)) return -9;
      if (variant === 0) {
        if (service.has(room.kind)) return 0;
        if (social.has(room.kind)) return 1;
        if (privateKinds.has(room.kind)) return 2;
        return 3;
      }
      if (variant === 1) {
        if (privateKinds.has(room.kind)) return 0;
        if (social.has(room.kind)) return 1;
        if (service.has(room.kind)) return 2;
        return 3;
      }
      if (social.has(room.kind)) return 0;
      if (privateKinds.has(room.kind)) return 1;
      if (service.has(room.kind)) return 2;
      return 3;
    };
    return score(a) - score(b);
  });
}

export function generateLayoutVariant<T extends ConceptRoomShape>(
  rooms: T[],
  lotWidth: number,
  lotDepth: number,
  floor: number,
  variant: number,
  preferences?: LayoutPreferences,
): T[] {
  const current = (Array.isArray(rooms) ? rooms : []).filter((room) => room.floor === floor);
  const others = (Array.isArray(rooms) ? rooms : []).filter((room) => room.floor !== floor);
  const fixed = current.filter((room) => room.locked);
  const movable = sortForVariant(current.filter((room) => !room.locked && room.kind !== "piscina"), variant);
  const pools = current.filter((room) => !room.locked && room.kind === "piscina");

  const occupied = fixed.map((room) => ({
    x1: room.x,
    y1: room.y,
    x2: room.x + room.width,
    y2: room.y + room.depth,
  }));

  const placed: T[] = [...fixed];

  const fits = (room: ConceptRoomShape, x: number, y: number) => {
    if (x < 0 || y < 0 || x + room.width > lotWidth || y + room.depth > lotDepth) return false;
    return !occupied.some((box) => !(
      x + room.width <= box.x1 + EPS ||
      x >= box.x2 - EPS ||
      y + room.depth <= box.y1 + EPS ||
      y >= box.y2 - EPS
    ));
  };

  const touchesBuilding = (room: ConceptRoomShape, x: number, y: number) => {
    if (occupied.length === 0) return true;
    return occupied.some((box) => {
      const verticalTouch =
        (nearly(x + room.width, box.x1) || nearly(x, box.x2)) &&
        overlap(y, y + room.depth, box.y1, box.y2) >= 0.8;
      const horizontalTouch =
        (nearly(y + room.depth, box.y1) || nearly(y, box.y2)) &&
        overlap(x, x + room.width, box.x1, box.x2) >= 0.8;
      return verticalTouch || horizontalTouch;
    });
  };

  const targetFor = (room: ConceptRoomShape) => {
    const front = preferences?.garageFront === false ? Math.max(1, lotDepth * 0.18) : 0.6;
    const middle = Math.max(1, lotDepth * 0.34);
    const privateBand = Math.max(1, lotDepth * (preferences?.privateAwaySocial === false ? 0.46 : 0.58));
    const rear = Math.max(1, lotDepth * 0.72);
    const right = Math.max(0, lotWidth - room.width - 0.6);
    const center = Math.max(0, (lotWidth - room.width) / 2);

    if (room.kind === "garagem") return { x: variant === 1 ? right : 0.6, y: front };
    if (room.kind === "escada") {
      const lower = rooms.find((candidate) => candidate.kind === "escada" && candidate.floor === floor - 1);
      return lower ? { x: lower.x, y: lower.y } : { x: center, y: Math.max(front + 4, middle - 2) };
    }
    if (room.kind === "circulacao") return { x: center, y: Math.max(middle, privateBand - 2) };
    if (room.kind === "sala") return { x: variant === 2 ? center : 0.6, y: middle };
    if (room.kind === "cozinha") return {
      x: preferences?.livingIntegratedKitchen === false ? right : Math.max(0.6, lotWidth * 0.48),
      y: preferences?.kitchenNearGourmet === false ? middle : Math.min(rear - room.depth, middle + 2.5),
    };
    if (room.kind === "lavanderia") return { x: right, y: Math.min(rear, middle + 4) };
    if (room.kind === "gourmet") return {
      x: variant === 2 ? center : 0.6,
      y: preferences?.gourmetNearPool === false ? Math.max(middle, rear - 4) : rear,
    };
    if (room.kind === "suite") return {
      x: variant === 1 ? 0.6 : right,
      y: preferences?.masterRear === false ? privateBand : Math.max(privateBand, rear - 2.5),
    };
    if (room.kind === "quarto") return { x: variant === 1 ? right : 0.6, y: privateBand };
    if (room.kind === "banheiro") return { x: center, y: privateBand };
    return { x: center, y: privateBand };
  };

  const candidateStep = 0.5;
  for (const room of movable) {
    const target = targetFor(room);
    const candidates: Array<{ x: number; y: number; distance: number; connected: boolean }> = [];

    // Besides the coarse grid, include exact coordinates derived from already
    // placed room edges. This is critical when room dimensions are not multiples
    // of 0.5 m; otherwise a room can never land exactly adjacent to its neighbor,
    // leaving no valid candidate and falling back to overlapping saved coordinates.
    const xCandidates = new Set<number>([
      0,
      Math.max(0, lotWidth - room.width),
      Math.max(0, Math.min(lotWidth - room.width, target.x)),
    ]);
    const yCandidates = new Set<number>([
      0,
      Math.max(0, lotDepth - room.depth),
      Math.max(0, Math.min(lotDepth - room.depth, target.y)),
    ]);

    for (let x = 0; x <= Math.max(0, lotWidth - room.width) + EPS; x += candidateStep) xCandidates.add(x);
    for (let y = 0; y <= Math.max(0, lotDepth - room.depth) + EPS; y += candidateStep) yCandidates.add(y);

    for (const box of occupied) {
      xCandidates.add(box.x1 - room.width);
      xCandidates.add(box.x2);
      yCandidates.add(box.y1 - room.depth);
      yCandidates.add(box.y2);
    }

    const scoreCandidate = (x: number, y: number) => {
      if (!fits(room, x, y)) return;
      const connected = touchesBuilding(room, x, y);
      const dx = x - target.x;
      const dy = y - target.y;
      let score = dx * dx + dy * dy + (connected ? 0 : 250);

      const touches = placed.filter((neighbor) => {
        const verticalTouch =
          (nearly(x + room.width, neighbor.x) || nearly(x, neighbor.x + neighbor.width)) &&
          overlap(y, y + room.depth, neighbor.y, neighbor.y + neighbor.depth) >= 0.8;
        const horizontalTouch =
          (nearly(y + room.depth, neighbor.y) || nearly(y, neighbor.y + neighbor.depth)) &&
          overlap(x, x + room.width, neighbor.x, neighbor.x + neighbor.width) >= 0.8;
        return verticalTouch || horizontalTouch;
      });

      const adjacentKinds = new Set(touches.map((neighbor) => neighbor.kind));
      const reward = (kind: string, value: number) => {
        if (adjacentKinds.has(kind)) score -= value;
      };
      const penalize = (kind: string, value: number) => {
        if (adjacentKinds.has(kind)) score += value;
      };

      if (room.kind === "cozinha") {
        reward("sala", 18);
        reward("gourmet", 22);
        reward("lavanderia", 10);
      } else if (room.kind === "gourmet") {
        reward("cozinha", 22);
        reward("sala", 8);
      } else if (room.kind === "lavanderia") {
        reward("cozinha", 18);
        penalize("quarto", 8);
        penalize("suite", 8);
      } else if (room.kind === "banheiro") {
        reward("circulacao", 24);
        reward("suite", 10);
        reward("quarto", 8);
        reward("lavanderia", 5);
      } else if (room.kind === "quarto" || room.kind === "suite") {
        reward("circulacao", 28);
        reward("banheiro", 8);
        penalize("garagem", 20);
        penalize("gourmet", 10);
      } else if (room.kind === "circulacao") {
        reward("sala", 12);
        reward("escada", 20);
      } else if (room.kind === "escada") {
        reward("circulacao", 24);
        reward("sala", 10);
      }

      candidates.push({ x, y, distance: score, connected });
    };

    for (const y of yCandidates) {
      if (y < -EPS || y > lotDepth - room.depth + EPS) continue;
      for (const x of xCandidates) {
        if (x < -EPS || x > lotWidth - room.width + EPS) continue;
        scoreCandidate(x, y);
      }
    }

    candidates.sort((a, b) =>
      Number(b.connected) - Number(a.connected) ||
      a.distance - b.distance ||
      a.y - b.y ||
      a.x - b.x
    );

    const found = candidates[0] ?? null;
    const next = {
      ...room,
      x: found?.x ?? Math.max(0, Math.min(room.x, lotWidth - room.width)),
      y: found?.y ?? Math.max(0, Math.min(room.y, lotDepth - room.depth)),
    };
    placed.push(next);
    occupied.push({ x1: next.x, y1: next.y, x2: next.x + next.width, y2: next.y + next.depth });
  }

  for (const pool of pools) {
    const y = Math.max(0, lotDepth - pool.depth - 0.6);
    const x = variant === 1
      ? 0.6
      : Math.max(0.6, Math.min(lotWidth - pool.width - 0.6, (lotWidth - pool.width) / 2));
    placed.push({ ...pool, x, y });
  }

  return [...others, ...placed];
}

export type LayoutIssue = {
  id: string;
  severity: "error" | "warning";
  roomId?: string;
  message: string;
};

export function validateConceptLayout(
  rooms: ConceptRoomShape[],
  lotWidth: number,
  lotDepth: number,
  floor: number,
  site?: { frontSide?: "top" | "bottom" | "left" | "right"; setbackFront?: number },
): LayoutIssue[] {
  const current = (Array.isArray(rooms) ? rooms : []).filter((room) => room.floor === floor);
  const issues: LayoutIssue[] = [];

  for (const room of current) {
    if (room.x < -EPS || room.y < -EPS || room.x + room.width > lotWidth + EPS || room.y + room.depth > lotDepth + EPS) {
      issues.push({
        id: `outside-${room.id}`,
        severity: "error",
        roomId: room.id,
        message: `${room.label} ultrapassa o limite do terreno.`,
      });
    }

    if (room.kind !== "piscina" && (room.width < 1.2 || room.depth < 1.2)) {
      issues.push({
        id: `small-${room.id}`,
        severity: "warning",
        roomId: room.id,
        message: `${room.label} ficou muito estreito para uma distribuição confortável.`,
      });
    }
  }

  for (let i = 0; i < current.length; i += 1) {
    const a = current[i];
    for (let j = i + 1; j < current.length; j += 1) {
      const b = current[j];
      const ox = overlap(a.x, a.x + a.width, b.x, b.x + b.width);
      const oy = overlap(a.y, a.y + a.depth, b.y, b.y + b.depth);
      if (ox > EPS && oy > EPS) {
        issues.push({
          id: `overlap-${a.id}-${b.id}`,
          severity: "error",
          roomId: a.id,
          message: `${a.label} está sobrepondo ${b.label}.`,
        });
      }
    }
  }

  const overlappingRoomIds = new Set(
    issues
      .filter((issue) => issue.id.startsWith("overlap-"))
      .flatMap((issue) => issue.id.replace(/^overlap-/, "").split("-")),
  );

  const indoor = current.filter((room) => room.kind !== "piscina");
  if (indoor.length > 1) {
    const connected = new Set<string>();
    connected.add(indoor[0].id);
    let changed = true;

    while (changed) {
      changed = false;
      for (const a of indoor) {
        if (!connected.has(a.id)) continue;
        for (const b of indoor) {
          if (connected.has(b.id)) continue;
          const verticalTouch =
            (nearly(a.x + a.width, b.x) || nearly(b.x + b.width, a.x)) &&
            overlap(a.y, a.y + a.depth, b.y, b.y + b.depth) >= 0.8;
          const horizontalTouch =
            (nearly(a.y + a.depth, b.y) || nearly(b.y + b.depth, a.y)) &&
            overlap(a.x, a.x + a.width, b.x, b.x + b.width) >= 0.8;
          if (verticalTouch || horizontalTouch) {
            connected.add(b.id);
            changed = true;
          }
        }
      }
    }

    for (const room of indoor) {
      if (!connected.has(room.id) && !overlappingRoomIds.has(room.id)) {
        issues.push({
          id: `isolated-${room.id}`,
          severity: "warning",
          roomId: room.id,
          message: `${room.label} está isolado; aproxime-o de outro ambiente para criar circulação.`,
        });
      }
    }
  }

  const garage = current.find((room) => room.kind === "garagem");
  // Distância até a frente real do lote (lado escolhido na implantação), descontando o recuo
  // frontal obrigatório. Antes media sempre a partir de y = 0 e acusava todo modelo com recuo.
  const garageFrontGap = !garage ? 0
    : site?.frontSide === "bottom" ? lotDepth - (garage.y + garage.depth)
      : site?.frontSide === "left" ? garage.x
        : site?.frontSide === "right" ? lotWidth - (garage.x + garage.width)
          : garage.y;
  if (garage && garageFrontGap > Math.max(0, site?.setbackFront ?? 0) + 3) {
    issues.push({
      id: `garage-access-${garage.id}`,
      severity: "warning",
      roomId: garage.id,
      message: "A garagem está distante da frente do terreno.",
    });
  }

  const stair = current.find((room) => room.kind === "escada");
  const hasOtherFloors = rooms.some((room) => room.floor !== floor);
  if (hasOtherFloors && !stair) {
    issues.push({
      id: `stair-missing-${floor}`,
      severity: "error",
      message: "Este pavimento precisa de uma escada para conectar os níveis.",
    });
  }

  if (stair && floor > 0) {
    const lowerStair = rooms.find((room) => room.kind === "escada" && room.floor === floor - 1);
    if (lowerStair) {
      const ox = overlap(stair.x, stair.x + stair.width, lowerStair.x, lowerStair.x + lowerStair.width);
      const oy = overlap(stair.y, stair.y + stair.depth, lowerStair.y, lowerStair.y + lowerStair.depth);
      if (ox < Math.min(stair.width, lowerStair.width) * 0.7 || oy < Math.min(stair.depth, lowerStair.depth) * 0.7) {
        issues.push({
          id: `stair-align-${stair.id}`,
          severity: "error",
          roomId: stair.id,
          message: "A escada não está alinhada com o pavimento inferior.",
        });
      }
    }
  }

  const circulation = current.find((room) => room.kind === "circulacao");
  const privateRooms = current.filter((room) => room.kind === "quarto" || room.kind === "suite");
  if (privateRooms.length >= 2 && !circulation) {
    issues.push({
      id: `circulation-missing-${floor}`,
      severity: "warning",
      message: "A área íntima precisa de hall/circulação para evitar acesso por dentro de outros quartos.",
    });
  }

  for (const room of privateRooms) {
    const adjacent = current.filter((neighbor) => {
      if (neighbor.id === room.id) return false;
      const verticalTouch =
        (nearly(room.x + room.width, neighbor.x) || nearly(room.x, neighbor.x + neighbor.width)) &&
        overlap(room.y, room.y + room.depth, neighbor.y, neighbor.y + neighbor.depth) >= 0.8;
      const horizontalTouch =
        (nearly(room.y + room.depth, neighbor.y) || nearly(room.y, neighbor.y + neighbor.depth)) &&
        overlap(room.x, room.x + room.width, neighbor.x, neighbor.x + neighbor.width) >= 0.8;
      return verticalTouch || horizontalTouch;
    });
    const hasGoodAccess = adjacent.some((neighbor) => ["circulacao", "sala", "escada"].includes(neighbor.kind));
    if (!hasGoodAccess) {
      issues.push({
        id: `private-access-${room.id}`,
        severity: "warning",
        roomId: room.id,
        message: `${room.label} não tem acesso claro por hall ou circulação.`,
      });
    }
  }


  // Etapa 76 — critérios mínimos de aceite arquitetônico.
  // Estes checks não substituem norma local; eles bloqueiam/avisam sobre incoerências
  // funcionais básicas antes de uma alternativa ser apresentada como proposta principal.
  const sharesEdge = (a: ConceptRoomShape, b: ConceptRoomShape) => {
    const verticalTouch =
      (nearly(a.x + a.width, b.x) || nearly(a.x, b.x + b.width)) &&
      overlap(a.y, a.y + a.depth, b.y, b.y + b.depth) >= 0.8;
    const horizontalTouch =
      (nearly(a.y + a.depth, b.y) || nearly(a.y, b.y + b.depth)) &&
      overlap(a.x, a.x + a.width, b.x, b.x + b.width) >= 0.8;
    return verticalTouch || horizontalTouch;
  };

  const minSideByKind: Partial<Record<string, number>> = {
    quarto: 2.4,
    suite: 2.4,
    cozinha: 1.8,
    banheiro: 1.2,
    lavanderia: 1.5,
    garagem: 2.5,
  };

  for (const room of current) {
    const minSide = minSideByKind[room.kind];
    if (minSide && Math.min(room.width, room.depth) + EPS < minSide) {
      issues.push({
        id: `functional-width-${room.id}`,
        severity: "warning",
        roomId: room.id,
        message: `${room.label} possui lado útil abaixo do mínimo funcional configurado (${minSide.toFixed(1)} m).`,
      });
    }
  }

  const suites = current.filter((room) => room.kind === "suite");
  const privateBaths = current.filter((room) => isPrivateBath(room));
  for (const bath of privateBaths) {
    const matchingSuite = suites.find((suite) => {
      const suiteLabel = lower(suite.label).replace(/su[ií]te|master|casal/g, "").trim();
      const bathLabel = lower(bath.label);
      return suiteLabel && bathLabel.includes(suiteLabel);
    });
    const owner = matchingSuite ?? (suites.length === 1 ? suites[0] : undefined);
    if (owner && !sharesEdge(owner, bath)) {
      issues.push({
        id: `suite-bath-adjacency-${owner.id}-${bath.id}`,
        severity: "error",
        roomId: bath.id,
        message: `${bath.label} precisa estar conectado diretamente à ${owner.label}; banheiro de suíte não pode ficar separado do dormitório.`,
      });
    }
  }

  for (const serviceRoom of current.filter((room) => room.kind === "lavanderia")) {
    for (const privateRoom of privateRooms) {
      if (sharesEdge(serviceRoom, privateRoom)) {
        issues.push({
          id: `service-private-adjacency-${serviceRoom.id}-${privateRoom.id}`,
          severity: "warning",
          roomId: serviceRoom.id,
          message: `${serviceRoom.label} está diretamente encostada em ${privateRoom.label}; prefira separar serviço e área íntima quando houver alternativa.`,
        });
      }
    }
  }

  const geometry = buildConceptGeometry(rooms, lotWidth, lotDepth, floor, site?.frontSide ?? "top");
  const roomsThatNeedNaturalOpening = current.filter((room) =>
    ["sala", "quarto", "suite", "cozinha"].includes(room.kind),
  );
  for (const room of roomsThatNeedNaturalOpening) {
    const hasWindow = geometry.openings.some((opening) => opening.type === "window" && opening.roomId === room.id);
    if (!hasWindow) {
      issues.push({
        id: `natural-opening-${room.id}`,
        severity: "warning",
        roomId: room.id,
        message: `${room.label} não possui abertura externa válida no modelo; revise iluminação e ventilação natural.`,
      });
    }
  }

  const gourmet = current.find((room) => room.kind === "gourmet");
  const pool = current.find((room) => room.kind === "piscina");
  if (gourmet && pool) {
    const dx = Math.max(0, Math.max(gourmet.x, pool.x) - Math.min(gourmet.x + gourmet.width, pool.x + pool.width));
    const dy = Math.max(0, Math.max(gourmet.y, pool.y) - Math.min(gourmet.y + gourmet.depth, pool.y + pool.depth));
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance > 5) {
      issues.push({
        id: `gourmet-pool-distance`,
        severity: "warning",
        roomId: gourmet.id,
        message: "Gourmet e piscina ficaram muito afastados.",
      });
    }
  }

  return issues;
}

export function nudgeOpening(
  opening: OpeningMarker,
  amount: number,
  lotWidth: number,
  lotDepth: number,
): OpeningMarker {
  if (opening.orientation === "horizontal") {
    return {
      ...opening,
      x: Math.max(0, Math.min(lotWidth, opening.x + amount)),
    };
  }
  return {
    ...opening,
    y: Math.max(0, Math.min(lotDepth, opening.y + amount)),
  };
}