import type { StrategyMetric } from '../types/index';

export interface StrategyRankingItem {
  symbol: string;
  strategyId: string;
  score: number;
  sampleSize: number;
  winRatePct: number;
  profitFactor: number | null;
  netReturnPct: number;
  maxDrawdownPct: number;
  regime?: string;
  eligible: boolean;
  allocationWeight: number;
}

export function adaptiveScore(input:{winRatePct:number;profitFactor:number|null;netReturnPct:number;maxDrawdownPct:number;trades:number}):number{
  const sample=Math.min(1,input.trades/30);
  const wr=Math.max(0,Math.min(1,input.winRatePct/100));
  const pf=Math.max(0,Math.min(2,(input.profitFactor??0)/2));
  const ret=Math.max(0,Math.min(1,(input.netReturnPct+5)/15));
  const dd=Math.max(0,Math.min(1,1-input.maxDrawdownPct/20));
  return Math.round(100*(.30*wr+.25*pf+.25*ret+.20*dd)*sample);
}

export function normalizeAllocation<T extends {score:number;eligible:boolean}>(rows:T[]):Array<T & {allocationWeight:number}>{
  const eligible=rows.filter(r=>r.eligible); const total=eligible.reduce((a,r)=>a+Math.max(1,r.score),0);
  return rows.map(r=>({...r,allocationWeight:r.eligible&&total?Math.max(1,r.score)/total:0}));
}

export function metricPrior(m:StrategyMetric|undefined){
  if(!m)return 0;
  return Math.min(12,(m.trades/20)*4+(m.winRatePct-50)/10+Math.min(4,m.profitFactor??0));
}
