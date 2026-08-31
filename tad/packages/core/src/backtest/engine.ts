import type { Candle, Side, StrategySignal } from '../types/index';

export interface BacktestCostModel {
  makerFeePct: number;
  takerFeePct: number;
  slippagePct: number;
}

export interface BacktestTrade {
  strategyId: string;
  side: Side;
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  grossReturnPct: number;
  netReturnPct: number;
  feesPct: number;
  slippagePct: number;
  exitReason: 'STOP'|'TP1'|'TP2'|'TIMEOUT'|'END';
  regime?: string;
}

export interface BacktestSummary {
  strategyId: string;
  trades: number;
  wins: number;
  losses: number;
  winRatePct: number;
  grossReturnPct: number;
  netReturnPct: number;
  avgTradePct: number;
  profitFactor: number | null;
  maxDrawdownPct: number;
}

export interface BacktestResult {
  trades: BacktestTrade[];
  summary: BacktestSummary;
}

function closeForSignal(params:{signal:StrategySignal; candles:Candle[]; startIndex:number; maxBars:number; costs:BacktestCostModel; regime?:string}):BacktestTrade|null {
  const {signal,candles,startIndex,maxBars,costs,regime}=params;
  const last=Math.min(candles.length-1,startIndex+maxBars);
  const entrySlip = signal.side==='LONG' ? 1+costs.slippagePct/100 : 1-costs.slippagePct/100;
  const entry=signal.entry*entrySlip;
  let exit=entry, exitTime=candles[startIndex]?.closeTime ?? Date.now(), exitReason:BacktestTrade['exitReason']='END';
  for(let i=startIndex;i<=last;i++){
    const c=candles[i];
    const stopHit=signal.side==='LONG'?c.low<=signal.stop:c.high>=signal.stop;
    const tp2=signal.targets.at(-1) ?? signal.targets[0];
    const tp2Hit=signal.side==='LONG'?c.high>=tp2:c.low<=tp2;
    const tp1=signal.targets[0];
    const tp1Hit=signal.side==='LONG'?c.high>=tp1:c.low<=tp1;
    if(stopHit){ exit=signal.stop; exitTime=c.closeTime; exitReason='STOP'; break; }
    if(tp2Hit){ exit=tp2; exitTime=c.closeTime; exitReason='TP2'; break; }
    if(tp1Hit && i===last){ exit=tp1; exitTime=c.closeTime; exitReason='TP1'; break; }
    if(i===last){ exit=c.close; exitTime=c.closeTime; exitReason=i===candles.length-1?'END':'TIMEOUT'; }
  }
  const exitSlip = signal.side==='LONG' ? 1-costs.slippagePct/100 : 1+costs.slippagePct/100;
  exit*=exitSlip;
  const grossReturnPct=(signal.side==='LONG'?(exit-entry):(entry-exit))/entry*100;
  const feesPct=costs.takerFeePct*2;
  const slippagePct=costs.slippagePct*2;
  const netReturnPct=grossReturnPct-feesPct;
  return {strategyId:signal.strategyId,side:signal.side,entryTime:candles[startIndex]?.openTime??0,exitTime,entry,exit,grossReturnPct,netReturnPct,feesPct,slippagePct,exitReason,regime};
}

export function runSignalBacktest(params:{
  candles:Candle[];
  signalAt:(index:number, history:Candle[])=>StrategySignal|null;
  maxBarsInTrade?:number;
  costs?:Partial<BacktestCostModel>;
  regimeAt?:(index:number,history:Candle[])=>string|undefined;
}):BacktestResult {
  const costs:BacktestCostModel={makerFeePct:0.02,takerFeePct:0.05,slippagePct:0.02,...params.costs};
  const trades:BacktestTrade[]=[]; let i=60;
  while(i<params.candles.length-2){
    const history=params.candles.slice(0,i+1); const s=params.signalAt(i,history);
    if(!s){ i++; continue; }
    const t=closeForSignal({signal:s,candles:params.candles,startIndex:i+1,maxBars:params.maxBarsInTrade??24,costs,regime:params.regimeAt?.(i,history)});
    if(t){ trades.push(t); const exitIdx=params.candles.findIndex(c=>c.closeTime>=t.exitTime); i=Math.max(i+1,exitIdx); } else i++;
  }
  return {trades,summary:summarizeBacktest(trades)};
}

export function summarizeBacktest(trades:BacktestTrade[]):BacktestSummary {
  const strategyId=trades[0]?.strategyId ?? 'N/A'; const wins=trades.filter(t=>t.netReturnPct>0), losses=trades.filter(t=>t.netReturnPct<=0);
  const grossReturnPct=trades.reduce((a,t)=>a+t.grossReturnPct,0), netReturnPct=trades.reduce((a,t)=>a+t.netReturnPct,0);
  const pos=wins.reduce((a,t)=>a+t.netReturnPct,0), neg=Math.abs(losses.reduce((a,t)=>a+t.netReturnPct,0));
  let equity=100, peak=100, maxDrawdownPct=0; for(const t of trades){ equity*=1+t.netReturnPct/100; peak=Math.max(peak,equity); maxDrawdownPct=Math.max(maxDrawdownPct,(peak-equity)/peak*100); }
  return {strategyId,trades:trades.length,wins:wins.length,losses:losses.length,winRatePct:trades.length?wins.length/trades.length*100:0,grossReturnPct,netReturnPct,avgTradePct:trades.length?netReturnPct/trades.length:0,profitFactor:neg?pos/neg:null,maxDrawdownPct};
}
