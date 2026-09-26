import type { ConceptRoomShape } from "./conceptGeometry";

export type ConceptIntentInput = {
  livingIntegratedKitchen?: boolean;
  kitchenNearGourmet?: boolean;
  gourmetNearPool?: boolean;
  privateAwaySocial?: boolean;
  desiredAreaTotal?: number | null;
};

export type ConceptIntentIssue = {
  id: string;
  severity: "warning" | "error";
  message: string;
  roomIds: string[];
};

export type ConceptIntentResult = {
  score: number;
  issues: ConceptIntentIssue[];
  strengths: string[];
};

const center = (room: ConceptRoomShape) => ({
  x: room.x + room.width / 2,
  y: room.y + room.depth / 2,
});

const distance = (a: ConceptRoomShape, b: ConceptRoomShape) => {
  const ca = center(a);
  const cb = center(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
};

const overlap = (a1: number, a2: number, b1: number, b2: number) =>
  Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));

const sharesEdge = (a: ConceptRoomShape, b: ConceptRoomShape) => {
  const eps = 0.08;
  const vertical =
    (Math.abs(a.x + a.width - b.x) <= eps || Math.abs(b.x + b.width - a.x) <= eps)
    && overlap(a.y, a.y + a.depth, b.y, b.y + b.depth) >= 0.8;
  const horizontal =
    (Math.abs(a.y + a.depth - b.y) <= eps || Math.abs(b.y + b.depth - a.y) <= eps)
    && overlap(a.x, a.x + a.width, b.x, b.x + b.width) >= 0.8;
  return vertical || horizontal;
};

function first(rooms: ConceptRoomShape[], kind: string) {
  return rooms.find((room) => room.kind === kind);
}

function nearestDistance(roomsA: ConceptRoomShape[], roomsB: ConceptRoomShape[]) {
  let best = Number.POSITIVE_INFINITY;
  for (const a of roomsA) {
    for (const b of roomsB) best = Math.min(best, distance(a, b));
  }
  return best;
}

/**
 * Etapa 79 — Intent Gate.
 * Mede se uma planta atende ao que o cliente pediu, sem substituir o gate técnico.
 */
export function evaluateConceptIntent(
  rooms: ConceptRoomShape[],
  intent: ConceptIntentInput = {},
): ConceptIntentResult {
  const issues: ConceptIntentIssue[] = [];
  const strengths: string[] = [];
  let score = 100;

  const living = first(rooms, "sala");
  const kitchen = first(rooms, "cozinha");
  const gourmet = first(rooms, "gourmet");
  const pool = first(rooms, "piscina");
  const garage = first(rooms, "garagem");
  const privateRooms = rooms.filter((room) => room.kind === "suite" || room.kind === "quarto");

  if (intent.livingIntegratedKitchen && living && kitchen) {
    if (!sharesEdge(living, kitchen)) {
      score -= 18;
      issues.push({
        id: "intent-living-kitchen-direct",
        severity: "warning",
        roomIds: [living.id, kitchen.id],
        message: "O briefing pede sala e cozinha integradas, mas os ambientes não estão diretamente conectados.",
      });
    } else {
      strengths.push("Sala e cozinha atendem à integração solicitada.");
    }
  }

  if (intent.kitchenNearGourmet && kitchen && gourmet) {
    const d = distance(kitchen, gourmet);
    if (d > 5.5) {
      score -= 12;
      issues.push({
        id: "intent-kitchen-gourmet-near",
        severity: "warning",
        roomIds: [kitchen.id, gourmet.id],
        message: "Cozinha e gourmet ficaram afastados apesar da preferência de proximidade.",
      });
    } else {
      strengths.push("Cozinha e gourmet mantêm boa proximidade.");
    }
  }

  if (intent.gourmetNearPool && gourmet && pool) {
    const d = distance(gourmet, pool);
    if (d > 7) {
      score -= 10;
      issues.push({
        id: "intent-gourmet-pool-near",
        severity: "warning",
        roomIds: [gourmet.id, pool.id],
        message: "Gourmet e piscina ficaram afastados em relação ao briefing.",
      });
    } else {
      strengths.push("Área gourmet e piscina estão articuladas como conjunto de lazer.");
    }
  }

  if (intent.privateAwaySocial && privateRooms.length) {
    const social = [gourmet, garage].filter(Boolean) as ConceptRoomShape[];
    if (social.length) {
      const d = nearestDistance(privateRooms, social);
      if (d < 3.2) {
        score -= 14;
        issues.push({
          id: "intent-private-away-social",
          severity: "warning",
          roomIds: [...privateRooms.map((room) => room.id), ...social.map((room) => room.id)],
          message: "A área íntima ficou muito próxima de garagem/lazer apesar da prioridade de privacidade.",
        });
      } else {
        strengths.push("A área íntima preserva afastamento adequado das zonas mais ativas.");
      }
    }
  }

  const desired = Number(intent.desiredAreaTotal);
  if (Number.isFinite(desired) && desired >= 40) {
    const netArea = rooms
      .filter((room) => room.kind !== "piscina")
      .reduce((sum, room) => sum + room.width * room.depth, 0);
    const estimatedBuilt = netArea * 1.12;
    const deviation = Math.abs(estimatedBuilt - desired) / desired;
    if (deviation > 0.18) {
      score -= Math.min(18, Math.round(deviation * 40));
      issues.push({
        id: "intent-area-target",
        severity: deviation > 0.35 ? "error" : "warning",
        roomIds: [],
        message: `A solução estimada em ${Math.round(estimatedBuilt)} m² se afasta da meta de ${Math.round(desired)} m².`,
      });
    } else {
      strengths.push("A área estimada permanece próxima da meta definida no briefing.");
    }
  }

  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    issues,
    strengths,
  };
}
