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
    const candidates: Array<{ x: number; y: number; distance: number }> = [];

    for (let y = 0; y <= Math.max(0, lotDepth - room.depth) + EPS; y += candidateStep) {
      for (let x = 0; x <= Math.max(0, lotWidth - room.width) + EPS; x += candidateStep) {
        if (!fits(room, x, y) || !touchesBuilding(room, x, y)) continue;
        const dx = x - target.x;
        const dy = y - target.y;
        let score = dx * dx + dy * dy;

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

        candidates.push({ x, y, distance: score });
      }
    }

    candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
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
      if (!connected.has(room.id)) {
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
  if (garage && garage.y > 3) {
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
