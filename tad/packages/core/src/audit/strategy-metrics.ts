import type { PaperPosition, StrategyMetric } from '../types/index';
export function strategyMetrics(positions:PaperPosition[]):StrategyMetric[]{
  const closed=positions.filter(p=>p.status==='CLOSED'); const map=new Map<string,PaperPosition[]>();
  for(const p of closed){ const arr=map.get(p.strategyId)??[]; arr.push(p); map.set(p.strategyId,arr); }
  return [...map.entries()].map(([strategyId,ps])=>{ const wins=ps.filter(p=>p.realizedPnl>0), losses=ps.filter(p=>p.realizedPnl<=0); const pos=wins.reduce((a,p)=>a+p.realizedPnl,0), neg=Math.abs(losses.reduce((a,p)=>a+p.realizedPnl,0)); const realizedPnl=ps.reduce((a,p)=>a+p.realizedPnl,0); return {strategyId,trades:ps.length,wins:wins.length,losses:losses.length,winRatePct:ps.length?wins.length/ps.length*100:0,realizedPnl,avgPnl:ps.length?realizedPnl/ps.length:0,profitFactor:neg?pos/neg:null}; });
}
