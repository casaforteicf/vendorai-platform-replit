import { NextRequest, NextResponse } from 'next/server';
import { getOperatingProfile, libraryForPair, rankStrategySweep, selectAutoScannerCandidates } from '@tad/core';
import { bearerToken } from '../../../../lib/auth';
import { appendAudit, getAutopilotState, listPositions, saveAutopilotState } from '../../../../lib/store';
import { getOperatingSettings } from '../../../../lib/operating-settings';
import { scanFuturesUniverse } from '../../../../lib/market-scanner';
import { loadSweepHorizons } from '../../../../lib/strategy-sweep-data';
import { POST as paperPost } from '../../paper/route';

function cycleId(now:number){return `CYCLE-${Math.floor(now/(5*60_000))}`;}

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const [state,settings]=await Promise.all([getAutopilotState(token),getOperatingSettings(token)]); const profile=getOperatingProfile(settings.profile);
  return NextResponse.json({mode:'PAPER_AUTOPILOT',selection:'DYNAMIC_MARKET_SCANNER_STRATEGY_SWEEP',state,profile:profile.id,dailyTradeLimit:null,cycleTradeLimit:'AVAILABLE_PROFILE_SLOTS',scannerUniverseLimit:60,sweepLimit:5,liveExecution:false});
}

export async function PUT(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const [prev,settings]=await Promise.all([getAutopilotState(token),getOperatingSettings(token)]); const profile=getOperatingProfile(settings.profile); const body=await req.json() as Partial<typeof prev>;
  const state=await saveAutopilotState(token,{...prev,...body,minimumScore:Math.max(0,Math.min(100,Number(body.minimumScore??prev.minimumScore))),cooldownMinutes:Math.max(5,Number(body.cooldownMinutes??prev.cooldownMinutes)),maxNewTradesPerCycle:profile.riskPolicy.maxOpenPositions,updatedAt:Date.now()});
  await appendAudit(token,'AUTOPILOT_CONFIG_UPDATED',{state,profile:profile.id,dailyTradeLimit:null,selection:'DYNAMIC_MARKET_SCANNER_STRATEGY_SWEEP'}); return NextResponse.json({state,profile:profile.id,dailyTradeLimit:null,cycleTradeLimit:'AVAILABLE_PROFILE_SLOTS',scannerUniverseLimit:60,sweepLimit:5,liveExecution:false});
}

export async function POST(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const now=Date.now(); const [state,settings]=await Promise.all([getAutopilotState(token),getOperatingSettings(token)]); const profile=getOperatingProfile(settings.profile); const cid=cycleId(now);
  if(!state.enabled)return NextResponse.json({mode:'PAPER_AUTOPILOT',cycleId:cid,status:'DISABLED',profile:profile.id,selected:[],executions:[],liveExecution:false});
  if(!settings.enabledMarkets.includes('CRYPTO'))return NextResponse.json({mode:'PAPER_AUTOPILOT',cycleId:cid,status:'CRYPTO_MARKET_DISABLED',profile:profile.id,selected:[],executions:[],liveExecution:false});
  if(state.lastCycleId===cid)return NextResponse.json({mode:'PAPER_AUTOPILOT',cycleId:cid,status:'IDEMPOTENT_REPLAY_BLOCKED',profile:profile.id,selected:[],executions:[],liveExecution:false});

  const positions=await listPositions(token); const open=positions.filter(p=>p.status==='OPEN'); const openSymbols=new Set(open.map(p=>p.symbol));
  const remainingSlots=Math.max(0,profile.riskPolicy.maxOpenPositions-open.length);
  let scannerRows;
  try{scannerRows=await scanFuturesUniverse({limit:60});}
  catch(error){
    const reason=error instanceof Error?error.message:'MARKET_SCANNER_FAILED';
    await appendAudit(token,'AUTOPILOT_CYCLE',{cycleId:cid,profile:profile.id,selection:'DYNAMIC_MARKET_SCANNER_STRATEGY_SWEEP',status:'SCANNER_UNAVAILABLE',reason,selected:[],executions:[]});
    return NextResponse.json({mode:'PAPER_AUTOPILOT',selection:'DYNAMIC_MARKET_SCANNER_STRATEGY_SWEEP',cycleId:cid,status:'SCANNER_UNAVAILABLE',reason,selected:[],executions:[],liveExecution:false,exchangeOrderSent:false},{status:503});
  }
  const markets=scannerRows.filter(m=>m.eligible);

  // Cheap dynamic scanner can inspect up to 60 contracts; expensive 90d sweep stays bounded to top 5 eligible markets.
  const sweepUniverse=markets.filter(m=>!openSymbols.has(m.symbol)).slice(0,5);
  const sweepResults=await Promise.all(sweepUniverse.map(async market=>{
    try{
      const data=await loadSweepHorizons(market.symbol);
      const entries=libraryForPair(market.symbol,['ACTIVE_PAPER','CANDIDATE','OBSERVATION']);
      const ranking=rankStrategySweep(entries,data.horizons,data.availableFrames);
      const actionable=ranking.filter(r=>r.actionable).slice(0,3);
      const top=actionable[0]??null;
      const combinedScore=top?Math.round(market.scannerScore*.45+top.eligibilityScore*.55):0;
      return {symbol:market.symbol,scannerScore:market.scannerScore,opportunityScore:market.opportunityScore??0,combinedScore,actionable,topStrategyId:top?.strategyId??null,topEligibility:top?.eligibilityScore??0,source:data.source};
    }catch(error){
      return {symbol:market.symbol,scannerScore:market.scannerScore,opportunityScore:market.opportunityScore??0,combinedScore:0,actionable:[],topStrategyId:null,topEligibility:0,error:error instanceof Error?error.message:'SWEEP_FAILED'};
    }
  }));
  const sweepBySymbol=new Map(sweepResults.map(r=>[r.symbol,r]));
  const rows=sweepResults.map(r=>({symbol:r.symbol,strategyId:r.topStrategyId??'NO_ACTIONABLE_STRATEGY',score:r.combinedScore,eligible:Boolean(r.topStrategyId)&&r.topEligibility>=55&&!openSymbols.has(r.symbol),allocationWeight:1}));
  const selected=remainingSlots>0?selectAutoScannerCandidates(rows,{enabled:true,minimumScore:state.minimumScore,cooldownMinutes:state.cooldownMinutes,maxNewTradesPerCycle:remainingSlots},state.lastTradeAt,now):[];
  const next={...state,maxNewTradesPerCycle:profile.riskPolicy.maxOpenPositions,lastScanAt:now,lastCycleId:cid,updatedAt:now}; await saveAutopilotState(token,next);
  const executions:any[]=[];
  for(const candidate of selected){
    const market=markets.find(m=>m.symbol===candidate.symbol); if(!market)continue;
    const sweep=sweepBySymbol.get(candidate.symbol); const allowedStrategyIds=sweep?.actionable.map((x:any)=>x.strategyId)??[];
    if(!allowedStrategyIds.length){executions.push({candidate,status:409,result:{approved:false,reason:'NO_ACTIONABLE_SWEEP_STRATEGY'}});continue;}
    const key=`${cid}:${candidate.symbol}:${candidate.strategyId}`;
    const internal=new NextRequest('http://tad.internal/api/paper',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({market,marketId:'CRYPTO',leverage:Math.min(2,profile.riskPolicy.maxLeverage),autopilotKey:key,allowedStrategyIds})});
    const response=await paperPost(internal); const result=await response.json(); executions.push({candidate,sweep:{allowedStrategyIds,topEligibility:sweep?.topEligibility,combinedScore:sweep?.combinedScore},status:response.status,result});
    if(response.ok&&result?.approved){next.lastTradeAt={...next.lastTradeAt,[`${candidate.symbol}:${candidate.strategyId}`]:now}; await saveAutopilotState(token,next);}
  }
  const scannerSummary={universe:scannerRows.length,eligible:markets.length,excluded:scannerRows.length-markets.length,sweepUniverse:sweepUniverse.map(m=>m.symbol),topExcluded:scannerRows.filter(m=>!m.eligible).slice(0,10).map(m=>({symbol:m.symbol,scannerScore:m.scannerScore,reasons:m.exclusionReasons}))};
  await appendAudit(token,'AUTOPILOT_CYCLE',{cycleId:cid,profile:profile.id,selection:'DYNAMIC_MARKET_SCANNER_STRATEGY_SWEEP',dailyTradeLimit:null,remainingSlots,scannerSummary,sweepResults:sweepResults.map(r=>({symbol:r.symbol,scannerScore:r.scannerScore,opportunityScore:r.opportunityScore,combinedScore:r.combinedScore,topStrategyId:r.topStrategyId,topEligibility:r.topEligibility,actionableStrategyIds:r.actionable.map((x:any)=>x.strategyId),error:(r as any).error??null})),selected,executions:executions.map(x=>({candidate:x.candidate,sweep:x.sweep??null,status:x.status,approved:Boolean(x.result?.approved),reason:x.result?.reason??null}))});
  return NextResponse.json({mode:'PAPER_AUTOPILOT',selection:'DYNAMIC_MARKET_SCANNER_STRATEGY_SWEEP',cycleId:cid,status:'COMPLETED',profile:profile.id,dailyTradeLimit:null,remainingSlots,scannerSummary,sweepResults,selected,executions,liveExecution:false,exchangeOrderSent:false});
}
