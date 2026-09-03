import { NextRequest, NextResponse } from 'next/server';
import { bearerToken } from '../../../lib/auth';
import { TRACKED_SYMBOLS, loadConfiguredEvents } from '../../../lib/binance';
import { assessEventRisk } from '../../../lib/event-risk';

export const dynamic='force-dynamic';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const requested=req.nextUrl.searchParams.get('symbols');
  const symbols=(requested?requested.split(','):TRACKED_SYMBOLS).map(x=>x.trim().toUpperCase()).filter(Boolean).slice(0,30);
  const now=Date.now();
  const rows=await Promise.all(symbols.map(async symbol=>{
    const feed=await loadConfiguredEvents(symbol);
    const assessment=assessEventRisk(feed.events as any[],feed.provider,now);
    return {symbol,provider:feed.provider,assessment,events:feed.events.slice(0,12)};
  }));
  const blocking=rows.filter(r=>!r.assessment.approved).length;
  const reduced=rows.filter(r=>r.assessment.approved&&r.assessment.riskMultiplier<1).length;
  return NextResponse.json({mode:'PAPER_EVENT_RADAR',now,summary:{symbols:rows.length,blocking,reduced,clear:rows.length-blocking-reduced},rows,liveExecution:false});
}
