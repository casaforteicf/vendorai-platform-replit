import { NextRequest,NextResponse } from 'next/server';
import { classifyRegime,classifyRegimeContext,evaluateRegimeGate } from '@tad/core';
import { loadCandles,loadTechnical } from '../../../lib/binance';
import { REGIME_STRATEGIES,runRegimeHistory } from '../../../lib/regime-history';

export async function GET(req:NextRequest){
  const symbol=(req.nextUrl.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
  const [technical,candles]=await Promise.all([loadTechnical(symbol),loadCandles(symbol,'5m',900)]);
  const last=candles.at(-1);if(!last)return NextResponse.json({error:'NO_MARKET_DATA'},{status:503});
  const base=candles[Math.max(0,candles.length-49)]?.close??last.close;const change=(last.close/base-1)*100;
  const market:any={symbol,price:last.close,change24hPct:change,spreadPct:.02,fundingRate:0,regime:classifyRegime(change),ts:last.closeTime};
  const context=classifyRegimeContext(market,technical.mtf,market.fundingRate??0);
  const rows=REGIME_STRATEGIES.map(strategyId=>{const result=runRegimeHistory(symbol,strategyId,candles);const gate=evaluateRegimeGate(result.trades,context);return {strategyId,gate,summary:result.summary};}).sort((a,b)=>b.gate.riskMultiplier-a.gate.riskMultiplier||b.gate.evidence.netReturnPct-a.gate.evidence.netReturnPct);
  return NextResponse.json({mode:'REGIME_INTELLIGENCE_PAPER_SHADOW',symbol,context,rows,best:rows[0]??null,policy:{exactContextMinSample:5,directionFallbackMinSample:8,neverIncreaseRisk:true,liveEnabled:false},ts:Date.now()});
}
