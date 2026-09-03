import { NextRequest, NextResponse } from 'next/server';
import { bearerToken } from '../../../lib/auth';
import { loadConfiguredEvents } from '../../../lib/binance';
import { assessEventRisk } from '../../../lib/event-risk';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const symbol=(req.nextUrl.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
  const feed=await loadConfiguredEvents(symbol);
  const assessment=assessEventRisk(feed.events,feed.provider);
  return NextResponse.json({mode:'PAPER_EVENT_RADAR',symbol,provider:feed.provider,assessment,events:feed.events,liveExecution:false});
}
