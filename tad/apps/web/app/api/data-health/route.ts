import { NextRequest, NextResponse } from 'next/server';
import { loadCandles, loadConfiguredEvents, loadDerivativesIntelligence, loadMarkets } from '../../../lib/binance';
import { assessDataHealth } from '../../../lib/data-health';

export async function GET(req:NextRequest){
  const symbol=(req.nextUrl.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
  try{
    const [markets,candles,derivatives,eventFeed]=await Promise.all([loadMarkets(),loadCandles(symbol,'5m',180),loadDerivativesIntelligence(symbol),loadConfiguredEvents(symbol)]);
    const market=markets.find(m=>m.symbol===symbol);
    const assessment=assessDataHealth({market,candles5m:candles,derivatives,eventProvider:eventFeed.provider,restPrice:market?.price});
    return NextResponse.json({ok:assessment.status!=='CRITICAL',symbol,assessment,market:{price:market?.price,ts:market?.ts},derivatives:{score:derivatives.score,ts:derivatives.ts},eventProvider:eventFeed.provider,policy:{liveExecution:false,criticalStopsNewEntries:true,degradedForcesObserve:true},ts:Date.now()});
  }catch(error){
    const assessment=assessDataHealth({criticalEndpointFailure:true});
    return NextResponse.json({ok:false,symbol,assessment,error:error instanceof Error?error.message:'DATA_HEALTH_CHECK_FAILED',policy:{liveExecution:false,criticalStopsNewEntries:true,degradedForcesObserve:true},ts:Date.now()},{status:503});
  }
}
