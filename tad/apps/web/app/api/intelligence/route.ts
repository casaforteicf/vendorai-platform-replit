import { NextRequest, NextResponse } from 'next/server';
import { combineIntelligence } from '@tad/core';
import { loadConfiguredEvents, loadDerivativesIntelligence, loadMarkets } from '../../../lib/binance';

export async function GET(req:NextRequest){
  const symbol=(req.nextUrl.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
  const markets=await loadMarkets(); const market=markets.find(m=>m.symbol===symbol);
  if(!market)return NextResponse.json({error:'SYMBOL_NOT_TRACKED'},{status:404});
  const [derivatives,eventFeed]=await Promise.all([loadDerivativesIntelligence(symbol),loadConfiguredEvents(symbol)]);
  return NextResponse.json(combineIntelligence(market,derivatives,eventFeed.events,eventFeed.provider));
}
