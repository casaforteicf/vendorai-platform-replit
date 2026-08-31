import type { BrainDecision, StrategySignal } from '../types/index';

export function buildConsensus(signal: StrategySignal, scores: Record<string, number>): BrainDecision {
  const values = Object.values(scores);
  const consensus = values.length ? values.reduce((a,b)=>a+b,0) / values.length : 0;
  return {
    ...signal,
    decisionId: crypto.randomUUID(),
    agentScores: scores,
    consensus
  };
}
