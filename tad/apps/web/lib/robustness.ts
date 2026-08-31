import { aggregateCandles, assessRobustness, breakoutSignal, buildMultiTimeframe, classifyRegime, momentumSignal, monteCarloTradeReturns, opportunityScore, runSignalBacktest, runWalkForward, technicalSnapshot, trendPullbackSignal, vwapReversionSignal, type Candle } from '@tad/core';
import { loadCandles } from './binance';

export const ROBUSTNESS_STRATEGIES=['MOMENTUM_V1','TREND_PULLBACK_V1','VWAP_REVERSION_V1','BREAKOUT_V1'] as const;
export type RobustnessStrategyId=typeof ROBUSTNESS_STRATEGIES[number];

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
      const f5=technicalSnapshot(symbol,'5m',h), f15=technicalSnapshot(symbol,'15m',h15), f1h=technicalSnapshot(symbol,'1h',h1);
      const mtf=buildMultiTimeframe(symbol,{'5m':f5,'15m':f15,'1h':f1h});
      if(strategy==='MOMENTUM_V1')return momentumSignal(market);
      if(strategy==='BREAKOUT_V1')return breakoutSignal(market,mtf,h);
      if(strategy==='VWAP_REVERSION_V1')return vwapReversionSignal(market,mtf);
      return trendPullbackSignal(market,mtf);
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
