import { NextRequest, NextResponse } from 'next/server';
import { bearerToken } from '../../../lib/auth';
import { appendAudit, getPaperWallet, listAudit, listPositions } from '../../../lib/store';

const DAY=86_400_000;
const PROGRAM_DAYS=30;

type AnyRecord={id:string;type:string;payload:any;ts:number};

function startEvent(events:AnyRecord[]){return events.find(e=>e.type==='TEST_PROGRAM_STARTED')??null}

function strategyStats(positions:any[]){
 const by=new Map<string,{strategyId:string;trades:number;wins:number;losses:number;pnl:number;grossProfit:number;grossLoss:number}>();
 for(const p of positions.filter(x=>x.status==='CLOSED')){
  const id=p.strategyId||'UNKNOWN';const x=by.get(id)??{strategyId:id,trades:0,wins:0,losses:0,pnl:0,grossProfit:0,grossLoss:0};
  const pnl=Number(p.realizedPnl||0);x.trades++;x.pnl+=pnl;if(pnl>0){x.wins++;x.grossProfit+=pnl}else if(pnl<0){x.losses++;x.grossLoss+=Math.abs(pnl)};by.set(id,x);
 }
 return [...by.values()].map(x=>({...x,winRatePct:x.trades?x.wins/x.trades*100:0,profitFactor:x.grossLoss?x.grossProfit/x.grossLoss:null})).sort((a,b)=>b.pnl-a.pnl);
}

function dailyStats(positions:any[],startedAt:number){
 const days=Array.from({length:PROGRAM_DAYS},(_,i)=>({day:i+1,trades:0,wins:0,losses:0,pnl:0}));
 for(const p of positions.filter(x=>x.status==='CLOSED'&&Number(x.closedAt||0)>=startedAt)){
  const i=Math.floor((Number(p.closedAt)-startedAt)/DAY);if(i<0||i>=PROGRAM_DAYS)continue;const pnl=Number(p.realizedPnl||0);days[i].trades++;days[i].pnl+=pnl;if(pnl>0)days[i].wins++;else if(pnl<0)days[i].losses++;
 }
 return days;
}

function journal(events:AnyRecord[],startedAt:number){
 const allowed=new Set(['DECISION','NO_SIGNAL','PAPER_OPEN','PAPER_BLOCKED_SYMBOL_ALREADY_OPEN','PAPER_CLOSE','RISK_KILL','AUTOPILOT_CYCLE']);
 return events.filter(e=>e.ts>=startedAt&&allowed.has(e.type)).slice(0,120).map(e=>({id:e.id,type:e.type,ts:e.ts,payload:e.payload}));
}

async function snapshot(token:string){
 const [events,positions,wallet]=await Promise.all([listAudit(token,500),listPositions(token),getPaperWallet(token)]);
 const start=startEvent(events as AnyRecord[]);
 if(!start)return {active:false,days:PROGRAM_DAYS};
 const startedAt=Number(start.ts);const endsAt=startedAt+PROGRAM_DAYS*DAY;const now=Date.now();const day=Math.min(PROGRAM_DAYS,Math.max(1,Math.floor((now-startedAt)/DAY)+1));
 const scoped=positions.filter((p:any)=>Number(p.openedAt||0)>=startedAt);
 const closed=scoped.filter((p:any)=>p.status==='CLOSED');const open=scoped.filter((p:any)=>p.status==='OPEN');
 const realizedPnl=closed.reduce((a:number,p:any)=>a+Number(p.realizedPnl||0),0);const unrealizedPnl=open.reduce((a:number,p:any)=>a+Number(p.unrealizedPnl||0),0);
 const wins=closed.filter((p:any)=>Number(p.realizedPnl||0)>0).length;const losses=closed.filter((p:any)=>Number(p.realizedPnl||0)<0).length;
 const grossProfit=closed.reduce((a:number,p:any)=>a+Math.max(0,Number(p.realizedPnl||0)),0);const grossLoss=closed.reduce((a:number,p:any)=>a+Math.max(0,-Number(p.realizedPnl||0)),0);
 const ordered=[...closed].sort((a:any,b:any)=>Number(a.closedAt||0)-Number(b.closedAt||0));let cumulative=0,peak=0,maxDrawdown=0;for(const p of ordered){cumulative+=Number(p.realizedPnl||0);peak=Math.max(peak,cumulative);maxDrawdown=Math.max(maxDrawdown,peak-cumulative)}
 const decisions=(events as AnyRecord[]).filter(e=>e.ts>=startedAt&&e.type==='DECISION').length;const noSignals=(events as AnyRecord[]).filter(e=>e.ts>=startedAt&&e.type==='NO_SIGNAL').length;const opens=(events as AnyRecord[]).filter(e=>e.ts>=startedAt&&e.type==='PAPER_OPEN').length;
 const startingCapital=Number(start.payload?.startingCapital??wallet.depositedCapital??0);
 return {active:now<endsAt,status:now<endsAt?'ACTIVE':'COMPLETED',days:PROGRAM_DAYS,day,startedAt,endsAt,startingCapital,currentPaperCapital:startingCapital+realizedPnl+unrealizedPnl,metrics:{trades:closed.length,openPositions:open.length,wins,losses,winRatePct:closed.length?wins/closed.length*100:0,realizedPnl,unrealizedPnl,profitFactor:grossLoss?grossProfit/grossLoss:null,avgPnl:closed.length?realizedPnl/closed.length:0,maxDrawdownAmount:maxDrawdown,maxDrawdownPct:startingCapital?maxDrawdown/startingCapital*100:0,decisions,noSignals,approvedEntries:opens,blockedOrNoEntry:Math.max(0,decisions-opens)+noSignals},strategies:strategyStats(scoped),daily:dailyStats(scoped,startedAt),journal:journal(events as AnyRecord[],startedAt)};
}

export async function GET(req:NextRequest){const token=bearerToken(req);if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});try{return NextResponse.json(await snapshot(token))}catch(e){return NextResponse.json({error:e instanceof Error?e.message:'TEST_PROGRAM_UNAVAILABLE'},{status:500})}}

export async function POST(req:NextRequest){
 const token=bearerToken(req);if(!token)return NextResponse.json({error:'AUTH_REQUIRED'},{status:401});
 try{
  const current=await snapshot(token);if((current as any).active)return NextResponse.json({error:'TEST_PROGRAM_ALREADY_ACTIVE',program:current},{status:409});
  const wallet=await getPaperWallet(token);if(wallet.depositedCapital<100)return NextResponse.json({error:'PAPER_WALLET_MINIMUM_100_REQUIRED'},{status:409});
  await appendAudit(token,'TEST_PROGRAM_STARTED',{days:PROGRAM_DAYS,startingCapital:wallet.depositedCapital,mode:'PAPER_SHADOW',liveTrading:false,rule:'NO_BALANCE_RESET_DURING_PROGRAM'});
  return NextResponse.json(await snapshot(token),{status:201});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'TEST_PROGRAM_START_FAILED'},{status:500})}
}
