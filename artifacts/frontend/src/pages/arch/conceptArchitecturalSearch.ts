import type { ConceptRoomShape } from "./conceptGeometry";

export type SearchMutationKind = "translate" | "resize" | "zone_shift";

export type SearchCandidate = {
  id: string;
  parentId: string;
  mutation: SearchMutationKind;
  rooms: ConceptRoomShape[];
  description: string;
};

type SearchInput = {
  rooms: ConceptRoomShape[];
  lotWidth: number;
  lotDepth: number;
  maxCandidates?: number;
};

const STEP = 0.5;
const SIZE_STEP = 0.4;
const EPS = 0.05;

function overlaps(a: ConceptRoomShape, b: ConceptRoomShape) {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y);
  return ox > EPS && oy > EPS;
}

function validLayout(rooms: ConceptRoomShape[], lotWidth: number, lotDepth: number) {
  for (const room of rooms) {
    if (room.kind === "piscina") continue;
    if (
      room.x < -EPS ||
      room.y < -EPS ||
      room.x + room.width > lotWidth + EPS ||
      room.y + room.depth > lotDepth + EPS
    ) return false;
  }

  for (let i = 0; i < rooms.length; i += 1) {
    for (let j = i + 1; j < rooms.length; j += 1) {
      const a = rooms[i];
      const b = rooms[j];
      if (a.floor !== b.floor || a.kind === "piscina" || b.kind === "piscina") continue;
      if (overlaps(a, b)) return false;
    }
  }

  return true;
}

function signature(rooms: ConceptRoomShape[]) {
  return rooms
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((room) => [
      room.id,
      room.floor,
      Math.round(room.x * 10),
      Math.round(room.y * 10),
      Math.round(room.width * 10),
      Math.round(room.depth * 10),
    ].join(":"))
    .join("|");
}

function clone(rooms: ConceptRoomShape[]) {
  return rooms.map((room) => ({ ...room }));
}

function translateCandidates(input: SearchInput) {
  const result: SearchCandidate[] = [];
  const deltas = [
    [STEP, 0],
    [-STEP, 0],
    [0, STEP],
    [0, -STEP],
  ] as const;

  for (const room of input.rooms) {
    if (room.locked || room.kind === "piscina") continue;
    for (const [dx, dy] of deltas) {
      const rooms = clone(input.rooms).map((candidate) =>
        candidate.id === room.id
          ? { ...candidate, x: candidate.x + dx, y: candidate.y + dy }
          : candidate
      );
      if (!validLayout(rooms, input.lotWidth, input.lotDepth)) continue;
      result.push({
        id: `search-translate-${room.id}-${dx}-${dy}`,
        parentId: "seed",
        mutation: "translate",
        rooms,
        description: `${room.label} deslocado ${dx || dy} m para explorar nova relação espacial.`,
      });
    }
  }
  return result;
}

function resizeCandidates(input: SearchInput) {
  const result: SearchCandidate[] = [];
  const resizable = new Set(["sala", "cozinha", "gourmet", "suite", "quarto", "outro"]);

  for (const room of input.rooms) {
    if (room.locked || !resizable.has(room.kind)) continue;
    const variants = [
      { width: room.width + SIZE_STEP, depth: Math.max(1.2, room.depth - SIZE_STEP) },
      { width: Math.max(1.2, room.width - SIZE_STEP), depth: room.depth + SIZE_STEP },
    ];

    for (const [index, dims] of variants.entries()) {
      const originalArea = room.width * room.depth;
      const newArea = dims.width * dims.depth;
      if (Math.abs(newArea - originalArea) / Math.max(1, originalArea) > 0.18) continue;

      const rooms = clone(input.rooms).map((candidate) =>
        candidate.id === room.id
          ? { ...candidate, width: dims.width, depth: dims.depth }
          : candidate
      );
      if (!validLayout(rooms, input.lotWidth, input.lotDepth)) continue;
      result.push({
        id: `search-resize-${room.id}-${index}`,
        parentId: "seed",
        mutation: "resize",
        rooms,
        description: `${room.label} teve proporção ajustada preservando aproximadamente sua área.`,
      });
    }
  }
  return result;
}

function zoneShiftCandidates(input: SearchInput) {
  const result: SearchCandidate[] = [];
  const zones: Record<string, number> = {
    social: 0,
    service: 1,
    private: 2,
  };

  const zoneOf = (room: ConceptRoomShape) => {
    if (["sala", "cozinha", "gourmet"].includes(room.kind)) return "social";
    if (["garagem", "lavanderia"].includes(room.kind)) return "service";
    if (["quarto", "suite", "banheiro"].includes(room.kind)) return "private";
    return "other";
  };

  for (const zone of ["social", "service", "private"]) {
    const members = input.rooms.filter((room) => !room.locked && zoneOf(room) === zone);
    if (!members.length) continue;

    const direction = zones[zone] === 0 ? STEP : zones[zone] === 1 ? -STEP : STEP;
    const rooms = clone(input.rooms).map((room) =>
      members.some((member) => member.id === room.id)
        ? { ...room, y: room.y + direction }
        : room
    );
    if (!validLayout(rooms, input.lotWidth, input.lotDepth)) continue;

    result.push({
      id: `search-zone-${zone}`,
      parentId: "seed",
      mutation: "zone_shift",
      rooms,
      description: `Zona ${zone} deslocada de forma coordenada para testar novo zoneamento.`,
    });
  }

  return result;
}

export function generateArchitecturalSearchNeighborhood(input: SearchInput): SearchCandidate[] {
  const maxCandidates = Math.max(4, Math.min(60, input.maxCandidates ?? 24));
  const all = [
    ...translateCandidates(input),
    ...resizeCandidates(input),
    ...zoneShiftCandidates(input),
  ];

  const seen = new Set<string>();
  const unique: SearchCandidate[] = [];
  for (const candidate of all) {
    const key = signature(candidate.rooms);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
    if (unique.length >= maxCandidates) break;
  }

  return unique;
}
