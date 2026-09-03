import { NextRequest, NextResponse } from 'next/server';
import { bearerToken } from '../../../lib/auth';
import { scanFuturesUniverse } from '../../../lib/market-scanner';

export const dynamic='force-dynamic';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  try{
    const rows=await scanFuturesUniverse({limit:80});
    const eligible=rows.filter(r=>r.eligible);
    return NextResponse.json({mode:'PAPER_SCANNER',liveExecution:false,universeSize:rows.length,eligibleCount:eligible.length,filters:{quoteAsset:'USDT',contractType:'PERPETUAL',status:'TRADING',minQuoteVolume:25_000_000,maxSpreadPct:.12,maxAbsFunding:.0015,minIntradayRangePct:.6,maxIntradayRangePct:35},rows});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'MARKET_SCANNER_ERROR'},{status:500});}
}
