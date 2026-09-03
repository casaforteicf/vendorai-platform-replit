import { NextRequest, NextResponse } from 'next/server';
import { bearerToken } from '../../../lib/auth';
import { loadMicrostructure } from '../../../lib/microstructure';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const symbol=(req.nextUrl.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
  try{return NextResponse.json({...await loadMicrostructure(symbol),binding:false,liveExecution:false});}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:'MICROSTRUCTURE_ERROR'},{status:502});}
}
