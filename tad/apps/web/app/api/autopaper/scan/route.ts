import { NextRequest, NextResponse } from 'next/server';
import { getOperatingProfile, selectAutoScannerCandidates } from '@tad/core';
import { bearerToken } from '../../../../lib/auth';
import { appendAudit, getAutopilotState, listPositions, saveAutopilotState } from '../../../../lib/store';
import { getOperatingSettings } from '../../../../lib/operating-settings';
import { scanFuturesUniverse } from '../../../../lib/market-scanner';
import { loadConfiguredEvents } from '../../../../lib/binance';
import { assessEventRisk } from '../../../../lib/event-risk';
import { POST as paperPost } from '../../paper/route';

function cycleId(now:number){return `CYCLE-${Math.floor(now/(5*60_000))}`;}

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const [state,settings]=await Promise.all([getAutopilotState(token),getOperatingSettings(token)]); const profile=getOperatingProfile(settings.profile);
  return NextResponse.json({mode:'PAPER_AUTOPILOT',scanner:'DYNAMIC_USDT_PERPETUALS',eventRadar:'PRE_ACTIVE_POST_WINDOWS',state,profile:profile.id,dailyTradeLimit:null,cycleTradeLimit:'AVAILABLE_PROFILE_SLOTS',liveExecution:false});
}

export async function PUT(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const [prev,settings]=await Promise.all([getAutopilotState(token),getOperatingSettings(token)]); const profile=getOperatingProfile(settings.profile); const body=await req.json() as Partial<typeof prev>;
  const state=await saveAutopilotState(token,{...prev,...body,minimumScore:Math.max(0,Math.min(100,Number(body.minimumScore??prev.minimumScore))),cooldownMinutes:Math.max(5,Number(body.cooldownMinutes??prev.cooldownMinutes)),maxNewTradesPerCycle:profile.riskPolicy.maxOpenPositions,updatedAt:Date.now()});
  await appendAudit(token,'AUTOPILOT_CONFIG_UPDATED',{state,profile:profile.id,dailyTradeLimit:null}); return NextResponse.json({state,profile:profile.id,dailyTradeLimit:null,cycleTradeLimit:'AVAILABLE_PROFILE_SLOTS',liveExecution:false});
}

export async function POST(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const now=Date.now(); const [state,settings]=await Promise.all([getAutopilotState(token),getOperatingSettings(token)]); const profile=getOperatingProfile(settings.profile); const cid=cycleId(now);
  if(!state.enabled)return NextResponse.json({mode:'PAPER_AUTOPILOT',cycleId:cid,status:'DISABLED',profile:profile.id,selected:[],executions:[],liveExecution:false});
  if(!settings.enabledMarkets.includes('CRYPTO'))return NextResponse.json({mode:'PAPER_AUTOPILOT',cycleId:cid,status:'CRYPTO_MARKET_DISABLED',profile:profile.id,selected:[],executions:[],liveExecution:false});
  if(state.lastCycleId===cid)return NextResponse.json({mode:'PAPER_AUTOPILOT',cycleId:cid,status:'IDEMPOTENT_REPLAY_BLOCKED',profile:profile.id,selected:[],executions:[],liveExecution:false});
  const [markets,positions]=await Promise.all([scanFuturesUniverse({limit:60}),listPositions(token)]); const open=positions.filter(p=>p.status==='OPEN'); const openSymbols=new Set(open.map(p=>p.symbol));
  const remainingSlots=Math.max(0,profile.riskPolicy.maxOpenPositions-open.length);
  const eligibleMarkets=markets.filter(m=>m.eligible&&!openSymbols.has(m.symbol));
  const radarUniverse=eligibleMarkets.slice(0,20);
  const radarRows=await Promise.all(radarUniverse.map(async m=>{const feed=await loadConfiguredEvents(m.symbol);const eventRisk=assessEventRisk(feed.events as any[],feed.provider,now);return {market:m,eventRisk};}));
  const radarBySymbol=new Map(radarRows.map(r=>[r.market.symbol,r.eventRisk]));
  const rows=eligibleMarkets.map(m=>{const eventRisk=radarBySymbol.get(m.symbol)??{approved:true,riskMultiplier:1,state:'CLEAR',reason:'RADAR_NOT_IN_TOP20',nearestEvent:null,relevantEvents:0};return {symbol:m.symbol,strategyId:'AUTO_BEST',score:m.scannerScore*eventRisk.riskMultiplier,eligible:Boolean(eventRisk.approved),allocationWeight:Math.max(.25,m.liquidityScore/100)*eventRisk.riskMultiplier,eventRisk};});
  const selected=remainingSlots>0?selectAutoScannerCandidates(rows,{enabled:true,minimumScore:state.minimumScore,cooldownMinutes:state.cooldownMinutes,maxNewTradesPerCycle:remainingSlots},state.lastTradeAt,now):[];
  const next={...state,maxNewTradesPerCycle:profile.riskPolicy.maxOpenPositions,lastScanAt:now,lastCycleId:cid,updatedAt:now}; await saveAutopilotState(token,next);
  const executions:any[]=[];
  for(const candidate of selected){
    const market=markets.find(m=>m.symbol===candidate.symbol); if(!market)continue;
    const eventRisk=radarBySymbol.get(candidate.symbol)??null;
    if(eventRisk&&!eventRisk.approved){executions.push({candidate,eventRisk,status:409,result:{approved:false,reason:'EVENT_RISK_BLOCKED'}});continue;}
    const key=`${cid}:${candidate.symbol}`;
    const internal=new NextRequest('http://tad.internal/api/paper',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({market,marketId:'CRYPTO',leverage:Math.min(2,profile.riskPolicy.maxLeverage),autopilotKey:key})});
    const response=await paperPost(internal); const result=await response.json(); executions.push({candidate,eventRisk,scanner:{scannerScore:market.scannerScore,liquidityScore:market.liquidityScore,spreadScore:market.spreadScore,volatilityScore:market.volatilityScore,fundingScore:market.fundingScore,quoteVolume24h:market.quoteVolume24h,spreadPct:market.spreadPct,fundingRate:market.fundingRate,intradayRangePct:market.intradayRangePct},status:response.status,result});
    if(response.ok&&result?.approved){next.lastTradeAt={...next.lastTradeAt,[`${candidate.symbol}:AUTO_BEST`]:now}; await saveAutopilotState(token,next);}
  }
  const eventBlocked=rows.filter(r=>!r.eligible).length; const eventReduced=rows.filter(r=>r.eligible&&r.eventRisk.riskMultiplier<1).length;
  await appendAudit(token,'AUTOPILOT_CYCLE',{cycleId:cid,profile:profile.id,scanner:'DYNAMIC_USDT_PERPETUALS',eventRadar:'PRE_ACTIVE_POST_WINDOWS',universeSize:markets.length,eligibleUniverseSize:eligibleMarkets.length,eventBlocked,eventReduced,dailyTradeLimit:null,remainingSlots,selected,executions:executions.map(x=>({candidate:x.candidate,eventRisk:x.eventRisk,scanner:x.scanner,status:x.status,approved:Boolean(x.result?.approved),reason:x.result?.reason??null}))});
  return NextResponse.json({mode:'PAPER_AUTOPILOT',scanner:'DYNAMIC_USDT_PERPETUALS',eventRadar:'PRE_ACTIVE_POST_WINDOWS',cycleId:cid,status:'COMPLETED',profile:profile.id,dailyTradeLimit:null,universeSize:markets.length,eligibleUniverseSize:eligibleMarkets.length,eventBlocked,eventReduced,remainingSlots,selected,executions,liveExecution:false,exchangeOrderSent:false});
}
