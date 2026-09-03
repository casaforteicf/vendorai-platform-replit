import { NextRequest, NextResponse } from 'next/server';
import { bearerToken } from '../../../lib/auth';
import { assessMicrostructureQuality, loadMicrostructure } from '../../../lib/microstructure';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const symbol=(req.nextUrl.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
  try{const snapshot=await loadMicrostructure(symbol);return NextResponse.json({...snapshot,quality:assessMicrostructureQuality(snapshot),qualityBinding:true,directionalBinding:false,liveExecution:false});}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:'MICROSTRUCTURE_ERROR'},{status:502});}
}
