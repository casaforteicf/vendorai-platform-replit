import { NextRequest, NextResponse } from 'next/server';
import { assessShadowReadiness, evaluateStrategyLifecycle, shadowQualityScore, simulateShadowOrder, strategyMetrics, buildConsensus, evaluateRisk, momentumSignal } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { listPositions, listShadowExecutions } from '../../../lib/store';
import { loadMarkets } from '../../../lib/binance';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const symbol=(req.nextUrl.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
  const [positions,persisted]=await Promise.all([listPositions(token),listShadowExecutions(token,100)]); const metrics=strategyMetrics(positions); const lifecycles=metrics.map(m=>evaluateStrategyLifecycle(m,positions));
  const closed=positions.filter(p=>p.status==='CLOSED').length; const readiness=assessShadowReadiness(lifecycles,closed,true);
  const markets=await loadMarkets(); const market=markets.find((x:any)=>x.symbol===symbol) ?? markets[0];
  if(!market)return NextResponse.json({error:'MARKET_UNAVAILABLE'},{status:503});
  const signal=momentumSignal(market);
  let preview=null;
  if(signal){
    const decision=buildConsensus(signal,{'Vision AI':.72,'Quant AI':.74,'Flow AI':.70,'Smart Money AI':.68,'News AI':.60,'Macro AI':.65,'Risk AI':.72});
    const policy={maxRiskPerTradePct:.4,maxDailyLossPct:2,maxLeverage:3,maxOpenPositions:3,maxSpreadPct:.08,minConsensus:.70};
    const risk=evaluateRisk(decision,market,policy,{openPositions:positions.filter(p=>p.status==='OPEN').length,dailyLossPct:0,requestedLeverage:2});
    const order=simulateShadowOrder(decision,market,{latencyMs:180,feeBpsPerSide:2});
    preview={order,qualityScore:shadowQualityScore(order),riskApproved:risk.approved};
  }
  return NextResponse.json({mode:'SHADOW_OBSERVATION_ONLY',state:readiness.ready?'READY':'LOCKED',readiness,preview,persisted,summary:{samples:persisted.length,fills:persisted.filter((x:any)=>x.filled).length,closedComparisons:persisted.filter((x:any)=>x.closedAt).length,avgDivergencePct:persisted.filter((x:any)=>x.divergencePct!=null).length?persisted.filter((x:any)=>x.divergencePct!=null).reduce((a:number,x:any)=>a+Number(x.divergencePct),0)/persisted.filter((x:any)=>x.divergencePct!=null).length:null},liveExecution:false,exchangeOrderSent:false,ts:Date.now()});
}
