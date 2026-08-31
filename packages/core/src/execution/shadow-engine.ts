import type { BrainDecision, MarketSnapshot, Side } from '../types/index';

export interface ShadowExecutionConfig {
  latencyMs: number;
  slippageBpsFloor: number;
  slippageSpreadMultiplier: number;
  feeBpsPerSide: number;
  minFillProbabilityPct: number;
}

export interface ShadowOrder {
  id: string;
  decisionId: string;
  strategyId: string;
  symbol: string;
  side: Side;
  paperEntry: number;
  shadowEntry: number;
  spreadCostBps: number;
  slippageBps: number;
  feeBpsRoundTrip: number;
  latencyMs: number;
  fillProbabilityPct: number;
  filled: boolean;
  executionDragBps: number;
  createdAt: number;
  rationale: string[];
}

export interface ShadowComparison {
  strategyId: string;
  symbol: string;
  side: Side;
  paperEntry: number;
  shadowEntry: number;
  paperExit: number;
  shadowExit: number;
  paperReturnPct: number;
  shadowReturnPct: number;
  divergencePct: number;
  executionDragBps: number;
}

const DEFAULT_CONFIG: ShadowExecutionConfig = {
  latencyMs: 180,
  slippageBpsFloor: 0.5,
  slippageSpreadMultiplier: 0.35,
  feeBpsPerSide: 2,
  minFillProbabilityPct: 55,
};

function clamp(n:number,min:number,max:number){return Math.min(max,Math.max(min,n));}
function id(){return `SHD-${Date.now()}-${Math.random().toString(36).slice(2,8).toUpperCase()}`;}

export function estimateFillProbability(market:MarketSnapshot, latencyMs:number){
  const spreadPenalty = Math.min(45, market.spreadPct * 100 * 4.5);
  const latencyPenalty = Math.min(25, latencyMs / 40);
  const opportunityBonus = Math.min(12, Math.max(0, (market.opportunityScore ?? 50)-50) * 0.24);
  return clamp(96 - spreadPenalty - latencyPenalty + opportunityBonus, 5, 99);
}

export function simulateShadowOrder(decision:BrainDecision, market:MarketSnapshot, partial:Partial<ShadowExecutionConfig> = {}):ShadowOrder {
  const cfg={...DEFAULT_CONFIG,...partial};
  const spreadBps=Math.max(0,market.spreadPct*100);
  const slippageBps=Math.max(cfg.slippageBpsFloor,spreadBps*cfg.slippageSpreadMultiplier + cfg.latencyMs/900);
  const halfSpreadBps=spreadBps/2;
  const entryDragBps=halfSpreadBps+slippageBps;
  const direction=decision.side==='LONG'?1:-1;
  const shadowEntry=decision.entry*(1+direction*entryDragBps/10_000);
  const fillProbabilityPct=estimateFillProbability(market,cfg.latencyMs);
  const filled=fillProbabilityPct>=cfg.minFillProbabilityPct;
  const executionDragBps=entryDragBps+(cfg.feeBpsPerSide*2);
  const rationale=[
    `spread ${spreadBps.toFixed(2)} bps`,
    `slippage estimado ${slippageBps.toFixed(2)} bps`,
    `latência ${cfg.latencyMs} ms`,
    `fill probability ${fillProbabilityPct.toFixed(1)}%`,
  ];
  if(!filled) rationale.push('ordem virtual não preenchida por baixa probabilidade de fill');
  return {id:id(),decisionId:decision.decisionId,strategyId:decision.strategyId,symbol:decision.symbol,side:decision.side,paperEntry:decision.entry,shadowEntry,spreadCostBps:halfSpreadBps,slippageBps,feeBpsRoundTrip:cfg.feeBpsPerSide*2,latencyMs:cfg.latencyMs,fillProbabilityPct,filled,executionDragBps,createdAt:Date.now(),rationale};
}

export function comparePaperShadow(order:ShadowOrder,paperExit:number,marketExit:number):ShadowComparison {
  const sign=order.side==='LONG'?1:-1;
  const paperReturnPct=sign*((paperExit-order.paperEntry)/order.paperEntry)*100;
  const exitDragBps=(order.spreadCostBps+order.slippageBps+order.feeBpsRoundTrip/2);
  const shadowExit=marketExit*(1-sign*exitDragBps/10_000);
  const grossShadow=sign*((shadowExit-order.shadowEntry)/order.shadowEntry)*100;
  const shadowReturnPct=grossShadow-(order.feeBpsRoundTrip/2)/100;
  return {strategyId:order.strategyId,symbol:order.symbol,side:order.side,paperEntry:order.paperEntry,shadowEntry:order.shadowEntry,paperExit,shadowExit,paperReturnPct,shadowReturnPct,divergencePct:shadowReturnPct-paperReturnPct,executionDragBps:order.executionDragBps};
}

export function shadowQualityScore(order:ShadowOrder){
  let score=100;
  score-=Math.min(35,order.executionDragBps*1.5);
  score-=Math.min(35,Math.max(0,75-order.fillProbabilityPct));
  score-=Math.min(20,order.latencyMs/50);
  if(!order.filled) score-=20;
  return Math.round(clamp(score,0,100));
}
