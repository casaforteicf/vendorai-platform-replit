import { NextResponse } from 'next/server';
import { loadMarkets } from '../../../lib/binance';
export const dynamic='force-dynamic'; export const revalidate=0;
export async function GET(){try{const markets=await loadMarkets();return NextResponse.json({mode:'PAPER',source:'BINANCE_FUTURES_PUBLIC',markets,ts:Date.now()})}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'MARKET_DATA_ERROR',mode:'PAPER'},{status:502})}}
