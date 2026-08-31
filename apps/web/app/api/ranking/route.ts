import { NextRequest, NextResponse } from 'next/server';
import { adaptiveScore, normalizeAllocation, aggregateCandles, buildMultiTimeframe, breakoutSignal, classifyRegime, momentumSignal, opportunityScore, runSignalBacktest, technicalSnapshot, trendPullbackSignal, vwapReversionSignal } from '@tad/core';
import { loadCandles, TRACKED_SYMBOLS } from '../../../lib/binance';

const STRATEGIES=['MOMENTUM_V1','TREND_PULLBACK_V1','VWAP_REVERSION_V1','BREAKOUT_V1'] as const;
type StrategyId=typeof STRATEGIES[number];

function runFor(symbol:string,strategy:StrategyId,candles:any[]){
  return runSignalBacktest({candles,maxBarsInTrade:24,costs:{takerFeePct:.05,slippagePct:.02},regimeAt:(i,h)=>classifyRegime(((h.at(-1)?.close??0)/(h[Math.max(0,h.length-49)]?.close??1)-1)*100),signalAt:(i,h)=>{
    const last=h.at(-1); if(!last)return null; const base=h[Math.max(0,h.length-49)]?.close??last.close; const change=(last.close/base-1)*100;
    const market:any={symbol,price:last.close,change24hPct:change,quoteVolume24h:h.slice(-288).reduce((a,c)=>a+c.volume*c.close,0),spreadPct:.02,fundingRate:0,regime:classifyRegime(change),ts:last.closeTime}; market.opportunityScore=opportunityScore(market);
    const c15=aggregateCandles(h,15*60_000),c1h=aggregateCandles(h,60*60_000); if(c15.length<20||c1h.length<20)return null; const f5=technicalSnapshot(symbol,'5m',h),f15=technicalSnapshot(symbol,'15m',c15),f1h=technicalSnapshot(symbol,'1h',c1h); const mtf=buildMultiTimeframe(symbol,{'5m':f5,'15m':f15,'1h':f1h});
    if(strategy==='MOMENTUM_V1')return momentumSignal(market); if(strategy==='BREAKOUT_V1')return breakoutSignal(market,mtf,h); if(strategy==='VWAP_REVERSION_V1')return vwapReversionSignal(market,mtf); return trendPullbackSignal(market,mtf);
  }});
}

export async function GET(req:NextRequest){
  const requested=(req.nextUrl.searchParams.get('symbols')||TRACKED_SYMBOLS.join(',')).split(',').map(x=>x.trim().toUpperCase()).filter(x=>TRACKED_SYMBOLS.includes(x));
  const symbols=requested.slice(0,8); const limit=Math.min(1000,Math.max(300,Number(req.nextUrl.searchParams.get('limit')||700)));
  const candleSets=await Promise.all(symbols.map(async symbol=>({symbol,candles:await loadCandles(symbol,'5m',limit)})));
  const raw:any[]=[];
  for(const {symbol,candles} of candleSets){for(const strategyId of STRATEGIES){const result=runFor(symbol,strategyId,candles); const s=result.summary; const score=adaptiveScore({winRatePct:s.winRatePct,profitFactor:s.profitFactor,netReturnPct:s.netReturnPct,maxDrawdownPct:s.maxDrawdownPct,trades:s.trades}); raw.push({symbol,strategyId,score,sampleSize:s.trades,winRatePct:s.winRatePct,profitFactor:s.profitFactor,netReturnPct:s.netReturnPct,maxDrawdownPct:s.maxDrawdownPct,eligible:s.trades>=8&&s.netReturnPct>0&&s.maxDrawdownPct<12});}}
  const rows=normalizeAllocation(raw).sort((a,b)=>b.score-a.score);
  return NextResponse.json({mode:'HISTORICAL_ADAPTIVE_PAPER',symbols,strategies:STRATEGIES,costModel:{takerFeePct:.05,slippagePct:.02},minimumSample:8,rows,top:rows.filter(r=>r.eligible).slice(0,8),ts:Date.now()});
}
