import { NextRequest, NextResponse } from 'next/server';
import { evaluatePortfolioRisk, portfolioCorrelationRisk, supervise } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { getPaperWallet, listPositions } from '../../../lib/store';
import { loadCandles, loadConfiguredEvents, loadDerivativesIntelligence, loadMarkets } from '../../../lib/binance';
import { computeRobustness, type RobustnessStrategyId } from '../../../lib/robustness';
import { assessDataHealth } from '../../../lib/data-health';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const symbol=(req.nextUrl.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
  const strategy=(req.nextUrl.searchParams.get('strategy')||'TREND_PULLBACK_V1') as RobustnessStrategyId;
  const [positions,wallet]=await Promise.all([listPositions(token),getPaperWallet(token)]); const open=positions.filter(p=>p.status==='OPEN');
  const unique=[...new Set(open.map(p=>p.symbol))];
  const sets=await Promise.all(unique.map(async s=>({s,c:await loadCandles(s,'5m',120)})));
  const series=Object.fromEntries(sets.map(x=>[x.s,x.c.map(c=>c.close)]));
  const correlation=portfolioCorrelationRisk(open,series,.75);
  const portfolio=evaluatePortfolioRisk({positions:open,accountSize:Math.max(100,wallet.depositedCapital),correlation,maxPortfolioRiskPct:1.2,maxGrossExposureMultiple:4});
  const candles=await loadCandles(symbol,'5m',120); const closes=candles.map(c=>c.close); const last=closes.at(-1)||0; const prior=closes[Math.max(0,closes.length-13)]||last;
  const volatilityPct=prior?Math.abs((last/prior-1)*100):0;
  const markets=await loadMarkets(); const market=markets.find(m=>m.symbol===symbol);
  const [derivatives,eventFeed]=await Promise.all([loadDerivativesIntelligence(symbol),loadConfiguredEvents(symbol)]);
  const dataHealth=assessDataHealth({market,candles5m:candles,derivatives,eventProvider:eventFeed.provider,restPrice:market?.price});
  const intelScore=market?Math.max(0,Math.min(100,(market.opportunityScore||50)*.45+(derivatives.score||50)*.55)):50;
  const eventRisk=eventFeed.events?.some((e:any)=>String(e.impact||'').toUpperCase()==='HIGH')?'HIGH':eventFeed.events?.length?'MEDIUM':eventFeed.provider==='UNCONFIGURED'?'UNKNOWN':'LOW';
  const realized=positions.filter(p=>p.status==='CLOSED').reduce((s,p)=>s+p.realizedPnl,0); const dailyDrawdownPct=Math.max(0,-realized/Math.max(100,wallet.depositedCapital)*100);
  const robustness=await computeRobustness(symbol,strategy);
  const validation={strategyRobust:robustness.assessment.state==='ROBUST',walkForwardPassRatePct:robustness.assessment.walkForwardPassRatePct,ruinProbabilityPct:robustness.assessment.ruinProbabilityPct,p95MaxDrawdownPct:robustness.assessment.p95MaxDrawdownPct};
  const decision=supervise({portfolioRiskApproved:portfolio.approved,portfolioEffectiveRiskPct:portfolio.effectiveRiskPct,maxPairCorrelation:correlation.maxPairCorrelation,dailyDrawdownPct,volatilityPct,...validation,marketIntelligenceScore:intelScore,eventRisk,dataHealthStatus:dataHealth.status,dataHealthScore:dataHealth.score});
  return NextResponse.json({mode:'PAPER_SUPERVISOR_ONLY',symbol,decision,inputs:{portfolio,correlation:{maxPairCorrelation:correlation.maxPairCorrelation,highlyCorrelatedPairs:correlation.highlyCorrelatedPairs},dailyDrawdownPct,volatilityPct,marketIntelligenceScore:intelScore,eventRisk,dataHealth,validation,robustness},policy:{liveExecution:false,canOverrideRiskGate:false,canIncreaseRiskAbovePolicy:false},ts:Date.now()});
}
