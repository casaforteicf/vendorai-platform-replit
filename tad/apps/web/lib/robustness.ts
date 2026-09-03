import { aggregateCandles, assessRobustness, buildMultiTimeframe, classifyRegime, monteCarloTradeReturns, opportunityScore, runSignalBacktest, runWalkForward, strategySignal, STRATEGY_IDS, technicalSnapshot, type Candle, type StrategyId } from '@tad/core';
import { loadCandles } from './binance';

export const ROBUSTNESS_STRATEGIES=STRATEGY_IDS;
export type RobustnessStrategyId=StrategyId;

function completedAsOf(candles:Candle[],asOf:number){return candles.filter(c=>c.closeTime<=asOf)}
function evaluate(symbol:string,strategy:RobustnessStrategyId,candles:Candle[]){
  return runSignalBacktest({
    candles,maxBarsInTrade:24,costs:{takerFeePct:.05,slippagePct:.02},
    regimeAt:(_i,h)=>classifyRegime(((h.at(-1)?.close??0)/(h[Math.max(0,h.length-49)]?.close??1)-1)*100),
    signalAt:(_i,h)=>{
      const last=h.at(-1); if(!last)return null;
      const base=h[Math.max(0,h.length-49)]?.close??last.close; const change=(last.close/base-1)*100;
      const market:any={symbol,price:last.close,change24hPct:change,quoteVolume24h:h.slice(-288).reduce((a:number,c:Candle)=>a+c.volume*c.close,0),spreadPct:.02,fundingRate:0,regime:classifyRegime(change),ts:last.closeTime};
      market.opportunityScore=opportunityScore(market);
      const h15=completedAsOf(aggregateCandles(h,15*60_000),last.closeTime);
      const h1=completedAsOf(aggregateCandles(h,60*60_000),last.closeTime);
      if(h15.length<20||h1.length<20)return null;
      const f5=technicalSnapshot(symbol,'5m',h), f15=technicalSnapshot(symbol,'15m',h15), f1h=technicalSnapshot(symbol,'1h',h1);
      const mtf=buildMultiTimeframe(symbol,{'5m':f5,'15m':f15,'1h':f1h});
      return strategySignal(strategy,market,mtf,h);
    }
  });
}

export async function computeRobustness(symbol:string,strategy:RobustnessStrategyId,limit=960){
  const candles=await loadCandles(symbol,'5m',Math.min(1200,Math.max(640,limit)));
  const full=evaluate(symbol,strategy,candles);
  const wf=runWalkForward({length:candles.length,trainSize:480,testSize:160,evaluate:(start:number,end:number)=>evaluate(symbol,strategy,candles.slice(start,end))});
  const mc=monteCarloTradeReturns(full.trades.map((t:{netReturnPct:number})=>t.netReturnPct),1000,42);
  const assessment=assessRobustness(full.summary,wf,mc);
  return {symbol,strategy,candles:candles.length,summary:full.summary,walkForward:wf,monteCarlo:mc,assessment,gate:{minimumTrades:8,minWalkForwardPassRatePct:60,maxRuinProbabilityPct:5,maxP95DrawdownPct:20},ts:Date.now()};
}
