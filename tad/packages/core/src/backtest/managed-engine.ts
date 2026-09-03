import type { Candle, Side, StrategySignal } from '../types/index';
import type { BacktestCostModel, BacktestSummary, BacktestTrade } from './engine';
import { summarizeBacktest } from './engine';

export interface ManagedBacktestTrade extends BacktestTrade {
  partialExit?: number;
  partialReturnPct?: number;
  mfePct: number;
  maePct: number;
  barsHeld: number;
}

function hit(side:Side,c:Candle,level:number,kind:'STOP'|'TARGET'){
  if(kind==='STOP')return side==='LONG'?c.low<=level:c.high>=level;
  return side==='LONG'?c.high>=level:c.low<=level;
}

function returnPct(side:Side,entry:number,exit:number){return (side==='LONG'?(exit-entry):(entry-exit))/entry*100;}

function closeManaged(params:{signal:StrategySignal;candles:Candle[];startIndex:number;maxBars:number;costs:BacktestCostModel;regime?:string}):ManagedBacktestTrade|null{
  const {signal,candles,startIndex,maxBars,costs,regime}=params;
  const first=candles[startIndex]; if(!first)return null;
  const signalRisk=Math.max(Math.abs(signal.entry-signal.stop)/Math.max(signal.entry,1e-9),0.0015);
  const targetRatios=signal.targets.map(t=>Math.abs(t-signal.entry)/Math.max(signal.entry,1e-9));
  const rawEntry=first.open;
  const entry=rawEntry*(signal.side==='LONG'?1+costs.slippagePct/100:1-costs.slippagePct/100);
  const initialStop=entry*(signal.side==='LONG'?1-signalRisk:1+signalRisk);
  const tp1=entry*(signal.side==='LONG'?1+(targetRatios[0]??signalRisk*1.5):1-(targetRatios[0]??signalRisk*1.5));
  const tp2=entry*(signal.side==='LONG'?1+(targetRatios.at(-1)??signalRisk*2.5):1-(targetRatios.at(-1)??signalRisk*2.5));
  const last=Math.min(candles.length-1,startIndex+maxBars);
  let stop=initialStop,partial=false,partialReturn=0,best=entry,worst=entry,exit=entry,exitTime=first.closeTime,reason:BacktestTrade['exitReason']='END',barsHeld=0;
  for(let i=startIndex;i<=last;i++){
    const c=candles[i]; barsHeld=i-startIndex+1;
    if(signal.side==='LONG'){best=Math.max(best,c.high);worst=Math.min(worst,c.low);}else{best=Math.min(best,c.low);worst=Math.max(worst,c.high);}
    const stopHit=hit(signal.side,c,stop,'STOP');
    if(stopHit){exit=stop;exitTime=c.closeTime;reason='STOP';break;}
    if(!partial&&hit(signal.side,c,tp1,'TARGET')){
      partial=true;
      partialReturn=returnPct(signal.side,entry,tp1)*0.5;
      stop=entry;
      if(hit(signal.side,c,tp2,'TARGET')){exit=tp2;exitTime=c.closeTime;reason='TP2';break;}
      continue;
    }
    if(partial){
      const trailDistance=Math.max(Math.abs(tp1-entry)*0.5,entry*0.001);
      const candidate=signal.side==='LONG'?c.close-trailDistance:c.close+trailDistance;
      stop=signal.side==='LONG'?Math.max(stop,entry,candidate):Math.min(stop,entry,candidate);
      if(hit(signal.side,c,tp2,'TARGET')){exit=tp2;exitTime=c.closeTime;reason='TP2';break;}
    }
    if(i===last){exit=c.close;exitTime=c.closeTime;reason=i===candles.length-1?'END':'TIMEOUT';}
  }
  const exitWithSlip=exit*(signal.side==='LONG'?1-costs.slippagePct/100:1+costs.slippagePct/100);
  const remainderWeight=partial?0.5:1;
  const grossReturnPct=partialReturn+returnPct(signal.side,entry,exitWithSlip)*remainderWeight;
  const entries=1,exits=partial?2:1;
  const feesPct=costs.takerFeePct*(entries+exits*remainderWeight);
  const netReturnPct=grossReturnPct-feesPct;
  const mfePct=Math.max(0,returnPct(signal.side,entry,best));
  const maePct=Math.max(0,-returnPct(signal.side,entry,worst));
  return {strategyId:signal.strategyId,side:signal.side,entryTime:first.openTime,exitTime,entry,exit:exitWithSlip,grossReturnPct,netReturnPct,feesPct,slippagePct:costs.slippagePct*2,exitReason:reason,regime,partialExit:partial?tp1:undefined,partialReturnPct:partial?partialReturn:undefined,mfePct,maePct,barsHeld};
}

export function runManagedSignalBacktest(params:{candles:Candle[];signalAt:(index:number,history:Candle[])=>StrategySignal|null;maxBarsInTrade?:number;costs?:Partial<BacktestCostModel>;regimeAt?:(index:number,history:Candle[])=>string|undefined}):{trades:ManagedBacktestTrade[];summary:BacktestSummary}{
  const costs:BacktestCostModel={makerFeePct:0.02,takerFeePct:0.05,slippagePct:0.02,...params.costs};
  const trades:ManagedBacktestTrade[]=[];let i=240;
  while(i<params.candles.length-2){
    const history=params.candles.slice(0,i+1);const signal=params.signalAt(i,history);
    if(!signal){i++;continue;}
    const trade=closeManaged({signal,candles:params.candles,startIndex:i+1,maxBars:params.maxBarsInTrade??72,costs,regime:params.regimeAt?.(i,history)});
    if(trade){trades.push(trade);const exitIdx=params.candles.findIndex((c,idx)=>idx>i&&c.closeTime>=trade.exitTime);i=Math.max(i+1,exitIdx);}else i++;
  }
  return {trades,summary:summarizeBacktest(trades)};
}
