import { NextRequest, NextResponse } from 'next/server';
import { bearerToken } from '../../../lib/auth';
import { scanFuturesUniverse } from '../../../lib/market-scanner';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const limit=Math.max(10,Math.min(100,Number(req.nextUrl.searchParams.get('limit')||60)));
  try{
    const rows=await scanFuturesUniverse({limit});
    const eligible=rows.filter(r=>r.eligible);
    return NextResponse.json({mode:'PAPER_MARKET_SCANNER',limit,total:rows.length,eligible:eligible.length,excluded:rows.length-eligible.length,rows,liveExecution:false});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'MARKET_SCANNER_FAILED',liveExecution:false},{status:503});
  }
}
