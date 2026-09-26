import { evaluateConceptAcceptance, type ConceptAcceptanceResult } from "./conceptAcceptance";
import { evaluateConceptIntent, type ConceptIntentInput } from "./conceptIntent";
import { generateLayoutVariant, type ConceptRoomShape } from "./conceptGeometry";

export type ArchitecturalObjectiveVector = {
  technical: number;
  intent: number;
  ergonomics: number;
  furniture: number;
  circulation: number;
  climate: number;
  privacyAcoustic: number;
  constructability: number;
  buildability: number;
  costEfficiency: number;
};

export type ArchitecturalCandidate = {
  id: string;
  rooms: ConceptRoomShape[];
  acceptance: ConceptAcceptanceResult;
  objectives: ArchitecturalObjectiveVector;
  paretoEfficient: boolean;
  dominatedBy: string[];
  balanceScore: number;
  tradeoffs: string[];
};

type OptimizerInput = {
  rooms: ConceptRoomShape[];
  lotWidth: number;
  lotDepth: number;
  floors: number;
  site?: {
    frontSide?: "top" | "bottom" | "left" | "right";
    setbackFront?: number;
    northSide?: "top" | "bottom" | "left" | "right" | null;
  };
  intent?: ConceptIntentInput;
  variantsPerFloor?: number;
};

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function evaluateCandidate(
  id: string,
  rooms: ConceptRoomShape[],
  input: OptimizerInput,
): ArchitecturalCandidate {
  const acceptance = evaluateConceptAcceptance({
    rooms,
    lotWidth: input.lotWidth,
    lotDepth: input.lotDepth,
    floors: input.floors,
    site: input.site,
  });
  const intent = evaluateConceptIntent(rooms, input.intent);
  const costEfficiency = clampScore(200 - acceptance.buildability.costIndex);

  const objectives: ArchitecturalObjectiveVector = {
    technical: acceptance.score,
    intent: intent.score,
    ergonomics: acceptance.ergonomics.score,
    furniture: acceptance.furniture.score,
    circulation: acceptance.circulation.score,
    climate: acceptance.climate.score,
    privacyAcoustic: acceptance.privacyAcoustic.score,
    constructability: acceptance.constructability.score,
    buildability: acceptance.buildability.score,
    costEfficiency,
  };

  const values = Object.values(objectives);
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  const worst = Math.min(...values);
  const balanceScore = clampScore(average * 0.7 + worst * 0.3);

  const tradeoffs: string[] = [];
  const sorted = Object.entries(objectives).sort((a, b) => a[1] - b[1]);
  for (const [key, value] of sorted.slice(0, 3)) {
    if (value < 85) tradeoffs.push(`${key}: ${Math.round(value)}/100`);
  }

  return {
    id,
    rooms,
    acceptance,
    objectives,
    paretoEfficient: true,
    dominatedBy: [],
    balanceScore,
    tradeoffs,
  };
}

function dominates(a: ArchitecturalCandidate, b: ArchitecturalCandidate) {
  if (a.acceptance.errors.length > b.acceptance.errors.length) return false;
  if (a.acceptance.status === "blocked" && b.acceptance.status !== "blocked") return false;

  const aValues = Object.values(a.objectives);
  const bValues = Object.values(b.objectives);
  const noWorse = aValues.every((value, index) => value >= bValues[index]);
  const strictlyBetter = aValues.some((value, index) => value > bValues[index]);
  return noWorse && strictlyBetter;
}

function markPareto(candidates: ArchitecturalCandidate[]) {
  return candidates.map((candidate) => {
    const dominators = candidates
      .filter((other) => other.id !== candidate.id && dominates(other, candidate))
      .map((other) => other.id);

    return {
      ...candidate,
      paretoEfficient: dominators.length === 0,
      dominatedBy: dominators,
    };
  });
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

export function optimizeArchitecturalCandidates(input: OptimizerInput): {
  candidates: ArchitecturalCandidate[];
  paretoFront: ArchitecturalCandidate[];
  recommended: ArchitecturalCandidate | null;
} {
  const generated: ConceptRoomShape[][] = [input.rooms.map((room) => ({ ...room }))];
  const variantCount = Math.max(1, Math.min(5, input.variantsPerFloor ?? 3));

  for (let variant = 0; variant < variantCount; variant += 1) {
    let candidate = input.rooms.map((room) => ({ ...room }));
    for (let floor = 0; floor < Math.max(1, input.floors); floor += 1) {
      candidate = generateLayoutVariant(
        candidate,
        input.lotWidth,
        input.lotDepth,
        floor,
        variant % 3,
      );
    }
    generated.push(candidate);
  }

  const unique = [...new Map(generated.map((rooms) => [signature(rooms), rooms])).values()];
  const evaluated = unique.map((rooms, index) => evaluateCandidate(`candidate-${index + 1}`, rooms, input));
  const marked = markPareto(evaluated);

  const paretoFront = marked
    .filter((candidate) => candidate.paretoEfficient)
    .sort((a, b) =>
      Number(a.acceptance.status === "blocked") - Number(b.acceptance.status === "blocked")
      || a.acceptance.errors.length - b.acceptance.errors.length
      || b.balanceScore - a.balanceScore
      || a.acceptance.buildability.costIndex - b.acceptance.buildability.costIndex
    );

  const recommended =
    paretoFront.find((candidate) => candidate.acceptance.status !== "blocked")
    ?? paretoFront[0]
    ?? null;

  return {
    candidates: marked,
    paretoFront,
    recommended,
  };
}
