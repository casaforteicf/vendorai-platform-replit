import { NextRequest, NextResponse } from 'next/server';
import { selectAutoScannerCandidates } from '@tad/core';
import { bearerToken } from '../../../../lib/auth';
import { appendAudit, getAutopilotState, getPaperWallet, listPositions, saveAutopilotState } from '../../../../lib/store';
import { loadMarkets } from '../../../../lib/binance';
import { POST as paperPost } from '../../paper/route';

function cycleId(now:number){return `CYCLE-${Math.floor(now/(5*60_000))}`;}

export async function GET(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const state=await getAutopilotState(token); return NextResponse.json({mode:'PAPER_AUTOPILOT',state,liveExecution:false});
}

export async function PUT(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const prev=await getAutopilotState(token); const body=await req.json() as Partial<typeof prev>;
  const state=await saveAutopilotState(token,{...prev,...body,minimumScore:Math.max(0,Math.min(100,Number(body.minimumScore??prev.minimumScore))),cooldownMinutes:Math.max(5,Number(body.cooldownMinutes??prev.cooldownMinutes)),maxNewTradesPerCycle:Math.max(1,Math.min(1,Number(body.maxNewTradesPerCycle??prev.maxNewTradesPerCycle))),updatedAt:Date.now()});
  await appendAudit(token,'AUTOPILOT_CONFIG_UPDATED',{state}); return NextResponse.json({state,liveExecution:false});
}

export async function POST(req:NextRequest){
  const token=bearerToken(req); if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
  const now=Date.now(); const state=await getAutopilotState(token); const cid=cycleId(now);
  if(!state.enabled)return NextResponse.json({mode:'PAPER_AUTOPILOT',cycleId:cid,status:'DISABLED',selected:[],executions:[],liveExecution:false});
  if(state.lastCycleId===cid)return NextResponse.json({mode:'PAPER_AUTOPILOT',cycleId:cid,status:'IDEMPOTENT_REPLAY_BLOCKED',selected:[],executions:[],liveExecution:false});
  const [markets,positions,wallet]=await Promise.all([loadMarkets(),listPositions(token),getPaperWallet(token)]); const openSymbols=new Set(positions.filter(p=>p.status==='OPEN').map(p=>p.symbol));
  const rows=markets.map(m=>({symbol:m.symbol,strategyId:'AUTO_BEST',score:m.opportunityScore??0,eligible:!openSymbols.has(m.symbol),allocationWeight:1}));
  const selected=selectAutoScannerCandidates(rows,{enabled:true,minimumScore:state.minimumScore,cooldownMinutes:state.cooldownMinutes,maxNewTradesPerCycle:1},state.lastTradeAt,now);
  const next={...state,lastScanAt:now,lastCycleId:cid,updatedAt:now}; await saveAutopilotState(token,next);
  const executions:any[]=[];
  for(const candidate of selected){
    const market=markets.find(m=>m.symbol===candidate.symbol); if(!market)continue;
    const key=`${cid}:${candidate.symbol}`;
    const internal=new NextRequest('http://tad.internal/api/paper',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify({market,leverage:2,autopilotKey:key})});
    const response=await paperPost(internal); const result=await response.json(); executions.push({candidate,status:response.status,result});
    if(response.ok&&result?.approved){next.lastTradeAt={...next.lastTradeAt,[`${candidate.symbol}:AUTO_BEST`]:now}; await saveAutopilotState(token,next);}
  }
  await appendAudit(token,'AUTOPILOT_CYCLE',{cycleId:cid,selected,executions:executions.map(x=>({candidate:x.candidate,status:x.status,approved:Boolean(x.result?.approved),reason:x.result?.reason??null}))});
  return NextResponse.json({mode:'PAPER_AUTOPILOT',cycleId:cid,status:'COMPLETED',selected,executions,liveExecution:false,exchangeOrderSent:false});
}
