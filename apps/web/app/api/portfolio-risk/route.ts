import { NextRequest, NextResponse } from 'next/server';
import { evaluatePortfolioRisk, portfolioCorrelationRisk } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { getPaperWallet, listPositions } from '../../../lib/store';
import { loadCandles } from '../../../lib/binance';
export async function GET(req:NextRequest){
 const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
 const [positions,wallet]=await Promise.all([listPositions(token),getPaperWallet(token)]); const open=positions.filter(p=>p.status==='OPEN');
 const unique=[...new Set(open.map(p=>p.symbol))]; const sets=await Promise.all(unique.map(async s=>({s,c:await loadCandles(s,'5m',120)})));
 const series=Object.fromEntries(sets.map(x=>[x.s,x.c.map(c=>c.close)])); const correlation=portfolioCorrelationRisk(open,series,.75);
 const risk=evaluatePortfolioRisk({positions:open,accountSize:Math.max(100,wallet.depositedCapital),correlation,maxPortfolioRiskPct:1.2,maxGrossExposureMultiple:4});
 return NextResponse.json({mode:'PAPER',accountSize:wallet.depositedCapital,correlation,risk,openPositions:open.map(p=>({symbol:p.symbol,side:p.side,riskPct:p.riskPct,notional:p.notional})),ts:Date.now()});
}
