import { aggregateCandles, buildMultiTimeframe, breakoutSignal, classifyRegime, contextLabel, momentumSignal, opportunityScore, runSignalBacktest, technicalSnapshot, trendPullbackSignal, vwapReversionSignal, type Candle } from '@tad/core';

export const REGIME_STRATEGIES=['MOMENTUM_V1','TREND_PULLBACK_V1','VWAP_REVERSION_V1','BREAKOUT_V1'] as const;
export type RegimeStrategyId=typeof REGIME_STRATEGIES[number];

export function runRegimeHistory(symbol:string,strategy:RegimeStrategyId,candles:Candle[]){
  return runSignalBacktest({candles,maxBarsInTrade:24,costs:{takerFeePct:.05,slippagePct:.02},regimeAt:(i:number,h:Candle[])=>{
    const last=h.at(-1);if(!last)return undefined;const base=h[Math.max(0,h.length-49)]?.close??last.close;const change=(last.close/base-1)*100;
    const f5=technicalSnapshot(symbol,'5m',h),c15=aggregateCandles(h,15*60_000),c1h=aggregateCandles(h,60*60_000);
    const f15=technicalSnapshot(symbol,'15m',c15),f1h=technicalSnapshot(symbol,'1h',c1h);const mtf=buildMultiTimeframe(symbol,{'5m':f5,'15m':f15,'1h':f1h});
    return contextLabel(classifyRegime(change),f5.atrPct,mtf.alignment,mtf.alignmentScore);
  },signalAt:(i:number,h:Candle[])=>{
    const last=h.at(-1);if(!last)return null;const base=h[Math.max(0,h.length-49)]?.close??last.close;const change=(last.close/base-1)*100;
    const market:any={symbol,price:last.close,change24hPct:change,quoteVolume24h:h.slice(-288).reduce((a:number,c:Candle)=>a+c.volume*c.close,0),spreadPct:.02,fundingRate:0,regime:classifyRegime(change),ts:last.closeTime};market.opportunityScore=opportunityScore(market);
    const f5=technicalSnapshot(symbol,'5m',h),c15=aggregateCandles(h,15*60_000),c1h=aggregateCandles(h,60*60_000);if(c15.length<20||c1h.length<20)return null;
    const f15=technicalSnapshot(symbol,'15m',c15),f1h=technicalSnapshot(symbol,'1h',c1h),mtf=buildMultiTimeframe(symbol,{'5m':f5,'15m':f15,'1h':f1h});
    if(strategy==='MOMENTUM_V1')return momentumSignal(market);if(strategy==='BREAKOUT_V1')return breakoutSignal(market,mtf,h);if(strategy==='VWAP_REVERSION_V1')return vwapReversionSignal(market,mtf);return trendPullbackSignal(market,mtf);
  }});
}
