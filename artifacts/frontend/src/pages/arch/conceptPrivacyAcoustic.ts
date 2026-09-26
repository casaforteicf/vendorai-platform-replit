import type { ConceptRoomShape } from "./conceptGeometry";

export type PrivacyAcousticIssue = {
  id: string;
  severity: "warning" | "error";
  roomIds: string[];
  message: string;
};

export type PrivacyAcousticResult = {
  score: number;
  issues: PrivacyAcousticIssue[];
  strengths: string[];
};

type LotSide = "top" | "bottom" | "left" | "right";

type Input = {
  frontSide?: LotSide;
};

const PRIVATE = new Set(["quarto", "suite", "banheiro"]);
const NOISY = new Set(["garagem", "gourmet", "lavanderia", "cozinha"]);
const SOCIAL = new Set(["sala", "gourmet", "cozinha"]);

const center = (room: ConceptRoomShape) => ({
  x: room.x + room.width / 2,
  y: room.y + room.depth / 2,
});

function distance(a: ConceptRoomShape, b: ConceptRoomShape) {
  const ca = center(a);
  const cb = center(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}

function overlap(a1: number, a2: number, b1: number, b2: number) {
  return Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
}

function sharesEdge(a: ConceptRoomShape, b: ConceptRoomShape) {
  const eps = 0.08;
  const vertical =
    (Math.abs(a.x + a.width - b.x) <= eps || Math.abs(b.x + b.width - a.x) <= eps)
    && overlap(a.y, a.y + a.depth, b.y, b.y + b.depth) >= 0.8;
  const horizontal =
    (Math.abs(a.y + a.depth - b.y) <= eps || Math.abs(b.y + b.depth - a.y) <= eps)
    && overlap(a.x, a.x + a.width, b.x, b.x + b.width) >= 0.8;
  return vertical || horizontal;
}

function distanceToFront(room: ConceptRoomShape, lotWidth: number, lotDepth: number, frontSide: LotSide) {
  return frontSide === "top" ? room.y
    : frontSide === "bottom" ? lotDepth - (room.y + room.depth)
      : frontSide === "left" ? room.x
        : lotWidth - (room.x + room.width);
}

export function evaluatePrivacyAcousticZoning(
  rooms: ConceptRoomShape[],
  lotWidth: number,
  lotDepth: number,
  input: Input = {},
): PrivacyAcousticResult {
  const issues: PrivacyAcousticIssue[] = [];
  const strengths: string[] = [];
  let score = 100;

  const frontSide = input.frontSide ?? "top";
  const privateRooms = rooms.filter((room) => PRIVATE.has(room.kind));
  const sleepingRooms = rooms.filter((room) => room.kind === "quarto" || room.kind === "suite");
  const noisyRooms = rooms.filter((room) => NOISY.has(room.kind));
  const socialRooms = rooms.filter((room) => SOCIAL.has(room.kind));

  for (const sleeping of sleepingRooms) {
    for (const noisy of noisyRooms) {
      if (sleeping.floor !== noisy.floor) continue;
      if (!sharesEdge(sleeping, noisy)) continue;

      const severity = noisy.kind === "garagem" || noisy.kind === "gourmet" ? "error" : "warning";
      score -= severity === "error" ? 18 : 10;
      issues.push({
        id: `acoustic-adjacency-${sleeping.id}-${noisy.id}`,
        severity,
        roomIds: [sleeping.id, noisy.id],
        message: `${sleeping.label} compartilha parede com ${noisy.label}; revisar isolamento acústico ou reorganização das zonas.`,
      });
    }
  }

  for (const room of privateRooms) {
    const frontDistance = distanceToFront(room, lotWidth, lotDepth, frontSide);
    if (frontDistance < 1.8 && (room.kind === "quarto" || room.kind === "suite")) {
      score -= 10;
      issues.push({
        id: `privacy-front-exposure-${room.id}`,
        severity: "warning",
        roomIds: [room.id],
        message: `${room.label} ficou muito próximo da frente do lote; revisar exposição visual e ruído da rua.`,
      });
    }
  }

  const entranceCandidates = rooms.filter((room) => room.kind === "sala" || /hall/i.test(room.label));
  for (const sleeping of sleepingRooms) {
    for (const entrance of entranceCandidates) {
      if (sleeping.floor !== entrance.floor) continue;
      const d = distance(sleeping, entrance);
      if (d < 3 && sharesEdge(sleeping, entrance)) {
        score -= 8;
        issues.push({
          id: `privacy-entry-private-${sleeping.id}-${entrance.id}`,
          severity: "warning",
          roomIds: [sleeping.id, entrance.id],
          message: `${sleeping.label} está diretamente exposto à zona de entrada/social; considerar anteparo, circulação ou reposicionamento.`,
        });
      }
    }
  }

  for (const privateRoom of sleepingRooms) {
    const nearestSocial = socialRooms
      .filter((room) => room.floor === privateRoom.floor)
      .map((room) => distance(privateRoom, room))
      .sort((a, b) => a - b)[0];

    if (Number.isFinite(nearestSocial) && nearestSocial >= 4.5) {
      strengths.push(`${privateRoom.label} mantém bom afastamento das zonas sociais mais ativas.`);
    }
  }

  const uniqueIssues = [...new Map(issues.map((issue) => [issue.id, issue])).values()];
  return {
    score: Math.max(0, Math.min(100, Math.round(score))),
    issues: uniqueIssues,
    strengths: [...new Set(strengths)],
  };
}
