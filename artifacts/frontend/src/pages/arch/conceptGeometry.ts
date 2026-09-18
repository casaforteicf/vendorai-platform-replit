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
};

export type OpeningMarker = {
  id: string;
  type: "door" | "window";
  x: number;
  y: number;
  orientation: "horizontal" | "vertical";
  roomId: string;
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

export function buildConceptGeometry(
  rooms: ConceptRoomShape[],
  lotWidth: number,
  lotDepth: number,
  floor: number,
): ConceptGeometry {
  const floorRooms = rooms.filter((room) => room.floor === floor && room.kind !== "piscina");
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
      if (wallMap.has(key)) sharedKeys.add(key);
      else wallMap.set(key, { id: key, x1, y1, x2, y2, exterior: true });
    }
  }

  const walls = [...wallMap.values()].map((wall) => ({
    ...wall,
    exterior: !sharedKeys.has(wall.id),
  }));

  const openings: OpeningMarker[] = [];

  for (let i = 0; i < floorRooms.length; i += 1) {
    const a = floorRooms[i];
    for (let j = i + 1; j < floorRooms.length; j += 1) {
      const b = floorRooms[j];

      if (nearly(a.x + a.width, b.x) || nearly(b.x + b.width, a.x)) {
        const yStart = Math.max(a.y, b.y);
        const yEnd = Math.min(a.y + a.depth, b.y + b.depth);
        if (overlap(a.y, a.y + a.depth, b.y, b.y + b.depth) >= 0.8) {
          openings.push({
            id: `door-v-${a.id}-${b.id}`,
            type: "door",
            x: nearly(a.x + a.width, b.x) ? b.x : a.x,
            y: (yStart + yEnd) / 2,
            orientation: "vertical",
            roomId: a.id,
          });
        }
      }

      if (nearly(a.y + a.depth, b.y) || nearly(b.y + b.depth, a.y)) {
        const xStart = Math.max(a.x, b.x);
        const xEnd = Math.min(a.x + a.width, b.x + b.width);
        if (overlap(a.x, a.x + a.width, b.x, b.x + b.width) >= 0.8) {
          openings.push({
            id: `door-h-${a.id}-${b.id}`,
            type: "door",
            x: (xStart + xEnd) / 2,
            y: nearly(a.y + a.depth, b.y) ? b.y : a.y,
            orientation: "horizontal",
            roomId: a.id,
          });
        }
      }
    }
  }

  const windowKinds = new Set(["sala", "cozinha", "suite", "quarto", "gourmet", "outro"]);
  for (const room of floorRooms) {
    if (!windowKinds.has(room.kind)) continue;

    const distances = [
      { side: "top" as const, value: room.y },
      { side: "left" as const, value: room.x },
      { side: "right" as const, value: lotWidth - (room.x + room.width) },
      { side: "bottom" as const, value: lotDepth - (room.y + room.depth) },
    ].sort((a, b) => a.value - b.value);

    const side = distances[0]?.side;
    if (side === "top") {
      openings.push({
        id: `window-top-${room.id}`,
        type: "window",
        x: room.x + room.width / 2,
        y: room.y,
        orientation: "horizontal",
        roomId: room.id,
      });
    } else if (side === "bottom") {
      openings.push({
        id: `window-bottom-${room.id}`,
        type: "window",
        x: room.x + room.width / 2,
        y: room.y + room.depth,
        orientation: "horizontal",
        roomId: room.id,
      });
    } else if (side === "left") {
      openings.push({
        id: `window-left-${room.id}`,
        type: "window",
        x: room.x,
        y: room.y + room.depth / 2,
        orientation: "vertical",
        roomId: room.id,
      });
    } else if (side === "right") {
      openings.push({
        id: `window-right-${room.id}`,
        type: "window",
        x: room.x + room.width,
        y: room.y + room.depth / 2,
        orientation: "vertical",
        roomId: room.id,
      });
    }
  }

  return { walls, openings };
}

function sortForVariant<T extends ConceptRoomShape>(rooms: T[], variant: number): T[] {
  const social = new Set(["sala", "cozinha", "gourmet"]);
  const privateKinds = new Set(["suite", "quarto", "banheiro"]);
  const service = new Set(["garagem", "lavanderia"]);

  return [...rooms].sort((a, b) => {
    const score = (room: ConceptRoomShape) => {
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

export function generateLayoutVariant(
  rooms: ConceptRoomShape[],
  lotWidth: number,
  lotDepth: number,
  floor: number,
  variant: number,
) {
  const current = rooms.filter((room) => room.floor === floor);
  const others = rooms.filter((room) => room.floor !== floor);
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

  const candidateStep = 0.5;
  for (const room of movable) {
    let found: { x: number; y: number } | null = null;

    const preferBack = variant === 1 && ["suite", "quarto"].includes(room.kind);
    const yValues: number[] = [];
    for (let y = 0; y <= Math.max(0, lotDepth - room.depth) + EPS; y += candidateStep) yValues.push(y);
    if (preferBack) yValues.reverse();

    for (const y of yValues) {
      for (let x = 0; x <= Math.max(0, lotWidth - room.width) + EPS; x += candidateStep) {
        if (fits(room, x, y)) {
          found = { x, y };
          break;
        }
      }
      if (found) break;
    }

    const next = {
      ...room,
      x: found?.x ?? Math.max(0, Math.min(room.x, lotWidth - room.width)),
      y: found?.y ?? Math.max(0, Math.min(room.y, lotDepth - room.depth)),
    };
    placed.push(next);
    occupied.push({ x1: next.x, y1: next.y, x2: next.x + next.width, y2: next.y + next.depth });
  }

  for (const pool of pools) {
    const y = Math.max(0, lotDepth - pool.depth);
    const x = variant === 2
      ? Math.max(0, (lotWidth - pool.width) / 2)
      : Math.max(0, lotWidth - pool.width);
    placed.push({ ...pool, x, y });
  }

  return [...others, ...placed];
}
