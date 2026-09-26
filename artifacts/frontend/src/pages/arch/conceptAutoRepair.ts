import { evaluateConceptAcceptance, type ConceptAcceptanceResult } from "./conceptAcceptance";
import { generateLayoutVariant, type ConceptRoomShape } from "./conceptGeometry";

export type ConceptRepairAction = {
  type: "clamp" | "resize" | "suite_bath" | "relayout";
  roomIds: string[];
  description: string;
};

export type ConceptAutoRepairResult = {
  rooms: ConceptRoomShape[];
  before: ConceptAcceptanceResult;
  after: ConceptAcceptanceResult;
  improved: boolean;
  actions: ConceptRepairAction[];
  attempts: number;
};

type RepairInput = {
  rooms: ConceptRoomShape[];
  lotWidth: number;
  lotDepth: number;
  floors: number;
  site?: { frontSide?: "top" | "bottom" | "left" | "right"; setbackFront?: number };
  maxPasses?: number;
};

const EPS = 0.05;

const MIN_SIDE: Partial<Record<string, number>> = {
  quarto: 2.4,
  suite: 2.4,
  cozinha: 1.8,
  banheiro: 1.2,
  lavanderia: 1.5,
  garagem: 2.5,
};

function score(result: ConceptAcceptanceResult) {
  const statusWeight = result.status === "approved" ? 200 : result.status === "review" ? 100 : 0;
  return statusWeight + result.score - result.errors.length * 100 - result.majorWarnings.length * 10;
}

function overlaps(a: ConceptRoomShape, b: ConceptRoomShape) {
  const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.depth, b.y + b.depth) - Math.max(a.y, b.y);
  return ox > EPS && oy > EPS;
}

function fits(
  candidate: ConceptRoomShape,
  rooms: ConceptRoomShape[],
  lotWidth: number,
  lotDepth: number,
) {
  if (
    candidate.x < -EPS ||
    candidate.y < -EPS ||
    candidate.x + candidate.width > lotWidth + EPS ||
    candidate.y + candidate.depth > lotDepth + EPS
  ) return false;

  return rooms
    .filter((room) => room.id !== candidate.id && room.floor === candidate.floor && room.kind !== "piscina")
    .every((room) => !overlaps(candidate, room));
}

function normalizeLabel(value: string) {
  return value.toLocaleLowerCase("pt-BR").replace(/[^a-z0-9à-ú]+/g, " ").trim();
}

function findSuiteOwner(bath: ConceptRoomShape, rooms: ConceptRoomShape[]) {
  const suites = rooms.filter((room) => room.floor === bath.floor && room.kind === "suite");
  if (suites.length === 1) return suites[0];
  const bathLabel = normalizeLabel(bath.label);
  return suites.find((suite) => {
    const key = normalizeLabel(suite.label).replace(/su[ií]te|master|casal/g, "").trim();
    return key && bathLabel.includes(key);
  });
}

function clampAndResize(
  rooms: ConceptRoomShape[],
  lotWidth: number,
  lotDepth: number,
): { rooms: ConceptRoomShape[]; actions: ConceptRepairAction[] } {
  const actions: ConceptRepairAction[] = [];
  const next = rooms.map((room) => {
    if (room.kind === "piscina") {
      const x = Math.max(0, Math.min(room.x, Math.max(0, lotWidth - room.width)));
      const y = Math.max(0, Math.min(room.y, Math.max(0, lotDepth - room.depth)));
      if (Math.abs(x - room.x) > EPS || Math.abs(y - room.y) > EPS) {
        actions.push({ type: "clamp", roomIds: [room.id], description: `${room.label} reposicionada para dentro do terreno.` });
      }
      return { ...room, x, y };
    }

    const min = MIN_SIDE[room.kind];
    let width = room.width;
    let depth = room.depth;

    if (min && Math.min(width, depth) < min) {
      if (width <= depth) width = Math.min(lotWidth, Math.max(width, min));
      else depth = Math.min(lotDepth, Math.max(depth, min));
      actions.push({
        type: "resize",
        roomIds: [room.id],
        description: `${room.label} ajustado para largura funcional mínima.`,
      });
    }

    const x = Math.max(0, Math.min(room.x, Math.max(0, lotWidth - width)));
    const y = Math.max(0, Math.min(room.y, Math.max(0, lotDepth - depth)));
    if (Math.abs(x - room.x) > EPS || Math.abs(y - room.y) > EPS) {
      actions.push({ type: "clamp", roomIds: [room.id], description: `${room.label} reposicionado para dentro do terreno.` });
    }

    return { ...room, width, depth, x, y };
  });

  return { rooms: next, actions };
}

function snapSuiteBaths(
  rooms: ConceptRoomShape[],
  lotWidth: number,
  lotDepth: number,
): { rooms: ConceptRoomShape[]; actions: ConceptRepairAction[] } {
  let next = rooms.map((room) => ({ ...room }));
  const actions: ConceptRepairAction[] = [];
  const baths = next.filter(
    (room) => room.kind === "banheiro" && /su[ií]te|master/i.test(room.label),
  );

  for (const bath of baths) {
    const suite = findSuiteOwner(bath, next);
    if (!suite) continue;

    const candidates: ConceptRoomShape[] = [
      { ...bath, x: suite.x + suite.width, y: suite.y },
      { ...bath, x: suite.x - bath.width, y: suite.y },
      { ...bath, x: suite.x, y: suite.y + suite.depth },
      { ...bath, x: suite.x, y: suite.y - bath.depth },
    ];

    const valid = candidates
      .filter((candidate) => fits(candidate, next, lotWidth, lotDepth))
      .sort((a, b) => {
        const da = Math.hypot(a.x - bath.x, a.y - bath.y);
        const db = Math.hypot(b.x - bath.x, b.y - bath.y);
        return da - db;
      })[0];

    if (!valid) continue;
    if (Math.abs(valid.x - bath.x) <= EPS && Math.abs(valid.y - bath.y) <= EPS) continue;

    next = next.map((room) => room.id === bath.id ? valid : room);
    actions.push({
      type: "suite_bath",
      roomIds: [suite.id, bath.id],
      description: `${bath.label} reposicionado junto de ${suite.label}.`,
    });
  }

  return { rooms: next, actions };
}

function acceptance(input: RepairInput, rooms: ConceptRoomShape[]) {
  return evaluateConceptAcceptance({
    rooms,
    lotWidth: input.lotWidth,
    lotDepth: input.lotDepth,
    floors: input.floors,
    site: input.site,
  });
}

function acceptIfBetter(
  currentRooms: ConceptRoomShape[],
  current: ConceptAcceptanceResult,
  candidateRooms: ConceptRoomShape[],
  candidate: ConceptAcceptanceResult,
) {
  if (candidate.errors.length > current.errors.length) return false;
  return score(candidate) > score(current);
}

/**
 * Etapa 78 — Auto-Repair arquitetônico.
 *
 * O motor nunca aceita uma correção que piore o gate atual.
 * Estratégia:
 * 1. normalizar dimensões/limites;
 * 2. aproximar banheiros privativos das respectivas suítes;
 * 3. testar relayouts determinísticos existentes;
 * 4. revalidar a cada tentativa e preservar somente a melhor solução.
 */
export function autoRepairConceptLayout(input: RepairInput): ConceptAutoRepairResult {
  const originalRooms = input.rooms.map((room) => ({ ...room }));
  const before = acceptance(input, originalRooms);
  let bestRooms = originalRooms;
  let best = before;
  const actions: ConceptRepairAction[] = [];
  let attempts = 0;

  const maxPasses = Math.max(1, Math.min(4, input.maxPasses ?? 3));

  for (let pass = 0; pass < maxPasses; pass += 1) {
    attempts += 1;

    const normalized = clampAndResize(bestRooms, input.lotWidth, input.lotDepth);
    const normalizedAcceptance = acceptance(input, normalized.rooms);
    if (acceptIfBetter(bestRooms, best, normalized.rooms, normalizedAcceptance)) {
      bestRooms = normalized.rooms;
      best = normalizedAcceptance;
      actions.push(...normalized.actions);
    }

    const snapped = snapSuiteBaths(bestRooms, input.lotWidth, input.lotDepth);
    const snappedAcceptance = acceptance(input, snapped.rooms);
    if (acceptIfBetter(bestRooms, best, snapped.rooms, snappedAcceptance)) {
      bestRooms = snapped.rooms;
      best = snappedAcceptance;
      actions.push(...snapped.actions);
    }

    for (let variant = 0; variant < 3; variant += 1) {
      let candidate = bestRooms.map((room) => ({ ...room }));
      for (let floor = 0; floor < Math.max(1, input.floors); floor += 1) {
        candidate = generateLayoutVariant(candidate, input.lotWidth, input.lotDepth, floor, variant);
      }
      const candidateAcceptance = acceptance(input, candidate);
      if (acceptIfBetter(bestRooms, best, candidate, candidateAcceptance)) {
        bestRooms = candidate;
        best = candidateAcceptance;
        actions.push({
          type: "relayout",
          roomIds: candidate.map((room) => room.id),
          description: `Reorganização espacial automática aplicada (variante ${variant + 1}).`,
        });
      }
    }

    if (best.status === "approved") break;
  }

  return {
    rooms: bestRooms,
    before,
    after: best,
    improved: score(best) > score(before),
    actions,
    attempts,
  };
}
