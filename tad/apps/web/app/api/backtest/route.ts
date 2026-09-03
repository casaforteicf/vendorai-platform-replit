import { NextRequest, NextResponse } from 'next/server';
import { aggregateCandles, buildMultiTimeframe, classifyRegime, opportunityScore, performanceByRegime, runManagedSignalBacktest, runSignalBacktest, strategySignal, STRATEGY_CATALOG, STRATEGY_IDS, technicalSnapshot, type StrategyId } from '@tad/core';
import { loadCandles } from '../../../lib/binance';
import { loadHistorical5m } from '../../../lib/historical-candles';

export async function GET(req:NextRequest){
  const symbol=(req.nextUrl.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
  const rawRequested=(req.nextUrl.searchParams.get('strategy')||'TREND_PULLBACK_V2').toUpperCase();
  const normalized=rawRequested==='EMA_RIBBON_TREND_V1'?'EMA_RIBBON_V1':rawRequested;
  if(!(STRATEGY_IDS as readonly string[]).includes(normalized))return NextResponse.json({error:'UNKNOWN_STRATEGY',requested:rawRequested,availableStrategies:STRATEGY_IDS},{status:400});
  const strategy=normalized as StrategyId;
  const days=Math.max(3,Math.min(90,Number(req.nextUrl.searchParams.get('days')||30)));
  const engine=req.nextUrl.searchParams.get('engine')==='legacy'?'LEGACY':'MANAGED_PAPER_V2';
  const candles=days<=5?await loadCandles(symbol,'5m',Math.min(1500,days*24*12)):await loadHistorical5m(symbol,days);
  const params={candles,maxBarsInTrade:72,costs:{takerFeePct:0.05,slippagePct:0.02},regimeAt:(_i:number,h:any[])=>classifyRegime(((h.at(-1)?.close??0)/(h[Math.max(0,h.length-49)]?.close??1)-1)*100),signalAt:(_i:number,h:any[])=>{
    const last=h.at(-1); if(!last) return null; const change=((last.close/(h[Math.max(0,h.length-49)]?.close??last.close))-1)*100;
    const market={symbol,price:last.close,change24hPct:change,quoteVolume24h:h.slice(-288).reduce((a:number,c:any)=>a+c.volume*c.close,0),spreadPct:0.02,fundingRate:0,regime:classifyRegime(change),ts:last.closeTime} as any; market.opportunityScore=opportunityScore(market);
    const c15=aggregateCandles(h,15*60_000),c1h=aggregateCandles(h,60*60_000); if(c15.length<50||c1h.length<25)return null;
    const f5=technicalSnapshot(symbol,'5m',h); const f15=technicalSnapshot(symbol,'15m',c15); const f1h=technicalSnapshot(symbol,'1h',c1h); const mtf=buildMultiTimeframe(symbol,{'5m':f5,'15m':f15,'1h':f1h});
    return strategySignal(strategy,market,mtf,h);
  }};
  const result=engine==='LEGACY'?runSignalBacktest(params):runManagedSignalBacktest(params);
  const summary=result.summary;
  const sampleAssessment=summary.trades<8?'INSUFFICIENT_SAMPLE':summary.netReturnPct>0&&(summary.profitFactor??0)>=1.15?'PROMISING':'NOT_VALIDATED';
  return NextResponse.json({symbol,strategy,catalog:STRATEGY_CATALOG[strategy],availableStrategies:STRATEGY_IDS,engine,days,candles:candles.length,costModel:{takerFeePct:0.05,slippagePct:0.02},exitModel:engine==='MANAGED_PAPER_V2'?'50% TP1 + break-even + trailing + TP2':'legacy all-or-nothing',sampleAssessment,summary,byRegime:performanceByRegime(result.trades),trades:result.trades.slice(-100)});
}
