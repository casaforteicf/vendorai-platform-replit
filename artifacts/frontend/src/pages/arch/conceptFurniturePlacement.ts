import { buildConceptGeometry, type ConceptRoomShape, type OpeningMarker } from "./conceptGeometry";

export type FurnitureKind =
  | "bed_double"
  | "bed_single"
  | "wardrobe"
  | "sofa"
  | "tv"
  | "dining_table"
  | "kitchen_counter"
  | "fridge"
  | "stove"
  | "sink"
  | "toilet"
  | "shower"
  | "laundry_machine"
  | "laundry_sink"
  | "car"
  | "desk";

export type FurnitureItem = {
  id: string;
  roomId: string;
  kind: FurnitureKind;
  label: string;
  width: number;
  depth: number;
  x: number;
  y: number;
  rotation: 0 | 90;
};

export type FurniturePlacementIssue = {
  id: string;
  severity: "warning" | "error";
  roomId: string;
  message: string;
};

export type FurniturePlacementResult = {
  score: number;
  items: FurnitureItem[];
  issues: FurniturePlacementIssue[];
};

type ItemSpec = Omit<FurnitureItem, "id" | "roomId" | "x" | "y" | "rotation">;

const CLEARANCE = 0.70;
const DOOR_CLEARANCE = 0.85;
const WINDOW_CLEARANCE = 0.35;

function specsFor(room: ConceptRoomShape): ItemSpec[] {
  switch (room.kind) {
    case "suite":
      return [
        { kind: "bed_double", label: "Cama casal", width: 1.58, depth: 1.98 },
        { kind: "wardrobe", label: "Roupeiro", width: 2.00, depth: 0.60 },
      ];
    case "quarto":
      return [
        { kind: "bed_single", label: "Cama", width: 0.98, depth: 1.98 },
        { kind: "wardrobe", label: "Roupeiro", width: 1.60, depth: 0.60 },
      ];
    case "sala":
      return [
        { kind: "sofa", label: "Sofá", width: 2.20, depth: 0.90 },
        { kind: "tv", label: "TV", width: 1.60, depth: 0.25 },
        { kind: "dining_table", label: "Mesa", width: 1.60, depth: 0.90 },
      ];
    case "cozinha":
      return [
        { kind: "kitchen_counter", label: "Bancada", width: 2.40, depth: 0.60 },
        { kind: "fridge", label: "Geladeira", width: 0.75, depth: 0.75 },
        { kind: "stove", label: "Fogão/cooktop", width: 0.60, depth: 0.60 },
      ];
    case "banheiro":
      return [
        { kind: "sink", label: "Lavatório", width: 0.60, depth: 0.50 },
        { kind: "toilet", label: "Vaso", width: 0.70, depth: 0.75 },
        { kind: "shower", label: "Box", width: 0.90, depth: 0.90 },
      ];
    case "lavanderia":
      return [
        { kind: "laundry_machine", label: "Máquina", width: 0.70, depth: 0.70 },
        { kind: "laundry_sink", label: "Tanque", width: 0.60, depth: 0.60 },
      ];
    case "garagem":
      return [
        { kind: "car", label: "Veículo", width: Math.min(2.10, Math.max(1.80, room.width - 0.60)), depth: 4.50 },
      ];
    case "outro":
      return /escrit/i.test(room.label)
        ? [{ kind: "desk", label: "Mesa de trabalho", width: 1.40, depth: 0.70 }]
        : [];
    default:
      return [];
  }
}

function intersects(a: {x:number;y:number;width:number;depth:number}, b: {x:number;y:number;width:number;depth:number}, clearance = 0) {
  return !(
    a.x + a.width + clearance <= b.x ||
    b.x + b.width + clearance <= a.x ||
    a.y + a.depth + clearance <= b.y ||
    b.y + b.depth + clearance <= a.y
  );
}

function openingBlock(opening: OpeningMarker, room: ConceptRoomShape) {
  const width = opening.width ?? (opening.type === "door" ? 0.9 : 1.2);
  if (opening.orientation === "horizontal") {
    return {
      x: opening.x - width / 2 - (opening.type === "door" ? DOOR_CLEARANCE / 2 : WINDOW_CLEARANCE / 2),
      y: opening.y <= room.y + 0.08 ? room.y : room.y + room.depth - (opening.type === "door" ? DOOR_CLEARANCE : WINDOW_CLEARANCE),
      width: width + (opening.type === "door" ? DOOR_CLEARANCE : WINDOW_CLEARANCE),
      depth: opening.type === "door" ? DOOR_CLEARANCE : WINDOW_CLEARANCE,
    };
  }
  return {
    x: opening.x <= room.x + 0.08 ? room.x : room.x + room.width - (opening.type === "door" ? DOOR_CLEARANCE : WINDOW_CLEARANCE),
    y: opening.y - width / 2 - (opening.type === "door" ? DOOR_CLEARANCE / 2 : WINDOW_CLEARANCE / 2),
    width: opening.type === "door" ? DOOR_CLEARANCE : WINDOW_CLEARANCE,
    depth: width + (opening.type === "door" ? DOOR_CLEARANCE : WINDOW_CLEARANCE),
  };
}

function candidatePositions(room: ConceptRoomShape, width: number, depth: number) {
  const inset = 0.08;
  const positions = [
    { x: room.x + inset, y: room.y + inset },
    { x: room.x + room.width - width - inset, y: room.y + inset },
    { x: room.x + inset, y: room.y + room.depth - depth - inset },
    { x: room.x + room.width - width - inset, y: room.y + room.depth - depth - inset },
    { x: room.x + (room.width - width) / 2, y: room.y + inset },
    { x: room.x + (room.width - width) / 2, y: room.y + room.depth - depth - inset },
  ];
  return positions.filter((p) =>
    p.x >= room.x - 0.01 &&
    p.y >= room.y - 0.01 &&
    p.x + width <= room.x + room.width + 0.01 &&
    p.y + depth <= room.y + room.depth + 0.01
  );
}

export function placeFurnitureInRoom(
  room: ConceptRoomShape,
  openings: OpeningMarker[],
): { items: FurnitureItem[]; issues: FurniturePlacementIssue[] } {
  const specs = specsFor(room);
  if (!specs.length) return { items: [], issues: [] };

  const roomOpenings = openings.filter((opening) => opening.roomId === room.id);
  const blockedByOpenings = roomOpenings.map((opening) => openingBlock(opening, room));
  const placed: FurnitureItem[] = [];
  const issues: FurniturePlacementIssue[] = [];

  for (const [index, spec] of specs.entries()) {
    const variants = [
      { width: spec.width, depth: spec.depth, rotation: 0 as const },
      { width: spec.depth, depth: spec.width, rotation: 90 as const },
    ];

    let chosen: FurnitureItem | null = null;
    for (const variant of variants) {
      for (const pos of candidatePositions(room, variant.width, variant.depth)) {
        const box = { x: pos.x, y: pos.y, width: variant.width, depth: variant.depth };
        const openingConflict = blockedByOpenings.some((blocked) => intersects(box, blocked));
        const furnitureConflict = placed.some((item) => intersects(box, item, 0.08));
        if (openingConflict || furnitureConflict) continue;

        chosen = {
          id: `furniture-${room.id}-${spec.kind}-${index}`,
          roomId: room.id,
          kind: spec.kind,
          label: spec.label,
          width: variant.width,
          depth: variant.depth,
          x: pos.x,
          y: pos.y,
          rotation: variant.rotation,
        };
        break;
      }
      if (chosen) break;
    }

    if (chosen) {
      placed.push(chosen);
    } else {
      issues.push({
        id: `furniture-placement-${room.id}-${spec.kind}`,
        severity: ["bed_double", "bed_single", "toilet", "shower", "car"].includes(spec.kind) ? "error" : "warning",
        roomId: room.id,
        message: `${room.label}: não foi possível posicionar ${spec.label} sem conflito com portas, janelas ou outro mobiliário.`,
      });
    }
  }

  // Verificação simples de faixa de circulação: se o mobiliário consumir praticamente todo
  // o menor eixo do ambiente, a solução continua tecnicamente desenhável, mas não é funcional.
  const occupiedArea = placed.reduce((sum, item) => sum + item.width * item.depth, 0);
  const roomArea = room.width * room.depth;
  if (roomArea > 0 && occupiedArea / roomArea > 0.62) {
    issues.push({
      id: `furniture-circulation-${room.id}`,
      severity: "warning",
      roomId: room.id,
      message: `${room.label}: o mobiliário ocupa grande parte do ambiente; revise a circulação livre mínima de aproximadamente ${CLEARANCE.toFixed(2)} m.`,
    });
  }

  return { items: placed, issues };
}

export function evaluateFurniturePlacement(
  rooms: ConceptRoomShape[],
  lotWidth: number,
  lotDepth: number,
): FurniturePlacementResult {
  const items: FurnitureItem[] = [];
  const issues: FurniturePlacementIssue[] = [];

  const floors = [...new Set(rooms.map((room) => room.floor))];
  for (const floor of floors) {
    const geometry = buildConceptGeometry(rooms, lotWidth, lotDepth, floor);
    for (const room of rooms.filter((candidate) => candidate.floor === floor)) {
      const placed = placeFurnitureInRoom(room, geometry.openings);
      items.push(...placed.items);
      issues.push(...placed.issues);
    }
  }

  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const score = Math.max(0, Math.min(100, 100 - errors * 25 - warnings * 8));

  return { score, items, issues };
}
