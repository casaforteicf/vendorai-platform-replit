import { NextRequest, NextResponse } from 'next/server';
import { buildConsensus, combineIntelligence, evaluateRisk, evaluatePortfolioRisk, evaluatePortfolioIntelligence, classifyRegimeContext, evaluateRegimeGate, evaluateRiskBudget, evaluateStrategyLifecycle, supervise, executePaper, getOperatingProfile, metricPrior, portfolioCorrelationRisk, strategyCandidates, strategyMetrics, summarizePortfolio, simulateShadowOrder, shadowQualityScore, type MarketSnapshot, type StrategySignal, type StrategyMetric, type TadMarketId } from '@tad/core';
import { bearerToken } from '../../../lib/auth';
import { appendAudit, findPositionByAutopilotKey, getPaperWallet, listAudit, listPositions, savePosition, saveShadowExecution, storageMode } from '../../../lib/store';
import { getOperatingSettings } from '../../../lib/operating-settings';
import { loadCandles, loadConfiguredEvents, loadDerivativesIntelligence, loadTechnical, loadMarkets } from '../../../lib/binance';
import { runRegimeHistory } from '../../../lib/regime-history';
import { computeRobustness, type RobustnessStrategyId } from '../../../lib/robustness';
import { assessDataHealth } from '../../../lib/data-health';
import { contextualLearning } from '../../../lib/context-learning';

function agentScores(m:MarketSnapshot,techScore:number,intel:any){
  const score=(m.opportunityScore??50)/100;const base=Math.max(.5,Math.min(.96,.53+score*.28+techScore*.16));
  const news=intel.eventProvider==='CONFIGURED'&&intel.events.length?Math.max(.45,Math.min(.95,.5+(intel.combinedScore-50)/100)):.66;
  const macro=Math.max(.48,Math.min(.94,.55+(intel.derivatives.score-50)/100));
  return {'Vision AI':base,'Quant AI':Math.max(.5,base+.01),'Flow AI':Math.max(.5,base-.01+(intel.derivatives.takerBuySellRatio?Math.min(.06,Math.abs(intel.derivatives.takerBuySellRatio-1)*.2):0)),'Smart Money AI':Math.max(.5,base),'News AI':news,'Macro AI':macro,'Risk AI':Math.max(.5,.93-m.spreadPct*2-(intel.derivatives.adlRisk==='high'?.12:0))}
}

export async function POST(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const body=await req.json() as {market?:MarketSnapshot;marketId?:TadMarketId;leverage?:number;autopilotKey?:string};
  if(!body.market)return NextResponse.json({error:'MARKET_REQUIRED'},{status:400});
  const operatingSettings=await getOperatingSettings(token);
  const profile=getOperatingProfile(operatingSettings.profile);
  const policy=profile.riskPolicy;
  const marketId=body.marketId??operatingSettings.primaryMarket??'CRYPTO';
  if(marketId!=='CRYPTO')return NextResponse.json({approved:false,reason:'MARKET_FEED_NOT_CONNECTED',marketId,profile:profile.id,mode:'PAPER',liveTrading:false},{status:409});
  if(body.autopilotKey){const existing=await findPositionByAutopilotKey(token,body.autopilotKey);if(existing)return NextResponse.json({approved:true,idempotentReplay:true,mode:'PAPER',profile:profile.id,execution:existing,storage:storageMode()});}
  const wallet=await getPaperWallet(token); const accountSize=wallet.depositedCapital; if(accountSize<100)return NextResponse.json({approved:false,reason:'PAPER_WALLET_EMPTY',mode:'PAPER',profile:profile.id,requiredMinimum:100});
  const all=await listPositions(token); const summary=summarizePortfolio(all,accountSize); const open=all.filter(p=>p.status==='OPEN');
  if(open.some(p=>p.symbol===body.market!.symbol)){await appendAudit(token,'PAPER_BLOCKED_SYMBOL_ALREADY_OPEN',{symbol:body.market.symbol,autopilotKey:body.autopilotKey??null,profile:profile.id});return NextResponse.json({approved:false,reason:'SYMBOL_ALREADY_OPEN',mode:'PAPER',profile:profile.id,storage:storageMode()});}
  const metrics=strategyMetrics(all);
  const dailyLossPct=Math.max(0,(-Math.min(0,summary.realizedPnl+summary.unrealizedPnl)/accountSize)*100);
  const requestedLeverage=Math.max(1,Math.min(policy.maxLeverage,body.leverage??Math.min(2,policy.maxLeverage)));
  const [technical,derivatives,eventFeed,freshMarkets]=await Promise.all([loadTechnical(body.market.symbol),loadDerivativesIntelligence(body.market.symbol),loadConfiguredEvents(body.market.symbol),loadMarkets()]);
  const freshMarket=freshMarkets.find(m=>m.symbol===body.market!.symbol);
  const dataHealth=assessDataHealth({market:body.market,candles5m:technical.candles5m,derivatives,eventProvider:eventFeed.provider,restPrice:freshMarket?.price});
  const intelligence=combineIntelligence(body.market,derivatives,eventFeed.events,eventFeed.provider);
  const currentRegimeContext=classifyRegimeContext(body.market,technical.mtf,body.market.fundingRate??0);
  const candidates:(StrategySignal|null)[]=strategyCandidates(body.market,technical.mtf,technical.candles5m);
  const governedAutopilot=Boolean(body.autopilotKey);
  const contextualAudit=governedAutopilot?await listAudit(token,500):[];
  const valid=candidates.filter((x):x is StrategySignal=>Boolean(x)).map(s=>{
    const strategyMetric:StrategyMetric=metrics.find(m=>m.strategyId===s.strategyId)??{strategyId:s.strategyId,trades:0,wins:0,losses:0,winRatePct:0,realizedPnl:0,avgPnl:0,profitFactor:null};
    const lifecycle=evaluateStrategyLifecycle(strategyMetric,all);
    const prior=metricPrior(strategyMetric);
    const biasMatch=(intelligence.combinedBias==='BULLISH'&&s.side==='LONG')||(intelligence.combinedBias==='BEARISH'&&s.side==='SHORT')?6:intelligence.combinedBias==='NEUTRAL'?0:-4;
    const governanceAdjustment=governedAutopilot?(lifecycle.score-50)*.2:0;
    const contextLearning=governedAutopilot?contextualLearning(all,contextualAudit,s,currentRegimeContext):{sampleSize:0,matchedSamples:0,adjustment:0,winRatePct:null,avgPnl:null,confidence:'NONE' as const,dimensions:{symbol:false,side:false,hourBucket:false,regime:false}};
    const adaptiveScore=s.confidence*100+prior+biasMatch+governanceAdjustment+contextLearning.adjustment;
    return {signal:s,adaptiveScore,prior,biasMatch,governanceAdjustment,contextLearning,lifecycle};
  }).filter(v=>!governedAutopilot||v.lifecycle.capitalMultiplier>0).sort((a,b)=>b.adaptiveScore-a.adaptiveScore);
  if(!valid.length){await appendAudit(token,'NO_SIGNAL',{market:body.market,technical:technical.mtf,intelligence,profile:profile.id,governedAutopilot});return NextResponse.json({approved:false,reason:governedAutopilot?'NO_GOVERNANCE_ELIGIBLE_STRATEGY':'NO_VALID_STRATEGY_SIGNAL',technical:technical.mtf,intelligence,profile:profile.id,storage:storageMode()})}
  const signal=valid[0].signal; const decision=buildConsensus(signal,agentScores(body.market,technical.mtf.alignmentScore/100,intelligence));
  const strategyMetric:StrategyMetric=metrics.find(m=>m.strategyId===signal.strategyId)??{strategyId:signal.strategyId,trades:0,wins:0,losses:0,winRatePct:0,realizedPnl:0,avgPnl:0,profitFactor:null};
  const lifecycle=valid[0].lifecycle;
  const regimeContext=currentRegimeContext;
  const regimeCandles=await loadCandles(body.market.symbol,'5m',900);
  const regimeHistory=runRegimeHistory(body.market.symbol,signal.strategyId as any,regimeCandles);
  const regimeGate=evaluateRegimeGate(regimeHistory.trades,regimeContext);
  const robustness=await computeRobustness(body.market.symbol,signal.strategyId as RobustnessStrategyId);
  const symbols=[...new Set([...open.map(p=>p.symbol),body.market.symbol])];
  const seriesEntries=await Promise.all(symbols.map(async symbol=>{const c=await loadCandles(symbol,'5m',120);return [symbol,c.map(x=>x.close)] as const}));
  const priceSeries=Object.fromEntries(seriesEntries);
  const correlation=portfolioCorrelationRisk(open,priceSeries,.75);
  const portfolioRisk=evaluatePortfolioRisk({positions:open,accountSize,correlation,maxPortfolioRiskPct:profile.maxPortfolioRiskPct,maxGrossExposureMultiple:profile.maxGrossExposureMultiple});
  const risk=evaluateRisk(decision,body.market,policy,{dailyLossPct,openPositions:open.length,requestedLeverage});
  const baseRiskPct=risk.approved?risk.effectiveRiskPct:0;
  let portfolioIntelligence=evaluatePortfolioIntelligence({positions:open,priceSeries,correlationThreshold:.72,maxClusterRiskPct:profile.maxClusterRiskPct});
  if(risk.approved){
    const provisional=executePaper(decision,{...risk,effectiveRiskPct:baseRiskPct},{accountSize,leverage:requestedLeverage});
    portfolioIntelligence=evaluatePortfolioIntelligence({positions:[...open,provisional],priceSeries,correlationThreshold:.72,maxClusterRiskPct:profile.maxClusterRiskPct});
  }
  const supervisor=supervise({
    portfolioRiskApproved:portfolioRisk.approved,
    portfolioEffectiveRiskPct:portfolioRisk.effectiveRiskPct,
    maxPairCorrelation:correlation.maxPairCorrelation,
    dailyDrawdownPct:dailyLossPct,
    volatilityPct:technical.mtf.frames['5m']?.atrPct??0,
    strategyRobust:robustness.assessment.state==='ROBUST',
    walkForwardPassRatePct:robustness.assessment.walkForwardPassRatePct,
    ruinProbabilityPct:robustness.assessment.ruinProbabilityPct,
    p95MaxDrawdownPct:robustness.assessment.p95MaxDrawdownPct,
    marketIntelligenceScore:intelligence.combinedScore,
    eventRisk:intelligence.events.some((e:any)=>String(e.impact||'').toUpperCase()==='HIGH')?'HIGH':intelligence.events.length?'MEDIUM':intelligence.eventProvider==='UNCONFIGURED'?'UNKNOWN':'LOW',
    dataHealthStatus:dataHealth.status,
    dataHealthScore:dataHealth.score
  });
  const riskBudget=evaluateRiskBudget({baseRiskPct,layers:[
    {name:'TRADE_RISK',approved:risk.approved,multiplier:risk.approved?1:0,binding:true,reason:risk.reasons.join('|')||'TRADE_RISK_OK',source:'RISK_GATE'},
    {name:'DATA_INTEGRITY',approved:dataHealth.status==='HEALTHY',multiplier:dataHealth.status==='HEALTHY'?1:0,binding:true,reason:dataHealth.reasons.join('|')||'DATA_HEALTHY',score:dataHealth.score,source:'DATA_HEALTH_GATE'},
    {name:'ROBUSTNESS',approved:robustness.assessment.approved,multiplier:robustness.assessment.riskMultiplier,binding:true,reason:robustness.assessment.reasons.join('|'),score:robustness.assessment.score,source:'WALK_FORWARD_MONTE_CARLO'},
    {name:'LIFECYCLE',approved:lifecycle.capitalMultiplier>0,multiplier:lifecycle.capitalMultiplier,binding:true,reason:lifecycle.state,score:lifecycle.score,source:'PAPER_HISTORY'},
    {name:'REGIME',approved:regimeGate.approved,multiplier:regimeGate.riskMultiplier,binding:true,reason:regimeGate.reason,source:'REGIME_HISTORY'},
    {name:'PORTFOLIO_INTELLIGENCE',approved:portfolioRisk.approved&&portfolioIntelligence.approved,multiplier:Math.min(portfolioIntelligence.riskMultiplier,portfolioRisk.approved?1:0),binding:true,reason:[...portfolioRisk.reasons,...portfolioIntelligence.reasons].join('|')||'PORTFOLIO_OK',source:'PROSPECTIVE_PORTFOLIO'},
    {name:'SUPERVISOR',approved:supervisor.riskMultiplier>0,multiplier:supervisor.riskMultiplier,binding:true,reason:supervisor.state,score:supervisor.score,source:'SAFETY_SUPERVISOR_REAL_ROBUSTNESS'},
    {name:'EXECUTION_INTELLIGENCE',approved:true,multiplier:1,binding:false,reason:'SHADOW_SAMPLE_REQUIRED_BEFORE_BINDING',source:'SHADOW_ONLY'}
  ]});
  risk.approved=riskBudget.approved;
  risk.effectiveRiskPct=riskBudget.finalRiskPct;
  risk.reasons.push(...riskBudget.reasons);
  await appendAudit(token,'DECISION',{decision,risk,riskBudget,dataHealth,robustness,lifecycle,supervisor,portfolioRisk,portfolioIntelligence,regimeContext,regimeGate,correlation,market:body.market,marketId,profile:profile.id,operatingSettings,technical:technical.mtf,intelligence,governedAutopilot,candidates:valid.map(v=>({strategyId:v.signal.strategyId,confidence:v.signal.confidence,adaptiveScore:v.adaptiveScore,prior:v.prior,biasMatch:v.biasMatch,governanceAdjustment:v.governanceAdjustment,contextLearning:v.contextLearning,lifecycleState:v.lifecycle.state,lifecycleScore:v.lifecycle.score,capitalMultiplier:v.lifecycle.capitalMultiplier,rationale:v.signal.rationale}))});
  if(!risk.approved)return NextResponse.json({approved:false,decision,risk,riskBudget,dataHealth,robustness,lifecycle,supervisor,portfolioRisk,portfolioIntelligence,regimeContext,regimeGate,correlation,technical:technical.mtf,intelligence,candidates:valid,mode:'PAPER',profile:profile.id,operatingSettings,storage:storageMode()});
  const position=executePaper(decision,risk,{accountSize,leverage:requestedLeverage}); if(body.autopilotKey)(position as any).autopilotKey=body.autopilotKey; await savePosition(token,position);
  const shadowOrder=simulateShadowOrder(decision,body.market,{latencyMs:180,feeBpsPerSide:2}); const shadow={...shadowOrder,qualityScore:shadowQualityScore(shadowOrder),paperPositionId:position.id}; await saveShadowExecution(token,shadow);
  await appendAudit(token,'PAPER_OPEN',{position,shadow,profile:profile.id,marketId,technical:technical.mtf,intelligence,adaptiveSelection:valid[0],governedAutopilot});
  return NextResponse.json({approved:true,mode:'PAPER',profile:profile.id,operatingSettings,decision,risk,riskBudget,dataHealth,robustness,lifecycle,supervisor,portfolioRisk,portfolioIntelligence,regimeContext,regimeGate,correlation,technical:technical.mtf,intelligence,candidates:valid,adaptiveSelection:valid[0],execution:position,shadow,storage:storageMode(),liveTrading:false});
}
