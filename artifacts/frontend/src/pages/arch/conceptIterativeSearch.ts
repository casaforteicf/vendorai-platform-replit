import { generateArchitecturalSearchNeighborhood } from "./conceptArchitecturalSearch";
import {
  optimizeArchitecturalCandidates,
  type ArchitecturalCandidate,
} from "./conceptMultiObjectiveOptimizer";
import type { ConceptRoomShape } from "./conceptGeometry";
import type { ConceptIntentInput } from "./conceptIntent";

export type IterativeSearchGeneration = {
  generation: number;
  seedCount: number;
  candidateCount: number;
  paretoCount: number;
  bestBalanceScore: number;
  bestCandidateId: string | null;
  improvedBy: number;
};

export type IterativeSearchResult = {
  recommended: ArchitecturalCandidate | null;
  paretoFront: ArchitecturalCandidate[];
  generations: IterativeSearchGeneration[];
  stoppedReason: "max_generations" | "converged" | "no_candidates";
};

type Input = {
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
  maxGenerations?: number;
  seedsPerGeneration?: number;
  neighborhoodSize?: number;
  minImprovement?: number;
};

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

function bestOf(candidates: ArchitecturalCandidate[]) {
  return [...candidates].sort((a, b) =>
    Number(a.acceptance.status === "blocked") - Number(b.acceptance.status === "blocked")
    || a.acceptance.errors.length - b.acceptance.errors.length
    || b.balanceScore - a.balanceScore
    || a.acceptance.buildability.costIndex - b.acceptance.buildability.costIndex
  )[0] ?? null;
}

export function runIterativeArchitecturalSearch(input: Input): IterativeSearchResult {
  const maxGenerations = Math.max(1, Math.min(6, input.maxGenerations ?? 4));
  const seedsPerGeneration = Math.max(1, Math.min(6, input.seedsPerGeneration ?? 3));
  const neighborhoodSize = Math.max(4, Math.min(24, input.neighborhoodSize ?? 12));
  const minImprovement = Math.max(0, input.minImprovement ?? 1);

  let seeds: ConceptRoomShape[][] = [input.rooms.map((room) => ({ ...room }))];
  let globalPareto: ArchitecturalCandidate[] = [];
  let bestScore = -Infinity;
  let stagnantGenerations = 0;
  const generations: IterativeSearchGeneration[] = [];
  const seen = new Set<string>(seeds.map(signature));

  for (let generation = 0; generation < maxGenerations; generation += 1) {
    const candidates: ConceptRoomShape[][] = [];

    for (const seed of seeds) {
      candidates.push(seed);
      const neighborhood = generateArchitecturalSearchNeighborhood({
        rooms: seed,
        lotWidth: input.lotWidth,
        lotDepth: input.lotDepth,
        maxCandidates: neighborhoodSize,
      });
      for (const candidate of neighborhood) {
        const key = signature(candidate.rooms);
        if (seen.has(key)) continue;
        seen.add(key);
        candidates.push(candidate.rooms);
      }
    }

    if (!candidates.length) {
      return {
        recommended: bestOf(globalPareto),
        paretoFront: globalPareto,
        generations,
        stoppedReason: "no_candidates",
      };
    }

    const evaluated: ArchitecturalCandidate[] = [];
    for (const rooms of candidates) {
      const optimized = optimizeArchitecturalCandidates({
        rooms,
        lotWidth: input.lotWidth,
        lotDepth: input.lotDepth,
        floors: input.floors,
        site: input.site,
        intent: input.intent,
        variantsPerFloor: 1,
        searchCandidates: 0,
      });
      if (optimized.recommended) evaluated.push(optimized.recommended);
      evaluated.push(...optimized.paretoFront);
    }

    const mergedMap = new Map<string, ArchitecturalCandidate>();
    for (const candidate of [...globalPareto, ...evaluated]) {
      const key = signature(candidate.rooms);
      const existing = mergedMap.get(key);
      if (!existing || candidate.balanceScore > existing.balanceScore) {
        mergedMap.set(key, candidate);
      }
    }

    const merged = [...mergedMap.values()];
    const survivors = merged
      .sort((a, b) =>
        Number(a.acceptance.status === "blocked") - Number(b.acceptance.status === "blocked")
        || a.acceptance.errors.length - b.acceptance.errors.length
        || b.balanceScore - a.balanceScore
      )
      .slice(0, 24);

    // Recalcula um Pareto aproximado global reutilizando o otimizador sobre as melhores geometrias.
    // Isso mantém o custo sob controle e evita expansão combinatória.
    globalPareto = survivors;

    const best = bestOf(globalPareto);
    const currentScore = best?.balanceScore ?? -Infinity;
    const improvedBy = Number.isFinite(bestScore) ? currentScore - bestScore : currentScore;
    if (improvedBy >= minImprovement) stagnantGenerations = 0;
    else stagnantGenerations += 1;
    bestScore = Math.max(bestScore, currentScore);

    generations.push({
      generation: generation + 1,
      seedCount: seeds.length,
      candidateCount: candidates.length,
      paretoCount: globalPareto.length,
      bestBalanceScore: Number.isFinite(currentScore) ? currentScore : 0,
      bestCandidateId: best?.id ?? null,
      improvedBy: Number.isFinite(improvedBy) ? Math.round(improvedBy * 10) / 10 : 0,
    });

    if (stagnantGenerations >= 2) {
      return {
        recommended: best,
        paretoFront: globalPareto,
        generations,
        stoppedReason: "converged",
      };
    }

    seeds = globalPareto
      .filter((candidate) => candidate.acceptance.status !== "blocked")
      .slice(0, seedsPerGeneration)
      .map((candidate) => candidate.rooms.map((room) => ({ ...room })));

    if (!seeds.length && best) {
      seeds = [best.rooms.map((room) => ({ ...room }))];
    }
  }

  return {
    recommended: bestOf(globalPareto),
    paretoFront: globalPareto,
    generations,
    stoppedReason: "max_generations",
  };
}
