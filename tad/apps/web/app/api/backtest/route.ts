import { NextRequest, NextResponse } from 'next/server';
import { aggregateCandles, buildMultiTimeframe, classifyRegime, opportunityScore, performanceByRegime, runSignalBacktest, strategySignal, strategyTimingProfile, STRATEGY_CATALOG, STRATEGY_IDS, technicalSnapshot, type StrategyId } from '@tad/core';
import { loadCandles } from '../../../lib/binance';

export async function GET(req:NextRequest){
  const symbol=(req.nextUrl.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
  const requestedRaw=(req.nextUrl.searchParams.get('strategy')||'TREND_PULLBACK_V1').toUpperCase();
  const requested=(requestedRaw==='EMA_RIBBON_TREND_V1'?'EMA_RIBBON_V1':requestedRaw) as StrategyId;
  if(!(STRATEGY_IDS as readonly string[]).includes(requested))return NextResponse.json({error:'STRATEGY_NOT_FOUND',requested:requestedRaw,availableStrategies:STRATEGY_IDS},{status:400});
  const strategy=requested;
  const limit=Math.min(1000,Math.max(200,Number(req.nextUrl.searchParams.get('limit')||700)));
  const candles=await loadCandles(symbol,'5m',limit);
  const result=runSignalBacktest({candles,maxBarsInTrade:24,costs:{takerFeePct:0.05,slippagePct:0.02},regimeAt:(_i,h)=>classifyRegime(((h.at(-1)?.close??0)/(h[Math.max(0,h.length-49)]?.close??1)-1)*100),signalAt:(_i,h)=>{
    const last=h.at(-1); if(!last) return null; const change=((last.close/(h[Math.max(0,h.length-49)]?.close??last.close))-1)*100;
    const market={symbol,price:last.close,change24hPct:change,quoteVolume24h:h.slice(-288).reduce((a,c)=>a+c.volume*c.close,0),spreadPct:0.02,fundingRate:0,regime:classifyRegime(change),ts:last.closeTime} as any; market.opportunityScore=opportunityScore(market);
    const c15=aggregateCandles(h,15*60_000),c1h=aggregateCandles(h,60*60_000); if(c15.length<20||c1h.length<20)return null; const f5=technicalSnapshot(symbol,'5m',h); const f15=technicalSnapshot(symbol,'15m',c15); const f1h=technicalSnapshot(symbol,'1h',c1h); const mtf=buildMultiTimeframe(symbol,{'5m':f5,'15m':f15,'1h':f1h});
    return strategySignal(strategy,market,mtf,h);
  }});
  return NextResponse.json({symbol,strategy,catalog:STRATEGY_CATALOG[strategy],timingProfile:strategyTimingProfile(strategy),availableStrategies:STRATEGY_IDS,candles:candles.length,costModel:{takerFeePct:0.05,slippagePct:0.02},timingCoverageNote:'Backtest 5m valida contexto/confirmacoes disponiveis. Timing 1m/30s/15s deve ser confirmado em PAPER em tempo real.',summary:result.summary,byRegime:performanceByRegime(result.trades),trades:result.trades.slice(-60)});
}
