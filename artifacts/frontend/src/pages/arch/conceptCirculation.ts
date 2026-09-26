import { buildConceptGeometry, type ConceptRoomShape, type OpeningMarker } from "./conceptGeometry";
import type { FurnitureItem } from "./conceptFurniturePlacement";

export type CirculationIssue = {
  id: string;
  severity: "warning" | "error";
  roomId?: string;
  message: string;
};

export type CirculationResult = {
  score: number;
  issues: CirculationIssue[];
  reachableRoomIds: string[];
  unreachableRoomIds: string[];
};

type Box = { x: number; y: number; width: number; depth: number };

const DEFAULT_DOOR_WIDTH = 0.90;
const MIN_CLEAR_PATH = 0.80;

function intersects(a: Box, b: Box) {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.depth <= b.y ||
    b.y + b.depth <= a.y
  );
}

function roomIdsFromDoor(opening: OpeningMarker, rooms: ConceptRoomShape[]) {
  if (opening.type !== "door") return [] as string[];

  const encoded = opening.id.match(/^door-[vh]-(.+)-(.+)$/);
  if (encoded) {
    const exactA = rooms.find((room) => room.id === encoded[1]);
    const exactB = rooms.find((room) => room.id === encoded[2]);
    if (exactA && exactB) return [exactA.id, exactB.id];
  }

  const candidates = rooms.filter((room) => {
    const eps = 0.08;
    if (opening.orientation === "vertical") {
      const onLeft = Math.abs(opening.x - room.x) <= eps;
      const onRight = Math.abs(opening.x - (room.x + room.width)) <= eps;
      const withinY = opening.y >= room.y - eps && opening.y <= room.y + room.depth + eps;
      return (onLeft || onRight) && withinY;
    }
    const onTop = Math.abs(opening.y - room.y) <= eps;
    const onBottom = Math.abs(opening.y - (room.y + room.depth)) <= eps;
    const withinX = opening.x >= room.x - eps && opening.x <= room.x + room.width + eps;
    return (onTop || onBottom) && withinX;
  });

  return candidates.slice(0, 2).map((room) => room.id);
}

function doorSwingBoxes(opening: OpeningMarker, rooms: ConceptRoomShape[]): Array<{ roomId: string; box: Box }> {
  if (opening.type !== "door") return [];
  const width = opening.width ?? DEFAULT_DOOR_WIDTH;
  const roomIds = roomIdsFromDoor(opening, rooms);
  const result: Array<{ roomId: string; box: Box }> = [];

  for (const roomId of roomIds) {
    const room = rooms.find((candidate) => candidate.id === roomId);
    if (!room) continue;

    if (opening.orientation === "vertical") {
      const onLeft = Math.abs(opening.x - room.x) <= 0.08;
      result.push({
        roomId,
        box: {
          x: onLeft ? room.x : room.x + room.width - width,
          y: Math.max(room.y, Math.min(opening.y - width / 2, room.y + room.depth - width)),
          width,
          depth: width,
        },
      });
    } else {
      const onTop = Math.abs(opening.y - room.y) <= 0.08;
      result.push({
        roomId,
        box: {
          x: Math.max(room.x, Math.min(opening.x - width / 2, room.x + room.width - width)),
          y: onTop ? room.y : room.y + room.depth - width,
          width,
          depth: width,
        },
      });
    }
  }

  return result;
}

function doorwayClearanceBox(opening: OpeningMarker) {
  const width = opening.width ?? DEFAULT_DOOR_WIDTH;
  if (opening.orientation === "vertical") {
    return {
      x: opening.x - MIN_CLEAR_PATH / 2,
      y: opening.y - width / 2,
      width: MIN_CLEAR_PATH,
      depth: width,
    };
  }
  return {
    x: opening.x - width / 2,
    y: opening.y - MIN_CLEAR_PATH / 2,
    width,
    depth: MIN_CLEAR_PATH,
  };
}

function buildAdjacency(rooms: ConceptRoomShape[], doors: OpeningMarker[]) {
  const graph = new Map<string, Set<string>>();
  for (const room of rooms) graph.set(room.id, new Set());

  for (const door of doors) {
    const ids = roomIdsFromDoor(door, rooms);
    if (ids.length !== 2) continue;
    graph.get(ids[0])?.add(ids[1]);
    graph.get(ids[1])?.add(ids[0]);
  }

  return graph;
}

function preferredRoot(rooms: ConceptRoomShape[], doors: OpeningMarker[]) {
  const entrance = doors.find((door) => door.id.startsWith("entrance-"));
  if (entrance) return entrance.roomId;
  return rooms.find((room) => room.kind === "sala")?.id
    ?? rooms.find((room) => room.kind === "circulacao")?.id
    ?? rooms[0]?.id;
}

export function evaluateCirculationAndDoorSwing(
  rooms: ConceptRoomShape[],
  lotWidth: number,
  lotDepth: number,
  furniture: FurnitureItem[] = [],
): CirculationResult {
  const issues: CirculationIssue[] = [];
  const reachable = new Set<string>();

  const floors = [...new Set(rooms.map((room) => room.floor))];
  for (const floor of floors) {
    const floorRooms = rooms.filter((room) => room.floor === floor && room.kind !== "piscina");
    const geometry = buildConceptGeometry(rooms, lotWidth, lotDepth, floor);
    const doors = geometry.openings.filter((opening) => opening.type === "door");

    const graph = buildAdjacency(floorRooms, doors);
    const root = preferredRoot(floorRooms, doors);
    if (root) {
      const queue = [root];
      reachable.add(root);
      while (queue.length) {
        const current = queue.shift()!;
        for (const next of graph.get(current) ?? []) {
          if (reachable.has(next)) continue;
          reachable.add(next);
          queue.push(next);
        }
      }
    }

    for (const room of floorRooms) {
      if (!reachable.has(room.id)) {
        issues.push({
          id: `circulation-unreachable-${room.id}`,
          severity: ["quarto", "suite", "banheiro", "cozinha", "sala"].includes(room.kind) ? "error" : "warning",
          roomId: room.id,
          message: `${room.label} não possui caminho interno contínuo até a circulação principal.`,
        });
      }
    }

    for (const door of doors) {
      const clearance = doorwayClearanceBox(door);
      const relatedIds = roomIdsFromDoor(door, floorRooms);
      const nearbyFurniture = furniture.filter((item) => relatedIds.includes(item.roomId));

      if (nearbyFurniture.some((item) => intersects(clearance, item))) {
        issues.push({
          id: `door-clearance-${door.id}`,
          severity: "error",
          roomId: relatedIds[0],
          message: "Há mobiliário bloqueando a faixa livre necessária para passagem pela porta.",
        });
      }

      for (const swing of doorSwingBoxes(door, floorRooms)) {
        const furnitureConflict = furniture
          .filter((item) => item.roomId === swing.roomId)
          .some((item) => intersects(swing.box, item));
        if (furnitureConflict) {
          issues.push({
            id: `door-swing-furniture-${door.id}-${swing.roomId}`,
            severity: "error",
            roomId: swing.roomId,
            message: "O giro da porta conflita com mobiliário essencial do ambiente.",
          });
        }

        const otherDoors = doors.filter((other) => other.id !== door.id);
        const doorConflict = otherDoors.some((other) =>
          doorSwingBoxes(other, floorRooms).some((otherSwing) =>
            otherSwing.roomId === swing.roomId && intersects(swing.box, otherSwing.box)
          )
        );
        if (doorConflict) {
          issues.push({
            id: `door-swing-door-${door.id}-${swing.roomId}`,
            severity: "warning",
            roomId: swing.roomId,
            message: "Há sobreposição potencial entre áreas de giro de portas neste ambiente.",
          });
        }
      }
    }
  }

  const relevantRooms = rooms.filter((room) => room.kind !== "piscina");
  const unreachable = relevantRooms.filter((room) => !reachable.has(room.id)).map((room) => room.id);
  const uniqueIssues = [...new Map(issues.map((issue) => [issue.id, issue])).values()];
  const errors = uniqueIssues.filter((issue) => issue.severity === "error").length;
  const warnings = uniqueIssues.filter((issue) => issue.severity === "warning").length;
  const score = Math.max(0, Math.min(100, 100 - errors * 25 - warnings * 8));

  return {
    score,
    issues: uniqueIssues,
    reachableRoomIds: [...reachable],
    unreachableRoomIds: unreachable,
  };
}
