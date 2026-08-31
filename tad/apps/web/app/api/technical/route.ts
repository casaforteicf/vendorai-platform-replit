import { NextRequest, NextResponse } from 'next/server';
import { loadTechnical, TRACKED_SYMBOLS } from '../../../lib/binance';
export async function GET(req:NextRequest){
 const symbol=(req.nextUrl.searchParams.get('symbol')??'BTCUSDT').toUpperCase();
 if(!TRACKED_SYMBOLS.includes(symbol)) return NextResponse.json({error:'SYMBOL_NOT_TRACKED'},{status:400});
 try{const out=await loadTechnical(symbol);return NextResponse.json({symbol,...out,source:'BINANCE_PUBLIC_KLINES',ts:Date.now()});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'TECHNICAL_UNAVAILABLE'},{status:502});}
}
