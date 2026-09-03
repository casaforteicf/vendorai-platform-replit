import type { PaperPosition, Side } from '../types/index';

export interface StrategyPerformanceRow {
  strategyId:string;
  symbol:string;
  side:Side|'ALL';
  trades:number;
  wins:number;
  losses:number;
  winRatePct:number;
  realizedPnl:number;
  avgPnl:number;
  profitFactor:number|null;
  recentTrades:number;
  recentWinRatePct:number;
  recentPnl:number;
  score:number;
  sampleState:'INSUFFICIENT'|'EARLY'|'USABLE'|'STRONG_SAMPLE';
  lastClosedAt:number|null;
  closeReasons:Record<string,number>;
}

function sampleState(n:number):StrategyPerformanceRow['sampleState']{
  if(n<5)return 'INSUFFICIENT';
  if(n<12)return 'EARLY';
  if(n<30)return 'USABLE';
  return 'STRONG_SAMPLE';
}

function row(strategyId:string,symbol:string,side:Side|'ALL',ps:PaperPosition[],now:number,recentDays:number):StrategyPerformanceRow{
  const closed=ps.filter(p=>p.status==='CLOSED');
  const wins=closed.filter(p=>p.realizedPnl>0), losses=closed.filter(p=>p.realizedPnl<=0);
  const pos=wins.reduce((a,p)=>a+p.realizedPnl,0), neg=Math.abs(losses.reduce((a,p)=>a+p.realizedPnl,0));
  const realizedPnl=closed.reduce((a,p)=>a+p.realizedPnl,0);
  const cutoff=now-recentDays*24*60*60_000;
  const recent=closed.filter(p=>(p.closedAt??p.updatedAt)>=cutoff);
  const recentWins=recent.filter(p=>p.realizedPnl>0);
  const recentPnl=recent.reduce((a,p)=>a+p.realizedPnl,0);
  const winRatePct=closed.length?wins.length/closed.length*100:0;
  const recentWinRatePct=recent.length?recentWins.length/recent.length*100:0;
  const pf=neg?pos/neg:(pos>0?3:null);
  const sample=Math.min(1,closed.length/30);
  const recentWeight=Math.min(1,recent.length/12);
  const pfScore=pf==null?50:Math.max(0,Math.min(100,50+(pf-1)*35));
  const pnlSign=realizedPnl>0?65:realizedPnl<0?35:50;
  const score=Math.round(Math.max(0,Math.min(100,
    winRatePct*.30 + pfScore*.30 + pnlSign*.15 + recentWinRatePct*.15*recentWeight + 100*.10*sample
  )));
  const closeReasons:Record<string,number>={};
  for(const p of closed){const k=p.closeReason??'UNKNOWN';closeReasons[k]=(closeReasons[k]??0)+1;}
  return {strategyId,symbol,side,trades:closed.length,wins:wins.length,losses:losses.length,winRatePct,realizedPnl,avgPnl:closed.length?realizedPnl/closed.length:0,profitFactor:pf,recentTrades:recent.length,recentWinRatePct,recentPnl,score,sampleState:sampleState(closed.length),lastClosedAt:closed.length?Math.max(...closed.map(p=>p.closedAt??p.updatedAt)):null,closeReasons};
}

export function buildStrategyPerformanceMatrix(positions:PaperPosition[],opts:{now?:number;recentDays?:number}={}){
  const now=opts.now??Date.now(),recentDays=opts.recentDays??7;
  const closed=positions.filter(p=>p.status==='CLOSED'&&p.strategyId);
  const groups=new Map<string,PaperPosition[]>();
  const add=(key:string,p:PaperPosition)=>{const arr=groups.get(key)??[];arr.push(p);groups.set(key,arr)};
  for(const p of closed){
    add(`${p.strategyId}|${p.symbol}|${p.side}`,p);
    add(`${p.strategyId}|${p.symbol}|ALL`,p);
  }
  const rows=[...groups.entries()].map(([key,ps])=>{const [strategyId,symbol,side]=key.split('|') as [string,string,Side|'ALL'];return row(strategyId,symbol,side,ps,now,recentDays)}).sort((a,b)=>b.score-a.score||b.trades-a.trades);
  const byStrategy=[...new Set(closed.map(p=>p.strategyId))].map(strategyId=>row(strategyId,'ALL','ALL',closed.filter(p=>p.strategyId===strategyId),now,recentDays)).sort((a,b)=>b.score-a.score||b.trades-a.trades);
  return {recentDays,totalClosedTrades:closed.length,rows,byStrategy};
}

export function performanceAdjustment(matrix:ReturnType<typeof buildStrategyPerformanceMatrix>,strategyId:string,symbol:string,side:Side){
  const exact=matrix.rows.find(r=>r.strategyId===strategyId&&r.symbol===symbol&&r.side===side);
  const pair=matrix.rows.find(r=>r.strategyId===strategyId&&r.symbol===symbol&&r.side==='ALL');
  const global=matrix.byStrategy.find(r=>r.strategyId===strategyId);
  const r=exact&&exact.trades>=5?exact:pair&&pair.trades>=5?pair:global;
  if(!r||r.trades<5)return {adjustment:0,source:'INSUFFICIENT_SAMPLE',row:r??null};
  const cap=r.sampleState==='STRONG_SAMPLE'?10:r.sampleState==='USABLE'?7:4;
  const adjustment=Math.max(-cap,Math.min(cap,Math.round((r.score-50)/5)));
  return {adjustment,source:r.symbol==='ALL'?'STRATEGY_GLOBAL':r.side==='ALL'?'STRATEGY_PAIR':'STRATEGY_PAIR_SIDE',row:r};
}
