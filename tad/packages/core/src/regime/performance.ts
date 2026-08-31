import type { BacktestTrade } from '../backtest/engine';
export interface RegimePerformance { regime:string; trades:number; wins:number; winRatePct:number; netReturnPct:number; avgTradePct:number; profitFactor:number|null; }
export function performanceByRegime(trades:BacktestTrade[]):RegimePerformance[]{
  const groups=new Map<string,BacktestTrade[]>();
  for(const t of trades){ const key=t.regime??'UNKNOWN'; const a=groups.get(key)??[]; a.push(t); groups.set(key,a); }
  return [...groups.entries()].map(([regime,ts])=>{ const wins=ts.filter(t=>t.netReturnPct>0); const losses=ts.filter(t=>t.netReturnPct<=0); const pos=wins.reduce((a,t)=>a+t.netReturnPct,0), neg=Math.abs(losses.reduce((a,t)=>a+t.netReturnPct,0)); const net=ts.reduce((a,t)=>a+t.netReturnPct,0); return {regime,trades:ts.length,wins:wins.length,winRatePct:ts.length?wins.length/ts.length*100:0,netReturnPct:net,avgTradePct:ts.length?net/ts.length:0,profitFactor:neg?pos/neg:null}; });
}

export function selectAdaptiveStrategy(rows:{strategyId:string;regime:string;trades:number;netReturnPct:number;profitFactor:number|null;winRatePct:number}[], regime:string){
  return rows.filter(r=>r.regime===regime && r.trades>=8).sort((a,b)=>{
    const as=(a.profitFactor??0)*0.45+a.winRatePct/100*0.25+a.netReturnPct/100*0.30;
    const bs=(b.profitFactor??0)*0.45+b.winRatePct/100*0.25+b.netReturnPct/100*0.30;
    return bs-as;
  })[0]??null;
}
