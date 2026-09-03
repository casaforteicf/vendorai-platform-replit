import { NextRequest, NextResponse } from 'next/server';
import { bearerToken } from '../../../lib/auth';
import { assessMicrostructureDirection, assessMicrostructureQuality, loadMicrostructure } from '../../../lib/microstructure';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const symbol=(req.nextUrl.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
  const sideRaw=(req.nextUrl.searchParams.get('side')||'').toUpperCase();
  const side=sideRaw==='LONG'||sideRaw==='SHORT'?sideRaw:null;
  try{
    const snapshot=await loadMicrostructure(symbol);
    return NextResponse.json({...snapshot,quality:assessMicrostructureQuality(snapshot),direction:side?assessMicrostructureDirection(snapshot,side):null,qualityBinding:true,directionalBinding:false,liveExecution:false});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'MICROSTRUCTURE_ERROR'},{status:502});}
}
