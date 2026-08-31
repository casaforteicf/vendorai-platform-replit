import { NextRequest, NextResponse } from 'next/server';
import { buildExecutionProfile, classifyRegimeContext, evaluatePortfolioIntelligence, evaluatePortfolioRisk, evaluateRegimeGate, evaluateRiskBudget, evaluateStrategyLifecycle, executionEdgeGate, portfolioCorrelationRisk, strategyMetrics, supervise, type StrategyMetric } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { getPaperWallet, listPositions } from '../../../lib/store';
import { loadCandles, loadConfiguredEvents, loadDerivativesIntelligence, loadMarkets, loadTechnical } from '../../../lib/binance';
import { runRegimeHistory } from '../../../lib/regime-history';
import { computeRobustness, type RobustnessStrategyId } from '../../../lib/robustness';
import { assessDataHealth } from '../../../lib/data-health';

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const symbol=(req.nextUrl.searchParams.get('symbol')||'BTCUSDT').toUpperCase();
  const strategyId=req.nextUrl.searchParams.get('strategy')||'TREND_PULLBACK_V1';
  const [positions,wallet]=await Promise.all([listPositions(token),getPaperWallet(token)]); const open=positions.filter(p=>p.status==='OPEN'); const metrics=strategyMetrics(positions);
  const metric:StrategyMetric=metrics.find(m=>m.strategyId===strategyId)??{strategyId,trades:0,wins:0,losses:0,winRatePct:0,realizedPnl:0,avgPnl:0,profitFactor:null};
  const lifecycle=evaluateStrategyLifecycle(metric,positions);
  const robustness=await computeRobustness(symbol,strategyId as RobustnessStrategyId);
  const [markets,technical,derivatives,eventFeed,regimeCandles]=await Promise.all([loadMarkets(),loadTechnical(symbol),loadDerivativesIntelligence(symbol),loadConfiguredEvents(symbol),loadCandles(symbol,'5m',900)]);
  const market=markets.find(m=>m.symbol===symbol); if(!market)return NextResponse.json({error:'MARKET_NOT_FOUND'},{status:404});
  const regimeContext=classifyRegimeContext(market,technical.mtf,market.fundingRate??0); const regimeHistory=runRegimeHistory(symbol,strategyId as any,regimeCandles); const regimeGate=evaluateRegimeGate(regimeHistory.trades,regimeContext);
  const symbols=[...new Set(open.map(p=>p.symbol))]; const sets=await Promise.all(symbols.map(async s=>({s,c:await loadCandles(s,'5m',120)}))); const series=Object.fromEntries(sets.map(x=>[x.s,x.c.map(c=>c.close)]));
  const correlation=portfolioCorrelationRisk(open,series,.75); const portfolioRisk=evaluatePortfolioRisk({positions:open,accountSize:Math.max(100,wallet.depositedCapital),correlation,maxPortfolioRiskPct:1.2,maxGrossExposureMultiple:4}); const portfolioIntel=evaluatePortfolioIntelligence({positions:open,priceSeries:series,correlationThreshold:.72,maxClusterRiskPct:.8});
  const realized=positions.filter(p=>p.status==='CLOSED').reduce((s,p)=>s+p.realizedPnl,0); const dailyDrawdownPct=Math.max(0,-realized/Math.max(100,wallet.depositedCapital)*100);
  const eventRisk=eventFeed.events.some((e:any)=>String(e.impact||'').toUpperCase()==='HIGH')?'HIGH':eventFeed.events.length?'MEDIUM':eventFeed.provider==='UNCONFIGURED'?'UNKNOWN':'LOW';
  const intelScore=Math.max(0,Math.min(100,(market.opportunityScore||50)*.45+(derivatives.score||50)*.55));
  const dataHealth=assessDataHealth({market,candles5m:technical.candles5m,derivatives,eventProvider:eventFeed.provider,restPrice:market.price});
  const supervisor=supervise({portfolioRiskApproved:portfolioRisk.approved,portfolioEffectiveRiskPct:portfolioRisk.effectiveRiskPct,maxPairCorrelation:correlation.maxPairCorrelation,dailyDrawdownPct,volatilityPct:technical.mtf.frames['5m']?.atrPct??0,strategyRobust:robustness.assessment.state==='ROBUST',walkForwardPassRatePct:robustness.assessment.walkForwardPassRatePct,ruinProbabilityPct:robustness.assessment.ruinProbabilityPct,p95MaxDrawdownPct:robustness.assessment.p95MaxDrawdownPct,marketIntelligenceScore:intelScore,eventRisk,dataHealthStatus:dataHealth.status,dataHealthScore:dataHealth.score});
  const executionProfile=buildExecutionProfile([],symbol,strategyId,'UNKNOWN',new Date().getUTCHours()); const executionGate=executionEdgeGate(executionProfile,{expectedEdgeBps:12});
  const budget=evaluateRiskBudget({baseRiskPct:.4,layers:[
    {name:'TRADE_RISK',approved:true,multiplier:1,binding:true,reason:'POLICY_MAX_0.40%',source:'POLICY'},
    {name:'DATA_INTEGRITY',approved:dataHealth.status==='HEALTHY',multiplier:dataHealth.status==='HEALTHY'?1:0,binding:true,reason:dataHealth.reasons.join('|')||'DATA_HEALTHY',score:dataHealth.score,source:'DATA_HEALTH_GATE'},
    {name:'ROBUSTNESS',approved:robustness.assessment.approved,multiplier:robustness.assessment.riskMultiplier,binding:true,reason:robustness.assessment.reasons.join('|'),score:robustness.assessment.score,source:'WALK_FORWARD_MONTE_CARLO'},
    {name:'LIFECYCLE',approved:lifecycle.capitalMultiplier>0,multiplier:lifecycle.capitalMultiplier,binding:true,reason:lifecycle.state,score:lifecycle.score,source:'PAPER_HISTORY'},
    {name:'REGIME',approved:regimeGate.approved,multiplier:regimeGate.riskMultiplier,binding:true,reason:regimeGate.reason,source:'REGIME_HISTORY'},
    {name:'PORTFOLIO_INTELLIGENCE',approved:portfolioRisk.approved&&portfolioIntel.approved,multiplier:Math.min(portfolioIntel.riskMultiplier,portfolioRisk.approved?1:0),binding:true,reason:[...portfolioRisk.reasons,...portfolioIntel.reasons].join('|')||'PORTFOLIO_OK',source:'CURRENT_PORTFOLIO'},
    {name:'SUPERVISOR',approved:supervisor.riskMultiplier>0,multiplier:supervisor.riskMultiplier,binding:true,reason:supervisor.state,score:supervisor.score,source:'SAFETY_SUPERVISOR'},
    {name:'EXECUTION_INTELLIGENCE',approved:executionGate.approved,multiplier:executionGate.approved?1:0,binding:false,reason:executionGate.reason,source:'SHADOW_ONLY'}
  ]});
  return NextResponse.json({mode:'RISK_BUDGET_PAPER',symbol,strategyId,budget,dataHealth,robustness,lifecycle,regime:{context:regimeContext,gate:regimeGate},portfolio:{risk:portfolioRisk,intelligence:portfolioIntel},supervisor,execution:{profile:executionProfile,gate:executionGate,binding:false},policy:{liveExecution:false,combination:'CONSTRAINT_ENVELOPE',canIncreaseRisk:false},ts:Date.now()});
}
