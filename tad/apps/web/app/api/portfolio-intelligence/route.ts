import { NextRequest, NextResponse } from 'next/server';
import { evaluatePortfolioIntelligence } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { listPositions } from '../../../lib/store';
import { loadCandles } from '../../../lib/binance';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const positions=await listPositions(token); const open=positions.filter(p=>p.status==='OPEN');
  const symbols=[...new Set(open.map(p=>p.symbol))];
  const datasets=await Promise.all(symbols.map(async symbol=>({symbol,candles:await loadCandles(symbol,'5m',240)})));
  const priceSeries=Object.fromEntries(datasets.map(x=>[x.symbol,x.candles.map(c=>c.close)]));
  const intelligence=evaluatePortfolioIntelligence({positions:open,priceSeries,correlationThreshold:.72,maxClusterRiskPct:.8});
  return NextResponse.json({mode:'PAPER_PORTFOLIO_INTELLIGENCE',...intelligence,openPositions:open.map(p=>({symbol:p.symbol,strategyId:p.strategyId,side:p.side,riskPct:p.riskPct})),ts:Date.now()});
}
